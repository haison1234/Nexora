import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkReviewRoundStatus1793933004587';

describe('AddAiDepartmentWorkReviewRoundStatus migration', () => {
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

	it('adds and removes review round status fields', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_attempt`;
		let columns = (await context.queryRunner.getTable(tableName))?.columns.map(
			(column) => column.name,
		);
		expect(columns).toEqual(expect.arrayContaining(['reviewRoundStatus', 'reviewRoundClosedAt']));
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		columns = (await context.queryRunner.getTable(tableName))?.columns.map((column) => column.name);
		expect(columns).not.toEqual(
			expect.arrayContaining(['reviewRoundStatus', 'reviewRoundClosedAt']),
		);
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
