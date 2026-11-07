import { WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'agent_department_consultation_invocation_gate' })
@Index(['projectId', 'commandKey'], { unique: true })
export class AgentDepartmentConsultationInvocationGate extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	projectId: string;

	@PrimaryColumn({ type: 'varchar', length: 36 })
	invocationId: string;

	@Column({ type: 'varchar', length: 64 })
	commandKey: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'varchar', length: 16, default: 'open' })
	state: 'open' | 'cancelled';

	@Column({ type: 'varchar', length: 36, nullable: true })
	cancelCommandId: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	cancelPayloadHash: string | null;
}
