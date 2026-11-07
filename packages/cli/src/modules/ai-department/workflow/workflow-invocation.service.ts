import type { AiDepartmentWorkflowCapabilitySnapshot } from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import {
	DepartmentExecutorProxy,
	DepartmentWorkflowInvocationOwnerProxy,
	DepartmentWorkflowInvocation,
	type DepartmentWorkflowInvocationAuthority,
	type DepartmentWorkflowInvocationRequest,
	type DepartmentWorkflowInvocationReservation,
} from '@/modules/agents/agent-department-execution.contracts';
import { AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED } from './workflow-invocation-gate';
import { WorkflowInvocation } from '../database/entities/workflow-invocation.entity';
import { WorkflowInvocationReceipt } from '../database/entities/workflow-invocation-receipt.entity';
import { WorkflowInvocationRepository } from '../database/repositories/workflow-invocation.repository';

type OwnerChildState = Parameters<DepartmentWorkflowInvocation['outcome']>[0]['childState'];

function invocationKey(
	authority: DepartmentWorkflowInvocationAuthority,
	request: DepartmentWorkflowInvocationRequest,
) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'ai-department-workflow-v1',
				authority.projectId,
				authority.attemptId,
				request.requestId,
				request.workflowId,
			]),
		)
		.digest('hex');
}

function isCapabilitySnapshot(value: unknown): value is AiDepartmentWorkflowCapabilitySnapshot {
	if (typeof value !== 'object' || value === null) return false;
	return (
		'id' in value &&
		typeof value.id === 'string' &&
		'workflowId' in value &&
		typeof value.workflowId === 'string' &&
		'version' in value &&
		typeof value.version === 'number' &&
		'purpose' in value &&
		typeof value.purpose === 'string' &&
		'publishedVersionRef' in value &&
		typeof value.publishedVersionRef === 'string' &&
		'triggerCompatibilityRef' in value &&
		typeof value.triggerCompatibilityRef === 'string' &&
		'inputSchemaFingerprint' in value &&
		typeof value.inputSchemaFingerprint === 'string'
	);
}

function parseSnapshots(value: string): AiDepartmentWorkflowCapabilitySnapshot[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	return parsed.every(isCapabilitySnapshot) ? parsed : null;
}

function sameOutcome(
	receipt: WorkflowInvocationReceipt,
	input: Parameters<DepartmentWorkflowInvocation['outcome']>[0],
) {
	return (
		receipt.invocationId === input.invocationId &&
		receipt.ownerSequence === input.ownerSequence &&
		receipt.childState === input.childState &&
		receipt.ownerExecutionRef === input.ownerExecutionRef &&
		(receipt.retryOfExecutionRef ?? null) === (input.retryOfExecutionRef ?? null) &&
		receipt.actualWorkflowVersion === input.actualWorkflowVersion &&
		receipt.safeResultReference === (input.safeResultReference ?? null) &&
		receipt.safeErrorReference === (input.safeErrorReference ?? null)
	);
}

