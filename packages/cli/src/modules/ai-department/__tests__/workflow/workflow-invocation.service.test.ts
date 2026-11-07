import { TransactionRunner } from '@n8n/db';
import { ConflictError, ForbiddenError } from '@n8n/errors';
import { mock } from 'vitest-mock-extended';

import {
	DepartmentExecutorProxy,
	DepartmentWorkflowInvocationOwnerProxy,
} from '@/modules/agents/agent-department-execution.contracts';

import { WorkAttempt } from '../../database/entities/work-attempt.entity';
import { WorkClaim } from '../../database/entities/work-claim.entity';
import { WorkItem } from '../../database/entities/work-item.entity';
import { WorkflowInvocation } from '../../database/entities/workflow-invocation.entity';
import type { WorkflowInvocationRepository } from '../../database/repositories/workflow-invocation.repository';
import { WorkflowInvocationService } from '../../workflow/workflow-invocation.service';

const gate = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../workflow/workflow-invocation-gate', () => ({
	get AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED() {
		return gate.enabled;
	},
}));

const authority = {
	projectId: 'project-a',
	executorId: 'agent-a',
	attemptId: 'attempt-a',
	dispatchKey: 'dispatch-a',
};

const request = {
	capabilityId: 'capability-a',
	capabilityVersion: 2,
	workflowId: 'workflow-a',
	requestId: 'tool-call-a',
	inputHash: 'a'.repeat(64),
	expectedWorkflowVersion: 'published-v2',
};

function setup() {
	const repository = mock<WorkflowInvocationRepository>();
	const txRunner = mock<TransactionRunner>();
	txRunner.run.mockImplementation(async (_ctx, operation) => await operation({}));
	const executor = mock<DepartmentExecutorProxy>();
	const owner = mock<DepartmentWorkflowInvocationOwnerProxy>();
	const service = new WorkflowInvocationService(repository, txRunner, executor, owner);
	return { repository, executor, owner, service };
}

function prepareAuthority(
	repository: WorkflowInvocationRepository,
	memberId = authority.executorId,
) {
	vi.mocked(repository.findAttempt).mockResolvedValue(
		mock<WorkAttempt>({
			id: authority.attemptId,
			projectId: authority.projectId,
			departmentId: 'department-a',
			workId: 'work-a',
			ordinal: 2,
			initiatingUserId: 'actor-a',
			memberId,
			executorId: authority.executorId,
			bindingVersion: 3,
			dispatchKey: authority.dispatchKey,
			ownerExecutionRef: 'accepted-owner-reference',
			phase: 'active',
			cancelRequestedAt: null,
			workflowCapabilitiesJson: JSON.stringify([
				{
					id: request.capabilityId,
					workflowId: request.workflowId,
					version: request.capabilityVersion,
					purpose: 'Create a campaign draft',
					publishedVersionRef: request.expectedWorkflowVersion,
					triggerCompatibilityRef: 'trigger-v1',
					inputSchemaFingerprint: 'schema-a',
				},
			]),
		}),
	);
	vi.mocked(repository.findDepartment).mockResolvedValue(mock({ archived: false }));
	vi.mocked(repository.findMember).mockResolvedValue(mock({ archived: false }));
	vi.mocked(repository.findBinding).mockResolvedValue(
		mock({ executorId: authority.executorId, version: 3 }),
	);
	vi.mocked(repository.findWork).mockResolvedValue(
		mock<WorkItem>({
			currentAttemptId: authority.attemptId,
			assigneeMemberId: memberId,
			state: 'running',
		}),
	);
	vi.mocked(repository.findClaim).mockResolvedValue(
		mock<WorkClaim>({
			executionId: 'parent-execution-a',
			claimGeneration: 7,
			releasedAt: null,
			leaseUntil: new Date(Date.now() + 60_000),
		}),
	);
	vi.mocked(repository.findCapability).mockResolvedValue(
		mock({
			id: request.capabilityId,
			memberId,
			workflowId: request.workflowId,
			version: request.capabilityVersion,
			enabled: true,
			publishedVersionRef: request.expectedWorkflowVersion,
		}),
	);
	vi.mocked(repository.findCapabilityRevision).mockResolvedValue(
		mock({
			version: request.capabilityVersion,
			enabled: true,
			publishedVersionRef: request.expectedWorkflowVersion,
		}),
	);
}

