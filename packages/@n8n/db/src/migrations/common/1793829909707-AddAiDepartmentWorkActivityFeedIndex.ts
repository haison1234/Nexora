import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkActivityFeedIndex1793829909707 implements ReversibleMigration {
	async up({ schemaBuilder: { createIndex } }: MigrationContext) {
		await createIndex('ai_department_work_activity', ['projectId', 'departmentId', 'createdAt']);
	}

	async down({ schemaBuilder: { dropIndex } }: MigrationContext) {
		await dropIndex('ai_department_work_activity', ['projectId', 'departmentId', 'createdAt']);
	}
}
