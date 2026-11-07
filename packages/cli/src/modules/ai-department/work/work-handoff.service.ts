import type {
	AiDepartmentWorkHandoffResult,
	AuthorizeAiDepartmentWorkHandoffDto,
	HandoffAiDepartmentWorkDto,
} from '@n8n/api-types';
import { aiDepartmentWorkHandoffResultSchema } from '@n8n/api-types';
import { TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { DirectoryChange } from '../database/entities/directory-change.entity';
import { WorkActivity } from '../database/entities/work-activity.entity';
import { WorkEligibility } from '../database/entities/work-eligibility.entity';
import { WorkHandoffIntent } from '../database/entities/work-handoff-intent.entity';
import { WorkTransition } from '../database/entities/work-transition.entity';
import { WorkWakeIntent } from '../database/entities/work-wake-intent.entity';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { DepartmentExecutorProxy } from './executor.contracts';
import { toWorkDto } from './work-mappers';
import type { DepartmentWorkRunContext } from '@/modules/agents/agent-department-execution.contracts';
import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

function hashPayload(payload: unknown) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function replayReceipt(receipt: CommandReceipt | null, hash: string) {
	if (!receipt) return undefined;
	if (receipt.payloadHash !== hash)
		throw new ConflictError('Request ID was already used for a different command.');
	if (receipt.status !== 'completed' || !receipt.responseJson)
		throw new ConflictError('This command is still being processed.');
	return aiDepartmentWorkHandoffResultSchema.parse(JSON.parse(receipt.responseJson));
}

@Service()
export class WorkHandoffService {
	constructor(
		private readonly repository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {}

	async requestHandoff(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: HandoffAiDepartmentWorkDto,
	): Promise<AiDepartmentWorkHandoffResult> {
		const hash = hashPayload({ departmentId, workId, ...dto });
		const reservation = await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt(
				await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
				hash,
			);
			if (prior) return { result: prior };
			const department = await this.repository.findDepartment(projectId, departmentId, ctx);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
			if (!work) throw new NotFoundError('Work item not found.');
			if (work.version !== dto.expectedVersion)
				throw new ConflictError('Work item has changed. Reload and try again.');
			if (!work.assigneeMemberId)
				throw new ConflictError('Assign this work before requesting a handoff.');
			if (work.assigneeMemberId === dto.destinationMemberId)
				throw new UserError('Choose a different destination member.');
			if (await this.repository.findPendingHandoffForWork(projectId, workId, ctx))
				throw new ConflictError('A handoff is already pending for this work item.');
			const destination = await this.repository.findMember(
				projectId,
				departmentId,
				dto.destinationMemberId,
				ctx,
			);
			if (!destination || destination.archived)
				throw new UserError('Destination must be an active member of this department.');
			const destinationBinding = await this.directory.findBinding(projectId, destination.id, ctx);
			if (destinationBinding) {
				const resolution = await this.executor.resolve({
					actorId,
					projectId,
					memberId: destination.id,
					executorId: destinationBinding.executorId,
					bindingVersion: destinationBinding.version,
				});
				if (!resolution.authorized)
					throw new ForbiddenError('You cannot execute the destination Agent.');
			}
			if (await this.repository.hasUnresolvedBlockers(projectId, departmentId, workId, ctx))
				throw new ConflictError('Resolve blocking work before handing off this item.');
			const attempt = work.currentAttemptId
				? await this.repository.findAttempt(projectId, work.currentAttemptId, ctx)
				: null;
			const activeAttempt =
				attempt !== null &&
				['dispatching', 'active', 'suspended', 'stopping'].includes(attempt.phase);
			if (activeAttempt && !['ready', 'running', 'blocked'].includes(work.state))
				throw new ConflictError('This work item cannot be handed off in its current state.');
			if (!activeAttempt && work.state !== 'ready')
				throw new ConflictError('Only open work can be handed off.');
			if (activeAttempt) {
				const sourceBinding = await this.directory.findBinding(projectId, attempt.memberId, ctx);
				if (
					!sourceBinding ||
					sourceBinding.version !== attempt.bindingVersion ||
					sourceBinding.executorId !== attempt.executorId
				)
					throw new ForbiddenError('The current execution authority is no longer available.');
				const sourceAccess = await this.executor.resolve({
					actorId,
					projectId,
					memberId: attempt.memberId,
					executorId: attempt.executorId,
					bindingVersion: attempt.bindingVersion,
				});
				if (!sourceAccess.authorized)
					throw new ForbiddenError('You cannot stop the current Agent execution.');
			}

			const handoff = Object.assign(new WorkHandoffIntent(), {
				id: randomUUID(),
				projectId,
				departmentId,
				workId,
				sourceMemberId: work.assigneeMemberId,
				sourceAttemptId: activeAttempt ? attempt.id : null,
				destinationMemberId: destination.id,
				destinationBindingVersion: destinationBinding?.version ?? null,
				requestedByActorId: actorId,
				requestedByMemberId: null,
				authorizedByUserId: actorId,
				reason: dto.reason,
				expectedWorkVersion: work.version,
				requestId: dto.requestId,
				stopCommandId: activeAttempt ? randomUUID() : null,
				state: activeAttempt ? ('awaiting_stop' as const) : ('completed' as const),
				createdAt: new Date(),
				completedAt: activeAttempt ? null : new Date(),
			});
			await this.repository.saveHandoff(handoff, ctx);
			let result: AiDepartmentWorkHandoffResult;
			if (activeAttempt) {
				result = {
					handoffId: handoff.id,
					state: 'awaiting_stop',
					work: toWorkDto(work),
					attemptId: attempt.id,
				};
			} else {
				result = await this.commitReadyHandoff(handoff, work, actorId, ctx);
			}
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'work.handoff',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return { result, handoff: activeAttempt ? handoff : undefined };
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);

		if (!reservation.handoff) return reservation.result;
		await this.requestOwnerStop(reservation.handoff);
		return await this.getHandoff(projectId, departmentId, workId, reservation.handoff.id);
	}

	async requestAgentHandoff(
		context: DepartmentWorkRunContext,
		requestId: string,
		dto: { expectedVersion: number; destinationMemberId: string; reason: string },
	): Promise<AiDepartmentWorkHandoffResult> {
		const hash = hashPayload({ context, ...dto });
		let departmentId: string | undefined;
		const reservation = await this.txRunner.run({}, async (ctx) => {
			let attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt || attempt.executorId !== context.executorId)
				throw new NotFoundError('Assigned work not found.');
			departmentId = attempt.departmentId;
			await this.repository.acquireAdmissionFence(context.projectId, attempt.departmentId, ctx);
			attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt) throw new NotFoundError('Assigned work not found.');
			if (
				!(await this.executor.verifyRun({
					projectId: context.projectId,
					actorId: attempt.initiatingUserId,
					executorId: attempt.executorId,
					attemptId: attempt.id,
					dispatchKey: attempt.dispatchKey,
					executionId: context.executionId,
				}))
			)
				throw new ForbiddenError('This execution cannot request a work handoff.');
			const previous = replayReceipt(
				await this.directory.findReceipt(
					context.projectId,
					attempt.initiatingUserId,
					requestId,
					ctx,
				),
				hash,
			);
			if (previous) return { result: previous };
			const department = await this.repository.findDepartment(
				context.projectId,
				attempt.departmentId,
				ctx,
			);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			const work = await this.repository.findWork(
				context.projectId,
				attempt.departmentId,
				attempt.workId,
				ctx,
			);
			const sourceMember = await this.repository.findMember(
				context.projectId,
				attempt.departmentId,
				attempt.memberId,
				ctx,
			);
			const sourceBinding = await this.directory.findBinding(
				context.projectId,
				attempt.memberId,
				ctx,
			);
			if (
				!sourceMember ||
				sourceMember.archived ||
				!sourceBinding ||
				sourceBinding.version !== attempt.bindingVersion ||
				sourceBinding.executorId !== attempt.executorId ||
				sourceBinding.provider !== attempt.provider
			)
				throw new ForbiddenError('The current Agent assignment is no longer available.');
			if (
				!work ||
				work.currentAttemptId !== attempt.id ||
				work.assigneeMemberId !== attempt.memberId
			)
				throw new ConflictError('The work assignment has changed.');
			if (attempt.phase === 'terminal' || attempt.cancelRequestedAt)
				throw new ConflictError('This work attempt no longer accepts handoff requests.');
			if (work.version !== dto.expectedVersion)
				throw new ConflictError('Work item has changed. Reload and try again.');
			if (!['ready', 'running', 'blocked'].includes(work.state))
				throw new ConflictError('This work item cannot be handed off in its current state.');
			if (await this.repository.findPendingHandoffForWork(context.projectId, work.id, ctx))
				throw new ConflictError('A handoff is already pending for this work item.');
			if (await this.repository.findPendingReleaseForAttempt(context.projectId, attempt.id, ctx))
				throw new ConflictError('This work is already being released.');
			const claim = await this.repository.findClaim(context.projectId, attempt.id, ctx);
			if (
				!claim ||
				claim.releasedAt ||
				claim.executionId !== context.executionId ||
				claim.leaseUntil.getTime() <= Date.now()
			)
				throw new ConflictError('A current work claim is required to request a handoff.');
			const destination = await this.repository.findMember(
				context.projectId,
				attempt.departmentId,
				dto.destinationMemberId,
				ctx,
			);
			if (!destination || destination.archived)
				throw new UserError('Destination must be an active member of this department.');
			if (destination.id === attempt.memberId)
				throw new UserError('Choose a different destination member.');
			if (
				await this.repository.hasUnresolvedBlockers(
					context.projectId,
					attempt.departmentId,
					work.id,
					ctx,
				)
			)
				throw new ConflictError('Resolve blocking work before handing off this item.');
			const handoff = Object.assign(new WorkHandoffIntent(), {
				id: randomUUID(),
				projectId: context.projectId,
				departmentId: attempt.departmentId,
				workId: work.id,
				sourceMemberId: attempt.memberId,
				sourceAttemptId: attempt.id,
				destinationMemberId: destination.id,
				destinationBindingVersion: null,
				requestedByActorId: null,
				requestedByMemberId: attempt.memberId,
				authorizedByUserId: null,
				reason: dto.reason,
				expectedWorkVersion: work.version,
				requestId,
				stopCommandId: null,
				state: 'requested' as const,
				createdAt: new Date(),
				completedAt: null,
			});
			await this.repository.saveHandoff(handoff, ctx);
			const result: AiDepartmentWorkHandoffResult = {
				handoffId: handoff.id,
				state: handoff.state,
				work: toWorkDto(work),
				attemptId: attempt.id,
			};
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId: context.projectId,
					actorId: attempt.initiatingUserId,
					requestId,
					payloadHash: hash,
					operation: 'work.agent.handoff.request',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return { result };
		});
		if (departmentId)
			await this.operationsBroadcaster.notifyCurrent(context.projectId, departmentId);
		return reservation.result;
	}

	async authorizeHandoff(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		handoffId: string,
		dto: AuthorizeAiDepartmentWorkHandoffDto,
	): Promise<AiDepartmentWorkHandoffResult> {
		const hash = hashPayload({ departmentId, workId, handoffId, ...dto });
		const reservation = await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt(
				await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
				hash,
			);
			if (prior) return { result: prior };
			const department = await this.repository.findDepartment(projectId, departmentId, ctx);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
			if (!work) throw new NotFoundError('Work item not found.');
			if (work.version !== dto.expectedVersion)
				throw new ConflictError('Work item has changed. Reload and try again.');
			const handoff = await this.repository.findHandoff(
				projectId,
				departmentId,
				workId,
				handoffId,
				ctx,
			);
			if (!handoff || handoff.state !== 'requested')
				throw new ConflictError('This handoff is no longer waiting for coordinator authorization.');
			if (work.currentAttemptId !== handoff.sourceAttemptId)
				throw new ConflictError('The source attempt has changed.');
			const sourceAttempt = await this.repository.findAttempt(
				projectId,
				handoff.sourceAttemptId!,
				ctx,
			);
			if (!sourceAttempt) throw new ConflictError('The source attempt no longer exists.');
			const sourceBinding = await this.directory.findBinding(
				projectId,
				sourceAttempt.memberId,
				ctx,
			);
			if (
				!sourceBinding ||
				sourceBinding.version !== sourceAttempt.bindingVersion ||
				sourceBinding.executorId !== sourceAttempt.executorId
			)
				throw new ForbiddenError('The current execution authority is no longer available.');
			const sourceAccess = await this.executor.resolve({
				actorId,
				projectId,
				memberId: sourceAttempt.memberId,
				executorId: sourceAttempt.executorId,
				bindingVersion: sourceAttempt.bindingVersion,
			});
			if (!sourceAccess.authorized)
				throw new ForbiddenError('You cannot stop the current Agent execution.');
			const destination = await this.repository.findMember(
				projectId,
				departmentId,
				handoff.destinationMemberId,
				ctx,
			);
			if (!destination || destination.archived)
				throw new UserError('Destination must be an active member of this department.');
			const destinationBinding = await this.directory.findBinding(projectId, destination.id, ctx);
			if (!destinationBinding)
				throw new UserError('Configure an authorized executor for the destination member.');
			const destinationAccess = await this.executor.resolve({
				actorId,
				projectId,
				memberId: destination.id,
				executorId: destinationBinding.executorId,
				bindingVersion: destinationBinding.version,
			});
			if (!destinationAccess.authorized || !destinationAccess.canStart)
				throw new ForbiddenError('You cannot execute the destination Agent.');
			handoff.authorizedByUserId = actorId;
			handoff.destinationBindingVersion = destinationBinding.version;
			handoff.stopCommandId = randomUUID();
			handoff.state = 'awaiting_stop';
			await this.repository.saveHandoff(handoff, ctx);
			const result: AiDepartmentWorkHandoffResult = {
				handoffId: handoff.id,
				state: handoff.state,
				work: toWorkDto(work),
				attemptId: handoff.sourceAttemptId,
			};
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'work.handoff.authorize',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return { result, handoff };
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);
		if (!reservation.handoff) return reservation.result;
		await this.requestOwnerStop(reservation.handoff);
		return await this.getHandoff(projectId, departmentId, workId, reservation.handoff.id);
	}

	async getHandoff(projectId: string, departmentId: string, workId: string, handoffId: string) {
		const handoff = await this.repository.findHandoff(projectId, departmentId, workId, handoffId);
		if (!handoff) throw new NotFoundError('Work handoff not found.');
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		return aiDepartmentWorkHandoffResultSchema.parse({
			handoffId: handoff.id,
			state: handoff.state,
			work: toWorkDto(work),
			attemptId: handoff.sourceAttemptId,
		});
	}

	async reconcilePending(signal?: AbortSignal) {
		for (const handoff of await this.repository.listPendingHandoffs(100)) {
			if (signal?.aborted) break;
			await this.requestOwnerStop(handoff);
		}
	}

	private async requestOwnerStop(handoff: WorkHandoffIntent) {
		if (!handoff.sourceAttemptId || !handoff.stopCommandId) return;
		const attempt = await this.repository.findAttempt(handoff.projectId, handoff.sourceAttemptId);
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
					commandId: handoff.stopCommandId,
					reason: 'handoff',
					authorityContext: {
						kind: 'department-control-plane',
						commandId: handoff.stopCommandId,
						reason: 'handoff',
					},
				});
				snapshot = await this.executor.snapshot(context);
			}
			if (snapshot.phase === 'terminal' && snapshot.result)
				await this.completeHandoff(handoff, snapshot);
		} catch {
			// Keep the handoff pending until the owner proves that the run stopped.
		}
	}

	private async completeHandoff(
		handoff: WorkHandoffIntent,
		snapshot: Awaited<ReturnType<DepartmentExecutorProxy['snapshot']>>,
	) {
		if (snapshot.phase !== 'terminal' || !snapshot.result || !handoff.sourceAttemptId) return;
		const terminalResult = snapshot.result;
		await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(handoff.projectId, handoff.departmentId, ctx);
			const currentHandoff = await this.repository.findHandoff(
				handoff.projectId,
				handoff.departmentId,
				handoff.workId,
				handoff.id,
				ctx,
			);
			if (!currentHandoff || currentHandoff.state !== 'awaiting_stop') return;
			const work = await this.repository.findWork(
				handoff.projectId,
				handoff.departmentId,
				handoff.workId,
				ctx,
			);
			const attempt = await this.repository.findAttempt(
				handoff.projectId,
				handoff.sourceAttemptId!,
				ctx,
			);
			if (
				!work ||
				!attempt ||
				work.currentAttemptId !== attempt.id ||
				work.assigneeMemberId !== currentHandoff.sourceMemberId
			)
				throw new ConflictError('Handoff no longer matches the current work assignment.');
			if (work.state === 'cancelled' || work.state === 'done' || work.state === 'review') {
				currentHandoff.state = 'cancelled';
				currentHandoff.completedAt = new Date();
				await this.repository.saveHandoff(currentHandoff, ctx);
				return;
			}
			let savedWork = work;
			if (attempt.phase !== 'terminal') {
				savedWork = await this.repository.applyOwnerSnapshot(
					{
						projectId: work.projectId,
						departmentId: work.departmentId,
						workId: work.id,
						attemptId: attempt.id,
						expectedWorkVersion: work.version,
						sequence: snapshot.sequence,
						phase: 'terminal',
						outcome: terminalResult.outcome,
						resultReference: terminalResult.reference,
						safeSummary: terminalResult.safeSummary,
						toState: 'ready',
						actorId: attempt.executorId,
					},
					ctx,
				);
				const updatedAttempt = await this.repository.findAttempt(work.projectId, attempt.id, ctx);
				if (updatedAttempt?.phase !== 'terminal') return;
				await this.repository.releaseWakeLaneForAttempt(attempt.id, ctx);
			}
			const destination = await this.repository.findMember(
				work.projectId,
				work.departmentId,
				currentHandoff.destinationMemberId,
				ctx,
			);
			const binding = destination
				? await this.directory.findBinding(work.projectId, destination.id, ctx)
				: null;
			const handoffActorId = this.getHandoffActorId(currentHandoff);
			const destinationAccess =
				destination && binding
					? await this.executor.resolve({
							actorId: handoffActorId,
							projectId: work.projectId,
							memberId: destination.id,
							executorId: binding.executorId,
							bindingVersion: binding.version,
						})
					: null;
			const destinationValid =
				destination !== null &&
				!destination.archived &&
				(binding?.version ?? null) === currentHandoff.destinationBindingVersion &&
				(destinationAccess === null || destinationAccess.authorized);
			if (!destinationValid) {
				if (savedWork.state !== 'blocked') {
					const fromState = savedWork.state;
					savedWork.state = 'blocked';
					savedWork.version += 1;
					const blockedWork = await this.repository.saveWork(savedWork, ctx);
					await this.addTransition(
						blockedWork,
						attempt.id,
						fromState,
						'blocked',
						currentHandoff.reason,
						ctx,
					);
					savedWork = blockedWork;
				}
				currentHandoff.state = 'rejected';
			} else {
				const fromState = savedWork.state;
				await this.repository.cancelPendingEligibility(work.projectId, work.id, ctx);
				await this.repository.markPendingWakesDelivered(work.id, ctx);
				savedWork.assigneeMemberId = destination.id;
				savedWork.state = 'ready';
				savedWork.version += 1;
				savedWork = await this.repository.saveWork(savedWork, ctx);
				await this.addTransition(
					savedWork,
					attempt.id,
					fromState,
					'ready',
					currentHandoff.reason,
					ctx,
				);
				await this.addActivity(savedWork, attempt.id, currentHandoff, ctx);
				await this.createEligibility(savedWork, currentHandoff, ctx);
				currentHandoff.state = 'completed';
			}
			currentHandoff.completedAt = new Date();
			await this.repository.saveHandoff(currentHandoff, ctx);
			await this.directory.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId: work.projectId,
					actorId: handoffActorId,
					entityType: 'work_item',
					entityId: work.id,
					action: currentHandoff.state === 'completed' ? 'handoff_completed' : 'handoff_rejected',
					entityVersion: savedWork.version,
					createdAt: new Date(),
				}),
				ctx,
			);
		});
		await this.operationsBroadcaster.notifyCurrent(handoff.projectId, handoff.departmentId);
	}

	private getHandoffActorId(handoff: WorkHandoffIntent) {
		const actorId = handoff.authorizedByUserId ?? handoff.requestedByActorId;
		if (!actorId) throw new ConflictError('This handoff has no authorized coordinator.');
		return actorId;
	}

	private async commitReadyHandoff(
		handoff: WorkHandoffIntent,
		work: NonNullable<Awaited<ReturnType<WorkRepository['findWork']>>>,
		actorId: string,
		ctx: OperationContext,
	): Promise<AiDepartmentWorkHandoffResult> {
		const fromState = work.state;
		await this.repository.cancelPendingEligibility(work.projectId, work.id, ctx);
		await this.repository.markPendingWakesDelivered(work.id, ctx);
		work.assigneeMemberId = handoff.destinationMemberId;
		if (work.state === 'blocked') work.state = 'ready';
		work.version += 1;
		const saved = await this.repository.saveWork(work, ctx);
		await this.addTransition(saved, null, fromState, saved.state, handoff.reason, ctx);
		await this.addActivity(saved, null, handoff, ctx);
		await this.createEligibility(saved, handoff, ctx);
		await this.directory.saveChange(
			Object.assign(new DirectoryChange(), {
				id: randomUUID(),
				projectId: saved.projectId,
				actorId,
				entityType: 'work_item',
				entityId: saved.id,
				action: 'handoff_completed',
				entityVersion: saved.version,
				createdAt: new Date(),
			}),
			ctx,
		);
		return {
			handoffId: handoff.id,
			state: 'completed',
			work: toWorkDto(saved),
			attemptId: null,
		};
	}

	private async createEligibility(
		work: NonNullable<Awaited<ReturnType<WorkRepository['findWork']>>>,
		handoff: WorkHandoffIntent,
		ctx: OperationContext,
	) {
		const binding = work.assigneeMemberId
			? await this.directory.findBinding(work.projectId, work.assigneeMemberId, ctx)
			: null;
		const eligibleAt = new Date();
		const laneGeneration = binding
			? await this.repository.advanceWakeLane(
					{
						projectId: work.projectId,
						memberId: handoff.destinationMemberId,
						actorId: this.getHandoffActorId(handoff),
						bindingVersion: binding.version,
					},
					eligibleAt,
					ctx,
				)
			: 0;
		await this.repository.saveEligibility(
			Object.assign(new WorkEligibility(), {
				workId: work.id,
				generation: await this.repository.nextEligibilityGeneration(work.id, ctx),
				projectId: work.projectId,
				departmentId: work.departmentId,
				memberId: handoff.destinationMemberId,
				actorId: this.getHandoffActorId(handoff),
				bindingVersion: binding?.version ?? null,
				laneGeneration,
				requestId: handoff.requestId,
				state: 'pending',
				eligibleAt,
				consumedAt: null,
				createdAt: eligibleAt,
			}),
			ctx,
		);
		await this.repository.saveWakeIntent(
			Object.assign(new WorkWakeIntent(), {
				workId: work.id,
				projectId: work.projectId,
				departmentId: work.departmentId,
				actorId: this.getHandoffActorId(handoff),
				requestId: randomUUID(),
				createdAt: eligibleAt,
				deliveredAt: null,
			}),
			ctx,
		);
	}

	private async addTransition(
		work: NonNullable<Awaited<ReturnType<WorkRepository['findWork']>>>,
		attemptId: string | null,
		fromState: typeof work.state,
		toState: typeof work.state,
		reason: string,
		ctx: OperationContext,
	) {
		await this.repository.addTransition(
			Object.assign(new WorkTransition(), {
				id: randomUUID(),
				projectId: work.projectId,
				departmentId: work.departmentId,
				workId: work.id,
				attemptId,
				actorId: null,
				actorKind: 'user',
				fromState,
				toState,
				reason,
				workVersion: work.version,
				createdAt: new Date(),
			}),
			ctx,
		);
	}

	private async addActivity(
		work: NonNullable<Awaited<ReturnType<WorkRepository['findWork']>>>,
		attemptId: string | null,
		handoff: WorkHandoffIntent,
		ctx: OperationContext,
	) {
		await this.repository.addActivity(
			Object.assign(new WorkActivity(), {
				id: randomUUID(),
				projectId: work.projectId,
				departmentId: work.departmentId,
				workId: work.id,
				attemptId,
				actorId: this.getHandoffActorId(handoff),
				actorKind: 'user',
				kind: 'handoff',
				body: handoff.reason,
				workVersion: work.version,
				createdAt: new Date(),
			}),
			ctx,
		);
	}
}
