import { AGENT_CHAT_ERROR_CODES, type AgentSseEvent } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { UserRepository, type User } from '@n8n/db';
import { OnShutdown } from '@n8n/decorators';
import { createHash } from 'node:crypto';
import { Service } from '@n8n/di';
import { OperationalError, UnexpectedError, UserError } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { userHasScopes } from '@/permissions.ee/check-access';

import { AgentsCredentialProvider } from './adapters/agents-credential-provider';
import { AgentChatExecutionService } from './agent-chat-execution.service';
import { AgentExecutionOrchestratorService } from './agent-execution-orchestrator.service';
import { AgentExecutionService } from './agent-execution.service';
import { AgentMessageQueueService, type ClaimedAgentMessage } from './agent-message-queue.service';
import { AgentQueuedTestStreamService } from './agent-queued-test-stream.service';
import { emitChunkEvents, toChatErrorEvent } from './agent-sse-stream';
import { AgentTestRunService } from './agent-test-run.service';
import type { AgentExecutionThread } from './entities/agent-execution-thread.entity';
import type { AgentChatBridge } from './integrations/agent-chat-bridge';
import { ChatIntegrationService } from './integrations/chat-integration.service';
import { AgentMessageQueueRepository } from './repositories/agent-message-queue.repository';
import { AgentDepartmentMeetingInvocationRepository } from './repositories/agent-department-meeting-invocation.repository';
import { hashDepartmentMeetingInvocationRequest } from './agent-department-meeting-invocation.contracts';
import { AgentDepartmentConsultationInvocationRepository } from './repositories/agent-department-consultation-invocation.repository';
import {
	DepartmentConsultationBindingVerifierProxy,
	hashDepartmentConsultationRequest,
} from './agent-department-consultation.contracts';
import { canUseSystemAgent } from './system-agents/system-agent-access';
import { SystemAgentExecutionService } from './system-agents/system-agent-execution.service';
import { SystemAgentRegistry } from './system-agents/system-agent-registry';
import { chatSurfaceForKind, type AgentChatSurface } from './utils/agent-thread-access';

@Service()
export class AgentMessageQueueConsumer {
	private readonly activeThreads = new Set<string>();
	private timer?: NodeJS.Timeout;
	private stopped = true;
	private scanning = false;

	constructor(
		private readonly queue: AgentMessageQueueService,
		private readonly repository: AgentMessageQueueRepository,
		private readonly executionService: AgentExecutionService,
		private readonly previewStreams: AgentQueuedTestStreamService,
		private readonly testRunService: AgentTestRunService,
		private readonly userRepository: UserRepository,
		private readonly credentialsService: CredentialsService,
		private readonly chatExecutionService: AgentChatExecutionService,
		private readonly integrations: ChatIntegrationService,
		private readonly orchestrator: AgentExecutionOrchestratorService,
		private readonly logger: Logger,
		private readonly systemAgents: SystemAgentRegistry,
		private readonly systemAgentExecution: SystemAgentExecutionService,
		private readonly invocations: AgentDepartmentMeetingInvocationRepository,
		private readonly consultations: AgentDepartmentConsultationInvocationRepository,
		private readonly consultationBindings: DepartmentConsultationBindingVerifierProxy,
	) {}

	start(): void {
		this.stopped = false;
		this.queue.onAvailable = (threadId) => this.kick(threadId);
		this.timer = setInterval(() => {
			void this.scan();
		}, 5_000);
		this.timer.unref();
		void this.scan();
	}

	@OnShutdown()
	stop(): void {
		this.stopped = true;
		clearInterval(this.timer);
		this.queue.onAvailable = undefined;
	}

	/** Find queued sessions after a missed notification, a restart, or acceptance on another main. */
	private async scan(): Promise<void> {
		if (this.stopped || this.scanning) return;
		this.scanning = true;
		try {
			for (const threadId of await this.repository.findThreadIds()) this.kick(threadId);
			await this.previewStreams.closeSettledStreams();
		} catch (error) {
			this.logger.warn('Failed to scan queued agent messages', { error });
		} finally {
			this.scanning = false;
		}
	}

	/** Start a local drain attempt. Database claims coordinate ownership across mains. */
	private kick(threadId: string): void {
		if (this.stopped || this.activeThreads.has(threadId)) return;
		this.activeThreads.add(threadId);
		void this.drain(threadId)
			.catch((error: unknown) => {
				this.logger.warn('Failed to consume queued agent messages', { threadId, error });
			})
			.finally(() => this.activeThreads.delete(threadId));
	}

