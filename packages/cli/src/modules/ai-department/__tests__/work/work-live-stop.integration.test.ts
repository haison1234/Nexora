import type { AgentJsonConfig } from '@n8n/api-types';
import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { LicenseState } from '@n8n/backend-common';
import { Container } from '@n8n/di';
import { createDeferredPromise } from '@n8n/utils/promise/deferred-promise';
import { randomUUID } from 'node:crypto';

import { AgentDepartmentExecutionAdapter } from '@/modules/agents/agent-department-execution.adapter';
import { AgentMessageQueueConsumer } from '@/modules/agents/agent-message-queue-consumer.service';
import { AgentDepartmentStopReceiptRepository } from '@/modules/agents/repositories/agent-department-stop-receipt.repository';
import { AgentHistoryRepository } from '@/modules/agents/repositories/agent-history.repository';
import { AgentRepository } from '@/modules/agents/repositories/agent.repository';
import { registerDepartmentExecutionFixture } from '@/modules/agents/testing/agent-binding-fixture';

import { saveCredential } from '@test-integration/db/credentials';
import { createOwner } from '@test-integration/db/users';
import { initCredentialsTypes } from '@test-integration/utils';
import { LicenseMocker } from '@test-integration/license';
import { storedAgentConfig } from '@/modules/agents/__tests__/test-utils/stored-agent-config';
import { MemberService } from '../../member.service';
import { DepartmentService } from '../../department.service';
import { WorkRepository } from '../../database/repositories/work.repository';
import { WorkService } from '../../work/work.service';

const enabled = process.env.N8N_TEST_LIVE_DEPARTMENT_STOP === '1';

const modelFetchProbe = vi.hoisted(() => ({
	urlPrefix: '',
	requestStarted: undefined as (() => void) | undefined,
	responseBodyEnded: undefined as (() => void) | undefined,
	requestAborted: undefined as (() => void) | undefined,
}));

