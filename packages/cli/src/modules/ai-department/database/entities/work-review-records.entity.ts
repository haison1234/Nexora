import { DateTimeColumn, WithCreatedAt } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type { AiDepartmentReviewPolicy } from '@n8n/api-types';

@Entity({ name: 'ai_department_work_review_policy_revision' })
@Index(['projectId', 'workId', 'revision'], { unique: true })
export class WorkReviewPolicyRevision {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'int' })
	revision: number;

	@Column({ type: 'varchar', length: 16 })
	mode: AiDepartmentReviewPolicy;

	@Column({ type: 'text' })
	stagesJson: string;

	@Column({ type: 'uuid' })
	createdByUserId: string;

	@DateTimeColumn()
	createdAt: Date;
}

@Entity({ name: 'ai_department_work_submitted_result' })
@Index(['attemptId'], { unique: true })
@Index(['projectId', 'workId', 'submittedAt'])
export class SubmittedWorkResult extends WithCreatedAt {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	attemptId: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	reference: string | null;

	@Column({ type: 'text', nullable: true })
	safeSummary: string | null;

	@Column({ type: 'uuid' })
	submittedByUserId: string;

	@DateTimeColumn()
	submittedAt: Date;
}

@Entity({ name: 'ai_department_work_review_round' })
@Index(['attemptId'], { unique: true })
@Index(['workId', 'ordinal'], { unique: true })
export class WorkReviewRound {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	attemptId: string;

	@Column({ type: 'varchar', length: 36 })
	resultId: string;

	@Column({ type: 'varchar', length: 16, default: 'user' })
	requesterKind: 'user';

	@Column({ type: 'uuid' })
	requesterId: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	policyRevisionId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	activeStageId: string | null;

	@Column({ type: 'int' })
	ordinal: number;

	@Column({ type: 'varchar', length: 16 })
	status: 'open' | 'accepted' | 'returned' | 'reopened';

	@Column({ type: 'int', default: 1 })
	version: number;

	@DateTimeColumn()
	createdAt: Date;

	@DateTimeColumn({ nullable: true })
	closedAt: Date | null;
}

@Entity({ name: 'ai_department_work_review_stage_decision' })
@Index(['roundId', 'stageId'], { unique: true })
export class WorkReviewStageDecision {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	roundId: string;

	@Column({ type: 'varchar', length: 64 })
	stageId: string;

	@Column({ type: 'varchar', length: 36 })
	resultId: string;

	@Column({ type: 'varchar', length: 16, default: 'user' })
	actorKind: 'user';

	@Column({ type: 'uuid' })
	actorId: string;

	@Column({ type: 'varchar', length: 16 })
	decision: 'accept' | 'return';

	@Column({ type: 'text', nullable: true })
	reason: string | null;

	@Column({ type: 'int' })
	priorVersion: number;

	@Column({ type: 'varchar', length: 36 })
	commandId: string;

	@DateTimeColumn()
	createdAt: Date;
}
