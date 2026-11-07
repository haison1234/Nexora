import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { DepartmentWorkflowInvocationProxy } from './agent-department-execution.contracts';
import { AgentDepartmentWorkflowInvocationInputService } from './agent-department-workflow-invocation-input.service';
import type { AgentDepartmentWorkflowEvent } from './entities/agent-department-workflow-event.entity';
import { AgentDepartmentWorkflowEventRepository } from './repositories/agent-department-workflow-event.repository';

@Service()
export class AgentDepartmentWorkflowEventService {
	constructor(
		private readonly repository: AgentDepartmentWorkflowEventRepository,
		private readonly invocations: DepartmentWorkflowInvocationProxy,
		private readonly inputs: AgentDepartmentWorkflowInvocationInputService,
		private readonly logger: Logger,
	) {}

	async record(
		input: Omit<
			AgentDepartmentWorkflowEvent,
			'id' | 'eventId' | 'createdAt' | 'updatedAt' | 'deliveredAt' | 'setUpdateDate'
		>,
	) {
		const event = await this.repository.append({ ...input, eventId: randomUUID() });
		await this.deliver(event);
	}

	async recordIfChanged(
		input: Omit<
			AgentDepartmentWorkflowEvent,
			'id' | 'eventId' | 'createdAt' | 'updatedAt' | 'deliveredAt' | 'setUpdateDate'
		>,
	): Promise<void> {
		const latest = await this.repository.findLatestForInvocation(input.invocationId);
		if (
			latest?.ownerExecutionRef === input.ownerExecutionRef &&
			latest.childState === input.childState
		) {
			return;
		}
		await this.record(input);
	}

	async reconcile(take = 100): Promise<void> {
		for (const event of await this.repository.findPending(take)) await this.deliver(event);
	}

	private async deliver(event: AgentDepartmentWorkflowEvent): Promise<void> {
		try {
			await this.invocations.outcome({
				projectId: event.projectId,
				invocationId: event.invocationId,
				eventId: event.eventId,
				ownerSequence: String(event.id),
				occurredAt: event.occurredAt.toISOString(),
				...(typeof event.retryOfExecutionRef === 'string' && event.retryOfExecutionRef
					? { retryOfExecutionRef: event.retryOfExecutionRef }
					: {}),
				childState: event.childState,
				ownerExecutionRef: event.ownerExecutionRef,
				actualWorkflowVersion: event.actualWorkflowVersion,
			});
			await this.inputs.delete(event.projectId, event.invocationId);
			await this.repository.markDelivered(event.id);
		} catch (error) {
			this.logger.warn('Department workflow outcome delivery remains pending', {
				invocationId: event.invocationId,
				eventId: event.eventId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
