import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAiDepartmentWorkReviewRecords1793933640359';

describe('CreateAiDepartmentWorkReviewRecords migration', () => {
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

	it('creates and removes the review record tables and attempt references', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableNames = [
			'ai_department_work_review_policy_revision',
			'ai_department_work_submitted_result',
			'ai_department_work_review_round',
			'ai_department_work_review_stage_decision',
		];
		for (const name of tableNames) {
			expect(await context.queryRunner.hasTable(`${context.tablePrefix}${name}`)).toBe(true);
		}
		const attemptTable = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_work_attempt`,
		);
		expect(attemptTable?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining(['reviewPolicyRevisionId', 'submittedResultId', 'reviewRoundId']),
		);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		for (const name of tableNames) {
			expect(await context.queryRunner.hasTable(`${context.tablePrefix}${name}`)).toBe(false);
		}
		const rolledBackAttemptTable = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_work_attempt`,
		);
		expect(rolledBackAttemptTable?.columns.map((column) => column.name)).not.toEqual(
			expect.arrayContaining(['reviewPolicyRevisionId', 'submittedResultId', 'reviewRoundId']),
		);
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
