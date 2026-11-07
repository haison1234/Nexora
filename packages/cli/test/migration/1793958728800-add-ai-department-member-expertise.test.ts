import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentMemberExpertise1793958728800';

describe('AddAiDepartmentMemberExpertise migration', () => {
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

	it('adds and removes the default expertise field', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_member`;
		let column = (await context.queryRunner.getTable(tableName))?.columns.find(
			({ name }) => name === 'expertiseTags',
		);
		expect(column).toBeDefined();
		expect(column?.isNullable).toBe(false);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		column = (await context.queryRunner.getTable(tableName))?.columns.find(
			({ name }) => name === 'expertiseTags',
		);
		expect(column).toBeUndefined();
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
