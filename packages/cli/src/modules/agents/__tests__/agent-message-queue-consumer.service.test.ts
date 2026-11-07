import { mockLogger } from '@n8n/backend-test-utils';
import type { AgentIntegrationConfig } from '@n8n/api-types';
import type { User, UserRepository } from '@n8n/db';
import { createDeferredPromise } from '@n8n/utils/promise/deferred-promise';
import { createHash } from 'node:crypto';
import { mock } from 'vitest-mock-extended';

import type { CredentialsService } from '@/credentials/credentials.service';
import { userHasScopes } from '@/permissions.ee/check-access';

import type { AgentChatExecutionService } from '../agent-chat-execution.service';
import type { AgentExecutionOrchestratorService } from '../agent-execution-orchestrator.service';
import type { AgentExecutionService } from '../agent-execution.service';
import { AgentMessageQueueConsumer } from '../agent-message-queue-consumer.service';
import { AgentN8nChatUnavailableError } from '../agent-n8n-chat-unavailable.error';
import type { AgentMessageQueueService, ClaimedAgentMessage } from '../agent-message-queue.service';
import type { AgentQueuedTestStreamService } from '../agent-queued-test-stream.service';
import type { AgentTestRunService } from '../agent-test-run.service';
import type { AgentExecutionThread } from '../entities/agent-execution-thread.entity';
import type { AgentMessageQueue } from '../entities/agent-message-queue.entity';
import type { AgentMessageEntity } from '../entities/agent-message.entity';
import type { AgentChatBridge } from '../integrations/agent-chat-bridge';
import type { ChatIntegrationService } from '../integrations/chat-integration.service';
import type { AgentMessageQueueRepository } from '../repositories/agent-message-queue.repository';
import type { AgentDepartmentMeetingInvocationRepository } from '../repositories/agent-department-meeting-invocation.repository';
import type { AgentDepartmentConsultationInvocationRepository } from '../repositories/agent-department-consultation-invocation.repository';
import type { DepartmentConsultationBindingVerifierProxy } from '../agent-department-consultation.contracts';
import type { SystemAgentExecutionService } from '../system-agents/system-agent-execution.service';
import { SystemAgentRegistry } from '../system-agents/system-agent-registry';
import type { SystemAgentProvider } from '../system-agents/system-agent.types';
import type { AgentQueueDispatch, QueuedIntegrationMessage } from '../types/agent-queued-message';
import {
	hashDepartmentMeetingInvocationRequest,
	type DepartmentMeetingInvocationRequest,
} from '../agent-department-meeting-invocation.contracts';
import {
	hashDepartmentConsultationRequest,
	type DepartmentConsultationInvocationRequest,
} from '../agent-department-consultation.contracts';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

