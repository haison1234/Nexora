import {
	aiDepartmentReviewStageSchema,
	aiDepartmentGoalDtoSchema,
	aiDepartmentAttemptCommandResultSchema,
	aiDepartmentCancelWorkResultSchema,
	aiDepartmentReviewResultSchema,
	aiDepartmentWorkReviewReopenResultSchema,
	aiDepartmentWorkActivityResultSchema,
	aiDepartmentWorkCompletionReportSchema,
	aiDepartmentWorkItemDtoSchema,
	createAiDepartmentWorkActivitySchema,
	aiDepartmentWorkRelationshipDtoSchema,
	type AiDepartmentGoalDto,
	type AiDepartmentAttemptCommandResult,
	type AiDepartmentCancelWorkResult,
	type AiDepartmentWorkActivityResult,
	type AiDepartmentWorkCompletionReport,
	type AiDepartmentReviewResult,
	type AiDepartmentWorkReviewReopenResult,
	type AiDepartmentWorkAttemptDto,
	type AiDepartmentWorkReviewDecisionDto,
	type AiDepartmentWorkItemDto,
	type AiDepartmentWorkClaimSummaryDto,
	type AiDepartmentWorkWakeStatus,
	type AiDepartmentWorkRelationshipDto,
	type AiDepartmentWorkflowCapabilitySnapshot,
	type AiDepartmentWorkState,
	CreateAiDepartmentGoalDto,
	CreateAiDepartmentWorkDto,
	UpdateAiDepartmentGoalDto,
	UpdateAiDepartmentWorkDto,
	UpdateAiDepartmentWorkStateDto,
	CreateAiDepartmentWorkRelationshipDto,
	DeleteAiDepartmentWorkRelationshipDto,
	ReviewAiDepartmentWorkDto,
	ReopenAiDepartmentWorkReviewDto,
	CreateAiDepartmentWorkActivityDto,
} from '@n8n/api-types';
import { TransactionRunner, type OperationContext } from '@n8n/db';
import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { DepartmentGoal } from '../database/entities/department-goal.entity';
import { WorkItem } from '../database/entities/work-item.entity';
import { WorkTransition } from '../database/entities/work-transition.entity';
import { WorkAttempt } from '../database/entities/work-attempt.entity';
import { WorkDispatchIntent } from '../database/entities/work-dispatch-intent.entity';
import { WorkReviewDecision } from '../database/entities/work-review-decision.entity';
import {
	WorkReviewPolicyRevision,
	WorkReviewRound,
	WorkReviewStageDecision,
} from '../database/entities/work-review-records.entity';
import { WorkRelationship } from '../database/entities/work-relationship.entity';
import { DirectoryChange } from '../database/entities/directory-change.entity';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { transitionWorkState } from './work-lifecycle';
import { toWorkDto } from './work-mappers';
import { WorkWakeIntent } from '../database/entities/work-wake-intent.entity';
import { WorkEligibility } from '../database/entities/work-eligibility.entity';
import { WorkActivity } from '../database/entities/work-activity.entity';
import { DepartmentExecutorProxy } from './executor.contracts';
import type { DepartmentAttemptContext } from './executor.contracts';
import { AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED } from '../workflow/workflow-invocation-gate';
import { WorkReleaseService } from './work-release.service';
import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

type ReservedWorkDispatch = {
	result: AiDepartmentAttemptCommandResult;
	context?: DepartmentAttemptContext & { workVersion: number };
};

function payloadHash(payload: unknown) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function replayReceipt<T>(
	receipt: CommandReceipt | null,
	inputHash: string,
	schema: { parse(value: unknown): T },
): T | undefined {
	if (!receipt) return undefined;
	if (receipt.payloadHash !== inputHash) {
		throw new ConflictError('Request ID was already used for a different command.');
	}
	if (receipt.status !== 'completed' || !receipt.responseJson) {
		throw new ConflictError('This command is still being processed.');
	}
	return schema.parse(JSON.parse(receipt.responseJson));
}

function toGoalDto(goal: DepartmentGoal): AiDepartmentGoalDto {
	return {
		id: goal.id,
		projectId: goal.projectId,
		departmentId: goal.departmentId,
		title: goal.title,
		successCriteria: goal.successCriteria,
		parentId: goal.parentId,
		ownerMemberId: goal.ownerMemberId,
		dueAt: goal.dueAt?.toISOString() ?? null,
		state: goal.state,
		version: goal.version,
		createdAt: goal.createdAt.toISOString(),
		updatedAt: goal.updatedAt.toISOString(),
	};
}

function toWorkRelationshipDto(relationship: WorkRelationship): AiDepartmentWorkRelationshipDto {
	return {
		id: relationship.id,
		projectId: relationship.projectId,
		departmentId: relationship.departmentId,
		workId: relationship.workId,
		relatedWorkId: relationship.relatedWorkId,
		kind: relationship.kind,
		createdAt: relationship.createdAt.toISOString(),
	};
}

