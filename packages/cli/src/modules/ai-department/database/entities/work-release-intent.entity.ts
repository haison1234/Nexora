import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

export type WorkReleaseState = 'awaiting_stop' | 'confirmed';

@Entity({ name: 'ai_department_work_release_intent' })
@Index(['projectId', 'workId', 'state'])
@Index(['projectId', 'sourceAttemptId', 'state'])
export class WorkReleaseIntent {
	@PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'varchar', length: 36 }) workId: string;
	@Column({ type: 'varchar', length: 36 }) sourceAttemptId: string;
	@Column({ type: 'uuid' }) requestedByActorId: string;
	@Column({ type: 'text' }) reason: string;
	@Column({ type: 'boolean', default: false }) waitingForChildren: boolean;
	@Column({ type: 'varchar', length: 36 }) requestId: string;
	@Column({ type: 'varchar', length: 36 }) stopCommandId: string;
	@Column({ type: 'varchar', length: 16 }) state: WorkReleaseState;
	@DateTimeColumn() createdAt: Date;
	@DateTimeColumn({ nullable: true }) confirmedAt: Date | null;
}
