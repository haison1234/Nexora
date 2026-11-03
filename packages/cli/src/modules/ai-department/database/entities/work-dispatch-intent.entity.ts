import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, PrimaryColumn } from '@n8n/typeorm';

export type WorkDispatchState = 'pending' | 'acknowledged' | 'unknown' | 'rejected';

@Entity({ name: 'ai_department_work_dispatch_intent' })
export class WorkDispatchIntent extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	attemptId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	requestId: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'varchar', length: 16, default: 'pending' })
	state: WorkDispatchState;

	@Column({ type: 'varchar', length: 255, nullable: true })
	acknowledgmentReference: string | null;

	@DateTimeColumn({ nullable: true })
	leaseUntil: Date | null;
}
