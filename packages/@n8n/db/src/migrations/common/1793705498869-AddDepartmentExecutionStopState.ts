import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddDepartmentExecutionStopState1793705498869 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'agent_execution_threads',
			[
				column('departmentSnapshotSequence')
					.int.default(0)
					.comment('Durable AI Department owner snapshot sequence'),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('agent_execution_threads', ['departmentSnapshotSequence'], {
			recreatesOnSqlite: true,
		});
	}
}
