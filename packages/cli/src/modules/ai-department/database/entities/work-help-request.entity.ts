import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_help_request' })
@Index(['projectId', 'departmentId', 'workId', 'createdAt'])
@Index(['projectId', 'departmentId', 'state', 'deadlineAt'])
@Index(['projectId', 'initiatingUserId', 'requestId'], { unique: true })
export class WorkHelpRequest extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	requesterMemberId: string;

	@Column({ type: 'varchar', length: 36 })
	sourceAttemptId: string;

	@Column({ type: 'uuid', nullable: true })
	initiatingUserId: string | null;

	@Column({ type: 'varchar', length: 36 })
	requestId: string;

	@Column({ type: 'text' })
	question: string;

	@Column({ type: 'text' })
	attemptedStepsJson: string;

	@Column({ type: 'text' })
	reason: string;

	@Column({ type: 'text' })
	expertiseTagsJson: string;

	@Column({ type: 'text' })
	requestChainJson: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	recipientMemberId: string | null;

	@Column({ type: 'uuid', nullable: true })
	recipientUserId: string | null;

	@Column({ type: 'varchar', length: 32 })
	routingState: 'specialist' | 'manager_fallback' | 'assignment_actor_fallback' | 'unresolved';

	@Column({ type: 'int', nullable: true })
	bindingVersion: number | null;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@DateTimeColumn({ nullable: true })
	deadlineAt: Date | null;

	@Column({ type: 'varchar', length: 24 })
	state:
		| 'pending_stop'
		| 'queued'
		| 'awaiting_answer'
		| 'answered'
		| 'escalating'
		| 'expired'
		| 'failed'
		| 'cancelled';

	@Column({ type: 'varchar', length: 128, nullable: true })
	ownerReference: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	ownerInvocationHash: string | null;

	@Column({ type: 'int', default: 1 })
	version: number;
}
