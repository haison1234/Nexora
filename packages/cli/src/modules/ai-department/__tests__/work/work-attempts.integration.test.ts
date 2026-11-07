import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { createMember as createTestUser } from '@test-integration/db/users';
import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { TransactionRunner } from '@n8n/db';
import { DataSource } from '@n8n/typeorm';
import { Container } from '@n8n/di';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiDepartmentReviewStage } from '@n8n/api-types';
import type {
	DepartmentAttemptContext,
	DepartmentDispatchResult,
	DepartmentDispatchLookup,
	DepartmentExecutionSnapshot,
	DepartmentExecutor,
} from '@/modules/agents/agent-department-execution.contracts';
import { DepartmentConsultationInvocationOwnerProxy } from '@/modules/agents/agent-department-consultation.contracts';
import { createAgentBindingFixture } from '@/modules/agents/testing/agent-binding-fixture';

import { DepartmentExecutorProxy } from '../../work/executor.contracts';
import { WorkRepository } from '../../database/repositories/work.repository';
import { WorkActivity } from '../../database/entities/work-activity.entity';
import { DirectoryRepository } from '../../database/repositories/directory.repository';
import { ActiveDepartmentWorkGuardProxy } from '../../active-department-work-guard.contracts';
import { ActiveDepartmentArchiveGuardProxy } from '../../active-department-archive-guard.contracts';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { ActiveDepartmentWorkGuardImpl } from '../../work/active-department-work-guard';
import { ActiveDepartmentArchiveGuardImpl } from '../../active-department-archive-guard';
import { ExecutorBindingRevision } from '../../database/entities/executor-binding-revision.entity';
import { WorkEligibility } from '../../database/entities/work-eligibility.entity';
import { WorkAttempt } from '../../database/entities/work-attempt.entity';
import { WorkWakeLane } from '../../database/entities/work-wake-lane.entity';
import { WorkWakeIntent } from '../../database/entities/work-wake-intent.entity';
import { WorkItem } from '../../database/entities/work-item.entity';
import { WorkService } from '../../work/work.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkReviewStageDecision } from '../../database/entities/work-review-records.entity';
import { WorkInboxService } from '../../work/work-inbox.service';
import { WorkHandoffService } from '../../work/work-handoff.service';
import { WorkHandoffIntent } from '../../database/entities/work-handoff-intent.entity';
import { WorkHelpRequest } from '../../database/entities/work-help-request.entity';
import { WorkHelpResponse } from '../../database/entities/work-help-response.entity';
import { WorkHelpService } from '../../work/work-help.service';
import { WorkHelpRoutingService } from '../../work/work-help-routing.service';
import { WorkHelpResponseGate } from '../../work/work-help-response-gate';
import { WorkRelationship } from '../../database/entities/work-relationship.entity';
import { WorkReleaseIntent } from '../../database/entities/work-release-intent.entity';
import { WorkReleaseService } from '../../work/work-release.service';
import { WorkflowCapability } from '../../database/entities/workflow-capability.entity';
import { WorkflowCapabilityRepository } from '../../database/repositories/workflow-capability.repository';
import { WorkflowInvocation } from '../../database/entities/workflow-invocation.entity';
import { WorkflowInvocationRepository } from '../../database/repositories/workflow-invocation.repository';
import { AiDepartmentOperationsBroadcaster } from '../../operations-broadcaster.service';

