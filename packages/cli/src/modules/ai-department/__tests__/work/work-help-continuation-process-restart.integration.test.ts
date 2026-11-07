import type { AgentJsonConfig } from '@n8n/api-types';
import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { LicenseState } from '@n8n/backend-common';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentExecutionRepository } from '@/modules/agents/repositories/agent-execution.repository';
import { AgentHistoryRepository } from '@/modules/agents/repositories/agent-history.repository';
import { AgentMessageQueueRepository } from '@/modules/agents/repositories/agent-message-queue.repository';
import { AgentMessageQueueConsumer } from '@/modules/agents/agent-message-queue-consumer.service';
import { AgentRepository } from '@/modules/agents/repositories/agent.repository';
import {
	DepartmentWorkActionsProxy,
	DepartmentWorkInboxProxy,
} from '@/modules/agents/agent-department-execution.contracts';
import type {
	DepartmentAttemptContext,
	DepartmentDispatchLookup,
	DepartmentExecutionSnapshot,
} from '@/modules/agents/agent-department-execution.contracts';
import { registerDepartmentExecutionFixture } from '@/modules/agents/testing/agent-binding-fixture';
import { storedAgentConfig } from '@/modules/agents/__tests__/test-utils/stored-agent-config';
import { WorkActivity } from '../../database/entities/work-activity.entity';
import { WorkHelpRequest } from '../../database/entities/work-help-request.entity';
import { WorkHelpResponse } from '../../database/entities/work-help-response.entity';
import { WorkWakeLane } from '../../database/entities/work-wake-lane.entity';
import { WorkRepository } from '../../database/repositories/work.repository';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkHelpResponseGate } from '../../work/work-help-response-gate';
import { WorkHelpService } from '../../work/work-help.service';
import { WorkInboxService } from '../../work/work-inbox.service';
import { WorkService } from '../../work/work.service';
import { DepartmentExecutorProxy } from '../../work/executor.contracts';

import { saveCredential } from '@test-integration/db/credentials';
import { createOwner } from '@test-integration/db/users';
import { initCredentialsTypes } from '@test-integration/utils';
import { LicenseMocker } from '@test-integration/license';

const enabled = process.env.N8N_TEST_LIVE_DEPARTMENT_HELP_RESTART === '1';
const phase = process.env.N8N_TEST_DEPARTMENT_HELP_RESTART_PHASE;
const stateFile = process.env.N8N_TEST_DEPARTMENT_HELP_RESTART_STATE_FILE;
const ollamaBaseUrl = (process.env.N8N_TEST_LIVE_OLLAMA_URL ?? 'http://127.0.0.1:1337/v1').replace(
	/\/$/,
	'',
);
const ollamaModel = process.env.N8N_TEST_LIVE_OLLAMA_MODEL ?? 'qwen2.5:3b';
const proofToken = 'bluebird forty two';

type RestartState = {
	actorId: string;
	projectId: string;
	departmentId: string;
	memberId: string;
	workId: string;
	helpRequestId: string;
	requesterAttemptId: string;
};

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createLiveRequester(input: {
	project: Awaited<ReturnType<typeof createTeamProject>>;
	user: Awaited<ReturnType<typeof createOwner>>;
	projectId: string;
	departmentId: string;
	actorId: string;
	memberId: string;
	memberVersion: number;
}) {
	const credential = await saveCredential(
		{
			name: 'Local Ollama help restart test',
			type: 'openAiApi',
			data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
		},
		{ project: input.project, role: 'credential:owner' },
	);
	const config: AgentJsonConfig = {
		name: 'Help restart requester Agent',
		model: `openai/${ollamaModel}`,
		credential: credential.id,
		instructions:
			'Use only department_work, claim_department_work, and submit_department_work. Call department_work with action inspect once and read the latest help answer. Then call claim_department_work with no input and wait for its result. Then call submit_department_work with a structured report. Copy the proof token from the latest help answer into report.result exactly, with no other text. Put the work description in completedWork. Do not call department_work with action claim. A chat reply does not complete work.',
		memory: { enabled: true, storage: 'n8n' },
	};
	const agents = Container.get(AgentRepository);
	const agentId = randomUUID();
	const versionId = randomUUID();
	const agent = await agents.save(
		agents.create({
			id: agentId,
			name: config.name,
			projectId: input.projectId,
			schema: storedAgentConfig(config),
			integrations: [{ type: 'n8n_chat', credentialId: '' }],
			tools: {},
			versionId,
		}),
	);
	await Container.get(AgentHistoryRepository).saveVersion({
		versionId,
		agentId: agent.id,
		schema: storedAgentConfig({
			...config,
			integrations: [{ type: 'n8n_chat', credentialId: '' }],
		}),
		tools: {},
		publishedBy: input.user,
	});
	await agents.update({ id: agent.id }, { activeVersionId: versionId });
	await Container.get(MemberService).setBinding(
		input.projectId,
		input.actorId,
		input.departmentId,
		input.memberId,
		{
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: input.memberVersion,
			requestId: randomUUID(),
		},
	);
	return agent;
}

