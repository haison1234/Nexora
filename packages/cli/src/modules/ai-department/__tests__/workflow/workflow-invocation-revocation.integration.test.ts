import { createTeamProject, createWorkflow, testDb, testModules } from '@n8n/backend-test-utils';
import { TransactionRunner } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';
import { randomUUID } from 'node:crypto';
import { mock } from 'vitest-mock-extended';

import type {
	DepartmentExecutorProxy,
	DepartmentWorkflowInvocationOwnerProxy,
} from '@/modules/agents/agent-department-execution.contracts';
import { Department } from '../../database/entities/department.entity';
import { ExecutorBinding } from '../../database/entities/executor-binding.entity';
import { Member } from '../../database/entities/member.entity';
import { WorkAttempt } from '../../database/entities/work-attempt.entity';
import { WorkClaim } from '../../database/entities/work-claim.entity';
import { WorkItem } from '../../database/entities/work-item.entity';
import { WorkflowCapability } from '../../database/entities/workflow-capability.entity';
import { WorkflowCapabilityRevision } from '../../database/entities/workflow-capability-revision.entity';
import { WorkflowInvocation } from '../../database/entities/workflow-invocation.entity';
import { WorkflowInvocationRepository } from '../../database/repositories/workflow-invocation.repository';
import { WorkflowInvocationService } from '../../workflow/workflow-invocation.service';
import { createOwner } from '@test-integration/db/users';