function isTerminalChildState(state: WorkflowInvocation['childState']): boolean {
	return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

@Service()
export class WorkflowInvocationService extends DepartmentWorkflowInvocation {
	constructor(
		private readonly repository: WorkflowInvocationRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly owner: DepartmentWorkflowInvocationOwnerProxy,
	) {
		super();
	}

	async reserve(
		authority: DepartmentWorkflowInvocationAuthority,
		request: DepartmentWorkflowInvocationRequest,
	): Promise<DepartmentWorkflowInvocationReservation> {
		if (!AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED) {
			throw new ConflictError('Department workflow execution is not enabled.');
		}
		if (
			!request.requestId ||
			request.requestId.length > 128 ||
			!/^[a-f0-9]{64}$/.test(request.inputHash) ||
			!request.expectedWorkflowVersion ||
			request.expectedWorkflowVersion.length > 36
		) {
			throw new ConflictError('Workflow invocation identity is invalid.');
		}
		return await this.txRunner.run({}, async (ctx) => {
			const existing = await this.repository.findByAttemptRequestId(
				authority.attemptId,
				request.requestId,
				ctx,
			);
			const key = invocationKey(authority, request);
			if (existing) {
				if (
					existing.projectId !== authority.projectId ||
					existing.memberId !== authority.executorId ||
					existing.capabilityId !== request.capabilityId ||
					existing.capabilityVersion !== request.capabilityVersion ||
					existing.inputHash !== request.inputHash ||
					existing.ownerInvocationKey !== key
				) {
					throw new ConflictError('Workflow invocation key was reused with different input.');
				}
				await this.verifyAuthority(authority, request, ctx);
				return {
					invocationId: existing.id,
					ownerInvocationKey: key,
					inputsRef: existing.inputsRef,
					duplicate: true,
				};
			}

			const { attempt, work, claim, capability, revision } = await this.verifyAuthority(
				authority,
				request,
				ctx,
			);
			const now = new Date();
			const invocationId = randomUUID();
			const invocation = Object.assign(new WorkflowInvocation(), {
				id: invocationId,
				projectId: authority.projectId,
				workId: work.id,
				attemptId: attempt.id,
				memberId: attempt.memberId,
				capabilityId: capability.id,
				capabilityVersion: revision.version,
				claimGeneration: claim.claimGeneration,
				requestId: request.requestId,
				ownerInvocationKey: key,
				inputHash: request.inputHash,
				inputsRef: `ai-department-workflow-input:${invocationId}`,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				actualWorkflowVersion: null,
				ownerExecutionRef: null,
				dispatchState: 'pending' as const,
				childState: 'pending' as const,
				safeResultReference: null,
				safeErrorReference: null,
				version: 1,
				cancelRequestedAt: null,
				createdAt: now,
				updatedAt: now,
			});
			const inserted = await this.repository.insertIfAbsent(invocation, ctx);
			const persisted = await this.repository.findByAttemptRequestId(
				authority.attemptId,
				request.requestId,
				ctx,
			);
			if (!persisted) throw new ConflictError('Workflow invocation could not be reserved.');
			if (
				persisted.inputHash !== request.inputHash ||
				persisted.ownerInvocationKey !== key ||
				persisted.capabilityId !== request.capabilityId
			) {
				throw new ConflictError('Workflow invocation key was reused with different input.');
			}
			return {
				invocationId: persisted.id,
				ownerInvocationKey: key,
				inputsRef: persisted.inputsRef,
				duplicate: !inserted,
			};
		});
	}

	async accepted(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		actualWorkflowVersion: string;
		childState: Exclude<OwnerChildState, 'unknown'>;
	}) {
		await this.txRunner.run({}, async (ctx) => {
			const invocation = await this.repository.findInvocation(
				input.projectId,
				input.invocationId,
				ctx,
			);
			if (!invocation) throw new NotFoundError('Workflow invocation not found.');
			if (invocation.dispatchState === 'acknowledged') {
				if (
					invocation.ownerExecutionRef !== input.ownerExecutionRef ||
					invocation.actualWorkflowVersion !== input.actualWorkflowVersion
				) {
					throw new ConflictError('Workflow owner acceptance does not match the reservation.');
				}
				return;
			}
			if (invocation.expectedWorkflowVersion !== input.actualWorkflowVersion) {
				throw new ConflictError('Published workflow changed before owner acceptance.');
			}
			const updated = await this.repository.updateAtVersion(
				input.projectId,
				invocation.id,
				invocation.version,
				{
					dispatchState: 'acknowledged',
					childState: input.childState,
					ownerExecutionRef: input.ownerExecutionRef,
					actualWorkflowVersion: input.actualWorkflowVersion,
					version: invocation.version + 1,
					updatedAt: new Date(),
				},
				ctx,
			);
			if (!updated) throw new ConflictError('Workflow invocation changed before owner acceptance.');
		});
	}

	async unknown(input: { projectId: string; invocationId: string }) {
		await this.txRunner.run({}, async (ctx) => {
			const invocation = await this.repository.findInvocation(
				input.projectId,
				input.invocationId,
				ctx,
			);
			if (!invocation || invocation.dispatchState === 'acknowledged') return;
			const updated = await this.repository.updateAtVersion(
				input.projectId,
				invocation.id,
				invocation.version,
				{
					...(invocation.dispatchState === 'pending' ? { dispatchState: 'unknown' as const } : {}),
					childState: 'unknown',
					version: invocation.version + 1,
					updatedAt: new Date(),
				},
				ctx,
			);
			if (!updated)
				throw new ConflictError('Workflow invocation changed while marking it unknown.');
		});
	}

	async cancellationRequested(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
	}) {
		await this.txRunner.run({}, async (ctx) => {
			const invocation = await this.repository.findInvocation(
				input.projectId,
				input.invocationId,
				ctx,
			);
			if (!invocation) throw new NotFoundError('Workflow invocation not found.');
			if (
				invocation.ownerExecutionRef !== input.ownerExecutionRef ||
				invocation.dispatchState !== 'acknowledged'
			) {
				throw new ConflictError('Workflow cancellation does not match the accepted invocation.');
			}
			if (invocation.cancelRequestedAt || isTerminalChildState(invocation.childState)) return;
			const updated = await this.repository.updateAtVersion(
				input.projectId,
				invocation.id,
				invocation.version,
				{
					cancelRequestedAt: new Date(),
					version: invocation.version + 1,
					updatedAt: new Date(),
				},
				ctx,
			);
			if (!updated)
				throw new ConflictError('Workflow invocation changed while requesting cancellation.');
		});
	}

	async authorizeResultDelivery(input: {
		projectId: string;
		executorId: string;
		attemptId: string;
		invocationId: string;
		ownerExecutionRef: string;
	}) {
		await this.txRunner.run({}, async (ctx) => {
			const invocation = await this.repository.findInvocation(
				input.projectId,
				input.invocationId,
				ctx,
			);
			if (
				!invocation ||
				invocation.attemptId !== input.attemptId ||
				invocation.ownerExecutionRef !== input.ownerExecutionRef ||
				invocation.dispatchState !== 'acknowledged' ||
				!invocation.expectedWorkflowVersion
			) {
				throw new ForbiddenError('Workflow result is not authorized for this Agent attempt.');
			}
			const capability = await this.repository.findCapability(
				input.projectId,
				invocation.capabilityId,
				ctx,
			);
			if (!capability)
				throw new ForbiddenError('Workflow result is no longer authorized for delivery.');
			const { attempt } = await this.verifyAuthority(
				{
					projectId: input.projectId,
					executorId: input.executorId,
					attemptId: input.attemptId,
				},
				{
					capabilityId: invocation.capabilityId,
					capabilityVersion: invocation.capabilityVersion,
					workflowId: capability.workflowId,
					requestId: invocation.requestId,
					inputHash: invocation.inputHash,
					expectedWorkflowVersion: invocation.expectedWorkflowVersion,
				},
				ctx,
			);
			if (invocation.memberId !== attempt.memberId) {
				throw new ForbiddenError('Workflow result is not authorized for this Agent attempt.');
			}
		});
	}

	async reconcileOwnerAcceptance(take = 100): Promise<void> {
		const invocations = await this.repository.findNeedingOwnerReconciliation(take);
		for (const invocation of invocations) {
			if (!invocation.expectedWorkflowVersion) {
				await this.unknown({ projectId: invocation.projectId, invocationId: invocation.id });
				continue;
			}
			const ownerInput = {
				projectId: invocation.projectId,
				invocationId: invocation.id,
				ownerInvocationKey: invocation.ownerInvocationKey,
				inputHash: invocation.inputHash,
				expectedWorkflowVersion: invocation.expectedWorkflowVersion,
			};
			let ownerResult = await this.owner.lookup(ownerInput);
			if (ownerResult.kind !== 'accepted') {
				const capability = await this.repository.findCapability(
					invocation.projectId,
					invocation.capabilityId,
				);
				if (!capability) {
					await this.unknown({ projectId: invocation.projectId, invocationId: invocation.id });
					continue;
				}
				try {
					await this.verifyStoredAuthority(
						invocation,
						{
							capabilityId: invocation.capabilityId,
							capabilityVersion: invocation.capabilityVersion,
							workflowId: capability.workflowId,
							requestId: invocation.requestId,
							inputHash: invocation.inputHash,
							expectedWorkflowVersion: invocation.expectedWorkflowVersion,
						},
						{},
					);
				} catch (error) {
					if (
						!(error instanceof NotFoundError) &&
						!(error instanceof ConflictError) &&
						!(error instanceof ForbiddenError)
					) {
						throw error;
					}
					await this.unknown({ projectId: invocation.projectId, invocationId: invocation.id });
					continue;
				}
				ownerResult = await this.owner.recover(ownerInput);
			}
			if (ownerResult.kind === 'accepted') {
				await this.accepted({
					projectId: invocation.projectId,
					invocationId: invocation.id,
					ownerExecutionRef: ownerResult.ownerExecutionRef,
					actualWorkflowVersion: ownerResult.actualWorkflowVersion,
					childState: ownerResult.childState,
				});
			} else {
				await this.unknown({ projectId: invocation.projectId, invocationId: invocation.id });
			}
		}
	}

	async reconcileRequestedStops(take = 100): Promise<void> {
		const invocations = await this.repository.findNeedingStopReconciliation(take);
		for (const invocation of invocations) {
			if (!invocation.ownerExecutionRef || !invocation.expectedWorkflowVersion) continue;
			await this.owner.requestStop({
				projectId: invocation.projectId,
				invocationId: invocation.id,
				ownerExecutionRef: invocation.ownerExecutionRef,
				inputHash: invocation.inputHash,
				expectedWorkflowVersion: invocation.expectedWorkflowVersion,
			});
		}
	}

	async reconcileChildSnapshots(take = 100): Promise<void> {
		const invocations = await this.repository.findNeedingChildSnapshotReconciliation(take);
		for (const invocation of invocations) {
			if (!invocation.ownerExecutionRef || !invocation.expectedWorkflowVersion) continue;
			await this.owner.reconcileSnapshot({
				projectId: invocation.projectId,
				invocationId: invocation.id,
				ownerExecutionRef: invocation.ownerExecutionRef,
				inputHash: invocation.inputHash,
				expectedWorkflowVersion: invocation.expectedWorkflowVersion,
				knownChildState: invocation.childState,
			});
		}
	}

	async reconcileRevokedAuthority(take = 100): Promise<void> {
		const invocations = await this.repository.findNeedingAuthorityReconciliation(take);
		for (const invocation of invocations) {
			const capability = await this.repository.findCapability(
				invocation.projectId,
				invocation.capabilityId,
			);
			try {
				await this.verifyStoredAuthority(
					invocation,
					{
						capabilityId: invocation.capabilityId,
						capabilityVersion: invocation.capabilityVersion,
						workflowId: capability?.workflowId ?? '',
						requestId: invocation.requestId,
						inputHash: invocation.inputHash,
						expectedWorkflowVersion: invocation.expectedWorkflowVersion ?? '',
					},
					{},
				);
			} catch (error) {
				if (
					!(error instanceof NotFoundError) &&
					!(error instanceof ConflictError) &&
					!(error instanceof ForbiddenError)
				) {
					throw error;
				}
				if (!invocation.ownerExecutionRef) continue;
				await this.cancellationRequested({
					projectId: invocation.projectId,
					invocationId: invocation.id,
					ownerExecutionRef: invocation.ownerExecutionRef,
				});
			}
		}
	}

	async outcome(input: {
		projectId: string;
		invocationId: string;
		eventId: string;
		ownerSequence: string;
		occurredAt: string;
		childState: OwnerChildState;
		ownerExecutionRef: string;
		retryOfExecutionRef?: string;
		actualWorkflowVersion: string;
		safeResultReference?: string;
		safeErrorReference?: string;
	}) {
		if (!/^(0|[1-9]\d{0,19})$/.test(input.ownerSequence)) {
			throw new ConflictError('Workflow owner sequence is invalid.');
		}
		if (
			!input.eventId ||
			input.eventId.length > 36 ||
			input.ownerExecutionRef.length > 255 ||
			(input.retryOfExecutionRef?.length ?? 0) > 255 ||
			(input.childState === 'retrying' && !input.retryOfExecutionRef) ||
			input.actualWorkflowVersion.length > 36 ||
			(input.safeResultReference?.length ?? 0) > 255 ||
			(input.safeErrorReference?.length ?? 0) > 255
		) {
			throw new ConflictError('Workflow owner event is invalid.');
		}
		const ownerSequence = input.ownerSequence.padStart(20, '0');
		const occurredAt = new Date(input.occurredAt);
		if (!Number.isFinite(occurredAt.getTime()))
			throw new ConflictError('Workflow owner timestamp is invalid.');
		await this.txRunner.run({}, async (ctx) => {
			const invocation = await this.repository.findInvocation(
				input.projectId,
				input.invocationId,
				ctx,
			);
			if (!invocation) throw new NotFoundError('Workflow invocation not found.');
			const prior = await this.repository.findReceipt(input.eventId, ctx);
			if (prior) {
				if (!sameOutcome(prior, input)) throw new ConflictError('Workflow event ID was reused.');
				return;
			}
			if (
				invocation.dispatchState !== 'acknowledged' ||
				invocation.actualWorkflowVersion !== input.actualWorkflowVersion
			) {
				throw new ConflictError('Workflow owner event does not match the accepted invocation.');
			}
			const isRetry = invocation.ownerExecutionRef !== input.ownerExecutionRef;
			if (isRetry) {
				const knownExecution = await this.repository.hasReceiptForOwnerExecution(
					invocation.id,
					input.ownerExecutionRef,
					ctx,
				);
				if (knownExecution) return;
				if (input.retryOfExecutionRef !== invocation.ownerExecutionRef) {
					throw new ConflictError('Workflow retry does not match the accepted execution.');
				}
			} else if (
				input.retryOfExecutionRef &&
				input.retryOfExecutionRef === input.ownerExecutionRef
			) {
				throw new ConflictError('Workflow retry reference is invalid.');
			}
			const latest = await this.repository.findLatestReceipt(invocation.id, ctx);
			if (latest && BigInt(ownerSequence) <= BigInt(latest.ownerSequence)) return;
			if (
				latest &&
				isTerminalChildState(latest.childState) &&
				!isRetry &&
				!isTerminalChildState(input.childState)
			)
				return;
			const receipt = Object.assign(new WorkflowInvocationReceipt(), {
				eventId: input.eventId,
				invocationId: invocation.id,
				ownerSequence,
				childState: input.childState,
				ownerExecutionRef: input.ownerExecutionRef,
				retryOfExecutionRef: input.retryOfExecutionRef ?? null,
				actualWorkflowVersion: input.actualWorkflowVersion,
				safeResultReference: input.safeResultReference ?? null,
				safeErrorReference: input.safeErrorReference ?? null,
				occurredAt,
				receivedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			const inserted = await this.repository.insertReceiptIfAbsent(receipt, ctx);
			if (!inserted) return;
			const updated = await this.repository.updateAtVersion(
				input.projectId,
				invocation.id,
				invocation.version,
				{
					ownerExecutionRef: input.ownerExecutionRef,
					childState: input.childState,
					safeResultReference: input.safeResultReference ?? null,
					safeErrorReference: input.safeErrorReference ?? null,
					version: invocation.version + 1,
					updatedAt: new Date(),
				},
				ctx,
			);
			if (!updated)
				throw new ConflictError('Workflow invocation changed while recording owner state.');
		});
	}

	private async verifyStoredAuthority(
		invocation: Pick<WorkflowInvocation, 'projectId' | 'attemptId'>,
		request: DepartmentWorkflowInvocationRequest,
		ctx: Parameters<WorkflowInvocationRepository['findAttempt']>[2],
	) {
		const attempt = await this.repository.findAttempt(
			invocation.projectId,
			invocation.attemptId,
			ctx,
		);
		if (!attempt) throw new NotFoundError('Active workflow invocation authority was not found.');
		return await this.verifyAuthority(
			{
				projectId: invocation.projectId,
				executorId: attempt.executorId,
				attemptId: attempt.id,
			},
			request,
			ctx,
		);
	}

	private async verifyAuthority(
		authority: DepartmentWorkflowInvocationAuthority,
		request: DepartmentWorkflowInvocationRequest,
		ctx: Parameters<WorkflowInvocationRepository['findAttempt']>[2],
	) {
		const attempt = await this.repository.findAttempt(
			authority.projectId,
			authority.attemptId,
			ctx,
		);
		if (
			!attempt ||
			attempt.executorId !== authority.executorId ||
			!attempt.ownerExecutionRef ||
			attempt.phase !== 'active' ||
			attempt.cancelRequestedAt
		) {
			throw new NotFoundError('Active workflow invocation authority was not found.');
		}
		const claim = await this.repository.findClaim(authority.projectId, attempt.id, ctx);
		if (!claim || claim.releasedAt || claim.leaseUntil.getTime() <= Date.now()) {
			throw new ConflictError('A current work claim is required for workflow execution.');
		}
		const department = await this.repository.findDepartment(
			authority.projectId,
			attempt.departmentId,
			ctx,
		);
		const member = await this.repository.findMember(
			authority.projectId,
			attempt.departmentId,
			attempt.memberId,
			ctx,
		);
		const binding = await this.repository.findBinding(authority.projectId, attempt.memberId, ctx);
		if (
			!department ||
			department.archived ||
			!member ||
			!binding ||
			binding.executorId !== authority.executorId ||
			binding.version !== attempt.bindingVersion
		) {
			throw new ForbiddenError('The department workflow assignment is no longer available.');
		}
		const runIsAuthorized = await this.executor.verifyRun({
			projectId: authority.projectId,
			actorId: attempt.initiatingUserId,
			executorId: authority.executorId,
			attemptId: authority.attemptId,
			dispatchKey: attempt.dispatchKey,
			executionId: claim.executionId,
		});
		if (!runIsAuthorized) throw new ForbiddenError('The Agent execution is no longer authorized.');

		const work = await this.repository.findWork(
			authority.projectId,
			attempt.departmentId,
			attempt.workId,
			ctx,
		);
		if (
			!work ||
			work.currentAttemptId !== attempt.id ||
			work.assigneeMemberId !== attempt.memberId ||
			work.state !== 'running' ||
			!claim ||
			claim.releasedAt
		) {
			throw new ConflictError('A current work claim is required for workflow execution.');
		}
		const capability = await this.repository.findCapability(
			authority.projectId,
			request.capabilityId,
			ctx,
		);
		const revision = await this.repository.findCapabilityRevision(
			authority.projectId,
			request.capabilityId,
			request.capabilityVersion,
			ctx,
		);
		const snapshots = parseSnapshots(attempt.workflowCapabilitiesJson);
		const snapshot = snapshots?.find(
			(item) => item.id === request.capabilityId && item.workflowId === request.workflowId,
		);
		if (
			!capability ||
			!capability.enabled ||
			capability.memberId !== attempt.memberId ||
			capability.workflowId !== request.workflowId ||
			capability.version !== request.capabilityVersion ||
			!revision ||
			!revision.enabled ||
			!snapshot ||
			snapshot.version !== revision.version ||
			snapshot.publishedVersionRef !== request.expectedWorkflowVersion ||
			revision.publishedVersionRef !== request.expectedWorkflowVersion ||
			capability.publishedVersionRef !== request.expectedWorkflowVersion
		) {
			throw new ConflictError('The selected workflow capability is not valid for this attempt.');
		}
		return { attempt, work, claim, capability, revision };
	}
}
