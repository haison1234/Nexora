import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkHandoffIntent1793698314000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_work_handoff_intent')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('sourceMemberId').varchar(36).notNull,
				column('sourceAttemptId').varchar(36),
				column('destinationMemberId').varchar(36).notNull,
				column('destinationBindingVersion').int,
				column('requestedByActorId').uuid,
				column('requestedByMemberId').varchar(36),
				column('authorizedByUserId').uuid,
				column('reason').text.notNull,
				column('expectedWorkVersion').int.notNull,
				column('requestId').varchar(36).notNull,
				column('stopCommandId').varchar(36),
				column('state')
					.varchar(16)
					.notNull.withEnumCheck([
						'requested',
						'awaiting_stop',
						'completed',
						'rejected',
						'cancelled',
					]),
				column('createdAt').timestampTimezone().notNull,
				column('completedAt').timestampTimezone(),
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_handoff_intent', ['projectId', 'workId', 'state']);
		await createIndex('ai_department_work_handoff_intent', [
			'projectId',
			'sourceAttemptId',
			'state',
		]);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_handoff_intent');
	}
}
