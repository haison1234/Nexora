import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkReviewStages1793931712574 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column } }: MigrationContext) {
		await addColumns(
			'ai_department_work_item',
			[
				column('reviewStagesJson').text,
				column('currentReviewStageIndex').int.notNull.default(0),
				column('reviewPolicyRevision').int.notNull.default(1),
			],
			{ recreatesOnSqlite: true },
		);
		await addColumns(
			'ai_department_work_attempt',
			[column('reviewStagesJson').text, column('reviewPolicyRevision').int.notNull.default(1)],
			{
				recreatesOnSqlite: true,
			},
		);
		await addColumns(
			'ai_department_work_review_decision',
			[
				column('reviewRoundId').varchar(36),
				column('stageId').varchar(64),
				column('resultId').varchar(36),
			],
			{ recreatesOnSqlite: true },
		);
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns(
			'ai_department_work_review_decision',
			['reviewRoundId', 'stageId', 'resultId'],
			{ recreatesOnSqlite: true },
		);
		await dropColumns('ai_department_work_attempt', ['reviewStagesJson', 'reviewPolicyRevision'], {
			recreatesOnSqlite: true,
		});
		await dropColumns(
			'ai_department_work_item',
			['reviewStagesJson', 'currentReviewStageIndex', 'reviewPolicyRevision'],
			{ recreatesOnSqlite: true },
		);
	}
}
