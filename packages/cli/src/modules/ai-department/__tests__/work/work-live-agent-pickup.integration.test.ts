import type { AgentJsonConfig } from '@n8n/api-types';
import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { LicenseState } from '@n8n/backend-common';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import {
	DepartmentWorkActionsProxy,
	DepartmentWorkInboxProxy,
} from '@/modules/agents/agent-department-execution.contracts';
import { AgentExecutionRepository } from '@/modules/agents/repositories/agent-execution.repository';
import { AgentHistoryRepository } from '@/modules/agents/repositories/agent-history.repository';
import { AgentMessageQueueConsumer } from '@/modules/agents/agent-message-queue-consumer.service';
import { AgentExecutionService } from '@/modules/agents/agent-execution.service';
import { AgentRepository } from '@/modules/agents/repositories/agent.repository';
import { registerDepartmentExecutionFixture } from '@/modules/agents/testing/agent-binding-fixture';
import { storedAgentConfig } from '@/modules/agents/__tests__/test-utils/stored-agent-config';

import { saveCredential } from '@test-integration/db/credentials';
import { createOwner } from '@test-integration/db/users';
import { initCredentialsTypes } from '@test-integration/utils';
import { LicenseMocker } from '@test-integration/license';
import { MemberService } from '../../member.service';
import { DepartmentService } from '../../department.service';
import { WorkRepository } from '../../database/repositories/work.repository';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkInboxService } from '../../work/work-inbox.service';
import { WorkReleaseService } from '../../work/work-release.service';
import { WorkService } from '../../work/work.service';

