import { WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_workflow_capability' })
@Index(['projectId', 'memberId', 'workflowId'], { unique: true })
@Index(['projectId', 'departmentId', 'memberId', 'enabled'])
export class WorkflowCapability extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'varchar', length: 36 })
	workflowId: string;

	@Column({ type: 'text' })
	purpose: string;

	@Column({ type: 'varchar', length: 36 })
	publishedVersionRef: string;

	@Column({ type: 'varchar', length: 128 })
	triggerCompatibilityRef: string;

	@Column({ type: 'varchar', length: 128 })
	inputSchemaFingerprint: string;

	@Column({ type: 'boolean', default: false })
	enabled: boolean;

	@Column({ type: 'int', default: 1 })
	version: number;
}
