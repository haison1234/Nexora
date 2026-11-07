import type { AgentJsonConfig } from '@n8n/api-types';
import { createTeamProject, linkUserToProject, testDb, testModules } from '@n8n/backend-test-utils';
import { LicenseState } from '@n8n/backend-common';
import { Container } from '@n8n/di';
import { ProjectRelationRepository } from '@n8n/db';
import { createDeferredPromise } from '@n8n/utils/promise/deferred-promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
	DepartmentAttemptContext,
	DepartmentDispatchLookup,
	DepartmentExecutor,
	DepartmentExecutionSnapshot,
} from '@/modules/agents/agent-department-execution.contracts';
import { DepartmentExecutorProxy } from '@/modules/ai-department/work/executor.contracts';
import { AgentHistoryRepository } from '@/modules/agents/repositories/agent-history.repository';
import { AgentExecutionRepository } from '@/modules/agents/repositories/agent-execution.repository';
import { AgentMessageQueueConsumer } from '@/modules/agents/agent-message-queue-consumer.service';
import { AgentDepartmentExecutionAdapter } from '@/modules/agents/agent-department-execution.adapter';
import {
	DepartmentConsultationBindingVerifierProxy,
	DepartmentConsultationContextReaderProxy,
	DepartmentConsultationInvocationOwnerProxy,
} from '@/modules/agents/agent-department-consultation.contracts';
import { AgentDepartmentConsultationInvocationOwnerService } from '@/modules/agents/agent-department-consultation-invocation-owner.service';
import { AgentRepository } from '@/modules/agents/repositories/agent.repository';
import { AgentDepartmentConsultationInvocationRepository } from '@/modules/agents/repositories/agent-department-consultation-invocation.repository';
import {
	createAgentBindingFixture,
	registerDepartmentExecutionFixture,
} from '@/modules/agents/testing/agent-binding-fixture';
import { storedAgentConfig } from '@/modules/agents/__tests__/test-utils/stored-agent-config';
import {
	DepartmentWorkActionsProxy,
	DepartmentWorkInboxProxy,
} from '@/modules/agents/agent-department-execution.contracts';

import { saveCredential } from '@test-integration/db/credentials';
import { createMember, createOwner } from '@test-integration/db/users';
import { initCredentialsTypes } from '@test-integration/utils';
import { LicenseMocker } from '@test-integration/license';
import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkHelpResponseGate } from '../../work/work-help-response-gate';
import { WorkHelpService } from '../../work/work-help.service';
import { AiDepartmentOperationsBroadcaster } from '../../operations-broadcaster.service';
import { WorkHelpRoutingService } from '../../work/work-help-routing.service';
import { WorkInboxService } from '../../work/work-inbox.service';
import { WorkReleaseService } from '../../work/work-release.service';
import { WorkService } from '../../work/work.service';
import { WorkRepository } from '../../database/repositories/work.repository';
import { DirectoryRepository } from '../../database/repositories/directory.repository';
import { TransactionRunner } from '@n8n/db';
import { ConsultationBindingVerifierService } from '../../consultation-binding-verifier.service';
import { ConsultationContextReaderService } from '../../consultation-context-reader.service';

const enabled = process.env.N8N_TEST_LIVE_DEPARTMENT_CONSULTATION === '1';
const consultationFetchProbe = vi.hoisted(() => ({
	urlPrefix: '',
	requestStarted: undefined as (() => void) | undefined,
	waitBeforeResponse: undefined as (() => Promise<void>) | undefined,
}));

vi.mock('@/utils/ai-proxy-fetch', async (importOriginal) => {
	const original = await importOriginal<typeof import('@/utils/ai-proxy-fetch')>();
	return {
		...original,
		createAiProxyFetch: (outboundHttp: Parameters<typeof original.createAiProxyFetch>[0]) => {
			const fetch = original.createAiProxyFetch(outboundHttp);
			return async (input: RequestInfo | URL, init?: RequestInit) => {
				const isModelRequest =
					consultationFetchProbe.urlPrefix.length > 0 &&
					String(input).startsWith(consultationFetchProbe.urlPrefix);
				if (isModelRequest) consultationFetchProbe.requestStarted?.();
				const response = await fetch(input, init);
				if (isModelRequest) await consultationFetchProbe.waitBeforeResponse?.();
				return response;
			};
		},
	};
});

