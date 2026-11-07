import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_workflow_capability_revision' })
@Index(['capabilityId', 'version'], { unique: true })
export class WorkflowCapabilityRevision {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	capabilityId: string;

	@Column({ type: 'int' })
	version: number;

	@Column({ type: 'text' })
	purpose: string;

	@Column({ type: 'varchar', length: 36 })
	publishedVersionRef: string;

	@Column({ type: 'varchar', length: 128 })
	triggerCompatibilityRef: string;

	@Column({ type: 'varchar', length: 128 })
	inputSchemaFingerprint: string;

	@Column({ type: 'boolean' })
	enabled: boolean;

	@Column({ type: 'varchar', length: 36 })
	changedById: string;

	@DateTimeColumn()
	createdAt: Date;
}