vi.mock('@/utils/ai-proxy-fetch', async (importOriginal) => {
	const original = await importOriginal<typeof import('@/utils/ai-proxy-fetch')>();
	return {
		...original,
		createAiProxyFetch: (outboundHttp: Parameters<typeof original.createAiProxyFetch>[0]) => {
			const fetch = original.createAiProxyFetch(outboundHttp);
			return async (input: RequestInfo | URL, init?: RequestInit) => {
				const isModelRequest =
					modelFetchProbe.urlPrefix.length > 0 &&
					String(input).startsWith(modelFetchProbe.urlPrefix);
				if (isModelRequest) {
					modelFetchProbe.requestStarted?.();
					init?.signal?.addEventListener('abort', () => modelFetchProbe.requestAborted?.(), {
						once: true,
					});
				}
				const response = await fetch(input, init);
				if (isModelRequest) {
					void response
						.clone()
						.arrayBuffer()
						.then(
							() => modelFetchProbe.responseBodyEnded?.(),
							() => modelFetchProbe.responseBodyEnded?.(),
						);
				}
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

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!enabled)('AI Department live Agent stop with Ollama', () => {
	let queueConsumer: AgentMessageQueueConsumer | undefined;

	beforeAll(async () => {
		if (!process.env.N8N_USER_FOLDER) {
			throw new Error('Set N8N_USER_FOLDER to the existing test-owned data folder.');
		}
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		await initCredentialsTypes();
		new LicenseMocker().mockLicenseState(Container.get(LicenseState));
		await registerDepartmentExecutionFixture();
	});

	afterAll(async () => {
		queueConsumer?.stop();
		await testDb.terminate();
	});

	it('stops a real Ollama request before its response body ends and confirms the terminal owner snapshot', async () => {
		const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
		if (!modelsResponse.ok) throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
		const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
		if (!models.data?.some((model) => model.id === ollamaModel)) {
			throw new Error(`Ollama model "${ollamaModel}" is not available.`);
		}

		const requestStarted = createDeferredPromise<void>();
		let responseBodyEnded = false;
		let requestAborted = false;
		modelFetchProbe.urlPrefix = ollamaBaseUrl;
		modelFetchProbe.requestStarted = () => requestStarted.resolve();
		modelFetchProbe.responseBodyEnded = () => {
			responseBodyEnded = true;
		};
		modelFetchProbe.requestAborted = () => {
			requestAborted = true;
		};

		const user = await createOwner();
		const project = await createTeamProject('Live Department stop test', user);
		const department = await Container.get(DepartmentService).create(project.id, user.id, {
			name: 'Live stop test',
			requestId: randomUUID(),
		});
		const member = await Container.get(MemberService).create(project.id, user.id, department.id, {
			name: 'Ollama worker',
			role: 'Research',
			requestId: randomUUID(),
		});
		const credential = await saveCredential(
			{
				name: 'Local Ollama test',
				type: 'openAiApi',
				data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
			},
			{ project, role: 'credential:owner' },
		);
		const schema: AgentJsonConfig = {
			name: 'Live stop test Agent',
			model: `openai/${ollamaModel}`,
			credential: credential.id,
			instructions: 'Complete assigned Department work. Follow Department tool results.',
			memory: { enabled: true, storage: 'n8n' },
		};
		const agents = Container.get(AgentRepository);
		const agentId = randomUUID();
		const versionId = randomUUID();
		const agent = await agents.save(
			agents.create({
				id: agentId,
				name: schema.name,
				projectId: project.id,
				schema: storedAgentConfig(schema),
				integrations: [{ type: 'n8n_chat', credentialId: '' }],
				tools: {},
				versionId,
			}),
		);
		await Container.get(AgentHistoryRepository).saveVersion({
			versionId,
			agentId: agent.id,
			schema: storedAgentConfig({
				...schema,
				integrations: [{ type: 'n8n_chat', credentialId: '' }],
			}),
			tools: {},
			publishedBy: user,
		});
		await agents.update({ id: agent.id }, { activeVersionId: versionId });
		await Container.get(MemberService).setBinding(project.id, user.id, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		queueConsumer = Container.get(AgentMessageQueueConsumer);
		queueConsumer.start();

		const workService = Container.get(WorkService);
		const item = await workService.createWork(project.id, user.id, department.id, {
			instruction:
				'Write a detailed report of at least 3000 words about research team coordination. Continue until complete.',
			assigneeMemberId: member.id,
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
		if (!started.attemptId) throw new Error('Department did not reserve an owner attempt.');

		try {
			const repository = Container.get(WorkRepository);
			const attempt = await repository.findAttempt(project.id, started.attemptId);
			if (!attempt?.ownerExecutionRef) throw new Error('Department owner reference is missing.');
			await Promise.race([
				requestStarted.promise,
				delay(90_000).then(() => {
					throw new Error('Ollama did not start a model request within 90 seconds.');
				}),
			]);
			await delay(300);
			expect(responseBodyEnded).toBe(false);

			const current = await workService.getWork(project.id, department.id, item.id);
			const requestId = randomUUID();
			await workService.cancelWork(project.id, user.id, department.id, item.id, {
				expectedVersion: current.version,
				requestId,
			});
			const adapter = Container.get(AgentDepartmentExecutionAdapter);
			const identity = {
				actorId: user.id,
				projectId: project.id,
				executorId: agent.id,
				attemptId: started.attemptId,
				ownerExecutionRef: attempt.ownerExecutionRef,
			};
			let snapshot = await adapter.snapshot(identity);
			const deadline = Date.now() + 30_000;
			while (snapshot.phase !== 'terminal' && Date.now() < deadline) {
				await adapter.reconcilePendingStops();
				await workService.reconcileAttempts();
				snapshot = await adapter.snapshot(identity);
				if (snapshot.phase !== 'terminal') await delay(100);
			}
			await adapter.reconcilePendingStops();
			await workService.reconcileAttempts();
			expect(snapshot).toMatchObject({ phase: 'terminal', result: { outcome: 'cancelled' } });
			expect(requestAborted).toBe(true);
			expect(
				await Container.get(AgentDepartmentStopReceiptRepository).findByCommandId(requestId),
			).toMatchObject({ status: 'confirmed', reason: 'cancel' });
			expect(await repository.findAttempt(project.id, started.attemptId)).toMatchObject({
				phase: 'terminal',
				outcome: 'cancelled',
			});
			expect(await workService.getWork(project.id, department.id, item.id)).toMatchObject({
				state: 'cancelled',
			});
			expect(
				await repository.findWakeLane(project.id, member.id, user.id, attempt.bindingVersion, {}),
			).toMatchObject({ activeAttemptId: null });
		} finally {
			modelFetchProbe.urlPrefix = '';
			modelFetchProbe.requestStarted = undefined;
			modelFetchProbe.responseBodyEnded = undefined;
			modelFetchProbe.requestAborted = undefined;
		}
	}, 180_000);
});