const ollamaBaseUrl = (process.env.N8N_TEST_LIVE_OLLAMA_URL ?? 'http://127.0.0.1:1337/v1').replace(
	/\/$/,
	'',
);
const ollamaModel = process.env.N8N_TEST_LIVE_OLLAMA_MODEL ?? 'qwen2.5:3b';

async function delay(ms: number) {
	return await new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!enabled)('AI Department live help consultation with Ollama', () => {
	let queueConsumer: AgentMessageQueueConsumer | undefined;

	beforeAll(async () => {
		if (!process.env.N8N_USER_FOLDER) {
			throw new Error('Set N8N_USER_FOLDER to a test-owned data folder.');
		}
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		await initCredentialsTypes();
		new LicenseMocker().mockLicenseState(Container.get(LicenseState));
		await registerDepartmentExecutionFixture();
		Container.get(DepartmentConsultationInvocationOwnerProxy).register(
			Container.get(AgentDepartmentConsultationInvocationOwnerService),
		);
		Container.get(DepartmentConsultationBindingVerifierProxy).register(
			Container.get(ConsultationBindingVerifierService),
		);
		Container.get(DepartmentConsultationContextReaderProxy).register(
			Container.get(ConsultationContextReaderService),
		);
		Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
		Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
	});

	afterAll(async () => {
		queueConsumer?.stop();
		await testDb.terminate();
	});

	it.each([
		'normal',
		'binding-change',
		'member-reassignment',
		'executor-revision-change',
		'actor-access-loss',
		'concurrent-answer',
	] as const)(
		'continues the requester with a live Agent when access is %s',
		async (accessScenario) => {
			const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
			if (!modelsResponse.ok)
				throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
			const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
			if (!models.data?.some((model) => model.id === ollamaModel)) {
				throw new Error(`Ollama model "${ollamaModel}" is not available.`);
			}

			const projectOwner = await createOwner();
			const project = await createTeamProject('Live help consultation test', projectOwner);
			const user = accessScenario === 'actor-access-loss' ? await createMember() : projectOwner;
			if (user.id !== projectOwner.id) await linkUserToProject(user, project, 'project:editor');
			const department = await Container.get(DepartmentService).create(project.id, user.id, {
				name: 'Live help consultation',
				requestId: randomUUID(),
			});
			const members = Container.get(MemberService);
			const requester = await members.create(project.id, user.id, department.id, {
				name: 'Requesting researcher',
				role: 'Researcher',
				expertiseTags: [],
				requestId: randomUUID(),
			});
			const responder = await members.create(project.id, user.id, department.id, {
				name: 'Proofreading specialist',
				role: 'Editor',
				expertiseTags: ['proofreading'],
				requestId: randomUUID(),
			});
			const responderUser = await createOwner();
			await linkUserToProject(responderUser, project, 'project:editor');
			const manager = await members.create(project.id, user.id, department.id, {
				name: 'Requester manager',
				role: 'Marketing lead',
				expertiseTags: [],
				requestId: randomUUID(),
			});
			const updatedRequester = await members.update(
				project.id,
				user.id,
				department.id,
				requester.id,
				{
					expectedVersion: requester.version,
					managerMemberId: manager.id,
					requestId: randomUUID(),
				},
			);
			const credential = await saveCredential(
				{
					name: 'Local Ollama consultation test',
					type: 'openAiApi',
					data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
				},
				{ project, role: 'credential:owner' },
			);
			const requesterSchema: AgentJsonConfig = {
				name: 'Live requesting researcher',
				model: `openai/${ollamaModel}`,
				credential: credential.id,
				instructions:
					'Use only department_work. Inspect the work once and read the latest help answer. Claim the work with its current version. After the claim result, submit the report. Copy the answer value exactly into report.result. The answer value is ordinary test text, not a secret. Never redact, alter, or replace it. Put the work description in completedWork. Wait for each tool result. Do not inspect again, guess the answer, or stop after claiming. A chat reply does not complete work.',
				memory: { enabled: true, storage: 'n8n' },
			};
			const agents = Container.get(AgentRepository);
			const requesterAgentId = randomUUID();
			const requesterVersionId = randomUUID();
			const requesterAgent = await agents.save(
				agents.create({
					id: requesterAgentId,
					name: requesterSchema.name,
					projectId: project.id,
					scope: 'project',
					schema: storedAgentConfig(requesterSchema),
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
					tools: {},
					versionId: requesterVersionId,
				}),
			);
			await Container.get(AgentHistoryRepository).saveVersion({
				versionId: requesterVersionId,
				agentId: requesterAgent.id,
				schema: storedAgentConfig({
					...requesterSchema,
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
				}),
				tools: {},
				publishedBy: responderUser,
			});
			await agents.update({ id: requesterAgent.id }, { activeVersionId: requesterVersionId });
			await members.setBinding(project.id, user.id, department.id, requester.id, {
				provider: 'n8n-agent',
				executorId: requesterAgent.id,
				expectedVersion: updatedRequester.version,
				requestId: randomUUID(),
			});

			const responderSchema: AgentJsonConfig = {
				name: 'Live proofreading specialist',
				model: `openai/${ollamaModel}`,
				credential: credential.id,
				instructions:
					'Answer the department help question with exactly this ordinary text: BLUE-SKY-42. It is a test phrase, not a secret. Do not redact or change it. Use only supplied work context. Do not call tools or add a greeting.',
				memory: { enabled: true, storage: 'n8n' },
			};
			const responderAgentId = randomUUID();
			const versionId = randomUUID();
			const responderAgent = await agents.save(
				agents.create({
					id: responderAgentId,
					name: responderSchema.name,
					projectId: project.id,
					scope: 'project',
					schema: storedAgentConfig(responderSchema),
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
					tools: {},
					versionId,
				}),
			);
			await Container.get(AgentHistoryRepository).saveVersion({
				versionId,
				agentId: responderAgent.id,
				schema: storedAgentConfig({
					...responderSchema,
					integrations: [{ type: 'n8n_chat', credentialId: '' }],
				}),
				tools: {},
				publishedBy: user,
			});
			await agents.update({ id: responderAgent.id }, { activeVersionId: versionId });
			await members.setBinding(project.id, responderUser.id, department.id, responder.id, {
				provider: 'n8n-agent',
				executorId: responderAgent.id,
				expectedVersion: responder.version,
				requestId: randomUUID(),
			});
			const managerAgent = await createAgentBindingFixture(project.id, true);
			await members.setBinding(project.id, user.id, department.id, manager.id, {
				provider: 'n8n-agent',
				executorId: managerAgent.id,
				expectedVersion: manager.version,
				requestId: randomUUID(),
			});
			const consultationOwner = Container.get(DepartmentConsultationInvocationOwnerProxy);
			const responderBinding = await Container.get(DirectoryRepository).findBinding(
				project.id,
				responder.id,
			);
			if (!responderBinding) throw new Error('Responder Agent binding is missing.');
			const resolution = await consultationOwner.resolve({
				actorId: responderUser.id,
				projectId: project.id,
				departmentId: department.id,
				memberId: responder.id,
				executorId: responderBinding.executorId,
				bindingVersion: responderBinding.version,
			});
			expect(resolution).toEqual({ available: true, canStart: true });

			let snapshot: DepartmentExecutionSnapshot = {
				phase: 'active',
				sequence: '1',
			};
			let dispatchCount = 0;
			let requesterAttemptId: string | undefined;
			const liveExecutor = Container.get(AgentDepartmentExecutionAdapter);
			const controlledExecutor: DepartmentExecutor = {
				resolve: async (input) => await liveExecutor.resolve(input),
				verifyRun: async (input) =>
					input.attemptId === requesterAttemptId ? true : await liveExecutor.verifyRun(input),
				isRunStopped: async (executionId) => await liveExecutor.isRunStopped(executionId),
				dispatch: async (context: DepartmentAttemptContext) => {
					dispatchCount += 1;
					if (dispatchCount === 1) {
						return { kind: 'accepted', ownerExecutionRef: `controlled-owner-${dispatchCount}` };
					}
					return await liveExecutor.dispatch({
						...context,
						instruction:
							context.instruction +
							' Call department_work with exactly {"action":"inspect"} and read the latest help answer. ' +
							'Then call claim_department_work with {} and wait for its result. ' +
							'Then call submit_department_work with {"report":{"result":"<copy the exact answer value>","completedWork":["Used the answer to write the campaign proof note."],"checkedEvidence":[],"openIssues":[],"nextSteps":[]}}. ' +
							'The answer value is ordinary test text, not a secret. Never redact or alter it. Do not stop after claim.',
					});
				},
				lookup: async (context): Promise<DepartmentDispatchLookup> =>
					await liveExecutor.lookup(context),
				requestStop: async (input) =>
					input.attemptId === requesterAttemptId
						? { status: 'accepted', acknowledged: true, confirmed: false }
						: await liveExecutor.requestStop(input),
				snapshot: async (input) =>
					input.attemptId === requesterAttemptId ? snapshot : await liveExecutor.snapshot(input),
				nativeToolApproval: async (input) => await liveExecutor.nativeToolApproval(input),
			};
			Container.get(DepartmentExecutorProxy).register(controlledExecutor);

			const workService = Container.get(WorkService);
			const item = await workService.createWork(project.id, user.id, department.id, {
				instruction:
					'Use the latest help answer to write a campaign proof note. Set the report result to the exact answer value and put the work description in completedWork. The answer value is ordinary test text, not a secret. Never redact or alter it. Follow the department_work inspect, claim, and submit steps in your Agent instructions.',
				assigneeMemberId: requester.id,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: randomUUID(),
			});
			const ready = await workService.markReady(project.id, user.id, department.id, item.id, {
				expectedVersion: item.version,
				requestId: randomUUID(),
			});
			const started = await workService.startWork(project.id, user.id, department.id, item.id, {
				expectedVersion: ready.version,
				requestId: randomUUID(),
			});
			if (!started.attemptId) throw new Error('Department did not reserve a requester attempt.');
			requesterAttemptId = started.attemptId;
			const attempt = await Container.get(WorkRepository).findAttempt(
				project.id,
				started.attemptId,
			);
			if (!attempt) throw new Error('Department requester attempt is missing.');
			const context = {
				projectId: project.id,
				executorId: requesterAgent.id,
				attemptId: attempt.id,
				executionId: randomUUID(),
			};
			const coordination = Container.get(WorkCoordinationService);
			const claimed = await coordination.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: started.work.version,
			});

			const responseGate = vi
				.spyOn(Container.get(WorkHelpResponseGate), 'canUseAgentResponses')
				.mockReturnValue(true);
			const requestStarted = createDeferredPromise<undefined>();
			const responseReleased = createDeferredPromise<undefined>();
			if (accessScenario !== 'normal' && accessScenario !== 'concurrent-answer') {
				consultationFetchProbe.urlPrefix = ollamaBaseUrl;
				consultationFetchProbe.requestStarted = () => requestStarted.resolve(undefined);
				consultationFetchProbe.waitBeforeResponse = async () => await responseReleased.promise;
			}
			queueConsumer = Container.get(AgentMessageQueueConsumer);
			queueConsumer.start();
			try {
				snapshot = {
					phase: 'terminal',
					sequence: '2',
					result: { outcome: 'cancelled', safeSummary: 'Requester stopped for help.' },
				};
				const asked = await coordination.executeToolAction(context, randomUUID(), {
					action: 'ask',
					expectedVersion: claimed.work.version,
					question: 'What is the exact ordinary test phrase for the campaign draft?',
					attemptedSteps: ['Drafted a headline from the brief.'],
					reason: 'The headline does not state the customer benefit.',
					expertiseTags: ['proofreading'],
				});
				if (!('helpRequest' in asked)) throw new Error('Expected the work help request.');
				const help = Container.get(WorkHelpService);
				const repository = Container.get(WorkRepository);
				if (accessScenario !== 'normal' && accessScenario !== 'concurrent-answer') {
					await Promise.race([
						requestStarted.promise,
						delay(90_000).then(() => {
							throw new Error('Ollama did not start a consultation request within 90 seconds.');
						}),
					]);
					if (accessScenario === 'binding-change') {
						const currentResponder = await Container.get(DirectoryRepository).findMember(
							project.id,
							department.id,
							responder.id,
						);
						if (!currentResponder) throw new Error('Responder member is missing.');
						await members.clearBinding(project.id, responderUser.id, department.id, responder.id, {
							expectedVersion: currentResponder.version,
							requestId: randomUUID(),
						});
					} else if (accessScenario === 'member-reassignment') {
						const currentResponder = await Container.get(DirectoryRepository).findMember(
							project.id,
							department.id,
							responder.id,
						);
						if (!currentResponder) throw new Error('Responder member is missing.');
						await members.update(project.id, user.id, department.id, responder.id, {
							managerMemberId: manager.id,
							expectedVersion: currentResponder.version,
							requestId: randomUUID(),
						});
					} else if (accessScenario === 'executor-revision-change') {
						const currentResponder = await Container.get(DirectoryRepository).findMember(
							project.id,
							department.id,
							responder.id,
						);
						if (!currentResponder) throw new Error('Responder member is missing.');
						await members.setBinding(project.id, responderUser.id, department.id, responder.id, {
							provider: 'n8n-agent',
							executorId: responderAgent.id,
							expectedVersion: currentResponder.version,
							requestId: randomUUID(),
						});
					} else if (accessScenario === 'actor-access-loss') {
						const projectRelations = Container.get(ProjectRelationRepository);
						await projectRelations.delete({ projectId: project.id, userId: user.id });
					}
					responseReleased.resolve(undefined);
					if (accessScenario !== 'member-reassignment') {
						const accessDeadline = Date.now() + 90_000;
						let request = await repository.findHelpRequestById(project.id, asked.helpRequest.id);
						let invocation = await Container.get(
							AgentDepartmentConsultationInvocationRepository,
						).findByInvocationId(project.id, asked.helpRequest.id);
						while (Date.now() < accessDeadline && request?.state !== 'awaiting_answer') {
							await help.reconcilePending();
							request = await repository.findHelpRequestById(project.id, asked.helpRequest.id);
							invocation = await Container.get(
								AgentDepartmentConsultationInvocationRepository,
							).findByInvocationId(project.id, asked.helpRequest.id);
							if (request?.state !== 'awaiting_answer') await delay(250);
						}
						expect(invocation).toMatchObject({ state: 'terminal', outcome: 'succeeded' });
						expect(request?.state).toBe('awaiting_answer');
						expect(
							await repository.findHelpResponse(
								project.id,
								department.id,
								item.id,
								asked.helpRequest.id,
							),
						).toBeNull();
						expect(await repository.listAttempts(project.id, item.id)).toHaveLength(1);
						expect(await workService.getWork(project.id, department.id, item.id)).toMatchObject({
							state: 'blocked',
							assigneeMemberId: requester.id,
						});
						return;
					}
				}
				if (accessScenario === 'concurrent-answer') {
					queueConsumer?.stop();
					const invocationRepository = Container.get(
						AgentDepartmentConsultationInvocationRepository,
					);
					const terminalDeadline = Date.now() + 180_000;
					let invocation = await invocationRepository.findByInvocationId(
						project.id,
						asked.helpRequest.id,
					);
					while (Date.now() < terminalDeadline && invocation?.state !== 'terminal') {
						invocation = await invocationRepository.findByInvocationId(
							project.id,
							asked.helpRequest.id,
						);
						if (invocation?.state !== 'terminal') await delay(500);
					}
					expect(invocation).toMatchObject({ state: 'terminal', outcome: 'succeeded' });
					const owner = Container.get(AgentDepartmentConsultationInvocationOwnerService);
					const originalReadResult = owner.readResult.bind(owner);
					const baseHelpService = Container.get(WorkHelpService);
					let readers = 0;
					let releaseReaders: (() => void) | undefined;
					const bothReadersStarted = new Promise<void>((resolve) => {
						releaseReaders = resolve;
					});
					vi.spyOn(owner, 'readResult').mockImplementation(async (input) => {
						readers += 1;
						if (readers === 2) releaseReaders?.();
						await bothReadersStarted;
						return await originalReadResult(input);
					});
					vi.spyOn(
						baseHelpService as unknown as {
							continueRequester(projectId: string, request: unknown): Promise<void>;
						},
						'continueRequester',
					).mockResolvedValue(undefined);
					const secondHelpService = new WorkHelpService(
						Container.get(WorkRepository),
						Container.get(DirectoryRepository),
						Container.get(WorkHelpRoutingService),
						Container.get(WorkReleaseService),
						Container.get(TransactionRunner),
						Container.get(DepartmentExecutorProxy),
						consultationOwner,
						workService,
						Container.get(WorkHelpResponseGate),
						Container.get(AiDepartmentOperationsBroadcaster),
					);
					await Promise.all([
						(
							baseHelpService as unknown as {
								reconcileConsultation(projectId: string, helpRequestId: string): Promise<void>;
							}
						).reconcileConsultation(project.id, asked.helpRequest.id),
						(
							secondHelpService as unknown as {
								reconcileConsultation(projectId: string, helpRequestId: string): Promise<void>;
							}
						).reconcileConsultation(project.id, asked.helpRequest.id),
					]);
					expect(readers).toBe(2);
					const racedResponse = await repository.findHelpResponse(
						project.id,
						department.id,
						item.id,
						asked.helpRequest.id,
					);
					expect(racedResponse?.answer).toContain('BLUE-SKY-42');
					const [activities] = await repository.listActivity(
						project.id,
						department.id,
						item.id,
						100,
						0,
					);
					expect(activities.filter(({ kind }) => kind === 'help_answered')).toHaveLength(1);
					const racedAttempts = await repository.listAttempts(project.id, item.id);
					expect(
						racedAttempts.map(({ id, phase, ordinal }) => ({ id, phase, ordinal })),
					).toMatchObject([
						{ id: started.attemptId, ordinal: 1 },
						{ phase: 'active', ordinal: 2 },
					]);
					expect(await workService.getWork(project.id, department.id, item.id)).toMatchObject({
						state: 'ready',
						assigneeMemberId: requester.id,
					});
					return;
				}

				const deadline = Date.now() + 180_000;
				let response = await repository.findHelpResponse(
					project.id,
					department.id,
					item.id,
					asked.helpRequest.id,
				);
				while (!response && Date.now() < deadline) {
					await help.reconcilePending();
					response = await repository.findHelpResponse(
						project.id,
						department.id,
						item.id,
						asked.helpRequest.id,
					);
					const invocation = await Container.get(
						AgentDepartmentConsultationInvocationRepository,
					).findByInvocationId(project.id, asked.helpRequest.id);
					if (invocation?.state === 'terminal' && invocation.safeErrorCode) break;
					if (!response) await delay(500);
				}
				if (!response) {
					const details = await help.listForWork(project.id, department.id, item.id);
					const invocation = await Container.get(
						AgentDepartmentConsultationInvocationRepository,
					).findByInvocationId(project.id, asked.helpRequest.id);
					throw new Error(
						`Live consultation did not store a response: ${JSON.stringify({ details, invocation: invocation ? { state: invocation.state, safeErrorCode: invocation.safeErrorCode } : null })}`,
					);
				}
				expect(response.responderKind).toBe('agent');
				expect(response.responderMemberId).toBe(responder.id);
				expect(response.ownerInvocationRef).toBe(asked.helpRequest.id);
				expect(response.ownerSequence).toBeGreaterThan(0);
				expect(response.answer.trim().length).toBeGreaterThan(0);
				expect(Array.from(response.answer).length).toBeLessThanOrEqual(4_000);
				expect(response.answer).toContain('BLUE-SKY-42');

				const continuationDeadline = Date.now() + 90_000;
				let current = await workService.getWork(project.id, department.id, item.id);
				while (Date.now() < continuationDeadline && current.state !== 'review') {
					await workService.reconcileAttempts();
					current = await workService.getWork(project.id, department.id, item.id);
					const latestAttempts = await repository.listAttempts(project.id, item.id);
					const latestAttempt = latestAttempts.at(-1);
					if (latestAttempt?.id !== started.attemptId && latestAttempt?.phase === 'terminal') {
						break;
					}
					if (current.state !== 'review') await delay(500);
				}
				if (current.state !== 'review') {
					const attempts = await repository.listAttempts(project.id, item.id);
					const resumed = attempts.at(-1);
					const execution = resumed?.ownerExecutionRef
						? await Container.get(AgentExecutionRepository).findByInputMessageId(
								resumed.ownerExecutionRef,
							)
						: null;
					const toolCalls =
						execution?.timeline?.flatMap((event) =>
							event.type === 'tool-call'
								? [{ name: event.name, input: event.input, output: event.output }]
								: [],
						) ?? [];
					throw new Error(
						`Requester continuation did not reach review: ${JSON.stringify({ state: current.state, attempt: resumed ? { phase: resumed.phase, outcome: resumed.outcome, safeSummary: resumed.safeSummary, ownerExecutionRef: resumed.ownerExecutionRef } : null, execution: execution ? { status: execution.status, toolCalls } : null })}`,
					);
				}
				expect(current.assigneeMemberId).toBe(requester.id);
				const attempts = await workService.listAttempts(project.id, department.id, item.id);
				expect(attempts).toHaveLength(2);
				const resumedAttempt = attempts.at(-1);
				if (!resumedAttempt) throw new Error('Missing resumed requester attempt.');
				const resumedAttemptRecord = await repository.findAttempt(project.id, resumedAttempt.id);
				if (!resumedAttemptRecord) throw new Error('Missing resumed requester attempt record.');
				const resumedExecutions = await Container.get(
					AgentExecutionRepository,
				).findByThreadIdOrdered(resumedAttempt.id);
				const resumedExecution = resumedExecutions.at(-1);
				const requesterToolCalls =
					resumedExecution?.timeline?.flatMap((event) =>
						event.type === 'tool-call'
							? [{ name: event.name, input: event.input, output: event.output }]
							: [],
					) ?? [];
				const inspectResult = resumedExecution?.timeline
					?.filter((event) => event.type === 'tool-call')
					.find((event) => event.name === 'department_work');
				expect(
					inspectResult?.input,
					JSON.stringify({
						ownerExecutionRef: resumedAttemptRecord.ownerExecutionRef,
						execution: resumedExecution
							? {
									id: resumedExecution.id,
									status: resumedExecution.status,
									eventTypes: resumedExecution.timeline?.map((event) => event.type),
								}
							: null,
						requesterToolCalls,
					}),
				).toMatchObject({
					action: 'inspect',
				});
				expect(JSON.stringify(inspectResult?.output)).toContain('BLUE-SKY-42');
				expect(
					(await repository.findAttempt(project.id, resumedAttempt.id))?.safeSummary,
				).toContain('BLUE-SKY-42');
				expect(dispatchCount).toBe(2);
			} finally {
				responseReleased.resolve(undefined);
				consultationFetchProbe.urlPrefix = '';
				consultationFetchProbe.requestStarted = undefined;
				consultationFetchProbe.waitBeforeResponse = undefined;
				responseGate.mockRestore();
			}
		},
		240_000,
	);
});
