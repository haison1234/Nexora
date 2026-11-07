import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { WorkReleaseService } from './work-release.service';

@SystemTask()
export class AiDepartmentWorkReleaseReconciliationTask {
	readonly name = 'ai-department-work-release-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(30);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 30 },
	});

	constructor(private readonly releases: WorkReleaseService) {}

	async run(signal: AbortSignal): Promise<void> {
		await this.releases.reconcilePending(signal);
	}
}