describe('AgentMessageQueueConsumer', () => {
	const queue = mock<AgentMessageQueueService>();
	const repository = mock<AgentMessageQueueRepository>();
	const executions = mock<AgentExecutionService>();
	const streams = mock<AgentQueuedTestStreamService>();
	const testRuns = mock<AgentTestRunService>();
	const users = mock<UserRepository>();
	const chatExecutions = mock<AgentChatExecutionService>();
	const integrations = mock<ChatIntegrationService>();
	const orchestrator = mock<AgentExecutionOrchestratorService>();
	const sender = { send: vi.fn(), close: vi.fn(async () => {}) };
	const systemAgentExecution = mock<SystemAgentExecutionService>();
	const meetingInvocations = mock<AgentDepartmentMeetingInvocationRepository>();
	const consultationInvocations = mock<AgentDepartmentConsultationInvocationRepository>();
	const consultationBindings = mock<DepartmentConsultationBindingVerifierProxy>();
	let systemAgents: SystemAgentRegistry;
	let consumer: AgentMessageQueueConsumer;

	function claim(threadId: string, integration = false): ClaimedAgentMessage {
		const payload: ClaimedAgentMessage['payload'] = integration
			? mock<QueuedIntegrationMessage>({
					kind: 'integration',
					message: 'input',
					credentialId: 'credential',
					platformThreadId: 'slack:channel:thread',
					messageContext: {
						platform: 'slack',
						integrationConnectionId: 'slack:credential',
						target: { type: 'thread', threadId: 'slack:channel:thread' },
						updatedAt: '2026-06-01T12:00:00.000Z',
					},
				})
			: { kind: 'preview', message: 'input', resourceId: 'draft-chat:user' };
		return {
			payload,
			item: mock<AgentMessageQueue>({
				id: threadId,
				threadId,
				message: mock<AgentMessageEntity>({ origin: { source: integration ? 'slack' : 'chat' } }),
				payload: integration
					? mock<AgentQueueDispatch>({ kind: 'integration', credentialId: 'credential' })
					: { kind: 'preview' },
			}),
			thread: mock<AgentExecutionThread>({
				id: threadId,
				agentId: 'agent',
				projectId: 'project',
				ownerId: integration ? null : 'user',
			}),
			admission: {
				executionId: `execution-${threadId}`,
				startedAt: new Date(),
				inputMessageIds: ['message-1'],
			},
			recording: {
				threadId,
				resourceId: 'draft-chat:user',
				agentId: 'agent',
				agentName: 'Agent',
				projectId: 'project',
				userMessage: 'input',
				source: integration ? 'slack' : 'chat',
				access: { accessScope: 'user', ownerId: 'user' },
			},
		};
	}

	function meetingClaim() {
		const identity = {
			schemaVersion: 1 as const,
			projectId: 'project',
			departmentId: 'department',
			meetingId: 'meeting',
			participantId: 'participant',
			invocationId: 'invocation',
			round: 'contribution' as const,
			actorId: 'user',
			memberId: 'member',
			executorId: 'agent',
			bindingVersion: 1,
			requestKey: 'request-key',
			contextRef: 'context',
			inputText: 'Provide a structured contribution.',
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			toolPolicy: { mode: 'supplied-material-only' as const },
			deadlineAt: new Date(Date.now() + 60_000).toISOString(),
		};
		const request: DepartmentMeetingInvocationRequest = {
			...identity,
			expectedInputHash: hashDepartmentMeetingInvocationRequest(identity),
		};
		const item = {
			...claim('meeting-thread'),
			payload: { kind: 'n8n_chat', message: 'input', departmentMeetingInvocation: request },
		} as ClaimedAgentMessage;
		item.item.message.origin = { source: 'ai-department-meeting' };
		return { item, request };
	}

	function queueMeetingClaim(item: ClaimedAgentMessage) {
		repository.findThreadIds.mockResolvedValue(['meeting-thread']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		meetingInvocations.findByInvocationId.mockResolvedValue({
			threadId: 'meeting-thread',
			inputHash:
				item.payload.kind === 'n8n_chat'
					? item.payload.departmentMeetingInvocation?.expectedInputHash
					: undefined,
			requestKey:
				item.payload.kind === 'n8n_chat'
					? item.payload.departmentMeetingInvocation?.requestKey
					: undefined,
			inputText:
				item.payload.kind === 'n8n_chat'
					? item.payload.departmentMeetingInvocation?.inputText
					: undefined,
		} as never);
		meetingInvocations.isCancelled.mockResolvedValue(false);
		meetingInvocations.markRunning.mockResolvedValue({ affected: 1 } as never);
	}

	function consultationClaim() {
		const identity = {
			schemaVersion: 1 as const,
			projectId: 'project',
			departmentId: 'department',
			helpRequestId: 'help-request',
			invocationId: 'help-request',
			sourceAttemptId: 'attempt',
			requesterMemberId: 'requester',
			recipientMemberId: 'recipient',
			actorId: 'user',
			executorId: 'agent',
			bindingVersion: 3,
			commandKey: 'help-request',
			contextRef: 'help-request:2',
			contextHash: 'context-hash',
			deadlineAt: new Date(Date.now() + 60_000).toISOString(),
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			toolPolicy: { mode: 'none' as const, policyVersion: 'department-consultation-v1' },
		};
		const request: DepartmentConsultationInvocationRequest = {
			...identity,
			expectedInputHash: hashDepartmentConsultationRequest(identity),
			inputText: 'Answer this help question with the supplied material.',
		};
		const item = {
			...claim('consultation-thread'),
			payload: {
				kind: 'n8n_chat',
				message: request.inputText,
				departmentConsultationInvocation: request,
			},
		} as ClaimedAgentMessage;
		item.item.message.origin = { source: 'ai-department-consultation', hidden: true };
		return { item, request };
	}

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(userHasScopes).mockResolvedValue(true);
		systemAgents = new SystemAgentRegistry();
		users.findByIdWithRole.mockResolvedValue(mock<User>({ id: 'user', disabled: false }));
		repository.findThreadIds.mockResolvedValue([]);
		executions.getAbortSignal.mockImplementation(() => new AbortController().signal);
		streams.createSender.mockReturnValue(sender);
		chatExecutions.withTurnLock.mockImplementation(
			async (_threadId, action) => await action(new AbortController().signal),
		);
		chatExecutions.settle.mockImplementation(async (_id, finalize) => await finalize());
		testRuns.prepareDraftRun.mockResolvedValue({
			status: 'ready',
			sessionId: 'session',
			sessionMode: 'existing',
		});
		testRuns.executePreparedDraftRun.mockResolvedValue({
			status: 'completed',
			response: '',
			executionId: 'execution-session',
		});
		consumer = new AgentMessageQueueConsumer(
			queue,
			repository,
			executions,
			streams,
			testRuns,
			users,
			mock<CredentialsService>(),
			chatExecutions,
			integrations,
			orchestrator,
			mockLogger(),
			systemAgents,
			systemAgentExecution,
			meetingInvocations,
			consultationInvocations,
			consultationBindings,
		);
	});

	it('runs a bounded consultation and stores only its successful answer', async () => {
		const { item, request } = consultationClaim();
		repository.findThreadIds.mockResolvedValue(['consultation-thread']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		consultationInvocations.findByInvocationId.mockResolvedValue({
			threadId: 'consultation-thread',
			helpRequestId: request.helpRequestId,
			inputHash: request.expectedInputHash,
			commandKey: request.commandKey,
			contextHash: request.contextHash,
			inputText: request.inputText,
		} as never);
		consultationInvocations.isCancelled.mockResolvedValue(false);
		consultationInvocations.markRunning.mockResolvedValue({ affected: 1 } as never);
		consultationBindings.isCurrentBinding.mockResolvedValue(true);
		orchestrator.executeForDepartmentConsultation.mockImplementation(async function* () {
			yield { type: 'text-delta', delta: 'Use the last successful run as evidence.' } as never;
			yield { type: 'finish', finishReason: 'stop' } as never;
		});
		consumer.start();

		await vi.waitFor(() =>
			expect(consultationInvocations.markTerminal).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: 'project',
					invocationId: 'help-request',
					outcome: 'succeeded',
					resultText: 'Use the last successful run as evidence.',
				}),
			),
		);
		expect(orchestrator.executeForDepartmentConsultation).toHaveBeenCalledWith(
			expect.objectContaining({ inputText: request.inputText, maxOutputTokens: 1_000 }),
		);
		expect(consultationBindings.isCurrentBinding).toHaveBeenCalledWith({
			projectId: 'project',
			departmentId: 'department',
			memberId: 'recipient',
			executorId: 'agent',
			bindingVersion: 3,
		});
		consumer.stop();
	});

	it('discards a cancelled meeting queue item before model execution', async () => {
		const { item, request } = meetingClaim();
		item.thread.agentId = 'agent';
		queueMeetingClaim(item);
		meetingInvocations.findByInvocationId.mockResolvedValue({
			threadId: 'meeting-thread',
			inputHash: request.expectedInputHash,
			requestKey: request.requestKey,
			inputText: request.inputText,
		} as never);
		meetingInvocations.isCancelled.mockResolvedValue(true);
		consumer.start();

		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('meeting-thread', 'execution-meeting-thread'),
		);

		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'cancelled',
			safeErrorCode: 'cancelled_before_execution',
		});
		expect(meetingInvocations.markRunning).not.toHaveBeenCalled();
		expect(orchestrator.executeForDepartmentMeeting).not.toHaveBeenCalled();
	});

	it('does not start a meeting when cancellation wins the start transition', async () => {
		const { item } = meetingClaim();
		queueMeetingClaim(item);
		meetingInvocations.markRunning.mockResolvedValue({ affected: 0 } as never);
		consumer.start();

		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('meeting-thread', 'execution-meeting-thread'),
		);

		expect(meetingInvocations.isCancelled).toHaveBeenCalledOnce();
		expect(meetingInvocations.markRunning).toHaveBeenCalledWith('project', 'invocation');
		expect(orchestrator.executeForDepartmentMeeting).not.toHaveBeenCalled();
		expect(meetingInvocations.markTerminal).not.toHaveBeenCalled();
		expect(queue.recordFailure).toHaveBeenCalledOnce();
	});

	it('rejects a meeting invocation when the thread owner differs from its actor', async () => {
		const { item } = meetingClaim();
		item.thread.ownerId = 'another-user';
		queueMeetingClaim(item);
		consumer.start();

		await vi.waitFor(() => expect(queue.recordFailure).toHaveBeenCalledOnce());

		expect(orchestrator.executeForDepartmentMeeting).not.toHaveBeenCalled();
		expect(meetingInvocations.markRunning).not.toHaveBeenCalled();
	});

	it('runs one bounded meeting turn and stores only the capped output', async () => {
		const { item } = meetingClaim();
		queueMeetingClaim(item);
		orchestrator.executeForDepartmentMeeting.mockImplementation(async function* () {
			yield { type: 'text-delta', id: 'text', delta: '😀'.repeat(4_100) };
			yield { type: 'finish', finishReason: 'stop' };
		});
		consumer.start();

		await vi.waitFor(() => expect(meetingInvocations.markTerminal).toHaveBeenCalledOnce());

		const resultText = '😀'.repeat(4_000);
		expect(orchestrator.executeForDepartmentMeeting).toHaveBeenCalledOnce();
		expect(orchestrator.executeForDepartmentMeeting).toHaveBeenCalledWith(
			expect.objectContaining({ maxOutputTokens: 1_000 }),
		);
		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'succeeded',
			resultText,
			resultHash: createHash('sha256').update(resultText).digest('hex'),
		});
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('stores a safe failure code when the provider stream throws', async () => {
		const { item } = meetingClaim();
		queueMeetingClaim(item);
		orchestrator.executeForDepartmentMeeting.mockImplementation(async function* () {
			throw new Error('private provider response details');
		});
		consumer.start();

		await vi.waitFor(() => expect(meetingInvocations.markTerminal).toHaveBeenCalledOnce());

		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'failed',
			safeErrorCode: 'model_failure',
		});
		expect(meetingInvocations.markTerminal).not.toHaveBeenCalledWith(
			expect.objectContaining({ resultText: expect.stringContaining('private provider') }),
		);
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('records a quota response once without retrying or exposing provider details', async () => {
		const { item } = meetingClaim();
		queueMeetingClaim(item);
		const quotaError = Object.assign(new Error('HTTP 429: private quota details'), { status: 429 });
		orchestrator.executeForDepartmentMeeting.mockImplementation(async function* () {
			throw quotaError;
		});
		consumer.start();

		await vi.waitFor(() => expect(meetingInvocations.markTerminal).toHaveBeenCalledOnce());

		expect(orchestrator.executeForDepartmentMeeting).toHaveBeenCalledOnce();
		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'failed',
			safeErrorCode: 'model_failure',
		});
		expect(meetingInvocations.markTerminal).not.toHaveBeenCalledWith(
			expect.objectContaining({ resultText: expect.stringContaining('private quota details') }),
		);
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('aborts a meeting turn when its deadline expires', async () => {
		const { item, request } = meetingClaim();
		request.deadlineAt = new Date(Date.now() + 25).toISOString();
		const { expectedInputHash: _oldHash, ...requestIdentity } = request;
		request.expectedInputHash = hashDepartmentMeetingInvocationRequest(requestIdentity);
		queueMeetingClaim(item);
		orchestrator.executeForDepartmentMeeting.mockImplementation(async function* ({ abortSignal }) {
			await new Promise<void>((resolve) => {
				abortSignal.addEventListener('abort', () => resolve(), { once: true });
			});
			yield { type: 'finish', finishReason: 'stop' };
		});
		consumer.start();

		await vi.waitFor(() => expect(meetingInvocations.markTerminal).toHaveBeenCalledOnce());

		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'cancelled',
			safeErrorCode: 'deadline',
		});
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('records cancellation when the model stream ends with a cancelled finish reason', async () => {
		const { item } = meetingClaim();
		queueMeetingClaim(item);
		orchestrator.executeForDepartmentMeeting.mockImplementation(async function* () {
			yield { type: 'finish', finishReason: 'cancelled' };
		});
		consumer.start();

		await vi.waitFor(() => expect(meetingInvocations.markTerminal).toHaveBeenCalledOnce());

		expect(meetingInvocations.markTerminal).toHaveBeenCalledWith({
			projectId: 'project',
			invocationId: 'invocation',
			outcome: 'cancelled',
			safeErrorCode: 'cancelled',
		});
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	afterEach(() => consumer.stop());

	it('registers the claimed execution under the lock and releases it before preparation', async () => {
		const item = claim('session');
		let locked = false;
		chatExecutions.withTurnLock.mockImplementation(async (_threadId, action) => {
			locked = true;
			try {
				return await action(new AbortController().signal);
			} finally {
				locked = false;
			}
		});
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext
			.mockImplementationOnce(async () => {
				expect(locked).toBe(true);
				return item;
			})
			.mockResolvedValue(null);
		chatExecutions.register.mockImplementation(() => {
			expect(locked).toBe(true);
			expect(users.findByIdWithRole).not.toHaveBeenCalled();
		});
		users.findByIdWithRole.mockImplementation(async () => {
			expect(locked).toBe(false);
			return mock<User>({ id: 'user', disabled: false });
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(chatExecutions.register).toHaveBeenCalledOnce();
		expect(testRuns.executePreparedDraftRun).toHaveBeenCalledOnce();
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('accepts Stop while the thread owner is loading', async () => {
		const item = claim('session');
		const owner = createDeferredPromise<User>();
		users.findByIdWithRole.mockReturnValue(owner.promise);
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		consumer.start();
		try {
			await vi.waitFor(() => expect(users.findByIdWithRole).toHaveBeenCalledOnce());
			const controller = chatExecutions.register.mock.calls[0][1];
			controller.abort(new DOMException('Response stopped', 'AbortError'));
		} finally {
			owner.resolve(mock<User>({ id: 'user', disabled: false }));
		}
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(testRuns.prepareDraftRun).not.toHaveBeenCalled();
		expect(testRuns.executePreparedDraftRun).not.toHaveBeenCalled();
		expect(queue.recordFailure).toHaveBeenCalledWith(
			item,
			expect.objectContaining({ name: 'AbortError' }),
			expect.objectContaining({ aborted: true }),
		);
		expect(sender.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
	});

	it('finalizes a claimed execution when the startup lock is lost', async () => {
		const item = claim('session');
		const lease = new AbortController();
		chatExecutions.withTurnLock.mockImplementation(
			async (_threadId, action) => await action(lease.signal),
		);
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext
			.mockImplementationOnce(async () => {
				lease.abort();
				return item;
			})
			.mockResolvedValue(null);
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(chatExecutions.register).not.toHaveBeenCalled();
		expect(testRuns.executePreparedDraftRun).not.toHaveBeenCalled();
		expect(queue.recordFailure).toHaveBeenCalledWith(
			item,
			expect.objectContaining({ message: 'Agent execution startup lock was lost' }),
			undefined,
		);
		expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
	});

	it('keeps ownership loss separate from a user Stop', async () => {
		const item = claim('session');
		const lease = new AbortController();
		const failure = new DOMException('Execution ownership lost', 'AbortError');
		executions.getAbortSignal.mockReturnValue(lease.signal);
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		testRuns.executePreparedDraftRun.mockImplementation(async () => {
			lease.abort(failure);
			throw failure;
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		const userSignal = chatExecutions.register.mock.calls[0][1].signal;
		expect(userSignal.aborted).toBe(false);
		expect(queue.recordFailure).toHaveBeenCalledWith(item, failure, undefined);
		expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
	});
	it('runs independent sessions without waiting and reuses each claimed execution', async () => {
		const first = claim('first');
		first.payload.message = 'edited first message';
		first.recording.userMessage = first.payload.message;
		const second = claim('second');
		const waiting = createDeferredPromise();
		repository.findThreadIds.mockResolvedValue(['first', 'second']);
		queue.claimNext
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(second)
			.mockResolvedValue(null);
		testRuns.executePreparedDraftRun.mockImplementation(async (input) => {
			if (input.sessionId === 'first') await waiting.promise;
			return {
				status: 'completed',
				response: '',
				executionId: input.admittedExecution!.executionId,
			};
		});
		consumer.start();
		try {
			await vi.waitFor(() =>
				expect(queue.settle).toHaveBeenCalledWith('second', second.admission.executionId),
			);
			expect(queue.settle).not.toHaveBeenCalledWith('first', first.admission.executionId);
			expect(users.findByIdWithRole).toHaveBeenCalledWith(first.thread.ownerId);
			expect(chatExecutions.register).toHaveBeenCalledWith(
				expect.objectContaining({ userId: first.thread.ownerId, threadId: 'first' }),
				expect.any(AbortController),
			);
			expect(sender.send).toHaveBeenCalledWith({
				type: 'execution-started',
				inputMessageIds: ['message-1'],
				executionId: first.admission.executionId,
				sessionId: 'first',
				message: 'edited first message',
			});
			expect(testRuns.prepareDraftRun).toHaveBeenCalledWith(
				expect.objectContaining({
					newSession: false,
					user: expect.objectContaining({ id: 'user' }),
				}),
			);
			expect(testRuns.executePreparedDraftRun).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'first',
					sessionMode: 'existing',
					source: 'chat',
					admittedExecution: first.admission,
				}),
			);
		} finally {
			waiting.resolve();
		}
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('first', first.admission.executionId),
		);
	});

	it('forwards a budget notice from the preview run to the stream', async () => {
		const item = claim('session');
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		testRuns.executePreparedDraftRun.mockImplementation(async (input) => {
			input.onBudgetNotice?.({ code: 'budget.alert' });
			return {
				status: 'completed',
				response: '',
				executionId: input.admittedExecution!.executionId,
			};
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(sender.send).toHaveBeenCalledWith({ type: 'budget-notice', code: 'budget.alert' });
	});

	it('runs n8n Chat messages against the published agent on the claimed execution', async () => {
		const item = claim('session');
		item.payload = { kind: 'n8n_chat', message: 'input', resourceId: 'n8n-chat:user' };
		item.item.payload = { kind: 'n8n_chat' };
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		orchestrator.executeForN8nChatPublished.mockImplementation(async function* () {
			yield { type: 'text-delta', id: 'text', delta: 'hi' };
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(chatExecutions.register).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user', surface: 'n8n-chat' }),
			expect.any(AbortController),
		);
		expect(orchestrator.executeForN8nChatPublished).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({ id: 'user' }),
				memory: { threadId: 'session', resourceId: 'n8n-chat:user' },
				sessionMode: 'existing',
				admittedExecution: item.admission,
			}),
		);
		expect(testRuns.prepareDraftRun).not.toHaveBeenCalled();
		expect(sender.send).toHaveBeenCalledWith({
			type: 'done',
			sessionId: 'session',
			executionId: item.admission.executionId,
		});
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it('does not finish an n8n Chat turn that suspended for HITL', async () => {
		const item = claim('session');
		item.payload = { kind: 'n8n_chat', message: 'input', resourceId: 'n8n-chat:user' };
		item.item.payload = { kind: 'n8n_chat' };
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		orchestrator.executeForN8nChatPublished.mockImplementation(async function* () {
			yield {
				type: 'tool-call-suspended',
				toolCallId: 'call-1',
				toolName: 'agent_builder_ask_questions',
				runId: 'run-1',
				suspendPayload: { type: 'questions', questions: [] },
			};
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(sender.send).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'tool-call-suspended' }),
		);
		expect(sender.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
	});

	it('maps an n8n Chat stream failure to its errorCode via toChatErrorEvent', async () => {
		const thrown = new AgentN8nChatUnavailableError();
		const item = claim('session');
		item.payload = { kind: 'n8n_chat', message: 'input', resourceId: 'n8n-chat:user' };
		item.item.payload = { kind: 'n8n_chat' };
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		// eslint-disable-next-line require-yield
		orchestrator.executeForN8nChatPublished.mockImplementation(async function* () {
			throw thrown;
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(queue.recordFailure).toHaveBeenCalledWith(item, thrown, undefined);
		expect(sender.send).toHaveBeenCalledWith({
			type: 'error',
			message: thrown.message,
			errorCode: 'agent_unavailable',
		});
	});

	it.each([
		'missing owner',
		'deleted owner',
		'disabled owner',
		'revoked access',
		'invalid draft',
	] as const)('records %s on the claimed execution and releases the item', async (failure) => {
		const item = claim('session');
		switch (failure) {
			case 'missing owner':
				item.thread.ownerId = null;
				break;
			case 'deleted owner':
				users.findByIdWithRole.mockResolvedValue(null);
				break;
			case 'disabled owner':
				users.findByIdWithRole.mockResolvedValue(mock<User>({ id: 'user', disabled: true }));
				break;
			case 'revoked access':
				vi.mocked(userHasScopes).mockResolvedValue(false);
				break;
			case 'invalid draft':
				testRuns.prepareDraftRun.mockResolvedValue({
					status: 'agent_misconfigured',
					missing: ['model'],
				});
				break;
		}
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(queue.recordFailure).toHaveBeenCalledWith(
			item,
			expect.objectContaining({
				message:
					failure === 'invalid draft'
						? 'This agent is not ready to run yet.'
						: 'You can no longer execute this agent',
			}),
			failure === 'invalid draft' ? expect.any(AbortSignal) : undefined,
		);
		expect(testRuns.executePreparedDraftRun).not.toHaveBeenCalled();
		if (failure !== 'invalid draft') {
			expect(testRuns.prepareDraftRun).not.toHaveBeenCalled();
		}
		if (failure === 'missing owner') {
			expect(users.findByIdWithRole).not.toHaveBeenCalled();
			expect(chatExecutions.register).not.toHaveBeenCalled();
		} else {
			expect(chatExecutions.register).toHaveBeenCalledOnce();
		}
		expect(chatExecutions.settle).toHaveBeenCalledWith(
			item.admission.executionId,
			expect.any(Function),
		);
		expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
	});

	it('ends delivery without an error when Stop follows queue acceptance', async () => {
		const item = claim('session');
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
		chatExecutions.register.mockImplementation((_context, controller) => {
			controller.abort(new DOMException('Response stopped', 'AbortError'));
		});
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(queue.recordFailure).toHaveBeenCalledWith(
			item,
			expect.objectContaining({ name: 'AbortError' }),
			expect.objectContaining({ aborted: true }),
		);
		expect(testRuns.executePreparedDraftRun).not.toHaveBeenCalled();
		expect(sender.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
		expect(sender.send).toHaveBeenNthCalledWith(1, {
			type: 'execution-started',
			inputMessageIds: item.admission.inputMessageIds,
			executionId: item.admission.executionId,
			sessionId: item.thread.id,
			message: item.payload.message,
		});
		expect(sender.send).toHaveBeenCalledWith({
			type: 'done',
			sessionId: 'session',
			executionId: item.admission.executionId,
		});
		expect(sender.close).toHaveBeenCalledOnce();
	});

	it('leaves integration work pending until its bridge is available and stops admission during shutdown', async () => {
		const item = claim('session', true);
		const checked = createDeferredPromise();
		const resume = createDeferredPromise();
		const release = vi.fn();
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext.mockImplementationOnce(async (_threadId, canConsume) => {
			item.item.message.origin = null;
			await expect(canConsume(item.item, item.thread, {})).rejects.toThrow(
				'Queued integration input has no source',
			);
			expect(repository.findPublishedConnection).not.toHaveBeenCalled();
			item.item.message.origin = { source: 'slack' };
			expect(await canConsume(item.item, item.thread, {})).toBe(false);
			integrations.acquireQueueBridge.mockReturnValue({ bridge: mock<AgentChatBridge>(), release });
			expect(await canConsume(item.item, item.thread, {})).toBe(true);
			expect(integrations.acquireQueueBridge).toHaveBeenCalledWith('agent', 'slack', 'credential');
			checked.resolve();
			await resume.promise;
			expect(await canConsume(item.item, item.thread, {})).toBe(false);
			return null;
		});
		repository.findPublishedConnection.mockResolvedValue(
			mock<AgentIntegrationConfig>({ type: 'slack', credentialId: 'credential' }),
		);
		consumer.start();
		await checked.promise;
		consumer.stop();
		resume.resolve();
		await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
		expect(queue.recordFailure).not.toHaveBeenCalled();
	});

	it.each(['accepted', 'claim fails'] as const)(
		'releases the reserved bridge after the message is %s during handover',
		async (outcome) => {
			const item = claim('session', true);
			const bridge = mock<AgentChatBridge>();
			const release = vi.fn();
			const running = createDeferredPromise();
			repository.findThreadIds.mockResolvedValue(['session']);
			repository.findPublishedConnection.mockResolvedValue(
				mock<AgentIntegrationConfig>({ type: 'slack', credentialId: 'credential' }),
			);
			integrations.acquireQueueBridge.mockReturnValue({ bridge, release });
			bridge.consumeQueuedMessage.mockReturnValue(running.promise);
			queue.claimNext
				.mockImplementationOnce(async (_threadId, canConsume) => {
					expect(await canConsume(item.item, item.thread, {})).toBe(true);
					// Teardown now refuses new consumers. The admitted consumer keeps its bridge.
					integrations.acquireQueueBridge.mockReturnValue(undefined);
					integrations.getBridge.mockReturnValue(undefined);
					if (outcome === 'claim fails') throw new Error('Commit failed');
					return item;
				})
				.mockResolvedValue(null);
			consumer.start();
			try {
				if (outcome === 'accepted') {
					await vi.waitFor(() =>
						expect(bridge.consumeQueuedMessage).toHaveBeenCalledWith(
							item.payload,
							item.thread.id,
							item.admission,
							expect.any(AbortSignal),
							expect.objectContaining({ credentialId: 'credential' }),
						),
					);
					expect(release).not.toHaveBeenCalled();
					expect(repository.findPublishedConnection).toHaveBeenCalledWith(
						'agent',
						'project',
						'slack',
						'credential',
					);
				}
			} finally {
				running.resolve();
			}
			await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
			expect(queue.recordFailure).not.toHaveBeenCalled();
			if (outcome === 'claim fails') expect(bridge.consumeQueuedMessage).not.toHaveBeenCalled();
			else expect(queue.settle).toHaveBeenCalledWith(item.thread.id, item.admission.executionId);
		},
	);

	it('records a removed integration as a failure instead of leaving it pending', async () => {
		const item = claim('session', true);
		repository.findThreadIds.mockResolvedValue(['session']);
		queue.claimNext
			.mockImplementationOnce(async (_threadId, canConsume) => {
				expect(await canConsume(item.item, item.thread, {})).toBe(true);
				return item;
			})
			.mockResolvedValue(null);
		consumer.start();
		await vi.waitFor(() =>
			expect(queue.settle).toHaveBeenCalledWith('session', item.admission.executionId),
		);
		expect(queue.recordFailure).toHaveBeenCalledWith(
			item,
			expect.objectContaining({ message: 'The message integration is no longer configured' }),
			undefined,
		);
	});
	describe('system agents', () => {
		function registerSystemAgent(authorized = true) {
			const provider = {
				agentId: 'agent',
				name: 'System Agent',
				authorize: vi.fn(async () => authorized),
				prepareTurn: vi.fn(),
			} satisfies SystemAgentProvider;
			systemAgents.register(provider);
			return provider;
		}

		function systemClaim(threadId: string): ClaimedAgentMessage {
			const item = claim(threadId);
			return {
				...item,
				payload: { kind: 'system', message: 'input', resourceId: 'system-chat:user' },
				item: mock<AgentMessageQueue>({ ...item.item, payload: { kind: 'system' } }),
			};
		}

		async function consumeOne(item: ClaimedAgentMessage) {
			repository.findThreadIds.mockResolvedValue([item.thread.id]);
			queue.claimNext.mockResolvedValueOnce(item).mockResolvedValue(null);
			consumer.start();
			await vi.waitFor(() =>
				expect(queue.settle).toHaveBeenCalledWith(item.thread.id, item.admission.executionId),
			);
		}

		it('routes a system message to the system-agent runtime after the floor check', async () => {
			const provider = registerSystemAgent();
			const item = systemClaim('session');
			systemAgentExecution.consume.mockImplementation(async (_claim, _user, _signal, send) => {
				send({ type: 'done', sessionId: 'session', executionId: item.admission.executionId });
			});

			await consumeOne(item);

			expect(systemAgentExecution.consume).toHaveBeenCalledWith(
				item,
				expect.objectContaining({ id: 'user' }),
				expect.any(AbortSignal),
				sender.send,
			);
			expect(chatExecutions.register).toHaveBeenCalledWith(
				expect.objectContaining({ userId: 'user', surface: 'system' }),
				expect.any(AbortController),
			);
			// The runtime floor (`project:read`) and the provider decide access,
			// not the project `agent:execute` scope.
			expect(userHasScopes).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'user' }),
				['project:read'],
				false,
				{ projectId: 'project' },
			);
			expect(userHasScopes).not.toHaveBeenCalledWith(
				expect.anything(),
				['agent:execute'],
				expect.anything(),
				expect.anything(),
			);
			expect(provider.authorize).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'user' }),
				'project',
			);
			expect(testRuns.prepareDraftRun).not.toHaveBeenCalled();
			expect(chatExecutions.register).toHaveBeenCalledWith(
				expect.objectContaining({ userId: 'user', threadId: 'session' }),
				expect.any(AbortController),
			);
			expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
			expect(queue.recordFailure).not.toHaveBeenCalled();
		});

		/** A refused system turn fails the item, streams an error and never runs. */
		function expectRefused(item: ReturnType<typeof systemClaim>) {
			expect(queue.recordFailure).toHaveBeenCalledWith(
				item,
				expect.objectContaining({ message: 'You can no longer execute this agent' }),
				undefined,
			);
			// The claim registers the stop target before the owner check runs.
			expect(chatExecutions.register).toHaveBeenCalledOnce();
			expect(chatExecutions.register).toHaveBeenCalledWith(
				expect.objectContaining({ surface: 'system' }),
				expect.any(AbortController),
			);
			expect(systemAgentExecution.consume).not.toHaveBeenCalled();
			expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
		}

		it('records a failure when the provider no longer authorizes the owner', async () => {
			registerSystemAgent(false);
			const item = systemClaim('session');

			await consumeOne(item);

			expectRefused(item);
		});

		it('records a failure when the owner can no longer read the working project', async () => {
			const provider = registerSystemAgent();
			vi.mocked(userHasScopes).mockResolvedValue(false);
			const item = systemClaim('session');

			await consumeOne(item);

			expectRefused(item);
			expect(provider.authorize).not.toHaveBeenCalled();
		});

		it('records a failure for a system message without a registered provider', async () => {
			const item = systemClaim('session');

			await consumeOne(item);

			expectRefused(item);
		});

		it('keeps the agent:execute check for Preview messages of a system agent id', async () => {
			registerSystemAgent();
			const item = claim('session');

			await consumeOne(item);

			expect(userHasScopes).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'user' }),
				['agent:execute'],
				false,
				{ projectId: 'project' },
			);
			expect(systemAgentExecution.consume).not.toHaveBeenCalled();
			expect(testRuns.prepareDraftRun).toHaveBeenCalled();
		});
	});
});
