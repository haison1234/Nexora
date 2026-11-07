import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddWorkflowIdsToAiDepartmentWorkAttempt1793727000000 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_attempt',
			[column('workflowIdsJson').text.notNull.default("'[]'")],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_attempt', ['workflowIdsJson'], {
			recreatesOnSqlite: true,
		});
	}
}
