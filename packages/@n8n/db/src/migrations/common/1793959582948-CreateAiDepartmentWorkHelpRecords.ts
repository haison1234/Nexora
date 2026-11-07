import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentWorkHelpRecords1793959582948 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, column } }: MigrationContext) {
		await createTable('ai_department_work_help_request')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('requesterMemberId').varchar(36).notNull,
				column('sourceAttemptId').varchar(36).notNull,
				column('initiatingUserId').uuid.comment('User who initiated the help request'),
				column('requestId').varchar(36).notNull,
				column('question').text.notNull,
				column('attemptedStepsJson').text.notNull.comment('Bounded help request steps'),
				column('reason').text.notNull,
				column('expertiseTagsJson').text.notNull.comment('Normalized routing tags'),
				column('requestChainJson').text.notNull.comment('Recipient and request chain state'),
				column('recipientMemberId').varchar(36),
				column('routingState')
					.varchar(32)
					.notNull.withEnumCheck([
						'specialist',
						'manager_fallback',
						'assignment_actor_fallback',
						'unresolved',
					])
					.comment('Selected deterministic routing stage'),
				column('bindingVersion').int.comment('Executor binding revision used for routing'),
				column('inputHash').varchar(64).notNull,
				column('deadlineAt').timestampTimezone(),
				column('state')
					.varchar(24)
					.notNull.default("'pending_stop'")
					.withEnumCheck([
						'pending_stop',
						'queued',
						'awaiting_answer',
						'answered',
						'escalating',
						'expired',
						'failed',
						'cancelled',
					])
					.comment('Help request lifecycle state'),
				column('ownerReference').varchar(128),
				column('version').int.notNull.default(1),
			)
			.withTimestamps.withIndexOn(['projectId', 'initiatingUserId', 'requestId'], true)
			.withIndexOn(['projectId', 'departmentId', 'workId', 'createdAt'])
			.withIndexOn(['projectId', 'departmentId', 'state', 'deadlineAt'])
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
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('requesterMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('sourceAttemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('initiatingUserId', {
				tableName: 'user',
				columnName: 'id',
				onDelete: 'SET NULL',
			})
			.withForeignKey('recipientMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			});

		await createTable('ai_department_work_help_response')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('helpRequestId').varchar(36).notNull,
				column('activityId').varchar(36).notNull,
				column('responderKind')
					.varchar(16)
					.notNull.withEnumCheck(['user', 'agent'])
					.comment('Kind of responder'),
				column('responderUserId').uuid,
				column('responderMemberId').varchar(36),
				column('answer').text.notNull,
				column('answerHash').varchar(64).notNull,
				column('sourceAttemptId').varchar(36),
				column('ownerInvocationRef').varchar(128),
				column('ownerSequence').int,
				column('createdAt').timestampTimezone().notNull,
			)
			.withIndexOn(['helpRequestId'], true)
			.withIndexOn(['projectId', 'workId', 'createdAt'])
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
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('helpRequestId', {
				tableName: 'ai_department_work_help_request',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('activityId', {
				tableName: 'ai_department_work_activity',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('responderUserId', {
				tableName: 'user',
				columnName: 'id',
				onDelete: 'SET NULL',
			})
			.withForeignKey('responderMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			})
			.withForeignKey('sourceAttemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'SET NULL',
			});
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_help_response');
		await dropTable('ai_department_work_help_request');
	}
}
