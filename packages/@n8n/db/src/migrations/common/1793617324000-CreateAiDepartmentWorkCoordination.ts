import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentWorkCoordination1793617324000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_work_claim')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('memberId').varchar(36).notNull,
				column('executionId').varchar(36).notNull,
				column('leaseUntil').timestampTimezone().notNull,
				column('claimedAt').timestampTimezone().notNull,
				column('createdAt').timestampTimezone().notNull,
				column('releasedAt').timestampTimezone(),
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_claim', ['attemptId'], true);
		await createTable('ai_department_work_activity')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36),
				column('actorId').varchar(36).notNull,
				column('actorKind')
					.varchar(16)
					.notNull.withEnumCheck(['agent', 'user', 'system'])
					.comment('The actor that wrote this entry'),
				column('kind').varchar(32).notNull,
				column('body').text,
				column('workVersion').int.notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_activity', ['projectId', 'workId', 'workVersion'], true);
		await createIndex('ai_department_work_activity', ['projectId', 'workId', 'attemptId', 'kind']);
		await createTable('ai_department_work_wake_intent')
			.withColumns(
				column('workId').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('requestId').varchar(36).notNull,
				column('createdAt').timestampTimezone().notNull,
				column('retryAt').timestampTimezone().notNull,
				column('deliveredAt').timestampTimezone(),
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_wake_intent', [
			'deliveredAt',
			'retryAt',
			'createdAt',
			'workId',
		]);
	}
	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_wake_intent');
		await dropTable('ai_department_work_activity');
		await dropTable('ai_department_work_claim');
	}
}