	/** Run messages in queue order until the session is empty, blocked, or unavailable on this main. */
	private async drain(threadId: string): Promise<void> {
		while (!this.stopped) {
			if (!(await this.consumeNext(threadId))) return;
		}
	}

	/** Claim and process one message. A bridge lease prevents teardown until the attempt finishes. */
	private async consumeNext(threadId: string): Promise<boolean> {
		let lease: ReturnType<ChatIntegrationService['acquireQueueBridge']>;
		const controller = new AbortController();
		try {
			const claim = await this.chatExecutionService.withTurnLock(threadId, async (signal) => {
				signal.throwIfAborted();

				const claimed = await this.queue.claimNext(threadId, async (item, thread, ctx) => {
					if (this.stopped) return false;
					if (item.message.origin?.source === 'ai-department-meeting') {
						if (item.payload.kind !== 'n8n_chat' || !item.payload.departmentMeetingInvocation) {
							throw new UnexpectedError('Meeting queue item has no invocation payload');
						}
						if (thread.agentId !== item.payload.departmentMeetingInvocation.executorId) {
							throw new UnexpectedError('Meeting queue item executor does not match its thread');
						}
						const user = await this.userRepository.findByIdWithRole(
							item.payload.departmentMeetingInvocation.actorId,
						);
						if (
							!user ||
							user.disabled ||
							!(await userHasScopes(user, ['agent:execute'], false, {
								projectId: thread.projectId,
							}))
						)
							return false;
						return !this.stopped;
					}
					if (item.message.origin?.source === 'ai-department-consultation') {
						if (
							item.payload.kind !== 'n8n_chat' ||
							!item.payload.departmentConsultationInvocation
						) {
							throw new UnexpectedError('Consultation queue item has no invocation payload');
						}
						if (thread.agentId !== item.payload.departmentConsultationInvocation.executorId) {
							throw new UnexpectedError(
								'Consultation queue item executor does not match its thread',
							);
						}
						const request = item.payload.departmentConsultationInvocation;
						if (
							!(await this.consultationBindings.isCurrentBinding({
								projectId: request.projectId,
								departmentId: request.departmentId,
								memberId: request.recipientMemberId,
								executorId: request.executorId,
								bindingVersion: request.bindingVersion,
							}))
						) {
							return false;
						}
						const user = await this.userRepository.findByIdWithRole(
							item.payload.departmentConsultationInvocation.actorId,
						);
						if (
							!user ||
							user.disabled ||
							!(await userHasScopes(user, ['agent:execute'], false, {
								projectId: thread.projectId,
							}))
						)
							return false;
						return !this.stopped;
					}
					if (item.payload.kind !== 'integration') return true;

					const source = item.message.origin?.source;
					if (!source) throw new UnexpectedError('Queued integration input has no source');

					const connection = await this.repository.findPublishedConnection(
						thread.agentId,
						thread.projectId,
						source,
						item.payload.credentialId,
						ctx,
					);

					if (this.stopped) return false;

					// Removed connections fail the item. A missing or closing bridge leaves it pending.
					if (!connection) return true;

					lease = this.integrations.acquireQueueBridge(
						thread.agentId,
						source,
						item.payload.credentialId,
					);

					return lease !== undefined;
				});

				if (!claimed) return null;

				if (signal.aborted) {
					// Finalize the claimed execution without starting it after the lock expires.
					controller.abort(new OperationalError('Agent execution startup lock was lost'));
				} else if (claimed.payload.kind !== 'integration' && claimed.thread.ownerId) {
					this.chatExecutionService.register(
						{
							projectId: claimed.thread.projectId,
							agentId: claimed.thread.agentId,
							threadId,
							userId: claimed.thread.ownerId,
							executionId: claimed.admission.executionId,
							surface: chatSurfaceForKind(claimed.payload.kind),
						},
						controller,
					);
				}
				return claimed;
			});

			if (!claim) return false;

			await this.chatExecutionService.settle(
				claim.admission.executionId,
				async () => await this.consume(claim, controller, lease?.bridge),
			);

			return true;
		} finally {
			lease?.release();
		}
	}

