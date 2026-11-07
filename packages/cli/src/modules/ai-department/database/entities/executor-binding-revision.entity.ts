import { DateTimeColumn } from '@n8n/db';
import { Column, Entity, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_executor_binding_revision' })
export class ExecutorBindingRevision {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'int' })
	version: number;

	@Column({ type: 'varchar', length: 64 })
	provider: string;

	@Column({ type: 'varchar', length: 36 })
	executorId: string;

	@Column({ type: 'varchar', length: 36 })
	changedById: string;

	@DateTimeColumn()
	createdAt: Date;
}
