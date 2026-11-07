import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'agent_department_consultation_invocation' })
@Index(['projectId', 'commandKey'], { unique: true })
@Index(['projectId', 'invocationId'], { unique: true })
@Index(['projectId', 'helpRequestId'], { unique: true })
@Index(['projectId', 'departmentId', 'state'])
export class AgentDepartmentConsultationInvocation extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	helpRequestId: string;

	@Column({ type: 'varchar', length: 36 })
	invocationId: string;

	@Column({ type: 'varchar', length: 36 })
	sourceAttemptId: string;

	@Column({ type: 'varchar', length: 36 })
	requesterMemberId: string;

	@Column({ type: 'varchar', length: 36 })
	recipientMemberId: string;

	@Column({ type: 'uuid' })
	actorId: string;

	@Column({ type: 'varchar', length: 36 })
	executorId: string;

	@Column({ type: 'int' })
	bindingVersion: number;

	@Column({ type: 'varchar', length: 64 })
	commandKey: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'varchar', length: 255 })
	contextRef: string;

	@Column({ type: 'varchar', length: 64 })
	contextHash: string;

	@Column({ type: 'text' })
	inputText: string;

	@Column({ type: 'int' })
	maxOutputChars: number;

	@Column({ type: 'int' })
	maxOutputTokens: number;

	@Column({ type: 'varchar', length: 128 })
	threadId: string;

	@Column({ type: 'varchar', length: 16, default: 'reserved' })
	state: 'reserved' | 'accepted' | 'running' | 'stopping' | 'unknown' | 'terminal';

	@Column({ type: 'varchar', length: 16, nullable: true })
	outcome: 'succeeded' | 'failed' | 'cancelled' | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	safeErrorCode: string | null;

	@DateTimeColumn()
	deadlineAt: Date;

	@DateTimeColumn({ nullable: true })
	terminalAt: Date | null;

	@Column({ type: 'varchar', length: 64, default: '0' })
	sequence: string;

	@Column({ type: 'text', nullable: true })
	resultText: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	resultHash: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	stopCommandId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	stopPayloadHash: string | null;

	@DateTimeColumn({ nullable: true })
	stopRequestedAt: Date | null;
}
