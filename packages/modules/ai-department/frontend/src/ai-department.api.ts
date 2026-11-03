import type {
	AiDepartmentDto,
	AiDepartmentWorkActivityDto,
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkAttemptDto,
	AiDepartmentWorkItemDto,
	AiDepartmentReviewResult,
	CreateAiDepartmentGoalDto,
	CreateAiDepartmentDto,
	CreateAiDepartmentMemberDto,
	CreateAiDepartmentWorkDto,
	ReviewAiDepartmentWorkDto,
	AiDepartmentWorkState,
	SetAiDepartmentExecutorBindingDto,
	ClearAiDepartmentExecutorBindingDto,
} from '@n8n/api-types';
import { getFullApiResponse, makeRestApiRequest, type IRestApiContext } from '@n8n/rest-api-client';

const projectPath = (projectId: string) =>
	`/projects/${encodeURIComponent(projectId)}/ai-departments`;
const departmentPath = (projectId: string, departmentId: string) =>
	`${projectPath(projectId)}/${encodeURIComponent(departmentId)}`;

export type AiDepartmentWorkTransition = {
	id: string;
	workId: string;
	attemptId: string | null;
	actorId: string | null;
	actorKind: 'user' | 'executor' | 'system';
	fromState: AiDepartmentWorkState | null;
	toState: AiDepartmentWorkState;
	reason: string | null;
	workVersion: number;
	createdAt: string;
};

export type AiDepartmentAgent = { id: string; name: string; activeVersionId: string | null };
export type AiDepartmentMemberBinding = {
	memberId: string;
	executionState: 'unconfigured' | 'available' | 'unavailable';
	executorId?: string;
	bindingVersion: number | null;
};

const membersPath = (projectId: string, departmentId: string) =>
	`${departmentPath(projectId, departmentId)}/members`;

export async function listProjectAgents(
	context: IRestApiContext,
	projectId: string,
): Promise<AiDepartmentAgent[]> {
	const agents: AiDepartmentAgent[] = [];
	let count = 0;
	do {
		const response = await getFullApiResponse<AiDepartmentAgent[]>(
			context,
			'GET',
			`/projects/${encodeURIComponent(projectId)}/agents/v2`,
			{ skip: agents.length, take: 100 },
		);
		agents.push(...response.data);
		count = response.count;
		if (response.data.length === 0) break;
	} while (agents.length < count);
	return agents;
}

export async function getMemberExecutorBinding(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	memberId: string,
): Promise<AiDepartmentMemberBinding> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${membersPath(projectId, departmentId)}/${encodeURIComponent(memberId)}/executor-binding`,
	);
}

export async function setMemberExecutorBinding(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	memberId: string,
	body: SetAiDepartmentExecutorBindingDto,
): Promise<AiDepartmentMemberBinding> {
	return await makeRestApiRequest(
		context,
		'PUT',
		`${membersPath(projectId, departmentId)}/${encodeURIComponent(memberId)}/executor-binding`,
		body,
	);
}

export async function clearMemberExecutorBinding(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	memberId: string,
	body: ClearAiDepartmentExecutorBindingDto,
): Promise<AiDepartmentMemberBinding> {
	return await makeRestApiRequest(
		context,
		'DELETE',
		`${membersPath(projectId, departmentId)}/${encodeURIComponent(memberId)}/executor-binding`,
		body,
	);
}

export async function listDepartments(
	context: IRestApiContext,
	projectId: string,
): Promise<AiDepartmentDto[]> {
	return await makeRestApiRequest(context, 'GET', projectPath(projectId));
}

export async function createDepartment(
	context: IRestApiContext,
	projectId: string,
	body: CreateAiDepartmentDto,
): Promise<AiDepartmentDto> {
	return await makeRestApiRequest(context, 'POST', projectPath(projectId), body);
}

export async function listMembers(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentMemberDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/members`,
	);
}

export async function listGoals(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentGoalDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/goals`,
	);
}

export async function listWork(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	options: { take: number; skip: number; search?: string; state?: AiDepartmentWorkState },
): Promise<{ data: AiDepartmentWorkItemDto[]; count: number }> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work`,
		options,
	);
}

export async function listAttempts(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkAttemptDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/attempts`,
	);
}

export async function listWorkHistory(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkTransition[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/history`,
	);
}

export async function createDepartmentGoal(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	body: CreateAiDepartmentGoalDto,
): Promise<AiDepartmentGoalDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/goals`,
		body,
	);
}

export async function createDepartmentMember(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	body: CreateAiDepartmentMemberDto,
): Promise<AiDepartmentMemberDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/members`,
		body,
	);
}

export async function createDepartmentWork(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	body: CreateAiDepartmentWorkDto,
): Promise<AiDepartmentWorkItemDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work`,
		body,
	);
}

export async function markDepartmentWorkReady(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	work: AiDepartmentWorkItemDto,
	requestId: string,
): Promise<AiDepartmentWorkItemDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(work.id)}/ready`,
		{ requestId, expectedVersion: work.version },
	);
}

export async function reviewDepartmentWork(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	work: AiDepartmentWorkItemDto,
	body: Omit<ReviewAiDepartmentWorkDto, 'expectedVersion'>,
): Promise<AiDepartmentReviewResult> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(work.id)}/review`,
		{ ...body, expectedVersion: work.version },
	);
}

export async function listWorkActivity(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
	skip = 0,
): Promise<{ data: AiDepartmentWorkActivityDto[]; count: number }> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/activity`,
		{ take: 100, skip },
	);
}
