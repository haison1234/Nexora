import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { DataSource } from '@n8n/typeorm';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	DepartmentAttemptContext,
	DepartmentDispatchResult,
	DepartmentDispatchLookup,
	DepartmentExecutionSnapshot,
	DepartmentExecutor,
} from '@/modules/agents/agent-department-execution.contracts';
import { createAgentBindingFixture } from '@/modules/agents/testing/agent-binding-fixture';

import { DepartmentExecutorProxy } from '../../work/executor.contracts';
import { WorkRepository } from '../../database/repositories/work.repository';
import { DirectoryRepository } from '../../database/repositories/directory.repository';
import { ActiveDepartmentWorkGuardProxy } from '../../active-department-work-guard.contracts';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { ActiveDepartmentWorkGuardImpl } from '../../work/active-department-work-guard';
import { ExecutorBindingRevision } from '../../database/entities/executor-binding-revision.entity';
import { WorkEligibility } from '../../database/entities/work-eligibility.entity';
import { WorkWakeLane } from '../../database/entities/work-wake-lane.entity';
import { WorkService } from '../../work/work.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkInboxService } from '../../work/work-inbox.service';

describe('AI Department work attempts', () => {
	let departments: DepartmentService;
	let members: MemberService;
	let work: WorkService;
	let workRepository: WorkRepository;
	let directoryRepository: DirectoryRepository;
	let projectId: string;
	const actorId = randomUUID();
	let nextDispatch: DepartmentDispatchResult;
	let nextLookup: DepartmentDispatchLookup;
	let nextSnapshot: DepartmentExecutionSnapshot;
	let nextStop = { acknowledged: true, confirmed: false };
	let canStart = true;
	let authorized = true;
	let previousRunStopped = false;
	const dispatch = vi.fn(async (_context: DepartmentAttemptContext) => nextDispatch);
	const lookup = vi.fn(async (_context: Parameters<DepartmentExecutor['lookup']>[0]) => nextLookup);
	const snapshot = vi.fn(
		async (_input: Parameters<DepartmentExecutor['snapshot']>[0]) => nextSnapshot,
	);
	const requestStop = vi.fn(
		async (_input: Parameters<DepartmentExecutor['requestStop']>[0]) => nextStop,
	);

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
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
			requestStop,
		};
		Container.get(DepartmentExecutorProxy).register(controlledExecutor);
	});

	beforeEach(() => {
		nextDispatch = { kind: 'accepted', ownerExecutionRef: 'owner-ref' };
		nextLookup = { kind: 'accepted', ownerExecutionRef: 'owner-ref' };
		nextSnapshot = { phase: 'active', sequence: '1' };
		nextStop = { acknowledged: true, confirmed: false };
		canStart = true;
		authorized = true;
		previousRunStopped = false;
		dispatch.mockClear();
		lookup.mockClear();
		snapshot.mockClear();
		requestStop.mockClear();
	});

	afterAll(async () => await testDb.terminate());

	async function createReadyWork(reviewPolicy: 'required' | 'automatic' = 'required') {
		const department = await departments.create(projectId, actorId, {
			name: `Attempts-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const member = await members.create(projectId, actorId, department.id, {
			name: `Member-${randomUUID()}`,
			role: 'Researcher',
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const created = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Prepare an execution result',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy,
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, actorId, department.id, created.id, {
			expectedVersion: created.version,
			requestId: randomUUID(),
		});
		return { department, member, agent, ready };
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
			body: 'Verified business result',
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

	it('keeps an uncertain dispatch reserved and never starts it again during reconciliation', async () => {
		const { department, ready } = await createReadyWork();
		nextDispatch = { kind: 'unknown' };
		nextLookup = { kind: 'unknown' };
		const result = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});

		expect(result.dispatchState).toBe('unknown');
		expect(await work.reconcileAttempts()).toBe(0);
		expect(dispatch).toHaveBeenCalledTimes(1);
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
			outcome: 'succeeded',
		});
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
			outcome: 'succeeded',
			resultReference: null,
			lastOwnerSequence: '200',
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
		nextStop = { acknowledged: true, confirmed: true };
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
		const decision = {
			expectedVersion: reviewWork.version,
			attemptId: firstStart.attemptId!,
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
		await expect(
			service.executeAction({ ...context, executionId: randomUUID() }, randomUUID(), {
				action: 'claim',
				expectedVersion: claimed.work.version,
			}),
		).rejects.toThrow('Another execution');
		const command = {
			action: 'submit' as const,
			expectedVersion: claimed.work.version,
			body: 'Completed the requested analysis',
		};
		const requestId = randomUUID();
		const submitted = await service.executeAction(context, requestId, command);
		expect(submitted.work.state).toBe('review');
		expect(await service.executeAction(context, requestId, command)).toEqual(submitted);
		const activity = await work.listActivity(projectId, department.id, ready.id, 50, 0);
		expect(
			activity.data.filter((entry) => entry.actorKind === 'agent').map((entry) => entry.kind),
		).toEqual(['claim', 'submit']);
		nextSnapshot = { phase: 'terminal', sequence: '100001', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, ready.id)).state).toBe('review');
		expect((await workRepository.findAttempt(projectId, context.attemptId))?.safeSummary).toBe(
			command.body,
		);
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

	it('recovers a persisted wake after the owner confirms no dispatch was accepted', async () => {
		const { department, ready } = await createReadyWork();
		nextDispatch = { kind: 'unknown' };
		const started = await work.startWork(projectId, actorId, department.id, ready.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const firstKey = dispatch.mock.calls[0][0].dispatchKey;
		nextLookup = { kind: 'absent' };
		nextDispatch = { kind: 'accepted', ownerExecutionRef: 'recovered-after-absence' };
		nextSnapshot = { phase: 'terminal', sequence: '100003', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
		expect(dispatch).toHaveBeenCalledTimes(2);
		expect(dispatch.mock.calls[1][0]).toMatchObject({
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
		});
		expect(current.claim?.releasedAt).not.toBeNull();
		await expect(
			service.executeAction(context, randomUUID(), {
				action: 'submit',
				expectedVersion: current.work.version,
				body: 'A late result',
			}),
		).rejects.toThrow('current work claim');
		const activity = await work.listActivity(projectId, department.id, ready.id, 100, 0);
		expect(
			activity.data.filter((entry) => entry.actorKind === 'agent').map((entry) => entry.kind),
		).toEqual(['claim', 'renew', 'block', 'resume', 'release']);
		nextSnapshot = { phase: 'terminal', sequence: '100004', result: { outcome: 'succeeded' } };
		await work.reconcileAttempts();
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
		).rejects.toThrow('Active work prevents archive');
		const currentMember = await directoryRepository.findMember(projectId, department.id, member.id);
		if (!currentMember) throw new Error('Missing test member');
		await expect(
			members.archive(projectId, actorId, department.id, member.id, {
				expectedVersion: currentMember.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Active work');
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

	it('reclaims only after owner-confirmed stop and rejects the previous claimant', async () => {
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
		const nextContext = { ...firstContext, executionId: randomUUID() };
		previousRunStopped = true;
		const reclaimed = await service.executeAction(nextContext, randomUUID(), {
			action: 'claim',
			expectedVersion: first.work.version,
		});
		expect(reclaimed.claim?.executionId).toBe(nextContext.executionId);
		await expect(
			service.executeAction(firstContext, randomUUID(), {
				action: 'progress',
				expectedVersion: reclaimed.work.version,
				body: 'An obsolete update',
			}),
		).rejects.toThrow('current work claim');
		nextSnapshot = { phase: 'terminal', sequence: '100006', result: { outcome: 'failed' } };
		await work.reconcileAttempts();
	});
});
