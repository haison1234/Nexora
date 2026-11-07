import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';
import { randomUUID } from 'node:crypto';

const migrationName = 'AddAiDepartmentWorkClaimGeneration1793901027958';

describe('AddAiDepartmentWorkClaimGeneration migration', () => {
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

	it('backfills claim generations from attempt ordinals and reverts the column', async () => {
		let context = createTestMigrationContext(dataSource);
		const now = new Date().toISOString();
		const projectId = randomUUID();
		const departmentId = randomUUID();
		const memberId = randomUUID();
		const workId = randomUUID();
		const attemptId = randomUUID();
		const claimId = randomUUID();
		const insert = async (table: string, values: Record<string, string | number>) => {
			const fields = Object.keys(values);
			const columns = fields.map((field) => context.escape.columnName(field));
			const parameters = fields.map((field) => `:${field}`);
			await context.runQuery(
				`INSERT INTO ${context.escape.tableName(table)} (${columns.join(', ')}) VALUES (${parameters.join(', ')})`,
				values,
			);
		};

		await insert('project', {
			id: projectId,
			name: 'Claim generation migration',
			type: 'team',
			createdAt: now,
			updatedAt: now,
		});
		await insert('ai_department', {
			id: departmentId,
			projectId,
			name: 'Migration test',
			normalizedName: 'migration test',
			createdAt: now,
			updatedAt: now,
		});
		await insert('ai_department_member', {
			id: memberId,
			projectId,
			departmentId,
			name: 'Member',
			role: 'Researcher',
			createdAt: now,
			updatedAt: now,
		});
		await insert('ai_department_work_item', {
			id: workId,
			projectId,
			departmentId,
			instruction: 'Run migration test',
			createdAt: now,
			updatedAt: now,
		});
		await insert('ai_department_work_attempt', {
			id: attemptId,
			projectId,
			departmentId,
			workId,
			ordinal: 4,
			initiatingUserId: randomUUID(),
			memberId,
			bindingVersion: 1,
			provider: 'n8n-agent',
			executorId: randomUUID(),
			reviewPolicy: 'required',
			dispatchKey: randomUUID(),
			createdAt: now,
			updatedAt: now,
		});
		await insert('ai_department_work_claim', {
			id: claimId,
			projectId,
			departmentId,
			workId,
			attemptId,
			memberId,
			executionId: randomUUID(),
			leaseUntil: now,
			claimedAt: now,
			createdAt: now,
		});

		await context.queryRunner.release();
		await runSingleMigration(migrationName);
		context = createTestMigrationContext(dataSource);
		const claimTableName = context.escape.tableName('ai_department_work_claim');
		const claimGeneration = context.escape.columnName('claimGeneration');
		const claimIdColumn = context.escape.columnName('id');
		expect(
			await context.queryRunner.query(
				`SELECT ${claimGeneration} FROM ${claimTableName} WHERE ${claimIdColumn} = ?`,
				[claimId],
			),
		).toEqual([{ claimGeneration: 4 }]);
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		const table = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_work_claim`,
		);
		expect(table?.columns.map((column) => column.name)).not.toContain('claimGeneration');
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
