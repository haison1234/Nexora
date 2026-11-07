import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddWaitingForChildrenToAiDepartmentWorkReleaseIntent1793984000000';

describe('AddWaitingForChildrenToAiDepartmentWorkReleaseIntent migration', () => {
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

	it('adds a false default and drops the marker on rollback', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_work_release_intent`;
		let table = await context.queryRunner.getTable(tableName);
		const marker = table?.columns.find((column) => column.name === 'waitingForChildren');
		expect(marker?.isNullable).toBe(false);
		expect(marker?.default).toBe('false');
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.some((column) => column.name === 'waitingForChildren')).toBe(false);
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
