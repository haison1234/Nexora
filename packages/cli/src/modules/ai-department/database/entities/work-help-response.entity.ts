import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_help_response' })
@Index(['helpRequestId'], { unique: true })
@Index(['projectId', 'workId', 'createdAt'])
export class WorkHelpResponse {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	helpRequestId: string;

	@Column({ type: 'varchar', length: 36 })
	activityId: string;

	@Column({ type: 'varchar', length: 16 })
	responderKind: 'user' | 'agent';

	@Column({ type: 'uuid', nullable: true })
	responderUserId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	responderMemberId: string | null;

	@Column({ type: 'text' })
	answer: string;

	@Column({ type: 'varchar', length: 64 })
	answerHash: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	sourceAttemptId: string | null;

	@Column({ type: 'varchar', length: 128, nullable: true })
	ownerInvocationRef: string | null;

	@Column({ type: 'int', nullable: true })
	ownerSequence: number | null;

	@DateTimeColumn()
	createdAt: Date;
}
