import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddOwnerInvocationHashToAiDepartmentWorkHelpRequest1793982121241
	implements ReversibleMigration
{
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_help_request',
			[column('ownerInvocationHash').varchar(64)],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_help_request', ['ownerInvocationHash'], {
			recreatesOnSqlite: true,
		});
	}
}
