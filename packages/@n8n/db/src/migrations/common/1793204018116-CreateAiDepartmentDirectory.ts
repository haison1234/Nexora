import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentDirectory1793204018116 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('name').varchar(128).notNull,
				column('normalizedName').varchar(128).notNull,
				column('description').text,
				column('archived').bool.notNull.default(false),
				column('version').int.notNull.default(1),
			)
			.withTimestamps.withForeignKey('projectId', {
				tableName: 'project',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(
			'ai_department',
			['projectId', 'normalizedName'],
			true,
			undefined,
			'"archived" = false',
		);

		await createTable('ai_department_member')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('name').varchar(128).notNull,
				column('role').varchar(128).notNull,
				column('managerMemberId').varchar(36),
				column('archived').bool.notNull.default(false),
				column('version').int.notNull.default(1),
			)
			.withTimestamps.withIndexOn(['projectId', 'departmentId'])
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('managerMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			});
		await createIndex('ai_department_member', ['projectId', 'id'], true);

		await createTable('ai_department_executor_binding')
			.withColumns(
				column('memberId').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('provider').varchar(64).notNull,
				column('executorId').varchar(36).notNull,
				column('version').int.notNull.default(1),
			)
			.withTimestamps.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			});

		await createTable('ai_department_executor_binding_revision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('memberId').varchar(36).notNull,
				column('version').int.notNull,
				column('provider').varchar(64).notNull,
				column('executorId').varchar(36).notNull,
				column('changedById').uuid.notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withIndexOn(['memberId', 'version'], true)
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			});

		await createTable('ai_department_directory_change')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('entityType').varchar(32).notNull,
				column('entityId').varchar(36).notNull,
				column('action').varchar(32).notNull,
				column('entityVersion').int.notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withIndexOn(['projectId', 'createdAt'])
			.withForeignKey('projectId', { tableName: 'project', columnName: 'id', onDelete: 'CASCADE' });

		await createTable('ai_department_command_receipt')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('requestId').varchar(36).notNull,
				column('payloadHash').varchar(64).notNull,
				column('operation').varchar(32).notNull,
				column('status').varchar(32).notNull,
				column('responseJson').text,
				column('createdAt').timestampTimezone().notNull,
			)
			.withIndexOn(['projectId', 'actorId', 'requestId'], true);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_command_receipt');
		await dropTable('ai_department_directory_change');
		await dropTable('ai_department_executor_binding_revision');
		await dropTable('ai_department_executor_binding');
		await dropTable('ai_department_member');
		await dropTable('ai_department');
	}
}