/** Older submissions can store plain text, so a body that is not a report yields null. */
function completionReportOf(entry: {
	kind: string;
	body: string | null;
}): AiDepartmentWorkCompletionReport | null {
	if (entry.kind !== 'submit' || !entry.body) return null;
	try {
		const parsed = aiDepartmentWorkCompletionReportSchema.safeParse(JSON.parse(entry.body));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

@Service()
export class WorkService {
	constructor(
		private readonly logger: Logger,
		private readonly directory: DirectoryRepository,
		private readonly repository: WorkRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly releases: WorkReleaseService,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {}

	private async runAndNotify<T>(
		projectId: string,
		departmentId: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const result = await operation();
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);
		return result;
	}

	async startWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: UpdateAiDepartmentWorkStateDto,
		retry = false,
		fromWake = false,
	): Promise<AiDepartmentAttemptCommandResult> {
		const operation = retry ? 'work.retry' : 'work.start';
		const hash = payloadHash({
			departmentId,
			workId,
			expectedVersion: dto.expectedVersion,
			operation,
		});
		const reservation: ReservedWorkDispatch = await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt(
				await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
				hash,
				aiDepartmentAttemptCommandResultSchema,
			);
			if (prior) return { result: prior };
			await this.requireActiveDepartment(projectId, departmentId, ctx);
			const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
			if (!work) throw new NotFoundError('Work item not found.');
			if (work.version !== dto.expectedVersion)
				throw new ConflictError('Work item has changed. Reload and try again.');
			const requiredState = retry ? 'blocked' : 'ready';
			if (work.state !== requiredState)
				throw new ConflictError(
					`Only ${requiredState} work can be ${retry ? 'retried' : 'started'}.`,
				);
			if (retry && work.currentAttemptId) {
				const pendingRelease = await this.repository.findPendingReleaseForAttempt(
					projectId,
					work.currentAttemptId,
					ctx,
				);
				if (pendingRelease) {
					throw new ConflictError('The previous owner run must stop before work can be retried.');
				}
				const previousAttempt = await this.repository.findAttempt(
					projectId,
					work.currentAttemptId,
					ctx,
				);
				if (previousAttempt && previousAttempt.phase !== 'terminal') {
					throw new ConflictError('The previous owner run must stop before work can be retried.');
				}
			}
			if (await this.repository.hasUnresolvedBlockers(projectId, departmentId, workId, ctx)) {
				throw new ConflictError('Resolve blocking work before starting this item.');
			}
			if (retry) {
				const fromState = work.state;
				work.state = transitionWorkState(work.state, 'retry', false);
				work.version += 1;
				const readyWork = await this.repository.saveWork(work, ctx);
				await this.repository.addTransition(
					this.transition(
						projectId,
						departmentId,
						readyWork,
						fromState,
						readyWork.state,
						actorId,
						'user',
					),
					ctx,
				);
			}
			if (!work.assigneeMemberId)
				throw new UserError('Assign this work to an active department member first.');
			const member = await this.repository.findMember(
				projectId,
				departmentId,
				work.assigneeMemberId,
				ctx,
			);
			if (!member || member.archived)
				throw new UserError('Assign this work to an active department member first.');
			const eligibility = await this.prepareEligibilityForDispatch(
				projectId,
				actorId,
				work,
				dto.requestId,
				fromWake,
				ctx,
			);
			const binding = await this.directory.findBinding(projectId, member.id, ctx);
			if (!binding || binding.provider !== 'n8n-agent') {
				eligibility.state = 'cancelled';
				eligibility.consumedAt = new Date();
				await this.repository.saveEligibility(eligibility, ctx);
				return {
					result: await this.blockUnavailableWork(
						projectId,
						actorId,
						departmentId,
						work,
						dto,
						hash,
						operation,
						ctx,
					),
				};
			}
			if (
				eligibility.memberId !== member.id ||
				eligibility.actorId !== actorId ||
				eligibility.bindingVersion !== binding.version
			) {
				eligibility.state = 'cancelled';
				eligibility.consumedAt = new Date();
				await this.repository.saveEligibility(eligibility, ctx);
				if (fromWake) {
					const result: AiDepartmentAttemptCommandResult = {
						work: toWorkDto(work),
						attemptId: null,
						dispatchState: 'rejected',
					};
					await this.directory.saveReceipt(
						Object.assign(new CommandReceipt(), {
							id: randomUUID(),
							projectId,
							actorId,
							requestId: dto.requestId,
							payloadHash: hash,
							operation,
							status: 'completed',
							responseJson: JSON.stringify(result),
							createdAt: new Date(),
						}),
						ctx,
					);
					return { result };
				}
				throw new ConflictError('Work assignment or executor binding changed. Retry the command.');
			}
			const resolution = await this.executor.resolve({
				actorId,
				projectId,
				memberId: member.id,
				executorId: binding.executorId,
				bindingVersion: binding.version,
			});
			if (!resolution.authorized)
				throw new ForbiddenError('You do not have permission to execute this Agent.');
			if (!resolution.canStart) {
				eligibility.state = 'cancelled';
				eligibility.consumedAt = new Date();
				await this.repository.saveEligibility(eligibility, ctx);
				return {
					result: await this.blockUnavailableWork(
						projectId,
						actorId,
						departmentId,
						work,
						dto,
						hash,
						operation,
						ctx,
					),
				};
			}
			eligibility.state = 'reserved';
			eligibility.consumedAt = new Date();
			await this.repository.saveEligibility(eligibility, ctx);

			const attemptId = randomUUID();
			const dispatchKey = randomUUID();
			const workflowCapabilities = AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED
				? await this.repository.listEnabledWorkflowCapabilities(
						projectId,
						departmentId,
						member.id,
						ctx,
					)
				: [];
			const workflowIds = workflowCapabilities.map(({ workflowId }) => workflowId);
			const attempt = Object.assign(new WorkAttempt(), {
				id: attemptId,
				projectId,
				departmentId,
				workId,
				ordinal: await this.repository.nextAttemptOrdinal(workId, ctx),
				initiatingUserId: actorId,
				memberId: member.id,
				bindingVersion: binding.version,
				provider: binding.provider,
				executorId: binding.executorId,
				reviewPolicy: work.reviewPolicy,
				reviewStagesJson: work.reviewStagesJson,
				reviewPolicyRevision: work.reviewPolicyRevision,
				reviewPolicyRevisionId: work.reviewPolicyRevisionId,
				submittedResultId: null,
				reviewRoundId: null,
				reviewRoundStatus: null,
				reviewRoundClosedAt: null,
				dispatchKey,
				workflowIdsJson: JSON.stringify(workflowIds),
				workflowCapabilitiesJson: JSON.stringify(workflowCapabilities),
				ownerExecutionRef: null,
				phase: 'dispatching',
				lastOwnerSequence: '0',
				cancelRequestId: null,
				outcome: null,
				resultReference: null,
				safeSummary: null,
				startedAt: null,
				finishedAt: null,
				cancelRequestedAt: null,
			});
			const intent = Object.assign(new WorkDispatchIntent(), {
				attemptId,
				projectId,
				requestId: dto.requestId,
				inputHash: hash,
				state: 'pending',
				acknowledgmentReference: null,
				leaseUntil: null,
			});
			await this.repository.claimWakeLaneForAttempt(
				{
					projectId,
					memberId: member.id,
					actorId,
					bindingVersion: binding.version,
				},
				attemptId,
				ctx,
			);
			// Dispatch reserves a wake. The Agent claim starts business work.
			const nextState = work.state;
			const saved = await this.repository.reserveAttempt(
				{
					projectId,
					departmentId,
					workId,
					expectedVersion: work.version,
					nextState,
					attempt,
					intent,
					actorId,
				},
				ctx,
			);
			const result = {
				work: toWorkDto(saved.work),
				attemptId,
				dispatchState: 'pending' as const,
			};
			await this.recordWorkCommand(
				projectId,
				actorId,
				dto.requestId,
				hash,
				operation,
				saved.work,
				result.work,
				ctx,
			);
			const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
			if (receipt) {
				receipt.responseJson = JSON.stringify(result);
				await this.directory.saveReceipt(receipt, ctx);
			}
			return {
				result,
				context: {
					actorId,
					projectId,
					departmentId,
					workId,
					attemptId,
					memberId: member.id,
					executorId: binding.executorId,
					bindingVersion: binding.version,
					dispatchKey,
					workflowIds,
					workflowCapabilities,
					instruction: work.instruction,
					reviewPolicy: work.reviewPolicy,
					workVersion: saved.work.version,
				},
			};
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);

		const dispatchContext = reservation.context;
		if (!dispatchContext) return reservation.result;
		let dispatchResult: Awaited<ReturnType<DepartmentExecutorProxy['dispatch']>>;
		try {
			dispatchResult = await this.executor.dispatch(dispatchContext);
		} catch {
			dispatchResult = { kind: 'unknown' };
		}
		const result = await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const savedWork = await this.repository.recordDispatchResult(
				{
					projectId,
					departmentId,
					workId,
					attemptId: dispatchContext.attemptId,
					expectedWorkVersion: dispatchContext.workVersion,
					result: dispatchResult,
					actorId,
				},
				ctx,
			);
			await this.repository.acknowledgeWakeLaneForAttempt(
				dispatchContext.attemptId,
				dispatchResult.kind,
				ctx,
			);
			if (dispatchResult.kind === 'rejected') {
				await this.repository.releaseWakeLaneForAttempt(dispatchContext.attemptId, ctx);
			}
			const result: AiDepartmentAttemptCommandResult = {
				work: toWorkDto(savedWork),
				attemptId: dispatchContext.attemptId,
				dispatchState: dispatchResult.kind === 'accepted' ? 'acknowledged' : dispatchResult.kind,
			};
			const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
			if (receipt) {
				receipt.responseJson = JSON.stringify(result);
				await this.directory.saveReceipt(receipt, ctx);
			}
			return result;
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);
		return result;
	}

	async cancelWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: UpdateAiDepartmentWorkStateDto,
	): Promise<AiDepartmentCancelWorkResult> {
		const hash = payloadHash({
			departmentId,
			workId,
			expectedVersion: dto.expectedVersion,
			action: 'cancel',
		});
		const reserved = await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt(
				await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
				hash,
				aiDepartmentCancelWorkResultSchema,
			);
			if (prior) return { result: prior };
			await this.requireActiveDepartment(projectId, departmentId, ctx);
			const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
			if (!work) throw new NotFoundError('Work item not found.');
			if (work.version !== dto.expectedVersion)
				throw new ConflictError('Work item has changed. Reload and try again.');
			const attempt = work.currentAttemptId
				? await this.repository.findAttempt(projectId, work.currentAttemptId, ctx)
				: null;
			const hasActiveAttempt =
				attempt !== null &&
				['dispatching', 'active', 'suspended', 'stopping'].includes(attempt.phase);
			if (!hasActiveAttempt) {
				const fromState = work.state;
				work.state = transitionWorkState(work.state, 'cancel', false);
				work.version += 1;
				const saved = await this.repository.saveWork(work, ctx);
				await this.repository.addTransition(
					this.transition(
						projectId,
						departmentId,
						saved,
						fromState,
						saved.state,
						actorId,
						'user',
						dto.reason ?? null,
					),
					ctx,
				);
				const result = {
					work: toWorkDto(saved),
					attemptId: null,
					cancelRequested: false,
					cancellationPending: false,
				};
				await this.recordWorkCommand(
					projectId,
					actorId,
					dto.requestId,
					hash,
					'work.cancel',
					saved,
					result.work,
					ctx,
				);
				const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
				if (receipt) {
					receipt.responseJson = JSON.stringify(result);
					await this.directory.saveReceipt(receipt, ctx);
				}
				return { result };
			}
			if (!attempt) throw new ConflictError('Active work attempt no longer exists.');
			await this.repository.cancelPendingHandoffForWork(projectId, workId, ctx);

			const access = await this.executor.resolve({
				actorId,
				projectId,
				memberId: attempt.memberId,
				executorId: attempt.executorId,
				bindingVersion: attempt.bindingVersion,
			});
			if (!access.authorized)
				throw new ForbiddenError('You do not have permission to stop this Agent execution.');
			const nextState = transitionWorkState(work.state, 'cancel_requested', true);
			const saved = await this.repository.recordStopRequest(
				{
					projectId,
					departmentId,
					workId,
					attemptId: attempt.id,
					expectedWorkVersion: dto.expectedVersion,
					nextState,
					requestId: dto.requestId,
					actorId,
				},
				ctx,
			);
			const result = {
				work: toWorkDto(saved.work),
				attemptId: attempt.id,
				cancelRequested: true,
				cancellationPending: true,
			};
			await this.recordWorkCommand(
				projectId,
				actorId,
				dto.requestId,
				hash,
				'work.cancel',
				saved.work,
				result.work,
				ctx,
			);
			const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
			if (receipt) {
				receipt.responseJson = JSON.stringify(result);
				await this.directory.saveReceipt(receipt, ctx);
			}
			return { result, attempt: saved.attempt };
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);

		if (!reserved.attempt) return reserved.result;
		return await this.issueStopRequest(
			projectId,
			actorId,
			dto.requestId,
			reserved.attempt,
			reserved.result,
		);
	}

	private async issueStopRequest(
		projectId: string,
		actorId: string,
		commandId: string,
		attempt: WorkAttempt,
		pendingResult: AiDepartmentCancelWorkResult,
	) {
		let ownerExecutionRef = attempt.ownerExecutionRef;
		if (!ownerExecutionRef) {
			try {
				const lookup = await this.executor.lookup({
					actorId,
					projectId,
					executorId: attempt.executorId,
					attemptId: attempt.id,
					dispatchKey: attempt.dispatchKey,
				});
				if (lookup.kind === 'accepted') ownerExecutionRef = lookup.ownerExecutionRef;
			} catch {
				return pendingResult;
			}
		}
		if (!ownerExecutionRef) return pendingResult;
		let stop: { acknowledged: boolean; confirmed: boolean };
		try {
			stop = await this.executor.requestStop({
				actorId,
				projectId,
				executorId: attempt.executorId,
				attemptId: attempt.id,
				ownerExecutionRef,
				commandId,
				reason: 'cancel',
				authorityContext: { kind: 'department-control-plane', commandId, reason: 'cancel' },
			});
		} catch {
			return pendingResult;
		}
		if (!stop.confirmed) return pendingResult;
		return await this.applyConfirmedCancellation(projectId, actorId, attempt, ownerExecutionRef);
	}

	private async applyConfirmedCancellation(
		projectId: string,
		actorId: string,
		attempt: WorkAttempt,
		ownerExecutionRef: string,
	): Promise<AiDepartmentCancelWorkResult> {
		return await this.runAndNotify(
			projectId,
			attempt.departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					const work = await this.repository.findWork(
						projectId,
						attempt.departmentId,
						attempt.workId,
						ctx,
					);
					if (!work || work.currentAttemptId !== attempt.id) {
						throw new ConflictError('Cancellation no longer matches the current work attempt.');
					}
					const currentAttempt = await this.repository.findAttempt(projectId, attempt.id, ctx);
					if (!currentAttempt) throw new ConflictError('Work attempt no longer exists.');
					const terminalState = ['review', 'done', 'cancelled'].includes(work.state)
						? work.state
						: transitionWorkState(work.state, 'cancellation_confirmed', true);
					const sequence = (BigInt(currentAttempt.lastOwnerSequence) + 1n).toString();
					await this.repository.acquireAdmissionFence(attempt.projectId, attempt.departmentId, ctx);
					const saved = await this.repository.applyOwnerSnapshot(
						{
							projectId,
							departmentId: attempt.departmentId,
							workId: attempt.workId,
							attemptId: attempt.id,
							expectedWorkVersion: work.version,
							sequence,
							phase: 'terminal',
							outcome: 'cancelled',
							resultReference: ownerExecutionRef,
							toState: terminalState,
							actorId: attempt.executorId,
						},
						ctx,
					);
					const updatedAttempt = await this.repository.findAttempt(projectId, attempt.id, ctx);
					if (updatedAttempt?.phase === 'terminal') {
						await this.repository.releaseWakeLaneForAttempt(attempt.id, ctx);
					}
					if (updatedAttempt?.phase === 'terminal') {
						await this.resumeParentsAfterChildTerminal(saved, ctx);
					}
					const result: AiDepartmentCancelWorkResult = {
						work: toWorkDto(saved),
						attemptId: attempt.id,
						cancelRequested: true,
						cancellationPending: false,
					};
					if (currentAttempt.cancelRequestId) {
						const receipt = await this.directory.findReceipt(
							projectId,
							actorId,
							currentAttempt.cancelRequestId,
							ctx,
						);
						if (receipt) {
							receipt.responseJson = JSON.stringify(result);
							await this.directory.saveReceipt(receipt, ctx);
						}
					}
					return result;
				}),
		);
	}

	async reconcileAttempts(signal?: AbortSignal): Promise<number> {
		await this.deliverPendingWakes(signal);
		const candidates = await this.repository.listReconciliationCandidates(100);
		let reconciled = 0;
		for (const candidate of candidates) {
			if (signal?.aborted) break;
			try {
				if (candidate.cancelRequestedAt) {
					const work = await this.repository.findWork(
						candidate.projectId,
						candidate.departmentId,
						candidate.workId,
					);
					if (work) {
						const result = await this.issueStopRequest(
							candidate.projectId,
							candidate.initiatingUserId,
							`reconcile:${candidate.id}`,
							candidate,
							{
								work: toWorkDto(work),
								attemptId: candidate.id,
								cancelRequested: true,
								cancellationPending: true,
							},
						);
						if (!result.cancellationPending) reconciled++;
					}
				}
				if (await this.reconcileAttempt(candidate)) {
					reconciled++;
					await this.operationsBroadcaster.notifyCurrent(
						candidate.projectId,
						candidate.departmentId,
					);
				}
			} catch (error) {
				if (!(error instanceof ConflictError)) throw error;
			}
		}
		return reconciled;
	}

	private async deliverPendingWakes(signal?: AbortSignal) {
		for (const wake of await this.repository.listPendingWakes(100)) {
			if (signal?.aborted) break;
			const work = await this.repository.findWork(wake.projectId, wake.departmentId, wake.workId);
			if (!work || work.state !== 'ready') {
				await this.repository.markWakeDelivered(wake.workId, wake.requestId);
				continue;
			}
			if (work.currentAttemptId) {
				const attempt = await this.repository.findAttempt(wake.projectId, work.currentAttemptId);
				if (attempt && attempt.phase !== 'terminal') {
					await this.repository.markWakeDelivered(wake.workId, wake.requestId);
					continue;
				}
			}
			try {
				await this.startWork(
					wake.projectId,
					wake.actorId,
					wake.departmentId,
					wake.workId,
					{ requestId: wake.requestId, expectedVersion: work.version },
					false,
					true,
				);
				await this.repository.markWakeDelivered(wake.workId, wake.requestId);
			} catch (error) {
				// A competing coordinator start already owns the attempt slot.
				if (!(error instanceof ConflictError)) {
					await this.repository.deferWake(wake.workId, wake.requestId);
				}
				if (!(error instanceof ConflictError || error instanceof ForbiddenError))
					this.logger.warn('Department wake delivery failed.', { workId: wake.workId });
			}
		}
	}

	private async reconcileAttempt(attempt: WorkAttempt): Promise<boolean> {
		let work = await this.repository.findWork(
			attempt.projectId,
			attempt.departmentId,
			attempt.workId,
		);
		if (!work || work.currentAttemptId !== attempt.id) return false;
		const binding = await this.directory.findBinding(attempt.projectId, attempt.memberId);
		let authorityRevoked =
			!binding ||
			binding.version !== attempt.bindingVersion ||
			binding.executorId !== attempt.executorId ||
			binding.provider !== attempt.provider;
		if (!authorityRevoked) {
			const resolution = await this.executor.resolve({
				actorId: attempt.initiatingUserId,
				projectId: attempt.projectId,
				memberId: attempt.memberId,
				executorId: attempt.executorId,
				bindingVersion: attempt.bindingVersion,
			});
			authorityRevoked = !resolution.authorized;
		}
		let ownerExecutionRef = attempt.ownerExecutionRef;
		if (!ownerExecutionRef) {
			let lookup = await this.executor.lookup({
				actorId: attempt.initiatingUserId,
				projectId: attempt.projectId,
				executorId: attempt.executorId,
				attemptId: attempt.id,
				dispatchKey: attempt.dispatchKey,
			});
			if (lookup.kind === 'absent' && authorityRevoked) {
				lookup = { kind: 'rejected', reason: 'Execution authority was revoked.' };
			}
			if (lookup.kind === 'absent' && !attempt.cancelRequestedAt) {
				lookup = await this.executor.dispatch({
					actorId: attempt.initiatingUserId,
					projectId: attempt.projectId,
					departmentId: attempt.departmentId,
					workId: attempt.workId,
					attemptId: attempt.id,
					memberId: attempt.memberId,
					executorId: attempt.executorId,
					bindingVersion: attempt.bindingVersion,
					dispatchKey: attempt.dispatchKey,
					workflowIds: JSON.parse(attempt.workflowIdsJson) as string[],
					workflowCapabilities: JSON.parse(
						attempt.workflowCapabilitiesJson,
					) as AiDepartmentWorkflowCapabilitySnapshot[],
					instruction: work.instruction,
					reviewPolicy: attempt.reviewPolicy,
				});
			}
			if (lookup.kind === 'rejected') {
				const rejection = lookup;
				const rejectedWorkVersion = work.version;
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(attempt.projectId, attempt.departmentId, ctx);
					await this.repository.recordDispatchResult(
						{
							projectId: attempt.projectId,
							departmentId: attempt.departmentId,
							workId: attempt.workId,
							attemptId: attempt.id,
							expectedWorkVersion: rejectedWorkVersion,
							result: rejection,
							actorId: attempt.initiatingUserId,
						},
						ctx,
					);
					await this.repository.acknowledgeWakeLaneForAttempt(attempt.id, 'rejected', ctx);
					await this.repository.releaseWakeLaneForAttempt(attempt.id, ctx);
				});
				return true;
			}
			if (lookup.kind !== 'accepted') return false;
			const acceptedReference = lookup.ownerExecutionRef;
			ownerExecutionRef = acceptedReference;
			const dispatchWork = work;
			if (!dispatchWork) return false;
			await this.txRunner.run({}, async (ctx) => {
				await this.repository.recordDispatchResult(
					{
						projectId: attempt.projectId,
						departmentId: attempt.departmentId,
						workId: attempt.workId,
						attemptId: attempt.id,
						expectedWorkVersion: dispatchWork.version,
						result: { kind: 'accepted', ownerExecutionRef: acceptedReference },
						actorId: attempt.initiatingUserId,
					},
					ctx,
				);
				await this.repository.acknowledgeWakeLaneForAttempt(attempt.id, 'accepted', ctx);
			});
		}
		if (!ownerExecutionRef) return false;
		if (authorityRevoked) {
			try {
				await this.executor.requestStop({
					actorId: attempt.initiatingUserId,
					projectId: attempt.projectId,
					executorId: attempt.executorId,
					attemptId: attempt.id,
					ownerExecutionRef,
					commandId: attempt.id,
					reason: 'authority-revoked',
					authorityContext: {
						kind: 'department-control-plane',
						commandId: attempt.id,
						reason: 'authority-revoked',
					},
				});
			} catch {
				// The authority mismatch causes the reconciler to retry this stop.
			}
		}
		const snapshot = await this.executor.snapshot({
			actorId: attempt.initiatingUserId,
			projectId: attempt.projectId,
			executorId: attempt.executorId,
			attemptId: attempt.id,
			ownerExecutionRef,
		});
		if (snapshot.phase === 'unknown') return false;
		const snapshotPhase = snapshot.phase;
		work = await this.repository.findWork(attempt.projectId, attempt.departmentId, attempt.workId);
		if (!work || work.currentAttemptId !== attempt.id) return false;
		const snapshotWork = work;
		let toState = work.state;
		const missingSubmittedResult =
			snapshot.phase === 'terminal' &&
			snapshot.result?.outcome === 'succeeded' &&
			!(await this.repository.hasSubmittedResult(attempt.projectId, attempt.workId, attempt.id));
		if (
			snapshot.phase === 'terminal' &&
			snapshot.result &&
			!['review', 'done', 'cancelled'].includes(work.state)
		) {
			if (snapshot.result.outcome === 'failed') {
				toState = 'blocked';
			} else if (snapshot.result.outcome === 'cancelled') {
				toState = attempt.cancelRequestId
					? transitionWorkState(work.state, 'cancellation_confirmed', true)
					: 'blocked';
			}
			if (snapshot.result.outcome === 'succeeded') {
				// A run without a result needs coordinator recovery.
				toState = 'blocked';
			}
		}
		await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(attempt.projectId, attempt.departmentId, ctx);
			const saved = await this.repository.applyOwnerSnapshot(
				{
					projectId: attempt.projectId,
					departmentId: attempt.departmentId,
					workId: attempt.workId,
					attemptId: attempt.id,
					expectedWorkVersion: snapshotWork.version,
					sequence: snapshot.sequence,
					phase: snapshotPhase,
					...(snapshot.result
						? {
								outcome: missingSubmittedResult ? 'failed' : snapshot.result.outcome,
								resultReference: snapshot.result.reference,
								safeSummary: missingSubmittedResult
									? 'Agent run ended without a submitted result.'
									: snapshot.result.safeSummary,
							}
						: {}),
					toState,
					actorId: attempt.executorId,
				},
				ctx,
			);
			const updatedAttempt = await this.repository.findAttempt(attempt.projectId, attempt.id, ctx);
			if (updatedAttempt?.phase === 'terminal') {
				await this.repository.releaseWakeLaneForAttempt(attempt.id, ctx);
			}
			if (updatedAttempt?.phase === 'terminal') {
				await this.resumeParentsAfterChildTerminal(saved, ctx);
			}
			if (snapshot.phase === 'terminal' && snapshot.result?.outcome === 'cancelled') {
				const currentAttempt = await this.repository.findAttempt(
					attempt.projectId,
					attempt.id,
					ctx,
				);
				if (currentAttempt?.cancelRequestId) {
					const receipt = await this.directory.findReceipt(
						attempt.projectId,
						attempt.initiatingUserId,
						currentAttempt.cancelRequestId,
						ctx,
					);
					if (receipt) {
						receipt.responseJson = JSON.stringify({
							work: toWorkDto(saved),
							attemptId: attempt.id,
							cancelRequested: true,
							cancellationPending: false,
						});
						await this.directory.saveReceipt(receipt, ctx);
					}
				}
			}
		});
		return true;
	}

	private async blockUnavailableWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		work: WorkItem,
		dto: UpdateAiDepartmentWorkStateDto,
		hash: string,
		operation: string,
		ctx: OperationContext,
	): Promise<AiDepartmentAttemptCommandResult> {
		const fromState = work.state;
		work.state = transitionWorkState(work.state, 'executor_unavailable', false);
		work.version += 1;
		const saved = await this.repository.saveWork(work, ctx);
		await this.repository.addTransition(
			this.transition(
				projectId,
				departmentId,
				saved,
				fromState,
				saved.state,
				actorId,
				'system',
				'No available executor is bound to this member.',
			),
			ctx,
		);
		const result: AiDepartmentAttemptCommandResult = {
			work: toWorkDto(saved),
			attemptId: null,
			dispatchState: 'unavailable',
		};
		await this.recordWorkCommand(
			projectId,
			actorId,
			dto.requestId,
			hash,
			operation,
			saved,
			result.work,
			ctx,
		);
		const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
		if (receipt) {
			receipt.responseJson = JSON.stringify(result);
			await this.directory.saveReceipt(receipt, ctx);
		}
		return result;
	}

	async listGoals(projectId: string, departmentId: string) {
		await this.requireDepartment(projectId, departmentId);
		return (await this.repository.listGoals(projectId, departmentId)).map(toGoalDto);
	}

	async getGoal(projectId: string, departmentId: string, goalId: string) {
		const goal = await this.repository.findGoal(projectId, departmentId, goalId);
		if (!goal) throw new NotFoundError('Goal not found.');
		return toGoalDto(goal);
	}

	async readMeetingSourceSnapshot(
		projectId: string,
		departmentId: string,
		sourceKind: 'goal' | 'work',
		sourceId: string,
		ctx: OperationContext = {},
	) {
		await this.requireActiveDepartment(projectId, departmentId, ctx);
		if (sourceKind === 'goal') {
			const goal = await this.repository.findGoal(projectId, departmentId, sourceId, ctx);
			if (!goal || goal.state === 'archived') return null;
			const content = [
				`Goal: ${goal.title}`,
				goal.successCriteria ? `Success criteria: ${goal.successCriteria}` : null,
				`State: ${goal.state}`,
			]
				.filter((line): line is string => line !== null)
				.join('\n');
			return {
				sourceKind,
				sourceId,
				sourceVersion: String(goal.version),
				content,
				contentHash: payloadHash({ sourceKind, sourceId, version: goal.version, content }),
			};
		}
		const work = await this.repository.findWork(projectId, departmentId, sourceId, ctx);
		if (!work) return null;
		const content = [
			`Work instruction: ${work.instruction}`,
			`Priority: ${work.priority}`,
			`State: ${work.state}`,
			`Review policy: ${work.reviewPolicy}`,
		].join('\n');
		return {
			sourceKind,
			sourceId,
			sourceVersion: String(work.version),
			content,
			contentHash: payloadHash({ sourceKind, sourceId, version: work.version, content }),
		};
	}

	async createGoal(
		projectId: string,
		actorId: string,
		departmentId: string,
		dto: CreateAiDepartmentGoalDto,
	) {
		const input = {
			departmentId,
			title: dto.title.trim(),
			successCriteria: dto.successCriteria?.trim() || null,
			parentId: dto.parentId ?? null,
			ownerMemberId: dto.ownerMemberId ?? null,
			dueAt: dto.dueAt ?? null,
		};
		const hash = payloadHash(input);
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentGoalDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					await this.validateGoalReferences(
						projectId,
						departmentId,
						input.parentId,
						input.ownerMemberId,
						ctx,
					);
					const goal = Object.assign(new DepartmentGoal(), {
						id: randomUUID(),
						projectId,
						...input,
						dueAt: input.dueAt ? new Date(input.dueAt) : null,
						state: 'active',
						version: 1,
					});
					const saved = await this.repository.saveGoal(goal, ctx);
					const result = toGoalDto(saved);
					await this.recordGoalCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'goal.create',
						saved,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async updateGoal(
		projectId: string,
		actorId: string,
		departmentId: string,
		goalId: string,
		dto: UpdateAiDepartmentGoalDto,
	) {
		const hash = payloadHash({ departmentId, goalId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentGoalDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const goal = await this.repository.findGoal(projectId, departmentId, goalId, ctx);
					if (!goal) throw new NotFoundError('Goal not found.');
					if (goal.version !== dto.expectedVersion)
						throw new ConflictError('Goal has changed. Reload and try again.');
					const parentId = dto.parentId === undefined ? goal.parentId : dto.parentId;
					const ownerMemberId =
						dto.ownerMemberId === undefined ? goal.ownerMemberId : dto.ownerMemberId;
					await this.validateGoalReferences(
						projectId,
						departmentId,
						parentId,
						ownerMemberId,
						ctx,
						goalId,
					);
					if (dto.title !== undefined) goal.title = dto.title.trim();
					if (dto.successCriteria !== undefined)
						goal.successCriteria = dto.successCriteria?.trim() || null;
					if (dto.parentId !== undefined) goal.parentId = dto.parentId;
					if (dto.ownerMemberId !== undefined) goal.ownerMemberId = dto.ownerMemberId;
					if (dto.dueAt !== undefined) goal.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
					if (dto.state !== undefined) goal.state = dto.state;
					goal.version += 1;
					const saved = await this.repository.saveGoal(goal, ctx);
					const result = toGoalDto(saved);
					await this.recordGoalCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'goal.update',
						saved,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async createWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		dto: CreateAiDepartmentWorkDto,
	) {
		if (dto.reviewPolicy === 'automatic' && dto.reviewStages !== undefined) {
			throw new UserError('Automatic review cannot define reviewer stages.');
		}
		if (dto.reviewStages?.some((stage) => stage.reviewers.kind === 'members')) {
			throw new UserError(
				'Agent reviewers are unavailable until their review context is verified.',
			);
		}
		const input = {
			departmentId,
			instruction: dto.instruction.trim(),
			goalId: dto.goalId ?? null,
			assigneeMemberId: dto.assigneeMemberId ?? null,
			priority: dto.priority,
			dueAt: dto.dueAt ?? null,
			reviewPolicy: dto.reviewPolicy,
			reviewStagesJson:
				dto.reviewPolicy === 'automatic'
					? null
					: JSON.stringify(
							dto.reviewStages ?? [
								{
									id: 'human-review',
									reviewers: { kind: 'authorized_writers' },
									actorFilter: 'human_only',
								},
							],
						),
			currentReviewStageIndex: 0,
			reviewPolicyRevision: 1,
		};
		const hash = payloadHash(input);
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkItemDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					await this.validateWorkReferences(
						projectId,
						departmentId,
						input.goalId,
						input.assigneeMemberId,
						ctx,
					);
					const work = Object.assign(new WorkItem(), {
						id: randomUUID(),
						projectId,
						...input,
						assignedByUserId: input.assigneeMemberId ? actorId : null,
						reviewPolicyRevisionId: randomUUID(),
						dueAt: input.dueAt ? new Date(input.dueAt) : null,
						state: 'backlog',
						currentAttemptId: null,
						version: 1,
					});
					const saved = await this.repository.saveWork(work, ctx);
					await this.repository.saveReviewPolicyRevision(
						Object.assign(new WorkReviewPolicyRevision(), {
							id: saved.reviewPolicyRevisionId,
							projectId,
							departmentId,
							workId: saved.id,
							revision: saved.reviewPolicyRevision,
							mode: saved.reviewPolicy,
							stagesJson: saved.reviewStagesJson ?? '[]',
							createdByUserId: actorId,
							createdAt: new Date(),
						}),
						ctx,
					);
					await this.repository.addTransition(
						this.transition(projectId, departmentId, saved, null, 'backlog', actorId, 'user'),
						ctx,
					);
					const result = toWorkDto(saved);
					await this.recordWorkCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.create',
						saved,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async lookupCreateCommand(projectId: string, actorId: string, requestId: string) {
		return await this.txRunner.run({}, async (ctx) => {
			const receipt = await this.repository.findCreateCommandReceipt(
				projectId,
				actorId,
				requestId,
				ctx,
			);
			if (!receipt) return { kind: 'absent' as const };
			if (
				receipt.operation !== 'work.create' ||
				receipt.status !== 'completed' ||
				!receipt.responseJson
			)
				return { kind: 'conflict' as const };

			let result: AiDepartmentWorkItemDto;
			try {
				result = aiDepartmentWorkItemDtoSchema.parse(JSON.parse(receipt.responseJson));
			} catch {
				return { kind: 'conflict' as const };
			}
			if (result.projectId !== projectId) return { kind: 'conflict' as const };
			const work = await this.repository.findWork(projectId, result.departmentId, result.id, ctx);
			if (!work || work.departmentId !== result.departmentId) return { kind: 'conflict' as const };

			return {
				kind: 'found' as const,
				work: { id: work.id, projectId: work.projectId, departmentId: work.departmentId },
				payloadHash: receipt.payloadHash,
			};
		});
	}

	async validateMeetingReferences(
		projectId: string,
		departmentId: string,
		goalId: string | null,
		workIds: string[],
		ctx: OperationContext = {},
	) {
		if (goalId && !(await this.repository.findGoal(projectId, departmentId, goalId, ctx)))
			throw new UserError('The meeting goal must belong to this department.');
		for (const workId of workIds) {
			if (!(await this.repository.findWork(projectId, departmentId, workId, ctx)))
				throw new UserError('Meeting work references must belong to this department.');
		}
	}

	async listWork(
		projectId: string,
		departmentId: string,
		filter: {
			state?: AiDepartmentWorkState;
			goalId?: string;
			assigneeMemberId?: string;
			search?: string;
			take: number;
			skip: number;
		},
	) {
		await this.requireDepartment(projectId, departmentId);
		const result = await this.repository.listWork(projectId, departmentId, filter);
		return { data: result.data.map(toWorkDto), count: result.count };
	}

	async getWork(projectId: string, departmentId: string, workId: string) {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		const dto = toWorkDto(work);
		const children = await this.repository.listChildrenForParent(projectId, departmentId, workId);
		const childReports = await Promise.all(
			children.map(async (child) => ({
				workId: child.id,
				state: child.state,
				report:
					child.state === 'done'
						? await this.repository.findLatestAcceptedReport(projectId, departmentId, child.id)
						: null,
			})),
		);
		return { ...dto, childReports };
	}

	private async resumeParentsAfterChildTerminal(child: WorkItem, ctx: OperationContext) {
		const parents = await this.repository.findChildrenWaitingOnParent(
			child.projectId,
			child.departmentId,
			child.id,
			ctx,
		);
		for (const parent of parents) {
			await this.releases.resumeWaitingParent(
				parent.projectId,
				parent.departmentId,
				parent.id,
				ctx,
			);
		}
	}

	async getCurrentClaim(
		projectId: string,
		departmentId: string,
		workId: string,
	): Promise<AiDepartmentWorkClaimSummaryDto | null> {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		if (!work.currentAttemptId) return null;
		const claim = await this.repository.findClaim(projectId, work.currentAttemptId);
		if (!claim || claim.workId !== work.id || claim.departmentId !== departmentId) return null;
		const now = new Date();
		return {
			memberId: claim.memberId,
			leaseUntil: claim.leaseUntil.toISOString(),
			state: claim.releasedAt ? 'released' : claim.leaseUntil <= now ? 'expired' : 'active',
		};
	}

	async listRelationships(projectId: string, departmentId: string, workId: string) {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		return (await this.repository.listRelationships(projectId, departmentId, workId)).map(
			toWorkRelationshipDto,
		);
	}

	async createRelationship(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: CreateAiDepartmentWorkRelationshipDto,
	) {
		const hash = payloadHash({ departmentId, workId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkRelationshipDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.requireMutableRelationshipWork(
						projectId,
						departmentId,
						workId,
						dto.expectedVersion,
						ctx,
					);
					if (workId === dto.relatedWorkId)
						throw new UserError('Work cannot have a relationship with itself.');
					const related = await this.repository.findWork(
						projectId,
						departmentId,
						dto.relatedWorkId,
						ctx,
					);
					if (!related) throw new NotFoundError('Related work item not found.');
					if (
						(await this.repository.listRelationships(projectId, departmentId, workId, ctx)).some(
							(existing) =>
								existing.kind === dto.kind && existing.relatedWorkId === dto.relatedWorkId,
						)
					) {
						throw new ConflictError('Work relationship already exists.');
					}
					if (dto.kind === 'parent') {
						if (
							await this.repository.findParentRelationship(projectId, departmentId, workId, ctx)
						) {
							throw new ConflictError('Work already has a parent.');
						}

						const parents = new Map(
							(
								await this.repository.listRelationshipEdges(projectId, departmentId, 'parent', ctx)
							).map((edge) => [edge.workId, edge.relatedWorkId]),
						);
						let parentId: string | undefined = dto.relatedWorkId;
						const seen = new Set<string>([workId]);
						while (parentId) {
							if (seen.has(parentId)) throw new UserError('Work hierarchy cannot contain a cycle.');
							seen.add(parentId);
							parentId = parents.get(parentId);
						}
					} else if (
						await this.relationshipPathExists(
							projectId,
							departmentId,
							workId,
							dto.relatedWorkId,
							ctx,
						)
					) {
						throw new UserError('Work blockers cannot contain a cycle.');
					}
					const relationship = Object.assign(new WorkRelationship(), {
						id: randomUUID(),
						projectId,
						departmentId,
						workId,
						relatedWorkId: dto.relatedWorkId,
						kind: dto.kind,
					});
					const saved = await this.repository.saveRelationship(relationship, ctx);
					work.version += 1;
					await this.repository.saveWork(work, ctx);
					const result = toWorkRelationshipDto(saved);
					await this.recordRelationshipCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.relationship.create',
						work,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async deleteRelationship(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		relationshipId: string,
		dto: DeleteAiDepartmentWorkRelationshipDto,
	) {
		const hash = payloadHash({ departmentId, workId, relationshipId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkRelationshipDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.requireMutableRelationshipWork(
						projectId,
						departmentId,
						workId,
						dto.expectedVersion,
						ctx,
						true,
					);
					const relationship = await this.repository.findRelationship(
						projectId,
						departmentId,
						workId,
						relationshipId,
						ctx,
					);
					if (!relationship) throw new NotFoundError('Work relationship not found.');
					const result = toWorkRelationshipDto(relationship);
					await this.repository.removeRelationship(relationship, ctx);
					work.version += 1;
					await this.repository.saveWork(work, ctx);
					await this.recordRelationshipCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.relationship.delete',
						work,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async addUserWorkActivity(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: CreateAiDepartmentWorkActivityDto,
	): Promise<AiDepartmentWorkActivityResult> {
		dto = createAiDepartmentWorkActivitySchema.parse(dto);
		const hash = payloadHash({ departmentId, workId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkActivityResultSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (!work) throw new NotFoundError('Work item not found.');
					if (work.version !== dto.expectedVersion)
						throw new ConflictError('Work item has changed. Reload and try again.');

					work.version += 1;
					const savedWork = await this.repository.saveWork(work, ctx);
					const activity = Object.assign(new WorkActivity(), {
						id: randomUUID(),
						projectId,
						departmentId,
						workId,
						attemptId: savedWork.currentAttemptId,
						actorId,
						actorKind: 'user' as const,
						kind: dto.action,
						body: dto.body.trim(),
						workVersion: savedWork.version,
						createdAt: new Date(),
					});
					await this.repository.addActivity(activity, ctx);

					const result: AiDepartmentWorkActivityResult = {
						work: toWorkDto(savedWork),
						activity: {
							id: activity.id,
							workId: activity.workId,
							attemptId: activity.attemptId,
							actorId: activity.actorId,
							actorKind: activity.actorKind,
							kind: activity.kind,
							body: activity.body,
							report: null,
							workVersion: activity.workVersion,
							createdAt: activity.createdAt.toISOString(),
						},
					};
					await this.directory.saveReceipt(
						this.receipt(projectId, actorId, dto.requestId, hash, `work.${dto.action}`, result),
						ctx,
					);
					return result;
				}),
		);
	}

	async listActivity(
		projectId: string,
		departmentId: string,
		workId: string,
		take: number,
		skip: number,
	) {
		await this.getWork(projectId, departmentId, workId);
		const [data, count] = await this.repository.listActivity(
			projectId,
			departmentId,
			workId,
			take,
			skip,
		);
		return {
			data: data.map((entry) => {
				return {
					id: entry.id,
					workId: entry.workId,
					attemptId: entry.attemptId,
					actorId: entry.actorId,
					actorKind: entry.actorKind,
					kind: entry.kind,
					body: entry.body,
					report: completionReportOf(entry),
					workVersion: entry.workVersion,
					createdAt: entry.createdAt.toISOString(),
				};
			}),
			count,
		};
	}

	async listDepartmentActivity(
		projectId: string,
		departmentId: string,
		take: number,
		skip: number,
	) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		const [data, count] = await this.repository.listDepartmentActivity(
			projectId,
			departmentId,
			take,
			skip,
		);
		return {
			data: data.map((entry) => ({
				id: entry.id,
				workId: entry.workId,
				attemptId: entry.attemptId,
				actorId: entry.actorId,
				actorKind: entry.actorKind,
				kind: entry.kind,
				body: entry.body,
				report: completionReportOf(entry),
				workVersion: entry.workVersion,
				createdAt: entry.createdAt.toISOString(),
			})),
			count,
		};
	}

	async listAttempts(projectId: string, departmentId: string, workId: string) {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		const attempts = await this.repository.listAttempts(projectId, workId);
		return await Promise.all(
			attempts.map(async (attempt): Promise<AiDepartmentWorkAttemptDto> => {
				const reviewRound = attempt.reviewRoundId
					? await this.repository.findReviewRound(projectId, workId, attempt.id)
					: null;
				let nativeToolApproval: AiDepartmentWorkAttemptDto['nativeToolApproval'] = 'not_pending';
				if (attempt.phase === 'suspended') {
					nativeToolApproval = 'unknown';
					if (attempt.ownerExecutionRef) {
						try {
							nativeToolApproval = await this.executor.nativeToolApproval({
								actorId: attempt.initiatingUserId,
								projectId: attempt.projectId,
								executorId: attempt.executorId,
								attemptId: attempt.id,
								ownerExecutionRef: attempt.ownerExecutionRef,
							});
						} catch {
							// Approval detail is supplemental; keep the authorized attempt history available.
						}
					}
				}
				return {
					id: attempt.id,
					workId: attempt.workId,
					submittedResultId: attempt.submittedResultId,
					reviewRoundId: attempt.reviewRoundId,
					reviewRoundVersion: reviewRound?.version ?? null,
					reviewActiveStageId: reviewRound?.activeStageId ?? null,
					reviewPolicyRevision: attempt.reviewPolicyRevision,
					ordinal: attempt.ordinal,
					memberId: attempt.memberId,
					provider: attempt.provider,
					executorId: attempt.executorId,
					phase: attempt.phase,
					nativeToolApproval,
					outcome: attempt.outcome,
					cancellationPending: attempt.cancelRequestedAt !== null && attempt.phase !== 'terminal',
					startedAt: attempt.startedAt?.toISOString() ?? null,
					finishedAt: attempt.finishedAt?.toISOString() ?? null,
					reviewRoundStatus: attempt.reviewRoundStatus ?? null,
				};
			}),
		);
	}

	async listToolApprovalAttention(projectId: string, departmentId: string) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		const { attempts, hasMore } = await this.repository.listSuspendedAttempts(
			projectId,
			departmentId,
		);
		const approvals = [];
		for (let index = 0; index < attempts.length; index += 10) {
			const batch = await Promise.all(
				attempts.slice(index, index + 10).map(async (attempt) => {
					if (!attempt.ownerExecutionRef) {
						return { attempt, state: 'unknown' as const };
					}
					try {
						const state = await this.executor.nativeToolApproval({
							actorId: attempt.initiatingUserId,
							projectId: attempt.projectId,
							executorId: attempt.executorId,
							attemptId: attempt.id,
							ownerExecutionRef: attempt.ownerExecutionRef,
						});
						return {
							attempt,
							state:
								state === 'pending'
									? ('pending' as const)
									: state === 'unknown'
										? ('unknown' as const)
										: null,
						};
					} catch {
						return { attempt, state: 'unknown' as const };
					}
				}),
			);
			approvals.push(...batch);
		}
		return {
			items: approvals.flatMap(({ attempt, state }) =>
				state
					? [
							{
								workId: attempt.workId,
								attemptId: attempt.id,
								memberId: attempt.memberId,
								ordinal: attempt.ordinal,
								state,
							},
						]
					: [],
			),
			hasMore,
		};
	}

	async getWakeStatus(
		projectId: string,
		departmentId: string,
		workId: string,
	): Promise<AiDepartmentWorkWakeStatus> {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		const wake = await this.repository.findWakeIntent(projectId, departmentId, workId);
		return {
			state: wake ? (wake.deliveredAt ? 'delivered' : 'pending') : null,
			createdAt: wake?.createdAt.toISOString() ?? null,
			deliveredAt: wake?.deliveredAt?.toISOString() ?? null,
		};
	}

	async getWorkHistory(projectId: string, departmentId: string, workId: string) {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		return await this.repository.listTransitions(projectId, departmentId, workId);
	}

	async listReviewDecisions(
		projectId: string,
		departmentId: string,
		workId: string,
	): Promise<AiDepartmentWorkReviewDecisionDto[]> {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		const { legacy, staged } = await this.repository.listWorkReviewDecisions(
			projectId,
			departmentId,
			workId,
		);
		return [
			...legacy.map(
				(decision): AiDepartmentWorkReviewDecisionDto => ({
					id: decision.id,
					workId: decision.workId,
					reviewRoundId: decision.reviewRoundId ?? decision.attemptId,
					stageId: decision.stageId ?? 'human-review',
					resultId: decision.resultId ?? decision.attemptId,
					actorId: decision.actorId,
					actorKind: 'user',
					decision: decision.decision,
					reason: decision.reason,
					priorVersion: decision.priorVersion,
					createdAt: decision.createdAt.toISOString(),
				}),
			),
			...staged.map(
				(decision): AiDepartmentWorkReviewDecisionDto => ({
					id: decision.id,
					workId: decision.workId,
					reviewRoundId: decision.roundId,
					stageId: decision.stageId,
					resultId: decision.resultId,
					actorId: decision.actorId,
					actorKind: decision.actorKind,
					decision: decision.decision,
					reason: decision.reason,
					priorVersion: decision.priorVersion,
					createdAt: decision.createdAt.toISOString(),
				}),
			),
		].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	}

	async reviewWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: ReviewAiDepartmentWorkDto,
	): Promise<AiDepartmentReviewResult> {
		if (dto.decision === 'return' && !dto.reason?.trim())
			throw new UserError('A reason is required when work is returned.');
		const hash = payloadHash({ departmentId, workId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const prior = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentReviewResultSchema,
					);
					if (prior) return prior;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (!work) throw new NotFoundError('Work item not found.');
					if (work.version !== dto.expectedVersion)
						throw new ConflictError('Work item has changed. Reload and try again.');
					if (work.state !== 'review' || work.currentAttemptId !== dto.attemptId)
						throw new ConflictError('Only the current result can be reviewed.');
					const attempt = await this.repository.findAttempt(projectId, dto.attemptId, ctx);
					if (
						!attempt ||
						attempt.phase !== 'terminal' ||
						!(await this.repository.hasSubmittedResult(projectId, work.id, attempt.id, ctx))
					)
						throw new ConflictError('The current attempt has no successful result to review.');
					let reviewRoundId: string | null = null;
					let stageId: string | null = null;
					let resultId: string | null = null;
					let round: WorkReviewRound | null = null;
					let stage: z.infer<typeof aiDepartmentReviewStageSchema> | null = null;
					let isFinalAccept = dto.decision === 'accept';
					if (
						attempt.reviewPolicy === 'required' &&
						attempt.submittedResultId &&
						attempt.reviewRoundId
					) {
						const [submittedResult, policyRevision] = await Promise.all([
							this.repository.findSubmittedResult(
								projectId,
								work.id,
								attempt.submittedResultId,
								ctx,
							),
							attempt.reviewPolicyRevisionId
								? this.repository.findReviewPolicyRevision(
										projectId,
										work.id,
										attempt.reviewPolicyRevision,
										ctx,
									)
								: null,
						]);
						round = await this.repository.findReviewRound(projectId, work.id, attempt.id, ctx);
						if (!submittedResult || !policyRevision || !round || round.status !== 'open')
							throw new ConflictError('The current review round is no longer open.');
						const stages = z
							.array(aiDepartmentReviewStageSchema)
							.min(1)
							.parse(JSON.parse(policyRevision.stagesJson));
						stage = stages.find((candidate) => candidate.id === round!.activeStageId) ?? null;
						if (!stage) throw new ConflictError('The active review stage is no longer valid.');
						if (
							dto.resultId !== submittedResult.id ||
							dto.reviewRoundId !== round.id ||
							dto.stageId !== stage.id ||
							dto.expectedReviewVersion !== round.version
						)
							throw new ConflictError(
								'The review stage or result has changed. Reload and try again.',
							);
						if (stage.actorFilter === 'not_creator' && actorId === round.requesterId)
							throw new ForbiddenError('The review requester cannot review this result.');
						if (stage.reviewers.kind === 'users' && !stage.reviewers.userIds.includes(actorId))
							throw new ForbiddenError('You are not an eligible reviewer for this stage.');
						if (stage.reviewers.kind === 'members')
							throw new ConflictError(
								'Agent review is unavailable until its review context is verified.',
							);
						reviewRoundId = round.id;
						stageId = stage.id;
						resultId = submittedResult.id;
						isFinalAccept = dto.decision === 'accept' && stages.at(-1)?.id === stage.id;
					} else if (attempt.reviewPolicy === 'required') {
						const legacyStages = attempt.reviewStagesJson
							? z
									.array(aiDepartmentReviewStageSchema)
									.min(1)
									.parse(JSON.parse(attempt.reviewStagesJson))
							: [
									{
										id: 'human-review',
										reviewers: { kind: 'authorized_writers' as const },
										actorFilter: 'human_only' as const,
									},
								];
						if (legacyStages.length !== 1)
							throw new ConflictError('Legacy review identity does not identify one stage.');
						stage = legacyStages[0];
						if (
							(dto.resultId !== undefined && dto.resultId !== attempt.id) ||
							(dto.reviewRoundId !== undefined && dto.reviewRoundId !== attempt.id) ||
							(dto.stageId !== undefined && dto.stageId !== stage.id) ||
							(dto.expectedReviewVersion !== undefined &&
								dto.expectedReviewVersion !== work.version)
						)
							throw new ConflictError(
								'The legacy review result has changed. Reload and try again.',
							);
						if (stage.actorFilter === 'not_creator' && actorId === attempt.initiatingUserId)
							throw new ForbiddenError('The review requester cannot review this result.');
						if (stage.reviewers.kind === 'users' && !stage.reviewers.userIds.includes(actorId))
							throw new ForbiddenError('You are not an eligible reviewer for this stage.');
						if (stage.reviewers.kind === 'members')
							throw new ConflictError(
								'Agent review is unavailable until its review context is verified.',
							);
						reviewRoundId = attempt.id;
						stageId = stage.id;
						resultId = attempt.id;
					} else {
						throw new ConflictError('Automatic review does not accept human verdicts.');
					}
					const event =
						dto.decision === 'return' || isFinalAccept
							? dto.decision === 'accept'
								? 'review_accepted'
								: 'review_returned'
							: null;
					const fromState = work.state;
					if (event) work.state = transitionWorkState(work.state, event, false);
					if (round && stage) {
						const policyRevision = await this.repository.findReviewPolicyRevision(
							projectId,
							work.id,
							attempt.reviewPolicyRevision,
							ctx,
						);
						const stages = z
							.array(aiDepartmentReviewStageSchema)
							.min(1)
							.parse(JSON.parse(policyRevision!.stagesJson));
						const nextStage =
							stages[stages.findIndex((candidate) => candidate.id === stage.id) + 1];
						round.version += 1;
						round.activeStageId = dto.decision === 'accept' && !isFinalAccept ? nextStage.id : null;
						if (event) {
							round.status = dto.decision === 'accept' ? 'accepted' : 'returned';
							round.closedAt = new Date();
						}
						await this.repository.saveReviewRound(round, ctx);
						attempt.reviewRoundStatus = round.status;
						attempt.reviewRoundClosedAt = round.closedAt;
						await this.repository.saveAttempt(attempt, ctx);
						await this.repository.saveReviewStageDecision(
							Object.assign(new WorkReviewStageDecision(), {
								id: randomUUID(),
								projectId,
								departmentId,
								workId,
								roundId: round.id,
								stageId: stage.id,
								resultId: attempt.submittedResultId!,
								actorKind: 'user',
								actorId,
								decision: dto.decision,
								reason: dto.reason?.trim() || null,
								priorVersion: dto.expectedReviewVersion,
								commandId: dto.requestId,
								createdAt: new Date(),
							}),
							ctx,
						);
					}
					if (dto.decision === 'return') work.currentReviewStageIndex = 0;
					if (dto.decision === 'accept' && !isFinalAccept) work.currentReviewStageIndex += 1;
					work.version += 1;
					const saved = await this.repository.saveWork(work, ctx);
					if (event) {
						await this.repository.addTransition(
							this.transition(
								projectId,
								departmentId,
								saved,
								fromState,
								saved.state,
								actorId,
								'user',
								dto.reason ?? null,
							),
							ctx,
						);
					}
					if (!round)
						await this.repository.addReviewDecision(
							Object.assign(new WorkReviewDecision(), {
								id: randomUUID(),
								projectId,
								departmentId,
								workId,
								attemptId: attempt.id,
								reviewRoundId,
								stageId,
								resultId,
								actorId,
								decision: dto.decision,
								reason: dto.reason?.trim() || null,
								priorVersion: dto.expectedVersion,
								createdAt: new Date(),
							}),
							ctx,
						);
					if (dto.decision === 'return')
						await this.enqueueWorkWake(saved, actorId, dto.requestId, ctx);
					if (isFinalAccept) {
						await this.resumeParentsAfterChildTerminal(saved, ctx);
					}
					const savedReviewStages = saved.reviewStagesJson
						? z.array(aiDepartmentReviewStageSchema).parse(JSON.parse(saved.reviewStagesJson))
						: [];
					const activeStage = savedReviewStages[saved.currentReviewStageIndex];
					const actorCanReviewActiveStage =
						!activeStage ||
						((activeStage.actorFilter !== 'not_creator' || actorId !== attempt.initiatingUserId) &&
							(activeStage.reviewers.kind === 'authorized_writers' ||
								(activeStage.reviewers.kind === 'users' &&
									activeStage.reviewers.userIds.includes(actorId))));
					const result: AiDepartmentReviewResult = {
						work: toWorkDto(saved),
						decision: dto.decision,
						attemptId: attempt.id,
						resultId: resultId ?? attempt.id,
						reviewRoundId: reviewRoundId ?? attempt.id,
						activeStageId: activeStage?.id ?? null,
						reviewVersion: round?.version ?? saved.version,
						reviewPolicyRevision: attempt.reviewPolicyRevision,
						allowedActions:
							saved.state === 'review' && actorCanReviewActiveStage ? ['accept', 'return'] : [],
						roundStatus: attempt.reviewRoundStatus ?? null,
					};
					await this.recordWorkCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.review',
						saved,
						result.work,
						ctx,
					);
					const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
					if (receipt) {
						receipt.responseJson = JSON.stringify(result);
						await this.directory.saveReceipt(receipt, ctx);
					}
					return result;
				}),
		);
	}

	async reopenReview(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: ReopenAiDepartmentWorkReviewDto,
	): Promise<AiDepartmentWorkReviewReopenResult> {
		const hash = payloadHash({ departmentId, workId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const prior = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkReviewReopenResultSchema,
					);
					if (prior) return prior;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (!work) throw new NotFoundError('Work item not found.');
					if (work.version !== dto.expectedVersion)
						throw new ConflictError('Work item has changed. Reload and try again.');
					if (work.state !== 'review' || !work.currentAttemptId)
						throw new ConflictError('Only work in review can be reopened.');
					const attempt = await this.repository.findAttempt(projectId, work.currentAttemptId, ctx);
					if (
						!attempt ||
						attempt.workId !== work.id ||
						attempt.phase !== 'terminal' ||
						!(await this.repository.hasSubmittedResult(projectId, work.id, attempt.id, ctx))
					)
						throw new ConflictError(
							'Review cannot be reopened before the current run is confirmed terminal.',
						);
					const claim = await this.repository.findClaim(projectId, attempt.id, ctx);
					if (claim && !claim.releasedAt) {
						throw new ConflictError(
							'Review cannot be reopened while the attempt still has an active claim.',
						);
					}
					const round = attempt.reviewRoundId
						? await this.repository.findReviewRound(projectId, work.id, attempt.id, ctx)
						: null;
					if (round) {
						if (round.status !== 'open')
							throw new ConflictError('Only an open review round can be reopened.');
						round.status = 'reopened';
						round.activeStageId = null;
						round.version += 1;
						round.closedAt = new Date();
						await this.repository.saveReviewRound(round, ctx);
					}
					attempt.reviewRoundStatus = 'reopened';
					attempt.reviewRoundClosedAt = new Date();
					await this.repository.saveAttempt(attempt, ctx);
					const fromState = work.state;
					work.state = transitionWorkState(work.state, 'review_returned', false);
					work.currentReviewStageIndex = 0;
					work.version += 1;
					const saved = await this.repository.saveWork(work, ctx);
					await this.repository.addTransition(
						this.transition(
							projectId,
							departmentId,
							saved,
							fromState,
							saved.state,
							actorId,
							'user',
							dto.reason,
						),
						ctx,
					);
					await this.enqueueWorkWake(saved, actorId, dto.requestId, ctx);
					const result: AiDepartmentWorkReviewReopenResult = {
						work: toWorkDto(saved),
						attemptId: attempt.id,
						reviewRoundId: round?.id ?? attempt.id,
						reviewPolicyRevision: attempt.reviewPolicyRevision,
						roundStatus: 'reopened',
					};
					await this.recordWorkCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.review.reopen',
						saved,
						result.work,
						ctx,
					);
					const receipt = await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx);
					if (receipt) {
						receipt.responseJson = JSON.stringify(result);
						await this.directory.saveReceipt(receipt, ctx);
					}
					return result;
				}),
		);
	}

	async updateWork(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: UpdateAiDepartmentWorkDto,
	) {
		const hash = payloadHash({ departmentId, workId, ...dto });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkItemDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (!work) throw new NotFoundError('Work item not found.');
					if (work.version !== dto.expectedVersion)
						throw new ConflictError('Work item has changed. Reload and try again.');
					if (!['backlog', 'ready'].includes(work.state)) {
						throw new ConflictError('Work can be edited only in backlog or ready state.');
					}
					if (
						work.currentAttemptId &&
						(await this.repository.findAttempt(projectId, work.currentAttemptId, ctx))?.phase !==
							'terminal'
					) {
						throw new ConflictError('Work cannot change while a wake or run is active.');
					}
					const goalId = dto.goalId === undefined ? work.goalId : dto.goalId;
					const assigneeId =
						dto.assigneeMemberId === undefined ? work.assigneeMemberId : dto.assigneeMemberId;
					await this.validateWorkReferences(projectId, departmentId, goalId, assigneeId, ctx);
					const previousReviewPolicy = work.reviewPolicy;
					const previousReviewStagesJson = work.reviewStagesJson;
					const nextReviewPolicy = dto.reviewPolicy ?? previousReviewPolicy;
					if (dto.reviewStages !== undefined && nextReviewPolicy === 'automatic') {
						throw new UserError('Automatic review cannot define reviewer stages.');
					}
					if (dto.reviewStages?.some((stage) => stage.reviewers.kind === 'members')) {
						throw new UserError(
							'Agent reviewers are unavailable until their review context is verified.',
						);
					}
					const nextReviewStagesJson =
						dto.reviewStages !== undefined
							? JSON.stringify(dto.reviewStages)
							: nextReviewPolicy !== previousReviewPolicy
								? nextReviewPolicy === 'automatic'
									? null
									: (previousReviewStagesJson ??
										JSON.stringify([
											{
												id: 'human-review',
												reviewers: { kind: 'authorized_writers' },
												actorFilter: 'human_only',
											},
										]))
								: previousReviewStagesJson;
					const reviewPolicyChanged =
						nextReviewPolicy !== previousReviewPolicy ||
						nextReviewStagesJson !== previousReviewStagesJson;
					if (
						reviewPolicyChanged &&
						work.state === 'ready' &&
						(await this.repository.findPendingEligibilityForWork(projectId, work.id, ctx))
					) {
						throw new ConflictError('Review policy cannot change while work has pending dispatch.');
					}
					const priorAssigneeMemberId = work.assigneeMemberId;
					if (dto.instruction !== undefined) work.instruction = dto.instruction.trim();
					if (dto.goalId !== undefined) work.goalId = dto.goalId;
					if (dto.assigneeMemberId !== undefined) {
						work.assigneeMemberId = dto.assigneeMemberId;
						if (dto.assigneeMemberId !== priorAssigneeMemberId) {
							work.assignedByUserId = dto.assigneeMemberId ? actorId : null;
						}
					}
					if (dto.priority !== undefined) work.priority = dto.priority;
					if (dto.dueAt !== undefined) work.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
					work.reviewPolicy = nextReviewPolicy;
					if (reviewPolicyChanged) {
						work.reviewStagesJson = nextReviewStagesJson;
						work.currentReviewStageIndex = 0;
						work.reviewPolicyRevision += 1;
						work.reviewPolicyRevisionId = randomUUID();
					}
					work.version += 1;
					const saved = await this.repository.saveWork(work, ctx);
					if (reviewPolicyChanged) {
						await this.repository.saveReviewPolicyRevision(
							Object.assign(new WorkReviewPolicyRevision(), {
								id: saved.reviewPolicyRevisionId,
								projectId,
								departmentId,
								workId: saved.id,
								revision: saved.reviewPolicyRevision,
								mode: saved.reviewPolicy,
								stagesJson: saved.reviewStagesJson ?? '[]',
								createdByUserId: actorId,
								createdAt: new Date(),
							}),
							ctx,
						);
					}
					if (
						saved.state === 'ready' &&
						dto.assigneeMemberId !== undefined &&
						dto.assigneeMemberId !== priorAssigneeMemberId
					) {
						await this.repository.cancelPendingEligibility(projectId, workId, ctx);
						await this.repository.markPendingWakesDelivered(workId, ctx);
						if (saved.assigneeMemberId)
							await this.enqueueWorkWake(saved, actorId, dto.requestId, ctx);
					}
					const result = toWorkDto(saved);
					await this.recordWorkCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.update',
						saved,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	async markReady(
		projectId: string,
		actorId: string,
		departmentId: string,
		workId: string,
		dto: UpdateAiDepartmentWorkStateDto,
	) {
		const hash = payloadHash({
			departmentId,
			workId,
			expectedVersion: dto.expectedVersion,
			action: 'ready',
		});
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const previous = replayReceipt(
						await this.directory.findReceipt(projectId, actorId, dto.requestId, ctx),
						hash,
						aiDepartmentWorkItemDtoSchema,
					);
					if (previous) return previous;
					await this.requireActiveDepartment(projectId, departmentId, ctx);
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (!work) throw new NotFoundError('Work item not found.');
					if (work.version !== dto.expectedVersion)
						throw new ConflictError('Work item has changed. Reload and try again.');
					if (work.state !== 'backlog')
						throw new ConflictError('Only backlog work can be marked ready.');
					if (!work.assigneeMemberId)
						throw new UserError('Assign this work to an active department member first.');
					const assignee = await this.repository.findMember(
						projectId,
						departmentId,
						work.assigneeMemberId,
						ctx,
					);
					if (!assignee || assignee.archived)
						throw new UserError('Assign this work to an active department member first.');
					if (await this.repository.hasUnresolvedBlockers(projectId, departmentId, workId, ctx)) {
						throw new ConflictError('Resolve all blocking work before marking this item ready.');
					}
					const fromState = work.state;
					work.state = transitionWorkState(work.state, 'ready', false);
					work.version += 1;
					const saved = await this.repository.saveWork(work, ctx);
					await this.repository.addTransition(
						this.transition(
							projectId,
							departmentId,
							saved,
							fromState,
							saved.state,
							actorId,
							'user',
							dto.reason ?? null,
						),
						ctx,
					);
					await this.enqueueWorkWake(saved, actorId, dto.requestId, ctx);
					const result = toWorkDto(saved);
					await this.recordWorkCommand(
						projectId,
						actorId,
						dto.requestId,
						hash,
						'work.ready',
						saved,
						result,
						ctx,
					);
					return result;
				}),
		);
	}

	private async enqueueWorkWake(
		work: WorkItem,
		actorId: string,
		sourceRequestId: string,
		ctx: OperationContext,
	) {
		const wakeKey = randomUUID();
		await this.createEligibility(work, actorId, sourceRequestId, ctx);
		await this.repository.saveWakeIntent(
			Object.assign(new WorkWakeIntent(), {
				workId: work.id,
				projectId: work.projectId,
				departmentId: work.departmentId,
				actorId,
				requestId: wakeKey,
				createdAt: new Date(),
				deliveredAt: null,
			}),
			ctx,
		);
	}

	private async createEligibility(
		work: WorkItem,
		actorId: string,
		requestId: string,
		ctx: OperationContext,
	) {
		if (!work.assigneeMemberId) throw new UserError('Assign this work to an active member first.');
		const member = await this.repository.findMember(
			work.projectId,
			work.departmentId,
			work.assigneeMemberId,
			ctx,
		);
		if (!member || member.archived)
			throw new UserError('Assign this work to an active member first.');
		const binding = await this.directory.findBinding(work.projectId, member.id, ctx);
		const eligibleAt = new Date();
		const laneGeneration = binding
			? await this.repository.advanceWakeLane(
					{
						projectId: work.projectId,
						memberId: member.id,
						actorId,
						bindingVersion: binding.version,
					},
					eligibleAt,
					ctx,
				)
			: 0;
		return await this.repository.saveEligibility(
			Object.assign(new WorkEligibility(), {
				workId: work.id,
				generation: await this.repository.nextEligibilityGeneration(work.id, ctx),
				projectId: work.projectId,
				departmentId: work.departmentId,
				memberId: member.id,
				actorId,
				bindingVersion: binding?.version ?? null,
				laneGeneration,
				requestId,
				state: 'pending',
				eligibleAt,
				consumedAt: null,
				createdAt: eligibleAt,
			}),
			ctx,
		);
	}

	private async prepareEligibilityForDispatch(
		projectId: string,
		actorId: string,
		work: WorkItem,
		requestId: string,
		fromWake: boolean,
		ctx: OperationContext,
	) {
		if (fromWake) {
			const existing = await this.repository.findPendingEligibilityForWork(projectId, work.id, ctx);
			if (existing) {
				if (existing.workId !== work.id || existing.state !== 'pending')
					throw new ConflictError('This work eligibility is no longer pending.');
				return existing;
			}
			return await this.createEligibility(work, actorId, requestId, ctx);
		}
		await this.repository.cancelPendingEligibility(projectId, work.id, ctx);
		await this.repository.markPendingWakesDelivered(work.id, ctx);
		return await this.createEligibility(work, actorId, requestId, ctx);
	}

	private async requireDepartment(projectId: string, departmentId: string) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department) throw new NotFoundError('Department not found.');
		return department;
	}

	private async requireActiveDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	) {
		const department = await this.repository.findDepartment(projectId, departmentId, ctx);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		return department;
	}

	private async validateGoalReferences(
		projectId: string,
		departmentId: string,
		parentId: string | null,
		ownerMemberId: string | null,
		ctx: OperationContext,
		goalId?: string,
	) {
		if (parentId) {
			if (parentId === goalId) throw new UserError('A goal cannot be its own parent.');
			const parent = await this.repository.findGoal(projectId, departmentId, parentId, ctx);
			if (!parent || parent.state === 'archived')
				throw new UserError('Parent goal must be active in this department.');
			const seen = new Set<string>(goalId ? [goalId] : []);
			let cursor: DepartmentGoal | null = parent;
			while (cursor) {
				if (seen.has(cursor.id)) throw new UserError('Goal hierarchy cannot contain a cycle.');
				seen.add(cursor.id);
				cursor = cursor.parentId
					? await this.repository.findGoal(projectId, departmentId, cursor.parentId, ctx)
					: null;
			}
		}
		if (ownerMemberId) {
			const owner = await this.repository.findMember(projectId, departmentId, ownerMemberId, ctx);
			if (!owner || owner.archived)
				throw new UserError('Goal owner must be an active member of this department.');
		}
	}

	private async validateWorkReferences(
		projectId: string,
		departmentId: string,
		goalId: string | null,
		assigneeMemberId: string | null,
		ctx: OperationContext,
	) {
		if (goalId) {
			const goal = await this.repository.findGoal(projectId, departmentId, goalId, ctx);
			if (!goal || goal.state !== 'active')
				throw new UserError('Goal must be active in this department.');
		}
		if (assigneeMemberId) {
			const member = await this.repository.findMember(
				projectId,
				departmentId,
				assigneeMemberId,
				ctx,
			);
			if (!member || member.archived)
				throw new UserError('Assignee must be an active member of this department.');
		}
	}

	private async requireMutableRelationshipWork(
		projectId: string,
		departmentId: string,
		workId: string,
		expectedVersion: number,
		ctx: OperationContext,
		allowCancelled = false,
	) {
		const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
		if (!work) throw new NotFoundError('Work item not found.');
		if (work.version !== expectedVersion)
			throw new ConflictError('Work item has changed. Reload and try again.');
		if (
			work.state !== 'backlog' &&
			work.state !== 'ready' &&
			!(allowCancelled && work.state === 'cancelled')
		)
			throw new ConflictError('Relationships can only change before work starts.');
		if (
			work.currentAttemptId &&
			(await this.repository.findAttempt(projectId, work.currentAttemptId, ctx))?.phase !==
				'terminal'
		)
			throw new ConflictError('Relationships cannot change while a wake or run is active.');
		return work;
	}

	private async relationshipPathExists(
		projectId: string,
		departmentId: string,
		startId: string,
		targetId: string,
		ctx: OperationContext,
	) {
		const edges = await this.repository.listRelationshipEdges(
			projectId,
			departmentId,
			'blocks',
			ctx,
		);
		const blockers = new Map<string, string[]>();
		for (const edge of edges) {
			const ids = blockers.get(edge.relatedWorkId) ?? [];
			ids.push(edge.workId);
			blockers.set(edge.relatedWorkId, ids);
		}
		const pending = [startId];
		const visited = new Set<string>();
		while (pending.length) {
			const id = pending.pop();
			if (!id || visited.has(id)) continue;
			if (id === targetId) return true;
			visited.add(id);
			pending.push(...(blockers.get(id) ?? []));
		}
		return false;
	}

	private transition(
		projectId: string,
		departmentId: string,
		work: WorkItem,
		fromState: WorkItem['state'] | null,
		toState: WorkItem['state'],
		actorId: string | null,
		actorKind: WorkTransition['actorKind'],
		reason: string | null = null,
	) {
		return Object.assign(new WorkTransition(), {
			id: randomUUID(),
			projectId,
			departmentId,
			workId: work.id,
			attemptId: work.currentAttemptId,
			actorId,
			actorKind,
			fromState,
			toState,
			reason,
			workVersion: work.version,
			createdAt: new Date(),
		});
	}

	private async recordGoalCommand(
		projectId: string,
		actorId: string,
		requestId: string,
		hash: string,
		operation: string,
		goal: DepartmentGoal,
		result: AiDepartmentGoalDto,
		ctx: OperationContext,
	) {
		await this.directory.saveChange(
			Object.assign(new DirectoryChange(), {
				id: randomUUID(),
				projectId,
				actorId,
				entityType: 'goal',
				entityId: goal.id,
				action: operation === 'goal.create' ? 'created' : 'updated',
				entityVersion: goal.version,
				createdAt: new Date(),
			}),
			ctx,
		);
		await this.directory.saveReceipt(
			this.receipt(projectId, actorId, requestId, hash, operation, result),
			ctx,
		);
	}

	private async recordWorkCommand(
		projectId: string,
		actorId: string,
		requestId: string,
		hash: string,
		operation: string,
		work: WorkItem,
		result: AiDepartmentWorkItemDto,
		ctx: OperationContext,
	) {
		await this.directory.saveChange(
			Object.assign(new DirectoryChange(), {
				id: randomUUID(),
				projectId,
				actorId,
				entityType: 'work_item',
				entityId: work.id,
				action: operation === 'work.create' ? 'created' : 'updated',
				entityVersion: work.version,
				createdAt: new Date(),
			}),
			ctx,
		);
		await this.repository.addActivity(
			Object.assign(new WorkActivity(), {
				id: randomUUID(),
				projectId,
				departmentId: work.departmentId,
				workId: work.id,
				attemptId: work.currentAttemptId,
				actorId,
				actorKind: 'user',
				kind: operation,
				body: null,
				workVersion: work.version,
				createdAt: new Date(),
			}),
			ctx,
		);
		await this.directory.saveReceipt(
			this.receipt(projectId, actorId, requestId, hash, operation, result),
			ctx,
		);
	}

	private async recordRelationshipCommand(
		projectId: string,
		actorId: string,
		requestId: string,
		hash: string,
		operation: string,
		work: WorkItem,
		result: AiDepartmentWorkRelationshipDto,
		ctx: OperationContext,
	) {
		await this.directory.saveChange(
			Object.assign(new DirectoryChange(), {
				id: randomUUID(),
				projectId,
				actorId,
				entityType: 'work_relationship',
				entityId: result.id,
				action: operation.endsWith('.create') ? 'created' : 'archived',
				entityVersion: work.version,
				createdAt: new Date(),
			}),
			ctx,
		);
		await this.directory.saveReceipt(
			this.receipt(projectId, actorId, requestId, hash, operation, result),
			ctx,
		);
	}

	private receipt(
		projectId: string,
		actorId: string,
		requestId: string,
		hash: string,
		operation: string,
		result:
			| AiDepartmentGoalDto
			| AiDepartmentWorkItemDto
			| AiDepartmentWorkRelationshipDto
			| AiDepartmentWorkActivityResult,
	) {
		return Object.assign(new CommandReceipt(), {
			id: randomUUID(),
			projectId,
			actorId,
			requestId,
			payloadHash: hash,
			operation,
			status: 'completed',
			responseJson: JSON.stringify(result),
			createdAt: new Date(),
		});
	}
}
