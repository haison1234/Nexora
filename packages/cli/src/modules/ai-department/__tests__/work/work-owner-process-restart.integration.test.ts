import type { AgentJsonConfig } from '@n8n/api-types';
import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { LicenseState } from '@n8n/backend-common';
import { AuthRolesService, DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { createDeferredPromise } from '@n8n/utils/promise/deferred-promise';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { createOwner } from '@test-integration/db/users';
import { AgentDepartmentExecutionAdapter } from '@/modules/agents/agent-department-execution.adapter';
import {
	DepartmentWorkActionsProxy,
	DepartmentWorkInboxProxy,
} from '@/modules/agents/agent-department-execution.contracts';
import { AgentExecutionOrchestratorService } from '@/modules/agents/agent-execution-orchestrator.service';
import { AgentExecutionRepository } from '@/modules/agents/repositories/agent-execution.repository';
import { AgentHistoryRepository } from '@/modules/agents/repositories/agent-history.repository';
import { AgentMessageQueueConsumer } from '@/modules/agents/agent-message-queue-consumer.service';
import { AgentMessageQueueRepository } from '@/modules/agents/repositories/agent-message-queue.repository';
import { AgentMessageQueueService } from '@/modules/agents/agent-message-queue.service';
import { AgentRepository } from '@/modules/agents/repositories/agent.repository';
import { storedAgentConfig } from '@/modules/agents/__tests__/test-utils/stored-agent-config';
import { DataSource } from '@n8n/typeorm';
import {
	createAgentBindingFixture,
	registerDepartmentExecutionFixture,
} from '@/modules/agents/testing/agent-binding-fixture';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkInboxService } from '../../work/work-inbox.service';
import { WorkRepository } from '../../database/repositories/work.repository';
import { WorkWakeLane } from '../../database/entities/work-wake-lane.entity';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkService } from '../../work/work.service';
import { saveCredential } from '@test-integration/db/credentials';
import { initCredentialsTypes } from '@test-integration/utils';
import { LicenseMocker } from '@test-integration/license';

const phase = process.env.N8N_TEST_DEPARTMENT_OWNER_RESTART_PHASE;
const stateFile = process.env.N8N_TEST_DEPARTMENT_OWNER_RESTART_STATE_FILE;
const liveOwnerRun = process.env.N8N_TEST_LIVE_DEPARTMENT_OWNER_RESTART === '1';
const ollamaBaseUrl = (process.env.N8N_TEST_LIVE_OLLAMA_URL ?? 'http://127.0.0.1:1337/v1').replace(
	/\/$/,
	'',
);
const ollamaModel = process.env.N8N_TEST_LIVE_OLLAMA_MODEL ?? 'qwen2.5:7b';

type RestartState = {
	actorId: string;
	projectId: string;
	departmentId: string;
	memberId: string;
	executorId: string;
	workId: string;
	attemptId: string;
	dispatchKey: string;
	ownerExecutionRef: string;
	bindingVersion: number;
	requestId: string;
	expectedVersion: number;
	instruction: string;
	waitingWorkIds: [string, string];
	nextExecutorId?: string;
	memberVersion?: number;
};

type LaneRaceState = {
	actorId: string;
	projectId: string;
	departmentId: string;
	memberId: string;
	executorId: string;
	bindingVersion: number;
	workIds: [string, string];
	workVersions: [number, number];
};

type LaneRaceResult = {
	workerId: number;
	attemptId: string | null;
	dispatchState: string | null;
	error: string | null;
	errorStack?: string;
};

type DispatchRaceResult = {
	workerId: number;
	kind: string;
	ownerExecutionRef: string | null;
};

