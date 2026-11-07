import {
	createTestMigrationContext,
	initDbUpToMigration,
	runSingleMigration,
	undoLastSingleMigration,
} from '@n8n/backend-test-utils';
import { DbConnection } from '@n8n/db';
import { Container } from '@n8n/di';
import { DataSource } from '@n8n/typeorm';

const migrationName = 'AddAiDepartmentWorkflowCapabilities1793726008336';

describe('AddAiDepartmentWorkflowCapabilities migration', () => {
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

	it('creates capability, revision, invocation, and receipt tables with the owner key', async () => {
		await runSingleMigration(migrationName);
		const context = createTestMigrationContext(dataSource);
		try {
			const capability = await context.queryRunner.getTable(
				`${context.tablePrefix}ai_department_workflow_capability`,
			);
			const revision = await context.queryRunner.getTable(
				`${context.tablePrefix}ai_department_workflow_capability_revision`,
			);
			const invocation = await context.queryRunner.getTable(
				`${context.tablePrefix}ai_department_workflow_invocation`,
			);
			const receipt = await context.queryRunner.getTable(
				`${context.tablePrefix}ai_department_workflow_invocation_receipt`,
			);

			expect(capability?.columns.map((column) => column.name)).toContain('publishedVersionRef');
			expect(revision?.columns.map((column) => column.name)).toContain('inputSchemaFingerprint');
			expect(invocation?.columns.map((column) => column.name)).toEqual(
				expect.arrayContaining([
					'attemptId',
					'capabilityVersion',
					'claimGeneration',
					'requestId',
					'ownerInvocationKey',
					'inputHash',
					'expectedWorkflowVersion',
					'ownerExecutionRef',
				]),
			);
			expect(receipt?.columns.map((column) => column.name)).toEqual(
				expect.arrayContaining(['eventId', 'invocationId', 'ownerSequence', 'childState']),
			);
		} finally {
			await context.queryRunner.release();
		}

		await undoLastSingleMigration();
		const reverted = createTestMigrationContext(dataSource);
		try {
			expect(
				await reverted.queryRunner.hasTable(
					`${reverted.tablePrefix}ai_department_workflow_invocation`,
				),
			).toBe(false);
		} finally {
			await reverted.queryRunner.release();
		}

		await runSingleMigration(migrationName);
	});
});
