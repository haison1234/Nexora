import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_wake_intent' })
@Index(['deliveredAt', 'retryAt', 'createdAt', 'workId'])
export class WorkWakeIntent {
	@PrimaryColumn({ type: 'varchar', length: 36 }) workId: string;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'uuid' }) actorId: string;
	@Column({ type: 'varchar', length: 36 }) requestId: string;
	@DateTimeColumn() retryAt: Date = new Date();
	@DateTimeColumn() createdAt: Date;
	@DateTimeColumn({ nullable: true }) deliveredAt: Date | null;
}
