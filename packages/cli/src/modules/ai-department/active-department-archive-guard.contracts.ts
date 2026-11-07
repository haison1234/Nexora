import { Service } from '@n8n/di';
import type { OperationContext } from '@n8n/db';

export type DepartmentArchiveBlocker = { kind: 'work' | 'meeting'; id: string };

export type DepartmentArchiveCheck = {
	active: boolean;
	count: number;
	blockers: DepartmentArchiveBlocker[];
};

export abstract class ActiveDepartmentArchiveGuard {
	abstract forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck>;
	abstract forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck>;
}

@Service()
export class ActiveDepartmentArchiveGuardProxy extends ActiveDepartmentArchiveGuard {
	private implementation?: ActiveDepartmentArchiveGuard;

	register(implementation: ActiveDepartmentArchiveGuard) {
		this.implementation = implementation;
	}

	isRegistered() {
		return this.implementation !== undefined;
	}

	async forDepartment(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck> {
		if (!this.implementation) throw new Error('Department archive guard is unavailable');
		return await this.implementation.forDepartment(projectId, departmentId, ctx);
	}

	async forMember(
		projectId: string,
		memberId: string,
		ctx: OperationContext,
	): Promise<DepartmentArchiveCheck> {
		if (!this.implementation) throw new Error('Department archive guard is unavailable');
		return await this.implementation.forMember(projectId, memberId, ctx);
	}
}
