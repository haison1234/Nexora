import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type { AiDepartmentWorkflowChildState } from '@n8n/api-types';

@Entity({ name: 'ai_department_workflow_invocation_receipt' })
@Index(['invocationId', 'ownerSequence'], { unique: true })
export class WorkflowInvocationReceipt extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	eventId: string;

	@Column({ type: 'varchar', length: 36 })
	invocationId: string;

	@Column({ type: 'varchar', length: 20 })
	ownerSequence: string;

	@Column({ type: 'varchar', length: 16 })
	childState: AiDepartmentWorkflowChildState;

	@Column({ type: 'varchar', length: 255, nullable: true })
	ownerExecutionRef: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	retryOfExecutionRef: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	actualWorkflowVersion: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	safeResultReference: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	safeErrorReference: string | null;

	@DateTimeColumn()
	occurredAt: Date;

	@DateTimeColumn()
	receivedAt: Date;
}
