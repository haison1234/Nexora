import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAgentDepartmentMeetingInvocations1793780000000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		const table = 'agent_department_meeting_invocation';
		await createTable(table).withColumns(
			column('id').varchar(36).primary.notNull,
			column('projectId').varchar(36).notNull,
			column('departmentId').varchar(36).notNull,
			column('meetingId').varchar(36).notNull,
			column('participantId').varchar(36).notNull,
			column('invocationId').varchar(36).notNull,
			column('round').varchar(16).notNull.withEnumCheck(['contribution', 'synthesis']),
			column('actorId').uuid.notNull,
			column('memberId').varchar(36).notNull,
			column('executorId').varchar(36).notNull,
			column('bindingVersion').int.notNull,
			column('requestKey').varchar(64).notNull,
			column('inputHash').varchar(64).notNull,
			column('contextRef').varchar(255).notNull,
			column('inputText').text.notNull,
			column('maxOutputChars').int.notNull,
			column('maxOutputTokens').int.notNull,
			column('toolPolicy').varchar(32).notNull,
			column('toolPolicyVersion').varchar(64),
			column('threadId').varchar(128).notNull,
			column('state')
				.varchar(16)
				.notNull.default("'reserved'")
				.withEnumCheck(['reserved', 'accepted', 'running', 'stopping', 'unknown', 'terminal']),
			column('outcome').varchar(16).withEnumCheck(['succeeded', 'failed', 'cancelled']),
			column('safeErrorCode').varchar(64),
			column('deadlineAt').timestampTimezone(),
			column('terminalAt').timestampTimezone(),
			column('sequence').varchar(64).notNull.default("'0'"),
			column('resultText').text,
			column('resultHash').varchar(64),
			column('stopCommandId').varchar(36),
			column('stopPayloadHash').varchar(64),
			column('stopRequestedAt').timestampTimezone(),
			column('createdAt').timestampTimezone().notNull,
			column('updatedAt').timestampTimezone().notNull,
		);
		await createIndex(
			table,
			['projectId', 'requestKey'],
			true,
			`IDX_${tablePrefix}agent_dept_meeting_inv_request`,
		);
		await createIndex(
			table,
			['projectId', 'invocationId'],
			true,
			`IDX_${tablePrefix}agent_dept_meeting_inv_id`,
		);
		await createIndex(table, ['projectId', 'meetingId', 'state']);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('agent_department_meeting_invocation');
	}
}
