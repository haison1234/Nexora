import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAgentDepartmentMeetingInvocationGates1793781000000';

describe('CreateAgentDepartmentMeetingInvocationGates migration', () => {
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

	it('creates and drops the invocation gate table', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}agent_department_meeting_invocation_gate`;
		let table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining(['projectId', 'invocationId', 'requestKey', 'inputHash', 'state']),
		);
		expect(table?.checks.some((check) => check.expression?.includes('cancelled'))).toBe(true);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table).toBeUndefined();
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
