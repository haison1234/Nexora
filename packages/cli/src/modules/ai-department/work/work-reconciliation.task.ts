import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { WorkService } from './work.service';

@SystemTask()
export class AiDepartmentWorkReconciliationTask {
	readonly name = 'ai-department-work-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(30);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 30 },
	});

	constructor(private readonly workService: WorkService) {}

	async run(signal: AbortSignal): Promise<void> {
		await this.workService.reconcileAttempts(signal);
	}
}
