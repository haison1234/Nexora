import { clusterTarget, intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskSchedule } from '@n8n/decorators';

import { MeetingRepository } from './database/repositories/meeting.repository';
import { MeetingService } from './meeting.service';

@SystemTask()
export class AiDepartmentMeetingReconciliationTask {
	readonly name = 'ai-department-meeting-reconciliation';
	readonly schedule: SystemTaskSchedule = intervalFromSeconds(15);
	readonly target = clusterTarget({
		scheduler: { retryOnFailure: true },
		leaderTimer: { runOnTakeover: true, retryDelaySeconds: 15 },
	});

	constructor(
		private readonly meetings: MeetingRepository,
		private readonly meetingService: MeetingService,
	) {}

	async run(signal: AbortSignal): Promise<void> {
		for (const item of await this.meetings.listDueCollectionMeetings(new Date(), 100, {})) {
			if (signal.aborted) return;
			await this.meetingService.freezeCollectionAtDeadline(
				item.projectId,
				item.departmentId,
				item.meetingId,
			);
		}
		for (const item of await this.meetings.listReconciliationInvocationIds(100, {})) {
			if (signal.aborted) return;
			await this.meetingService.reconcileInvocation(
				item.projectId,
				item.departmentId,
				item.meetingId,
				item.invocationId,
			);
		}
	}
}
