import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkEligibilityLanes1793686603665';

describe('AddAiDepartmentWorkEligibilityLanes migration', () => {
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

	it('creates both durable tables and reverts cleanly', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const laneTableName = `${context.tablePrefix}ai_department_work_wake_lane`;
		const eligibilityTableName = `${context.tablePrefix}ai_department_work_eligibility`;
		const laneTable = await context.queryRunner.getTable(laneTableName);
		const eligibilityTable = await context.queryRunner.getTable(eligibilityTableName);

		expect(laneTable?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				'projectId',
				'memberId',
				'actorId',
				'bindingVersion',
				'generation',
				'acknowledgedGeneration',
				'state',
				'createdAt',
				'updatedAt',
			]),
		);
		expect(eligibilityTable?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining([
				'workId',
				'generation',
				'projectId',
				'memberId',
				'actorId',
				'bindingVersion',
				'laneGeneration',
				'requestId',
				'state',
				'eligibleAt',
				'consumedAt',
				'createdAt',
			]),
		);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		expect(await context.queryRunner.hasTable(laneTableName)).toBe(false);
		expect(await context.queryRunner.hasTable(eligibilityTableName)).toBe(false);
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
		context = createTestMigrationContext(dataSource);
		expect(await context.queryRunner.hasTable(laneTableName)).toBe(true);
		expect(await context.queryRunner.hasTable(eligibilityTableName)).toBe(true);
		await context.queryRunner.release();
	});
});
