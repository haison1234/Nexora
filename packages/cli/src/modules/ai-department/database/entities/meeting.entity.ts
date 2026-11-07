import { DateTimeColumn, JsonColumn, WithTimestamps } from '@n8n/db';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type {
	AiDepartmentMeetingStructuredContribution,
	AiDepartmentMeetingPurpose,
	AiDepartmentMeetingActionItemState,
	AiDepartmentMeetingDecisionState,
	AiDepartmentMeetingInvocationKind,
	AiDepartmentMeetingInvocationState,
	AiDepartmentMeetingParticipantState,
	AiDepartmentMeetingState,
	AiDepartmentMeetingSourceAccessState,
} from '@n8n/api-types';

@Entity({ name: 'ai_department_meeting' })
@Index(['projectId', 'departmentId', 'state', 'updatedAt'])
export class AiDepartmentMeeting extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'uuid' })
	createdBy: string;

	@Column({ type: 'uuid' })
	executionActorId: string;

	@Column({ type: 'varchar', length: 256 })
	topic: string;

	@Column({ type: 'varchar', length: 16, default: 'decision' })
	purpose: AiDepartmentMeetingPurpose;

	@Column({ type: 'text' })
	desiredOutcome: string;

	@Column({ type: 'varchar', length: 16, default: 'draft' })
	state: AiDepartmentMeetingState;

	@Column({ type: 'varchar', length: 36 })
	facilitatorMemberId: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	goalId: string | null;

	@JsonColumn()
	referencedWorkIds: string[];

	@Column({ type: 'int', default: 1 })
	version: number;

	@DateTimeColumn({ nullable: true })
	startedAt: Date | null;

	@DateTimeColumn({ nullable: true })
	collectionDeadlineAt: Date | null;

	@JsonColumn({ nullable: true })
	frozenContributionIds: string[] | null;

	@DateTimeColumn({ nullable: true })
	collectionClosedAt: Date | null;

	@Column({ type: 'varchar', length: 16, nullable: true })
	collectionCloseReason: 'quorum' | 'deadline' | null;

	@JsonColumn({ nullable: true })
	absenceSnapshots: Array<{
		participantId: string;
		lastKnownState: AiDepartmentMeetingParticipantState;
		recordedAt: string;
	}> | null;

	@DateTimeColumn({ nullable: true })
	completedAt: Date | null;
}

@Entity({ name: 'ai_department_meeting_context' })
@Index(['projectId', 'departmentId', 'meetingId'], { unique: true })
export class AiDepartmentMeetingContext {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 255 })
	snapshotRef: string;

	@Column({ type: 'varchar', length: 64 })
	briefingHash: string;

	@Column({ type: 'varchar', length: 32 })
	toolPolicy: 'supplied-material-only' | 'verified-read-only';

	@Column({ type: 'varchar', length: 64, nullable: true })
	toolPolicyVersion: string | null;

	@DateTimeColumn()
	capturedAt: Date;

	@CreateDateColumn()
	createdAt: Date;
}

@Entity({ name: 'ai_department_meeting_source' })
@Index(['projectId', 'departmentId', 'meetingId', 'sourceKind', 'sourceId'], { unique: true })
@Index(['projectId', 'departmentId', 'meetingId'])
export class AiDepartmentMeetingSource {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 16 })
	sourceKind: 'goal' | 'work' | 'decision';

	@Column({ type: 'varchar', length: 36 })
	sourceId: string;

	@Column({ type: 'varchar', length: 64 })
	sourceVersion: string;

	@Column({ type: 'varchar', length: 255 })
	snapshotRef: string;

	@Column({ type: 'varchar', length: 64 })
	contentHash: string;

	@Column({ type: 'varchar', length: 256, nullable: true })
	labelSnapshot: string | null;

	@Column({ type: 'varchar', length: 16, default: 'available' })
	accessState: AiDepartmentMeetingSourceAccessState;

	@CreateDateColumn()
	createdAt: Date;
}

@Entity({ name: 'ai_department_meeting_participant' })
@Index(['meetingId', 'memberId'], { unique: true })
@Index(['projectId', 'departmentId', 'memberId', 'meetingId'])
export class AiDepartmentMeetingParticipant extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'varchar', length: 128 })
	memberNameSnapshot: string;

	@Column({ type: 'varchar', length: 128 })
	roleSnapshot: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	executorId: string | null;

	@Column({ type: 'int', nullable: true })
	bindingVersion: number | null;

	@Column({ type: 'boolean', default: false })
	facilitator: boolean;

	@Column({ type: 'varchar', length: 16, default: 'pending' })
	responseState: AiDepartmentMeetingParticipantState;

	@Column({ type: 'text', nullable: true })
	exclusionReason: string | null;

	@Column({ type: 'int', default: 1 })
	version: number;
}