	/** Execute a claimed message, deliver its output, and settle its queue item. */
	private async consume(
		claim: ClaimedAgentMessage,
		controller: AbortController,
		bridge?: AgentChatBridge,
	): Promise<void> {
		const { item, thread, admission, payload } = claim;
		const signal = AbortSignal.any([
			controller.signal,
			this.executionService.getAbortSignal(admission.executionId),
		]);
		const surface = payload.kind === 'integration' ? undefined : chatSurfaceForKind(payload.kind);
		const sender = surface && this.previewStreams.createSender(item.id);

		try {
			if (
				item.message.origin?.source === 'ai-department-meeting' &&
				payload.kind === 'n8n_chat' &&
				payload.departmentMeetingInvocation
			) {
				await this.consumeDepartmentMeeting(claim, signal);
				return;
			}
			if (
				item.message.origin?.source === 'ai-department-consultation' &&
				payload.kind === 'n8n_chat' &&
				payload.departmentConsultationInvocation
			) {
				await this.consumeDepartmentConsultation(claim, signal);
				return;
			}
			if (surface && sender) {
				const user = await this.getThreadOwner(thread, surface);
				sender.send({
					type: 'execution-started',
					executionId: admission.executionId,
					sessionId: thread.id,
					inputMessageIds: admission.inputMessageIds,
					message: payload.message,
				});
				signal.throwIfAborted();

				if (payload.kind === 'system') {
					await this.systemAgentExecution.consume(claim, user, signal, sender.send);
				} else if (payload.kind === 'n8n_chat') {
					await this.consumeN8nChat(claim, user, signal, sender.send);
				} else {
					await this.consumePreview(claim, user, signal, sender.send);
				}
			} else {
				signal.throwIfAborted();
				await this.consumeIntegration(claim, signal, bridge);
			}
		} catch (error) {
			const { isAbortError } = await import('@n8n/agents');
			const requestedStop =
				controller.signal.aborted && isAbortError(controller.signal.reason) && isAbortError(error);
			await this.queue.recordFailure(claim, error, requestedStop ? controller.signal : undefined);

			if (requestedStop) {
				sender?.send({ type: 'done', sessionId: thread.id, executionId: admission.executionId });
				return;
			}

			sender?.send(toChatErrorEvent(error, 'Chat failed'));
			this.logger.warn('Queued agent message failed', {
				queueId: item.id,
				executionId: admission.executionId,
				error,
			});
		} finally {
			await sender?.close();
			await this.queue.settle(thread.id, admission.executionId);
		}
	}