describe.skipIf(
	![
		'prepare',
		'recover',
		'race-prepare',
		'race-claim',
		'race-verify',
		'binding-loss-prepare',
		'binding-loss-recover',
		'race-postgres',
		'lane-race-prepare',
		'lane-race-start',
		'lane-race-verify',
		'dispatch-race',
		'dispatch-race-verify',
	].includes(phase ?? ''),
)('AI Department owner recovery across process restart', () => {
	beforeAll(async () => {
		if (!stateFile) throw new Error('Department owner restart state file is required.');
		await testModules.loadModules(['ai-department', 'agents']);
		if (process.env.N8N_TEST_SHARED_POSTGRES_DB === '1') {
			const dbConnection = Container.get(DbConnection);
			await dbConnection.init();
			if (phase === 'race-prepare' || phase === 'binding-loss-prepare') {
				await dbConnection.migrate();
				await Container.get(AuthRolesService).init();
			}
		} else {
			await testDb.init();
		}
		await registerDepartmentExecutionFixture();
		Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
		Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
		if (liveOwnerRun) {
			const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
			if (!modelsResponse.ok)
				throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
			const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
			if (!models.data?.some((model) => model.id === ollamaModel))
				throw new Error(`Ollama model "${ollamaModel}" is not available.`);
			await initCredentialsTypes();
			new LicenseMocker().mockLicenseState(Container.get(LicenseState));
		}
	});

	afterAll(async () => await testDb.terminate());

	it.skipIf(
		!['prepare', 'race-prepare', 'race-postgres', 'binding-loss-prepare'].includes(phase ?? ''),
	)('persists one owner dispatch before process exit', async () => {
		if (!stateFile) throw new Error('Department owner restart state file is required.');
		const user = await createOwner();
		const project = await createTeamProject('Department owner restart', user);
		const projectId = project.id;
		const department = await Container.get(DepartmentService).create(projectId, user.id, {
			name: 'Owner restart',
			requestId: randomUUID(),
		});
		const member = await Container.get(MemberService).create(projectId, user.id, department.id, {
			name: 'Researcher',
			role: 'Research',
			requestId: randomUUID(),
		});
		const work = Container.get(WorkService);
		let agent: Awaited<ReturnType<typeof createAgentBindingFixture>>;
		if (liveOwnerRun) {
			const credential = await saveCredential(
				{
					name: 'Local Ollama owner restart test',
					type: 'openAiApi',
					data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
				},
				{ project, role: 'credential:owner' },
			);
			const config: AgentJsonConfig = {
				name: 'Live owner restart Agent',
				model: `openai/${ollamaModel}`,
				credential: credential.id,
				instructions:
					'Use only the Department tools. Inspect the assigned work, claim it with no input, then submit a structured report with a concise result and one completedWork item. Use empty arrays for checkedEvidence, openIssues, and nextSteps. Wait for each tool result. Do not answer in chat.',
				memory: { enabled: true, storage: 'n8n' },
			};
			const agents = Container.get(AgentRepository);
			const agentId = randomUUID();
			const versionId = randomUUID();
			const savedAgent = await agents.save(
				agents.create({
					id: agentId,
					name: config.name,
					projectId,
					schema: storedAgentConfig(config),
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
					tools: {},
					versionId,
				}),
			);
			await Container.get(AgentHistoryRepository).saveVersion({
				versionId,
				agentId: savedAgent.id,
				schema: storedAgentConfig({
					...config,
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
				}),
				tools: {},
				publishedBy: user,
			});
			await agents.update({ id: savedAgent.id }, { activeVersionId: versionId });
			agent = { ...savedAgent, activeVersionId: versionId };
		} else {
			agent = await createAgentBindingFixture(projectId, true);
		}
		await Container.get(MemberService).setBinding(projectId, user.id, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const instruction = 'Prepare a research summary';
		const item = await work.createWork(projectId, user.id, department.id, {
			instruction,
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, user.id, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		const requestId = randomUUID();
		if (phase === 'binding-loss-prepare') {
			const adapter = Container.get(AgentDepartmentExecutionAdapter);
			const enqueueAndAcknowledge = adapter.dispatch.bind(adapter);
			vi.spyOn(adapter, 'dispatch').mockImplementation(async (context) => {
				const accepted = await enqueueAndAcknowledge(context);
				expect(accepted.kind).toBe('accepted');
				return { kind: 'unknown' };
			});
		}
		const started = await work.startWork(projectId, user.id, department.id, item.id, {
			expectedVersion: ready.version,
			requestId,
		});
		if (!started.attemptId) throw new Error('The owner attempt was not reserved.');
		const attempt = await Container.get(WorkRepository).findAttempt(projectId, started.attemptId);
		if (!attempt) throw new Error('The owner attempt was not persisted.');
		if (phase !== 'binding-loss-prepare' && !attempt.ownerExecutionRef)
			throw new Error('The owner did not acknowledge the dispatch.');
		let nextExecutorId: string | undefined;
		if (phase === 'binding-loss-prepare') {
			const nextAgent = await createAgentBindingFixture(projectId, true);
			await Container.get(MemberService).setBinding(projectId, user.id, department.id, member.id, {
				provider: 'n8n-agent',
				executorId: nextAgent.id,
				expectedVersion: member.version + 1,
				requestId: randomUUID(),
			});
			nextExecutorId = nextAgent.id;
		}
		const waitingWorkIds: string[] = [];
		for (const waitingInstruction of ['Prepare a second result', 'Prepare a third result']) {
			const waiting = await work.createWork(projectId, user.id, department.id, {
				instruction: waitingInstruction,
				assigneeMemberId: member.id,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: randomUUID(),
			});
			const waitingReady = await work.markReady(projectId, user.id, department.id, waiting.id, {
				expectedVersion: waiting.version,
				requestId: randomUUID(),
			});
			waitingWorkIds.push(waitingReady.id);
		}
		let ownerExecutionRef = attempt.ownerExecutionRef ?? '';
		if (phase === 'binding-loss-prepare') {
			const recoveredDispatch = await Container.get(AgentDepartmentExecutionAdapter).lookup({
				actorId: user.id,
				projectId,
				executorId: agent.id,
				attemptId: attempt.id,
				dispatchKey: attempt.dispatchKey,
			});
			if (recoveredDispatch.kind !== 'accepted')
				throw new Error('The queued owner dispatch could not be found.');
			ownerExecutionRef = recoveredDispatch.ownerExecutionRef;
		}
		const state: RestartState = {
			actorId: user.id,
			projectId,
			departmentId: department.id,
			memberId: member.id,
			executorId: agent.id,
			workId: item.id,
			attemptId: attempt.id,
			dispatchKey: attempt.dispatchKey,
			ownerExecutionRef,
			bindingVersion: attempt.bindingVersion,
			requestId,
			expectedVersion: ready.version,
			instruction,
			waitingWorkIds: [waitingWorkIds[0], waitingWorkIds[1]],
			nextExecutorId,
		};
		writeFileSync(stateFile, JSON.stringify(state));
		expect(started.dispatchState).toBe(
			phase === 'binding-loss-prepare' ? 'unknown' : 'acknowledged',
		);
	});

	it.skipIf(phase !== 'binding-loss-recover')(
		'recovers an accepted pending dispatch after its member binding changes across restart',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const work = Container.get(WorkService);
			const repository = Container.get(WorkRepository);
			const dispatch = vi.spyOn(Container.get(AgentDepartmentExecutionAdapter), 'dispatch');
			const attemptBefore = await repository.findAttempt(state.projectId, state.attemptId);
			expect(attemptBefore).toMatchObject({
				phase: 'dispatching',
				ownerExecutionRef: null,
				bindingVersion: state.bindingVersion,
			});
			const binding = await Container.get(MemberService).getBinding(
				state.projectId,
				state.departmentId,
				state.memberId,
			);
			expect(binding).toMatchObject({ executorId: state.nextExecutorId });

			expect(await work.reconcileAttempts()).toBeGreaterThan(0);
			expect(dispatch.mock.calls.some(([context]) => context.attemptId === state.attemptId)).toBe(
				false,
			);
			expect(dispatch).toHaveBeenCalledWith(
				expect.objectContaining({ executorId: state.nextExecutorId }),
			);

			const recovered = await repository.findAttempt(state.projectId, state.attemptId);
			expect(recovered).toMatchObject({
				phase: 'active',
				ownerExecutionRef: state.ownerExecutionRef,
				bindingVersion: state.bindingVersion,
			});
			await expect(
				Container.get(AgentMessageQueueRepository).findByMessageId(state.ownerExecutionRef),
			).resolves.toMatchObject({ threadId: state.attemptId });
			const lanes = await Container.get(DataSource).manager.find(WorkWakeLane, {
				where: { projectId: state.projectId, memberId: state.memberId },
			});
			expect(lanes).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						bindingVersion: state.bindingVersion,
						activeAttemptId: state.attemptId,
					}),
					expect.objectContaining({
						bindingVersion: state.bindingVersion + 1,
						activeAttemptId: expect.any(String),
					}),
				]),
			);
		},
	);

	it.skipIf(phase !== 'recover')(
		'recovers the accepted dispatch and drains retained lane wakes one owner at a time',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const adapter = Container.get(AgentDepartmentExecutionAdapter);
			const lookup = {
				actorId: state.actorId,
				projectId: state.projectId,
				executorId: state.executorId,
				attemptId: state.attemptId,
				dispatchKey: state.dispatchKey,
			};
			await expect(adapter.lookup(lookup)).resolves.toEqual({
				kind: 'accepted',
				ownerExecutionRef: state.ownerExecutionRef,
			});

			const queueRepository = Container.get(AgentMessageQueueRepository);
			await expect(queueRepository.findByMessageId(state.ownerExecutionRef)).resolves.toMatchObject(
				{
					threadId: state.attemptId,
				},
			);
			const work = Container.get(WorkService);
			await work.reconcileAttempts();
			const attempt = await Container.get(WorkRepository).findAttempt(
				state.projectId,
				state.attemptId,
			);
			expect(attempt).toMatchObject({
				ownerExecutionRef: state.ownerExecutionRef,
				phase: 'active',
			});
			const inboxAuthority = {
				projectId: state.projectId,
				actorId: state.actorId,
				memberId: state.memberId,
				executorId: state.executorId,
				bindingVersion: state.bindingVersion,
			};
			const inbox = await Container.get(WorkInboxService).listAssigned(inboxAuthority, {
				take: 10,
			});
			expect(inbox.data.map(({ workId }) => workId)).toEqual(
				expect.arrayContaining(state.waitingWorkIds),
			);
			await expect(queueRepository.findByMessageId(state.ownerExecutionRef)).resolves.toMatchObject(
				{
					threadId: state.attemptId,
				},
			);

			const replay = await work.startWork(
				state.projectId,
				state.actorId,
				state.departmentId,
				state.workId,
				{ expectedVersion: state.expectedVersion, requestId: state.requestId },
			);
			expect(replay.attemptId).toBe(state.attemptId);

			const modelStarted = createDeferredPromise<undefined>();
			const releaseModel = createDeferredPromise<undefined>();
			const orchestrator = Container.get(AgentExecutionOrchestratorService);
			const runActualModel = orchestrator.executeForN8nChatPublished.bind(orchestrator);
			const execute = vi
				.spyOn(orchestrator, 'executeForN8nChatPublished')
				.mockImplementation(async function* (config) {
					if (config.memory.threadId === state.attemptId) {
						modelStarted.resolve(undefined);
						await releaseModel.promise;
						if (!liveOwnerRun) throw new Error('Controlled model stop for queue recovery test');
					}
					if (liveOwnerRun) yield* runActualModel(config);
				});
			const consumer = Container.get(AgentMessageQueueConsumer);
			consumer.stop();
			try {
				consumer.start();
				await modelStarted.promise;
				const laneDuringDrain = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
					projectId: state.projectId,
					memberId: state.memberId,
					actorId: state.actorId,
					bindingVersion: state.bindingVersion,
				});
				expect(laneDuringDrain?.activeAttemptId).toBe(state.attemptId);
				expect(laneDuringDrain?.generation).toBeGreaterThan(
					laneDuringDrain?.acknowledgedGeneration ?? 0,
				);
				const run = await queueRepository.findByMessageId(state.ownerExecutionRef);
				if (!run?.executionId)
					throw new Error('The startup scan did not claim the persisted owner message.');
				expect(
					await adapter.verifyRun({
						projectId: state.projectId,
						actorId: state.actorId,
						executorId: state.executorId,
						attemptId: state.attemptId,
						dispatchKey: state.dispatchKey,
						executionId: run.executionId,
					}),
				).toBe(true);
				const current = await work.getWork(state.projectId, state.departmentId, state.workId);
				const claim = await Container.get(WorkCoordinationService).executeAction(
					{
						projectId: state.projectId,
						executorId: state.executorId,
						attemptId: state.attemptId,
						executionId: run.executionId,
					},
					randomUUID(),
					{ action: 'claim', expectedVersion: current.version },
				);
				expect(claim.claim?.claimGeneration).toBe(1);

				if (liveOwnerRun) {
					const duringDrainWork = await work.createWork(
						state.projectId,
						state.actorId,
						state.departmentId,
						{
							instruction: 'Prepare a fourth research result',
							assigneeMemberId: state.memberId,
							priority: 'normal',
							reviewPolicy: 'required',
							requestId: randomUUID(),
						},
					);
					const duringDrainReady = await work.markReady(
						state.projectId,
						state.actorId,
						state.departmentId,
						duringDrainWork.id,
						{ expectedVersion: duringDrainWork.version, requestId: randomUUID() },
					);
					const refreshedInbox = await Container.get(WorkInboxService).listAssigned(
						inboxAuthority,
						{
							take: 10,
						},
					);
					expect(refreshedInbox.data.map(({ workId }) => workId)).toEqual(
						expect.arrayContaining([...state.waitingWorkIds, duringDrainReady.id]),
					);
					releaseModel.resolve(undefined);
					const allWorkIds = [state.workId, ...state.waitingWorkIds, duringDrainReady.id];
					let maxActiveAttempts = 0;
					await vi.waitFor(
						async () => {
							await work.reconcileAttempts();
							const items = await Promise.all(
								allWorkIds.map((workId) =>
									work.getWork(state.projectId, state.departmentId, workId),
								),
							);
							expect(items).toHaveLength(allWorkIds.length);
							expect(items.every(({ state: itemState }) => itemState === 'review')).toBe(true);
							const attemptsByWork = await Promise.all(
								allWorkIds.map((workId) =>
									Container.get(WorkRepository).listAttempts(state.projectId, workId),
								),
							);
							const activeCount = attemptsByWork
								.flat()
								.filter(
									({ phase: attemptPhase }) =>
										attemptPhase === 'active' || attemptPhase === 'dispatching',
								).length;
							expect(activeCount).toBeLessThanOrEqual(1);
							maxActiveAttempts = Math.max(maxActiveAttempts, activeCount);
							for (const item of items) {
								if (!item.currentAttemptId) throw new Error('A Work item has no owner attempt.');
								const currentAttempt = await Container.get(WorkRepository).findAttempt(
									state.projectId,
									item.currentAttemptId,
								);
								expect(currentAttempt).toMatchObject({ phase: 'terminal', outcome: 'succeeded' });
							}
							const currentLane = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
								projectId: state.projectId,
								memberId: state.memberId,
								actorId: state.actorId,
								bindingVersion: state.bindingVersion,
							});
							expect(currentLane?.activeAttemptId).toBeNull();
							expect(currentLane?.generation).toBe(currentLane?.acknowledgedGeneration);
						},
						{ timeout: 360_000, interval: 500 },
					);
					for (const workId of allWorkIds) {
						const item = await work.getWork(state.projectId, state.departmentId, workId);
						if (!item.currentAttemptId)
							throw new Error(`Work ${workId} has no completed owner attempt.`);
						const finishedAttempt = await Container.get(WorkRepository).findAttempt(
							state.projectId,
							item.currentAttemptId,
						);
						expect(finishedAttempt).toMatchObject({ phase: 'terminal', outcome: 'succeeded' });
						if (!finishedAttempt?.ownerExecutionRef)
							throw new Error(`Work ${workId} has no owner execution reference.`);
						const execution = await Container.get(AgentExecutionRepository).findByInputMessageId(
							finishedAttempt.ownerExecutionRef,
						);
						expect(execution?.status).toBe('success');
					}
					expect(maxActiveAttempts).toBe(1);
					const drainedLane = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
						projectId: state.projectId,
						memberId: state.memberId,
						actorId: state.actorId,
						bindingVersion: state.bindingVersion,
					});
					expect(drainedLane?.activeAttemptId).toBeNull();
					expect(drainedLane?.generation).toBe(drainedLane?.acknowledgedGeneration);
					return;
				}
			} finally {
				releaseModel.resolve(undefined);
				consumer.stop();
				execute.mockRestore();
			}
			await vi.waitFor(async () => {
				expect(await queueRepository.findByMessageId(state.ownerExecutionRef)).toBeNull();
			});
			await work.reconcileAttempts();
			await work.reconcileAttempts();
			const nextWork = await Container.get(WorkRepository).findWork(
				state.projectId,
				state.departmentId,
				state.waitingWorkIds[0],
			);
			if (!nextWork?.currentAttemptId)
				throw new Error('The next eligible item was not dispatched after owner completion.');
			expect(nextWork.currentAttemptId).not.toBe(state.attemptId);
			const nextAttempt = await Container.get(WorkRepository).findAttempt(
				state.projectId,
				nextWork.currentAttemptId,
			);
			if (!nextAttempt?.ownerExecutionRef)
				throw new Error('The next attempt has no accepted owner reference.');
			await expect(
				queueRepository.findByMessageId(nextAttempt.ownerExecutionRef),
			).resolves.toMatchObject({
				threadId: nextWork.currentAttemptId,
			});
			const laneAfterDrain = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
				projectId: state.projectId,
				memberId: state.memberId,
				actorId: state.actorId,
				bindingVersion: state.bindingVersion,
			});
			expect(laneAfterDrain?.activeAttemptId).toBe(nextWork.currentAttemptId);
			expect(laneAfterDrain?.acknowledgedGeneration).toBe(laneAfterDrain?.generation);
			const remainingInbox = await Container.get(WorkInboxService).listAssigned(inboxAuthority, {
				take: 10,
			});
			expect(remainingInbox.data.map(({ workId }) => workId)).toContain(state.waitingWorkIds[1]);
		},
		liveOwnerRun ? 600_000 : 45_000,
	);

	it.skipIf(phase !== 'race-claim')(
		'allows only one process to claim a queued owner turn',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const workerId = process.env.N8N_TEST_DEPARTMENT_OWNER_RACE_WORKER;
			if (!workerId) throw new Error('Department owner race worker ID is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const readyFile = `${stateFile}.${workerId}.ready`;
			const startFile = `${stateFile}.race-start`;
			writeFileSync(readyFile, 'ready');
			await vi.waitFor(() => expect(existsSync(startFile)).toBe(true), {
				timeout: 30_000,
				interval: 25,
			});

			const claim = await Container.get(AgentMessageQueueService).claimNext(
				state.attemptId,
				async () => true,
			);
			writeFileSync(
				`${stateFile}.${workerId}.result`,
				JSON.stringify({ executionId: claim?.admission.executionId ?? null }),
			);
		},
		45_000,
	);

	it.skipIf(phase !== 'race-verify')(
		'persists exactly one owner execution after competing process claims',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const results = [1, 2].map(
				(workerId) =>
					JSON.parse(readFileSync(`${stateFile}.${workerId}.result`, 'utf-8')) as {
						executionId: string | null;
					},
			);
			const winners = results.flatMap(({ executionId }) =>
				executionId === null ? [] : [executionId],
			);
			expect(winners).toHaveLength(1);
			await expect(
				Container.get(AgentMessageQueueRepository).findByMessageId(state.ownerExecutionRef),
			).resolves.toMatchObject({ executionId: winners[0], threadId: state.attemptId });
		},
	);

	it.skipIf(phase !== 'race-postgres')(
		'allows only one concurrent PostgreSQL connection to claim a queued owner turn',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const queue = Container.get(AgentMessageQueueService);
			const claims = await Promise.all([
				queue.claimNext(state.attemptId, async () => true),
				queue.claimNext(state.attemptId, async () => true),
			]);
			const winners = claims.flatMap((claim) =>
				claim?.admission.executionId ? [claim.admission.executionId] : [],
			);
			expect(winners).toHaveLength(1);
			await expect(
				Container.get(AgentMessageQueueRepository).findByMessageId(state.ownerExecutionRef),
			).resolves.toMatchObject({ executionId: winners[0], threadId: state.attemptId });
		},
	);

	it.skipIf(phase !== 'lane-race-prepare')(
		'persists two ready work items for a competing lane admission race',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const user = await createOwner();
			const projectId = (await createTeamProject('Department lane race', user)).id;
			const department = await Container.get(DepartmentService).create(projectId, user.id, {
				name: 'Lane race',
				requestId: randomUUID(),
			});
			const member = await Container.get(MemberService).create(projectId, user.id, department.id, {
				name: 'Researcher',
				role: 'Research',
				requestId: randomUUID(),
			});
			const agent = await createAgentBindingFixture(projectId, true);
			const boundMember = await Container.get(MemberService).setBinding(
				projectId,
				user.id,
				department.id,
				member.id,
				{
					provider: 'n8n-agent',
					executorId: agent.id,
					expectedVersion: member.version,
					requestId: randomUUID(),
				},
			);
			const work = Container.get(WorkService);
			const workIds: string[] = [];
			const workVersions: number[] = [];
			for (const instruction of ['Race for lane slot one', 'Race for lane slot two']) {
				const item = await work.createWork(projectId, user.id, department.id, {
					instruction,
					assigneeMemberId: member.id,
					priority: 'normal',
					reviewPolicy: 'required',
					requestId: randomUUID(),
				});
				const ready = await work.markReady(projectId, user.id, department.id, item.id, {
					expectedVersion: item.version,
					requestId: randomUUID(),
				});
				workIds.push(ready.id);
				workVersions.push(ready.version);
			}
			const state: LaneRaceState = {
				actorId: user.id,
				projectId,
				departmentId: department.id,
				memberId: member.id,
				executorId: agent.id,
				bindingVersion: boundMember.bindingVersion,
				workIds: [workIds[0], workIds[1]],
				workVersions: [workVersions[0], workVersions[1]],
			};
			writeFileSync(stateFile, JSON.stringify(state));
		},
	);

	it.skipIf(phase !== 'lane-race-start')(
		'reserves a lane slot from competing process starts',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const workerId = Number(process.env.N8N_TEST_DEPARTMENT_OWNER_RACE_WORKER);
			if (workerId !== 1 && workerId !== 2)
				throw new Error('Department owner race worker ID must be 1 or 2.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as LaneRaceState;
			const startFile = `${stateFile}.lane-race-start`;
			writeFileSync(`${stateFile}.lane-race.${workerId}.ready`, 'ready');
			await vi.waitFor(() => expect(existsSync(startFile)).toBe(true), {
				timeout: 30_000,
				interval: 25,
			});
			let result: LaneRaceResult;
			try {
				const started = await Container.get(WorkService).startWork(
					state.projectId,
					state.actorId,
					state.departmentId,
					state.workIds[workerId - 1],
					{
						expectedVersion: state.workVersions[workerId - 1],
						requestId: randomUUID(),
					},
				);
				result = {
					workerId,
					attemptId: started.attemptId,
					dispatchState: started.dispatchState,
					error: null,
				};
			} catch (error) {
				result = {
					workerId,
					attemptId: null,
					dispatchState: null,
					error: error instanceof Error ? error.message : String(error),
					errorStack: error instanceof Error ? error.stack : undefined,
				};
			}
			writeFileSync(`${stateFile}.lane-race.${workerId}.result`, JSON.stringify(result));
		},
		45_000,
	);

	it.skipIf(phase !== 'lane-race-verify')(
		'persists only one active attempt and dispatch for a competing lane race',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as LaneRaceState;
			const results = [1, 2].map(
				(workerId) =>
					JSON.parse(
						readFileSync(`${stateFile}.lane-race.${workerId}.result`, 'utf-8'),
					) as LaneRaceResult,
			);
			const winners = results.filter(({ attemptId }) => attemptId !== null);
			const rejected = results.filter(({ attemptId }) => attemptId === null);
			expect(winners).toHaveLength(1);
			expect(rejected).toMatchObject([
				{
					attemptId: null,
					error: 'Another work item is already running in this lane.',
				},
			]);
			const winner = winners[0];
			if (!winner?.attemptId) throw new Error('The lane race did not produce a winner.');
			expect(winner.dispatchState).toBe('acknowledged');
			const winningWorkId = state.workIds[winner.workerId - 1];
			const losingWorkId = state.workIds[rejected[0].workerId - 1];
			const work = Container.get(WorkService);
			expect(await work.getWork(state.projectId, state.departmentId, winningWorkId)).toMatchObject({
				currentAttemptId: winner.attemptId,
			});
			expect(await work.getWork(state.projectId, state.departmentId, losingWorkId)).toMatchObject({
				currentAttemptId: null,
				state: 'ready',
			});
			const lane = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
				projectId: state.projectId,
				memberId: state.memberId,
				actorId: state.actorId,
				bindingVersion: state.bindingVersion,
			});
			expect(lane).toMatchObject({
				activeAttemptId: winner.attemptId,
				state: 'accepted',
			});
			expect(lane?.generation).toBe(lane?.acknowledgedGeneration);
			const winningAttempt = await Container.get(WorkRepository).findAttempt(
				state.projectId,
				winner.attemptId,
			);
			if (!winningAttempt?.ownerExecutionRef)
				throw new Error('The winning attempt has no accepted owner reference.');
			await expect(
				Container.get(AgentMessageQueueRepository).findByMessageId(
					winningAttempt.ownerExecutionRef,
				),
			).resolves.toMatchObject({
				threadId: winner.attemptId,
				messageId: winningAttempt.ownerExecutionRef,
			});
		},
	);

	it.skipIf(phase !== 'dispatch-race')(
		'resolves duplicate native dispatches from competing processes after restart',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const workerId = Number(process.env.N8N_TEST_DEPARTMENT_OWNER_RACE_WORKER);
			if (workerId !== 1 && workerId !== 2)
				throw new Error('Department owner race worker ID must be 1 or 2.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const startFile = `${stateFile}.dispatch-race-start`;
			writeFileSync(`${stateFile}.dispatch-race.${workerId}.ready`, 'ready');
			await vi.waitFor(() => expect(existsSync(startFile)).toBe(true), {
				timeout: 30_000,
				interval: 25,
			});
			const result = await Container.get(AgentDepartmentExecutionAdapter).dispatch({
				actorId: state.actorId,
				projectId: state.projectId,
				departmentId: state.departmentId,
				workId: state.workId,
				attemptId: state.attemptId,
				memberId: state.memberId,
				executorId: state.executorId,
				bindingVersion: state.bindingVersion,
				dispatchKey: state.dispatchKey,
				workflowIds: [],
				workflowCapabilities: [],
				instruction: state.instruction,
				reviewPolicy: 'required',
			});
			const raceResult: DispatchRaceResult = {
				workerId,
				kind: result.kind,
				ownerExecutionRef: result.kind === 'accepted' ? result.ownerExecutionRef : null,
			};
			writeFileSync(`${stateFile}.dispatch-race.${workerId}.result`, JSON.stringify(raceResult));
		},
		45_000,
	);

	it.skipIf(phase !== 'dispatch-race-verify')(
		'persists one queue dispatch after competing duplicate enqueue calls',
		async () => {
			if (!stateFile) throw new Error('Department owner restart state file is required.');
			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartState;
			const results = [1, 2].map(
				(workerId) =>
					JSON.parse(
						readFileSync(`${stateFile}.dispatch-race.${workerId}.result`, 'utf-8'),
					) as DispatchRaceResult,
			);
			expect(results).toEqual([
				{ workerId: 1, kind: 'accepted', ownerExecutionRef: state.ownerExecutionRef },
				{ workerId: 2, kind: 'accepted', ownerExecutionRef: state.ownerExecutionRef },
			]);
			await expect(
				Container.get(AgentMessageQueueRepository).findByMessageId(state.ownerExecutionRef),
			).resolves.toMatchObject({
				threadId: state.attemptId,
				messageId: state.ownerExecutionRef,
			});
		},
	);
});
