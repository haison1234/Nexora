import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentAttemptReconciliation1793617321000 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_attempt',
			[
				column('lastOwnerSequence').varchar(20).notNull.default("'0'"),
				column('cancelRequestId').varchar(36),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_attempt', ['lastOwnerSequence', 'cancelRequestId'], {
			recreatesOnSqlite: true,
		});
	}
}
