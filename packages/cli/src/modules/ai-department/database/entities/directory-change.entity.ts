import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_directory_change' })
@Index(['projectId', 'createdAt'])
export class DirectoryChange {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	actorId: string;

	@Column({ type: 'varchar', length: 32 })
	entityType: string;

	@Column({ type: 'varchar', length: 36 })
	entityId: string;

	@Column({ type: 'varchar', length: 32 })
	action: string;

	@Column({ type: 'int' })
	entityVersion: number;

	@Column({ type: 'datetime' })
	createdAt: Date;
}
