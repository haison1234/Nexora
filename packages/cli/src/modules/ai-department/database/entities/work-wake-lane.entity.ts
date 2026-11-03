import { DateTimeColumn, WithCreatedAt } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

export type WorkWakeLaneState =
	| 'pending'
	| 'accepted'
	| 'coalesced'
	| 'unknown'
	| 'delivered'
	| 'rejected';

@Entity({ name: 'ai_department_work_wake_lane' })
@Index(['state', 'updatedAt'])
export class WorkWakeLane extends WithCreatedAt {
	@PrimaryColumn({ type: 'varchar', length: 36 }) projectId: string;
	@PrimaryColumn({ type: 'varchar', length: 36 }) memberId: string;
	@PrimaryColumn({ type: 'uuid' }) actorId: string;
	@PrimaryColumn({ type: 'int' }) bindingVersion: number;
	@Column({ type: 'int' }) generation: number;
	@Column({ type: 'int' }) acknowledgedGeneration: number;
	@Column({ type: 'varchar', length: 16 }) state: WorkWakeLaneState;
	@DateTimeColumn() updatedAt: Date;
}
