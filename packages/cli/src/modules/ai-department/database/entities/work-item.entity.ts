import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type {
	AiDepartmentReviewPolicy,
	AiDepartmentWorkPriority,
	AiDepartmentWorkState,
} from '@n8n/api-types';

@Entity({ name: 'ai_department_work_item' })
@Index(['projectId', 'departmentId', 'state', 'createdAt'])
@Index(['departmentId', 'goalId'])
@Index(['departmentId', 'assigneeMemberId', 'state'])
export class WorkItem extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	goalId: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	assigneeMemberId: string | null;

	@Column({ type: 'uuid', nullable: true })
	assignedByUserId: string | null;

	@Column({ type: 'text' })
	instruction: string;

	@Column({ type: 'varchar', length: 16, default: 'normal' })
	priority: AiDepartmentWorkPriority;

	@DateTimeColumn({ nullable: true })
	dueAt: Date | null;

	@Column({ type: 'varchar', length: 16, default: 'required' })
	reviewPolicy: AiDepartmentReviewPolicy;

	@Column({ type: 'text', nullable: true })
	reviewStagesJson: string | null;

	@Column({ type: 'int', default: 1 })
	reviewPolicyRevision: number;

	@Column({ type: 'varchar', length: 36, nullable: true })
	reviewPolicyRevisionId: string | null;

	@Column({ type: 'int', default: 0 })
	currentReviewStageIndex: number;

	@Column({ type: 'varchar', length: 24, default: 'backlog' })
	state: AiDepartmentWorkState;

	@Column({ type: 'varchar', length: 36, nullable: true })
	currentAttemptId: string | null;

	@Column({ type: 'int', default: 1 })
	version: number;
}
