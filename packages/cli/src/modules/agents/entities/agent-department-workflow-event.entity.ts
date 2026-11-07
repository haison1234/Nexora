import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryGeneratedColumn } from '@n8n/typeorm';

export type AgentDepartmentWorkflowChildState =
	| 'pending'
	| 'running'
	| 'waiting'
	| 'retrying'
	| 'succeeded'
	| 'failed'
	| 'cancelled'
	| 'unknown';

@Entity({ name: 'agent_department_workflow_event' })
@Index(['eventId'], { unique: true })
@Index(['deliveredAt', 'id'], { where: '"deliveredAt" IS NULL' })
@Index(['invocationId', 'id'])
export class AgentDepartmentWorkflowEvent extends WithTimestamps {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'varchar', length: 36 })
	eventId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	invocationId: string;

	@Column({ type: 'varchar', length: 36 })
	ownerExecutionRef: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	retryOfExecutionRef?: string | null;

	@Column({ type: 'varchar', length: 36 })
	actualWorkflowVersion: string;

	@Column({ type: 'varchar', length: 16 })
	childState: AgentDepartmentWorkflowChildState;

	@DateTimeColumn()
	occurredAt: Date;

	@DateTimeColumn({ nullable: true })
	deliveredAt: Date | null;
}
