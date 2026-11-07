import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddRecipientUserToAiDepartmentWorkHelpRequest1793961254407
	implements ReversibleMigration
{
	async up({ escape, isPostgres, runQuery }: MigrationContext) {
		const requestTable = escape.tableName('ai_department_work_help_request');
		const userTable = escape.tableName('user');
		const recipientUserId = escape.columnName('recipientUserId');
		const userId = escape.columnName('id');
		const type = isPostgres ? 'uuid' : 'varchar(36)';
		await runQuery(
			`ALTER TABLE ${requestTable} ADD COLUMN ${recipientUserId} ${type} NULL REFERENCES ${userTable}(${userId}) ON DELETE SET NULL`,
		);
	}

	async down({ escape, runQuery }: MigrationContext) {
		const requestTable = escape.tableName('ai_department_work_help_request');
		const recipientUserId = escape.columnName('recipientUserId');
		await runQuery(`ALTER TABLE ${requestTable} DROP COLUMN ${recipientUserId}`);
	}
}
