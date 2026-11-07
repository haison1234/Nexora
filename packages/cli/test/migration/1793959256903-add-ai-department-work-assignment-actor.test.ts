import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkAssignmentActor1793959256903';

describe('AddAiDepartmentWorkAssignmentActor migration', () => {
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

	it('adds and removes the nullable user reference', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_item`;
		let table = await context.queryRunner.getTable(tableName);
		const column = table?.columns.find(({ name }) => name === 'assignedByUserId');
		expect(column?.isNullable).toBe(true);
		expect(
			table?.foreignKeys.some(
				({ columnNames, referencedTableName }) =>
					columnNames.includes('assignedByUserId') &&
					referencedTableName === `${context.tablePrefix}user`,
			),
		).toBe(true);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.some(({ name }) => name === 'assignedByUserId')).toBe(false);
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
