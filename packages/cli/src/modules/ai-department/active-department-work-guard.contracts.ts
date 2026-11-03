import { Service } from '@n8n/di';
import type { OperationContext } from '@n8n/db';

export type ActiveWorkCheck = { active: boolean; workIds: string[] };

/** Feature 003 registers this contract before archive can be enabled. */
export abstract class ActiveDepartmentWorkGuard {
	abstract forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck>;
	abstract forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck>;
}

@Service()
export class ActiveDepartmentWorkGuardProxy extends ActiveDepartmentWorkGuard {
	private implementation?: ActiveDepartmentWorkGuard;

	register(implementation: ActiveDepartmentWorkGuard) {
		this.implementation = implementation;
	}

	isRegistered() {
		return this.implementation !== undefined;
	}

	async forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck> {
		if (!this.implementation) throw new Error('Department work guard is unavailable');
		return await this.implementation.forDepartment(projectId, departmentId, ctx);
	}

	async forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<ActiveWorkCheck> {
		if (!this.implementation) throw new Error('Department work guard is unavailable');
		return await this.implementation.forMember(projectId, memberId, ctx);
	}
}