	private async consumeDepartmentMeeting(
		claim: ClaimedAgentMessage,
		signal: AbortSignal,
	): Promise<void> {
		const { thread, admission, payload } = claim;
		if (payload.kind !== 'n8n_chat' || !payload.departmentMeetingInvocation) {
			throw new UnexpectedError('Meeting queue item has no invocation payload');
		}
		const request = payload.departmentMeetingInvocation;
		const { expectedInputHash, ...requestIdentity } = request;
		if (
			request.projectId !== thread.projectId ||
			request.executorId !== thread.agentId ||
			request.actorId !== thread.ownerId ||
			hashDepartmentMeetingInvocationRequest(requestIdentity) !== expectedInputHash ||
			request.toolPolicy.mode !== 'supplied-material-only' ||
			request.inputText.length === 0 ||
			request.inputText.length > 24_000 ||
			request.maxOutputChars < 1 ||
			request.maxOutputChars > 4_000 ||
			request.maxOutputTokens < 1 ||
			request.maxOutputTokens > 1_000
		) {
			throw new UnexpectedError('Meeting invocation failed owner validation');
		}
		const user = await this.userRepository.findByIdWithRole(request.actorId);
		if (
			!user ||
			user.disabled ||
			!(await userHasScopes(user, ['agent:execute'], false, { projectId: thread.projectId }))
		) {
			throw new UserError('Meeting execution is no longer authorized');
		}
		const current = await this.invocations.findByInvocationId(
			thread.projectId,
			request.invocationId,
		);
		if (
			!current ||
			current.threadId !== thread.id ||
			current.inputHash !== request.expectedInputHash ||
			current.requestKey !== request.requestKey ||
			current.inputText !== request.inputText
		) {
			throw new UnexpectedError('Meeting invocation receipt does not match the queue item');
		}
		if (
			await this.invocations.isCancelled({
				projectId: request.projectId,
				invocationId: request.invocationId,
				requestKey: request.requestKey,
				inputHash: request.expectedInputHash,
			})
		) {
			await this.invocations.markTerminal({
				projectId: request.projectId,
				invocationId: request.invocationId,
				outcome: 'cancelled',
				safeErrorCode: 'cancelled_before_execution',
			});
			return;
		}
		const started = await this.invocations.markRunning(request.projectId, request.invocationId);
		if (started.affected !== 1) {
			throw new OperationalError('Meeting invocation is stopping before execution startup');
		}
		let output = '';
		let outputChars = 0;
		let finishReason: string | undefined;
		const deadline = Date.parse(request.deadlineAt);
		const timeout = Math.max(0, deadline - Date.now());
		const timeoutSignal = AbortSignal.timeout(timeout);
		const turnSignal = AbortSignal.any([signal, timeoutSignal]);
		let outcome: 'succeeded' | 'failed' | 'cancelled' = 'failed';
		let safeErrorCode = 'model_failure';
		try {
			for await (const chunk of this.orchestrator.executeForDepartmentMeeting({
				agentId: thread.agentId,
				projectId: thread.projectId,
				threadId: thread.id,
				resourceId: payload.resourceId,
				inputText: request.inputText,
				maxOutputTokens: request.maxOutputTokens,
				actorId: request.actorId,
				admittedExecution: admission,
				abortSignal: turnSignal,
			})) {
				if (chunk.type === 'text-delta') {
					const remaining = request.maxOutputChars - outputChars;
					if (remaining > 0) {
						const accepted = Array.from(chunk.delta).slice(0, remaining);
						output += accepted.join('');
						outputChars += accepted.length;
					}
				}
				if (chunk.type === 'finish') finishReason = chunk.finishReason;
				if (chunk.type === 'tool-call' || chunk.type === 'tool-result') {
					throw new UnexpectedError('Meeting runtime attempted tool execution');
				}
			}
			const succeeded =
				finishReason !== undefined &&
				finishReason !== 'error' &&
				finishReason !== 'cancelled' &&
				output.trim().length > 0 &&
				!timeoutSignal.aborted;
			const modelCancelled = finishReason === 'cancelled';
			outcome = succeeded
				? 'succeeded'
				: timeoutSignal.aborted || signal.aborted || modelCancelled
					? 'cancelled'
					: 'failed';
			safeErrorCode = timeoutSignal.aborted
				? 'deadline'
				: signal.aborted || modelCancelled
					? 'cancelled'
					: 'model_failure';
		} catch {
			outcome = timeoutSignal.aborted || signal.aborted ? 'cancelled' : 'failed';
			safeErrorCode = timeoutSignal.aborted
				? 'deadline'
				: signal.aborted
					? 'cancelled'
					: 'model_failure';
		}
		const resultText = outcome === 'succeeded' ? output.trim() : undefined;
		await this.invocations.markTerminal({
			projectId: request.projectId,
			invocationId: request.invocationId,
			outcome,
			...(resultText
				? { resultText, resultHash: createHash('sha256').update(resultText).digest('hex') }
				: {}),
			...(outcome !== 'succeeded' ? { safeErrorCode } : {}),
		});
		if (signal.aborted) throw signal.reason;
	}