describe.skipIf(!enabled || !['prepare', 'recover'].includes(phase ?? ''))(
	'AI Department help continuation across process restart with Ollama',
	() => {
		let queueConsumer: AgentMessageQueueConsumer | undefined;

		beforeAll(async () => {
			if (!stateFile) throw new Error('Help restart state file is required.');
			if (!process.env.N8N_USER_FOLDER)
				throw new Error('Set N8N_USER_FOLDER to a test-owned data folder.');
			await testModules.loadModules(['ai-department', 'agents']);
			await testDb.init();
			await initCredentialsTypes();
			new LicenseMocker().mockLicenseState(Container.get(LicenseState));
			await registerDepartmentExecutionFixture();
			if (phase === 'prepare')
				Container.get(DepartmentExecutorProxy).register({
					resolve: async (input) => ({
						status: 'available',
						provider: 'n8n-agent',
						executorId: input.executorId,
						bindingVersion: input.bindingVersion,
						canStart: true,
						canStop: true,
						authorized: true,
					}),
					verifyRun: async () => true,
					isRunStopped: async () => true,
					dispatch: async (_context: DepartmentAttemptContext) => ({
						kind: 'accepted',
						ownerExecutionRef: `seed-owner-${randomUUID()}`,
					}),
					lookup: async (_context): Promise<DepartmentDispatchLookup> => ({ kind: 'absent' }),
					requestStop: async () => ({
						status: 'accepted',
						acknowledged: true,
						confirmed: true,
					}),
					snapshot: async (_input): Promise<DepartmentExecutionSnapshot> => ({
						phase: 'terminal',
						sequence: '2',
						result: { outcome: 'cancelled' },
					}),
					nativeToolApproval: async () => 'not_pending',
				});
			Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
			Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
		});

		afterAll(async () => {
			queueConsumer?.stop();
			await testDb.terminate();
		});

		it.skipIf(phase !== 'prepare')(
			'stores an answered help request before the continuation process starts',
			async () => {
				if (!stateFile) throw new Error('Help restart state file is required.');
				const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
				if (!modelsResponse.ok)
					throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
				const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
				if (!models.data?.some((model) => model.id === ollamaModel))
					throw new Error(`Ollama model "${ollamaModel}" is not available.`);

				const user = await createOwner();
				const project = await createTeamProject('Help continuation restart test', user);
				const department = await Container.get(DepartmentService).create(project.id, user.id, {
					name: 'Help restart test',
					requestId: randomUUID(),
				});
				const member = await Container.get(MemberService).create(
					project.id,
					user.id,
					department.id,
					{
						name: 'Campaign writer',
						role: 'Marketing',
						requestId: randomUUID(),
					},
				);
				await createLiveRequester({
					project: project,
					user,
					projectId: project.id,
					departmentId: department.id,
					actorId: user.id,
					memberId: member.id,
					memberVersion: member.version,
				});
				const workService = Container.get(WorkService);
				const item = await workService.createWork(project.id, user.id, department.id, {
					instruction: `Write a campaign proof note using the saved help answer. The result must be exactly ${proofToken}.`,
					assigneeMemberId: member.id,
					priority: 'normal',
					reviewPolicy: 'required',
					requestId: randomUUID(),
				});
				const instruction =
					`Write a campaign proof note using the saved help answer. The result must be exactly ${proofToken}. ` +
					`Use department_work once. First inspect and read the latest help answer. ` +
					`Then call claim_department_work with no input and wait for the result. ` +
					`Then call submit_department_work with the exact token in report.result and completedWork describing the note. ` +
					`Do not submit a chat reply as the result.`;
				const updated = await workService.updateWork(project.id, user.id, department.id, item.id, {
					expectedVersion: item.version,
					instruction,
					requestId: randomUUID(),
				});
				const ready = await workService.markReady(project.id, user.id, department.id, item.id, {
					expectedVersion: updated.version,
					requestId: randomUUID(),
				});
				queueConsumer = Container.get(AgentMessageQueueConsumer);
				queueConsumer.start();
				const firstTurn = await workService.startWork(project.id, user.id, department.id, item.id, {
					expectedVersion: ready.version,
					requestId: randomUUID(),
				});
				if (!firstTurn.attemptId)
					throw new Error('Could not create the initial requester attempt.');
				await workService.cancelWork(project.id, user.id, department.id, item.id, {
					expectedVersion: firstTurn.work.version,
					requestId: randomUUID(),
				});
				const repository = Container.get(WorkRepository);
				const requesterAttemptId = firstTurn.attemptId;
				const stopDeadline = Date.now() + 30_000;
				let sourceAttempt = await repository.findAttempt(project.id, requesterAttemptId);
				while (Date.now() < stopDeadline && sourceAttempt?.phase !== 'terminal') {
					await workService.reconcileAttempts();
					await delay(100);
					sourceAttempt = await repository.findAttempt(project.id, requesterAttemptId);
				}
				if (sourceAttempt?.phase !== 'terminal')
					throw new Error('Initial requester attempt did not stop before restart.');
				queueConsumer?.stop();
				queueConsumer = undefined;
				const blockedWork = await repository.findWork(project.id, department.id, item.id);
				if (!blockedWork) throw new Error('Work item is missing.');
				blockedWork.state = 'blocked';
				blockedWork.currentAttemptId = requesterAttemptId;
				blockedWork.version += 1;
				await repository.saveWork(blockedWork);

				const helpRequestId = randomUUID();
				const activity = Object.assign(new WorkActivity(), {
					id: randomUUID(),
					projectId: project.id,
					departmentId: department.id,
					workId: item.id,
					attemptId: requesterAttemptId,
					actorId: user.id,
					actorKind: 'user' as const,
					kind: 'help_answered' as const,
					body: `Use evidence token ${proofToken} in the result.`,
					workVersion: blockedWork.version,
					createdAt: new Date(),
				});
				await repository.addActivity(activity, {});
				const request = Object.assign(new WorkHelpRequest(), {
					id: helpRequestId,
					projectId: project.id,
					departmentId: department.id,
					workId: item.id,
					requesterMemberId: member.id,
					sourceAttemptId: requesterAttemptId,
					initiatingUserId: user.id,
					requestId: randomUUID(),
					question: 'What proof token should the result contain?',
					attemptedStepsJson: JSON.stringify(['Drafted the campaign note.']),
					reason: 'The required evidence token is missing.',
					expertiseTagsJson: JSON.stringify(['campaign-proof']),
					requestChainJson: JSON.stringify({ memberIds: [], userIds: [] }),
					recipientMemberId: null,
					recipientUserId: null,
					routingState: 'unresolved' as const,
					bindingVersion: null,
					inputHash: 'a'.repeat(64),
					deadlineAt: new Date(Date.now() + 10 * 60 * 1000),
					state: 'answered' as const,
					ownerReference: helpRequestId,
					ownerInvocationHash: 'b'.repeat(64),
					version: 2,
				});
				await repository.saveHelpRequest(request);
				await repository.saveHelpResponse(
					Object.assign(new WorkHelpResponse(), {
						id: randomUUID(),
						projectId: project.id,
						departmentId: department.id,
						workId: item.id,
						helpRequestId,
						activityId: activity.id,
						responderKind: 'user' as const,
						responderUserId: user.id,
						responderMemberId: null,
						answer: `Use evidence token ${proofToken} in the result.`,
						answerHash: 'c'.repeat(64),
						sourceAttemptId: requesterAttemptId,
						ownerInvocationRef: null,
						ownerSequence: null,
						createdAt: activity.createdAt,
					}),
				);
				const responseGate = vi
					.spyOn(Container.get(WorkHelpResponseGate), 'canUseAgentResponses')
					.mockReturnValue(true);
				try {
					await registerDepartmentExecutionFixture();
					const help = Container.get(WorkHelpService);
					await Promise.all([help.reconcilePending(), help.reconcilePending()]);
				} finally {
					responseGate.mockRestore();
				}
				const preparedWork = await repository.findWork(project.id, department.id, item.id);
				const preparedLane = await Container.get(DataSource).manager.findOneBy(WorkWakeLane, {
					projectId: project.id,
					memberId: member.id,
					actorId: user.id,
					bindingVersion: sourceAttempt.bindingVersion,
				});
				expect(preparedWork?.state).toBe('ready');
				expect(await repository.listAttempts(project.id, item.id)).toHaveLength(2);
				expect(preparedLane).toMatchObject({
					state: 'accepted',
					activeAttemptId: preparedWork?.currentAttemptId,
				});
				expect(preparedLane?.generation).toBe(preparedLane?.acknowledgedGeneration);
				const queuedAttempt = preparedWork?.currentAttemptId
					? await repository.findAttempt(project.id, preparedWork.currentAttemptId)
					: null;
				if (!queuedAttempt?.ownerExecutionRef)
					throw new Error('The coalesced requester wake has no accepted owner message.');
				expect(
					await Container.get(AgentMessageQueueRepository).findByMessageId(
						queuedAttempt.ownerExecutionRef,
					),
				).toMatchObject({
					threadId: queuedAttempt.id,
					messageId: queuedAttempt.ownerExecutionRef,
				});
				expect(Container.get(WorkHelpResponseGate).canUseAgentResponses()).toBe(false);
				writeFileSync(
					stateFile,
					JSON.stringify({
						actorId: user.id,
						projectId: project.id,
						departmentId: department.id,
						memberId: member.id,
						workId: item.id,
						helpRequestId,
						requesterAttemptId,
					} satisfies RestartState),
				);
			},
		);

		it.skipIf(phase !== 'recover')(
			'recovers the answered help request and runs exactly one requester attempt',
			async () => {
				if (!stateFile) throw new Error('Help restart state file is required.');
				const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
				if (!modelsResponse.ok)
					throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
				const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
				if (!models.data?.some((model) => model.id === ollamaModel))
					throw new Error(`Ollama model "${ollamaModel}" is not available.`);

				const state = JSON.parse(readFileSync(stateFile, 'utf8')) as RestartState;
				const responseGate = vi
					.spyOn(Container.get(WorkHelpResponseGate), 'canUseAgentResponses')
					.mockReturnValue(true);
				const work = Container.get(WorkService);
				const repository = Container.get(WorkRepository);
				const help = Container.get(WorkHelpService);
				queueConsumer = Container.get(AgentMessageQueueConsumer);
				queueConsumer.start();
				try {
					await Promise.all([help.reconcilePending(), help.reconcilePending()]);
					let current = await work.getWork(state.projectId, state.departmentId, state.workId);
					const deadline = Date.now() + 180_000;
					while (Date.now() < deadline && current.state !== 'review') {
						current = await work.getWork(state.projectId, state.departmentId, state.workId);
						if (current.state !== 'review') await delay(500);
					}
					if (current.state !== 'review') {
						const attempt = current.currentAttemptId
							? await repository.findAttempt(state.projectId, current.currentAttemptId)
							: null;
						const execution = attempt?.ownerExecutionRef
							? await Container.get(AgentExecutionRepository).findByInputMessageId(
									attempt.ownerExecutionRef,
								)
							: null;
						const toolCalls = execution?.timeline?.flatMap((event) =>
							event.type === 'tool-call'
								? [{ name: event.name, input: event.input, output: event.output }]
								: [],
						);
						throw new Error(
							`Requester continuation did not reach review after restart: ${JSON.stringify({ state: current.state, attempt: attempt ? { phase: attempt.phase, outcome: attempt.outcome, safeSummary: attempt.safeSummary } : null, execution: execution ? { status: execution.status, toolCalls } : null })}`,
						);
					}
					expect(current.assigneeMemberId).toBe(state.memberId);
					expect(await repository.listAttempts(state.projectId, state.workId)).toHaveLength(2);
					expect(
						await repository.findHelpRequest(
							state.projectId,
							state.departmentId,
							state.workId,
							state.helpRequestId,
						),
					).toMatchObject({ state: 'answered' });
					const response = await repository.findHelpResponse(
						state.projectId,
						state.departmentId,
						state.workId,
						state.helpRequestId,
					);
					expect(response?.answer).toContain(proofToken);
					const resumedAttempt = await repository.findAttempt(
						state.projectId,
						current.currentAttemptId!,
					);
					if (!resumedAttempt?.ownerExecutionRef)
						throw new Error('Recovered requester attempt has no owner execution.');
					const execution = await Container.get(AgentExecutionRepository).findByInputMessageId(
						resumedAttempt.ownerExecutionRef,
					);
					const executionDeadline = Date.now() + 30_000;
					let completedExecution = execution;
					while (Date.now() < executionDeadline && completedExecution?.status === 'running') {
						await delay(250);
						completedExecution = await Container.get(AgentExecutionRepository).findByInputMessageId(
							resumedAttempt.ownerExecutionRef,
						);
					}
					expect(completedExecution?.status).toBe('success');
					const submit = completedExecution?.timeline
						?.filter((event) => event.type === 'tool-call')
						.find((event) => event.name === 'submit_department_work');
					expect(JSON.stringify(submit?.input)).toContain(proofToken);
					const attemptDeadline = Date.now() + 30_000;
					let terminalAttempt = await repository.findAttempt(state.projectId, resumedAttempt.id);
					while (Date.now() < attemptDeadline && terminalAttempt?.phase !== 'terminal') {
						await work.reconcileAttempts();
						await delay(250);
						terminalAttempt = await repository.findAttempt(state.projectId, resumedAttempt.id);
					}
					expect(terminalAttempt?.phase).toBe('terminal');
					expect(terminalAttempt?.outcome).toBe('succeeded');
				} finally {
					responseGate.mockRestore();
				}
			},
			240_000,
		);
	},
);
