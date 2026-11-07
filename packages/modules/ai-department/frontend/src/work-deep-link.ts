import type { AiDepartmentWorkItemDto } from '@n8n/api-types';

export async function resolveWorkDeepLink(
	workId: string,
	workItems: readonly AiDepartmentWorkItemDto[],
	loadWork: (workId: string) => Promise<AiDepartmentWorkItemDto>,
) {
	return workItems.find(({ id }) => id === workId) ?? (await loadWork(workId));
}