	private async consumeDepartmentConsultation(
		claim: ClaimedAgentMessage,
		signal: AbortSignal,
	): Promise<void> {
		const { thread, admission, payload } = claim;
		if (payload.kind !== 'n8n_chat' || !payload.departmentConsultationInvocation) {
			throw new UnexpectedError('Consultation queue item has no invocation payload');
		}
		const request = payload.departmentConsultationInvocation;
		const { expectedInputHash, inputText: _inputText, ...requestIdentity } = request;
		if (
			request.projectId !== thread.projectId ||
			request.executorId !== thread.agentId ||
			request.actorId !== thread.ownerId ||
			hashDepartmentConsultationRequest(requestIdentity) !== expectedInputHash ||
			request.toolPolicy.mode !== 'none' ||
			!request.inputText ||
			request.inputText.length > 24_000 ||
			request.maxOutputChars < 1 ||
			request.maxOutputChars > 4_000 ||
			request.maxOutputTokens < 1 ||
			request.maxOutputTokens > 1_000
		) {
			throw new UnexpectedError('Consultation invocation failed owner validation');
		}
		const user = await this.userRepository.findByIdWithRole(request.actorId);
		if (
			!user ||
			user.disabled ||
			!(await userHasScopes(user, ['agent:execute'], false, { projectId: thread.projectId }))
		) {
			throw new UserError('Consultation execution is no longer authorized');
		}
		const current = await this.consultations.findByInvocationId(
			thread.projectId,
			request.invocationId,
		);
		if (
			!current ||
			current.threadId !== thread.id ||
			current.helpRequestId !== request.helpRequestId ||
			current.inputHash !== request.expectedInputHash ||
			current.commandKey !== request.commandKey ||
			current.contextHash !== request.contextHash ||
			current.inputText !== request.inputText
		) {
			throw new UnexpectedError('Consultation invocation receipt does not match the queue item');
		}
		if (
			!(await this.consultationBindings.isCurrentBinding({
				projectId: request.projectId,
				departmentId: request.departmentId,
				memberId: request.recipientMemberId,
				executorId: request.executorId,
				bindingVersion: request.bindingVersion,
			}))
		) {
			await this.consultations.markTerminal({
				projectId: request.projectId,
				invocationId: request.invocationId,
				outcome: 'cancelled',
				safeErrorCode: 'binding_changed',
			});
			return;
		}
		if (
			await this.consultations.isCancelled({
				projectId: request.projectId,
				invocationId: request.invocationId,
				commandKey: request.commandKey,
				inputHash: request.expectedInputHash,
			})
		) {
			await this.consultations.markTerminal({
				projectId: request.projectId,
				invocationId: request.invocationId,
				outcome: 'cancelled',
				safeErrorCode: 'cancelled_before_execution',
			});
			return;
		}
		const started = await this.consultations.markRunning(request.projectId, request.invocationId);
		if (started.affected !== 1) {
			throw new OperationalError('Consultation is stopping before execution startup');
		}
		let output = '';
		let outputChars = 0;
		let finishReason: string | undefined;
		const deadline = Date.parse(request.deadlineAt);
		const timeoutSignal = AbortSignal.timeout(Math.max(0, deadline - Date.now()));
		const turnSignal = AbortSignal.any([signal, timeoutSignal]);
		let outcome: 'succeeded' | 'failed' | 'cancelled' = 'failed';
		let safeErrorCode = 'model_failure';
		try {
			for await (const chunk of this.orchestrator.executeForDepartmentConsultation({
				agentId: thread.agentId,
				projectId: thread.projectId,
				threadId: thread.id,
				resourceId: payload.resourceId,
				inputText: request.inputText,
				maxOutputTokens: request.maxOutputTokens,
				actorId: request.actorId,
				admittedExecution: admission,
				abortSignal: turnSignal,
			})) {
				if (chunk.type === 'text-delta') {
					const remaining = request.maxOutputChars - outputChars;
					if (remaining > 0) {
						const accepted = Array.from(chunk.delta).slice(0, remaining);
						output += accepted.join('');
						outputChars += accepted.length;
					}
				}
				if (chunk.type === 'finish') finishReason = chunk.finishReason;
				if (chunk.type === 'tool-call' || chunk.type === 'tool-result') {
					throw new UnexpectedError('Consultation runtime attempted tool execution');
				}
			}
			const succeeded =
				finishReason !== undefined &&
				finishReason !== 'error' &&
				finishReason !== 'cancelled' &&
				output.trim().length > 0 &&
				!timeoutSignal.aborted;
			const modelCancelled = finishReason === 'cancelled';
			outcome = succeeded
				? 'succeeded'
				: timeoutSignal.aborted || signal.aborted || modelCancelled
					? 'cancelled'
					: 'failed';
			safeErrorCode = timeoutSignal.aborted
				? 'deadline_exceeded'
				: signal.aborted || modelCancelled
					? 'stopped'
					: succeeded
						? ''
						: 'empty_or_failed_response';
		} catch {
			outcome = timeoutSignal.aborted || signal.aborted ? 'cancelled' : 'failed';
			safeErrorCode = timeoutSignal.aborted
				? 'deadline_exceeded'
				: signal.aborted
					? 'stopped'
					: 'model_failure';
		} finally {
			const answer = outcome === 'succeeded' ? output : undefined;
			await this.consultations.markTerminal({
				projectId: request.projectId,
				invocationId: request.invocationId,
				outcome,
				...(safeErrorCode ? { safeErrorCode } : {}),
				...(answer
					? { resultText: answer, resultHash: createHash('sha256').update(answer).digest('hex') }
					: {}),
			});
		}
		if (signal.aborted) throw signal.reason;
	}

	/**
	 * Load the thread owner and check that they can still run the agent. A
	 * system agent uses the runtime floor and its provider checks instead of
	 * the project `agent:execute` scope.
	 */
	private async getThreadOwner(
		thread: AgentExecutionThread,
		surface: AgentChatSurface,
	): Promise<User> {
		if (!thread.ownerId) throw new UserError('You can no longer execute this agent');
		const user = await this.userRepository.findByIdWithRole(thread.ownerId);
		if (!user || user.disabled || !(await this.canExecute(user, thread, surface))) {
			throw new UserError('You can no longer execute this agent');
		}
		return user;
	}

