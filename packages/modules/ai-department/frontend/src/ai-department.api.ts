import type {
	AiDepartmentMeetingPageDto,
	AiDepartmentMeetingDto,
	AiDepartmentMeetingCommandResultDto,
	AiDepartmentMeetingCommandStatusDto,
	CreateAiDepartmentMeetingDto,
	UpdateAiDepartmentMeetingDto,
	StartAiDepartmentMeetingDto,
	CancelAiDepartmentMeetingDto,
	RetryAiDepartmentMeetingDto,
	ExcludeAiDepartmentMeetingParticipantDto,
	TakeoverAiDepartmentMeetingDto,
	SaveAiDepartmentMeetingMinutesDto,
	ResolveAiDepartmentMeetingItemDto,
	ResolveAiDepartmentMeetingActionItemDto,
	AiDepartmentDto,
	AiDepartmentWorkActivityDto,
	AiDepartmentAttemptCommandResult,
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkAttemptDto,
	AiDepartmentWorkItemDto,
	AiDepartmentWorkRelationshipDto,
	AiDepartmentWorkClaimSummaryDto,
	AiDepartmentWorkWakeStatus,
	AiDepartmentCancelWorkResult,
	AiDepartmentReviewResult,
	AiDepartmentWorkReviewDecisionDto,
	AiDepartmentWorkReviewReopenResult,
	AiDepartmentWorkActivityResult,
	AiDepartmentToolApprovalAttentionPageDto,
	CreateAiDepartmentGoalDto,
	CreateAiDepartmentDto,
	CreateAiDepartmentMemberDto,
	UpdateAiDepartmentMemberDto,
	CreateAiDepartmentWorkDto,
	ReviewAiDepartmentWorkDto,
	CreateAiDepartmentWorkActivityDto,
	AiDepartmentWorkState,
	SetAiDepartmentExecutorBindingDto,
	ClearAiDepartmentExecutorBindingDto,
	AiDepartmentWorkHelpDetailDto,
	AiDepartmentWorkHelpResponseDto,
	CreateAiDepartmentWorkHelpAnswerDto,
	AiDepartmentWorkHelpAttentionPageDto,
	AiDepartmentOperationsSnapshotDto,
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

export async function listDepartmentMeetings(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentMeetingPageDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/meetings`,
		{ take: 100, skip: 0 },
	);
}

export async function createDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	body: CreateAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings`,
		body,
	);
}

export async function getDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
): Promise<AiDepartmentMeetingDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}`,
	);
}

export async function getDepartmentMeetingCommandStatus(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	requestId: string,
): Promise<AiDepartmentMeetingCommandStatusDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/meetings/commands/${encodeURIComponent(requestId)}`,
	);
}

export async function updateDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: UpdateAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'PATCH',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}`,
		body,
	);
}

export async function startDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: StartAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/start`,
		body,
	);
}

export async function cancelDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: CancelAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/cancel`,
		body,
	);
}

export async function retryDepartmentMeetingParticipant(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	participantId: string,
	body: RetryAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/participants/${encodeURIComponent(participantId)}/retry`,
		body,
	);
}

export async function retryDepartmentMeetingSynthesis(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: RetryAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/synthesis/retry`,
		body,
	);
}

export async function excludeDepartmentMeetingParticipant(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	participantId: string,
	body: ExcludeAiDepartmentMeetingParticipantDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/participants/${encodeURIComponent(participantId)}/exclude`,
		body,
	);
}

export async function takeoverDepartmentMeeting(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: TakeoverAiDepartmentMeetingDto,
): Promise<AiDepartmentMeetingCommandResultDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/takeover`,
		body,
	);
}

export async function saveDepartmentMeetingMinutes(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	body: SaveAiDepartmentMeetingMinutesDto,
) {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/minutes`,
		body,
	);
}

