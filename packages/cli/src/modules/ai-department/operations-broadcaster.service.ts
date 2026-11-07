import type { PushPayload } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { OnPubSubEvent } from '@n8n/decorators';
import { Service } from '@n8n/di';
import { InstanceSettings } from 'n8n-core';

import { Push } from '@/push';
import type { PubSubCommandMap } from '@/scaling/pubsub/pubsub.event-map';
import { Publisher } from '@/scaling/pubsub/publisher.service';
import { AgentPushRecipientsService } from '@/modules/agents/agent-push-recipients.service';
import { DirectoryRepository } from './database/repositories/directory.repository';

type OperationsUpdate = PushPayload<'aiDepartmentOperationsUpdated'>;

@Service()
export class AiDepartmentOperationsBroadcaster {
	constructor(
		private readonly logger: Logger,
		private readonly recipients: AgentPushRecipientsService,
		private readonly directory: DirectoryRepository,
		private readonly push: Push,
		private readonly publisher: Publisher,
		private readonly instanceSettings: InstanceSettings,
	) {
		this.logger = this.logger.scoped('ai-department');
	}

	async notifyCurrent(projectId: string, departmentId: string): Promise<void> {
		try {
			const department = await this.directory.findDepartment(projectId, departmentId);
			if (!department) return;
			this.notify({ projectId, departmentId, revision: department.projectionSequence });
		} catch (error) {
			this.logger.warn('Failed to read department revision for operations update', {
				projectId,
				departmentId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	notify(data: OperationsUpdate): void {
		void this.send(data).catch((error: unknown) => {
			this.logger.warn('Failed to send department operations update', {
				projectId: data.projectId,
				departmentId: data.departmentId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}

	private async send(data: OperationsUpdate): Promise<void> {
		const userIds = await this.recipients.getProjectReaders(data.projectId);
		if (userIds.length === 0) return;
		this.push.sendToUsers({ type: 'aiDepartmentOperationsUpdated', data }, userIds);
		if (this.instanceSettings.isWorker || this.instanceSettings.isMultiMain) {
			await this.publisher.publishCommand({
				command: 'relay-ai-department-operations-update',
				payload: { data },
			});
		}
	}

	@OnPubSubEvent('relay-ai-department-operations-update', { instanceType: 'main' })
	async handleRelay({ data }: PubSubCommandMap['relay-ai-department-operations-update']) {
		const userIds = await this.recipients.getProjectReaders(data.projectId);
		if (userIds.length > 0) {
			this.push.sendToUsers({ type: 'aiDepartmentOperationsUpdated', data }, userIds);
		}
	}
}
