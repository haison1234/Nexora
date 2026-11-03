import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity({ name: 'ai_department_command_receipt' })
@Index(['projectId', 'actorId', 'requestId'], { unique: true })
export class CommandReceipt {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	actorId: string;

	@Column({ type: 'varchar', length: 36 })
	requestId: string;

	@Column({ type: 'varchar', length: 64 })
	payloadHash: string;

	@Column({ type: 'varchar', length: 32 })
	operation: string;

	@Column({ type: 'varchar', length: 32 })
	status: string;

	@Column({ type: 'text', nullable: true })
	responseJson: string | null;

	@Column({ type: 'datetime' })
	createdAt: Date;
}
