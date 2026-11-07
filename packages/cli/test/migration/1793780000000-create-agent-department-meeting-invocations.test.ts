import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAgentDepartmentMeetingInvocations1793780000000';

describe('CreateAgentDepartmentMeetingInvocations migration', () => {
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

	it('creates and drops the owner invocation table with durable stop state', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}agent_department_meeting_invocation`;
		let table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining(['stopCommandId', 'stopPayloadHash', 'stopRequestedAt']),
		);
		expect(table?.checks.some((check) => check.expression?.includes('stopping'))).toBe(true);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table).toBeUndefined();
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
