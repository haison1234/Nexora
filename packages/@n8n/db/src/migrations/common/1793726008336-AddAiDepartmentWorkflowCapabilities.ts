import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class AddAiDepartmentWorkflowCapabilities1793726008336 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_workflow_capability')
			.withColumns(
				column('id').varchar(36).primary.notNull.comment('Department workflow capability ID'),
				column('projectId').varchar(36).notNull.comment('n8n project that owns the capability'),
				column('departmentId').varchar(36).notNull,
				column('memberId').varchar(36).notNull,
				column('workflowId').varchar(36).notNull.comment('Reference to the n8n-owned workflow'),
				column('purpose').text.notNull,
				column('publishedVersionRef')
					.varchar(36)
					.notNull.comment('Published workflow version selected by the coordinator'),
				column('triggerCompatibilityRef')
					.varchar(128)
					.notNull.comment('Supported trigger type and version'),
				column('inputSchemaFingerprint')
					.varchar(128)
					.notNull.comment('Fingerprint of the compatible workflow input schema'),
				column('enabled').bool.notNull.default(false),
				column('version').int.notNull.default(1),
				column('createdAt').timestampTimezone().notNull,
				column('updatedAt').timestampTimezone().notNull,
			)
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(
			'ai_department_workflow_capability',
			['projectId', 'memberId', 'workflowId'],
			true,
		);
		await createIndex('ai_department_workflow_capability', [
			'projectId',
			'departmentId',
			'memberId',
			'enabled',
		]);

		await createTable('ai_department_workflow_capability_revision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('capabilityId').varchar(36).notNull,
				column('version').int.notNull,
				column('purpose').text.notNull,
				column('publishedVersionRef').varchar(36).notNull,
				column('triggerCompatibilityRef').varchar(128).notNull,
				column('inputSchemaFingerprint').varchar(128).notNull,
				column('enabled').bool.notNull,
				column('changedById').varchar(36).notNull,
				column('createdAt').timestampTimezone().notNull,
			)
			.withForeignKey('capabilityId', {
				tableName: 'ai_department_workflow_capability',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(
			'ai_department_workflow_capability_revision',
			['capabilityId', 'version'],
			true,
		);

		await createTable('ai_department_workflow_invocation')
			.withColumns(
				column('id').varchar(36).primary.notNull.comment('Department workflow invocation ID'),
				column('projectId').varchar(36).notNull,
				column('workId').varchar(36).notNull,
				column('attemptId').varchar(36).notNull,
				column('memberId').varchar(36).notNull,
				column('capabilityId').varchar(36).notNull,
				column('capabilityVersion').int.notNull,
				column('claimGeneration').int.notNull,
				column('requestId').varchar(128).notNull.comment('Stable idempotency key for this attempt'),
				column('ownerInvocationKey')
					.varchar(64)
					.notNull.comment('Stable native execution key accepted by the workflow owner'),
				column('inputHash').varchar(64).notNull.comment('Hash of validated invocation inputs'),
				column('inputsRef')
					.varchar(255)
					.notNull.comment('Reference to invocation inputs held by the authorized owner'),
				column('expectedWorkflowVersion').varchar(36),
				column('actualWorkflowVersion').varchar(36),
				column('ownerExecutionRef').varchar(255),
				column('dispatchState')
					.varchar(16)
					.notNull.withEnumCheck(['pending', 'acknowledged', 'unknown', 'rejected'])
					.default("'pending'")
					.comment('Department dispatch acceptance state'),
				column('childState')
					.varchar(16)
					.notNull.withEnumCheck([
						'pending',
						'running',
						'waiting',
						'retrying',
						'succeeded',
						'failed',
						'cancelled',
						'unknown',
					])
					.default("'pending'")
					.comment('Safe projection of the n8n-owned child execution state'),
				column('safeResultReference').varchar(255),
				column('safeErrorReference').varchar(255),
				column('version').int.notNull.default(1),
				column('cancelRequestedAt').timestampTimezone(),
				column('createdAt').timestampTimezone().notNull,
				column('updatedAt').timestampTimezone().notNull,
			)
			.withForeignKey('workId', {
				tableName: 'ai_department_work_item',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('attemptId', {
				tableName: 'ai_department_work_attempt',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('capabilityId', {
				tableName: 'ai_department_workflow_capability',
				columnName: 'id',
				onDelete: 'RESTRICT',
			});
		await createIndex('ai_department_workflow_invocation', ['attemptId', 'requestId'], true);
		await createIndex('ai_department_workflow_invocation', [
			'projectId',
			'workId',
			'attemptId',
			'createdAt',
		]);
		await createIndex('ai_department_workflow_invocation', ['projectId', 'ownerExecutionRef']);

		await createTable('ai_department_workflow_invocation_receipt')
			.withColumns(
				column('eventId').varchar(36).primary.notNull.comment('Stable n8n owner event ID'),
				column('invocationId').varchar(36).notNull,
				column('ownerSequence').varchar(20).notNull.comment('Monotonic sequence from the owner'),
				column('childState')
					.varchar(16)
					.notNull.withEnumCheck([
						'pending',
						'running',
						'waiting',
						'retrying',
						'succeeded',
						'failed',
						'cancelled',
						'unknown',
					])
					.comment('Safe child execution state in this owner event'),
				column('ownerExecutionRef').varchar(255),
				column('actualWorkflowVersion').varchar(36),
				column('safeResultReference').varchar(255),
				column('safeErrorReference').varchar(255),
				column('occurredAt').timestampTimezone().notNull,
				column('receivedAt').timestampTimezone().notNull,
				column('createdAt').timestampTimezone().notNull,
				column('updatedAt').timestampTimezone().notNull,
			)
			.withForeignKey('invocationId', {
				tableName: 'ai_department_workflow_invocation',
				columnName: 'id',
				onDelete: 'CASCADE',
			});
		await createIndex(
			'ai_department_workflow_invocation_receipt',
			['invocationId', 'ownerSequence'],
			true,
		);
	}

	async down({ schemaBuilder: _schemaBuilder }: MigrationContext) {
		await _schemaBuilder.dropTable('ai_department_workflow_invocation_receipt');
		await _schemaBuilder.dropTable('ai_department_workflow_invocation');
		await _schemaBuilder.dropTable('ai_department_workflow_capability_revision');
		await _schemaBuilder.dropTable('ai_department_workflow_capability');
	}
}
