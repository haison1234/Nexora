import { DateTimeColumn, WithCreatedAt } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

export type WorkEligibilityState = 'pending' | 'reserved' | 'consumed' | 'cancelled';

@Entity({ name: 'ai_department_work_eligibility' })
@Index(['projectId', 'memberId', 'actorId', 'bindingVersion', 'state', 'eligibleAt', 'workId'])
@Index(['requestId'])
export class WorkEligibility extends WithCreatedAt {
	@PrimaryColumn({ type: 'varchar', length: 36 }) workId: string;
	@PrimaryColumn({ type: 'int' }) generation: number;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'varchar', length: 36 }) memberId: string;
	@Column({ type: 'uuid' }) actorId: string;
	@Column({ type: 'int', nullable: true }) bindingVersion: number | null;
	@Column({ type: 'int' }) laneGeneration: number;
	@Column({ type: 'varchar', length: 36 }) requestId: string;
	@Column({ type: 'varchar', length: 16 }) state: WorkEligibilityState;
	@DateTimeColumn() eligibleAt: Date;
	@DateTimeColumn({ nullable: true }) consumedAt: Date | null;
}
