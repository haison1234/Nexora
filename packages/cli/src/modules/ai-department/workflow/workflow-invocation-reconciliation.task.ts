import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { WorkflowInvocationService } from './workflow-invocation.service';

@SystemTask()
export class WorkflowInvocationReconciliationTask {
	readonly name = 'ai-department-workflow-invocation-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(30);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 30 },
	});

	constructor(private readonly invocations: WorkflowInvocationService) {}

	async run(): Promise<void> {
		await this.invocations.reconcileOwnerAcceptance();
		await this.invocations.reconcileChildSnapshots();
		await this.invocations.reconcileRevokedAuthority();
		await this.invocations.reconcileRequestedStops();
	}
}
