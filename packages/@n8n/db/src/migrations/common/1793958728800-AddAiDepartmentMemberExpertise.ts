import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentMemberExpertise1793958728800 implements ReversibleMigration {
	async up({ escape, isPostgres, runQuery }: MigrationContext) {
		const table = escape.tableName('ai_department_member');
		const column = escape.columnName('expertiseTags');
		const type = isPostgres ? 'json' : 'text';
		await runQuery(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} NOT NULL DEFAULT '[]'`);
	}

	async down({ escape, runQuery }: MigrationContext) {
		const table = escape.tableName('ai_department_member');
		const column = escape.columnName('expertiseTags');
		await runQuery(`ALTER TABLE ${table} DROP COLUMN ${column}`);
	}
}
