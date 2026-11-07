import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, In, IsNull, Not, type EntityManager } from '@n8n/typeorm';

import { Department } from '../entities/department.entity';
import { ExecutorBinding } from '../entities/executor-binding.entity';
import { Member } from '../entities/member.entity';
import { WorkAttempt } from '../entities/work-attempt.entity';
import { WorkClaim } from '../entities/work-claim.entity';
import { WorkItem } from '../entities/work-item.entity';
import { WorkflowCapability } from '../entities/workflow-capability.entity';
import { WorkflowCapabilityRevision } from '../entities/workflow-capability-revision.entity';
import { WorkflowInvocation } from '../entities/workflow-invocation.entity';
import { WorkflowInvocationReceipt } from '../entities/workflow-invocation-receipt.entity';

class WorkflowInvocationTable extends BaseRepository<WorkflowInvocation> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(WorkflowInvocation, dataSource.manager, runner);
	}
}

@Service()
export class WorkflowInvocationRepository {
	private readonly table: WorkflowInvocationTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.table = new WorkflowInvocationTable(dataSource, runner);
	}

	private manager(ctx: OperationContext): EntityManager {
		return this.table.managerFor(ctx);
	}

	async findAttempt(projectId: string, attemptId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkAttempt, { projectId, id: attemptId });
	}

	async findDepartment(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(Department, { projectId, id: departmentId });
	}

	async findMember(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(Member, {
			projectId,
			departmentId,
			id: memberId,
			archived: false,
		});
	}

	async findBinding(projectId: string, memberId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(ExecutorBinding, { projectId, memberId });
	}

	async findWork(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkItem, {
			projectId,
			departmentId,
			id: workId,
		});
	}

	async findClaim(projectId: string, attemptId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkClaim, { projectId, attemptId });
	}

	async findCapability(projectId: string, capabilityId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkflowCapability, { projectId, id: capabilityId });
	}

	async findCapabilityRevision(
		projectId: string,
		capabilityId: string,
		version: number,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkflowCapabilityRevision, {
			projectId,
			capabilityId,
			version,
		});
	}

	async findByAttemptRequestId(attemptId: string, requestId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkflowInvocation, { attemptId, requestId });
	}

	async insertIfAbsent(invocation: WorkflowInvocation, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(WorkflowInvocation)
			.values(invocation)
			.orIgnore()
			.execute();
		const persisted = await manager.findOneBy(WorkflowInvocation, {
			attemptId: invocation.attemptId,
			requestId: invocation.requestId,
		});
		return persisted?.id === invocation.id;
	}

	async findInvocation(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkflowInvocation, { projectId, id: invocationId });
	}

	async findNeedingOwnerReconciliation(take: number): Promise<WorkflowInvocation[]> {
		return await this.table.find({
			where: { dispatchState: In(['pending', 'unknown']) },
			order: { updatedAt: 'ASC', id: 'ASC' },
			take,
		});
	}

	async findNeedingStopReconciliation(take: number): Promise<WorkflowInvocation[]> {
		return await this.table.find({
			where: {
				dispatchState: 'acknowledged',
				cancelRequestedAt: Not(IsNull()),
				childState: In(['running', 'waiting', 'retrying', 'unknown']),
			},
			order: { updatedAt: 'ASC', id: 'ASC' },
			take,
		});
	}

	async findNeedingAuthorityReconciliation(take: number): Promise<WorkflowInvocation[]> {
		return await this.table.find({
			where: {
				dispatchState: 'acknowledged',
				cancelRequestedAt: IsNull(),
				childState: In(['running', 'waiting', 'retrying', 'unknown']),
			},
			order: { updatedAt: 'ASC', id: 'ASC' },
			take,
		});
	}

	async findNeedingChildSnapshotReconciliation(take: number): Promise<WorkflowInvocation[]> {
		return await this.table.find({
			where: {
				dispatchState: 'acknowledged',
				childState: In(['running', 'waiting', 'retrying', 'unknown']),
			},
			order: { updatedAt: 'ASC', id: 'ASC' },
			take,
		});
	}

	async updateAtVersion(
		projectId: string,
		invocationId: string,
		expectedVersion: number,
		patch: Partial<WorkflowInvocation>,
		ctx: OperationContext = {},
	) {
		const result = await this.manager(ctx).update(
			WorkflowInvocation,
			{ projectId, id: invocationId, version: expectedVersion },
			patch,
		);
		return result.affected === 1 ? await this.findInvocation(projectId, invocationId, ctx) : null;
	}

	async findReceipt(eventId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkflowInvocationReceipt, { eventId });
	}

	async saveReceipt(receipt: WorkflowInvocationReceipt, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkflowInvocationReceipt, receipt);
	}

	async insertReceiptIfAbsent(receipt: WorkflowInvocationReceipt, ctx: OperationContext = {}) {
		const result = await this.manager(ctx)
			.createQueryBuilder()
			.insert()
			.into(WorkflowInvocationReceipt)
			.values(receipt)
			.orIgnore()
			.execute();
		return result.identifiers.length > 0;
	}

	async findLatestReceipt(invocationId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOne(WorkflowInvocationReceipt, {
			where: { invocationId },
			order: { ownerSequence: 'DESC' },
		});
	}

	async hasReceiptForOwnerExecution(
		invocationId: string,
		ownerExecutionRef: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).existsBy(WorkflowInvocationReceipt, [
			{ invocationId, ownerExecutionRef },
			{ invocationId, retryOfExecutionRef: ownerExecutionRef },
		]);
	}
}
