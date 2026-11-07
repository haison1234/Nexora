import { JsonColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_member' })
@Index(['departmentId', 'archived'])
export class Member extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 128 })
	name: string;

	@Column({ type: 'varchar', length: 128 })
	role: string;

	@JsonColumn()
	expertiseTags: string[] = [];

	@Column({ type: 'varchar', length: 36, nullable: true })
	managerMemberId: string | null;

	@Column({ type: 'boolean', default: false })
	archived: boolean;

	@Column({ type: 'int', default: 1 })
	version: number;
}
