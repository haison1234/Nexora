import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAgentDepartmentWorkflowDispatchData1793812340893';

describe('AddAgentDepartmentWorkflowDispatchData migration', () => {
	let dataSource: DataSource;

	beforeAll(async () => {
		await Container.get(DbConnection).init();
		dataSource = Container.get(DataSource);
		const initial = createTestMigrationContext(dataSource);
		try {
			await initial.queryRunner.clearDatabase();
		} finally {
			await initial.queryRunner.release();
		}
		await initDbUpToMigration(migrationName);
	});

	afterAll(async () => await Container.get(DbConnection).close());

	it('adds a nullable dispatch column and reverts it without deleting input rows', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}agent_department_workflow_input`;
		const table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).toContain('encryptedDispatchData');
		await context.runQuery(
			`INSERT INTO ${context.escape.tableName('agent_department_workflow_input')} \
			(id, projectId, invocationId, inputsRef, inputHash, encryptedInputs, createdAt, updatedAt, encryptedDispatchData) \
			VALUES (:id, :projectId, :invocationId, :inputsRef, :inputHash, :encryptedInputs, :createdAt, :updatedAt, :encryptedDispatchData)`,
			{
				id: 'invocation-a',
				projectId: 'project-a',
				invocationId: 'invocation-a',
				inputsRef: 'input-ref-a',
				inputHash: 'a'.repeat(64),
				encryptedInputs: 'encrypted-inputs',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				encryptedDispatchData: 'encrypted-dispatch',
			},
		);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		const revertedTable = await context.queryRunner.getTable(tableName);
		expect(revertedTable?.columns.map((column) => column.name)).not.toContain(
			'encryptedDispatchData',
		);
		const rows = await context.runQuery<{ id: string; encryptedInputs: string }[]>(
			`SELECT id, encryptedInputs FROM ${context.escape.tableName('agent_department_workflow_input')}`,
		);
		expect(rows).toEqual([{ id: 'invocation-a', encryptedInputs: 'encrypted-inputs' }]);
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
