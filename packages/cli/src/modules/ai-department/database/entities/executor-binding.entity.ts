import { WithTimestamps } from '@n8n/db';
import { Column, Entity, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_executor_binding' })
export class ExecutorBinding extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 64 })
	provider: string;

	@Column({ type: 'varchar', length: 36 })
	executorId: string;

	@Column({ type: 'int', default: 1 })
	version: number;
}
