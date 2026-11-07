import { TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';

import { WorkRepository } from '../database/repositories/work.repository';
import { DepartmentExecutorProxy } from './executor.contracts';
import { WorkEligibility } from '../database/entities/work-eligibility.entity';
import { WorkWakeIntent } from '../database/entities/work-wake-intent.entity';
import { transitionWorkState } from './work-lifecycle';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

@Service()
export class WorkReleaseService {
	constructor(
		private readonly repository: WorkRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly directory: DirectoryRepository,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {}

	async resumeWaitingParent(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext,
	) {
		const parent = await this.repository.findWork(projectId, departmentId, workId, ctx);
		if (!parent?.currentAttemptId) return;
		const release = await this.repository.findConfirmedWaitingRelease(
			projectId,
			departmentId,
			workId,
			parent.currentAttemptId,
			ctx,
		);
		if (!release) return;
		await this.releasesResumeParentAfterStop(release, ctx);
	}

	private async releasesResumeParentAfterStop(
		release: {
			id: string;
			projectId: string;
			departmentId: string;
			workId: string;
			requestId: string;
			sourceAttemptId: string;
		},
		ctx: OperationContext,
	) {
		const parent = await this.repository.findWork(
			release.projectId,
			release.departmentId,
			release.workId,
			ctx,
		);
		if (!parent || parent.state !== 'blocked' || !parent.assigneeMemberId) return;
		if (parent.currentAttemptId !== release.sourceAttemptId) return;
		const attempt = await this.repository.findAttempt(
			parent.projectId,
			release.sourceAttemptId,
			ctx,
		);
		if (!attempt || attempt.phase !== 'terminal') return;
		if (
			await this.repository.hasUnresolvedBlockers(
				parent.projectId,
				parent.departmentId,
				parent.id,
				ctx,
			)
		)
			return;
		const assignmentActor = parent.assignedByUserId;
		if (!assignmentActor) return;
		const binding = await this.directory.findBinding(
			parent.projectId,
			parent.assigneeMemberId,
			ctx,
		);
		const member = await this.repository.findMember(
			parent.projectId,
			parent.departmentId,
			parent.assigneeMemberId,
			ctx,
		);
		if (!binding || !member || member.archived) return;
		const eligibleAt = new Date();
		const laneGeneration = binding
			? await this.repository.advanceWakeLane(
					{
						projectId: parent.projectId,
						memberId: parent.assigneeMemberId,
						actorId: assignmentActor,
						bindingVersion: binding.version,
					},
					eligibleAt,
					ctx,
				)
			: 0;
		parent.state = transitionWorkState(parent.state, 'ready', false);
		parent.version += 1;
		await this.repository.saveWork(parent, ctx);
		await this.repository.saveEligibility(
			Object.assign(new WorkEligibility(), {
				workId: parent.id,
				generation: await this.repository.nextEligibilityGeneration(parent.id, ctx),
				projectId: parent.projectId,
				departmentId: parent.departmentId,
				memberId: parent.assigneeMemberId,
				actorId: assignmentActor,
				bindingVersion: binding.version,
				laneGeneration,
				requestId: `resume:${parent.id}:${release.requestId}`.slice(0, 36),
				state: 'pending',
				eligibleAt,
				consumedAt: null,
				createdAt: eligibleAt,
			}),
			ctx,
		);
		await this.repository.saveWakeIntent(
			Object.assign(new WorkWakeIntent(), {
				workId: parent.id,
				projectId: parent.projectId,
				departmentId: parent.departmentId,
				actorId: assignmentActor,
				requestId: `resume:${parent.id}:${release.requestId}`.slice(0, 36),
				createdAt: eligibleAt,
				deliveredAt: null,
			}),
			ctx,
		);
		await this.repository.markParentContinuationQueued(release.id, ctx);
	}

	async reconcilePending(signal?: AbortSignal) {
		for (const release of await this.repository.listPendingReleases(100)) {
			if (signal?.aborted) break;
			await this.requestOwnerStop(release.id);
		}
		let afterId: string | undefined;
		while (!signal?.aborted) {
			const releases = await this.repository.listConfirmedWaitingParentReleases(100, afterId);
			if (releases.length === 0) break;
			for (const release of releases) {
				if (signal?.aborted) break;
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(release.projectId, release.departmentId, ctx);
					await this.resumeWaitingParent(
						release.projectId,
						release.departmentId,
						release.workId,
						ctx,
					);
				});
				await this.operationsBroadcaster.notifyCurrent(release.projectId, release.departmentId);
			}
			const lastRelease = releases.at(-1);
			if (!lastRelease || releases.length < 100) break;
			afterId = lastRelease.id;
		}
	}

	async requestOwnerStop(releaseId: string) {
		const release = await this.repository.findReleaseById(releaseId);
		if (!release || release.state !== 'awaiting_stop') return;
		const attempt = await this.repository.findAttempt(release.projectId, release.sourceAttemptId);
		if (!attempt) return;
		let ownerExecutionRef = attempt.ownerExecutionRef;
		if (!ownerExecutionRef) {
			try {
				const lookup = await this.executor.lookup({
					actorId: attempt.initiatingUserId,
					projectId: attempt.projectId,
					executorId: attempt.executorId,
					attemptId: attempt.id,
					dispatchKey: attempt.dispatchKey,
				});
				if (lookup.kind !== 'accepted') return;
				ownerExecutionRef = lookup.ownerExecutionRef;
			} catch {
				return;
			}
		}
		const context = {
			actorId: attempt.initiatingUserId,
			projectId: attempt.projectId,
			executorId: attempt.executorId,
			attemptId: attempt.id,
			ownerExecutionRef,
		};
		try {
			let snapshot = await this.executor.snapshot(context);
			if (snapshot.phase !== 'terminal') {
				await this.executor.requestStop({
					...context,
					commandId: release.stopCommandId,
					reason: 'release',
					authorityContext: {
						kind: 'department-control-plane',
						commandId: release.stopCommandId,
						reason: 'release',
					},
				});
				snapshot = await this.executor.snapshot(context);
			}
			if (snapshot.phase !== 'terminal' || !snapshot.result) return;
			const terminalResult = snapshot.result;
			await this.txRunner.run({}, async (ctx) => {
				await this.repository.acquireAdmissionFence(release.projectId, release.departmentId, ctx);
				const current = await this.repository.findRelease(release.projectId, release.id, ctx);
				if (!current || current.state !== 'awaiting_stop') return;
				const work = await this.repository.findWork(
					release.projectId,
					release.departmentId,
					release.workId,
					ctx,
				);
				const currentAttempt = await this.repository.findAttempt(
					release.projectId,
					release.sourceAttemptId,
					ctx,
				);
				if (!work || !currentAttempt || work.currentAttemptId !== currentAttempt.id) return;
				if (currentAttempt.phase !== 'terminal') {
					await this.repository.applyOwnerSnapshot(
						{
							projectId: release.projectId,
							departmentId: release.departmentId,
							workId: release.workId,
							attemptId: currentAttempt.id,
							expectedWorkVersion: work.version,
							sequence: snapshot.sequence,
							phase: 'terminal',
							outcome: terminalResult.outcome,
							resultReference: terminalResult.reference,
							safeSummary: terminalResult.safeSummary,
							toState: 'blocked',
							actorId: attempt.executorId,
						},
						ctx,
					);
				}
				const stoppedAttempt = await this.repository.findAttempt(
					release.projectId,
					release.sourceAttemptId,
					ctx,
				);
				if (stoppedAttempt?.phase !== 'terminal') return;
				await this.repository.releaseWakeLaneForAttempt(currentAttempt.id, ctx);
				current.state = 'confirmed';
				current.confirmedAt = new Date();
				await this.repository.saveRelease(current, ctx);
				if (current.waitingForChildren) {
					await this.releasesResumeParentAfterStop(current, ctx);
				}
			});
			await this.operationsBroadcaster.notifyCurrent(release.projectId, release.departmentId);
		} catch {
			// Keep the work blocked until a correlated terminal snapshot is available.
		}
	}
}