const enabled = process.env.N8N_TEST_LIVE_DEPARTMENT_PICKUP === '1';
const hierarchyEnabled = process.env.N8N_TEST_LIVE_DEPARTMENT_HIERARCHY === '1';
const ollamaBaseUrl = (process.env.N8N_TEST_LIVE_OLLAMA_URL ?? 'http://127.0.0.1:1337/v1').replace(
	/\/$/,
	'',
);
const ollamaModel = process.env.N8N_TEST_LIVE_OLLAMA_MODEL ?? 'qwen2.5:3b';

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!enabled)('AI Department live Agent pickup with Ollama', () => {
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
		Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
		Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
	});

	afterAll(async () => {
		queueConsumer?.stop();
		await testDb.terminate();
	});

	it('lets a published Agent claim work, report progress, and submit an explicit result', async () => {
		const modelsResponse = await fetch(`${ollamaBaseUrl}/models`);
		if (!modelsResponse.ok) throw new Error(`Ollama model check failed: ${modelsResponse.status}`);
		const models = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
		if (!models.data?.some((model) => model.id === ollamaModel)) {
			throw new Error(`Ollama model "${ollamaModel}" is not available.`);
		}

		const user = await createOwner();
		const project = await createTeamProject('Live Department pickup test', user);
		const department = await Container.get(DepartmentService).create(project.id, user.id, {
			name: 'Live pickup test',
			requestId: randomUUID(),
		});
		const member = await Container.get(MemberService).create(project.id, user.id, department.id, {
			name: 'Ollama worker',
			role: 'Research',
			requestId: randomUUID(),
		});
		const credential = await saveCredential(
			{
				name: 'Local Ollama pickup test',
				type: 'openAiApi',
				data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
			},
			{ project, role: 'credential:owner' },
		);
		const schema: AgentJsonConfig = {
			name: 'Live pickup test Agent',
			model: `openai/${ollamaModel}`,
			credential: credential.id,
			instructions:
				'Complete assigned Department work. Call department_work with action inspect, then call claim_department_work with no input. Use department_work for progress and blockers. Use submit_department_work with a structured report and no version to finish the task. Wait for each tool result before the next call. A chat reply does not submit a result.',
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
			instruction: 'Write two short bullets about safe queue coordination.',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await workService.markReady(project.id, user.id, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		const assignedWorkVersion = ready.version + 2;
		const prepared = await workService.updateWork(project.id, user.id, department.id, item.id, {
			expectedVersion: ready.version,
			instruction: `Write two short bullets about safe queue coordination. Use department_work once per turn. Call {"action":"inspect"} first. Confirm its work.version is ${assignedWorkVersion}. Then call {"action":"claim","expectedVersion":${assignedWorkVersion}}. Then call {"action":"progress","expectedVersion":${assignedWorkVersion + 1},"body":"Prepared safe queue coordination guidance."}. Then call {"action":"submit","expectedVersion":${assignedWorkVersion + 2},"report":{"result":"Use a single queue owner and idempotency keys to prevent duplicate work. Record each claim and completion so retries remain safe.","completedWork":["Prepared guidance on queue ownership and idempotency."],"checkedEvidence":[],"openIssues":[],"nextSteps":[]}}. Send each JSON action exactly as shown, with expectedVersion as a number. Wait for each tool result before the next call. Do not add fields or use a chat reply as the result.`,
			requestId: randomUUID(),
		});
		const started = await workService.startWork(project.id, user.id, department.id, item.id, {
			expectedVersion: prepared.version,
			requestId: randomUUID(),
		});
		if (!started.attemptId) throw new Error('Department did not reserve an owner attempt.');

		const repository = Container.get(WorkRepository);
		const attempt = await repository.findAttempt(project.id, started.attemptId);
		if (!attempt?.ownerExecutionRef) throw new Error('Department owner reference is missing.');
		const executionRepository = Container.get(AgentExecutionRepository);
		const deadline = Date.now() + 180_000;
		let execution = await executionRepository.findByInputMessageId(attempt.ownerExecutionRef);
		let current = await workService.getWork(project.id, department.id, item.id);
		while (
			Date.now() < deadline &&
			(execution?.status === 'running' || current.state !== 'review')
		) {
			await delay(500);
			execution = await executionRepository.findByInputMessageId(attempt.ownerExecutionRef);
			current = await workService.getWork(project.id, department.id, item.id);
		}
		if (execution?.status === 'running' || current.state !== 'review') {
			if (execution?.status === 'running') {
				const executionService = Container.get(AgentExecutionService);
				if (executionService.stopExecution(execution.id)) {
					const stopDeadline = Date.now() + 30_000;
					while (Date.now() < stopDeadline) {
						execution = await executionRepository.findByInputMessageId(attempt.ownerExecutionRef);
						if (execution?.status !== 'running') break;
						await delay(100);
					}
					await workService.reconcileAttempts();
				}
			}
			await workService.reconcileAttempts();
			const toolCalls =
				execution?.timeline
					?.flatMap((event) =>
						event.type === 'tool-call'
							? [
									{
										name: event.name,
										success: event.success,
										input: (JSON.stringify(event.input) ?? 'undefined').slice(0, 500),
										output: (JSON.stringify(event.output) ?? 'undefined').slice(0, 500),
									},
								]
							: [],
					)
					.slice(-12) ?? [];
			throw new Error(
				`Agent did not complete the work actions before timeout (execution=${execution?.status ?? 'missing'}, work=${current.state}, toolCalls=${JSON.stringify(toolCalls)}).`,
			);
		}

		await workService.reconcileAttempts();
		execution = await executionRepository.findByInputMessageId(attempt.ownerExecutionRef);
		current = await workService.getWork(project.id, department.id, item.id);
		const activities = (await workService.listActivity(project.id, department.id, item.id, 100, 0))
			.data;
		const finalAttempt = await repository.findAttempt(project.id, started.attemptId);
		expect(execution?.status).toBe('success');
		expect(current.state).toBe('review');
		expect(current.state).not.toBe('done');
		expect(finalAttempt?.phase).toBe('terminal');
		expect(finalAttempt?.outcome).toBe('succeeded');
		expect(finalAttempt?.submittedResultId).toBeTruthy();
		expect(activities).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ actorId: member.id, actorKind: 'agent', kind: 'claim' }),
				expect.objectContaining({ actorId: member.id, actorKind: 'agent', kind: 'progress' }),
				expect.objectContaining({ actorId: member.id, actorKind: 'agent', kind: 'submit' }),
			]),
		);
	}, 240_000);

	it.skipIf(!hierarchyEnabled)(
		'wakes a manager and CEO after live staff reports pass business review',
		async () => {
			const user = await createOwner();
			const project = await createTeamProject('Live Department campaign test', user);
			const department = await Container.get(DepartmentService).create(project.id, user.id, {
				name: 'Live campaign test',
				requestId: randomUUID(),
			});
			const members = Container.get(MemberService);
			const ceo = await members.create(project.id, user.id, department.id, {
				name: 'Campaign coordinator',
				role: 'Coordinator',
				requestId: randomUUID(),
			});
			const manager = await members.create(project.id, user.id, department.id, {
				name: 'Campaign manager',
				role: 'Marketing manager',
				managerMemberId: ceo.id,
				requestId: randomUUID(),
			});
			const staff = await members.create(project.id, user.id, department.id, {
				name: 'Campaign staff',
				role: 'Marketing researcher',
				managerMemberId: manager.id,
				requestId: randomUUID(),
			});
			const credential = await saveCredential(
				{
					name: 'Local Ollama campaign test',
					type: 'openAiApi',
					data: { apiKey: 'local-ollama', url: ollamaBaseUrl },
				},
				{ project, role: 'credential:owner' },
			);
			const agents = Container.get(AgentRepository);
			const createBoundAgent = async (name: string, instructions: string, member: typeof ceo) => {
				const schema: AgentJsonConfig = {
					name,
					model: `openai/${ollamaModel}`,
					credential: credential.id,
					instructions,
					memory: { enabled: true, storage: 'n8n' },
				};
				const versionId = randomUUID();
				const agent = await agents.save(
					agents.create({
						id: randomUUID(),
						name,
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
				await members.setBinding(project.id, user.id, department.id, member.id, {
					provider: 'n8n-agent',
					executorId: agent.id,
					expectedVersion: member.version,
					requestId: randomUUID(),
				});
				return agent.id;
			};
			await createBoundAgent(
				'Live campaign coordinator',
				'You are the campaign coordinator. Use department_work to inspect, then call claim_department_work with no input. If inspect shows no childReports entry with state done and the task names a manager, you MUST call delegate_department_work with the exact manager member ID, exact nonempty title, and child instruction in the task. Do not send a work version. Never use delegate_subagent. Delegation suspends the parent automatically, so stop after delegation. If inspect shows a childReports entry with state done, do not delegate again; use its report and submit it with submit_department_work. Never report success without the required child report. Submit report fields result, completedWork, checkedEvidence, openIssues, and nextSteps. Use arrays for all list fields. Leave checkedEvidence empty unless you cite work:<work.id> or attempt:<claim.attemptId>.',
				ceo,
			);
			await createBoundAgent(
				'Live campaign manager',
				'You are the marketing manager. Use department_work to inspect, then call claim_department_work with no input. If inspect shows no childReports entry with state done and the task names a staff member, you MUST call delegate_department_work with the exact staff member ID, title, and instruction in the task. Do not send a work version. Never use delegate_subagent. Delegation suspends the parent automatically, so stop after delegation. If inspect shows a childReports entry with state done, do not delegate again; use its report and submit it with submit_department_work. Never report success without the required child report. Submit report fields result, completedWork, checkedEvidence, openIssues, and nextSteps. Use arrays for all list fields. Leave checkedEvidence empty unless you cite work:<work.id> or attempt:<claim.attemptId>.',
				manager,
			);
			await createBoundAgent(
				'Live campaign researcher',
				'You are the marketing researcher. Use department_work to inspect, then call claim_department_work with no input. Complete the assigned task, then call submit_department_work with a structured report containing result, completedWork, checkedEvidence, openIssues, and nextSteps. Send no work version. Use arrays for all list fields. Leave checkedEvidence empty unless you cite work:<work.id> or attempt:<claim.attemptId>.',
				staff,
			);

			queueConsumer ??= Container.get(AgentMessageQueueConsumer);
			queueConsumer.start();
			const work = Container.get(WorkService);
			const reconcileBackgroundWork = async () => {
				await Container.get(WorkReleaseService).reconcilePending();
				await work.reconcileAttempts();
			};
			const root = await work.createWork(project.id, user.id, department.id, {
				instruction: 'Plan a marketing campaign for a local cafe.',
				assigneeMemberId: ceo.id,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: randomUUID(),
			});
			const ready = await work.markReady(project.id, user.id, department.id, root.id, {
				expectedVersion: root.version,
				requestId: randomUUID(),
			});
			const managerInstruction = `Delegate one social post with title "Cafe social post" to direct report member ${staff.id} and instruction "Draft one cafe social post." Then report the competitor research and post after the staff report is accepted.`;
			const firstRootInstruction = `Coordinate the cafe campaign. You must delegate competitor research with title "Cafe competitor research" to manager member ${manager.id}. Copy this exact child instruction into the delegation: "${managerInstruction}". Do not submit until the manager report is accepted and inspect shows its child report.`;
			const prepared = await work.updateWork(project.id, user.id, department.id, root.id, {
				expectedVersion: ready.version,
				instruction: firstRootInstruction,
				requestId: randomUUID(),
			});
			const started = await work.startWork(project.id, user.id, department.id, root.id, {
				expectedVersion: prepared.version,
				requestId: randomUUID(),
			});
			if (!started.attemptId) throw new Error('CEO campaign attempt was not created.');

			const findAssignedWork = async (
				memberId: string,
				excludeId?: string,
				parentWorkId?: string,
			) => {
				const deadline = Date.now() + 360_000;
				while (Date.now() < deadline) {
					await reconcileBackgroundWork();
					const listed = await work.listWork(project.id, department.id, {
						take: 100,
						skip: 0,
						assigneeMemberId: memberId,
					});
					const found = listed.data.find((item) => item.id !== excludeId);
					if (found) return found;
					const rootState = await work.getWork(project.id, department.id, root.id);
					if (['review', 'done'].includes(rootState.state) && rootState.childReports.length === 0) {
						throw new Error(
							`Campaign coordinator submitted without delegating to member ${memberId}; root=${JSON.stringify(rootState)}.`,
						);
					}
					const coordinationParent = parentWorkId
						? await work.getWork(project.id, department.id, parentWorkId)
						: rootState;
					if (coordinationParent.currentAttemptId && coordinationParent.childReports.length === 0) {
						const attempt = await Container.get(WorkRepository).findAttempt(
							project.id,
							coordinationParent.currentAttemptId,
						);
						if (attempt?.phase === 'terminal')
							throw new Error(
								`Campaign owner attempt ${attempt.id} finished without delegating to member ${memberId}; outcome=${attempt.outcome}; parent=${JSON.stringify(coordinationParent)}.`,
							);
					}
					await delay(300);
				}
				const rootAttempt = await Container.get(WorkRepository).findAttempt(
					project.id,
					started.attemptId!,
				);
				const execution = rootAttempt?.ownerExecutionRef
					? await Container.get(AgentExecutionRepository).findByInputMessageId(
							rootAttempt.ownerExecutionRef,
						)
					: null;
				const calls =
					execution?.timeline
						?.flatMap((event) =>
							event.type === 'tool-call'
								? [
										{
											name: event.name,
											success: event.success,
											input: (JSON.stringify(event.input) ?? 'undefined').slice(0, 400),
											output: (JSON.stringify(event.output) ?? 'undefined').slice(0, 500),
										},
									]
								: [],
						)
						.slice(-10) ?? [];
				const parent = parentWorkId
					? await work.getWork(project.id, department.id, parentWorkId)
					: null;
				const parentAttempt = parent?.currentAttemptId
					? await Container.get(WorkRepository).findAttempt(project.id, parent.currentAttemptId)
					: null;
				const parentExecution = parentAttempt?.ownerExecutionRef
					? await Container.get(AgentExecutionRepository).findByInputMessageId(
							parentAttempt.ownerExecutionRef,
						)
					: null;
				const parentCalls =
					parentExecution?.timeline
						?.flatMap((event) =>
							event.type === 'tool-call'
								? [
										{
											name: event.name,
											success: event.success,
											input: (JSON.stringify(event.input) ?? 'undefined').slice(0, 400),
											output: (JSON.stringify(event.output) ?? 'undefined').slice(0, 500),
										},
									]
								: [],
						)
						.slice(-10) ?? [];
				throw new Error(
					`No delegated campaign work appeared for member ${memberId}; root=${JSON.stringify(await work.getWork(project.id, department.id, root.id))}; owner=${execution?.status ?? 'missing'}; toolCalls=${JSON.stringify(calls)}; parent=${JSON.stringify(parent)}; parentOwner=${parentExecution?.status ?? 'missing'}; parentToolCalls=${JSON.stringify(parentCalls)}.`,
				);
			};
			const waitForReview = async (workId: string) => {
				const deadline = Date.now() + 360_000;
				let current = await work.getWork(project.id, department.id, workId);
				while (Date.now() < deadline && current.state !== 'review') {
					await reconcileBackgroundWork();
					await delay(500);
					current = await work.getWork(project.id, department.id, workId);
					if (current.state === 'review' || !current.currentAttemptId) continue;
					const attempt = await Container.get(WorkRepository).findAttempt(
						project.id,
						current.currentAttemptId,
					);
					if (attempt?.phase === 'terminal') break;
				}
				if (current.state !== 'review') {
					const attempt = current.currentAttemptId
						? await Container.get(WorkRepository).findAttempt(project.id, current.currentAttemptId)
						: null;
					const execution = attempt?.ownerExecutionRef
						? await Container.get(AgentExecutionRepository).findByInputMessageId(
								attempt.ownerExecutionRef,
							)
						: null;
					const calls =
						execution?.timeline
							?.flatMap((event) =>
								event.type === 'tool-call'
									? [
											{
												name: event.name,
												success: event.success,
												input: (JSON.stringify(event.input) ?? 'undefined').slice(0, 400),
												output: (JSON.stringify(event.output) ?? 'undefined').slice(0, 500),
											},
										]
									: [],
							)
							.slice(-10) ?? [];
					throw new Error(
						`Campaign work ${workId} did not reach review; got ${current.state}; execution=${execution?.status ?? 'missing'}; instruction=${current.instruction}; toolCalls=${JSON.stringify(calls)}.`,
					);
				}
				return current;
			};
			const acceptReview = async (workId: string) => {
				let current = await work.getWork(project.id, department.id, workId);
				let attempt = current.currentAttemptId
					? await Container.get(WorkRepository).findAttempt(project.id, current.currentAttemptId)
					: null;
				const deadline = Date.now() + 30_000;
				while (
					Date.now() < deadline &&
					(!attempt || attempt.phase !== 'terminal' || attempt.outcome !== 'succeeded')
				) {
					await reconcileBackgroundWork();
					await delay(250);
					current = await work.getWork(project.id, department.id, workId);
					attempt = current.currentAttemptId
						? await Container.get(WorkRepository).findAttempt(project.id, current.currentAttemptId)
						: null;
				}
				if (attempt?.phase !== 'terminal' || attempt.outcome !== 'succeeded')
					throw new Error(
						`Campaign work ${workId} did not finish successfully before review; attempt=${JSON.stringify(attempt)}.`,
					);
				if (!attempt?.submittedResultId || !attempt.reviewRoundId)
					throw new Error(`Campaign work ${workId} has no review result.`);
				await work.reviewWork(project.id, user.id, department.id, workId, {
					expectedVersion: current.version,
					attemptId: attempt.id,
					resultId: attempt.submittedResultId,
					reviewRoundId: attempt.reviewRoundId,
					stageId: current.reviewStages[current.currentReviewStageIndex]?.id ?? '',
					expectedReviewVersion: 1,
					decision: 'accept',
					requestId: randomUUID(),
				});
			};

			const managerWork = await findAssignedWork(manager.id, root.id);
			const staffWork = await findAssignedWork(staff.id, undefined, managerWork.id);

			const staffReview = await waitForReview(staffWork.id);
			expect((await work.getWork(project.id, department.id, managerWork.id)).state).toBe('blocked');
			expect((await work.getWork(project.id, department.id, root.id)).state).toBe('blocked');
			await acceptReview(staffReview.id);
			const managerReview = await waitForReview(managerWork.id);
			expect((await work.getWork(project.id, department.id, managerWork.id)).childReports).toEqual([
				expect.objectContaining({
					workId: staffWork.id,
					state: 'done',
					report: expect.any(Object),
				}),
			]);
			await acceptReview(managerReview.id);
			const rootReview = await waitForReview(root.id);
			expect((await work.getWork(project.id, department.id, root.id)).childReports).toEqual([
				expect.objectContaining({
					workId: managerWork.id,
					state: 'done',
					report: expect.any(Object),
				}),
			]);
			await acceptReview(rootReview.id);
			expect(
				await Container.get(WorkRepository).listAttempts(project.id, managerWork.id),
			).toHaveLength(2);
			expect(await Container.get(WorkRepository).listAttempts(project.id, root.id)).toHaveLength(2);
		},
		1_200_000,
	);
});
