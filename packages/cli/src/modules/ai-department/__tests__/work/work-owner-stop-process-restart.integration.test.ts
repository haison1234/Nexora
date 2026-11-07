import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { AuthRolesService, DbConnection, GLOBAL_MEMBER_ROLE, UserRepository } from '@n8n/db';
import { ExecutionRecorder } from '@/modules/agents/execution-recorder';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { createOwner } from '@test-integration/db/users';
import { AgentDepartmentExecutionAdapter } from '@/modules/agents/agent-department-execution.adapter';
import {
	AgentExecutionService,
	type StartExecutionParams,
} from '@/modules/agents/agent-execution.service';
import { AgentMessageQueueService } from '@/modules/agents/agent-message-queue.service';
import { AgentDepartmentStopReceiptRepository } from '@/modules/agents/repositories/agent-department-stop-receipt.repository';
import {
	createAgentBindingFixture,
	registerDepartmentExecutionFixture,
} from '@/modules/agents/testing/agent-binding-fixture';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkReleaseService } from '../../work/work-release.service';
import { WorkRepository } from '../../database/repositories/work.repository';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkService } from '../../work/work.service';

const phase = process.env.N8N_TEST_DEPARTMENT_OWNER_STOP_PHASE;
const stateFile = process.env.N8N_TEST_DEPARTMENT_OWNER_STOP_STATE_FILE;
const releaseFlow = phase?.startsWith('release-') ?? false;

type StopRestartState = {
	actorId: string;
	projectId: string;
	departmentId: string;
	memberId: string;
	memberVersion: number;
	bindingVersion: number;
	executorId: string;
	workId: string;
	attemptId: string;
	dispatchKey: string;
	ownerExecutionRef: string;
	executionId: string;
	startedAt: string;
	commandId: string;
	recording: StartExecutionParams;
	releaseId?: string;
};

