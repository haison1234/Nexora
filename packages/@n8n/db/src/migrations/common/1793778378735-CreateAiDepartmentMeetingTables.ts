import type { MigrationContext, ReversibleMigration } from '../migration-types';

export class CreateAiDepartmentMeetingTables1793778378735 implements ReversibleMigration {
	async up({ schemaBuilder: { createTable, createIndex, column } }: MigrationContext) {
		await createTable('ai_department_meeting')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('createdBy').uuid.notNull,
				column('executionActorId').uuid.notNull,
				column('topic').varchar(256).notNull,
				column('purpose')
					.varchar(16)
					.notNull.default("'decision'")
					.withEnumCheck(['decision', 'risk-review', 'ideation']),
				column('desiredOutcome').text.notNull,
				column('state')
					.varchar(16)
					.notNull.default("'draft'")
					.withEnumCheck([
						'draft',
						'collecting',
						'synthesizing',
						'review',
						'approved',
						'completed',
						'cancelling',
						'cancelled',
					])
					.comment('The business lifecycle state of the meeting'),
				column('facilitatorMemberId').varchar(36).notNull,
				column('goalId').varchar(36).comment('Optional goal ID owned by the Work service'),
				column('referencedWorkIds').json.notNull.comment('Referenced work item IDs'),
				column('version').int.notNull.default(1),
				column('startedAt').timestampTimezone(3),
				column('collectionDeadlineAt').timestampTimezone(3),
				column('frozenContributionIds').json,
				column('collectionClosedAt').timestampTimezone(3),
				column('collectionCloseReason').varchar(16).withEnumCheck(['quorum', 'deadline']),
				column('absenceSnapshots').json,
				column('completedAt').timestampTimezone(3),
			)
			.withTimestamps.withIndexOn(['projectId', 'departmentId', 'state', 'updatedAt'])
			.withForeignKey('projectId', { tableName: 'project', columnName: 'id', onDelete: 'CASCADE' })
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('facilitatorMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'RESTRICT',
			});

		await createTable('ai_department_meeting_context')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('snapshotRef')
					.varchar(255)
					.notNull.comment('Opaque reference owned by the source reader'),
				column('briefingHash')
					.varchar(64)
					.notNull.comment('SHA-256 hash of frozen meeting context'),
				column('toolPolicy')
					.varchar(32)
					.notNull.withEnumCheck(['supplied-material-only', 'verified-read-only'])
					.comment('The enforced Agent tool policy for this meeting'),
				column('toolPolicyVersion').varchar(64).comment('Version of the Agents-owned tool policy'),
				column('capturedAt').timestampTimezone(3).notNull,
			)
			.withIndexOn(['projectId', 'departmentId', 'meetingId'], true)
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withCreatedAt;

		await createTable('ai_department_meeting_source')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('sourceKind')
					.varchar(16)
					.notNull.withEnumCheck(['goal', 'work', 'decision'])
					.comment('The source owner type'),
				column('sourceId').varchar(36).notNull.comment('Opaque ID owned by the source service'),
				column('sourceVersion')
					.varchar(64)
					.notNull.comment('Version token owned by the source service'),
				column('snapshotRef')
					.varchar(255)
					.notNull.comment('Opaque versioned reference owned by the source reader'),
				column('contentHash').varchar(64).notNull.comment('Hash of the authorized source version'),
				column('labelSnapshot').varchar(256),
				column('accessState')
					.varchar(16)
					.notNull.default("'available'")
					.withEnumCheck(['available', 'denied', 'expired'])
					.comment('Current access state for this frozen source version'),
			)
			.withIndexOn(['projectId', 'departmentId', 'meetingId', 'sourceKind', 'sourceId'], true)
			.withIndexOn(['projectId', 'departmentId', 'meetingId'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('departmentId', {
				tableName: 'ai_department',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withCreatedAt;

		await createTable('ai_department_meeting_participant')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('memberId').varchar(36).notNull,
				column('memberNameSnapshot').varchar(128).notNull,
				column('roleSnapshot').varchar(128).notNull,
				column('executorId').varchar(36),
				column('bindingVersion').int,
				column('facilitator').bool.notNull.default(false),
				column('responseState')
					.varchar(16)
					.notNull.default("'pending'")
					.withEnumCheck([
						'pending',
						'queued',
						'running',
						'submitted',
						'failed',
						'unavailable',
						'stop_pending',
						'unknown',
						'excluded',
					])
					.comment('The department-owned response state of the participant'),
				column('exclusionReason').text,
				column('version').int.notNull.default(1),
			)
			.withIndexOn(['meetingId', 'memberId'], true)
			.withIndexOn(['projectId', 'departmentId', 'memberId', 'meetingId'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'RESTRICT',
			}).withTimestamps;

		await createTable('ai_department_meeting_invocation')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('participantId').varchar(36).notNull,
				column('kind')
					.varchar(16)
					.notNull.withEnumCheck(['contribution', 'synthesis'])
					.comment('The meeting operation requested from the Agents owner'),
				column('requestKey').varchar(64).notNull.comment('Stable Agents owner idempotency key'),
				column('inputHash')
					.varchar(64)
					.notNull.comment('Hash bound to the owner invocation request'),
				column('contextRef')
					.varchar(255)
					.notNull.comment('Opaque immutable context reference resolved by the owner'),
				column('actorId').uuid.notNull,
				column('memberId').varchar(36).notNull,
				column('executorId').varchar(36).notNull,
				column('bindingVersion').int.notNull,
				column('ownerInvocationRef')
					.varchar(255)
					.comment('Opaque execution reference owned by Agents'),
				column('state')
					.varchar(16)
					.notNull.default("'reserved'")
					.withEnumCheck([
						'reserved',
						'queued',
						'running',
						'succeeded',
						'failed',
						'unavailable',
						'stop_pending',
						'unknown',
						'cancelled',
					])
					.comment('The owner-confirmed lifecycle state of the invocation'),
				column('ownerSequence').varchar(64).comment('Monotonic sequence supplied by Agents'),
				column('deadlineAt').timestampTimezone(3),
				column('terminalAt').timestampTimezone(3),
				column('retryOfInvocationId')
					.varchar(36)
					.comment('Prior terminal invocation ID for a retry'),
				column('safeFailureCode').varchar(64),
				column('safeFailureSummary').varchar(512),
				column('stopCommandId').varchar(36),
			)
			.withIndexOn(['projectId', 'requestKey'], true)
			.withIndexOn(['projectId', 'meetingId', 'kind', 'state'])
			.withIndexOn(['projectId', 'ownerInvocationRef'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('participantId', {
				tableName: 'ai_department_meeting_participant',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('memberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'RESTRICT',
			})
			.withForeignKey('retryOfInvocationId', {
				tableName: 'ai_department_meeting_invocation',
				columnName: 'id',
				onDelete: 'SET NULL',
			}).withTimestamps;

		await createTable('ai_department_meeting_contribution')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('participantId').varchar(36).notNull,
				column('invocationId').varchar(36).notNull,
				column('contribution').json.notNull.comment(
					'Bounded structured contribution accepted from the Agents owner',
				),
				column('sourceContributionIds').json.notNull.comment(
					'Source references for the contribution',
				),
				column('acceptedAt').timestampTimezone(3).notNull,
			)
			.withIndexOn(['participantId'], true)
			.withIndexOn(['invocationId'], true)
			.withIndexOn(['projectId', 'meetingId'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('participantId', {
				tableName: 'ai_department_meeting_participant',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('invocationId', {
				tableName: 'ai_department_meeting_invocation',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withCreatedAt;

		await createTable('ai_department_meeting_minutes')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('revision').int.notNull,
				column('state')
					.varchar(16)
					.notNull.default("'draft'")
					.withEnumCheck(['draft', 'approved'])
					.comment('Whether the minutes revision is a draft or approved'),
				column('summary').text.notNull,
				column('sourceContributionIds').json.notNull.comment(
					'Contribution references used by the minutes',
				),
				column('disagreements').json.notNull.comment(
					'Attributed opposing positions preserved by the minutes',
				),
				column('authoredBy').uuid.notNull,
				column('approvedBy').uuid,
				column('approvedAt').timestampTimezone(3),
			)
			.withIndexOn(['meetingId', 'revision'], true)
			.withIndexOn(['projectId', 'meetingId', 'state'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;

		await createTable('ai_department_meeting_decision')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('minutesId').varchar(36).notNull,
				column('text').text.notNull,
				column('sourceContributionIds').json.notNull.comment(
					'Contribution references supporting the decision',
				),
				column('state')
					.varchar(16)
					.notNull.default("'proposed'")
					.withEnumCheck(['proposed', 'approved'])
					.comment('Agent decisions remain proposed until coordinator approval'),
				column('approvedBy').uuid,
				column('approvedAt').timestampTimezone(3),
			)
			.withIndexOn(['minutesId'])
			.withIndexOn(['projectId', 'meetingId'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('minutesId', {
				tableName: 'ai_department_meeting_minutes',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withTimestamps;

		await createTable('ai_department_meeting_action_item')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('minutesId').varchar(36).notNull,
				column('title').varchar(256).notNull,
				column('description').text,
				column('assigneeMemberId').varchar(36),
				column('sourceContributionIds').json.notNull.comment(
					'Contribution references supporting the action item',
				),
				column('state')
					.varchar(24)
					.notNull.default("'proposed'")
					.withEnumCheck(['proposed', 'approved', 'conversion_pending', 'converted', 'declined'])
					.comment('The coordinator-reviewed resolution state of the action item'),
				column('workId').varchar(36).comment('Backlog work ID owned by the Work service'),
				column('conversionRequestId')
					.varchar(36)
					.comment('Stable request ID used with the Work service'),
				column('payloadHash').varchar(64).comment('Hash bound to the Work create request'),
				column('resolutionReason').text,
				column('approvedBy').uuid,
				column('approvedAt').timestampTimezone(3),
				column('resolvedAt').timestampTimezone(3),
			)
			.withIndexOn(['minutesId'])
			.withIndexOn(['projectId', 'meetingId', 'state'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('minutesId', {
				tableName: 'ai_department_meeting_minutes',
				columnName: 'id',
				onDelete: 'CASCADE',
			})
			.withForeignKey('assigneeMemberId', {
				tableName: 'ai_department_member',
				columnName: 'id',
				onDelete: 'SET NULL',
			}).withTimestamps;
		await createIndex(
			'ai_department_meeting_action_item',
			['workId'],
			true,
			undefined,
			'"workId" IS NOT NULL',
		);

		await createTable('ai_department_meeting_activity')
			.withColumns(
				column('id').varchar(36).primary.notNull,
				column('projectId').varchar(36).notNull,
				column('departmentId').varchar(36).notNull,
				column('meetingId').varchar(36).notNull,
				column('actorId').uuid,
				column('action').varchar(128).notNull,
				column('targetId').varchar(36),
				column('state').varchar(64).notNull,
				column('summary').varchar(512).notNull,
				column('meetingVersion').int.notNull,
			)
			.withIndexOn(['projectId', 'meetingId', 'createdAt'])
			.withForeignKey('meetingId', {
				tableName: 'ai_department_meeting',
				columnName: 'id',
				onDelete: 'CASCADE',
			}).withCreatedAt;
	}

	async down({ schemaBuilder: { dropTable } }: MigrationContext) {
		await dropTable('ai_department_meeting_activity');
		await dropTable('ai_department_meeting_action_item');
		await dropTable('ai_department_meeting_decision');
		await dropTable('ai_department_meeting_minutes');
		await dropTable('ai_department_meeting_contribution');
		await dropTable('ai_department_meeting_invocation');
		await dropTable('ai_department_meeting_participant');
		await dropTable('ai_department_meeting_source');
		await dropTable('ai_department_meeting_context');
		await dropTable('ai_department_meeting');
	}
}