export async function approveDepartmentMeetingMinutes(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	minutesId: string,
	body: ResolveAiDepartmentMeetingItemDto,
) {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/minutes/${encodeURIComponent(minutesId)}/approve`,
		body,
	);
}

export async function resolveDepartmentMeetingActionItem(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	itemId: string,
	decision: 'approve' | 'decline',
	body: ResolveAiDepartmentMeetingItemDto,
) {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/action-items/${encodeURIComponent(itemId)}/${decision}`,
		body,
	);
}

export async function convertDepartmentMeetingActionItem(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	meetingId: string,
	itemId: string,
	body: ResolveAiDepartmentMeetingActionItemDto,
) {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/meetings/${encodeURIComponent(meetingId)}/action-items/${encodeURIComponent(itemId)}/convert`,
		body,
	);
}

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

export async function getDepartmentOperations(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentOperationsSnapshotDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/operations`,
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

export async function listToolApprovalAttention(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentToolApprovalAttentionPageDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/tool-approvals`,
	);
}

export async function getWorkItem(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkItemDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}`,
	);
}

export async function listWorkRelationships(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkRelationshipDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/relationships`,
	);
}

export async function getWorkClaim(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkClaimSummaryDto | null> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/claim`,
	);
}

export async function getWorkWakeStatus(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkWakeStatus> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/wake`,
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

export async function listWorkReviewDecisions(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkReviewDecisionDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/review/decisions`,
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

export async function updateDepartmentMember(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	memberId: string,
	body: UpdateAiDepartmentMemberDto,
): Promise<AiDepartmentMemberDto> {
	return await makeRestApiRequest(
		context,
		'PATCH',
		`${departmentPath(projectId, departmentId)}/members/${memberId}`,
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

export async function startDepartmentWork(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	work: AiDepartmentWorkItemDto,
	requestId: string,
	retry = false,
): Promise<AiDepartmentAttemptCommandResult> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(work.id)}/${retry ? 'retry' : 'start'}`,
		{ requestId, expectedVersion: work.version },
	);
}

export async function cancelDepartmentWork(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	work: AiDepartmentWorkItemDto,
	reason?: string,
): Promise<AiDepartmentCancelWorkResult> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(work.id)}/cancel`,
		{ requestId: crypto.randomUUID(), expectedVersion: work.version, reason },
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

export async function reopenDepartmentWorkReview(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	work: AiDepartmentWorkItemDto,
	reason: string,
): Promise<AiDepartmentWorkReviewReopenResult> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(work.id)}/review/reopen`,
		{ expectedVersion: work.version, reason, requestId: crypto.randomUUID() },
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

export async function listWorkHelpRequests(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
): Promise<AiDepartmentWorkHelpDetailDto[]> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/help-requests`,
	);
}

export async function listWorkHelpAttention(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
): Promise<AiDepartmentWorkHelpAttentionPageDto> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/work-help/attention`,
	);
}

export async function answerWorkHelpRequest(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
	helpRequestId: string,
	dto: CreateAiDepartmentWorkHelpAnswerDto,
): Promise<AiDepartmentWorkHelpResponseDto> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/help-requests/${encodeURIComponent(helpRequestId)}/answer`,
		dto,
	);
}

export async function listDepartmentActivity(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	skip = 0,
): Promise<{ data: AiDepartmentWorkActivityDto[]; count: number }> {
	return await makeRestApiRequest(
		context,
		'GET',
		`${departmentPath(projectId, departmentId)}/activity`,
		{ take: 5, skip },
	);
}

export async function addWorkActivity(
	context: IRestApiContext,
	projectId: string,
	departmentId: string,
	workId: string,
	body: CreateAiDepartmentWorkActivityDto,
): Promise<AiDepartmentWorkActivityResult> {
	return await makeRestApiRequest(
		context,
		'POST',
		`${departmentPath(projectId, departmentId)}/work/${encodeURIComponent(workId)}/activity`,
		body,
	);
}
