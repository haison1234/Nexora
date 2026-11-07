import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkAssignmentActor1793959256903 implements ReversibleMigration {
	async up({ escape, isPostgres, runQuery }: MigrationContext) {
		const workTable = escape.tableName('ai_department_work_item');
		const userTable = escape.tableName('user');
		const assignedByUserId = escape.columnName('assignedByUserId');
		const userId = escape.columnName('id');
		const type = isPostgres ? 'uuid' : 'varchar(36)';
		await runQuery(
			`ALTER TABLE ${workTable} ADD COLUMN ${assignedByUserId} ${type} NULL REFERENCES ${userTable}(${userId}) ON DELETE SET NULL`,
		);
	}

	async down({ escape, runQuery }: MigrationContext) {
		const workTable = escape.tableName('ai_department_work_item');
		const assignedByUserId = escape.columnName('assignedByUserId');
		await runQuery(`ALTER TABLE ${workTable} DROP COLUMN ${assignedByUserId}`);
	}
}
