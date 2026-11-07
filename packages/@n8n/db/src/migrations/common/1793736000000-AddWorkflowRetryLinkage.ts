import type { MigrationContext, ReversibleMigration } from '../migration-types';

const TABLES = ['agent_department_workflow_event', 'ai_department_workflow_invocation_receipt'];

export class AddWorkflowRetryLinkage1793736000000 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		for (const table of TABLES) {
			await addColumns(table, [column('retryOfExecutionRef').varchar(255)], {
				recreatesOnSqlite: true,
			});
		}
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		for (const table of TABLES) {
			await dropColumns(table, ['retryOfExecutionRef'], { recreatesOnSqlite: true });
		}
	}
}
