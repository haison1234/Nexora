import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { WorkHandoffService } from './work-handoff.service';

@SystemTask()
export class AiDepartmentWorkHandoffReconciliationTask {
	readonly name = 'ai-department-work-handoff-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(30);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 30 },
	});

	constructor(private readonly handoffs: WorkHandoffService) {}

	async run(signal: AbortSignal): Promise<void> {
		await this.handoffs.reconcilePending(signal);
	}
}
