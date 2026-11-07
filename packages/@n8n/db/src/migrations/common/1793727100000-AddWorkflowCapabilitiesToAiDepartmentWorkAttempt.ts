import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddWorkflowCapabilitiesToAiDepartmentWorkAttempt1793727100000
	implements ReversibleMigration
{
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_attempt',
			[column('workflowCapabilitiesJson').text.notNull.default("'[]'")],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_attempt', ['workflowCapabilitiesJson'], {
			recreatesOnSqlite: true,
		});
	}
}
