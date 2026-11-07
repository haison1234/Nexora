import { Logger } from '@n8n/backend-common';
import { OnShutdown } from '@n8n/decorators';
import { Service } from '@n8n/di';

import { AgentDepartmentExecutionAdapter } from './agent-department-execution.adapter';
import { AgentDepartmentMeetingInvocationOwnerService } from './agent-department-meeting-invocation-owner.service';
import { AgentDepartmentConsultationInvocationOwnerService } from './agent-department-consultation-invocation-owner.service';

const RECONCILE_INTERVAL_MS = 5_000;

@Service()
export class AgentDepartmentStopReconciler {
	private timer?: NodeJS.Timeout;
	private running = false;

	constructor(
		private readonly adapter: AgentDepartmentExecutionAdapter,
		private readonly meetingInvocations: AgentDepartmentMeetingInvocationOwnerService,
		private readonly consultationInvocations: AgentDepartmentConsultationInvocationOwnerService,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(async () => {
			await this.reconcile();
		}, RECONCILE_INTERVAL_MS);
		this.timer.unref();
		this.reconcile().catch((error: unknown) => {
			this.logger.warn('[Agents] Department stop reconciliation failed', { error });
		});
	}

	@OnShutdown()
	stop(): void {
		clearInterval(this.timer);
		this.timer = undefined;
	}

	private async reconcile(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			await this.adapter.reconcilePendingStops();
			await this.meetingInvocations.reconcilePendingStops();
			await this.meetingInvocations.reconcilePendingEnqueues();
			await this.consultationInvocations.reconcilePendingStops();
			await this.consultationInvocations.reconcilePendingEnqueues();
		} catch (error) {
			this.logger.warn('[Agents] Department stop reconciliation failed', { error });
		} finally {
			this.running = false;
		}
	}
}
