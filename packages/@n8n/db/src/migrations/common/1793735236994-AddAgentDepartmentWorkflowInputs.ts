import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAgentDepartmentWorkflowInputs1793735236994 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		const table = 'agent_department_workflow_input';
		await createTable(table).withColumns(
			column('id').varchar(36).primary.notNull,
			column('projectId').varchar(36).notNull,
			column('invocationId').varchar(36).notNull,
			column('inputsRef').varchar(255).notNull,
			column('inputHash').varchar(64).notNull,
			column('encryptedInputs').text.notNull,
			column('createdAt').timestampTimezone().notNull,
			column('updatedAt').timestampTimezone().notNull,
		);
		await createIndex(
			table,
			['projectId', 'invocationId'],
			true,
			`IDX_${tablePrefix}agent_department_workflow_input_invocation`,
		);
		await createIndex(
			table,
			['projectId', 'inputsRef'],
			true,
			`IDX_${tablePrefix}agent_department_workflow_input_ref`,
		);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('agent_department_workflow_input');
	}
}
