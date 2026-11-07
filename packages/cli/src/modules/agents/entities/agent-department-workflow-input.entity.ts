import { WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'agent_department_workflow_input' })
@Index(['projectId', 'invocationId'], { unique: true })
@Index(['projectId', 'inputsRef'], { unique: true })
export class AgentDepartmentWorkflowInput extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	invocationId: string;

	@Column({ type: 'varchar', length: 255 })
	inputsRef: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'text' })
	encryptedInputs: string;

	@Column({ type: 'text', nullable: true })
	encryptedDispatchData: string | null;
}
