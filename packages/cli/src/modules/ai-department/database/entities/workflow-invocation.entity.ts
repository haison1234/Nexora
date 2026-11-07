import { DateTimeColumn, WithTimestamps } from '@n8n/db';
import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';
import type {
	AiDepartmentWorkflowChildState,
	AiDepartmentWorkflowDispatchState,
} from '@n8n/api-types';

@Entity({ name: 'ai_department_workflow_invocation' })
@Index(['attemptId', 'requestId'], { unique: true })
@Index(['projectId', 'workId', 'attemptId', 'createdAt'])
@Index(['projectId', 'ownerExecutionRef'])
export class WorkflowInvocation extends WithTimestamps {
	@PrimaryColumn({ type: 'varchar', length: 36 })
	id: string;

	@Column({ type: 'varchar', length: 36 })
	projectId: string;

	@Column({ type: 'varchar', length: 36 })
	workId: string;

	@Column({ type: 'varchar', length: 36 })
	attemptId: string;

	@Column({ type: 'varchar', length: 36 })
	memberId: string;

	@Column({ type: 'varchar', length: 36 })
	capabilityId: string;

	@Column({ type: 'int' })
	capabilityVersion: number;

	@Column({ type: 'int' })
	claimGeneration: number;

	@Column({ type: 'varchar', length: 128 })
	requestId: string;

	@Column({ type: 'varchar', length: 64 })
	ownerInvocationKey: string;

	@Column({ type: 'varchar', length: 64 })
	inputHash: string;

	@Column({ type: 'varchar', length: 255 })
	inputsRef: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	expectedWorkflowVersion: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	actualWorkflowVersion: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	ownerExecutionRef: string | null;

	@Column({ type: 'varchar', length: 16, default: 'pending' })
	dispatchState: AiDepartmentWorkflowDispatchState;

	@Column({ type: 'varchar', length: 16, default: 'pending' })
	childState: AiDepartmentWorkflowChildState;

	@Column({ type: 'varchar', length: 255, nullable: true })
	safeResultReference: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	safeErrorReference: string | null;

	@Column({ type: 'int', default: 1 })
	version: number;

	@DateTimeColumn({ nullable: true })
	cancelRequestedAt: Date | null;
}
