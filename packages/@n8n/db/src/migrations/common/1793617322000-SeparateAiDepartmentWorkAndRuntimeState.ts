import type { IrreversibleMigration, MigrationContext } from '../migration-types';

export class SeparateAiDepartmentWorkAndRuntimeState1793617322000 implements IrreversibleMigration {
	async up({ escape, runQuery }: MigrationContext) {
		const table = escape.tableName('ai_department_work_item');
		const state = escape.columnName('state');
		await runQuery(`UPDATE ${table} SET ${state} = 'running' WHERE ${state} = 'waiting_approval'`);
		await runQuery(`UPDATE ${table} SET ${state} = 'blocked' WHERE ${state} = 'failed'`);
	}
}
