import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type { AiDepartmentWorkState } from '@n8n/api-types';

@Entity({ name: 'ai_department_work_transition' })
@Index(['projectId', 'departmentId', 'createdAt'])
@Index(['workId', 'workVersion'], { unique: true })
export class WorkTransition {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	attemptId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	actorId: string | null;

	@Column({ type: 'varchar', length: 16 })
	actorKind: 'user' | 'agent' | 'system';

	@Column({ type: 'varchar', length: 24, nullable: true })
	fromState: AiDepartmentWorkState | null;

	@Column({ type: 'varchar', length: 24 })
	toState: AiDepartmentWorkState;

	@Column({ type: 'text', nullable: true })
	reason: string | null;

	@Column({ type: 'int' })
	workVersion: number;

	@DateTimeColumn()
	createdAt: Date;
}
