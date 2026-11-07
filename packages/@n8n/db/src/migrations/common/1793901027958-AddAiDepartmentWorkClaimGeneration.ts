import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkClaimGeneration1793901027958 implements ReversibleMigration {
	async up({
		schemaBuilder: { addColumns, addNotNull, column },
		escape,
		runQuery,
	}: MigrationContext) {
		await addColumns(
			'ai_department_work_claim',
			[column('claimGeneration').int.comment('Monotonic claim generation for a work attempt')],
			{ recreatesOnSqlite: true },
		);

		const claimTable = escape.tableName('ai_department_work_claim');
		const attemptTable = escape.tableName('ai_department_work_attempt');
		const claimGenerationColumn = escape.columnName('claimGeneration');
		const claimAttemptIdColumn = escape.columnName('attemptId');
		const attemptIdColumn = escape.columnName('id');
		const attemptOrdinalColumn = escape.columnName('ordinal');
		await runQuery(
			`UPDATE ${claimTable} SET ${claimGenerationColumn} = (
				SELECT ${attemptOrdinalColumn} FROM ${attemptTable}
				WHERE ${attemptTable}.${attemptIdColumn} = ${claimTable}.${claimAttemptIdColumn}
			)`,
		);

		await addNotNull('ai_department_work_claim', 'claimGeneration', {
			recreatesOnSqlite: true,
		});
	}

	async down({ schemaBuilder: { dropColumns } }: MigrationContext) {
		await dropColumns('ai_department_work_claim', ['claimGeneration'], {
			recreatesOnSqlite: true,
		});
	}
}
