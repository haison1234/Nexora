import type { MigrationContext, ReversibleMigration } from '../migration-types';

const TABLE = 'agent_department_workflow_event';

export class CreateAgentDepartmentWorkflowEvents1793728000000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		await createTable(TABLE).withColumns(
			column('id').int.primary.autoGenerate2,
			column('eventId').varchar(36).notNull,
			column('projectId').varchar(36).notNull,
			column('invocationId').varchar(36).notNull,
			column('ownerExecutionRef').varchar(36).notNull,
			column('actualWorkflowVersion').varchar(36).notNull,
			column('childState')
				.varchar(16)
				.notNull.withEnumCheck([
					'running',
					'waiting',
					'retrying',
					'succeeded',
					'failed',
					'cancelled',
					'unknown',
				]),
			column('occurredAt').timestampTimezone().notNull,
			column('deliveredAt').timestampTimezone(),
			column('createdAt').timestampTimezone().notNull,
			column('updatedAt').timestampTimezone().notNull,
		);
		await createIndex(TABLE, ['eventId'], true);
		await createIndex(
			TABLE,
			['deliveredAt', 'id'],
			false,
			`IDX_${tablePrefix}agent_department_workflow_event_pending`,
			'"deliveredAt" IS NULL',
		);
		await createIndex(TABLE, ['invocationId', 'id']);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable(TABLE);
	}
}
