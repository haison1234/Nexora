import type { AgentSessionStopResponse } from '@n8n/api-types';
import { ExecutionsConfig } from '@n8n/config';
import { OnPubSubEvent } from '@n8n/decorators';
import { Service } from '@n8n/di';
import { NotFoundError } from '@n8n/errors';

import type { PubSubCommandMap } from '@/scaling/pubsub/pubsub.event-map';
import { Publisher } from '@/scaling/pubsub/publisher.service';

import { AgentExecutionService } from './agent-execution.service';
import { AgentChatExecutionService } from './agent-chat-execution.service';
import { AgentMessageQueueService } from './agent-message-queue.service';
import { AgentQueuedTestStreamService } from './agent-queued-test-stream.service';
import { AgentChatAttachmentService } from './agent-chat-attachment.service';
import { SystemAgentRegistry } from './system-agents/system-agent-registry';
import { AgentExecutionRepository } from './repositories/agent-execution.repository';

@Service()
export class AgentSessionStopService {
	constructor(
		private readonly executionService: AgentExecutionService,
		private readonly messageQueue: AgentMessageQueueService,
		private readonly publisher: Publisher,
		private readonly executionsConfig: ExecutionsConfig,
		private readonly systemAgents: SystemAgentRegistry,
		private readonly chatExecutionService: AgentChatExecutionService,
		private readonly queuedStreams: AgentQueuedTestStreamService,
		private readonly attachments: AgentChatAttachmentService,
		private readonly executionRepository: AgentExecutionRepository,
	) {}

	async stopSession(
		projectId: string,
		agentId: string,
		threadId: string,
		userId: string,
	): Promise<AgentSessionStopResponse> {
		const thread = await this.executionService.findAccessibleThreadById(
			threadId,
			projectId,
			agentId,
			userId,
		);
		if (!thread || this.systemAgents.has(agentId)) {
			throw new NotFoundError('Session not found');
		}

		const { executionIds, queueIds, attachmentIds } =
			await this.messageQueue.prepareSessionStop(threadId);
		if (executionIds.length === 0 && queueIds.length === 0) return { cancelRequested: false };

		const payload = { agentId, threadId, executionIds, queueIds };
		this.onStopSession(payload);
		try {
			if (this.executionsConfig.mode === 'queue') {
				await this.publisher.publishCommand({
					command: 'stop-agent-session',
					payload,
				});
			}
		} finally {
			await Promise.all([
				this.chatExecutionService.cancelSessionWork(agentId, threadId, executionIds),
				this.attachments.deleteByIds(attachmentIds),
			]);
		}
		return { cancelRequested: true };
	}

	async stopDepartmentExecution(input: {
		projectId: string;
		agentId: string;
		threadId: string;
		ownerExecutionRef: string;
		source?: 'ai-department' | 'ai-department-meeting' | 'ai-department-consultation';
	}): Promise<boolean> {
		const thread = await this.executionRepository.findThreadById(input.threadId);
		if (
			!thread ||
			thread.projectId !== input.projectId ||
			thread.agentId !== input.agentId ||
			thread.ownerId === null ||
			this.systemAgents.has(input.agentId)
		)
			return false;
		const { executionIds, queueIds, attachmentIds } = await this.messageQueue.prepareDepartmentStop(
			input.threadId,
			input.ownerExecutionRef,
			input.source ?? 'ai-department',
		);
		if (executionIds.length === 0 && queueIds.length === 0) return false;
		const payload = { agentId: input.agentId, threadId: input.threadId, executionIds, queueIds };
		this.onStopSession(payload);
		try {
			if (this.executionsConfig.mode === 'queue') {
				await this.publisher.publishCommand({ command: 'stop-agent-session', payload });
			}
		} finally {
			await Promise.all([
				this.chatExecutionService.cancelSessionWork(input.agentId, input.threadId, executionIds),
				this.attachments.deleteByIds(attachmentIds),
			]);
		}
		return true;
	}

	@OnPubSubEvent('stop-agent-session')
	onStopSession({
		agentId,
		threadId,
		executionIds,
		queueIds = [],
	}: PubSubCommandMap['stop-agent-session']): void {
		const localExecutionIds = executionIds.filter((id) => this.executionService.stopExecution(id));
		this.chatExecutionService.stopSessionExecutions(agentId, threadId, localExecutionIds);
		this.queuedStreams.closeQueuedStreams(queueIds);
	}
}
