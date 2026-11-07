import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddTimestampsToAiDepartmentWorkSubmittedResult1793935000000
	implements ReversibleMigration
{
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_submitted_result',
			[column('createdAt').timestampTimezone(), column('updatedAt').timestampTimezone()],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_submitted_result', ['updatedAt', 'createdAt'], {
			recreatesOnSqlite: true,
		});
	}
}
