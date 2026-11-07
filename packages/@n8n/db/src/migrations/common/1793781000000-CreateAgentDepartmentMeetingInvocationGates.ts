import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAgentDepartmentMeetingInvocationGates1793781000000
	implements ReversibleMigration
{
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		const table = 'agent_department_meeting_invocation_gate';
		await createTable(table).withColumns(
			column('projectId').varchar(36).primary.notNull,
			column('invocationId').varchar(36).primary.notNull,
			column('requestKey').varchar(64).notNull,
			column('inputHash').varchar(64).notNull,
			column('state').varchar(16).notNull.default("'open'").withEnumCheck(['open', 'cancelled']),
			column('cancelCommandId').varchar(36),
			column('cancelPayloadHash').varchar(64),
			column('createdAt').timestampTimezone().notNull,
			column('updatedAt').timestampTimezone().notNull,
		);
		await createIndex(
			table,
			['projectId', 'requestKey'],
			true,
			`IDX_${tablePrefix}agent_dept_meeting_gate_request`,
		);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('agent_department_meeting_invocation_gate');
	}
}
