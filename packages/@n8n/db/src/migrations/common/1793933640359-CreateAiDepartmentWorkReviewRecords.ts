import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentWorkReviewRecords1793933640359 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, addColumns, column } }: MigrationContext) {
		await createTable('ai_department_work_review_policy_revision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('revision').int.notNull,
				column('mode').varchar(16).notNull.withEnumCheck(['required', 'automatic']),
				column('stagesJson').text.notNull,
				column('createdByUserId').uuid.notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(
			'ai_department_work_review_policy_revision',
			['projectId', 'workId', 'revision'],
			true,
		);

		await createTable('ai_department_work_submitted_result')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('reference').varchar(255),
				column('safeSummary').text,
				column('submittedByUserId').uuid.notNull,
				column('submittedAt').timestampTimezone().notNull,
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
		await createIndex('ai_department_work_submitted_result', ['attemptId'], true);
		await createIndex('ai_department_work_submitted_result', [
			'projectId',
			'workId',
			'submittedAt',
		]);

		await createTable('ai_department_work_review_round')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('resultId').varchar(36).notNull,
				column('requesterKind').varchar(16).notNull.withEnumCheck(['user']),
				column('requesterId').uuid.notNull,
				column('policyRevisionId').varchar(36),
				column('activeStageId').varchar(64),
				column('ordinal').int.notNull,
				column('status')
					.varchar(16)
					.notNull.withEnumCheck(['open', 'accepted', 'returned', 'reopened']),
				column('version').int.notNull.default(1),
				column('createdAt').timestampTimezone().notNull,
				column('closedAt').timestampTimezone(),
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
			})
			.withForeignKey('resultId', {
				tableName: 'ai_department_work_submitted_result',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('policyRevisionId', {
				tableName: 'ai_department_work_review_policy_revision',
				columnName: 'id',
				onDelete: 'SET NULL',
			});
		await createIndex('ai_department_work_review_round', ['attemptId'], true);
		await createIndex('ai_department_work_review_round', ['workId', 'ordinal'], true);

		await createTable('ai_department_work_review_stage_decision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('roundId').varchar(36).notNull,
				column('stageId').varchar(64).notNull,
				column('resultId').varchar(36).notNull,
				column('actorKind').varchar(16).notNull.withEnumCheck(['user']),
				column('actorId').uuid.notNull,
				column('decision').varchar(16).notNull.withEnumCheck(['accept', 'return']),
				column('reason').text,
				column('priorVersion').int.notNull,
				column('commandId').varchar(36).notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withForeignKey('roundId', {
				tableName: 'ai_department_work_review_round',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('resultId', {
				tableName: 'ai_department_work_submitted_result',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_review_stage_decision', ['roundId', 'stageId'], true);

		await addColumns('ai_department_work_item', [column('reviewPolicyRevisionId').varchar(36)], {
			recreatesOnSqlite: true,
		});
		await addColumns(
			'ai_department_work_attempt',
			[
				column('reviewPolicyRevisionId').varchar(36),
				column('submittedResultId').varchar(36),
				column('reviewRoundId').varchar(36),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns, dropTable } }: MigrationContext) {
		await dropColumns(
			'ai_department_work_attempt',
			['reviewPolicyRevisionId', 'submittedResultId', 'reviewRoundId'],
			{ recreatesOnSqlite: true },
		);
		await dropColumns('ai_department_work_item', ['reviewPolicyRevisionId'], {
			recreatesOnSqlite: true,
		});
		await dropTable('ai_department_work_review_stage_decision');
		await dropTable('ai_department_work_review_round');
		await dropTable('ai_department_work_submitted_result');
		await dropTable('ai_department_work_review_policy_revision');
	}
}
