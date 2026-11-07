import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAgentDepartmentWorkflowDispatchData1793812340893 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'agent_department_workflow_input',
			[
				column('encryptedDispatchData').text.comment(
					'Encrypted immutable request used to recover a reserved child before native persistence',
				),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('agent_department_workflow_input', ['encryptedDispatchData'], {
			recreatesOnSqlite: true,
		});
	}
}
