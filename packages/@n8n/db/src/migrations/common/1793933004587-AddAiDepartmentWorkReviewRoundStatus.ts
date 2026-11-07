import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkReviewRoundStatus1793933004587 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_attempt',
			[
				column('reviewRoundStatus')
					.varchar(16)
					.withEnumCheck(['open', 'accepted', 'returned', 'reopened']),
				column('reviewRoundClosedAt').timestampTimezone(),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_attempt', ['reviewRoundStatus', 'reviewRoundClosedAt'], {
			recreatesOnSqlite: true,
		});
	}
}
