import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddWaitingForChildrenToAiDepartmentWorkReleaseIntent1793984000000
	implements ReversibleMigration
{
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_release_intent',
			[column('waitingForChildren').bool.notNull.default(false)],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_release_intent', ['waitingForChildren'], {
			recreatesOnSqlite: true,
		});
	}
}
