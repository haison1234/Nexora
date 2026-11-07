import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkReleaseIntent1793699314000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_work_release_intent')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('sourceAttemptId').varchar(36).notNull,
				column('requestedByActorId').uuid.notNull,
				column('reason').text.notNull,
				column('requestId').varchar(36).notNull,
				column('stopCommandId').varchar(36).notNull,
				column('state').varchar(16).notNull.withEnumCheck(['awaiting_stop', 'confirmed']),
				column('createdAt').timestampTimezone().notNull,
				column('confirmedAt').timestampTimezone(),
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_release_intent', ['projectId', 'workId', 'state']);
		await createIndex('ai_department_work_release_intent', [
			'projectId',
			'sourceAttemptId',
			'state',
		]);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_release_intent');
	}
}
