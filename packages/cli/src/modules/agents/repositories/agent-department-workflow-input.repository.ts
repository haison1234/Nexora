import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, IsNull } from '@n8n/typeorm';

import { AgentDepartmentWorkflowInput } from '../entities/agent-department-workflow-input.entity';

class AgentDepartmentWorkflowInputTable extends BaseRepository<AgentDepartmentWorkflowInput> {
	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		super(AgentDepartmentWorkflowInput, dataSource.manager, transactionRunner);
	}
}

@Service()
export class AgentDepartmentWorkflowInputRepository {
	private readonly table: AgentDepartmentWorkflowInputTable;

	constructor(dataSource: DataSource, transactionRunner: TransactionRunner) {
		this.table = new AgentDepartmentWorkflowInputTable(dataSource, transactionRunner);
	}

	async findForInvocation(projectId: string, invocationId: string) {
		return await this.table.findOneBy({ projectId, invocationId });
	}

	async insertIfAbsent(input: AgentDepartmentWorkflowInput, ctx: OperationContext = {}) {
		const result = await this.table
			.managerFor(ctx)
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentWorkflowInput)
			.values(input)
			.orIgnore()
			.execute();
		return result.identifiers.length > 0;
	}

	async deleteForInvocation(projectId: string, invocationId: string) {
		await this.table.delete({ projectId, invocationId });
	}

	async saveDispatchData(projectId: string, invocationId: string, encryptedDispatchData: string) {
		await this.table.update(
			{ projectId, invocationId, encryptedDispatchData: IsNull() },
			{ encryptedDispatchData, updatedAt: new Date() },
		);
	}
}