describe.skipIf(
	![
		'active',
		'request-stop',
		'recover-stop',
		'release-active',
		'release-request-stop',
		'release-recover-stop',
		'revoked-active',
		'revoked-request-stop',
		'revoked-recover-stop',
		'binding-revoked-active',
		'binding-revoked-request-stop',
		'binding-revoked-recover-stop',
	].includes(phase ?? ''),
)('AI Department owner stop recovery across process restarts', () => {
	beforeAll(async () => {
		if (!stateFile) throw new Error('Department owner stop state file is required.');
		await testModules.loadModules(['ai-department', 'agents']);
		if (process.env.N8N_TEST_SHARED_POSTGRES_DB === '1') {
			const dbConnection = Container.get(DbConnection);
			await dbConnection.init();
			if (phase === 'revoked-active' || phase === 'binding-revoked-active') {
				await dbConnection.migrate();
				await Container.get(AuthRolesService).init();
			}
		} else {
			await testDb.init();
		}
		await registerDepartmentExecutionFixture();
	});

	afterAll(async () => await testDb.terminate());

	it.skipIf(
		!['active', 'release-active', 'revoked-active', 'binding-revoked-active'].includes(phase ?? ''),
	)('persists an active owner execution before restart', async () => {
		if (!stateFile) throw new Error('Department owner stop state file is required.');
		const user = await createOwner();
		const projectId = (
			await createTeamProject(
				'Department owner stop restart',
				phase === 'revoked-active' || phase === 'binding-revoked-active' ? undefined : user,
			)
		).id;
		const department = await Container.get(DepartmentService).create(projectId, user.id, {
			name: 'Owner stop restart',
			requestId: randomUUID(),
		});
		const member = await Container.get(MemberService).create(projectId, user.id, department.id, {
			name: 'Researcher',
			role: 'Research',
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		await Container.get(MemberService).setBinding(projectId, user.id, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const work = Container.get(WorkService);
		const item = await work.createWork(projectId, user.id, department.id, {
			instruction: 'Prepare a research summary',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, user.id, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		const started = await work.startWork(projectId, user.id, department.id, item.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		if (!started.attemptId) throw new Error('The owner attempt was not reserved.');
		const attempt = await Container.get(WorkRepository).findAttempt(projectId, started.attemptId);
		if (!attempt?.ownerExecutionRef) throw new Error('The owner did not acknowledge the dispatch.');
		const active = await Container.get(AgentMessageQueueService).claimNext(
			started.attemptId,
			async () => true,
		);
		if (!active) throw new Error('The owner queue did not admit the execution.');
		const state: StopRestartState = {
			actorId: user.id,
			projectId,
			departmentId: department.id,
			memberId: member.id,
			memberVersion: member.version + 1,
			bindingVersion: attempt.bindingVersion,
			executorId: agent.id,
			workId: item.id,
			attemptId: attempt.id,
			dispatchKey: attempt.dispatchKey,
			ownerExecutionRef: attempt.ownerExecutionRef,
			executionId: active.admission.executionId,
			startedAt: active.admission.startedAt.toISOString(),
			commandId:
				phase === 'revoked-active' || phase === 'binding-revoked-active'
					? attempt.id
					: randomUUID(),
			recording: active.recording,
		};
		writeFileSync(stateFile, JSON.stringify(state));
		expect(
			(
				await Container.get(AgentDepartmentExecutionAdapter).snapshot({
					actorId: user.id,
					projectId,
					executorId: agent.id,
					attemptId: attempt.id,
					ownerExecutionRef: attempt.ownerExecutionRef,
				})
			).phase,
		).toBe('active');
	});

	it.skipIf(
		![
			'request-stop',
			'release-request-stop',
			'revoked-request-stop',
			'binding-revoked-request-stop',
		].includes(phase ?? ''),
	)('persists the pending stop receipt after restart', async () => {
		if (!stateFile) throw new Error('Department owner stop state file is required.');
		const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as StopRestartState;
		const adapter = Container.get(AgentDepartmentExecutionAdapter);
		await expect(
			adapter.lookup({
				actorId: state.actorId,
				projectId: state.projectId,
				executorId: state.executorId,
				attemptId: state.attemptId,
				dispatchKey: state.dispatchKey,
			}),
		).resolves.toMatchObject({ kind: 'accepted', ownerExecutionRef: state.ownerExecutionRef });
		const context = {
			projectId: state.projectId,
			executorId: state.executorId,
			attemptId: state.attemptId,
			executionId: state.executionId,
		};
		const work = Container.get(WorkService);
		const current = await work.getWork(state.projectId, state.departmentId, state.workId);
		const claim = await Container.get(WorkCoordinationService).executeAction(
			context,
			randomUUID(),
			{ action: 'claim', expectedVersion: current.version },
		);
		expect(claim.claim?.claimGeneration).toBe(1);
		if (releaseFlow) {
			const released = await Container.get(WorkCoordinationService).executeAction(
				context,
				randomUUID(),
				{
					action: 'release',
					expectedVersion: claim.work.version,
					body: 'Stop this run before retrying the work.',
				},
			);
			expect(released.work.state).toBe('blocked');
			const release = await Container.get(WorkRepository).findPendingReleaseForAttempt(
				state.projectId,
				state.attemptId,
			);
			if (!release) throw new Error('The owner release intent was not persisted.');
			state.releaseId = release.id;
			state.commandId = release.stopCommandId;
			writeFileSync(stateFile, JSON.stringify(state));
		} else if (phase === 'revoked-request-stop' || phase === 'binding-revoked-request-stop') {
			if (phase === 'revoked-request-stop') {
				const user = await Container.get(UserRepository).findByIdWithRole(state.actorId);
				if (!user) throw new Error('The work owner was not found after restart.');
				await Container.get(UserRepository).save({ ...user, role: GLOBAL_MEMBER_ROLE });
			} else {
				await Container.get(MemberService).clearBinding(
					state.projectId,
					state.actorId,
					state.departmentId,
					state.memberId,
					{ expectedVersion: state.memberVersion, requestId: randomUUID() },
				);
			}
			await expect(
				Container.get(WorkCoordinationService).executeAction(context, randomUUID(), {
					action: 'progress',
					expectedVersion: claim.work.version,
					body: 'Progress after project access was removed.',
				}),
			).rejects.toThrow(
				phase === 'binding-revoked-request-stop'
					? 'The department assignment is no longer available.'
					: 'This execution cannot update department work.',
			);
			expect(await work.reconcileAttempts()).toBeGreaterThan(0);
		} else {
			const cancelled = await work.cancelWork(
				state.projectId,
				state.actorId,
				state.departmentId,
				state.workId,
				{ expectedVersion: claim.work.version, requestId: state.commandId },
			);
			expect(cancelled).toMatchObject({
				attemptId: state.attemptId,
				cancelRequested: true,
				cancellationPending: true,
			});
		}
		expect(
			(
				await adapter.snapshot({
					actorId: state.actorId,
					projectId: state.projectId,
					executorId: state.executorId,
					attemptId: state.attemptId,
					ownerExecutionRef: state.ownerExecutionRef,
				})
			).phase,
		).toBe('stopping');
		expect(
			await Container.get(AgentDepartmentStopReceiptRepository).findByCommandId(state.commandId),
		).toMatchObject({ status: 'pending', ownerExecutionRef: state.ownerExecutionRef });
		if (phase === 'revoked-request-stop' || phase === 'binding-revoked-request-stop') {
			expect(
				await Container.get(WorkRepository).findAttempt(state.projectId, state.attemptId),
			).toMatchObject({ phase: 'stopping', ownerExecutionRef: state.ownerExecutionRef });
		}
		expect(
			await Container.get(WorkRepository).findWakeLane(
				state.projectId,
				state.memberId,
				state.actorId,
				state.bindingVersion,
				{},
			),
		).toMatchObject({ activeAttemptId: state.attemptId });
	});

	it.skipIf(
		![
			'recover-stop',
			'release-recover-stop',
			'revoked-recover-stop',
			'binding-revoked-recover-stop',
		].includes(phase ?? ''),
	)('reconciles a persisted stop after the owner reports terminal state', async () => {
		if (!stateFile) throw new Error('Department owner stop state file is required.');
		const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as StopRestartState;
		const adapter = Container.get(AgentDepartmentExecutionAdapter);
		const identity = {
			actorId: state.actorId,
			projectId: state.projectId,
			executorId: state.executorId,
			attemptId: state.attemptId,
			ownerExecutionRef: state.ownerExecutionRef,
		};
		expect((await adapter.snapshot(identity)).phase).toBe('stopping');
		expect(
			await Container.get(AgentDepartmentStopReceiptRepository).findByCommandId(state.commandId),
		).toMatchObject({ status: 'pending' });

		const recorder = new ExecutionRecorder(
			undefined,
			undefined,
			undefined,
			new Date(state.startedAt),
		);
		recorder.record({ type: 'finish', finishReason: 'cancelled' });
		await Container.get(AgentExecutionService).finalizeExecution(state.executionId, {
			...state.recording,
			record: recorder.getMessageRecord(),
		});
		await Container.get(AgentMessageQueueService).settle(state.attemptId, state.executionId);
		await adapter.reconcilePendingStops();
		if (releaseFlow) await Container.get(WorkReleaseService).reconcilePending();
		await Container.get(WorkService).reconcileAttempts();

		expect(
			await Container.get(AgentDepartmentStopReceiptRepository).findByCommandId(state.commandId),
		).toMatchObject({ status: 'confirmed' });
		const attempt = await Container.get(WorkRepository).findAttempt(
			state.projectId,
			state.attemptId,
		);
		expect(attempt?.phase).toBe('terminal');
		expect(await adapter.snapshot(identity)).toMatchObject({
			phase: 'terminal',
			result: { outcome: 'cancelled' },
		});
		const stoppedWork = await Container.get(WorkService).getWork(
			state.projectId,
			state.departmentId,
			state.workId,
		);
		if (releaseFlow) {
			expect(stoppedWork.state).toBe('blocked');
			if (!state.releaseId) throw new Error('The release ID was not persisted.');
			expect(
				await Container.get(WorkRepository).findRelease(state.projectId, state.releaseId),
			).toMatchObject({ state: 'confirmed' });
			const retry = await Container.get(WorkService).startWork(
				state.projectId,
				state.actorId,
				state.departmentId,
				state.workId,
				{ expectedVersion: stoppedWork.version, requestId: randomUUID() },
				true,
			);
			if (!retry.attemptId) throw new Error('The work retry did not reserve an attempt.');
			expect(retry.attemptId).not.toBe(state.attemptId);
			const retriedAttempt = await Container.get(WorkRepository).findAttempt(
				state.projectId,
				retry.attemptId,
			);
			expect(retriedAttempt?.ordinal).toBe(2);
			const nextRun = await Container.get(AgentMessageQueueService).claimNext(
				retry.attemptId,
				async () => true,
			);
			if (!nextRun) throw new Error('The retried owner dispatch was not admitted.');
			const nextClaim = await Container.get(WorkCoordinationService).executeAction(
				{
					projectId: state.projectId,
					executorId: state.executorId,
					attemptId: retry.attemptId,
					executionId: nextRun.admission.executionId,
				},
				randomUUID(),
				{ action: 'claim', expectedVersion: retry.work.version },
			);
			expect(nextClaim.claim?.claimGeneration).toBe(2);
			await expect(
				Container.get(WorkCoordinationService).executeAction(
					{
						projectId: state.projectId,
						executorId: state.executorId,
						attemptId: state.attemptId,
						executionId: state.executionId,
					},
					randomUUID(),
					{
						action: 'progress',
						expectedVersion: nextClaim.work.version,
						body: 'A stale owner action after retry.',
					},
				),
			).rejects.toThrow('This execution cannot update department work.');
			const recorder = new ExecutionRecorder(
				undefined,
				undefined,
				undefined,
				nextRun.admission.startedAt,
			);
			recorder.record({ type: 'finish', finishReason: 'cancelled' });
			await Container.get(AgentExecutionService).finalizeExecution(nextRun.admission.executionId, {
				...nextRun.recording,
				record: recorder.getMessageRecord(),
			});
			await Container.get(AgentMessageQueueService).settle(
				retry.attemptId,
				nextRun.admission.executionId,
			);
			await Container.get(WorkService).reconcileAttempts();
		} else {
			expect(stoppedWork.state === 'blocked').toBe(
				phase === 'revoked-recover-stop' || phase === 'binding-revoked-recover-stop',
			);
			await expect(
				Container.get(WorkCoordinationService).executeAction(
					{
						projectId: state.projectId,
						executorId: state.executorId,
						attemptId: state.attemptId,
						executionId: state.executionId,
					},
					randomUUID(),
					{
						action: 'progress',
						expectedVersion: stoppedWork.version,
						body: 'Late progress after the owner stopped.',
					},
				),
			).rejects.toThrow(
				phase === 'binding-revoked-recover-stop'
					? 'The department assignment is no longer available.'
					: 'This execution cannot update department work.',
			);
		}
	});
});
