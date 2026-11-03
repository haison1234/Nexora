import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_activity' })
@Index(['projectId', 'workId', 'workVersion'], { unique: true })
@Index(['projectId', 'workId', 'attemptId', 'kind'])
export class WorkActivity {
	@PrimaryColumn({ type: 'varchar', length: 36 }) id: string;
	@Column({ type: 'varchar', length: 36 }) projectId: string;
	@Column({ type: 'varchar', length: 36 }) departmentId: string;
	@Column({ type: 'varchar', length: 36 }) workId: string;
	@Column({ type: 'varchar', length: 36, nullable: true }) attemptId: string | null;
	@Column({ type: 'varchar', length: 36 }) actorId: string;
	@Column({ type: 'varchar', length: 16 }) actorKind: 'agent' | 'user' | 'system';
	@Column({ type: 'varchar', length: 32 }) kind: string;
	@Column({ type: 'text', nullable: true }) body: string | null;
	@Column({ type: 'int' }) workVersion: number;
	@DateTimeColumn() createdAt: Date;
}
