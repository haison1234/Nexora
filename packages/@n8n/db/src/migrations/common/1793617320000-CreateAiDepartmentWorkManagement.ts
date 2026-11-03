import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentWorkManagement1793617320000 implements ReversibleMigration {
	async up({
		schemaBuilder: { addColumns, addForeignKey, createTable, createIndex, column },
	}: MigrationContext) {
		await addColumns('ai_department', [column('projectionSequence').int.notNull.default(0)], {
			recreatesOnSqlite: true,
		});

		await createTable('ai_department_admission_fence')
			.withColumns(
				column('departmentId').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('sequence').int.notNull.default(0),
			)
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;
		await createIndex('ai_department_admission_fence', ['projectId', 'departmentId'], true);

		await createTable('ai_department_goal')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('title').varchar(256).notNull,
				column('successCriteria').text,
				column('parentId').varchar(36),
				column('ownerMemberId').varchar(36),
				column('dueAt').timestampTimezone(3),
				column('state').varchar(16).notNull.default("'active'"),
				column('version').int.notNull.default(1),
			)
			.withIndexOn(['projectId', 'departmentId', 'state'])
			.withIndexOn(['departmentId', 'parentId'])
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('parentId', {
				tableName: 'ai_department_goal',
				columnName: 'id',
				onDelete: 'SET NULL',
			})
			.withForeignKey('ownerMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			}).withTimestamps;

		await createTable('ai_department_work_item')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('goalId').varchar(36),
				column('assigneeMemberId').varchar(36),
				column('instruction').text.notNull,
				column('priority').varchar(16).notNull.default("'normal'"),
				column('dueAt').timestampTimezone(3),
				column('reviewPolicy').varchar(16).notNull.default("'required'"),
				column('state').varchar(24).notNull.default("'backlog'"),
				column('currentAttemptId').varchar(36),
				column('version').int.notNull.default(1),
			)
			.withIndexOn(['projectId', 'departmentId', 'state', 'createdAt'])
			.withIndexOn(['departmentId', 'goalId'])
			.withIndexOn(['departmentId', 'assigneeMemberId', 'state'])
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('goalId', {
				tableName: 'ai_department_goal',
				columnName: 'id',
				onDelete: 'SET NULL',
			})
			.withForeignKey('assigneeMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			}).withTimestamps;

		await createTable('ai_department_work_attempt')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('ordinal').int.notNull,
				column('initiatingUserId').uuid.notNull,
				column('memberId').varchar(36).notNull,
				column('bindingVersion').int.notNull,
				column('provider').varchar(64).notNull,
				column('executorId').varchar(36).notNull,
				column('reviewPolicy').varchar(16).notNull,
				column('dispatchKey').varchar(36).notNull,
				column('ownerExecutionRef').varchar(255),
				column('phase').varchar(16).notNull.default("'dispatching'"),
				column('outcome').varchar(16),
				column('resultReference').varchar(255),
				column('safeSummary').text,
				column('startedAt').timestampTimezone(3),
				column('finishedAt').timestampTimezone(3),
				column('cancelRequestedAt').timestampTimezone(3),
			)
			.withIndexOn(['workId', 'ordinal'], true)
			.withIndexOn('dispatchKey', true)
			.withIndexOn(['projectId', 'ownerExecutionRef'])
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'RESTRICT',
			}).withTimestamps;

		await createIndex('ai_department_work_attempt', ['projectId', 'id'], true);
		await createIndex(
			'ai_department_work_attempt',
			['workId'],
			true,
			undefined,
			"\"phase\" IN ('dispatching', 'active', 'suspended')",
		);
		await createIndex('ai_department_work_item', ['currentAttemptId']);
		await addForeignKey(
			'ai_department_work_item',
			'currentAttemptId',
			['ai_department_work_attempt', 'id'],
			undefined,
			'SET NULL',
		);

		await createTable('ai_department_work_dispatch_intent')
			.withColumns(
				column('attemptId').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('requestId').varchar(36).notNull,
				column('inputHash').varchar(64).notNull,
				column('state').varchar(16).notNull.default("'pending'"),
				column('acknowledgmentReference').varchar(255),
				column('leaseUntil').timestampTimezone(3),
			)
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;

		await createTable('ai_department_work_owner_event_receipt')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('provider').varchar(64).notNull,
				column('ownerEventId').varchar(255).notNull,
				column('projectId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('sequence').varchar(20).notNull,
				column('schemaVersion').int.notNull,
				column('kind').varchar(32).notNull,
				column('safeSummary').text,
				column('occurredAt').timestampTimezone(3).notNull,
				column('receivedAt').timestampTimezone(3).notNull,
			)
			.withIndexOn(['provider', 'ownerEventId'], true)
			.withIndexOn(['attemptId', 'sequence'], true)
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;

		await createTable('ai_department_work_transition')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36),
				column('actorId').varchar(36),
				column('actorKind').varchar(16).notNull,
				column('fromState').varchar(24),
				column('toState').varchar(24).notNull,
				column('reason').text,
				column('workVersion').int.notNull,
				column('createdAt').timestampTimezone(3).notNull,
			)
			.withIndexOn(['projectId', 'departmentId', 'createdAt'])
			.withIndexOn(['workId', 'workVersion'], true)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'SET NULL',
			});

		await createTable('ai_department_work_review_decision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('decision').varchar(16).notNull,
				column('reason').text,
				column('priorVersion').int.notNull,
				column('createdAt').timestampTimezone(3).notNull,
			)
			.withIndexOn(['workId', 'priorVersion'], true)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'RESTRICT',
			});

		await createIndex('ai_department_work_item', ['projectId', 'id'], true);
	}

	async down({
		schemaBuilder: { dropTable, dropIndex, dropForeignKey, dropColumns },
	}: MigrationContext) {
		await dropTable('ai_department_work_review_decision');
		await dropTable('ai_department_work_transition');
		await dropTable('ai_department_work_owner_event_receipt');
		await dropTable('ai_department_work_dispatch_intent');
		await dropForeignKey('ai_department_work_item', 'currentAttemptId', [
			'ai_department_work_attempt',
			'id',
		]);
		await dropTable('ai_department_work_attempt');
		await dropIndex('ai_department_work_item', ['currentAttemptId']);
		await dropTable('ai_department_work_item');
		await dropTable('ai_department_goal');
		await dropTable('ai_department_admission_fence');
		await dropColumns('ai_department', ['projectionSequence'], { recreatesOnSqlite: true });
	}
}
