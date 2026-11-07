import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

export type WorkHandoffState =
	| 'requested'
	| 'awaiting_stop'
	| 'completed'
	| 'rejected'
	| 'cancelled';

@Entity({ name: 'ai_department_work_handoff_intent' })
@Index(['projectId', 'workId', 'state'])
@Index(['projectId', 'sourceAttemptId', 'state'])
export class WorkHandoffIntent {
	@PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'varchar', length: 36 }) workId: string;
	@Column({ type: 'varchar', length: 36 }) sourceMemberId: string;
	@Column({ type: 'varchar', length: 36, nullable: true }) sourceAttemptId: string | null;
	@Column({ type: 'varchar', length: 36 }) destinationMemberId: string;
	@Column({ type: 'int', nullable: true }) destinationBindingVersion: number | null;
	@Column({ type: 'uuid', nullable: true }) requestedByActorId: string | null;
	@Column({ type: 'varchar', length: 36, nullable: true }) requestedByMemberId: string | null;
	@Column({ type: 'uuid', nullable: true }) authorizedByUserId: string | null;
	@Column({ type: 'text' }) reason: string;
	@Column({ type: 'int' }) expectedWorkVersion: number;
	@Column({ type: 'varchar', length: 36 }) requestId: string;
	@Column({ type: 'varchar', length: 36, nullable: true }) stopCommandId: string | null;
	@Column({ type: 'varchar', length: 16 }) state: WorkHandoffState;
	@DateTimeColumn() createdAt: Date;
	@DateTimeColumn({ nullable: true }) completedAt: Date | null;
}
