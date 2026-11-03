import { WithTimestamps } from '@n8n/db';
import { Column, Entity, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_admission_fence' })
export class DepartmentAdmissionFence extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	departmentId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'int', default: 0 })
	sequence: number;
}