	private async canExecute(
		user: User,
		thread: AgentExecutionThread,
		surface: AgentChatSurface,
	): Promise<boolean> {
		if (surface !== 'system') {
			return await userHasScopes(user, ['agent:execute'], false, { projectId: thread.projectId });
		}
		const provider = this.systemAgents.get(thread.agentId);
		return provider !== undefined && (await canUseSystemAgent(provider, user, thread.projectId));
	}

	private async consumePreview(
		claim: ClaimedAgentMessage,
		user: User,
		signal: AbortSignal,
		send: (event: AgentSseEvent) => void,
	): Promise<void> {
		const { thread, admission, payload } = claim;
		if (payload.kind !== 'preview') return;
		signal.throwIfAborted();

		const prepared = await this.testRunService.prepareDraftRun({
			agentId: thread.agentId,
			projectId: thread.projectId,
			user,
			sessionId: thread.id,
			previewChat: true,
			newSession: false,
			credentialProvider: new AgentsCredentialProvider(
				this.credentialsService,
				thread.projectId,
				user,
				thread.agentId,
			),
		});

		if (prepared.status !== 'ready') {
			const message =
				prepared.status === 'agent_misconfigured'
					? 'This agent is not ready to run yet.'
					: 'Session not found';
			await this.queue.recordFailure(claim, new UserError(message), signal);
			send({
				type: 'error',
				message,
				...(prepared.status === 'agent_misconfigured'
					? { errorCode: AGENT_CHAT_ERROR_CODES.agentMisconfigured, missing: prepared.missing }
					: {}),
			});
			return;
		}

		const result = await this.testRunService.executePreparedDraftRun({
			agentId: thread.agentId,
			projectId: thread.projectId,
			user,
			message: payload.message,
			attachments: payload.attachments,
			sessionId: thread.id,
			sessionMode: 'existing',
			previewChat: true,
			source: claim.recording.source,
			admittedExecution: admission,
			abortSignal: signal,
			errorMode: 'forward',
			onChunk: (chunk) => emitChunkEvents(chunk, send),
			onBudgetNotice: (notice) => send({ type: 'budget-notice', ...notice }),
		});

		if (result.status === 'completed')
			send({ type: 'done', sessionId: thread.id, executionId: admission.executionId });
	}

	private async consumeN8nChat(
		claim: ClaimedAgentMessage,
		user: User,
		signal: AbortSignal,
		send: (event: AgentSseEvent) => void,
	): Promise<void> {
		const { thread, admission, payload } = claim;
		const stream = this.orchestrator.executeForN8nChatPublished({
			agentId: thread.agentId,
			projectId: thread.projectId,
			user,
			message: payload.message,
			memory: { threadId: thread.id, resourceId: payload.resourceId },
			attachments: payload.attachments,
			sessionMode: 'existing',
			admittedExecution: admission,
			departmentWork: claim.recording.source === 'ai-department',
			...(claim.recording.source === 'ai-department' &&
				claim.payload.kind === 'n8n_chat' && {
					departmentWorkflowIds: claim.payload.departmentWorkflowIds ?? [],
					departmentWorkflowCapabilities: claim.payload.departmentWorkflowCapabilities ?? [],
				}),
			abortSignal: signal,
		});
		let completed = true;
		for await (const chunk of stream) {
			emitChunkEvents(chunk, send);
			if (chunk.type === 'tool-call-suspended' || chunk.type === 'error') completed = false;
		}
		if (completed) send({ type: 'done', sessionId: thread.id, executionId: admission.executionId });
	}

	private async consumeIntegration(
		claim: ClaimedAgentMessage,
		signal: AbortSignal,
		bridge?: AgentChatBridge,
	): Promise<void> {
		const { thread, payload } = claim;
		if (payload.kind !== 'integration') return;
		const connection = await this.repository.findPublishedConnection(
			thread.agentId,
			thread.projectId,
			payload.messageContext.platform,
			payload.credentialId,
		);
		if (!connection) throw new UserError('The message integration is no longer configured');
		if (!bridge) throw new OperationalError('The message integration is unavailable');
		await bridge.consumeQueuedMessage(payload, thread.id, claim.admission, signal, connection);
	}
}
