import { Service } from '@n8n/di';
import type { OperationContext } from '@n8n/db';

import {
	ActiveDepartmentWorkGuard,
	type ActiveWorkCheck,
} from '../active-department-work-guard.contracts';
import { WorkRepository } from '../database/repositories/work.repository';

@Service()
export class ActiveDepartmentWorkGuardImpl extends ActiveDepartmentWorkGuard {
	constructor(private readonly repository: WorkRepository) {
		super();
	}

	async forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck> {
		await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
		const work = await this.repository.listActiveWork(projectId, departmentId, undefined, ctx);
		return { active: work.length > 0, workIds: work.map(({ id }) => id) };
	}

	async forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck> {
		const member = await this.repository.findMemberById(projectId, memberId, ctx);
		if (!member) return { active: false, workIds: [] };
		await this.repository.acquireAdmissionFence(projectId, member.departmentId, ctx);
		const work = await this.repository.listActiveWork(
			projectId,
			member.departmentId,
			memberId,
			ctx,
		);
		return { active: work.length > 0, workIds: work.map(({ id }) => id) };
	}
}
