import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAgentDepartmentConsultations1793979870974 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		const table = 'agent_department_consultation_invocation';
		await createTable(table)
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('helpRequestId').varchar(36).notNull,
				column('invocationId').varchar(36).notNull,
				column('sourceAttemptId').varchar(36).notNull,
				column('requesterMemberId').varchar(36).notNull,
				column('recipientMemberId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('executorId').varchar(36).notNull,
				column('bindingVersion').int.notNull,
				column('commandKey').varchar(64).notNull,
				column('inputHash').varchar(64).notNull,
				column('contextRef').varchar(255).notNull,
				column('contextHash').varchar(64).notNull.comment('Hash of the owner-resolved context.'),
				column('inputText').text.notNull,
				column('maxOutputChars').int.notNull,
				column('maxOutputTokens').int.notNull,
				column('threadId').varchar(128).notNull,
				column('state')
					.varchar(16)
					.notNull.default("'reserved'")
					.withEnumCheck(['reserved', 'accepted', 'running', 'stopping', 'unknown', 'terminal'])
					.comment('Consultation owner lifecycle state.'),
				column('outcome')
					.varchar(16)
					.withEnumCheck(['succeeded', 'failed', 'cancelled'])
					.comment('Terminal consultation outcome.'),
				column('safeErrorCode').varchar(64),
				column('deadlineAt').timestampTimezone().notNull.comment('UTC consultation deadline.'),
				column('terminalAt').timestampTimezone(),
				column('sequence').varchar(64).notNull.default("'0'").comment('Monotonic owner sequence.'),
				column('resultText').text,
				column('resultHash').varchar(64),
				column('stopCommandId').varchar(36),
				column('stopPayloadHash').varchar(64),
				column('stopRequestedAt').timestampTimezone(),
				column('createdAt').timestampTimezone().notNull,
				column('updatedAt').timestampTimezone().notNull,
			)
			.withForeignKey('projectId', {
				tableName: 'project',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('helpRequestId', {
				tableName: 'ai_department_work_help_request',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('sourceAttemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('requesterMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('recipientMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('executorId', {
				tableName: 'agents',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(table, ['projectId', 'commandKey'], true);
		await createIndex(
			table,
			['projectId', 'invocationId'],
			true,
			`IDX_${tablePrefix}agent_dept_consult_inv_id`,
		);
		await createIndex(table, ['projectId', 'helpRequestId'], true);
		await createIndex(table, ['projectId', 'departmentId', 'state']);

		const gateTable = 'agent_department_consultation_invocation_gate';
		await createTable(gateTable).withColumns(
			column('projectId').varchar(36).primary.notNull,
			column('invocationId').varchar(36).primary.notNull,
			column('commandKey').varchar(64).notNull,
			column('inputHash').varchar(64).notNull,
			column('state').varchar(16).notNull.default("'open'").withEnumCheck(['open', 'cancelled']),
			column('cancelCommandId').varchar(36),
			column('cancelPayloadHash').varchar(64),
			column('createdAt').timestampTimezone().notNull,
			column('updatedAt').timestampTimezone().notNull,
		);
		await createIndex(gateTable, ['projectId', 'commandKey'], true);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('agent_department_consultation_invocation_gate');
		await dropTable('agent_department_consultation_invocation');
	}
}
