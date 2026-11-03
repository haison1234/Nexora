import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_work_owner_event_receipt' })
@Index(['provider', 'ownerEventId'], { unique: true })
@Index(['attemptId', 'sequence'], { unique: true })
export class WorkOwnerEventReceipt extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 64 })
	provider: string;

	@Column({ type: 'varchar', length: 255 })
	ownerEventId: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	attemptId: string;

	@Column({ type: 'varchar', length: 20 })
	sequence: number;

	@Column({ type: 'int' })
	schemaVersion: number;

	@Column({ type: 'varchar', length: 32 })
	kind: string;

	@Column({ type: 'text', nullable: true })
	safeSummary: string | null;

	@DateTimeColumn()
	occurredAt: Date;

	@DateTimeColumn()
	receivedAt: Date;
}