@Entity({ name: 'ai_department_meeting_invocation' })
@Index(['projectId', 'requestKey'], { unique: true })
@Index(['projectId', 'meetingId', 'kind', 'state'])
@Index(['projectId', 'ownerInvocationRef'])
export class AiDepartmentMeetingInvocation extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 36 })
	participantId: string;

	@Column({ type: 'varchar', length: 16 })
	kind: AiDepartmentMeetingInvocationKind;

	@Column({ type: 'varchar', length: 64 })
	requestKey: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'varchar', length: 255 })
	contextRef: string;

	@Column({ type: 'uuid' })
	actorId: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'varchar', length: 36 })
	executorId: string;

	@Column({ type: 'int' })
	bindingVersion: number;

	@Column({ type: 'varchar', length: 255, nullable: true })
	ownerInvocationRef: string | null;

	@Column({ type: 'varchar', length: 16, default: 'reserved' })
	state: AiDepartmentMeetingInvocationState;

	@Column({ type: 'varchar', length: 64, nullable: true })
	ownerSequence: string | null;

	@DateTimeColumn({ nullable: true })
	deadlineAt: Date | null;

	@DateTimeColumn({ nullable: true })
	terminalAt: Date | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	retryOfInvocationId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	safeFailureCode: string | null;

	@Column({ type: 'varchar', length: 512, nullable: true })
	safeFailureSummary: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	stopCommandId: string | null;
}

@Entity({ name: 'ai_department_meeting_contribution' })
@Index(['participantId'], { unique: true })
@Index(['invocationId'], { unique: true })
@Index(['projectId', 'meetingId'])
export class AiDepartmentMeetingContribution {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 36 })
	participantId: string;

	@Column({ type: 'varchar', length: 36 })
	invocationId: string;

	@JsonColumn()
	contribution: AiDepartmentMeetingStructuredContribution;

	@JsonColumn()
	sourceContributionIds: string[];

	@DateTimeColumn()
	acceptedAt: Date;

	@CreateDateColumn()
	createdAt: Date;
}

@Entity({ name: 'ai_department_meeting_minutes' })
@Index(['meetingId', 'revision'], { unique: true })
@Index(['projectId', 'meetingId', 'state'])
export class AiDepartmentMeetingMinutes extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'int' })
	revision: number;

	@Column({ type: 'varchar', length: 16, default: 'draft' })
	state: 'draft' | 'approved';

	@Column({ type: 'text' })
	summary: string;

	@JsonColumn()
	sourceContributionIds: string[];

	@JsonColumn()
	disagreements: Array<{
		topic: string;
		positions: Array<{ contributionId: string; position: string }>;
	}>;

	@Column({ type: 'uuid' })
	authoredBy: string;

	@Column({ type: 'uuid', nullable: true })
	approvedBy: string | null;

	@DateTimeColumn({ nullable: true })
	approvedAt: Date | null;
}

@Entity({ name: 'ai_department_meeting_decision' })
@Index(['minutesId'])
@Index(['projectId', 'meetingId'])
export class AiDepartmentMeetingDecision extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 36 })
	minutesId: string;

	@Column({ type: 'text' })
	text: string;

	@JsonColumn()
	sourceContributionIds: string[];

	@Column({ type: 'varchar', length: 16, default: 'proposed' })
	state: AiDepartmentMeetingDecisionState;

	@Column({ type: 'uuid', nullable: true })
	approvedBy: string | null;

	@DateTimeColumn({ nullable: true })
	approvedAt: Date | null;
}

@Entity({ name: 'ai_department_meeting_action_item' })
@Index(['minutesId'])
@Index(['projectId', 'meetingId', 'state'])
@Index(['workId'], { unique: true, where: '"workId" IS NOT NULL' })
export class AiDepartmentMeetingActionItem extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'varchar', length: 36 })
	minutesId: string;

	@Column({ type: 'varchar', length: 256 })
	title: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	assigneeMemberId: string | null;

	@JsonColumn()
	sourceContributionIds: string[];

	@Column({ type: 'varchar', length: 24, default: 'proposed' })
	state: AiDepartmentMeetingActionItemState;

	@Column({ type: 'varchar', length: 36, nullable: true })
	workId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	conversionRequestId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	payloadHash: string | null;

	@Column({ type: 'text', nullable: true })
	resolutionReason: string | null;

	@Column({ type: 'uuid', nullable: true })
	approvedBy: string | null;

	@DateTimeColumn({ nullable: true })
	approvedAt: Date | null;

	@DateTimeColumn({ nullable: true })
	resolvedAt: Date | null;
}

@Entity({ name: 'ai_department_meeting_activity' })
@Index(['projectId', 'meetingId', 'createdAt'])
export class AiDepartmentMeetingActivity {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	meetingId: string;

	@Column({ type: 'uuid', nullable: true })
	actorId: string | null;

	@Column({ type: 'varchar', length: 128 })
	action: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	targetId: string | null;

	@Column({ type: 'varchar', length: 64 })
	state: string;

	@Column({ type: 'varchar', length: 512 })
	summary: string;

	@Column({ type: 'int' })
	meetingVersion: number;

	@CreateDateColumn()
	createdAt: Date;
}
