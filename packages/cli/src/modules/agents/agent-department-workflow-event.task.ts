import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { AgentDepartmentWorkflowEventService } from './agent-department-workflow-event.service';

@SystemTask()
export class AgentDepartmentWorkflowEventTask {
	readonly name = 'agent-department-workflow-event';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(5);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true },
	});

	constructor(private readonly events: AgentDepartmentWorkflowEventService) {}

	async run(): Promise<void> {
		await this.events.reconcile();
	}
}
