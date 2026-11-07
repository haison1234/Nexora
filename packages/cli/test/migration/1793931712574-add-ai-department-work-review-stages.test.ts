import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkReviewStages1793931712574';

describe('AddAiDepartmentWorkReviewStages migration', () => {
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

	it('adds reversible stage snapshot and decision identity columns', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const workTable = `${context.tablePrefix}ai_department_work_item`;
		const attemptTable = `${context.tablePrefix}ai_department_work_attempt`;
		const decisionTable = `${context.tablePrefix}ai_department_work_review_decision`;
		let workColumns = (await context.queryRunner.getTable(workTable))?.columns.map(
			(column) => column.name,
		);
		let attemptColumns = (await context.queryRunner.getTable(attemptTable))?.columns.map(
			(column) => column.name,
		);
		let decisionColumns = (await context.queryRunner.getTable(decisionTable))?.columns.map(
			(column) => column.name,
		);
		expect(workColumns).toEqual(
			expect.arrayContaining([
				'reviewStagesJson',
				'currentReviewStageIndex',
				'reviewPolicyRevision',
			]),
		);
		expect(attemptColumns).toEqual(
			expect.arrayContaining(['reviewStagesJson', 'reviewPolicyRevision']),
		);
		expect(decisionColumns).toEqual(
			expect.arrayContaining(['reviewRoundId', 'stageId', 'resultId']),
		);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		workColumns = (await context.queryRunner.getTable(workTable))?.columns.map(
			(column) => column.name,
		);
		attemptColumns = (await context.queryRunner.getTable(attemptTable))?.columns.map(
			(column) => column.name,
		);
		decisionColumns = (await context.queryRunner.getTable(decisionTable))?.columns.map(
			(column) => column.name,
		);
		expect(workColumns).not.toEqual(
			expect.arrayContaining([
				'reviewStagesJson',
				'currentReviewStageIndex',
				'reviewPolicyRevision',
			]),
		);
		expect(attemptColumns).not.toEqual(
			expect.arrayContaining(['reviewStagesJson', 'reviewPolicyRevision']),
		);
		expect(decisionColumns).not.toEqual(
			expect.arrayContaining(['reviewRoundId', 'stageId', 'resultId']),
		);
		await context.queryRunner.release();
		await runSingleMigration(migrationName);
	});
});
