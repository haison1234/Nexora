import { WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department' })
@Index(['projectId', 'normalizedName'], { unique: true })
export class Department extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 128 })
	name: string;

	@Column({ type: 'varchar', length: 128 })
	normalizedName: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({ type: 'boolean', default: false })
	archived: boolean;

	@Column({ type: 'int', default: 1 })
	version: number;

	@Column({ type: 'int', default: 0 })
	projectionSequence: number;
}
