import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddOwnerInvocationHashToAiDepartmentWorkHelpRequest1793982121241';

describe('AddOwnerInvocationHashToAiDepartmentWorkHelpRequest migration', () => {
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

	it('adds and removes the owner invocation hash', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_help_request`;
		let table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).toContain('ownerInvocationHash');
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).not.toContain('ownerInvocationHash');
		await context.queryRunner.release();
	});
});
