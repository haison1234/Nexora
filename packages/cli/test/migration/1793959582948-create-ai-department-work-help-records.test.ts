import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAiDepartmentWorkHelpRecords1793959582948';

describe('CreateAiDepartmentWorkHelpRecords migration', () => {
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

	it('creates and removes scoped help request and response tables', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const requestTableName = `${context.tablePrefix}ai_department_work_help_request`;
		const responseTableName = `${context.tablePrefix}ai_department_work_help_response`;
		let requestTable = await context.queryRunner.getTable(requestTableName);
		let responseTable = await context.queryRunner.getTable(responseTableName);

		expect(requestTable?.columns.map(({ name }) => name)).toEqual(
			expect.arrayContaining([
				'question',
				'attemptedStepsJson',
				'expertiseTagsJson',
				'requestChainJson',
				'deadlineAt',
				'ownerReference',
				'version',
			]),
		);
		expect(requestTable?.indices.some(({ isUnique }) => isUnique)).toBe(true);
		expect(responseTable?.indices.some(({ isUnique }) => isUnique)).toBe(true);
		expect(
			responseTable?.foreignKeys.some(
				({ columnNames, referencedTableName }) =>
					columnNames.includes('helpRequestId') && referencedTableName === requestTableName,
			),
		).toBe(true);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		requestTable = await context.queryRunner.getTable(requestTableName);
		responseTable = await context.queryRunner.getTable(responseTableName);
		expect(requestTable).toBeUndefined();
		expect(responseTable).toBeUndefined();
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
