import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAgentDepartmentStopReceipts1793706174479 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('agent_department_stop_receipt')
			.withColumns(
				column('commandId').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('agentId').varchar(36).notNull,
				column('threadId').varchar(128).notNull,
				column('ownerExecutionRef').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('reason')
					.varchar(24)
					.notNull.withEnumCheck(['cancel', 'handoff', 'release', 'authority-revoked']),
				column('payloadHash').varchar(64).notNull,
				column('status').varchar(16).notNull.withEnumCheck(['pending', 'confirmed']),
				column('createdAt').timestampTimezone().notNull,
				column('updatedAt').timestampTimezone().notNull,
				column('confirmedAt').timestampTimezone(),
			)
			.withForeignKey('threadId', {
				tableName: 'agent_execution_threads',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('agent_department_stop_receipt', ['projectId', 'threadId', 'status']);
		await createIndex('agent_department_stop_receipt', ['projectId', 'ownerExecutionRef']);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('agent_department_stop_receipt');
	}
}
