import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkWakeLaneDrain1793694522771 implements ReversibleMigration {
	async up({ schemaBuilder: { addColumns, column, createIndex } }: MigrationContext) {
		await addColumns('ai_department_work_wake_lane', [column('activeAttemptId').varchar(36)], {
			recreatesOnSqlite: true,
		});
		await createIndex('ai_department_work_attempt', [
			'projectId',
			'memberId',
			'initiatingUserId',
			'bindingVersion',
			'phase',
		]);
	}

	async down({ schemaBuilder: { dropColumns, dropIndex } }: MigrationContext) {
		await dropIndex('ai_department_work_attempt', [
			'projectId',
			'memberId',
			'initiatingUserId',
			'bindingVersion',
			'phase',
		]);
		await dropColumns('ai_department_work_wake_lane', ['activeAttemptId'], {
			recreatesOnSqlite: true,
		});
	}
}
