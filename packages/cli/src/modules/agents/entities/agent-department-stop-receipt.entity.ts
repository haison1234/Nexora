import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	type Relation,
} from '@n8n/typeorm';

import { AgentExecutionThread } from './agent-execution-thread.entity';

export type AgentDepartmentStopReason = 'cancel' | 'handoff' | 'release' | 'authority-revoked';

@Entity({ name: 'agent_department_stop_receipt' })
@Index(['projectId', 'threadId', 'status'])
@Index(['projectId', 'ownerExecutionRef'])
export class AgentDepartmentStopReceipt extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	commandId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	agentId: string;

	@ManyToOne(() => AgentExecutionThread, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'threadId' })
	thread: Relation<AgentExecutionThread>;

	@Column({ type: 'varchar', length: 128 })
	threadId: string;

	@Column({ type: 'varchar', length: 36 })
	ownerExecutionRef: string;

	@Column({ type: 'uuid' })
	actorId: string;

	@Column({ type: 'varchar', length: 24 })
	reason: AgentDepartmentStopReason;

	@Column({ type: 'varchar', length: 64 })
	payloadHash: string;

	@Column({ type: 'varchar', length: 16 })
	status: 'pending' | 'confirmed';

	@DateTimeColumn({ precision: 3, nullable: true })
	confirmedAt: Date | null;
}
