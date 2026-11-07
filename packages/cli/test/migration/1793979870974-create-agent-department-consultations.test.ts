import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAgentDepartmentConsultations1793979870974';

describe('CreateAgentDepartmentConsultations migration', () => {
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

	afterAll(async () => {
		await Container.get(DbConnection).close();
	});

	it('creates and drops durable consultation and stop-gate tables', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const invocationName = `${context.tablePrefix}agent_department_consultation_invocation`;
		const gateName = `${context.tablePrefix}agent_department_consultation_invocation_gate`;
		let invocation = await context.queryRunner.getTable(invocationName);
		let gate = await context.queryRunner.getTable(gateName);
		expect(invocation?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				'helpRequestId',
				'requesterMemberId',
				'recipientMemberId',
				'bindingVersion',
				'commandKey',
				'contextHash',
				'deadlineAt',
				'resultHash',
			]),
		);
		expect(invocation?.checks.some((check) => check.expression?.includes('stopping'))).toBe(true);
		expect(gate?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining(['commandKey', 'inputHash', 'cancelCommandId']),
		);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		invocation = await context.queryRunner.getTable(invocationName);
		gate = await context.queryRunner.getTable(gateName);
		expect(invocation).toBeUndefined();
		expect(gate).toBeUndefined();
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