describe('workflow invocation revocation reconciliation with persistence', () => {
	let projectId: string;
	let workflowId: string;
	const departmentId = randomUUID();
	const memberId = randomUUID();
	const workId = randomUUID();
	const attemptId = randomUUID();
	const invocationId = randomUUID();
	const capabilityId = randomUUID();
	let actorId: string;
	const ownerExecutionRef = randomUUID();
	let service: WorkflowInvocationService;
	const owner = mock<DepartmentWorkflowInvocationOwnerProxy>();

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		const actor = await createOwner();
		const project = await createTeamProject('Workflow revocation integration', actor);
		actorId = actor.id;
		projectId = project.id;
		workflowId = (await createWorkflow({}, project)).id;
		owner.requestStop.mockResolvedValue();
		service = new WorkflowInvocationService(
			Container.get(WorkflowInvocationRepository),
			Container.get(TransactionRunner),
			mock<DepartmentExecutorProxy>(),
			owner,
		);
	});

	afterAll(async () => await testDb.terminate());

	afterEach(async () => {
		const manager = Container.get(DataSource).manager;
		await manager.delete(WorkflowInvocation, { id: invocationId });
		await manager.delete(WorkflowCapabilityRevision, { capabilityId });
		await manager.delete(WorkflowCapability, { id: capabilityId });
		await manager.delete(WorkClaim, { attemptId });
		await manager.delete(WorkAttempt, { id: attemptId });
		await manager.delete(WorkItem, { id: workId });
		await manager.delete(Member, { id: memberId });
		await manager.delete(Department, { id: departmentId });
		await manager.delete(ExecutorBinding, { memberId });
		owner.requestStop.mockClear();
	});

	it.each(['waiting', 'retrying'] as const)(
		'reconciles a revoked %s child and dispatches its persisted stop intent after service reconstruction',
		async (childState) => {
			const manager = Container.get(DataSource).manager;
			const now = new Date();
			const workflowVersion = randomUUID();
			const inputHash = 'd'.repeat(64);
			const dispatchKey = randomUUID();

			await manager.save(
				Department,
				Object.assign(new Department(), {
					id: departmentId,
					projectId,
					name: 'Revocation integration',
					normalizedName: departmentId,
					description: null,
					archived: false,
					version: 1,
					projectionSequence: 0,
				}),
			);
			await manager.save(
				Member,
				Object.assign(new Member(), {
					id: memberId,
					projectId,
					departmentId,
					name: 'Worker',
					role: 'worker',
					managerMemberId: null,
					archived: false,
					version: 1,
				}),
			);
			await manager.save(
				WorkItem,
				Object.assign(new WorkItem(), {
					id: workId,
					projectId,
					departmentId,
					goalId: null,
					assigneeMemberId: memberId,
					instruction: 'Run the selected workflow.',
					priority: 'normal',
					dueAt: null,
					reviewPolicy: 'required',
					state: 'running',
					currentAttemptId: null,
					version: 1,
				}),
			);
			await manager.save(
				WorkAttempt,
				Object.assign(new WorkAttempt(), {
					id: attemptId,
					projectId,
					departmentId,
					workId,
					ordinal: 1,
					initiatingUserId: actorId,
					memberId,
					bindingVersion: 1,
					provider: 'n8n-agent',
					executorId: randomUUID(),
					reviewPolicy: 'required',
					dispatchKey,
					workflowIdsJson: JSON.stringify([workflowId]),
					workflowCapabilitiesJson: '[]',
					ownerExecutionRef: randomUUID(),
					phase: 'active',
					lastOwnerSequence: '0',
					cancelRequestId: null,
					outcome: null,
					resultReference: null,
					safeSummary: null,
					startedAt: now,
					finishedAt: null,
					cancelRequestedAt: null,
				}),
			);
			await manager.save(
				WorkClaim,
				Object.assign(new WorkClaim(), {
					id: randomUUID(),
					projectId,
					departmentId,
					workId,
					attemptId,
					memberId,
					executionId: randomUUID(),
					claimGeneration: 1,
					leaseUntil: new Date(now.getTime() + 60_000),
					claimedAt: now,
					releasedAt: null,
				}),
			);
			await manager.update(WorkItem, { id: workId }, { currentAttemptId: attemptId });
			await manager.save(
				WorkflowCapability,
				Object.assign(new WorkflowCapability(), {
					id: capabilityId,
					projectId,
					departmentId,
					memberId,
					workflowId,
					purpose: 'Run a controlled workflow.',
					publishedVersionRef: workflowVersion,
					triggerCompatibilityRef: 'execute-workflow-trigger@1',
					inputSchemaFingerprint: 'schema-fingerprint',
					enabled: true,
					version: 1,
				}),
			);
			await manager.save(
				WorkflowCapabilityRevision,
				Object.assign(new WorkflowCapabilityRevision(), {
					id: randomUUID(),
					projectId,
					capabilityId,
					version: 1,
					purpose: 'Run a controlled workflow.',
					publishedVersionRef: workflowVersion,
					triggerCompatibilityRef: 'execute-workflow-trigger@1',
					inputSchemaFingerprint: 'schema-fingerprint',
					enabled: true,
					changedById: actorId,
					createdAt: now,
				}),
			);
			await manager.save(
				WorkflowInvocation,
				Object.assign(new WorkflowInvocation(), {
					id: invocationId,
					projectId,
					workId,
					attemptId,
					memberId,
					capabilityId,
					capabilityVersion: 1,
					claimGeneration: 1,
					requestId: randomUUID(),
					ownerInvocationKey: 'e'.repeat(64),
					inputHash,
					inputsRef: 'inputs-ref',
					expectedWorkflowVersion: workflowVersion,
					actualWorkflowVersion: workflowVersion,
					ownerExecutionRef,
					dispatchState: 'acknowledged',
					childState,
					safeResultReference: null,
					safeErrorReference: null,
					version: 1,
					cancelRequestedAt: null,
				}),
			);

			await service.reconcileRevokedAuthority();
			const persistedIntent = await manager.findOneBy(WorkflowInvocation, { id: invocationId });
			expect(persistedIntent?.cancelRequestedAt).toBeInstanceOf(Date);

			const recoveredService = new WorkflowInvocationService(
				Container.get(WorkflowInvocationRepository),
				Container.get(TransactionRunner),
				mock<DepartmentExecutorProxy>(),
				owner,
			);
			await recoveredService.reconcileRequestedStops();

			expect(owner.requestStop).toHaveBeenCalledWith({
				projectId,
				invocationId,
				ownerExecutionRef,
				inputHash,
				expectedWorkflowVersion: workflowVersion,
			});
		},
	);
});
