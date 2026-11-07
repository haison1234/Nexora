import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_review_decision' })
@Index(['workId', 'priorVersion'], { unique: true })
export class WorkReviewDecision {
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

	@Column({ type: 'varchar', length: 36, nullable: true })
	reviewRoundId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	stageId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	resultId: string | null;

	@Column({ type: 'uuid' })
	actorId: string;

	@Column({ type: 'varchar', length: 16 })
	decision: 'accept' | 'return';

	@Column({ type: 'text', nullable: true })
	reason: string | null;

	@Column({ type: 'int' })
	priorVersion: number;

	@DateTimeColumn()
	createdAt: Date;
}
