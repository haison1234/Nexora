import { Service } from '@n8n/di';
import type { OperationContext } from '@n8n/db';

import { ActiveDepartmentWorkGuardProxy } from './active-department-work-guard.contracts';
import {
	ActiveDepartmentArchiveGuard,
	type DepartmentArchiveCheck,
} from './active-department-archive-guard.contracts';
import { MeetingRepository } from './database/repositories/meeting.repository';

@Service()
export class ActiveDepartmentArchiveGuardImpl extends ActiveDepartmentArchiveGuard {
	constructor(
		private readonly workGuard: ActiveDepartmentWorkGuardProxy,
		private readonly meetings: MeetingRepository,
	) {
		super();
	}

	async forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck> {
		if (!this.workGuard.isRegistered()) throw new Error('Department work guard is unavailable');
		await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
		const [work, meetingIds] = await Promise.all([
			this.workGuard.forDepartment(projectId, departmentId, ctx),
			this.meetings.listArchiveBlockingMeetingIds(projectId, departmentId, undefined, ctx),
		]);
		return this.combine(work.workIds, meetingIds);
	}

	async forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck> {
		if (!this.workGuard.isRegistered()) throw new Error('Department work guard is unavailable');
		const work = await this.workGuard.forMember(projectId, memberId, ctx);
		const meetingIds = await this.meetings.listArchiveBlockingMeetingIds(
			projectId,
			undefined,
			memberId,
			ctx,
		);
		return this.combine(work.workIds, meetingIds);
	}

	private combine(workIds: string[], meetingIds: string[]): DepartmentArchiveCheck {
		const blockers = [
			...workIds.map((id) => ({ kind: 'work' as const, id })),
			...meetingIds.map((id) => ({ kind: 'meeting' as const, id })),
		];
		return { active: blockers.length > 0, count: blockers.length, blockers };
	}
}