describe('WorkflowInvocationService', () => {
	afterEach(() => {
		gate.enabled = true;
		vi.clearAllMocks();
	});

	it('persists a request-scoped reservation before the native owner dispatches', async () => {
		const { repository, executor, service } = setup();
		prepareAuthority(repository);
		executor.verifyRun.mockResolvedValue(true);
		let persisted: WorkflowInvocation | null = null;
		vi.mocked(repository.findByAttemptRequestId).mockImplementation(async () => persisted);
		repository.insertIfAbsent.mockImplementation(async (invocation) => {
			persisted = Object.assign(invocation, { id: 'invocation-a' });
			return true;
		});

		const result = await service.reserve(authority, request);

		expect(result).toMatchObject({
			invocationId: 'invocation-a',
			duplicate: false,
		});
		expect(result.inputsRef).toMatch(/^ai-department-workflow-input:/);
		expect(repository.insertIfAbsent).toHaveBeenCalledWith(
			expect.objectContaining({
				attemptId: authority.attemptId,
				claimGeneration: 7,
				requestId: request.requestId,
				ownerInvocationKey: result.ownerInvocationKey,
				dispatchState: 'pending',
				childState: 'pending',
			}),
			expect.any(Object),
		);
		expect(executor.verifyRun).toHaveBeenCalledWith({
			projectId: authority.projectId,
			actorId: 'actor-a',
			executorId: authority.executorId,
			attemptId: authority.attemptId,
			dispatchKey: authority.dispatchKey,
			executionId: 'parent-execution-a',
		});
	});

	it('returns one reservation when duplicate requests race the unique request key', async () => {
		const { repository, executor, service } = setup();
		prepareAuthority(repository);
		executor.verifyRun.mockResolvedValue(true);
		let persisted: WorkflowInvocation | null = null;
		repository.findByAttemptRequestId.mockImplementation(async () => persisted);
		repository.insertIfAbsent.mockImplementation(async (invocation) => {
			if (persisted) return false;
			persisted = Object.assign(invocation, { id: 'invocation-race-a' });
			return true;
		});

		const results = await Promise.all([
			service.reserve(authority, request),
			service.reserve(authority, request),
		]);

		expect(results.map(({ duplicate }) => duplicate).sort()).toEqual([false, true]);
		expect(results[0].invocationId).toBe('invocation-race-a');
		expect(results[1].invocationId).toBe('invocation-race-a');
		expect(new Set(results.map(({ ownerInvocationKey }) => ownerInvocationKey)).size).toBe(1);
		expect(repository.insertIfAbsent).toHaveBeenCalledTimes(2);
	});

	it('rejects a duplicate request whose input hash changed', async () => {
		const { repository, service } = setup();
		repository.findByAttemptRequestId.mockResolvedValue(
			mock<WorkflowInvocation>({
				projectId: authority.projectId,
				memberId: authority.executorId,
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				inputHash: 'b'.repeat(64),
				ownerInvocationKey: 'prior-key',
			}),
		);

		await expect(service.reserve(authority, request)).rejects.toBeInstanceOf(ConflictError);
		expect(repository.insertIfAbsent).not.toHaveBeenCalled();
	});

	it('keeps invocation disabled while the runtime gate is closed', async () => {
		const { repository, service } = setup();
		gate.enabled = false;

		await expect(service.reserve(authority, request)).rejects.toBeInstanceOf(ConflictError);
		expect(repository.findAttempt).not.toHaveBeenCalled();
		expect(repository.insertIfAbsent).not.toHaveBeenCalled();
	});

	it('rejects an empty workflow version before reading reservation state', async () => {
		const { repository, service } = setup();

		await expect(
			service.reserve(authority, { ...request, expectedWorkflowVersion: '' }),
		).rejects.toBeInstanceOf(ConflictError);

		expect(repository.findByAttemptRequestId).not.toHaveBeenCalled();
		expect(repository.findAttempt).not.toHaveBeenCalled();
	});

	it('reconciles a retained owner execution into a durable acceptance', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingOwnerReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerInvocationKey: 'owner-key-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				dispatchState: 'pending',
			}),
		]);
		owner.lookup.mockResolvedValue({
			kind: 'accepted',
			ownerExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'pending',
		});
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'pending',
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				version: 1,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileOwnerAcceptance();

		expect(owner.lookup).toHaveBeenCalledWith({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			ownerInvocationKey: 'owner-key-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
		});
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			1,
			expect.objectContaining({
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				childState: 'pending',
			}),
			expect.any(Object),
		);
	});

	it('keeps an absent owner key unknown without dispatching it again', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingOwnerReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerInvocationKey: 'owner-key-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				dispatchState: 'pending',
			}),
		]);
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'pending',
				version: 1,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileOwnerAcceptance();

		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			1,
			expect.objectContaining({ dispatchState: 'unknown', childState: 'unknown' }),
			expect.any(Object),
		);
		expect(owner.lookup).toHaveBeenCalledTimes(1);
	});

	it('marks an invocation without a workflow version unknown during reconciliation', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingOwnerReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				expectedWorkflowVersion: null,
				dispatchState: 'pending',
			}),
		]);
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'pending',
				childState: 'pending',
				version: 2,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileOwnerAcceptance();

		expect(owner.lookup).not.toHaveBeenCalled();
		expect(owner.recover).not.toHaveBeenCalled();
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			2,
			expect.objectContaining({
				dispatchState: 'unknown',
				childState: 'unknown',
				version: 3,
				updatedAt: expect.any(Date),
			}),
			expect.any(Object),
		);
	});

	it('rotates unresolved owner lookups so later reservations are not starved', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'unknown',
				childState: 'unknown',
				version: 4,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.unknown({ projectId: authority.projectId, invocationId: 'invocation-a' });

		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			4,
			expect.objectContaining({
				childState: 'unknown',
				version: 5,
				updatedAt: expect.any(Date),
			}),
			expect.any(Object),
		);
	});

	it('recovers a staged child only after current work and Agent authority pass', async () => {
		const { repository, executor, owner, service } = setup();
		prepareAuthority(repository, 'department-member-a');
		executor.verifyRun.mockResolvedValue(true);
		repository.findNeedingOwnerReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: 'department-member-a',
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				ownerInvocationKey: 'owner-key-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				dispatchState: 'unknown',
			}),
		]);
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.recover.mockResolvedValue({
			kind: 'accepted',
			ownerExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'running',
		});
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'unknown',
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				version: 1,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileOwnerAcceptance();

		expect(executor.verifyRun).toHaveBeenCalledWith({
			projectId: authority.projectId,
			actorId: 'actor-a',
			executorId: authority.executorId,
			attemptId: authority.attemptId,
			dispatchKey: authority.dispatchKey,
			executionId: 'parent-execution-a',
		});
		expect(owner.recover).toHaveBeenCalledWith(
			expect.objectContaining({ invocationId: 'invocation-a' }),
		);
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			1,
			expect.objectContaining({
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
			}),
			expect.any(Object),
		);
	});

	it('does not recover a staged child after parent Agent authority is revoked', async () => {
		const { repository, executor, owner, service } = setup();
		prepareAuthority(repository);
		executor.verifyRun.mockResolvedValue(false);
		repository.findNeedingOwnerReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: authority.executorId,
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				ownerInvocationKey: 'owner-key-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				dispatchState: 'pending',
			}),
		]);
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'pending',
				version: 1,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileOwnerAcceptance();

		expect(owner.recover).not.toHaveBeenCalled();
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			1,
			expect.objectContaining({ dispatchState: 'unknown', childState: 'unknown' }),
			expect.any(Object),
		);
	});

	it('retries stop for acknowledged nonterminal invocations after process recovery', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingStopReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerExecutionRef: 'child-execution-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				cancelRequestedAt: new Date(),
				childState: 'waiting',
				dispatchState: 'acknowledged',
			}),
		]);

		await service.reconcileRequestedStops();

		expect(owner.requestStop).toHaveBeenCalledWith({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			ownerExecutionRef: 'child-execution-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
		});
	});

	it.each(['waiting', 'retrying'] as const)(
		'propagates revoked authority to native stop for a %s child',
		async (childState) => {
			const { repository, owner, service } = setup();
			repository.findNeedingAuthorityReconciliation.mockResolvedValue([
				mock<WorkflowInvocation>({
					id: 'invocation-a',
					projectId: authority.projectId,
					attemptId: authority.attemptId,
					memberId: authority.executorId,
					capabilityId: request.capabilityId,
					capabilityVersion: request.capabilityVersion,
					requestId: request.requestId,
					inputHash: request.inputHash,
					expectedWorkflowVersion: request.expectedWorkflowVersion,
					ownerExecutionRef: 'child-execution-a',
					dispatchState: 'acknowledged',
					childState,
					cancelRequestedAt: null,
				}),
			]);
			repository.findBinding.mockResolvedValue(null);
			repository.findNeedingStopReconciliation.mockResolvedValue([
				mock<WorkflowInvocation>({
					id: 'invocation-a',
					projectId: authority.projectId,
					ownerExecutionRef: 'child-execution-a',
					inputHash: request.inputHash,
					expectedWorkflowVersion: request.expectedWorkflowVersion,
					cancelRequestedAt: new Date(),
					childState: 'waiting',
					dispatchState: 'acknowledged',
				}),
			]);
			repository.findInvocation.mockResolvedValue(
				mock<WorkflowInvocation>({
					id: 'invocation-a',
					projectId: authority.projectId,
					ownerExecutionRef: 'child-execution-a',
					dispatchState: 'acknowledged',
					childState,
					cancelRequestedAt: null,
					version: 1,
				}),
			);
			owner.requestStop.mockImplementation(async () => undefined);
			repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

			await service.reconcileRevokedAuthority();
			await service.reconcileRequestedStops();

			expect(repository.updateAtVersion).toHaveBeenCalledWith(
				authority.projectId,
				'invocation-a',
				1,
				expect.objectContaining({ cancelRequestedAt: expect.any(Date), version: 2 }),
				expect.any(Object),
			);
			expect(owner.requestStop).toHaveBeenCalledWith({
				projectId: authority.projectId,
				invocationId: 'invocation-a',
				ownerExecutionRef: 'child-execution-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			});
			expect(owner.requestStop).toHaveBeenCalledTimes(1);
		},
	);

	it('asks the owner to reconcile changed child states for acknowledged invocations', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingChildSnapshotReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerExecutionRef: 'child-execution-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				childState: 'running',
				dispatchState: 'acknowledged',
			}),
		]);

		await service.reconcileChildSnapshots();

		expect(owner.reconcileSnapshot).toHaveBeenCalledWith({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			ownerExecutionRef: 'child-execution-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
			knownChildState: 'running',
		});
	});

	it('continues owner snapshots after a stop request until terminal proof arrives', async () => {
		const { repository, owner, service } = setup();
		repository.findNeedingChildSnapshotReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerExecutionRef: 'child-execution-a',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				cancelRequestedAt: new Date(),
				childState: 'waiting',
				dispatchState: 'acknowledged',
			}),
		]);

		await service.reconcileChildSnapshots();

		expect(owner.reconcileSnapshot).toHaveBeenCalledWith({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			ownerExecutionRef: 'child-execution-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
			knownChildState: 'waiting',
		});
	});

	it('persists a stop intent when current workflow authority has been revoked', async () => {
		const { repository, service } = setup();
		prepareAuthority(repository);
		repository.findNeedingAuthorityReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: authority.executorId,
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				ownerExecutionRef: 'child-execution-a',
				dispatchState: 'acknowledged',
				childState: 'running',
				cancelRequestedAt: null,
			}),
		]);
		repository.findBinding.mockResolvedValue(null);
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				ownerExecutionRef: 'child-execution-a',
				dispatchState: 'acknowledged',
				childState: 'running',
				cancelRequestedAt: null,
				version: 1,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.reconcileRevokedAuthority();

		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			1,
			expect.objectContaining({ cancelRequestedAt: expect.any(Date), version: 2 }),
			expect.any(Object),
		);
	});

	it('does not stop a child when a valid member uses a separate executor ID', async () => {
		const { repository, executor, service } = setup();
		prepareAuthority(repository, 'department-member-a');
		executor.verifyRun.mockResolvedValue(true);
		repository.findNeedingAuthorityReconciliation.mockResolvedValue([
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: 'department-member-a',
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
				ownerExecutionRef: 'child-execution-a',
				dispatchState: 'acknowledged',
				childState: 'running',
				cancelRequestedAt: null,
			}),
		]);

		await service.reconcileRevokedAuthority();

		expect(executor.verifyRun).toHaveBeenCalledWith({
			projectId: authority.projectId,
			actorId: 'actor-a',
			executorId: authority.executorId,
			attemptId: authority.attemptId,
			dispatchKey: authority.dispatchKey,
			executionId: 'parent-execution-a',
		});
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('accepts only the exact published version reserved by the department', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'pending',
				version: 1,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await expect(
			service.accepted({
				projectId: authority.projectId,
				invocationId: 'invocation-a',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: 'published-v1',
				childState: 'pending',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('records a new ordered owner event and ignores an older sequence', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 2,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.findLatestReceipt.mockResolvedValue(mock({ ownerSequence: '00000000000000000008' }));
		repository.insertReceiptIfAbsent.mockResolvedValue(true);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());
		const event = {
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			eventId: 'event-a',
			ownerSequence: '9',
			occurredAt: '2026-11-04T10:00:00.000Z',
			childState: 'waiting' as const,
			ownerExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
		};

		await service.outcome(event);
		expect(repository.insertReceiptIfAbsent).toHaveBeenCalledWith(
			expect.objectContaining({ eventId: 'event-a', ownerSequence: '00000000000000000009' }),
			expect.any(Object),
		);
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			2,
			expect.objectContaining({ childState: 'waiting', version: 3 }),
			expect.any(Object),
		);

		vi.clearAllMocks();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 2,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.findLatestReceipt.mockResolvedValue(mock({ ownerSequence: '00000000000000000009' }));
		await service.outcome({ ...event, eventId: 'older-event', ownerSequence: '8' });
		expect(repository.insertReceiptIfAbsent).not.toHaveBeenCalled();
	});

	it('accepts only a retry linked to the current native execution', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 4,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.hasReceiptForOwnerExecution.mockResolvedValue(false);
		repository.findLatestReceipt.mockResolvedValue(
			mock({ childState: 'failed', ownerSequence: '00000000000000000009' }),
		);
		repository.insertReceiptIfAbsent.mockResolvedValue(true);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		const retry = {
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			eventId: 'retry-event',
			ownerSequence: '10',
			occurredAt: '2026-11-04T10:00:03.000Z',
			childState: 'retrying' as const,
			ownerExecutionRef: 'child-execution-b',
			retryOfExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
		};
		await service.outcome(retry);
		expect(repository.insertReceiptIfAbsent).toHaveBeenCalledWith(
			expect.objectContaining({
				ownerExecutionRef: 'child-execution-b',
				retryOfExecutionRef: 'child-execution-a',
				childState: 'retrying',
			}),
			expect.any(Object),
		);
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			4,
			expect.objectContaining({ ownerExecutionRef: 'child-execution-b', childState: 'retrying' }),
			expect.any(Object),
		);

		vi.clearAllMocks();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 4,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.hasReceiptForOwnerExecution.mockResolvedValue(false);
		await expect(
			service.outcome({
				...retry,
				eventId: 'forged-retry',
				retryOfExecutionRef: 'other-execution',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.insertReceiptIfAbsent).not.toHaveBeenCalled();
	});

	it('ignores a late event from an execution already superseded by a retry', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-b',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 5,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.hasReceiptForOwnerExecution.mockResolvedValue(true);

		await service.outcome({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			eventId: 'late-old-event',
			ownerSequence: '11',
			occurredAt: '2026-11-04T10:00:04.000Z',
			childState: 'failed',
			ownerExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(repository.insertReceiptIfAbsent).not.toHaveBeenCalled();
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('persists child cancellation intent without claiming a terminal outcome', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				childState: 'running',
				ownerExecutionRef: 'child-execution-a',
				cancelRequestedAt: null,
				version: 4,
			}),
		);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.cancellationRequested({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			ownerExecutionRef: 'child-execution-a',
		});

		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-a',
			4,
			expect.objectContaining({
				cancelRequestedAt: expect.any(Date),
				version: 5,
			}),
			expect.any(Object),
		);
		expect(repository.updateAtVersion.mock.calls[0][3]).not.toHaveProperty('childState');
	});

	it('denies child result delivery after the parent Agent run loses authority', async () => {
		const { repository, executor, service } = setup();
		prepareAuthority(repository);
		executor.verifyRun.mockResolvedValue(false);
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: authority.executorId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		);

		await expect(
			service.authorizeResultDelivery({
				projectId: authority.projectId,
				executorId: authority.executorId,
				attemptId: authority.attemptId,
				invocationId: 'invocation-a',
				ownerExecutionRef: 'child-execution-a',
			}),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(executor.verifyRun).toHaveBeenCalled();
	});

	it('authorizes result delivery when the department member and Agent IDs differ', async () => {
		const { repository, executor, service } = setup();
		prepareAuthority(repository);
		executor.verifyRun.mockResolvedValue(true);
		repository.findAttempt.mockResolvedValue(
			mock<WorkAttempt>({
				id: authority.attemptId,
				projectId: authority.projectId,
				departmentId: 'department-a',
				workId: 'work-a',
				ordinal: 2,
				initiatingUserId: 'actor-a',
				memberId: 'department-member-a',
				executorId: authority.executorId,
				dispatchKey: authority.dispatchKey,
				bindingVersion: 3,
				ownerExecutionRef: authority.dispatchKey,
				phase: 'active',
				cancelRequestedAt: null,
				workflowCapabilitiesJson: JSON.stringify([
					{
						id: request.capabilityId,
						workflowId: request.workflowId,
						version: request.capabilityVersion,
						purpose: 'Create a campaign draft',
						publishedVersionRef: request.expectedWorkflowVersion,
						triggerCompatibilityRef: 'trigger-v1',
						inputSchemaFingerprint: 'schema-a',
					},
				]),
			}),
		);
		repository.findWork.mockResolvedValue(
			mock<WorkItem>({
				currentAttemptId: authority.attemptId,
				assigneeMemberId: 'department-member-a',
				state: 'running',
			}),
		);
		repository.findCapability.mockResolvedValue(
			mock({
				id: request.capabilityId,
				memberId: 'department-member-a',
				workflowId: request.workflowId,
				version: request.capabilityVersion,
				enabled: true,
				publishedVersionRef: request.expectedWorkflowVersion,
			}),
		);
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				attemptId: authority.attemptId,
				memberId: 'department-member-a',
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				capabilityId: request.capabilityId,
				capabilityVersion: request.capabilityVersion,
				requestId: request.requestId,
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		);

		await expect(
			service.authorizeResultDelivery({
				projectId: authority.projectId,
				executorId: authority.executorId,
				attemptId: authority.attemptId,
				invocationId: 'invocation-a',
				ownerExecutionRef: 'child-execution-a',
			}),
		).resolves.toBeUndefined();
		expect(executor.verifyRun).toHaveBeenCalledWith({
			projectId: authority.projectId,
			actorId: 'actor-a',
			executorId: authority.executorId,
			attemptId: authority.attemptId,
			dispatchKey: authority.dispatchKey,
			executionId: 'parent-execution-a',
		});
	});

	it('keeps a terminal child outcome when a newer nonterminal event arrives', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-a',
				projectId: authority.projectId,
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-a',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 3,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.findLatestReceipt.mockResolvedValue(
			mock({ childState: 'succeeded', ownerSequence: '00000000000000000009' }),
		);

		await service.outcome({
			projectId: authority.projectId,
			invocationId: 'invocation-a',
			eventId: 'late-running-event',
			ownerSequence: '10',
			occurredAt: '2026-11-04T10:00:01.000Z',
			childState: 'running',
			ownerExecutionRef: 'child-execution-a',
			actualWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(repository.insertReceiptIfAbsent).not.toHaveBeenCalled();
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('keeps an old attempt result on its invocation without changing work state', async () => {
		const { repository, service } = setup();
		repository.findInvocation.mockResolvedValue(
			mock<WorkflowInvocation>({
				id: 'invocation-old-attempt',
				projectId: authority.projectId,
				attemptId: 'attempt-old',
				dispatchState: 'acknowledged',
				ownerExecutionRef: 'child-execution-old',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				version: 1,
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		repository.findLatestReceipt.mockResolvedValue(null);
		repository.insertReceiptIfAbsent.mockResolvedValue(true);
		repository.updateAtVersion.mockResolvedValue(mock<WorkflowInvocation>());

		await service.outcome({
			projectId: authority.projectId,
			invocationId: 'invocation-old-attempt',
			eventId: 'old-attempt-result',
			ownerSequence: '1',
			occurredAt: '2026-11-04T10:00:02.000Z',
			childState: 'succeeded',
			ownerExecutionRef: 'child-execution-old',
			actualWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(repository.insertReceiptIfAbsent).toHaveBeenCalledWith(
			expect.objectContaining({ invocationId: 'invocation-old-attempt' }),
			expect.any(Object),
		);
		expect(repository.updateAtVersion).toHaveBeenCalledWith(
			authority.projectId,
			'invocation-old-attempt',
			expect.any(Number),
			expect.objectContaining({ childState: 'succeeded' }),
			expect.any(Object),
		);
		expect(repository.updateAtVersion.mock.calls[0]?.[1]).not.toBe('work-a');
	});
});
