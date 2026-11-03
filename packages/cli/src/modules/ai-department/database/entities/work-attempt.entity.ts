import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type { AiDepartmentReviewPolicy } from '@n8n/api-types';

export type WorkAttemptPhase = 'dispatching' | 'active' | 'suspended' | 'terminal';
export type WorkAttemptOutcome = 'succeeded' | 'failed' | 'cancelled' | null;

@Entity({ name: 'ai_department_work_attempt' })
@Index(['workId', 'ordinal'], { unique: true })
@Index(['workId'], { unique: true, where: "\"phase\" IN ('dispatching', 'active', 'suspended')" })
@Index(['projectId', 'ownerExecutionRef'])
@Index(['dispatchKey'], { unique: true })
export class WorkAttempt extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'int' })
	ordinal: number;

	@Column({ type: 'uuid' })
	initiatingUserId: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'int' })
	bindingVersion: number;

	@Column({ type: 'varchar', length: 64 })
	provider: string;

	@Column({ type: 'varchar', length: 36 })
	executorId: string;

	@Column({ type: 'varchar', length: 16 })
	reviewPolicy: AiDepartmentReviewPolicy;

	@Column({ type: 'varchar', length: 36 })
	dispatchKey: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	ownerExecutionRef: string | null;

	@Column({ type: 'varchar', length: 16, default: 'dispatching' })
	phase: WorkAttemptPhase;

	@Column({ type: 'varchar', length: 20, default: '0' })
	lastOwnerSequence: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	cancelRequestId: string | null;

	@Column({ type: 'varchar', length: 16, nullable: true })
	outcome: WorkAttemptOutcome;

	@Column({ type: 'varchar', length: 255, nullable: true })
	resultReference: string | null;

	@Column({ type: 'text', nullable: true })
	safeSummary: string | null;

	@DateTimeColumn({ nullable: true })
	startedAt: Date | null;

	@DateTimeColumn({ nullable: true })
	finishedAt: Date | null;

	@DateTimeColumn({ nullable: true })
	cancelRequestedAt: Date | null;
}
