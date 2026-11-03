import type { AiDepartmentWorkItemDto } from '@n8n/api-types';
import type { WorkItem } from '../database/entities/work-item.entity';

export function toWorkDto(work: WorkItem): AiDepartmentWorkItemDto {
	return {
		id: work.id,
		projectId: work.projectId,
		departmentId: work.departmentId,
		goalId: work.goalId,
		assigneeMemberId: work.assigneeMemberId,
		instruction: work.instruction,
		priority: work.priority,
		dueAt: work.dueAt?.toISOString() ?? null,
		reviewPolicy: work.reviewPolicy,
		state: work.state,
		currentAttemptId: work.currentAttemptId,
		version: work.version,
		createdAt: work.createdAt.toISOString(),
		updatedAt: work.updatedAt.toISOString(),
	};
}
