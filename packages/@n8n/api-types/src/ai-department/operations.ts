import type { AiDepartmentMemberDto } from './index';
import type {
	AiDepartmentWorkActivityDto,
	AiDepartmentWorkHelpAttentionPageDto,
	AiDepartmentWorkItemDto,
} from './work';

export type AiDepartmentOperationsSnapshotDto = {
	projectId: string;
	departmentId: string;
	revision: number;
	members: AiDepartmentMemberDto[];
	work: { data: AiDepartmentWorkItemDto[]; count: number };
	helpRequests: AiDepartmentWorkHelpAttentionPageDto;
	activity: { data: AiDepartmentWorkActivityDto[]; count: number };
};
