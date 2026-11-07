import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'CreateAiDepartmentMeetingTables1793778378735';

describe('CreateAiDepartmentMeetingTables migration', () => {
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

	it('creates and drops the structured contribution table', async () => {
		await runSingleMigration(migrationName);
		let context = createTestMigrationContext(dataSource);
		const tableName = `${context.tablePrefix}ai_department_meeting_contribution`;
		let table = await context.queryRunner.getTable(tableName);
		expect(table?.columns.map((column) => column.name)).toEqual(
			expect.arrayContaining(['contribution']),
		);
		expect(table?.columns.map((column) => column.name)).not.toContain('text');
		const meetingTable = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_meeting`,
		);
		expect(meetingTable?.columns.map((column) => column.name)).toContain('purpose');
		const invocationTable = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_meeting_invocation`,
		);
		expect(invocationTable?.columns.map((column) => column.name)).toContain('contextRef');
		const minutesTable = await context.queryRunner.getTable(
			`${context.tablePrefix}ai_department_meeting_minutes`,
		);
		expect(minutesTable?.columns.map((column) => column.name)).toContain('disagreements');
		await context.queryRunner.release();

		await undoLastSingleMigration();
		context = createTestMigrationContext(dataSource);
		table = await context.queryRunner.getTable(tableName);
		expect(table).toBeUndefined();
		await context.queryRunner.release();

		await runSingleMigration(migrationName);
	});
});
