import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkWakeLaneDrain1793694522771';

describe('AddAiDepartmentWorkWakeLaneDrain migration', () => {
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

	it('adds and removes the active lane attempt column', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_wake_lane`;
		const attemptTableName = `${context.tablePrefix}ai_department_work_attempt`;
		let table = await context.queryRunner.getTable(tableName);
		let attemptTable = await context.queryRunner.getTable(attemptTableName);
		expect(table?.columns.map((column) => column.name)).toContain('activeAttemptId');
		expect(
			attemptTable?.indices.some(
				(index) =>
					index.columnNames.includes('initiatingUserId') &&
					index.columnNames.includes('bindingVersion'),
			),
		).toBe(true);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		attemptTable = await context.queryRunner.getTable(attemptTableName);
		expect(table?.columns.map((column) => column.name)).not.toContain('activeAttemptId');
		expect(
			attemptTable?.indices.some(
				(index) =>
					index.columnNames.includes('initiatingUserId') &&
					index.columnNames.includes('bindingVersion'),
			),
		).toBe(false);
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
