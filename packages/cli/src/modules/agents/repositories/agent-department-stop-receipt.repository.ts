import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

import { AgentDepartmentStopReceipt } from '../entities/agent-department-stop-receipt.entity';

class AgentDepartmentStopReceiptTable extends BaseRepository<AgentDepartmentStopReceipt> {
	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		super(AgentDepartmentStopReceipt, dataSource.manager, transactionRunner);
	}
}

@Service()
export class AgentDepartmentStopReceiptRepository {
	private readonly table: AgentDepartmentStopReceiptTable;

	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		this.table = new AgentDepartmentStopReceiptTable(dataSource, transactionRunner);
	}

	async record(
		input: Omit<
			AgentDepartmentStopReceipt,
			'thread' | 'createdAt' | 'updatedAt' | 'confirmedAt' | 'status' | 'setUpdateDate'
		>,
		ctx: OperationContext = {},
	): Promise<'accepted' | 'duplicate' | 'rejected'> {
		const manager = this.table.managerFor(ctx);
		const existing = await manager.findOneBy(AgentDepartmentStopReceipt, {
			commandId: input.commandId,
		});
		if (existing) {
			return existing.payloadHash === input.payloadHash &&
				existing.projectId === input.projectId &&
				existing.threadId === input.threadId &&
				existing.ownerExecutionRef === input.ownerExecutionRef
				? 'duplicate'
				: 'rejected';
		}
		let inserted = false;
		try {
			const now = new Date();
			const result = await manager
				.createQueryBuilder()
				.insert()
				.into(AgentDepartmentStopReceipt)
				.values({ ...input, status: 'pending', createdAt: now, updatedAt: now })
				.orIgnore()
				.execute();
			inserted = result.identifiers.length > 0;
		} catch (error) {
			const raced = await manager.findOneBy(AgentDepartmentStopReceipt, {
				commandId: input.commandId,
			});
			if (!raced) throw error;
		}
		const saved = await manager.findOneBy(AgentDepartmentStopReceipt, {
			commandId: input.commandId,
		});
		if (!saved) return 'rejected';
		if (
			saved.payloadHash !== input.payloadHash ||
			saved.projectId !== input.projectId ||
			saved.threadId !== input.threadId ||
			saved.ownerExecutionRef !== input.ownerExecutionRef
		)
			return 'rejected';
		return inserted ? 'accepted' : 'duplicate';
	}

	async findPending(take: number): Promise<AgentDepartmentStopReceipt[]> {
		return await this.table.find({
			where: { status: 'pending' },
			order: { createdAt: 'ASC', commandId: 'ASC' },
			take,
		});
	}

	async findByCommandId(commandId: string): Promise<AgentDepartmentStopReceipt | null> {
		return await this.table.findOneBy({ commandId });
	}

	async hasPendingForOwnerExecutionRef(input: {
		projectId: string;
		agentId: string;
		threadId: string;
		ownerExecutionRef: string;
	}): Promise<boolean> {
		return await this.table.existsBy({ ...input, status: 'pending' });
	}

	async markConfirmed(commandId: string): Promise<void> {
		await this.table.update(
			{ commandId, status: 'pending' },
			{ status: 'confirmed', confirmedAt: new Date() },
		);
	}
}
