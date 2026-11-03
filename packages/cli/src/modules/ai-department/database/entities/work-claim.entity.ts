import { DateTimeColumn, WithCreatedAt } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_claim' })
@Index(['attemptId'], { unique: true })
export class WorkClaim extends WithCreatedAt {
	@PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'varchar', length: 36 }) workId: string;
	@Column({ type: 'varchar', length: 36 }) attemptId: string;
	@Column({ type: 'varchar', length: 36 }) memberId: string;
	@Column({ type: 'varchar', length: 36 }) executionId: string;
	@DateTimeColumn() leaseUntil: Date;
	@DateTimeColumn() claimedAt: Date;
	@DateTimeColumn({ nullable: true }) releasedAt: Date | null;
}
