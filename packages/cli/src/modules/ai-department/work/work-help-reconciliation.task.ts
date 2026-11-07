import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { WorkHelpService } from './work-help.service';

@SystemTask()
export class AiDepartmentWorkHelpReconciliationTask {
	readonly name = 'ai-department-work-help-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(30);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 30 },
	});

	constructor(private readonly help: WorkHelpService) {}

	async run(signal: AbortSignal): Promise<void> {
		await this.help.reconcilePending(signal);
	}
}