describe('AI Department work attempts', () => {
	let departments: DepartmentService;
	let members: MemberService;
	let work: WorkService;
	let workRepository: WorkRepository;
	let directoryRepository: DirectoryRepository;
	let projectId: string;
	let actorId: string;
	let nextDispatch: DepartmentDispatchResult;
	let nextLookup: DepartmentDispatchLookup;
	let nextSnapshot: DepartmentExecutionSnapshot;
	let nextNativeToolApproval: 'pending' | 'not_pending' | 'unknown';
	let nextStop: Awaited<ReturnType<DepartmentExecutor['requestStop']>> = {
		status: 'accepted',
		acknowledged: true,
		confirmed: false,
	};
	let canStart = true;
	let authorized = true;
	let previousRunStopped = false;
	const dispatch = vi.fn(async (_context: DepartmentAttemptContext) => nextDispatch);
	const lookup = vi.fn(async (_context: Parameters<DepartmentExecutor['lookup']>[0]) => nextLookup);
	const snapshot = vi.fn(
		async (_input: Parameters<DepartmentExecutor['snapshot']>[0]) => nextSnapshot,
	);
	const nativeToolApproval = vi.fn(
		async (_input: Parameters<DepartmentExecutor['nativeToolApproval']>[0]) =>
			nextNativeToolApproval,
	);
	const requestStop = vi.fn(
		async (_input: Parameters<DepartmentExecutor['requestStop']>[0]) => nextStop,
	);

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		Container.get(GlobalConfig).database.postgresdb.poolSize = 2;
		await testDb.init();
		actorId = (await createTestUser()).id;
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
		);
		Container.get(ActiveDepartmentArchiveGuardProxy).register(
			Container.get(ActiveDepartmentArchiveGuardImpl),
		);
		departments = Container.get(DepartmentService);
		members = Container.get(MemberService);
		work = Container.get(WorkService);
		workRepository = Container.get(WorkRepository);
		directoryRepository = Container.get(DirectoryRepository);
		projectId = (await createTeamProject('AI Department attempt integration')).id;
		const controlledExecutor: DepartmentExecutor = {
			resolve: async (input) => ({
				status: canStart ? 'available' : 'unavailable',
				provider: 'n8n-agent',
				executorId: input.executorId,
				bindingVersion: input.bindingVersion,
				canStart,
				canStop: authorized,
				authorized,
			}),
			verifyRun: async () => authorized,
			isRunStopped: async () => previousRunStopped,
			dispatch,
			lookup,
			snapshot,
			nativeToolApproval,
			requestStop,
		};
		Container.get(DepartmentExecutorProxy).register(controlledExecutor);
	});

	beforeEach(() => {
		nextDispatch = { kind: 'accepted', ownerExecutionRef: 'owner-ref' };
		nextLookup = { kind: 'accepted', ownerExecutionRef: 'owner-ref' };
		nextSnapshot = { phase: 'active', sequence: '1' };
		nextNativeToolApproval = 'not_pending';
		nextStop = { status: 'accepted', acknowledged: true, confirmed: false };
		canStart = true;
		authorized = true;
		previousRunStopped = false;
		dispatch.mockClear();
		lookup.mockClear();
		snapshot.mockClear();
		nativeToolApproval.mockClear();
		requestStop.mockClear();
	});

	afterAll(async () => await testDb.terminate());

	async function createReadyWork(
		reviewPolicy: 'required' | 'automatic' = 'required',
		reviewStages?: AiDepartmentReviewStage[],
		goalTitle?: string,
	) {
		const department = await departments.create(projectId, actorId, {
			name: `Attempts-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const member = await members.create(projectId, actorId, department.id, {
			name: `Member-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const goal = goalTitle
			? await work.createGoal(projectId, actorId, department.id, {
					title: goalTitle,
					successCriteria: 'Research and publish a verified campaign plan.',
					requestId: randomUUID(),
				})
			: null;
		const created = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Prepare an execution result',
			assigneeMemberId: member.id,
			goalId: goal?.id,
			priority: 'normal',
			reviewPolicy,
			reviewStages,
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, actorId, department.id, created.id, {
			expectedVersion: created.version,
			requestId: randomUUID(),
		});
		return { department, member, agent, ready, goal };
	}

	async function reportResult(attemptId: string) {
		const attempt = await workRepository.findAttempt(projectId, attemptId);
		if (!attempt) throw new Error('Missing test attempt');
		const context = {
			projectId,
			executorId: attempt.executorId,
			attemptId,
			executionId: randomUUID(),
		};
		const coordinator = Container.get(WorkCoordinationService);
		const current = await work.getWork(projectId, attempt.departmentId, attempt.workId);
		const claim = await coordinator.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: current.version,
		});
		await coordinator.executeAction(context, randomUUID(), {
			action: 'submit',
			expectedVersion: claim.work.version,
			report: {
				result: 'Verified business result',
				completedWork: [],
				checkedEvidence: [],
				openIssues: [],
				nextSteps: [],
			},
		});
	}

	it('reserves before dispatch and replays the same command without a second start', async () => {
		const { department, ready } = await createReadyWork();
		const command = { expectedVersion: ready.version, requestId: randomUUID() };
		const first = await work.startWork(projectId, actorId, department.id, ready.id, command);
		const replay = await work.startWork(projectId, actorId, department.id, ready.id, command);

		expect(first.dispatchState).toBe('acknowledged');
		expect(replay).toEqual(first);
		expect(dispatch).toHaveBeenCalledTimes(1);
		const attemptId = first.attemptId;
		expect(attemptId).toBeTruthy();
		const eligibilities = await Container.get(DataSource).manager.find(WorkEligibility, {
			where: { projectId, workId: ready.id },
		});
		expect(eligibilities.map(({ state }) => state)).toEqual(['cancelled', 'reserved']);
		const attempt = await workRepository.findAttempt(projectId, attemptId!);
		expect(attempt).toMatchObject({ phase: 'active', ownerExecutionRef: 'owner-ref' });
		expect(await workRepository.findDispatchIntent(attemptId!)).toMatchObject({
			state: 'acknowledged',
			acknowledgmentReference: 'owner-ref',
		});
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');
		nextSnapshot = {
			phase: 'terminal',
			sequence: '80',
			result: { outcome: 'failed' },
		};
		await work.reconcileAttempts();
	});

	it('replays claim and submit commands when the inspected version has advanced', async () => {
		const { department, ready, agent } = await createReadyWork('required');
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const currentWork = await work.getWork(projectId, department.id, ready.id);
		const claimRequestId = randomUUID();
		const firstClaim = await coordination.executeAction(context, claimRequestId, {
			action: 'claim',
			expectedVersion: currentWork.version,
		});
		const replayedClaim = await coordination.executeAction(context, claimRequestId, {
			action: 'claim',
			expectedVersion: firstClaim.work.version,
		});
		expect(replayedClaim).toEqual(firstClaim);

		const report = {
			result: 'Completed the requested work.',
			completedWork: ['Prepared the result.'],
			checkedEvidence: [],
			openIssues: [],
			nextSteps: [],
		};
		const submitRequestId = randomUUID();
		const firstSubmit = await coordination.executeAction(context, submitRequestId, {
			action: 'submit',
			expectedVersion: firstClaim.work.version,
			report,
		});
		const replayedSubmit = await coordination.executeAction(context, submitRequestId, {
			action: 'submit',
			expectedVersion: firstSubmit.work.version,
			report,
		});
		expect(replayedSubmit).toEqual(firstSubmit);
	});

	it('scopes help request replay and accepts one response for the request', async () => {
		const { department, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const helpRequest = Object.assign(new WorkHelpRequest(), {
			id: randomUUID(),
			projectId,
			departmentId: department.id,
			workId: ready.id,
			requesterMemberId: ready.assigneeMemberId!,
			sourceAttemptId: started.attemptId!,
			initiatingUserId: actorId,
			requestId: randomUUID(),
			question: 'How should I verify this result?',
			attemptedStepsJson: JSON.stringify(['Checked the current workflow.']),
			reason: 'The evidence format is unclear.',
			expertiseTagsJson: JSON.stringify(['workflow']),
			requestChainJson: JSON.stringify([]),
			recipientMemberId: null,
			routingState: 'unresolved' as const,
			bindingVersion: null,
			inputHash: 'a'.repeat(64),
			deadlineAt: null,
			state: 'awaiting_answer' as const,
			ownerReference: null,
			version: 1,
		});
		const beforeRequest = await directoryRepository.findDepartment(projectId, department.id);
		await workRepository.saveHelpRequest(helpRequest);
		const afterRequest = await directoryRepository.findDepartment(projectId, department.id);
		expect(afterRequest?.projectionSequence).toBe((beforeRequest?.projectionSequence ?? 0) + 1);
		expect(
			await workRepository.findHelpRequestByCommand(projectId, actorId, helpRequest.requestId),
		).toMatchObject({ id: helpRequest.id });
		expect(
			await workRepository.findHelpRequest(
				'another-project',
				department.id,
				ready.id,
				helpRequest.id,
			),
		).toBeNull();
		expect(
			await workRepository.listHelpRequestsForWork(projectId, department.id, ready.id),
		).toMatchObject([{ id: helpRequest.id }]);

		const activity = await workRepository.addActivity(
			Object.assign(new WorkActivity(), {
				id: randomUUID(),
				projectId,
				departmentId: department.id,
				workId: ready.id,
				attemptId: started.attemptId,
				actorId,
				actorKind: 'user' as const,
				kind: 'help_answered',
				body: 'Use the current attempt as the reference.',
				workVersion: started.work.version + 1,
				createdAt: new Date(),
			}),
			{},
		);
		const response = Object.assign(new WorkHelpResponse(), {
			id: randomUUID(),
			projectId,
			departmentId: department.id,
			workId: ready.id,
			helpRequestId: helpRequest.id,
			activityId: activity.id,
			responderKind: 'user' as const,
			responderUserId: actorId,
			responderMemberId: null,
			answer: 'Use the current attempt as the reference.',
			answerHash: 'b'.repeat(64),
			sourceAttemptId: started.attemptId,
			ownerInvocationRef: null,
			ownerSequence: null,
			createdAt: new Date(),
		});
		const beforeResponse = await directoryRepository.findDepartment(projectId, department.id);
		await workRepository.saveHelpResponse(response);
		const afterResponse = await directoryRepository.findDepartment(projectId, department.id);
		expect(afterResponse?.projectionSequence).toBe((beforeResponse?.projectionSequence ?? 0) + 1);
		expect(
			await workRepository.findHelpResponse(projectId, department.id, ready.id, helpRequest.id),
		).toMatchObject({ id: response.id, answer: response.answer });
		await expect(
			workRepository.saveHelpResponse({ ...response, id: randomUUID() }),
		).rejects.toThrow();
	});

	it('records a help request and keeps the requester turn pending until stop proof exists', async () => {
		const { department, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const requestId = randomUUID();
		const ask = {
			action: 'ask' as const,
			expectedVersion: claimed.work.version,
			question: 'How should I verify the result?',
			attemptedSteps: ['Checked the current workflow.'],
			reason: 'The evidence format is unclear.',
			expertiseTags: ['workflow'],
		};
		const result = await service.executeToolAction(context, requestId, ask);

		expect('helpRequest' in result).toBe(true);
		if (!('helpRequest' in result)) throw new Error('Expected a help request result.');
		expect(result.helpRequest.state).toBe('pending_stop');
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(
			await workRepository.listHelpRequestsForWork(projectId, department.id, ready.id),
		).toHaveLength(1);
		const replay = await service.executeToolAction(context, requestId, ask);
		expect(replay).toEqual(result);
		expect(
			await workRepository.listHelpRequestsForWork(projectId, department.id, ready.id),
		).toHaveLength(1);
	});

	it('enforces the help request cap across attempts on the same Work item', async () => {
		const { department, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const now = new Date();
		for (let index = 0; index < 2; index++) {
			await workRepository.saveHelpRequest(
				Object.assign(new WorkHelpRequest(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					workId: ready.id,
					requesterMemberId: ready.assigneeMemberId!,
					sourceAttemptId: started.attemptId!,
					initiatingUserId: actorId,
					requestId: randomUUID(),
					question: `Question ${index + 1}`,
					attemptedStepsJson: JSON.stringify([]),
					reason: 'Need more information.',
					expertiseTagsJson: JSON.stringify([]),
					requestChainJson: JSON.stringify({ memberIds: [], userIds: [] }),
					recipientMemberId: null,
					recipientUserId: null,
					routingState: 'unresolved' as const,
					bindingVersion: null,
					inputHash: String(index).padStart(64, 'a'),
					deadlineAt: null,
					state: 'answered' as const,
					ownerReference: null,
					version: 1,
					createdAt: new Date(now.getTime() + index),
					updatedAt: new Date(now.getTime() + index),
				}),
			);
		}
		await expect(
			coordination.executeToolAction(context, randomUUID(), {
				action: 'ask',
				expectedVersion: claim.work.version,
				question: 'Can I ask one more question?',
				attemptedSteps: [],
				reason: 'The request limit should apply across attempts.',
				expertiseTags: [],
			}),
		).rejects.toThrow('help request limit');
		expect(
			await workRepository.listHelpRequestsForWork(projectId, department.id, ready.id),
		).toHaveLength(2);
	});

	it('makes a human help request answerable only after the owner proves the requester turn stopped', async () => {
		const { department, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '90001',
			result: { outcome: 'cancelled', safeSummary: 'Turn stopped for help.' },
		};
		const result = await service.executeToolAction(context, randomUUID(), {
			action: 'ask',
			expectedVersion: claimed.work.version,
			question: 'How should I verify the result?',
			attemptedSteps: ['Checked the current workflow.'],
			reason: 'The evidence format is unclear.',
			expertiseTags: ['workflow'],
		});

		expect('helpRequest' in result).toBe(true);
		if (!('helpRequest' in result)) throw new Error('Expected a help request result.');
		expect(result.helpRequest.state).toBe('awaiting_answer');
		expect(
			(await Container.get(WorkHelpService).listAttention(projectId, department.id)).items,
		).toHaveLength(1);
		expect(result.helpRequest.routing.recipientUserId).toBeNull();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(dispatch).toHaveBeenCalledTimes(1);
	});

	it.each([
		{
			scenario: 'owner access is lost after terminal success',
			outcome: 'succeeded' as const,
			expired: false,
			expectedState: 'awaiting_answer' as const,
		},
		{
			scenario: 'owner consultation ends in failure',
			outcome: 'failed' as const,
			expired: false,
			expectedState: 'awaiting_answer' as const,
		},
		{
			scenario: 'owner failure arrives after the request deadline',
			outcome: 'failed' as const,
			expired: true,
			expectedState: 'expired' as const,
		},
	])(
		'returns a queued consultation to the human path when $scenario',
		async ({ outcome, expired, expectedState }) => {
			const { department, ready, member, agent } = await createReadyWork();
			const responder = await members.create(projectId, actorId, department.id, {
				name: `Responder-${randomUUID()}`,
				role: 'Researcher',
				expertiseTags: ['workflow'],
				requestId: randomUUID(),
			});
			const responderAgent = await createAgentBindingFixture(projectId, true);
			await members.setBinding(projectId, actorId, department.id, responder.id, {
				provider: 'n8n-agent',
				executorId: responderAgent.id,
				expectedVersion: responder.version,
				requestId: randomUUID(),
			});
			const started = await work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			});
			const context = {
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				executionId: randomUUID(),
			};
			const coordination = Container.get(WorkCoordinationService);
			const claimed = await coordination.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: started.work.version,
			});
			nextSnapshot = {
				phase: 'terminal',
				sequence: '90003',
				result: { outcome: 'cancelled', safeSummary: 'Turn stopped for help.' },
			};
			const asked = await coordination.executeToolAction(context, randomUUID(), {
				action: 'ask',
				expectedVersion: claimed.work.version,
				question: 'How should I verify the published workflow?',
				attemptedSteps: ['Checked the latest run.'],
				reason: 'The expected evidence is unclear.',
				expertiseTags: ['workflow'],
			});
			if (!('helpRequest' in asked)) throw new Error('Expected a help request result.');
			expect(asked.helpRequest.routing).toMatchObject({
				state: 'specialist',
				recipientMemberId: responder.id,
			});
			const request = await workRepository.findHelpRequest(
				projectId,
				department.id,
				ready.id,
				asked.helpRequest.id,
			);
			if (!request) throw new Error('Missing help request.');
			request.state = 'queued';
			request.ownerInvocationHash = 'a'.repeat(64);
			if (expired) request.deadlineAt = new Date(Date.now() - 1_000);
			await workRepository.saveHelpRequest(request);

			const gate = vi
				.spyOn(Container.get(WorkHelpResponseGate), 'canUseAgentResponses')
				.mockReturnValue(true);
			const owner = Container.get(DepartmentConsultationInvocationOwnerProxy);
			const lookupOwner = vi.spyOn(owner, 'lookup').mockResolvedValue({
				kind: 'accepted',
				ownerInvocationRef: request.id,
			});
			const snapshotOwner = vi.spyOn(owner, 'snapshot').mockResolvedValue({
				ownerInvocationRef: request.id,
				sequence: '3',
				phase: 'terminal',
				outcome,
			});
			const readResultOwner = vi.spyOn(owner, 'readResult').mockResolvedValue(null);
			try {
				await Container.get(WorkHelpService).reconcilePending();
			} finally {
				gate.mockRestore();
				lookupOwner.mockRestore();
				snapshotOwner.mockRestore();
				readResultOwner.mockRestore();
			}

			expect(
				await workRepository.findHelpRequest(projectId, department.id, ready.id, request.id),
			).toMatchObject({ state: expectedState, version: request.version + 1 });
			expect(
				await workRepository.findHelpResponse(projectId, department.id, ready.id, request.id),
			).toBeNull();
			expect((await work.getWork(projectId, department.id, ready.id)).assigneeMemberId).toBe(
				member.id,
			);
		},
	);

	it.each([false, true])(
		'persists one owner answer across restarted reconcilers and only wakes when blockers clear (blocker: %s)',
		async (hasBlocker) => {
			const { department, ready, agent } = await createReadyWork();
			const responder = await members.create(projectId, actorId, department.id, {
				name: `Responder-${randomUUID()}`,
				role: 'Researcher',
				expertiseTags: ['workflow'],
				requestId: randomUUID(),
			});
			const responderAgent = await createAgentBindingFixture(projectId, true);
			await members.setBinding(projectId, actorId, department.id, responder.id, {
				provider: 'n8n-agent',
				executorId: responderAgent.id,
				expectedVersion: responder.version,
				requestId: randomUUID(),
			});
			const started = await work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			});
			const context = {
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				executionId: randomUUID(),
			};
			const coordination = Container.get(WorkCoordinationService);
			const claimed = await coordination.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: started.work.version,
			});
			nextSnapshot = {
				phase: 'terminal',
				sequence: '90004',
				result: { outcome: 'cancelled', safeSummary: 'Turn stopped for help.' },
			};
			const asked = await coordination.executeToolAction(context, randomUUID(), {
				action: 'ask',
				expectedVersion: claimed.work.version,
				question: 'How should I verify the published workflow?',
				attemptedSteps: ['Checked the latest run.'],
				reason: 'The expected evidence is unclear.',
				expertiseTags: ['workflow'],
			});
			if (!('helpRequest' in asked)) throw new Error('Expected a help request result.');
			const request = await workRepository.findHelpRequest(
				projectId,
				department.id,
				ready.id,
				asked.helpRequest.id,
			);
			if (!request) throw new Error('Missing help request.');
			request.state = 'queued';
			request.ownerInvocationHash = 'b'.repeat(64);
			await workRepository.saveHelpRequest(request);
			if (hasBlocker) {
				const blocker = await work.createWork(projectId, actorId, department.id, {
					instruction: 'Resolve the prerequisite first',
					priority: 'normal',
					reviewPolicy: 'required',
					requestId: randomUUID(),
				});
				await workRepository.saveRelationship(
					Object.assign(new WorkRelationship(), {
						id: randomUUID(),
						projectId,
						departmentId: department.id,
						workId: blocker.id,
						relatedWorkId: ready.id,
						kind: 'blocks' as const,
					}),
				);
			}
			const workItem = await work.getWork(projectId, department.id, ready.id);
			const contextHash = createHash('sha256')
				.update(
					[
						`Work: ${workItem.instruction}`,
						`Question: ${request.question}`,
						`Reason: ${request.reason}`,
						`Steps already tried: ${['Checked the latest run.'].join('\n')}`,
					].join('\n\n'),
				)
				.digest('hex');

			const gate = vi
				.spyOn(Container.get(WorkHelpResponseGate), 'canUseAgentResponses')
				.mockReturnValue(true);
			const owner = Container.get(DepartmentConsultationInvocationOwnerProxy);
			const lookupOwner = vi.spyOn(owner, 'lookup').mockResolvedValue({
				kind: 'accepted',
				ownerInvocationRef: request.id,
			});
			const snapshotOwner = vi.spyOn(owner, 'snapshot').mockResolvedValue({
				ownerInvocationRef: request.id,
				sequence: '4',
				phase: 'terminal',
				outcome: 'succeeded',
			});
			const readResultOwner = vi.spyOn(owner, 'readResult').mockResolvedValue({
				invocationId: request.id,
				helpRequestId: request.id,
				ownerInvocationRef: request.id,
				sequence: '4',
				resultHash: 'c'.repeat(64),
				contextHash,
				answer: 'Compare the latest run with the requested result.',
			});
			const restartedService = new WorkHelpService(
				Container.get(WorkRepository),
				Container.get(DirectoryRepository),
				Container.get(WorkHelpRoutingService),
				Container.get(WorkReleaseService),
				Container.get(TransactionRunner),
				Container.get(DepartmentExecutorProxy),
				owner,
				work,
				Container.get(WorkHelpResponseGate),
				Container.get(AiDepartmentOperationsBroadcaster),
			);
			try {
				await Promise.all([
					Container.get(WorkHelpService).reconcilePending(),
					restartedService.reconcilePending(),
				]);
			} finally {
				gate.mockRestore();
				lookupOwner.mockRestore();
				snapshotOwner.mockRestore();
				readResultOwner.mockRestore();
			}

			expect(
				await workRepository.findHelpRequest(projectId, department.id, ready.id, request.id),
			).toMatchObject({ state: 'answered', version: request.version + 1 });
			expect(
				await workRepository.findHelpResponse(projectId, department.id, ready.id, request.id),
			).toMatchObject({
				responderKind: 'agent',
				responderMemberId: responder.id,
				answer: 'Compare the latest run with the requested result.',
			});
			expect(await work.getWork(projectId, department.id, ready.id)).toMatchObject({
				state: hasBlocker ? 'blocked' : 'ready',
				assigneeMemberId: ready.assigneeMemberId,
			});
			expect(await work.listAttempts(projectId, department.id, ready.id)).toHaveLength(
				hasBlocker ? 1 : 2,
			);
			if (!hasBlocker) {
				expect(
					await workRepository.findWakeIntent(projectId, department.id, ready.id),
				).toMatchObject({
					actorId,
					deliveredAt: expect.any(Date),
				});
				const attempts = await workRepository.listAttempts(projectId, ready.id);
				const resumedAttempt = attempts.at(-1);
				if (!resumedAttempt) throw new Error('Missing resumed requester attempt.');
				const inspected = await Container.get(WorkCoordinationService).executeToolAction(
					{
						projectId,
						executorId: resumedAttempt.executorId,
						attemptId: resumedAttempt.id,
						executionId: randomUUID(),
					},
					randomUUID(),
					{ action: 'inspect' },
				);
				if (!('work' in inspected)) throw new Error('Expected an inspected Work item.');
				expect(inspected.work.helpAnswers).toEqual([
					{
						question: 'How should I verify the published workflow?',
						answer: 'Compare the latest run with the requested result.',
						responderKind: 'agent',
						answeredAt: expect.any(String),
					},
				]);
			}
		},
	);

	it('stores one authorized human answer after terminal stop proof without waking the requester', async () => {
		const { department, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const current = await work.getWork(projectId, department.id, ready.id);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: current.version,
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '90002',
			result: { outcome: 'cancelled', safeSummary: 'Turn stopped for help.' },
		};
		const asked = await coordination.executeToolAction(context, randomUUID(), {
			action: 'ask',
			expectedVersion: claim.work.version,
			question: 'How should I verify the result?',
			attemptedSteps: ['Checked the workflow run.'],
			reason: 'The expected evidence is unclear.',
			expertiseTags: ['workflow'],
		});
		if (!('helpRequest' in asked)) throw new Error('Expected a help request result.');
		const requestId = randomUUID();
		const answerInput = {
			expectedVersion: asked.helpRequest.version,
			answer: 'Compare the run output with the requested result.',
			requestId,
		};
		const competingAnswerInput = {
			...answerInput,
			answer: 'Check the evidence against the requested result.',
			requestId: randomUUID(),
		};
		const help = Container.get(WorkHelpService);
		const savedRequest = await workRepository.findHelpRequest(
			projectId,
			department.id,
			ready.id,
			asked.helpRequest.id,
		);
		if (!savedRequest) throw new Error('Missing help request.');
		savedRequest.deadlineAt = new Date(Date.now() - 1000);
		await workRepository.saveHelpRequest(savedRequest);
		await expect(
			help.answer(projectId, department.id, ready.id, asked.helpRequest.id, actorId, {
				...answerInput,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('help request has expired');
		savedRequest.deadlineAt = null;
		await workRepository.saveHelpRequest(savedRequest);
		const competingAnswers = await Promise.allSettled([
			help.answer(projectId, department.id, ready.id, asked.helpRequest.id, actorId, answerInput),
			help.answer(
				projectId,
				department.id,
				ready.id,
				asked.helpRequest.id,
				actorId,
				competingAnswerInput,
			),
		]);
		expect(competingAnswers.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
		expect(competingAnswers.filter(({ status }) => status === 'rejected')).toHaveLength(1);
		const winningIndex = competingAnswers.findIndex(({ status }) => status === 'fulfilled');
		const winningInput = winningIndex === 0 ? answerInput : competingAnswerInput;
		const winningResult = competingAnswers[winningIndex];
		if (!winningResult || winningResult.status !== 'fulfilled') {
			throw new Error('Expected one accepted answer.');
		}
		const first = winningResult.value;
		expect(
			await help.answer(
				projectId,
				department.id,
				ready.id,
				asked.helpRequest.id,
				actorId,
				winningInput,
			),
		).toEqual(first);
		expect(await help.listForWork(projectId, department.id, ready.id)).toMatchObject([
			{
				request: { id: asked.helpRequest.id, state: 'answered' },
				response: { answer: winningInput.answer },
			},
		]);
		expect((await help.listAttention(projectId, department.id)).items).toHaveLength(0);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(dispatch).toHaveBeenCalledTimes(1);
		await expect(
			help.answer(projectId, department.id, ready.id, asked.helpRequest.id, actorId, {
				...winningInput,
				answer: 'A different answer.',
			}),
		).rejects.toThrow('different work command');
		await expect(
			help.answer(projectId, department.id, ready.id, asked.helpRequest.id, actorId, {
				...answerInput,
				requestId: randomUUID(),
				answer: 'A second responder answer.',
			}),
		).rejects.toThrow('already has a response');
	});

	it.each([false, true])(
		'creates and replays one assigned child work item for a current Agent claim (parent stops first: %s)',
		async (parentStopsFirst) => {
			const { department, member, ready, agent, goal } = await createReadyWork(
				'required',
				undefined,
				'Cafe campaign',
			);
			const started = await work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			});
			const context = {
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				executionId: randomUUID(),
			};
			const coordination = Container.get(WorkCoordinationService);
			const current = await work.getWork(projectId, department.id, ready.id);
			const claim = await coordination.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: current.version,
			});
			if (parentStopsFirst) {
				nextSnapshot = {
					phase: 'terminal',
					sequence: '100004',
					result: { outcome: 'succeeded' },
				};
			}
			const recipient = await members.create(projectId, actorId, department.id, {
				name: `Delegate-${randomUUID()}`,
				role: 'Researcher',
				expertiseTags: [],
				requestId: randomUUID(),
			});
			const unboundRecipient = await members.create(projectId, actorId, department.id, {
				name: `Unbound-delegate-${randomUUID()}`,
				role: 'Researcher',
				expertiseTags: [],
				managerMemberId: member.id,
				requestId: randomUUID(),
			});
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: unboundRecipient.id,
					title: 'Unbound recipient',
					instruction: 'This member has no executor binding.',
				}),
			).rejects.toThrow('Delegate recipient or parent work not found.');
			const archivedRecipient = await members.create(projectId, actorId, department.id, {
				name: `Archived-delegate-${randomUUID()}`,
				role: 'Researcher',
				expertiseTags: [],
				managerMemberId: member.id,
				requestId: randomUUID(),
			});
			const archivedRecipientAgent = await createAgentBindingFixture(projectId, true);
			await members.setBinding(projectId, actorId, department.id, archivedRecipient.id, {
				provider: 'n8n-agent',
				executorId: archivedRecipientAgent.id,
				expectedVersion: archivedRecipient.version,
				requestId: randomUUID(),
			});
			await members.archive(projectId, actorId, department.id, archivedRecipient.id, {
				expectedVersion: archivedRecipient.version + 1,
				requestId: randomUUID(),
			});
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: archivedRecipient.id,
					title: 'Archived recipient',
					instruction: 'Do not assign work to an archived member.',
				}),
			).rejects.toThrow('Delegate recipient or parent work not found.');
			const otherDepartment = await departments.create(projectId, actorId, {
				name: `Other-${randomUUID()}`,
				requestId: randomUUID(),
			});
			const crossDepartmentRecipient = await members.create(
				projectId,
				actorId,
				otherDepartment.id,
				{
					name: `Cross-department-${randomUUID()}`,
					role: 'Researcher',
					expertiseTags: [],
					requestId: randomUUID(),
				},
			);
			const otherProjectId = (await createTeamProject('AI Department cross-project delegate')).id;
			const otherProjectDepartment = await departments.create(otherProjectId, actorId, {
				name: `Other-project-${randomUUID()}`,
				requestId: randomUUID(),
			});
			const crossProjectRecipient = await members.create(
				otherProjectId,
				actorId,
				otherProjectDepartment.id,
				{
					name: `Cross-project-${randomUUID()}`,
					role: 'Researcher',
					expertiseTags: [],
					requestId: randomUUID(),
				},
			);
			const crossProjectAgent = await createAgentBindingFixture(otherProjectId, true);
			await members.setBinding(
				otherProjectId,
				actorId,
				otherProjectDepartment.id,
				crossProjectRecipient.id,
				{
					provider: 'n8n-agent',
					executorId: crossProjectAgent.id,
					expectedVersion: crossProjectRecipient.version,
					requestId: randomUUID(),
				},
			);
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: crossDepartmentRecipient.id,
					title: 'Cross department request',
					instruction: 'Do not create this child.',
				}),
			).rejects.toThrow('Delegate recipient or parent work not found.');
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: crossProjectRecipient.id,
					title: 'Cross project request',
					instruction: 'Do not create this child.',
				}),
			).rejects.toThrow('Delegate recipient or parent work not found.');
			const recipientAgent = await createAgentBindingFixture(projectId, true);
			await members.setBinding(projectId, actorId, department.id, recipient.id, {
				provider: 'n8n-agent',
				executorId: recipientAgent.id,
				expectedVersion: recipient.version,
				requestId: randomUUID(),
			});
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: recipient.id,
					title: 'Peer assignment',
					instruction: 'This member does not report to the current Agent.',
				}),
			).rejects.toThrow('direct report');
			const boundMember = await workRepository.findMember(projectId, department.id, recipient.id);
			if (!boundMember) throw new Error('Expected the bound delegate recipient.');
			const directReport = await members.update(projectId, actorId, department.id, recipient.id, {
				managerMemberId: member.id,
				expectedVersion: boundMember.version,
				requestId: randomUUID(),
			});
			const staleManagerLink = await members.update(
				projectId,
				actorId,
				department.id,
				directReport.id,
				{ managerMemberId: null, expectedVersion: directReport.version, requestId: randomUUID() },
			);
			await expect(
				coordination.executeToolAction(context, randomUUID(), {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: staleManagerLink.id,
					title: 'Stale manager link',
					instruction: 'Do not delegate after the reporting line changes.',
				}),
			).rejects.toThrow('direct report');
			const restoredDirectReport = await members.update(
				projectId,
				actorId,
				department.id,
				directReport.id,
				{
					managerMemberId: member.id,
					expectedVersion: staleManagerLink.version,
					requestId: randomUUID(),
				},
			);
			const recipientBinding = await directoryRepository.findBinding(projectId, recipient.id);
			if (!recipientBinding) throw new Error('Expected the delegate recipient binding.');
			const requestId = randomUUID();
			const input = {
				action: 'delegate' as const,
				expectedVersion: claim.work.version,
				recipientMemberId: restoredDirectReport.id,
				title: 'Check the connection',
				instruction: 'Verify the connection and report the result.',
			};
			const first = await coordination.executeToolAction(context, requestId, input);
			if (parentStopsFirst) nextSnapshot = { phase: 'active', sequence: '100005' };
			expect('child' in first).toBe(true);
			if (!('child' in first)) throw new Error('Expected a child work result.');
			expect(first.child).toMatchObject({
				departmentId: department.id,
				assigneeMemberId: directReport.id,
				goalId: goal?.id,
				instruction: 'Check the connection\n\nVerify the connection and report the result.',
				state: 'ready',
			});
			expect(first.relationships.map(({ kind }) => kind).sort()).toEqual(['blocks', 'parent']);
			const waitingRelease = parentStopsFirst
				? await workRepository.findConfirmedWaitingRelease(
						projectId,
						department.id,
						ready.id,
						started.attemptId!,
					)
				: await workRepository.findPendingReleaseForAttempt(projectId, started.attemptId!);
			expect(waitingRelease).toMatchObject({
				reason: 'waiting_for_children',
				waitingForChildren: true,
				state: parentStopsFirst ? 'confirmed' : 'awaiting_stop',
			});
			expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
			expect((await work.getWork(projectId, department.id, ready.id)).assigneeMemberId).toBe(
				member.id,
			);
			const eligibility = await workRepository.listPendingEligibility(
				projectId,
				recipient.id,
				actorId,
				recipientBinding.version,
				50,
				{},
			);
			expect(eligibility).toHaveLength(1);
			expect(eligibility[0]).toMatchObject({ workId: first.child.id, state: 'pending' });
			expect(
				await workRepository.findWakeLane(
					projectId,
					recipient.id,
					actorId,
					recipientBinding.version,
					{},
				),
			).toMatchObject({ generation: 1, state: 'pending' });
			expect(
				await workRepository.findWakeIntent(projectId, department.id, first.child.id),
			).toMatchObject({ workId: first.child.id, deliveredAt: null });
			const replay = await coordination.executeToolAction(context, requestId, {
				...input,
				expectedVersion: claim.work.version + 1,
			});
			expect(replay).toEqual(first);
			expect(
				await workRepository.listPendingEligibility(
					projectId,
					recipient.id,
					actorId,
					recipientBinding.version,
					50,
					{},
				),
			).toHaveLength(1);
			expect(
				await workRepository.listRelationships(projectId, department.id, ready.id),
			).toHaveLength(2);
			await expect(
				coordination.executeToolAction(context, requestId, {
					...input,
					instruction: 'Use different instructions.',
				}),
			).rejects.toThrow('different work command');
			await expect(
				coordination.executeAction(context, randomUUID(), {
					action: 'submit',
					expectedVersion: (await work.getWork(projectId, department.id, ready.id)).version,
					report: {
						result: 'The parent result is complete.',
						completedWork: [],
						checkedEvidence: [],
						openIssues: [],
						nextSteps: [],
					},
				}),
			).rejects.toThrow(
				parentStopsFirst
					? 'This work attempt no longer accepts updates.'
					: 'waiting for the current run to stop',
			);
			const childStart = await work.startWork(projectId, actorId, department.id, first.child.id, {
				expectedVersion: first.child.version,
				requestId: randomUUID(),
			});
			const childContext = {
				projectId,
				executorId: recipientAgent.id,
				attemptId: childStart.attemptId!,
				executionId: randomUUID(),
			};
			const childClaim = await coordination.executeAction(childContext, randomUUID(), {
				action: 'claim',
				expectedVersion: childStart.work.version,
			});
			const childReport = {
				result: 'Connection verified.',
				completedWork: ['Checked the target connection.'],
				checkedEvidence: [],
				openIssues: [],
				nextSteps: [],
			};
			await coordination.executeAction(childContext, randomUUID(), {
				action: 'submit',
				expectedVersion: childClaim.work.version,
				report: childReport,
			});
			nextSnapshot = {
				phase: 'terminal',
				sequence: '100006',
				result: { outcome: 'succeeded' },
			};
			await work.reconcileAttempts();
			const childReview = await work.getWork(projectId, department.id, first.child.id);
			const childAttempt = await workRepository.findAttempt(projectId, childStart.attemptId!);
			if (!childAttempt) throw new Error('Expected the child attempt.');
			const childReviewCommand = {
				expectedVersion: childReview.version,
				attemptId: childStart.attemptId!,
				resultId: childAttempt.submittedResultId!,
				reviewRoundId: childAttempt.reviewRoundId!,
				stageId: childReview.reviewStages[childReview.currentReviewStageIndex]?.id,
				expectedReviewVersion: 1,
				decision: 'accept' as const,
				requestId: randomUUID(),
			};
			await work.reviewWork(projectId, actorId, department.id, first.child.id, childReviewCommand);
			expect((await work.getWork(projectId, department.id, ready.id)).state).toBe(
				parentStopsFirst ? 'ready' : 'blocked',
			);
			if (!parentStopsFirst) {
				await Container.get(WorkReleaseService).reconcilePending();
			}
			const parentAfterChild = await work.getWork(projectId, department.id, ready.id);
			expect(parentAfterChild.state).toBe('ready');
			expect(parentAfterChild.childReports).toEqual([
				{ workId: first.child.id, state: 'done', report: childReport },
			]);
			expect(
				await Container.get(DataSource).manager.find(WorkEligibility, {
					where: { projectId, workId: ready.id, state: 'pending' },
				}),
			).toHaveLength(1);
			const parentRetry = await work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: parentAfterChild.version,
				requestId: randomUUID(),
			});
			const parentRetryContext = {
				...context,
				attemptId: parentRetry.attemptId!,
				executionId: randomUUID(),
			};
			const parentRetryClaim = await coordination.executeAction(parentRetryContext, randomUUID(), {
				action: 'claim',
				expectedVersion: parentRetry.work.version,
			});
			await expect(
				coordination.executeToolAction(parentRetryContext, randomUUID(), {
					...input,
					expectedVersion: parentRetryClaim.work.version,
				}),
			).rejects.toThrow('A matching child work item already exists');
			expect(
				await workRepository.listRelationships(projectId, department.id, ready.id),
			).toHaveLength(2);
			await work.reviewWork(projectId, actorId, department.id, first.child.id, childReviewCommand);
		},
	);

	it('keeps a delegated parent blocked while the Agents owner outcome is unknown', async () => {
		const { department, member, ready, agent } = await createReadyWork('required');
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const directReport = await members.create(projectId, actorId, department.id, {
			name: `Unknown-owner-direct-report-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const directReportAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, directReport.id, {
			provider: 'n8n-agent',
			executorId: directReportAgent.id,
			expectedVersion: directReport.version,
			requestId: randomUUID(),
		});
		nextSnapshot = { phase: 'unknown', sequence: '2' };
		nextStop = { status: 'unknown', acknowledged: false, confirmed: false };
		const delegated = await coordination.executeToolAction(context, randomUUID(), {
			action: 'delegate',
			expectedVersion: claim.work.version,
			recipientMemberId: directReport.id,
			title: 'Check an uncertain owner release',
			instruction: 'Check the assigned item and report the result.',
		});
		if (!('child' in delegated)) throw new Error('Expected delegated child work.');
		await Container.get(WorkReleaseService).reconcilePending();

		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(
			await workRepository.findPendingReleaseForAttempt(projectId, started.attemptId!),
		).toMatchObject({ reason: 'waiting_for_children', state: 'awaiting_stop' });
		expect(
			await Container.get(DataSource).manager.find(WorkEligibility, {
				where: { projectId, workId: ready.id, state: 'pending' },
			}),
		).toHaveLength(0);

		nextSnapshot = { phase: 'terminal', sequence: '3', result: { outcome: 'succeeded' } };
		nextStop = { status: 'accepted', acknowledged: true, confirmed: true };
		await Container.get(WorkReleaseService).reconcilePending();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
	});

	it('rolls back delegated work and wake records when the transaction cannot persist its wake intent', async () => {
		const { department, member, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const recipient = await members.create(projectId, actorId, department.id, {
			name: `Atomic-delegate-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const recipientAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, recipient.id, {
			provider: 'n8n-agent',
			executorId: recipientAgent.id,
			expectedVersion: recipient.version,
			requestId: randomUUID(),
		});
		const dataSource = Container.get(DataSource);
		const initialWorkCount = await dataSource.manager.count(WorkItem, {
			where: { projectId, departmentId: department.id },
		});
		const initialWakeIntentCount = await dataSource.manager.count(WorkWakeIntent, {
			where: { projectId, departmentId: department.id },
		});
		const requestId = randomUUID();
		const wakeIntentWrite = vi
			.spyOn(workRepository, 'saveWakeIntent')
			.mockRejectedValueOnce(new Error('Simulated wake intent persistence failure.'));
		try {
			await expect(
				coordination.executeToolAction(context, requestId, {
					action: 'delegate',
					expectedVersion: claim.work.version,
					recipientMemberId: recipient.id,
					title: 'Atomic child assignment',
					instruction: 'Verify the campaign inputs.',
				}),
			).rejects.toThrow('Simulated wake intent persistence failure.');
		} finally {
			wakeIntentWrite.mockRestore();
		}

		expect(
			await dataSource.manager.count(WorkItem, {
				where: { projectId, departmentId: department.id },
			}),
		).toBe(initialWorkCount);
		expect(await workRepository.listRelationships(projectId, department.id, ready.id)).toEqual([]);
		expect(
			await dataSource.manager.count(WorkWakeIntent, {
				where: { projectId, departmentId: department.id },
			}),
		).toBe(initialWakeIntentCount);
		expect(
			await workRepository.listPendingEligibility(projectId, recipient.id, actorId, 1, 50, {}),
		).toEqual([]);
		expect(await workRepository.findWakeLane(projectId, recipient.id, actorId, 1, {})).toBeNull();
		expect(await directoryRepository.findReceipt(projectId, actorId, requestId)).toBeNull();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('running');
		expect(await work.getCurrentClaim(projectId, department.id, ready.id)).toMatchObject({
			state: 'active',
		});
	});

	it('returns accepted child reports to a resumed parent Agent through inspect', async () => {
		const { department, member, ready, agent } = await createReadyWork('required');
		const coordination = Container.get(WorkCoordinationService);
		const staff = await members.create(projectId, actorId, department.id, {
			name: `Report-visible-staff-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const staffAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, staff.id, {
			provider: 'n8n-agent',
			executorId: staffAgent.id,
			expectedVersion: staff.version,
			requestId: randomUUID(),
		});

		const firstAttempt = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const firstContext = {
			projectId,
			executorId: agent.id,
			attemptId: firstAttempt.attemptId!,
			executionId: randomUUID(),
		};
		const firstClaim = await coordination.executeAction(firstContext, randomUUID(), {
			action: 'claim',
			expectedVersion: firstAttempt.work.version,
		});
		const delegated = await coordination.executeToolAction(firstContext, randomUUID(), {
			action: 'delegate',
			expectedVersion: firstClaim.work.version,
			recipientMemberId: staff.id,
			title: 'Research campaign examples',
			instruction: 'Find two useful examples for the campaign.',
		});
		if (!('child' in delegated)) throw new Error('Expected delegated child work.');

		nextSnapshot = { phase: 'terminal', sequence: '200001', result: { outcome: 'succeeded' } };
		await Container.get(WorkReleaseService).reconcilePending();
		await runAndAcceptChild(
			department.id,
			delegated.child.id,
			staff.id,
			staffAgent.id,
			'Use short-form video and a weekday offer to reach nearby customers.',
			'200002',
		);

		const resumed = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: (await work.getWork(projectId, department.id, ready.id)).version,
			requestId: randomUUID(),
		});
		const resumedContext = {
			projectId,
			executorId: agent.id,
			attemptId: resumed.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await coordination.executeAction(resumedContext, randomUUID(), {
			action: 'claim',
			expectedVersion: resumed.work.version,
		});
		const inspected = await coordination.executeAction(resumedContext, randomUUID(), {
			action: 'inspect',
			expectedVersion: claimed.work.version,
		});
		expect(inspected.work.childReports).toEqual([
			{
				workId: delegated.child.id,
				state: 'done',
				report: expect.objectContaining({
					result: 'Use short-form video and a weekday offer to reach nearby customers.',
				}),
			},
		]);
	});

	it('resumes a parent once for each sequential child and keeps the terminal attempts single', async () => {
		const { department, member, ready, agent, goal } = await createReadyWork(
			'required',
			undefined,
			'Cafe campaign',
		);
		const coordination = Container.get(WorkCoordinationService);
		const firstDelegate = await members.create(projectId, actorId, department.id, {
			name: `First-delegate-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const secondDelegate = await members.create(projectId, actorId, department.id, {
			name: `Second-delegate-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const firstAgent = await createAgentBindingFixture(projectId, true);
		const secondAgent = await createAgentBindingFixture(projectId, true);
		for (const [recipient, executorId] of [
			[firstDelegate, firstAgent.id],
			[secondDelegate, secondAgent.id],
		] as const) {
			await members.setBinding(projectId, actorId, department.id, recipient.id, {
				provider: 'n8n-agent',
				executorId,
				expectedVersion: recipient.version,
				requestId: randomUUID(),
			});
		}

		const firstParentAttempt = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const firstParentContext = {
			projectId,
			executorId: agent.id,
			attemptId: firstParentAttempt.attemptId!,
			executionId: randomUUID(),
		};
		const firstParentClaim = await coordination.executeAction(firstParentContext, randomUUID(), {
			action: 'claim',
			expectedVersion: firstParentAttempt.work.version,
		});
		const firstChildResult = await coordination.executeToolAction(
			firstParentContext,
			randomUUID(),
			{
				action: 'delegate',
				expectedVersion: firstParentClaim.work.version,
				recipientMemberId: firstDelegate.id,
				title: 'Review local competitors',
				instruction: 'Collect three comparable offers.',
			},
		);
		if (!('child' in firstChildResult)) throw new Error('Expected the first delegated child.');
		expect(firstChildResult.child.goalId).toBe(goal?.id);

		nextSnapshot = { phase: 'terminal', sequence: '200001', result: { outcome: 'succeeded' } };
		await Container.get(WorkReleaseService).reconcilePending();
		const firstChild = await runAndAcceptChild(
			department.id,
			firstChildResult.child.id,
			firstDelegate.id,
			firstAgent.id,
			'First child report.',
			'200002',
		);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');
		expect(firstChild).toMatchObject({ state: 'done' });

		const secondParentAttempt = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: (await work.getWork(projectId, department.id, ready.id)).version,
			requestId: randomUUID(),
		});
		const secondParentContext = {
			projectId,
			executorId: agent.id,
			attemptId: secondParentAttempt.attemptId!,
			executionId: randomUUID(),
		};
		const secondParentClaim = await coordination.executeAction(secondParentContext, randomUUID(), {
			action: 'claim',
			expectedVersion: secondParentAttempt.work.version,
		});
		const secondChildResult = await coordination.executeToolAction(
			secondParentContext,
			randomUUID(),
			{
				action: 'delegate',
				expectedVersion: secondParentClaim.work.version,
				recipientMemberId: secondDelegate.id,
				title: 'Draft campaign messages',
				instruction: 'Prepare three short post drafts.',
			},
		);
		if (!('child' in secondChildResult)) throw new Error('Expected the second delegated child.');
		expect(secondChildResult.child.goalId).toBe(goal?.id);
		await runAndAcceptChild(
			department.id,
			secondChildResult.child.id,
			secondDelegate.id,
			secondAgent.id,
			'Second child report.',
			'200003',
		);

		const parent = await work.getWork(projectId, department.id, ready.id);
		expect(parent.state).toBe('ready');
		expect(parent.childReports).toEqual(
			expect.arrayContaining([
				{
					workId: firstChildResult.child.id,
					state: 'done',
					report: expect.objectContaining({ result: 'First child report.' }),
				},
				{
					workId: secondChildResult.child.id,
					state: 'done',
					report: expect.objectContaining({ result: 'Second child report.' }),
				},
			]),
		);
		expect(
			await Container.get(DataSource).manager.count(WorkEligibility, {
				where: { projectId, workId: ready.id, state: 'pending' },
			}),
		).toBe(1);
		const parentAttempts = await Container.get(DataSource).manager.findBy(WorkAttempt, {
			projectId,
			workId: ready.id,
		});
		expect(parentAttempts).toHaveLength(2);
		expect(parentAttempts.filter(({ phase }) => phase === 'active')).toHaveLength(0);
	});

	it('keeps the parent blocked when a delegated child is cancelled', async () => {
		const { department, member, ready, agent } = await createReadyWork();
		const recipient = await members.create(projectId, actorId, department.id, {
			name: `Cancelled-child-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: member.id,
			requestId: randomUUID(),
		});
		const recipientAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, recipient.id, {
			provider: 'n8n-agent',
			executorId: recipientAgent.id,
			expectedVersion: recipient.version,
			requestId: randomUUID(),
		});
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const delegated = await coordination.executeToolAction(context, randomUUID(), {
			action: 'delegate',
			expectedVersion: claim.work.version,
			recipientMemberId: recipient.id,
			title: 'Check the cafe brief',
			instruction: 'Confirm the required information.',
		});
		if (!('child' in delegated)) throw new Error('Expected a delegated child.');
		nextSnapshot = { phase: 'terminal', sequence: '300001', result: { outcome: 'succeeded' } };
		await Container.get(WorkReleaseService).reconcilePending();
		const child = await work.getWork(projectId, department.id, delegated.child.id);
		const cancelled = await work.cancelWork(projectId, actorId, department.id, child.id, {
			expectedVersion: child.version,
			requestId: randomUUID(),
		});

		expect(cancelled.work.state).toBe('cancelled');
		expect(await workRepository.hasUnresolvedBlockers(projectId, department.id, ready.id)).toBe(
			true,
		);
		const parent = await work.getWork(projectId, department.id, ready.id);
		expect(parent).toMatchObject({
			state: 'blocked',
			assigneeMemberId: member.id,
			childReports: [{ workId: child.id, state: 'cancelled', report: null }],
		});
		expect(
			await Container.get(DataSource).manager.count(WorkEligibility, {
				where: { projectId, workId: ready.id, state: 'pending' },
			}),
		).toBe(0);
		expect(
			await Container.get(DataSource).manager.count(WorkAttempt, {
				where: { projectId, workId: ready.id, phase: 'active' },
			}),
		).toBe(0);
	});

	it('recovers a reassigned parent wake after binding restoration and service reconstruction', async () => {
		const { department, ready } = await createReadyWork();
		const parentAgent = await createAgentBindingFixture(projectId, true);
		const reassignedMember = await members.create(projectId, actorId, department.id, {
			name: `Recovery-reassigned-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		await members.setBinding(projectId, actorId, department.id, reassignedMember.id, {
			provider: 'n8n-agent',
			executorId: parentAgent.id,
			expectedVersion: reassignedMember.version,
			requestId: randomUUID(),
		});
		const reassignedWork = await work.updateWork(projectId, actorId, department.id, ready.id, {
			assigneeMemberId: reassignedMember.id,
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const recipient = await members.create(projectId, actorId, department.id, {
			name: `Recovery-child-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			managerMemberId: reassignedMember.id,
			requestId: randomUUID(),
		});
		const recipientAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, recipient.id, {
			provider: 'n8n-agent',
			executorId: recipientAgent.id,
			expectedVersion: recipient.version,
			requestId: randomUUID(),
		});
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: reassignedWork.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId: parentAgent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordination = Container.get(WorkCoordinationService);
		const claim = await coordination.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const delegated = await coordination.executeToolAction(context, randomUUID(), {
			action: 'delegate',
			expectedVersion: claim.work.version,
			recipientMemberId: recipient.id,
			title: 'Collect cafe competitor evidence',
			instruction: 'Return a structured comparison.',
		});
		if (!('child' in delegated)) throw new Error('Expected a delegated child.');
		nextSnapshot = { phase: 'terminal', sequence: '300002', result: { outcome: 'succeeded' } };
		await Container.get(WorkReleaseService).reconcilePending();
		const parentMember = await directoryRepository.findMember(
			projectId,
			department.id,
			reassignedMember.id,
		);
		if (!parentMember) throw new Error('Expected the parent member.');
		await members.clearBinding(projectId, actorId, department.id, reassignedMember.id, {
			expectedVersion: parentMember.version,
			requestId: randomUUID(),
		});
		await runAndAcceptChild(
			department.id,
			delegated.child.id,
			recipient.id,
			recipientAgent.id,
			'Competitor comparison complete.',
			'300003',
		);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(
			await Container.get(DataSource).manager.count(WorkEligibility, {
				where: { projectId, workId: ready.id, state: 'pending' },
			}),
		).toBe(0);

		const unboundParent = await directoryRepository.findMember(
			projectId,
			department.id,
			reassignedMember.id,
		);
		if (!unboundParent) throw new Error('Expected the parent member after binding clear.');
		await members.setBinding(projectId, actorId, department.id, reassignedMember.id, {
			provider: 'n8n-agent',
			executorId: parentAgent.id,
			expectedVersion: unboundParent.version,
			requestId: randomUUID(),
		});
		const recoveredService = new WorkReleaseService(
			workRepository,
			Container.get(TransactionRunner),
			Container.get(DepartmentExecutorProxy),
			directoryRepository,
			Container.get(AiDepartmentOperationsBroadcaster),
		);
		await recoveredService.reconcilePending();

		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');
		const currentBinding = await directoryRepository.findBinding(projectId, reassignedMember.id);
		expect(currentBinding).not.toBeNull();
		expect(
			await Container.get(DataSource).manager.findOneBy(WorkEligibility, {
				projectId,
				workId: ready.id,
				state: 'pending',
			}),
		).toMatchObject({
			memberId: reassignedMember.id,
			bindingVersion: currentBinding?.version,
			actorId,
		});
		expect(
			await workRepository.findConfirmedWaitingRelease(
				projectId,
				department.id,
				ready.id,
				started.attemptId!,
			),
		).toBeNull();
		const laneBeforeRestart = await workRepository.findWakeLane(
			projectId,
			reassignedMember.id,
			actorId,
			currentBinding!.version,
			{},
		);
		await Container.get(WorkReleaseService).reconcilePending();
		expect(await work.getWork(projectId, department.id, ready.id)).toMatchObject({
			state: 'ready',
		});
		expect(
			await Container.get(DataSource).manager.count(WorkEligibility, {
				where: { projectId, workId: ready.id, state: 'pending' },
			}),
		).toBe(1);
		expect(
			await workRepository.findWakeLane(
				projectId,
				reassignedMember.id,
				actorId,
				currentBinding!.version,
				{},
			),
		).toMatchObject({ generation: laneBeforeRestart?.generation });
	});

	it('paginates confirmed parent releases beyond one reconciliation batch', async () => {
		const department = await departments.create(projectId, actorId, {
			name: `Release-pagination-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const ready = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Confirm release pagination.',
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const now = new Date();
		const releases = Array.from({ length: 101 }, (_, index) =>
			Object.assign(new WorkReleaseIntent(), {
				id: `release-${index.toString().padStart(3, '0')}`,
				projectId,
				departmentId: department.id,
				workId: ready.id,
				sourceAttemptId: randomUUID(),
				requestedByActorId: actorId,
				reason: 'waiting_for_children',
				waitingForChildren: true,
				requestId: randomUUID(),
				stopCommandId: randomUUID(),
				state: 'confirmed' as const,
				createdAt: now,
				confirmedAt: now,
			}),
		);
		for (const release of releases) await workRepository.saveRelease(release, {});

		const allPages: WorkReleaseIntent[] = [];
		let afterId: string | undefined;
		while (true) {
			const page = await workRepository.listConfirmedWaitingParentReleases(100, afterId);
			allPages.push(...page);
			if (page.length < 100) break;
			afterId = page.at(-1)?.id;
		}
		const foundIds = new Set(allPages.map(({ id }) => id));
		expect(releases.every(({ id }) => foundIds.has(id))).toBe(true);
		expect(foundIds.size).toBe(allPages.length);
	});

	async function runAndAcceptChild(
		departmentId: string,
		workId: string,
		memberId: string,
		executorId: string,
		result: string,
		sequence: string,
	) {
		const child = await work.getWork(projectId, departmentId, workId);
		expect(child.assigneeMemberId).toBe(memberId);
		const started = await work.startWork(projectId, actorId, departmentId, workId, {
			expectedVersion: child.version,
			requestId: randomUUID(),
		});
		const context = {
			projectId,
			executorId,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await Container.get(WorkCoordinationService).executeAction(
			context,
			randomUUID(),
			{ action: 'claim', expectedVersion: started.work.version },
		);
		const report = {
			result,
			completedWork: [`Completed ${result}`],
			checkedEvidence: [],
			openIssues: [],
			nextSteps: [],
		};
		await Container.get(WorkCoordinationService).executeAction(context, randomUUID(), {
			action: 'submit',
			expectedVersion: claimed.work.version,
			report,
		});
		nextSnapshot = { phase: 'terminal', sequence, result: { outcome: 'succeeded' } };
		await work.reconcileAttempts();
		const submitted = await work.getWork(projectId, departmentId, workId);
		const attempt = await workRepository.findAttempt(projectId, started.attemptId!);
		if (!attempt?.submittedResultId || !attempt.reviewRoundId)
			throw new Error('Expected the submitted child result and review round.');
		await work.reviewWork(projectId, actorId, departmentId, workId, {
			expectedVersion: submitted.version,
			attemptId: started.attemptId!,
			resultId: attempt.submittedResultId,
			reviewRoundId: attempt.reviewRoundId,
			stageId: submitted.reviewStages[submitted.currentReviewStageIndex]?.id,
			expectedReviewVersion: 1,
			decision: 'accept',
			requestId: randomUUID(),
		});
		return await work.getWork(projectId, departmentId, workId);
	}

	it('does not snapshot legacy enabled workflow capabilities while the invocation gate is closed', async () => {
		const { department, member, ready } = await createReadyWork();
		const now = new Date();
		await Container.get(WorkflowCapabilityRepository).save(
			Object.assign(new WorkflowCapability(), {
				id: randomUUID(),
				projectId,
				departmentId: department.id,
				memberId: member.id,
				workflowId: 'legacy-enabled-workflow',
				purpose: 'Legacy capability',
				publishedVersionRef: 'published-v1',
				triggerCompatibilityRef: 'execute-workflow-v1',
				inputSchemaFingerprint: 'schema-v1',
				enabled: true,
				version: 1,
				createdAt: now,
				updatedAt: now,
			}),
		);

		await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});

		expect(dispatch).toHaveBeenCalledOnce();
		expect(dispatch.mock.calls[0][0].workflowIds).toEqual([]);
		expect(dispatch.mock.calls[0][0].workflowCapabilities).toEqual([]);
		const attempt = await workRepository.findAttempt(
			projectId,
			dispatch.mock.calls[0][0].attemptId,
		);
		expect(attempt?.workflowCapabilitiesJson).toBe('[]');
	});

	it('stores one invocation for concurrent inserts with the same attempt request key', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const attemptId = started.attemptId;
		if (!attemptId) throw new Error('Missing test attempt');
		const capability = Object.assign(new WorkflowCapability(), {
			id: randomUUID(),
			projectId,
			departmentId: department.id,
			memberId: member.id,
			workflowId: randomUUID(),
			purpose: 'Test invocation idempotency',
			publishedVersionRef: randomUUID(),
			triggerCompatibilityRef: 'execute-workflow-v1',
			inputSchemaFingerprint: 'schema-v1',
			enabled: true,
			version: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await Container.get(WorkflowCapabilityRepository).save(capability);
		const requestId = randomUUID();
		const invocationKey = randomUUID().replaceAll('-', '');
		const now = new Date();
		const createInvocation = (): WorkflowInvocation =>
			Object.assign(new WorkflowInvocation(), {
				id: randomUUID(),
				projectId,
				workId: ready.id,
				attemptId,
				memberId: member.id,
				capabilityId: capability.id,
				capabilityVersion: capability.version,
				claimGeneration: 1,
				requestId,
				ownerInvocationKey: invocationKey,
				inputHash: 'a'.repeat(64),
				inputsRef: `ai-department-workflow-input:${randomUUID()}`,
				expectedWorkflowVersion: capability.publishedVersionRef,
				actualWorkflowVersion: null,
				ownerExecutionRef: null,
				dispatchState: 'acknowledged' as const,
				childState: 'failed' as const,
				safeResultReference: null,
				safeErrorReference: null,
				version: 1,
				cancelRequestedAt: null,
				createdAt: now,
				updatedAt: now,
			});

		const invocationRepository = Container.get(WorkflowInvocationRepository);
		const inserted = await Promise.all([
			invocationRepository.insertIfAbsent(createInvocation()),
			invocationRepository.insertIfAbsent(createInvocation()),
		]);
		const persisted = await invocationRepository.findByAttemptRequestId(attemptId, requestId);
		const persistedCount = await Container.get(DataSource).manager.count(WorkflowInvocation, {
			where: { attemptId, requestId },
		});

		expect(inserted.filter(Boolean)).toHaveLength(1);
		expect(persistedCount).toBe(1);
		expect(persisted).toMatchObject({ attemptId, requestId, ownerInvocationKey: invocationKey });
		const staleUnknown = createInvocation();
		staleUnknown.id = randomUUID();
		staleUnknown.requestId = randomUUID();
		staleUnknown.dispatchState = 'unknown';
		staleUnknown.childState = 'unknown';
		// Keep these queue-order fixtures ahead of rows left by an interrupted local test run.
		staleUnknown.createdAt = new Date('1900-01-01T00:00:00.000Z');
		staleUnknown.updatedAt = new Date('1900-01-01T00:00:00.000Z');
		const laterUnknown = createInvocation();
		laterUnknown.id = randomUUID();
		laterUnknown.requestId = randomUUID();
		laterUnknown.dispatchState = 'unknown';
		laterUnknown.childState = 'unknown';
		laterUnknown.createdAt = new Date('1901-01-01T00:00:00.000Z');
		laterUnknown.updatedAt = new Date('1901-01-01T00:00:00.000Z');
		await invocationRepository.insertIfAbsent(staleUnknown);
		await invocationRepository.insertIfAbsent(laterUnknown);
		expect(
			(await invocationRepository.findNeedingOwnerReconciliation(1)).map(({ id }) => id),
		).toEqual([staleUnknown.id]);
		await invocationRepository.updateAtVersion(projectId, staleUnknown.id, 1, {
			version: 2,
			dispatchState: 'acknowledged',
			updatedAt: new Date('2200-01-01T00:00:00.000Z'),
		});
		expect(
			(await invocationRepository.findNeedingOwnerReconciliation(1)).map(({ id }) => id),
		).toEqual([laterUnknown.id]);
		await invocationRepository.updateAtVersion(projectId, laterUnknown.id, 1, {
			version: 2,
			dispatchState: 'acknowledged',
		});

		const cancelPending = createInvocation();
		cancelPending.id = randomUUID();
		cancelPending.requestId = randomUUID();
		cancelPending.ownerExecutionRef = 'child-execution-a';
		cancelPending.childState = 'waiting';
		cancelPending.cancelRequestedAt = new Date();
		await invocationRepository.insertIfAbsent(cancelPending);
		const snapshotReconciliation =
			await invocationRepository.findNeedingChildSnapshotReconciliation(1000);
		expect(snapshotReconciliation.map(({ id }) => id)).toContain(cancelPending.id);
		nextSnapshot = { phase: 'terminal', sequence: '2', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('keeps an uncertain dispatch reserved and never starts it again during reconciliation', async () => {
		const { department, ready } = await createReadyWork();
		nextDispatch = { kind: 'unknown' };
		nextLookup = { kind: 'unknown' };
		const result = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});

		expect(result.dispatchState).toBe('unknown');
		const dispatchesForAttempt = () =>
			dispatch.mock.calls.filter(([context]) => context.attemptId === result.attemptId);
		await work.reconcileAttempts();
		expect(dispatchesForAttempt()).toHaveLength(1);
		expect(await workRepository.findDispatchIntent(result.attemptId!)).toMatchObject({
			state: 'unknown',
		});
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');
		nextLookup = { kind: 'accepted', ownerExecutionRef: 'unknown-case-recovered' };
		nextSnapshot = {
			phase: 'terminal',
			sequence: '90',
			result: { outcome: 'failed' },
		};
		await work.reconcileAttempts();
	});

	it('keeps an unconfigured member visible and prevents a work start', async () => {
		const department = await departments.create(projectId, actorId, {
			name: `Unconfigured-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const member = await members.create(projectId, actorId, department.id, {
			name: `Member-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const created = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Do not start without an executor',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, actorId, department.id, created.id, {
			expectedVersion: created.version,
			requestId: randomUUID(),
		});

		const result = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		expect(result).toMatchObject({
			attemptId: null,
			dispatchState: 'unavailable',
			work: { state: 'blocked' },
		});
		expect(await directoryRepository.findMember(projectId, department.id, member.id)).toMatchObject(
			{
				id: member.id,
				archived: false,
			},
		);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('moves ready work to an active destination and creates its eligibility once', async () => {
		const { department, ready } = await createReadyWork();
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const destinationAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, destination.id, {
			provider: 'n8n-agent',
			executorId: destinationAgent.id,
			expectedVersion: destination.version,
			requestId: randomUUID(),
		});
		const command = {
			expectedVersion: ready.version,
			destinationMemberId: destination.id,
			reason: 'Move this item to the analysis owner.',
			requestId: randomUUID(),
		};
		const handoffs = Container.get(WorkHandoffService);
		const result = await handoffs.requestHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			command,
		);
		const replay = await handoffs.requestHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			command,
		);

		expect(result.state).toBe('completed');
		expect(replay).toEqual(result);
		expect(result.work).toMatchObject({ state: 'ready', assigneeMemberId: destination.id });
		const eligibility = await Container.get(DataSource).manager.findOneBy(WorkEligibility, {
			projectId,
			workId: ready.id,
			state: 'pending',
		});
		expect(eligibility).toMatchObject({ memberId: destination.id });
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('routes Agent handoff requests through owner context and coordinator authorization receipts', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const attemptId = started.attemptId;
		if (!attemptId) throw new Error('Missing started attempt');
		const binding = await directoryRepository.findBinding(projectId, member.id);
		if (!binding) throw new Error('Missing source binding');
		const context = {
			projectId,
			executorId: binding.executorId,
			attemptId,
			executionId: 'owner-execution',
		};
		const coordinator = Container.get(WorkCoordinationService);
		const startedWork = await work.getWork(projectId, department.id, ready.id);
		const claim = await coordinator.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: startedWork.version,
		});
		if (!('claim' in claim)) throw new Error('Expected a work claim result');
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const destinationAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, destination.id, {
			provider: 'n8n-agent',
			executorId: destinationAgent.id,
			expectedVersion: destination.version,
			requestId: randomUUID(),
		});
		const requestId = randomUUID();
		const request = {
			action: 'handoff' as const,
			expectedVersion: claim.work.version,
			destinationMemberId: destination.id,
			body: 'Transfer this item to the destination member.',
		};
		const handoffs = Container.get(WorkHandoffService);
		const requested = await coordinator.executeToolAction(context, requestId, request);
		const replay = await coordinator.executeToolAction(context, requestId, request);
		if (!('handoffId' in requested)) throw new Error('Expected a handoff result');
		expect(requested).toMatchObject({ state: 'requested', work: { assigneeMemberId: member.id } });
		expect(replay).toEqual(requested);
		await expect(
			coordinator.executeAction(context, randomUUID(), {
				action: 'progress',
				expectedVersion: claim.work.version,
				body: 'Should be fenced',
			}),
		).rejects.toThrow('waiting for handoff');

		const authorizeCommand = { expectedVersion: claim.work.version, requestId: randomUUID() };
		const authorizedResult = await handoffs.authorizeHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			requested.handoffId,
			authorizeCommand,
		);
		const authorizeReplay = await handoffs.authorizeHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			requested.handoffId,
			authorizeCommand,
		);
		expect(authorizedResult.state).toBe('awaiting_stop');
		expect(authorizeReplay).toEqual(authorizedResult);
		expect(requestStop).toHaveBeenCalledTimes(1);
	});

	it('keeps handoff pending until a correlated owner snapshot confirms stop', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const destinationAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, destination.id, {
			provider: 'n8n-agent',
			executorId: destinationAgent.id,
			expectedVersion: destination.version,
			requestId: randomUUID(),
		});
		const handoffs = Container.get(WorkHandoffService);
		const command = {
			expectedVersion: started.work.version,
			destinationMemberId: destination.id,
			reason: 'Transfer after the current run stops.',
			requestId: randomUUID(),
		};
		const pending = await handoffs.requestHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			command,
		);
		expect(pending.state).toBe('awaiting_stop');
		expect(pending.work.assigneeMemberId).toBe(member.id);
		await expect(
			Container.get(WorkCoordinationService).executeAction(
				{
					projectId,
					executorId: (await directoryRepository.findBinding(projectId, member.id))!.executorId,
					attemptId: started.attemptId!,
					executionId: randomUUID(),
				},
				randomUUID(),
				{ action: 'claim', expectedVersion: started.work.version },
			),
		).rejects.toThrow('waiting for handoff');
		expect(
			(
				await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
					projectId,
					memberId: member.id,
					actorId,
					bindingVersion: 1,
				})
			)?.activeAttemptId,
		).toBe(started.attemptId);

		nextSnapshot = {
			phase: 'terminal',
			sequence: '200000',
			result: { outcome: 'cancelled', reference: 'owner-confirmed-stop' },
		};
		await handoffs.reconcilePending();
		const completed = await handoffs.getHandoff(
			projectId,
			department.id,
			ready.id,
			pending.handoffId,
		);
		expect(completed.state).toBe('completed');
		expect(completed.work).toMatchObject({ state: 'ready', assigneeMemberId: destination.id });
		expect(await workRepository.findAttempt(projectId, started.attemptId!)).toMatchObject({
			phase: 'terminal',
			outcome: 'cancelled',
		});
		const sourceAttempt = await workRepository.findAttempt(projectId, started.attemptId!);
		if (!sourceAttempt) throw new Error('Missing source attempt');
		await expect(
			Container.get(WorkCoordinationService).executeAction(
				{
					projectId,
					executorId: sourceAttempt.executorId,
					attemptId: sourceAttempt.id,
					executionId: randomUUID(),
				},
				randomUUID(),
				{
					action: 'submit',
					expectedVersion: completed.work.version,
					report: {
						result: 'A stale source result',
						completedWork: [],
						checkedEvidence: [],
						openIssues: [],
						nextSteps: [],
					},
				},
			),
		).rejects.toThrow('work assignment has changed');
		expect(
			await Container.get(DataSource).manager.findOneBy(WorkHandoffIntent, {
				id: pending.handoffId,
			}),
		).toMatchObject({ state: 'completed' });
		expect(dispatch).toHaveBeenCalledTimes(1);
	});

	it('cancels pending handoff before a late stop confirmation', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const pending = await Container.get(WorkHandoffService).requestHandoff(
			projectId,
			actorId,
			department.id,
			ready.id,
			{
				expectedVersion: started.work.version,
				destinationMemberId: destination.id,
				reason: 'Transfer after the run stops.',
				requestId: randomUUID(),
			},
		);
		await work.cancelWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: started.work.version,
			requestId: randomUUID(),
		});

		const persisted = await Container.get(DataSource).manager.findOneBy(WorkHandoffIntent, {
			id: pending.handoffId,
		});
		expect(persisted?.state).toBe('cancelled');
		nextSnapshot = {
			phase: 'terminal',
			sequence: '300000',
			result: { outcome: 'cancelled' },
		};
		await Container.get(WorkHandoffService).reconcilePending();
		expect((await work.getWork(projectId, department.id, ready.id)).assigneeMemberId).toBe(
			member.id,
		);
		expect(
			await Container.get(DataSource).manager.findOneBy(WorkEligibility, {
				projectId,
				workId: ready.id,
				memberId: destination.id,
			}),
		).toBeNull();
		await work.reconcileAttempts();
	});

	it('does not assign or wake a destination that is archived before stop confirmation', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const destinationAgent = await createAgentBindingFixture(projectId, true);
		const bound = await members.setBinding(projectId, actorId, department.id, destination.id, {
			provider: 'n8n-agent',
			executorId: destinationAgent.id,
			expectedVersion: destination.version,
			requestId: randomUUID(),
		});
		const handoffs = Container.get(WorkHandoffService);
		const pending = await handoffs.requestHandoff(projectId, actorId, department.id, ready.id, {
			expectedVersion: started.work.version,
			destinationMemberId: destination.id,
			reason: 'Transfer to the analysis owner.',
			requestId: randomUUID(),
		});
		await members.archive(projectId, actorId, department.id, destination.id, {
			expectedVersion: destination.version + 1,
			requestId: randomUUID(),
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '400000',
			result: { outcome: 'cancelled' },
		};
		await handoffs.reconcilePending();

		const rejected = await handoffs.getHandoff(
			projectId,
			department.id,
			ready.id,
			pending.handoffId,
		);
		expect(rejected.state).toBe('rejected');
		expect(rejected.work).toMatchObject({ state: 'blocked', assigneeMemberId: member.id });
		expect(
			await Container.get(DataSource).manager.findOneBy(WorkEligibility, {
				projectId,
				workId: ready.id,
				memberId: destination.id,
			}),
		).toBeNull();
		expect(await directoryRepository.findBinding(projectId, destination.id)).toMatchObject({
			version: bound.bindingVersion,
		});
	});

	it('rejects a destination whose execution authority is revoked before stop confirmation', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const destination = await members.create(projectId, actorId, department.id, {
			name: `Destination-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const destinationAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, destination.id, {
			provider: 'n8n-agent',
			executorId: destinationAgent.id,
			expectedVersion: destination.version,
			requestId: randomUUID(),
		});
		const handoffs = Container.get(WorkHandoffService);
		const pending = await handoffs.requestHandoff(projectId, actorId, department.id, ready.id, {
			expectedVersion: started.work.version,
			destinationMemberId: destination.id,
			reason: 'Transfer to the destination owner.',
			requestId: randomUUID(),
		});
		authorized = false;
		nextSnapshot = {
			phase: 'terminal',
			sequence: '500000',
			result: { outcome: 'cancelled' },
		};
		await handoffs.reconcilePending();

		const rejected = await handoffs.getHandoff(
			projectId,
			department.id,
			ready.id,
			pending.handoffId,
		);
		expect(rejected.state).toBe('rejected');
		expect(rejected.work).toMatchObject({ state: 'blocked', assigneeMemberId: member.id });
		expect(
			await Container.get(DataSource).manager.findOneBy(WorkEligibility, {
				projectId,
				workId: ready.id,
				memberId: destination.id,
			}),
		).toBeNull();
	});

	it('does not dispatch a pending wake after its executor binding revision changes', async () => {
		const { department, member, ready } = await createReadyWork();
		const dataSource = Container.get(DataSource);
		const pending = await dataSource.manager.findOneByOrFail(WorkEligibility, {
			projectId,
			workId: ready.id,
			state: 'pending',
		});
		const wakeRequestId = randomUUID();
		const nextAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: nextAgent.id,
			expectedVersion: member.version + 1,
			requestId: randomUUID(),
		});

		const result = await work.startWork(
			projectId,
			actorId,
			department.id,
			ready.id,
			{ expectedVersion: ready.version, requestId: wakeRequestId },
			false,
			true,
		);

		expect(result).toMatchObject({
			attemptId: null,
			dispatchState: 'rejected',
			work: { state: 'ready' },
		});
		expect(dispatch).not.toHaveBeenCalled();
		await workRepository.markPendingWakesDelivered(ready.id, {});
		expect(
			await dataSource.manager.findOneBy(WorkEligibility, {
				workId: ready.id,
				generation: pending.generation,
			}),
		).toMatchObject({ state: 'cancelled' });
	});

	it('recovers an accepted dispatch after an unknown response without redispatching', async () => {
		const { department, ready } = await createReadyWork();
		nextDispatch = { kind: 'unknown' };
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextLookup = { kind: 'accepted', ownerExecutionRef: 'recovered-ref' };
		nextSnapshot = {
			phase: 'terminal',
			sequence: '250',
			result: { outcome: 'succeeded', reference: 'recovered-result' },
		};

		expect(await work.reconcileAttempts()).toBe(1);
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(await workRepository.findAttempt(projectId, started.attemptId!)).toMatchObject({
			phase: 'terminal',
			ownerExecutionRef: 'recovered-ref',
			outcome: 'failed',
			safeSummary: 'Agent run ended without a submitted result.',
		});
	});

	it('marks a successful owner run without a submitted result as failed and blocked', async () => {
		const { department, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '251',
			result: { outcome: 'succeeded' },
		};

		await work.reconcileAttempts();

		expect(await work.getWork(projectId, department.id, ready.id)).toMatchObject({
			state: 'blocked',
		});
		expect(await workRepository.findAttempt(projectId, started.attemptId!)).toMatchObject({
			phase: 'terminal',
			outcome: 'failed',
			submittedResultId: null,
			safeSummary: 'Agent run ended without a submitted result.',
		});
	});

	it('reports native tool approval separately from the runtime outcome', async () => {
		const { department, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextSnapshot = { phase: 'suspended', sequence: '251' };
		nextNativeToolApproval = 'pending';

		await work.reconcileAttempts();

		expect(await work.listToolApprovalAttention(projectId, department.id)).toMatchObject({
			items: [
				{
					workId: ready.id,
					attemptId: started.attemptId,
					memberId: ready.assigneeMemberId,
					ordinal: 1,
					state: 'pending',
				},
			],
			hasMore: false,
		});
		nextNativeToolApproval = 'unknown';
		expect(await work.listToolApprovalAttention(projectId, department.id)).toMatchObject({
			items: [{ attemptId: started.attemptId, state: 'unknown' }],
			hasMore: false,
		});
		nextNativeToolApproval = 'not_pending';
		expect(await work.listToolApprovalAttention(projectId, department.id)).toEqual({
			items: [],
			hasMore: false,
		});
		nextNativeToolApproval = 'pending';
		snapshot.mockClear();

		expect(await work.listAttempts(projectId, department.id, ready.id)).toContainEqual(
			expect.objectContaining({
				id: started.attemptId,
				phase: 'suspended',
				nativeToolApproval: 'pending',
				outcome: null,
			}),
		);
		expect(nativeToolApproval).toHaveBeenCalled();
		expect(snapshot).not.toHaveBeenCalled();
		nextSnapshot = {
			phase: 'terminal',
			sequence: '252',
			result: { outcome: 'failed' },
		};
		await work.reconcileAttempts();
	});

	it('keeps runtime success without a business report open and deduplicates snapshots', async () => {
		const { department, ready } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '200',
			result: { outcome: 'succeeded', reference: 'execution-ref' },
		};

		expect(await work.reconcileAttempts()).toBe(1);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('blocked');
		expect(await work.reconcileAttempts()).toBe(0);
		expect(await workRepository.findAttempt(projectId, start.attemptId!)).toMatchObject({
			phase: 'terminal',
			outcome: 'failed',
			resultReference: null,
			lastOwnerSequence: '200',
			safeSummary: 'Agent run ended without a submitted result.',
		});
		expect(
			await workRepository.findOwnerSnapshotReceipt('n8n-agent', `snapshot:${start.attemptId}:200`),
		).not.toBeNull();
	});

	it('keeps binding history and attempt snapshots when a member binding changes or clears', async () => {
		const { department, member, agent, ready } = await createReadyWork();
		const firstStart = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const firstAttempt = await workRepository.findAttempt(projectId, firstStart.attemptId!);
		if (!firstAttempt) throw new Error('Missing first attempt');

		const currentMember = await directoryRepository.findMember(projectId, department.id, member.id);
		if (!currentMember) throw new Error('Missing member');
		const replacementAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: replacementAgent.id,
			expectedVersion: currentMember.version,
			requestId: randomUUID(),
		});

		const coordination = Container.get(WorkCoordinationService);
		await expect(
			coordination.executeAction(
				{
					projectId,
					executorId: agent.id,
					attemptId: firstAttempt.id,
					executionId: randomUUID(),
				},
				randomUUID(),
				{ action: 'claim', expectedVersion: firstStart.work.version },
			),
		).rejects.toThrow('assignment is no longer available');
		expect(await workRepository.findAttempt(projectId, firstAttempt.id)).toMatchObject({
			memberId: member.id,
			executorId: agent.id,
			bindingVersion: firstAttempt.bindingVersion,
		});
		expect(await work.listAttempts(projectId, department.id, ready.id)).toContainEqual(
			expect.objectContaining({
				id: firstAttempt.id,
				memberId: member.id,
				executorId: agent.id,
			}),
		);
		await expect(work.listAttempts(randomUUID(), department.id, ready.id)).rejects.toThrow(
			'not found',
		);

		const nextWork = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Use the replacement binding',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const nextReady = await work.markReady(projectId, actorId, department.id, nextWork.id, {
			expectedVersion: nextWork.version,
			requestId: randomUUID(),
		});
		const nextStart = await work.startWork(projectId, actorId, department.id, nextWork.id, {
			expectedVersion: nextReady.version,
			requestId: randomUUID(),
		});
		expect(await workRepository.findAttempt(projectId, nextStart.attemptId!)).toMatchObject({
			memberId: member.id,
			executorId: replacementAgent.id,
			bindingVersion: firstAttempt.bindingVersion + 1,
		});

		const replacementMember = await directoryRepository.findMember(
			projectId,
			department.id,
			member.id,
		);
		if (!replacementMember) throw new Error('Missing replacement member');
		await members.clearBinding(projectId, actorId, department.id, member.id, {
			expectedVersion: replacementMember.version,
			requestId: randomUUID(),
		});
		expect(await directoryRepository.findMember(projectId, department.id, member.id)).toMatchObject(
			{
				id: member.id,
				archived: false,
			},
		);
		expect(await directoryRepository.findBinding(projectId, member.id)).toBeNull();
		expect(await work.listAttempts(projectId, department.id, ready.id)).toContainEqual(
			expect.objectContaining({
				id: firstAttempt.id,
				memberId: member.id,
				executorId: agent.id,
			}),
		);

		const revisions = await Container.get(DataSource)
			.getRepository(ExecutorBindingRevision)
			.find({
				where: { memberId: member.id },
				order: { version: 'ASC' },
			});
		expect(
			revisions.map(({ version, executorId, changedById }) => ({
				version,
				executorId,
				changedById,
			})),
		).toEqual([
			{ version: 1, executorId: agent.id, changedById: actorId },
			{ version: 2, executorId: replacementAgent.id, changedById: actorId },
			{ version: 3, executorId: replacementAgent.id, changedById: actorId },
		]);
	});

	it('continues binding revision numbers after a binding is cleared', async () => {
		const { department, member, agent } = await createReadyWork();
		const currentMember = await directoryRepository.findMember(projectId, department.id, member.id);
		if (!currentMember) throw new Error('Missing member');
		await members.clearBinding(projectId, actorId, department.id, member.id, {
			expectedVersion: currentMember.version,
			requestId: randomUUID(),
		});
		const unboundMember = await directoryRepository.findMember(projectId, department.id, member.id);
		if (!unboundMember) throw new Error('Missing unbound member');
		const rebound = await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: unboundMember.version,
			requestId: randomUUID(),
		});

		expect(rebound.bindingVersion).toBe(3);
		expect(await directoryRepository.findBinding(projectId, member.id)).toMatchObject({
			executorId: agent.id,
			version: 3,
		});
	});

	it('keeps a running cancellation pending until a terminal snapshot confirms it', async () => {
		const { department, ready } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const cancelCommand = {
			expectedVersion: start.work.version,
			requestId: randomUUID(),
		};
		const pending = await work.cancelWork(
			projectId,
			actorId,
			department.id,
			ready.id,
			cancelCommand,
		);
		expect(pending.cancellationPending).toBe(true);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');

		nextSnapshot = {
			phase: 'terminal',
			sequence: '300',
			result: { outcome: 'cancelled' },
		};
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('cancelled');
		expect(
			await work.cancelWork(projectId, actorId, department.id, ready.id, cancelCommand),
		).toMatchObject({ cancellationPending: false, cancelRequested: true });
	});

	it('confirms cancellation when the owner removes a queued turn before execution', async () => {
		const { department, ready } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextStop = { status: 'accepted', acknowledged: true, confirmed: true };
		const result = await work.cancelWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: start.work.version,
			requestId: randomUUID(),
		});
		expect(result).toMatchObject({ cancellationPending: false, work: { state: 'cancelled' } });
		expect(requestStop).toHaveBeenCalledWith(
			expect.objectContaining({ ownerExecutionRef: 'owner-ref' }),
		);
	});

	it('reviews results with optimistic concurrency and keeps return reasons in history', async () => {
		const accepted = await createReadyWork();
		const originalBinding = await directoryRepository.findBinding(projectId, accepted.member.id);
		const firstStart = await work.startWork(
			projectId,
			actorId,
			accepted.department.id,
			accepted.ready.id,
			{ expectedVersion: accepted.ready.version, requestId: randomUUID() },
		);
		await reportResult(firstStart.attemptId!);
		nextSnapshot = {
			phase: 'terminal',
			sequence: '400',
			result: { outcome: 'succeeded' },
		};
		await work.reconcileAttempts();
		const reviewWork = await work.getWork(projectId, accepted.department.id, accepted.ready.id);
		const reviewAttempt = await workRepository.findAttempt(projectId, firstStart.attemptId!);
		const decision = {
			expectedVersion: reviewWork.version,
			attemptId: firstStart.attemptId!,
			resultId: reviewAttempt!.submittedResultId!,
			reviewRoundId: reviewAttempt!.reviewRoundId!,
			stageId: reviewWork.reviewStages[reviewWork.currentReviewStageIndex]?.id,
			expectedReviewVersion: 1,
			decision: 'accept' as const,
			requestId: randomUUID(),
		};
		await expect(
			work.reviewWork(projectId, actorId, accepted.department.id, accepted.ready.id, {
				...decision,
				expectedVersion: decision.expectedVersion - 1,
			}),
		).rejects.toThrow('changed');
		expect(
			(
				await work.reviewWork(
					projectId,
					actorId,
					accepted.department.id,
					accepted.ready.id,
					decision,
				)
			).work.state,
		).toBe('done');
		expect(await directoryRepository.findBinding(projectId, accepted.member.id)).toEqual(
			originalBinding,
		);

		const returned = await createReadyWork();
		const secondStart = await work.startWork(
			projectId,
			actorId,
			returned.department.id,
			returned.ready.id,
			{ expectedVersion: returned.ready.version, requestId: randomUUID() },
		);
		await reportResult(secondStart.attemptId!);
		nextSnapshot = {
			phase: 'terminal',
			sequence: '500',
			result: { outcome: 'succeeded' },
		};
		await work.reconcileAttempts();
		const pendingReview = await work.getWork(projectId, returned.department.id, returned.ready.id);
		const returnedAttempt = await workRepository.findAttempt(projectId, secondStart.attemptId!);
		await expect(
			work.reviewWork(projectId, actorId, returned.department.id, returned.ready.id, {
				expectedVersion: pendingReview.version,
				attemptId: secondStart.attemptId!,
				decision: 'return',
				requestId: randomUUID(),
			}),
		).rejects.toThrow('reason');
		await work.reviewWork(projectId, actorId, returned.department.id, returned.ready.id, {
			expectedVersion: pendingReview.version,
			attemptId: secondStart.attemptId!,
			resultId: returnedAttempt!.submittedResultId!,
			reviewRoundId: returnedAttempt!.reviewRoundId!,
			stageId: pendingReview.reviewStages[pendingReview.currentReviewStageIndex]?.id,
			expectedReviewVersion: 1,
			decision: 'return',
			reason: 'Add source references',
			requestId: randomUUID(),
		});
		const returnedEligibility = await Container.get(DataSource).manager.find(WorkEligibility, {
			where: { projectId, workId: returned.ready.id },
			order: { generation: 'ASC' },
		});
		expect(returnedEligibility.map(({ state }) => state)).toEqual([
			'cancelled',
			'reserved',
			'pending',
		]);
		expect(
			(await work.getWorkHistory(projectId, returned.department.id, returned.ready.id)).at(-1),
		).toMatchObject({
			fromState: 'review',
			toState: 'ready',
			actorId,
			reason: 'Add source references',
		});
	});

	it('advances ordered reviewer stages and enforces requester and explicit user rules', async () => {
		const reviewerId = randomUUID();
		const configured = await createReadyWork('required', [
			{
				id: 'independent-review',
				reviewers: { kind: 'authorized_writers' },
				actorFilter: 'not_creator',
			},
			{
				id: 'owner-review',
				reviewers: { kind: 'users', userIds: [reviewerId] },
				actorFilter: 'human_only',
			},
		]);
		const start = await work.startWork(
			projectId,
			actorId,
			configured.department.id,
			configured.ready.id,
			{
				expectedVersion: configured.ready.version,
				requestId: randomUUID(),
			},
		);
		await reportResult(start.attemptId!);
		nextSnapshot = { phase: 'terminal', sequence: '700', result: { outcome: 'succeeded' } };
		await work.reconcileAttempts();
		expect(
			await work.listAttempts(projectId, configured.department.id, configured.ready.id),
		).toContainEqual(
			expect.objectContaining({
				id: start.attemptId,
				submittedResultId: expect.any(String),
				reviewRoundId: expect.any(String),
				reviewRoundVersion: 1,
				reviewActiveStageId: 'independent-review',
			}),
		);
		const firstStageWork = await work.getWork(
			projectId,
			configured.department.id,
			configured.ready.id,
		);
		const stageAttempt = await workRepository.findAttempt(projectId, start.attemptId!);
		const firstStageCommand = {
			expectedVersion: firstStageWork.version,
			expectedReviewVersion: 1,
			attemptId: start.attemptId!,
			resultId: stageAttempt!.submittedResultId!,
			reviewRoundId: stageAttempt!.reviewRoundId!,
			stageId: 'independent-review',
			decision: 'accept' as const,
			requestId: randomUUID(),
		};
		await expect(
			work.reviewWork(
				projectId,
				actorId,
				configured.department.id,
				configured.ready.id,
				firstStageCommand,
			),
		).rejects.toThrow('requester');
		const firstStage = await work.reviewWork(
			projectId,
			reviewerId,
			configured.department.id,
			configured.ready.id,
			firstStageCommand,
		);
		expect(firstStage).toMatchObject({
			work: { state: 'review', currentReviewStageIndex: 1 },
			activeStageId: 'owner-review',
			roundStatus: 'open',
		});
		const duplicate = await work.reviewWork(
			projectId,
			reviewerId,
			configured.department.id,
			configured.ready.id,
			firstStageCommand,
		);
		expect(duplicate).toEqual(firstStage);
		const secondStageWork = firstStage.work;
		const secondStageCommand = {
			expectedVersion: secondStageWork.version,
			expectedReviewVersion: 2,
			attemptId: start.attemptId!,
			resultId: stageAttempt!.submittedResultId!,
			reviewRoundId: stageAttempt!.reviewRoundId!,
			stageId: 'owner-review',
			decision: 'accept' as const,
			requestId: randomUUID(),
		};
		await expect(
			work.reviewWork(
				projectId,
				actorId,
				configured.department.id,
				configured.ready.id,
				secondStageCommand,
			),
		).rejects.toThrow('eligible reviewer');
		const final = await work.reviewWork(
			projectId,
			reviewerId,
			configured.department.id,
			configured.ready.id,
			secondStageCommand,
		);
		expect(final).toMatchObject({ work: { state: 'done' }, roundStatus: 'accepted' });
		const decisions = await Container.get(DataSource).manager.find(WorkReviewStageDecision, {
			where: { workId: configured.ready.id, roundId: stageAttempt!.reviewRoundId! },
			order: { priorVersion: 'ASC' },
		});
		expect(
			decisions.map(({ stageId, resultId, decision }) => ({ stageId, resultId, decision })),
		).toEqual([
			{
				stageId: 'independent-review',
				resultId: stageAttempt!.submittedResultId!,
				decision: 'accept',
			},
			{ stageId: 'owner-review', resultId: stageAttempt!.submittedResultId!, decision: 'accept' },
		]);
		expect(
			(
				await work.listReviewDecisions(projectId, configured.department.id, configured.ready.id)
			).map(({ stageId, resultId, decision }) => ({ stageId, resultId, decision })),
		).toEqual([
			{
				stageId: 'independent-review',
				resultId: stageAttempt!.submittedResultId!,
				decision: 'accept',
			},
			{ stageId: 'owner-review', resultId: stageAttempt!.submittedResultId!, decision: 'accept' },
		]);
		await expect(
			work.createWork(projectId, actorId, randomUUID(), {
				instruction: 'Use an unverified Agent reviewer',
				priority: 'normal',
				reviewPolicy: 'required',
				reviewStages: [
					{
						id: 'agent-review',
						reviewers: { kind: 'members', memberIds: [randomUUID()] },
						actorFilter: 'anyone',
					},
				],
				requestId: randomUUID(),
			}),
		).rejects.toThrow('review context is verified');
	});

	it('reviews a legacy single-stage result without round identity fields', async () => {
		const configured = await createReadyWork();
		const start = await work.startWork(
			projectId,
			actorId,
			configured.department.id,
			configured.ready.id,
			{ expectedVersion: configured.ready.version, requestId: randomUUID() },
		);
		await reportResult(start.attemptId!);
		nextSnapshot = { phase: 'terminal', sequence: '702', result: { outcome: 'succeeded' } };
		await work.reconcileAttempts();
		const attempt = await workRepository.findAttempt(projectId, start.attemptId!);
		attempt!.submittedResultId = null;
		attempt!.reviewRoundId = null;
		attempt!.reviewPolicyRevisionId = null;
		attempt!.reviewStagesJson = JSON.stringify([
			{
				id: 'human-review',
				reviewers: { kind: 'authorized_writers' },
				actorFilter: 'human_only',
			},
		]);
		await workRepository.saveAttempt(attempt!);
		const reviewWork = await work.getWork(projectId, configured.department.id, configured.ready.id);
		const result = await work.reviewWork(
			projectId,
			actorId,
			configured.department.id,
			configured.ready.id,
			{
				attemptId: start.attemptId!,
				expectedVersion: reviewWork.version,
				decision: 'accept',
				requestId: randomUUID(),
			},
		);

		expect(result.work.state).toBe('done');
		expect(
			await work.listReviewDecisions(projectId, configured.department.id, configured.ready.id),
		).toMatchObject([
			{
				stageId: 'human-review',
				resultId: start.attemptId,
				actorId,
				decision: 'accept',
			},
		]);
	});

	it('reopens a stalled review with an audit reason and a new eligibility', async () => {
		const configured = await createReadyWork();
		const start = await work.startWork(
			projectId,
			actorId,
			configured.department.id,
			configured.ready.id,
			{
				expectedVersion: configured.ready.version,
				requestId: randomUUID(),
			},
		);
		await reportResult(start.attemptId!);
		let pendingReview = await work.getWork(
			projectId,
			configured.department.id,
			configured.ready.id,
		);
		const command = {
			expectedVersion: pendingReview.version,
			reason: 'The assigned reviewer no longer has project access.',
			requestId: randomUUID(),
		};
		await expect(
			work.reopenReview(projectId, actorId, configured.department.id, configured.ready.id, command),
		).rejects.toThrow('terminal');
		nextSnapshot = { phase: 'terminal', sequence: '701', result: { outcome: 'succeeded' } };
		await work.reconcileAttempts();
		pendingReview = await work.getWork(projectId, configured.department.id, configured.ready.id);
		const validCommand = { ...command, expectedVersion: pendingReview.version };
		const reopened = await work.reopenReview(
			projectId,
			actorId,
			configured.department.id,
			configured.ready.id,
			validCommand,
		);
		expect(reopened).toMatchObject({
			work: { state: 'ready', currentReviewStageIndex: 0 },
			roundStatus: 'reopened',
		});
		expect(
			await work.reopenReview(
				projectId,
				actorId,
				configured.department.id,
				configured.ready.id,
				validCommand,
			),
		).toEqual(reopened);
		const attempt = await workRepository.findAttempt(projectId, start.attemptId!);
		expect(attempt).toMatchObject({ reviewRoundStatus: 'reopened' });
		expect(attempt?.reviewRoundClosedAt).toBeInstanceOf(Date);
		const eligibility = await Container.get(DataSource).manager.find(WorkEligibility, {
			where: { projectId, workId: configured.ready.id, state: 'pending' },
		});
		expect(eligibility).toHaveLength(1);
		expect(
			(await work.getWorkHistory(projectId, configured.department.id, configured.ready.id)).at(-1),
		).toMatchObject({
			fromState: 'review',
			toState: 'ready',
			reason: command.reason,
		});
	});

	it('does not change review policy while a ready wake is pending', async () => {
		const configured = await createReadyWork();
		await expect(
			work.updateWork(projectId, actorId, configured.department.id, configured.ready.id, {
				expectedVersion: configured.ready.version,
				reviewPolicy: 'automatic',
				requestId: randomUUID(),
			}),
		).rejects.toThrow('pending dispatch');
	});

	it('replaces pending eligibility only when ready work changes assignee', async () => {
		const { department, member, ready } = await createReadyWork();
		const dataSource = Container.get(DataSource);
		const initialRows = await dataSource.manager.find(WorkEligibility, {
			where: { projectId, workId: ready.id },
		});
		const sameAssigneeUpdate = await work.updateWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			assigneeMemberId: member.id,
			requestId: randomUUID(),
		});
		expect(
			await dataSource.manager.count(WorkEligibility, { where: { projectId, workId: ready.id } }),
		).toBe(initialRows.length);

		const nextMember = await members.create(projectId, actorId, department.id, {
			name: `Member-${randomUUID()}`,
			role: 'Analyst',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const nextAgent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, nextMember.id, {
			provider: 'n8n-agent',
			executorId: nextAgent.id,
			expectedVersion: nextMember.version,
			requestId: randomUUID(),
		});
		await work.updateWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: sameAssigneeUpdate.version,
			assigneeMemberId: nextMember.id,
			requestId: randomUUID(),
		});
		const reassignedRows = await dataSource.manager.find(WorkEligibility, {
			where: { projectId, workId: ready.id },
			order: { generation: 'ASC' },
		});
		expect(reassignedRows.map(({ state }) => state)).toEqual(['cancelled', 'pending']);
		expect(reassignedRows[1]).toMatchObject({ memberId: nextMember.id, generation: 2 });
	});

	it('rejects a late snapshot from an older attempt after retry starts', async () => {
		const { department, ready } = await createReadyWork();
		const firstAttempt = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		nextSnapshot = {
			phase: 'terminal',
			sequence: '600',
			result: { outcome: 'failed' },
		};
		await work.reconcileAttempts();
		const failed = await work.getWork(projectId, department.id, ready.id);
		const retry = await work.startWork(
			projectId,
			actorId,
			department.id,
			ready.id,
			{ expectedVersion: failed.version, requestId: randomUUID() },
			true,
		);
		await expect(
			workRepository.applyOwnerSnapshot(
				{
					projectId,
					departmentId: department.id,
					workId: ready.id,
					attemptId: firstAttempt.attemptId!,
					expectedWorkVersion: retry.work.version,
					sequence: '999',
					phase: 'terminal',
					outcome: 'succeeded',
					toState: 'done',
					actorId: 'agent-owner',
				},
				{},
			),
		).rejects.toThrow('current work attempt');
		expect((await work.getWork(projectId, department.id, ready.id)).currentAttemptId).toBe(
			retry.attemptId,
		);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('ready');
	});

	it('rejects unauthorized starts and blocks unavailable bindings without dispatch', async () => {
		const unauthorized = await createReadyWork();
		authorized = false;
		await expect(
			work.startWork(projectId, actorId, unauthorized.department.id, unauthorized.ready.id, {
				expectedVersion: unauthorized.ready.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('permission');
		expect(
			(await work.getWork(projectId, unauthorized.department.id, unauthorized.ready.id)).state,
		).toBe('ready');

		const unavailable = await createReadyWork();
		authorized = true;
		canStart = false;
		const result = await work.startWork(
			projectId,
			actorId,
			unavailable.department.id,
			unavailable.ready.id,
			{
				expectedVersion: unavailable.ready.version,
				requestId: randomUUID(),
			},
		);
		expect(result).toMatchObject({
			attemptId: null,
			dispatchState: 'unavailable',
			work: { state: 'blocked' },
		});
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('rejects concurrent starts after one transaction reserves the attempt', async () => {
		const { department, ready } = await createReadyWork();
		const starts = await Promise.allSettled([
			work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			}),
			work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			}),
		]);
		expect(starts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
		expect(starts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
		expect(dispatch).toHaveBeenCalledTimes(1);
	});
	it('keeps one active run per lane and preserves a wake raised during its drain', async () => {
		const { department, member, agent, ready } = await createReadyWork();
		const secondCreated = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Prepare a second execution result',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const second = await work.markReady(projectId, actorId, department.id, secondCreated.id, {
			expectedVersion: secondCreated.version,
			requestId: randomUUID(),
		});
		const binding = await directoryRepository.findBinding(projectId, member.id);
		if (!binding) throw new Error('Missing test Agent binding');
		const inbox = Container.get(WorkInboxService);
		const authority = {
			projectId,
			actorId,
			memberId: member.id,
			executorId: agent.id,
			bindingVersion: binding.version,
		};
		const laneWorkIds = new Set([ready.id, second.id]);
		expect((await inbox.listAssigned(authority, { take: 10 })).data).toHaveLength(2);

		await work.reconcileAttempts();
		const laneDispatches = () =>
			dispatch.mock.calls.filter(([context]) => laneWorkIds.has(context.workId));
		expect(laneDispatches()).toHaveLength(1);
		const lane = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
			projectId,
			memberId: member.id,
			actorId,
			bindingVersion: binding.version,
		});
		expect(lane?.activeAttemptId).toBeTruthy();
		expect((await inbox.listAssigned(authority, { take: 10 })).data).toHaveLength(1);

		const thirdCreated = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Prepare a third execution result',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const third = await work.markReady(projectId, actorId, department.id, thirdCreated.id, {
			expectedVersion: thirdCreated.version,
			requestId: randomUUID(),
		});
		laneWorkIds.add(third.id);
		const laneDuringDrain = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
			projectId,
			memberId: member.id,
			actorId,
			bindingVersion: binding.version,
		});
		expect(laneDuringDrain?.generation).toBeGreaterThan(
			laneDuringDrain?.acknowledgedGeneration ?? 0,
		);
		expect(laneDuringDrain?.activeAttemptId).toBe(lane?.activeAttemptId);
		const restartedCoordinator = new WorkService(
			Container.get(Logger),
			directoryRepository,
			workRepository,
			Container.get(TransactionRunner),
			Container.get(DepartmentExecutorProxy),
			Container.get(WorkReleaseService),
			Container.get(AiDepartmentOperationsBroadcaster),
		);
		await restartedCoordinator.reconcileAttempts();
		expect(laneDispatches()).toHaveLength(1);
		const laneAfterRestart = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
			projectId,
			memberId: member.id,
			actorId,
			bindingVersion: binding.version,
		});
		expect(laneAfterRestart?.activeAttemptId).toBe(lane?.activeAttemptId);

		nextSnapshot = { phase: 'terminal', sequence: '2', result: { outcome: 'failed' } };
		await restartedCoordinator.reconcileAttempts();
		const laneAfterRecovery = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
			projectId,
			memberId: member.id,
			actorId,
			bindingVersion: binding.version,
		});
		expect(laneAfterRecovery?.activeAttemptId).toBeNull();
		expect(laneAfterRecovery?.state).toBe('pending');
		expect(
			(await inbox.listAssigned(authority, { take: 10 })).data.map(({ workId }) => workId),
		).toEqual(expect.arrayContaining([second.id, third.id]));

		nextSnapshot = { phase: 'active', sequence: '10' };
		await restartedCoordinator.reconcileAttempts();
		expect(laneDispatches()).toHaveLength(2);
		nextSnapshot = { phase: 'terminal', sequence: '11', result: { outcome: 'failed' } };
		await restartedCoordinator.reconcileAttempts();
		nextSnapshot = { phase: 'active', sequence: '12' };
		await restartedCoordinator.reconcileAttempts();
		expect(laneDispatches()).toHaveLength(3);
		nextSnapshot = { phase: 'terminal', sequence: '13', result: { outcome: 'failed' } };
		await restartedCoordinator.reconcileAttempts();
	});
	it('delivers a durable readiness wake once and waits for an explicit Agent claim', async () => {
		const { department, ready, agent } = await createReadyWork();
		const dataSource = Container.get(DataSource);
		const initialEligibility = await dataSource.manager.find(WorkEligibility, {
			where: { projectId, workId: ready.id },
		});
		expect(initialEligibility).toHaveLength(1);
		expect(initialEligibility[0]).toMatchObject({
			memberId: ready.assigneeMemberId,
			state: 'pending',
			generation: 1,
			laneGeneration: 1,
		});
		const initialLane = await dataSource.manager.findOneBy(WorkWakeLane, {
			projectId,
			memberId: ready.assigneeMemberId!,
			actorId,
		});
		expect(initialLane?.generation).toBe(1);
		nextSnapshot = { phase: 'active', sequence: '99999' };
		await work.reconcileAttempts();
		const dispatchedEligibility = await dataSource.manager.find(WorkEligibility, {
			where: { projectId, workId: ready.id },
		});
		expect(dispatchedEligibility).toHaveLength(1);
		expect(dispatchedEligibility[0].state).toBe('reserved');
		const awakened = await work.getWork(projectId, department.id, ready.id);
		expect(awakened.state).toBe('ready');
		expect(awakened.currentAttemptId).toBeTruthy();
		const calls = dispatch.mock.calls.length;
		await work.reconcileAttempts();
		expect(dispatch).toHaveBeenCalledTimes(calls);
		const result = await Container.get(WorkCoordinationService).executeAction(
			{
				projectId,
				executorId: agent.id,
				attemptId: awakened.currentAttemptId!,
				executionId: randomUUID(),
			},
			randomUUID(),
			{ action: 'claim', expectedVersion: awakened.version },
		);
		expect(result.work.state).toBe('running');
		expect(result.claim?.releasedAt).toBeNull();
		nextSnapshot = { phase: 'terminal', sequence: '100000', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('lists assigned work in a binding-scoped cursor lane with safe summaries', async () => {
		const department = await departments.create(projectId, actorId, {
			name: `Inbox-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const member = await members.create(projectId, actorId, department.id, {
			name: `Member-${randomUUID()}`,
			role: 'Researcher',
			expertiseTags: [],
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		for (const instruction of ['First inbox item', 'Second inbox item', 'Third inbox item']) {
			const created = await work.createWork(projectId, actorId, department.id, {
				instruction,
				assigneeMemberId: member.id,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: randomUUID(),
			});
			await work.markReady(projectId, actorId, department.id, created.id, {
				expectedVersion: created.version,
				requestId: randomUUID(),
			});
		}
		const binding = await directoryRepository.findBinding(projectId, member.id);
		if (!binding) throw new Error('Missing test binding');
		const authority = {
			projectId,
			actorId,
			memberId: member.id,
			executorId: agent.id,
			bindingVersion: binding.version,
		};
		const inbox = Container.get(WorkInboxService);
		const firstPage = await inbox.listAssigned(authority, { take: 2 });
		expect(firstPage.data).toHaveLength(2);
		expect(firstPage.nextCursor).toBeTruthy();
		const pendingRows = await Container.get(DataSource).manager.find(WorkEligibility, {
			where: {
				projectId,
				memberId: member.id,
				actorId,
				bindingVersion: binding.version,
				state: 'pending',
			},
			order: { eligibleAt: 'ASC', workId: 'ASC' },
		});
		expect(firstPage.data.map(({ workId }) => workId)).toEqual(
			pendingRows.slice(0, 2).map(({ workId }) => workId),
		);
		expect(firstPage.data[0]).not.toHaveProperty('currentAttemptId');
		expect(firstPage.data[0]).not.toHaveProperty('actorId');
		const secondPage = await inbox.listAssigned(authority, {
			take: 2,
			cursor: firstPage.nextCursor!,
		});
		expect(secondPage.data).toHaveLength(1);
		expect(new Set([...firstPage.data, ...secondPage.data].map(({ workId }) => workId)).size).toBe(
			3,
		);
		await expect(
			inbox.listAssigned(
				{ ...authority, actorId: randomUUID() },
				{
					take: 2,
					cursor: firstPage.nextCursor!,
				},
			),
		).rejects.toThrow('different inbox lane');
		await expect(
			inbox.listAssigned({ ...authority, bindingVersion: binding.version + 1 }, { take: 2 }),
		).rejects.toThrow('binding has changed');

		canStart = false;
		const unavailableInbox = await inbox.listAssigned(authority, { take: 2 });
		expect(unavailableInbox.bindingAvailability).toBe('unavailable');
		expect(unavailableInbox.data).toHaveLength(2);
		authorized = false;
		await expect(inbox.listAssigned(authority, { take: 2 })).rejects.toThrow(
			'permission to read this Agent inbox',
		);
	});

	it('rechecks blocker edges before claim, resume, and result submission', async () => {
		const { department, member, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const blocker = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Resolve the dependency first',
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const manager = Container.get(DataSource).manager;
		// Seed the edge after start to exercise owner guards against stale state.
		const addBlocker = async () =>
			await manager.save(
				Object.assign(new WorkRelationship(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					workId: blocker.id,
					relatedWorkId: ready.id,
					kind: 'blocks' as const,
				}),
			);
		const removeBlocker = async () =>
			await manager.delete(WorkRelationship, {
				projectId,
				departmentId: department.id,
				workId: blocker.id,
				relatedWorkId: ready.id,
				kind: 'blocks',
			});
		const context = {
			projectId,
			executorId: (await directoryRepository.findBinding(projectId, member.id))!.executorId,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const coordinator = Container.get(WorkCoordinationService);

		await addBlocker();
		await expect(
			coordinator.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: started.work.version,
			}),
		).rejects.toThrow('blocking work');
		await removeBlocker();
		let current = await coordinator.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		current = await coordinator.executeAction(context, randomUUID(), {
			action: 'block',
			expectedVersion: current.work.version,
			body: 'Wait for the dependency.',
		});
		await addBlocker();
		await expect(
			coordinator.executeAction(context, randomUUID(), {
				action: 'resume',
				expectedVersion: current.work.version,
			}),
		).rejects.toThrow('blocking work');
		await removeBlocker();
		current = await coordinator.executeAction(context, randomUUID(), {
			action: 'resume',
			expectedVersion: current.work.version,
		});
		await addBlocker();
		await expect(
			coordinator.executeAction(context, randomUUID(), {
				action: 'submit',
				expectedVersion: current.work.version,
				report: {
					result: 'A result with an unresolved blocker.',
					completedWork: [],
					checkedEvidence: [],
					openIssues: [],
					nextSteps: [],
				},
			}),
		).rejects.toThrow('blocking work');
		await removeBlocker();
		nextSnapshot = { phase: 'terminal', sequence: '150000', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('keeps dependent work blocked when its blocker is cancelled', async () => {
		const { department, agent, ready } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const blocker = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Complete the dependency first',
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const manager = Container.get(DataSource).manager;
		await manager.save(
			Object.assign(new WorkRelationship(), {
				id: randomUUID(),
				projectId,
				departmentId: department.id,
				workId: blocker.id,
				relatedWorkId: ready.id,
				kind: 'blocks' as const,
			}),
		);
		await work.cancelWork(projectId, actorId, department.id, blocker.id, {
			expectedVersion: blocker.version,
			requestId: randomUUID(),
		});

		await expect(
			Container.get(WorkCoordinationService).executeAction(
				{
					projectId,
					executorId: agent.id,
					attemptId: started.attemptId!,
					executionId: randomUUID(),
				},
				randomUUID(),
				{ action: 'claim', expectedVersion: started.work.version },
			),
		).rejects.toThrow('blocking work');

		nextSnapshot = { phase: 'terminal', sequence: '100005', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('rejects competing claims and replays a submitted result without another activity', async () => {
		const { department, ready, agent } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: start.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: start.work.version,
		});
		if (!('claim' in claimed) || !claimed.claim) throw new Error('Expected a work claim result.');
		await expect(
			service.executeAction({ ...context, executionId: randomUUID() }, randomUUID(), {
				action: 'claim',
				expectedVersion: claimed.work.version,
			}),
		).rejects.toThrow('Another execution');
		const command = {
			action: 'submit' as const,
			expectedVersion: claimed.work.version,
			report: {
				result: 'Completed the requested analysis',
				completedWork: ['Reviewed the requested analysis.'],
				checkedEvidence: [
					{
						reference: `attempt:${claimed.claim.attemptId}`,
						summary: 'The output matches the stated criteria.',
					},
				],
				openIssues: ['One optional follow-up remains.'],
				nextSteps: ['Review the follow-up with the requester.'],
			},
		};
		await expect(
			service.executeAction(context, randomUUID(), {
				...command,
				report: {
					...command.report,
					checkedEvidence: [
						{ reference: `attempt:${randomUUID()}`, summary: 'Unrelated evidence.' },
					],
				},
			}),
		).rejects.toThrow('Evidence references must belong to the current Work or attempt');
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('running');
		const requestId = randomUUID();
		const submitted = await service.executeAction(context, requestId, command);
		expect(submitted.work.state).toBe('review');
		const submittedAttempt = await workRepository.findAttempt(projectId, claimed.claim.attemptId);
		expect(submittedAttempt).not.toBeNull();
		expect(submittedAttempt?.safeSummary).toBe(command.report.result);
		const submittedActivity = await work.listActivity(
			context.projectId,
			claimed.work.departmentId,
			claimed.work.id,
			20,
			0,
		);
		const reportActivity = submittedActivity.data.find((entry) => entry.kind === 'submit');
		expect(reportActivity).toBeDefined();
		expect(JSON.parse(reportActivity?.body ?? '{}')).toEqual(command.report);
		expect(reportActivity?.report).toEqual(command.report);
		expect(await service.executeAction(context, requestId, command)).toEqual(submitted);
		const activity = await work.listActivity(projectId, department.id, ready.id, 50, 0);
		expect(
			activity.data.filter((entry) => entry.actorKind === 'agent').map((entry) => entry.kind),
		).toEqual(['claim', 'submit']);
		nextSnapshot = { phase: 'terminal', sequence: '100001', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('review');
		expect((await workRepository.findAttempt(projectId, context.attemptId))?.safeSummary).toBe(
			command.report.result,
		);
	});

	it('submits an automatic review report without a follow-up Agent dispatch', async () => {
		const { department, ready, agent } = await createReadyWork('automatic');
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const dispatchCount = dispatch.mock.calls.length;
		const submitted = await service.executeAction(context, randomUUID(), {
			action: 'submit',
			expectedVersion: claimed.work.version,
			report: {
				result: 'The requested change is complete.',
				completedWork: ['Updated the workflow.'],
				checkedEvidence: [],
				openIssues: ['The optional follow-up needs review.'],
				nextSteps: ['Review the follow-up with the requester.'],
			},
		});

		expect(submitted.work.state).toBe('done');
		expect(dispatch).toHaveBeenCalledTimes(dispatchCount);
	});

	it('allows only one of two concurrent executions to claim an attempt', async () => {
		const { department, ready, agent } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const contexts = [randomUUID(), randomUUID()].map((executionId) => ({
			projectId,
			executorId: agent.id,
			attemptId: start.attemptId!,
			executionId,
		}));
		const results = await Promise.allSettled(
			contexts.map(
				async (context) =>
					await service.executeAction(context, randomUUID(), {
						action: 'claim',
						expectedVersion: start.work.version,
					}),
			),
		);
		const winners = results.flatMap((result, index) =>
			result.status === 'fulfilled' ? [contexts[index].executionId] : [],
		);
		expect(winners).toHaveLength(1);
		expect(await workRepository.findClaim(projectId, start.attemptId!)).toMatchObject({
			executionId: winners[0],
			claimGeneration: 1,
		});

		nextSnapshot = { phase: 'terminal', sequence: '100009', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('rejects progress after access loss and after claim expiry', async () => {
		const { department, ready, agent } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: start.attemptId!,
			executionId: randomUUID(),
		};
		const claimed = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: start.work.version,
		});
		authorized = false;
		await expect(
			service.executeAction(context, randomUUID(), {
				action: 'progress',
				expectedVersion: claimed.work.version,
				body: 'A progress update',
			}),
		).rejects.toThrow('cannot update');
		authorized = true;
		const claim = await workRepository.findClaim(projectId, start.attemptId!);
		if (!claim) throw new Error('Missing test claim');
		claim.leaseUntil = new Date(0);
		const { TransactionRunner } = await import('@n8n/db');
		await Container.get(TransactionRunner).run(
			{},
			async (ctx) => await workRepository.saveClaim(claim, ctx),
		);
		await expect(
			service.executeAction(context, randomUUID(), {
				action: 'progress',
				expectedVersion: claimed.work.version,
				body: 'A progress update',
			}),
		).rejects.toThrow('current work claim');
		nextSnapshot = { phase: 'terminal', sequence: '100002', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('does not transfer an expired claim while its owner execution remains active', async () => {
		const { department, ready, agent } = await createReadyWork();
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const firstContext = {
			projectId,
			executorId: agent.id,
			attemptId: started.attemptId!,
			executionId: randomUUID(),
		};
		const first = await service.executeAction(firstContext, randomUUID(), {
			action: 'claim',
			expectedVersion: started.work.version,
		});
		const claim = await workRepository.findClaim(projectId, started.attemptId!);
		if (!claim) throw new Error('Missing test claim');
		claim.leaseUntil = new Date(0);
		await Container.get(TransactionRunner).run(
			{},
			async (ctx) => await workRepository.saveClaim(claim, ctx),
		);

		await expect(
			service.executeAction({ ...firstContext, executionId: randomUUID() }, randomUUID(), {
				action: 'claim',
				expectedVersion: first.work.version,
			}),
		).rejects.toThrow('Another execution holds this work claim.');
		expect(await workRepository.findClaim(projectId, started.attemptId!)).toMatchObject({
			executionId: firstContext.executionId,
			claimGeneration: 1,
		});

		nextSnapshot = { phase: 'terminal', sequence: '100008', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});

	it('recovers a persisted wake after the owner confirms no dispatch was accepted', async () => {
		const { department, ready } = await createReadyWork();
		nextDispatch = { kind: 'unknown' };
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const ownDispatches = () =>
			dispatch.mock.calls.filter(([context]) => context.workId === ready.id);
		const firstKey = ownDispatches()[0][0].dispatchKey;
		nextLookup = { kind: 'absent' };
		nextDispatch = { kind: 'accepted', ownerExecutionRef: 'recovered-after-absence' };
		nextSnapshot = { phase: 'terminal', sequence: '100003', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		expect(ownDispatches()).toHaveLength(2);
		expect(ownDispatches()[1][0]).toMatchObject({
			attemptId: started.attemptId,
			dispatchKey: firstKey,
		});
		expect(await workRepository.listAttempts(projectId, ready.id)).toHaveLength(1);
	});
	it('renews, blocks, resumes, and releases a claim while preserving activity order', async () => {
		const { department, ready, agent } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		expect(await work.getCurrentClaim(projectId, department.id, ready.id)).toBeNull();
		const context = {
			projectId,
			executorId: agent.id,
			attemptId: start.attemptId!,
			executionId: randomUUID(),
		};
		let current = await service.executeAction(context, randomUUID(), {
			action: 'claim',
			expectedVersion: start.work.version,
		});
		expect(await work.getCurrentClaim(projectId, department.id, ready.id)).toMatchObject({
			memberId: ready.assigneeMemberId,
			state: 'active',
		});
		current = await service.executeAction(context, randomUUID(), {
			action: 'renew',
			expectedVersion: current.work.version,
		});
		current = await service.executeAction(context, randomUUID(), {
			action: 'block',
			expectedVersion: current.work.version,
			body: 'The input needs clarification',
		});
		expect(current.work.state).toBe('blocked');
		current = await service.executeAction(context, randomUUID(), {
			action: 'resume',
			expectedVersion: current.work.version,
		});
		expect(current.work.state).toBe('running');
		current = await service.executeAction(context, randomUUID(), {
			action: 'release',
			expectedVersion: current.work.version,
			body: 'The required input is missing',
		});
		expect(await work.getCurrentClaim(projectId, department.id, ready.id)).toMatchObject({
			memberId: ready.assigneeMemberId,
			state: 'released',
		});
		expect(current.claim?.releasedAt).not.toBeNull();
		expect(current.work.state).toBe('blocked');
		expect(
			await workRepository.findPendingReleaseForAttempt(projectId, start.attemptId!),
		).toMatchObject({
			reason: 'The required input is missing',
			state: 'awaiting_stop',
		});
		await expect(
			work.startWork(
				projectId,
				actorId,
				department.id,
				ready.id,
				{
					expectedVersion: current.work.version,
					requestId: randomUUID(),
				},
				true,
			),
		).rejects.toThrow('must stop before work can be retried');
		await expect(
			service.executeAction(context, randomUUID(), {
				action: 'submit',
				expectedVersion: current.work.version,
				report: {
					result: 'A late result',
					completedWork: [],
					checkedEvidence: [],
					openIssues: [],
					nextSteps: [],
				},
			}),
		).rejects.toThrow('release is waiting for the current run to stop');
		const activity = await work.listActivity(projectId, department.id, ready.id, 100, 0);
		expect(
			activity.data.filter((entry) => entry.actorKind === 'agent').map((entry) => entry.kind),
		).toEqual(['claim', 'renew', 'block', 'resume', 'release']);
		nextSnapshot = { phase: 'terminal', sequence: '100004', result: { outcome: 'succeeded' } };
		await Container.get(WorkReleaseService).reconcilePending();
		expect(
			await workRepository.findPendingReleaseForAttempt(projectId, start.attemptId!),
		).toBeNull();
		expect((await workRepository.findAttempt(projectId, start.attemptId!))?.phase).toBe('terminal');
		const retry = await work.startWork(
			projectId,
			actorId,
			department.id,
			ready.id,
			{ expectedVersion: current.work.version, requestId: randomUUID() },
			true,
		);
		expect(retry.attemptId).not.toBe(start.attemptId);
		expect(retry.work.assigneeMemberId).toBe(ready.assigneeMemberId);
	});

	it('protects a submitted automatic result and keeps archive blocked until the run stops', async () => {
		const { department, ready, member } = await createReadyWork('automatic');
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		await reportResult(start.attemptId!);
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('done');
		await expect(
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Active department records prevent archive');
		const currentMember = await directoryRepository.findMember(projectId, department.id, member.id);
		if (!currentMember) throw new Error('Missing test member');
		await expect(
			members.archive(projectId, actorId, department.id, member.id, {
				expectedVersion: currentMember.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Active department records prevent archive');
		nextSnapshot = { phase: 'terminal', sequence: '100005', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('done');
		expect((await workRepository.findAttempt(projectId, start.attemptId!))?.safeSummary).toBe(
			'Verified business result',
		);
		await expect(
			members.archive(projectId, actorId, department.id, member.id, {
				expectedVersion: currentMember.version,
				requestId: randomUUID(),
			}),
		).resolves.toBeDefined();
	});

	it('serializes department archive against attempt reservation', async () => {
		const { department, ready } = await createReadyWork();
		const outcomes = await Promise.allSettled([
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
			work.startWork(projectId, actorId, department.id, ready.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			}),
		]);
		const archive = outcomes[0];
		const start = outcomes[1];
		expect([archive.status, start.status].filter((status) => status === 'fulfilled')).toHaveLength(
			1,
		);
		const archived = await directoryRepository.findDepartment(projectId, department.id);
		if (start.status === 'fulfilled') {
			expect(archive.status).toBe('rejected');
			expect(archived?.archived).toBe(false);
			expect(await workRepository.findAttempt(projectId, start.value.attemptId!)).toBeTruthy();
			nextSnapshot = {
				phase: 'terminal',
				sequence: '1000000',
				result: { outcome: 'failed' },
			};
			await work.reconcileAttempts();
		} else {
			expect(archive.status).toBe('fulfilled');
			expect(archived?.archived).toBe(true);
			expect(dispatch).not.toHaveBeenCalled();
		}
	});

	it('starts a new attempt after owner-confirmed stop and rejects the previous claimant', async () => {
		const { department, ready, agent } = await createReadyWork();
		const start = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const service = Container.get(WorkCoordinationService);
		const firstContext = {
			projectId,
			executorId: agent.id,
			attemptId: start.attemptId!,
			executionId: randomUUID(),
		};
		const first = await service.executeAction(firstContext, randomUUID(), {
			action: 'claim',
			expectedVersion: start.work.version,
		});
		expect(first.claim?.claimGeneration).toBe(1);
		const nextContext = { ...firstContext, executionId: randomUUID() };
		previousRunStopped = true;
		await expect(
			service.executeAction(nextContext, randomUUID(), {
				action: 'claim',
				expectedVersion: first.work.version,
			}),
		).rejects.toThrow('Retry the work to create a new attempt');

		nextSnapshot = { phase: 'terminal', sequence: '100006', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		const blocked = await work.getWork(projectId, department.id, ready.id);
		const retried = await work.startWork(
			projectId,
			actorId,
			department.id,
			ready.id,
			{ expectedVersion: blocked.version, requestId: randomUUID() },
			true,
		);
		expect(retried.attemptId).not.toBe(start.attemptId);
		const nextClaim = await service.executeAction(
			{ ...nextContext, attemptId: retried.attemptId! },
			randomUUID(),
			{ action: 'claim', expectedVersion: retried.work.version },
		);
		expect(nextClaim.claim?.claimGeneration).toBeGreaterThan(first.claim?.claimGeneration ?? 0);
		await expect(
			service.executeAction(firstContext, randomUUID(), {
				action: 'progress',
				expectedVersion: nextClaim.work.version,
				body: 'An obsolete update',
			}),
		).rejects.toThrow('assignment has changed');
		nextSnapshot = { phase: 'terminal', sequence: '100007', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});
});
