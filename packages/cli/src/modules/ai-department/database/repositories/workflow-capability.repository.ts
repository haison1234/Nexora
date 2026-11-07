import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, type EntityManager } from '@n8n/typeorm';

import { CommandReceipt } from '../entities/command-receipt.entity';
import { Department } from '../entities/department.entity';
import { DirectoryChange } from '../entities/directory-change.entity';
import { Member } from '../entities/member.entity';
import { WorkflowCapability } from '../entities/workflow-capability.entity';
import { WorkflowCapabilityRevision } from '../entities/workflow-capability-revision.entity';

class WorkflowCapabilityTable extends BaseRepository<WorkflowCapability> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(WorkflowCapability, dataSource.manager, runner);
	}
}

@Service()
export class WorkflowCapabilityRepository {
	private readonly table: WorkflowCapabilityTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.table = new WorkflowCapabilityTable(dataSource, runner);
	}

	private manager(ctx: OperationContext): EntityManager {
		return this.table.managerFor(ctx);
	}

	async findDepartment(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(Department, { id: departmentId, projectId });
	}

	async findMember(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(Member, {
			id: memberId,
			projectId,
			departmentId,
			archived: false,
		});
	}

	async list(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).find(WorkflowCapability, {
			where: { projectId, departmentId, memberId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async find(projectId: string, capabilityId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkflowCapability, {
			id: capabilityId,
			projectId,
		});
	}

	async findForWorkflow(
		projectId: string,
		memberId: string,
		workflowId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkflowCapability, {
			projectId,
			memberId,
			workflowId,
		});
	}

	async listEnabledWorkflowIds(projectId: string, departmentId: string, memberId: string) {
		const rows = await this.manager({}).find(WorkflowCapability, {
			select: { workflowId: true },
			where: { projectId, departmentId, memberId, enabled: true },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
		return rows.map(({ workflowId }) => workflowId);
	}

	async save(capability: WorkflowCapability, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkflowCapability, capability);
	}

	async saveRevision(revision: WorkflowCapabilityRevision, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkflowCapabilityRevision, revision);
	}

	async updateAtVersion(
		projectId: string,
		capabilityId: string,
		expectedVersion: number,
		patch: Partial<WorkflowCapability>,
		ctx: OperationContext = {},
	) {
		const result = await this.manager(ctx).update(
			WorkflowCapability,
			{ id: capabilityId, projectId, version: expectedVersion },
			patch,
		);
		return result.affected === 1 ? await this.find(projectId, capabilityId, ctx) : null;
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
