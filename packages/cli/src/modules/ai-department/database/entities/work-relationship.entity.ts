import { WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

export type WorkRelationshipKind = 'parent' | 'blocks';

@Entity({ name: 'ai_department_work_relationship' })
@Index(['projectId', 'departmentId', 'workId', 'kind'])
@Index(['projectId', 'departmentId', 'relatedWorkId', 'kind'])
@Index(['workId', 'relatedWorkId', 'kind'], { unique: true })
export class WorkRelationship extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	relatedWorkId: string;

	@Column({ type: 'varchar', length: 16 })
	kind: WorkRelationshipKind;
}
