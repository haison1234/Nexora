import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkEligibilityLanes1793686603665 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_work_wake_lane')
			.withColumns(
				column('projectId').varchar(36).primary,
				column('memberId').varchar(36).primary,
				column('actorId').uuid.primary,
				column('bindingVersion').int.primary,
				column('generation').int.notNull,
				column('acknowledgedGeneration').int.notNull,
				column('state')
					.varchar(16)
					.notNull.withEnumCheck([
						'pending',
						'accepted',
						'coalesced',
						'unknown',
						'delivered',
						'rejected',
					])
					.comment('The acknowledgment state for the latest lane wake'),
				column('updatedAt').timestampTimezone().notNull,
			)
			.withCreatedAt.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_wake_lane', ['state', 'updatedAt']);

		await createTable('ai_department_work_eligibility')
			.withColumns(
				column('workId').varchar(36).primary,
				column('generation').int.primary,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('memberId').varchar(36).notNull,
				column('actorId').uuid.notNull,
				column('bindingVersion').int,
				column('laneGeneration').int.notNull,
				column('requestId').varchar(36).notNull,
				column('state')
					.varchar(16)
					.notNull.withEnumCheck(['pending', 'reserved', 'consumed', 'cancelled'])
					.comment('The lifecycle state of this durable work eligibility'),
				column('eligibleAt').timestampTimezone().notNull,
				column('consumedAt').timestampTimezone(),
			)
			.withCreatedAt.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex('ai_department_work_eligibility', [
			'projectId',
			'memberId',
			'actorId',
			'bindingVersion',
			'state',
			'eligibleAt',
			'workId',
		]);
		await createIndex('ai_department_work_eligibility', ['requestId']);
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_work_eligibility');
		await dropTable('ai_department_work_wake_lane');
	}
}
