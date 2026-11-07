import { BaseRepository, TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, IsNull } from '@n8n/typeorm';

import { AgentDepartmentWorkflowEvent } from '../entities/agent-department-workflow-event.entity';

class AgentDepartmentWorkflowEventTable extends BaseRepository<AgentDepartmentWorkflowEvent> {
	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		super(AgentDepartmentWorkflowEvent, dataSource.manager, transactionRunner);
	}
}

@Service()
export class AgentDepartmentWorkflowEventRepository {
	private readonly table: AgentDepartmentWorkflowEventTable;

	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		this.table = new AgentDepartmentWorkflowEventTable(dataSource, transactionRunner);
	}

	async append(
		input: Omit<
			AgentDepartmentWorkflowEvent,
			'id' | 'createdAt' | 'updatedAt' | 'deliveredAt' | 'setUpdateDate'
		>,
	): Promise<AgentDepartmentWorkflowEvent> {
		return await this.table.save(
			Object.assign(new AgentDepartmentWorkflowEvent(), input, {
				deliveredAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			}),
		);
	}

	async findPending(take: number): Promise<AgentDepartmentWorkflowEvent[]> {
		return await this.table.find({
			where: { deliveredAt: IsNull() },
			order: { id: 'ASC' },
			take,
		});
	}

	async findLatestForInvocation(
		invocationId: string,
	): Promise<AgentDepartmentWorkflowEvent | null> {
		return await this.table.findOne({ where: { invocationId }, order: { id: 'DESC' } });
	}

	async markDelivered(id: number): Promise<void> {
		await this.table.update({ id, deliveredAt: IsNull() }, { deliveredAt: new Date() });
	}
}
