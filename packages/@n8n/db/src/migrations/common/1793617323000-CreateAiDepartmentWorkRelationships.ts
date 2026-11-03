import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentWorkRelationships1793617323000 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column }, tablePrefix }: MigrationContext) {
		await createTable('ai_department_work_relationship')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('relatedWorkId').varchar(36).notNull,
				column('kind').varchar(16).notNull.withEnumCheck(['parent', 'blocks']),
			)
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('relatedWorkId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;
		await createIndex(
			'ai_department_work_relationship',
			['workId', 'relatedWorkId', 'kind'],
			true,
			`IDX_${tablePrefix}ai_dept_work_rel_work_related_kind`,
		);
		await createIndex(
			'ai_department_work_relationship',
			['projectId', 'departmentId', 'workId', 'kind'],
			false,
			`IDX_${tablePrefix}ai_dept_work_rel_project_work_kind`,
		);
		await createIndex(
			'ai_department_work_relationship',
			['projectId', 'departmentId', 'relatedWorkId', 'kind'],
			false,
			`IDX_${tablePrefix}ai_dept_work_rel_project_related_kind`,
		);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_relationship');
	}
}
