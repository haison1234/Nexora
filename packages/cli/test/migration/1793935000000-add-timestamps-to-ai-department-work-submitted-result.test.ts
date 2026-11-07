import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddTimestampsToAiDepartmentWorkSubmittedResult1793935000000';

describe('AddTimestampsToAiDepartmentWorkSubmittedResult migration', () => {
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

	it('adds and removes the timestamp columns', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_submitted_result`;
		let columns = (await context.queryRunner.getTable(tableName))?.columns.map(
			(column) => column.name,
		);
		expect(columns).toEqual(expect.arrayContaining(['createdAt', 'updatedAt']));
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		columns = (await context.queryRunner.getTable(tableName))?.columns.map((column) => column.name);
		expect(columns).not.toEqual(expect.arrayContaining(['createdAt', 'updatedAt']));
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
