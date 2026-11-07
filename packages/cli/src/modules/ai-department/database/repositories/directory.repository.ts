import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, In, type EntityManager } from '@n8n/typeorm';

import { Department } from '../entities/department.entity';
import { Member } from '../entities/member.entity';
import { CommandReceipt } from '../entities/command-receipt.entity';
import { DirectoryChange } from '../entities/directory-change.entity';
import { ExecutorBinding } from '../entities/executor-binding.entity';
import { ExecutorBindingRevision } from '../entities/executor-binding-revision.entity';
import { DepartmentAdmissionFence } from '../entities/department-admission-fence.entity';

class DepartmentTable extends BaseRepository<Department> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(Department, dataSource.manager, runner);
	}
}

@Service()
export class DirectoryRepository {
	private readonly departments: DepartmentTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.departments = new DepartmentTable(dataSource, runner);
	}

	private manager(ctx: OperationContext): EntityManager {
		return this.departments.managerFor(ctx);
	}

	async listDepartments(projectId: string, includeArchived: boolean, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(Department, {
			where: { projectId, ...(includeArchived ? {} : { archived: false }) },
			order: { name: 'ASC', id: 'ASC' },
		});
	}

	async listMembersByProject(projectId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(Member, { where: { projectId } });
	}

	async listBindingsForProject(projectId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(ExecutorBinding, { where: { projectId } });
	}

	async findDepartment(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(Department, { id: departmentId, projectId });
	}

	async findActiveDepartmentByName(
		projectId: string,
		normalizedName: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(Department, {
			projectId,
			normalizedName,
			archived: false,
		});
	}

	async saveDepartment(department: Department, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(Department, department);
		await manager.increment(
			Department,
			{ id: saved.id, projectId: saved.projectId },
			'projectionSequence',
			1,
		);
		await manager
			.createQueryBuilder()
			.insert()
			.into(DepartmentAdmissionFence)
			.values({ projectId: saved.projectId, departmentId: saved.id, sequence: 0 })
			.orIgnore()
			.execute();
		return saved;
	}

	async acquireAdmissionFence(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(DepartmentAdmissionFence)
			.values({ projectId, departmentId, sequence: 0 })
			.orIgnore()
			.execute();
		await manager.increment(DepartmentAdmissionFence, { projectId, departmentId }, 'sequence', 1);
	}

	async listMembers(
		projectId: string,
		departmentId: string,
		includeArchived: boolean,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).find(Member, {
			where: { projectId, departmentId, ...(includeArchived ? {} : { archived: false }) },
			order: { name: 'ASC', id: 'ASC' },
		});
	}

	async findMember(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(Member, { id: memberId, projectId, departmentId });
	}

	async listMembersWithBindings(
		projectId: string,
		departmentId: string,
		includeArchived: boolean,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).find(Member, {
			where: { projectId, departmentId, ...(includeArchived ? {} : { archived: false }) },
			order: { name: 'ASC', id: 'ASC' },
		});
	}

	async saveMember(member: Member, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(Member, member);
		await manager.increment(
			Department,
			{ id: member.departmentId, projectId: member.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	async listMemberExpertiseTags(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		const member = await this.manager(ctx).findOneBy(Member, {
			id: memberId,
			projectId,
			departmentId,
		});
		return member?.expertiseTags ?? null;
	}

	async saveMemberExpertise(member: Member, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(Member, member);
		await manager.increment(
			Department,
			{ id: saved.departmentId, projectId: saved.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	async findBinding(projectId: string, memberId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(ExecutorBinding, { projectId, memberId });
	}

	async findLatestBindingVersion(memberId: string, ctx: OperationContext = {}) {
		const revision = await this.manager(ctx).findOne(ExecutorBindingRevision, {
			select: ['version'],
			where: { memberId },
			order: { version: 'DESC' },
		});
		return revision?.version ?? null;
	}

	async saveBinding(binding: ExecutorBinding, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(ExecutorBinding, binding);
		const member = await manager.findOneBy(Member, {
			id: binding.memberId,
			projectId: binding.projectId,
		});
		if (member)
			await manager.increment(
				Department,
				{ id: member.departmentId, projectId: binding.projectId },
				'projectionSequence',
				1,
			);
		return saved;
	}

	async deleteBinding(projectId: string, memberId: string, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const member = await manager.findOneBy(Member, { id: memberId, projectId });
		await manager.delete(ExecutorBinding, { projectId, memberId });
		if (member)
			await manager.increment(
				Department,
				{ id: member.departmentId, projectId },
				'projectionSequence',
				1,
			);
	}

	async listBindings(projectId: string, memberIds: string[], ctx: OperationContext = {}) {
		if (memberIds.length === 0) return [];
		return await this.manager(ctx).find(ExecutorBinding, {
			where: { projectId, memberId: In(memberIds) },
		});
	}

	async saveBindingRevision(revision: ExecutorBindingRevision, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(ExecutorBindingRevision, revision);
	}

	async findReceipt(
		projectId: string,
		actorId: string,
		requestId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(CommandReceipt, { projectId, actorId, requestId });
	}

	async saveReceipt(receipt: CommandReceipt, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(CommandReceipt, receipt);
	}

	async saveChange(change: DirectoryChange, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(DirectoryChange, change);
	}
}
