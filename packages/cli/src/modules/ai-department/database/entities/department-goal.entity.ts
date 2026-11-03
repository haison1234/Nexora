import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type { AiDepartmentGoalState } from '@n8n/api-types';

@Entity({ name: 'ai_department_goal' })
@Index(['projectId', 'departmentId', 'state'])
@Index(['departmentId', 'parentId'])
export class DepartmentGoal extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 256 })
	title: string;

	@Column({ type: 'text', nullable: true })
	successCriteria: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	parentId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	ownerMemberId: string | null;

	@DateTimeColumn({ nullable: true })
	dueAt: Date | null;

	@Column({ type: 'varchar', length: 16, default: 'active' })
	state: AiDepartmentGoalState;

	@Column({ type: 'int', default: 1 })
	version: number;
}
