import type {
	AiDepartmentDto,
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentMeetingPageDto,
	AiDepartmentMeetingDto,
	AiDepartmentMeetingCommandStatusDto,
	AiDepartmentMeetingPurpose,
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
	AiDepartmentWorkItemDto,
	AiDepartmentWorkAttemptDto,
	AiDepartmentWorkState,
	AiDepartmentCancelWorkResult,
	AiDepartmentWorkActivityResult,
	AiDepartmentWorkActivityDto,
	AiDepartmentToolApprovalAttentionPageDto,
	AiDepartmentOperationsSnapshotDto,
	CreateAiDepartmentWorkActivityDto,
	CreateAiDepartmentDto,
} from '@n8n/api-types';
import { useRootStore } from '@n8n/stores/useRootStore';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
	createDepartmentGoal,
	createDepartment,
	createDepartmentMember,
	updateDepartmentMember,
	createDepartmentWork,
	listDepartments,
	listGoals,
	listMembers,
	listWork,
	listWorkHelpAttention,
	listToolApprovalAttention,
	markDepartmentWorkReady,
	startDepartmentWork,
	reviewDepartmentWork,
	reopenDepartmentWorkReview,
	listProjectAgents,
	getMemberExecutorBinding,
	setMemberExecutorBinding,
	clearMemberExecutorBinding,
	cancelDepartmentWork,
	addWorkActivity,
	listDepartmentActivity,
	createDepartmentMeeting,
	listDepartmentMeetings,
	getDepartmentMeeting,
	getDepartmentMeetingCommandStatus,
	updateDepartmentMeeting,
	startDepartmentMeeting,
	cancelDepartmentMeeting,
	retryDepartmentMeetingParticipant,
	retryDepartmentMeetingSynthesis,
	excludeDepartmentMeetingParticipant,
	takeoverDepartmentMeeting,
	saveDepartmentMeetingMinutes,
	approveDepartmentMeetingMinutes,
	resolveDepartmentMeetingActionItem,
	convertDepartmentMeetingActionItem,
	getDepartmentOperations,
} from './ai-department.api';
import type { AiDepartmentAgent, AiDepartmentMemberBinding } from './ai-department.api';
import type { AiDepartmentSection } from './ai-department.constants';
import { helpLinksFrom, helpWaitingWorkIds } from './office/office-model';

const pendingMeetingCommandsStorageKey = 'aiDepartment.pendingMeetingCommands';

type StoredMeetingCommand = {
	key: string;
	requestId: string;
	projectId: string;
	departmentId: string;
};

function readStoredMeetingCommands(): StoredMeetingCommand[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const value: unknown = JSON.parse(
			sessionStorage.getItem(pendingMeetingCommandsStorageKey) ?? '[]',
		);
		if (!Array.isArray(value)) return [];
		return value.filter(
			(entry): entry is StoredMeetingCommand =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof entry.key === 'string' &&
				typeof entry.requestId === 'string' &&
				typeof entry.projectId === 'string' &&
				typeof entry.departmentId === 'string',
		);
	} catch {
		return [];
	}
}

export const useAiDepartmentStore = defineStore('aiDepartment', () => {
	const pendingMeetingCommands = new Map<string, string>();
	const pendingMeetingCommandScopes = new Map<
		string,
		{ projectId: string; departmentId: string }
	>();
	for (const command of readStoredMeetingCommands()) {
		pendingMeetingCommands.set(command.key, command.requestId);
		pendingMeetingCommandScopes.set(command.requestId, {
			projectId: command.projectId,
			departmentId: command.departmentId,
		});
	}
	const pendingWorkCommands = new Map<string, string>();
	const pendingWorkActivityCommands = new Map<string, { requestId: string; body: string }>();
	const rootStore = useRootStore();
	const isReady = ref(false);
	const departments = ref<AiDepartmentDto[]>([]);
	const selectedDepartmentId = ref<string>();
	const members = ref<AiDepartmentMemberDto[]>([]);
	const agents = ref<AiDepartmentAgent[]>([]);
	const goals = ref<AiDepartmentGoalDto[]>([]);
	const meetings = ref<AiDepartmentMeetingPageDto['items']>([]);
	const meetingDetail = ref<AiDepartmentMeetingDto | null>(null);
	const meetingsLoading = ref(false);
	const meetingsLoadFailed = ref(false);
	const meetingsAccessLost = ref(false);
	const meetingsDisconnected = ref(false);
	const overviewWork = ref<AiDepartmentWorkItemDto[]>([]);
	const toolApprovalAttention = ref<AiDepartmentToolApprovalAttentionPageDto>({
		items: [],
		hasMore: false,
	});
	const toolApprovalLoadFailed = ref(false);
	const waitingWorkIds = ref<ReadonlySet<string>>(new Set());
	const helpLinks = ref<Array<{ requesterId: string; recipientId: string }>>([]);
	const operationsRevision = ref(0);
	const recentActivity = ref<AiDepartmentWorkActivityDto[]>([]);
	const work = ref<AiDepartmentWorkItemDto[]>([]);
	const workCount = ref(0);
	const section = ref<AiDepartmentSection>('overview');
	const loading = ref(false);
	const saving = ref(false);
	const meetingCommandBlocked = ref(false);
	const error = ref<unknown>();
	const lastSyncedAt = ref<number | null>(null);
	const syncFailed = ref(false);
	const activityLoadFailed = ref(false);
	const accessLost = ref(false);
	let syncSequence = 0;
	let departmentLoadSequence = 0;
	let workListSequence = 0;
	let meetingListSequence = 0;
	const department = computed(
		() => departments.value.find(({ id }) => id === selectedDepartmentId.value) ?? null,
	);
	const attentionWork = computed(() =>
		overviewWork.value.filter(({ state }) => ['review', 'blocked'].includes(state)),
	);
	const activeWork = computed(() =>
		overviewWork.value.filter(({ state }) => ['running', 'ready'].includes(state)),
	);

	async function load(projectId: string, preferredDepartmentId?: string) {
		loading.value = true;
		error.value = undefined;
		try {
			departments.value = await listDepartments(rootStore.restApiContext, projectId);
			const previousDepartmentId = selectedDepartmentId.value;
			const nextId = departments.value.some(({ id }) => id === preferredDepartmentId)
				? preferredDepartmentId
				: departments.value.some(({ id }) => id === selectedDepartmentId.value)
					? selectedDepartmentId.value
					: departments.value[0]?.id;
			if (nextId !== previousDepartmentId) {
				meetingListSequence++;
				meetings.value = [];
				meetingDetail.value = null;
				meetingsLoading.value = false;
				meetingsLoadFailed.value = false;
				meetingsAccessLost.value = false;
				meetingsDisconnected.value = false;
			}
			selectedDepartmentId.value = nextId;
			if (nextId) await loadDepartment(projectId, nextId);
			else clearDepartmentData();
		} catch (cause) {
			departments.value = [];
			clearDepartmentData();
			error.value = cause;
		} finally {
			loading.value = false;
			isReady.value = true;
		}
	}

	async function loadDepartment(projectId: string, departmentId: string) {
		if (selectedDepartmentId.value !== departmentId) {
			operationsRevision.value = 0;
			meetingListSequence++;
			meetings.value = [];
			meetingDetail.value = null;
			meetingsLoading.value = false;
			meetingsLoadFailed.value = false;
			meetingsAccessLost.value = false;
			meetingsDisconnected.value = false;
			toolApprovalAttention.value = { items: [], hasMore: false };
			toolApprovalLoadFailed.value = false;
		}
		selectedDepartmentId.value = departmentId;
		const request = ++departmentLoadSequence;
		const workRequest = ++workListSequence;
		const requests = await Promise.allSettled([
			listMembers(rootStore.restApiContext, projectId, departmentId),
			listGoals(rootStore.restApiContext, projectId, departmentId),
			listWork(rootStore.restApiContext, projectId, departmentId, { take: 100, skip: 0 }),
			listDepartmentActivity(rootStore.restApiContext, projectId, departmentId),
			listToolApprovalAttention(rootStore.restApiContext, projectId, departmentId),
		]);
		if (request !== departmentLoadSequence || selectedDepartmentId.value !== departmentId) return;
		const [membersResult, goalsResult, workResult, activityResult, approvalResult] = requests;
		members.value = membersResult.status === 'fulfilled' ? membersResult.value : [];
		goals.value = goalsResult.status === 'fulfilled' ? goalsResult.value : [];
		if (workRequest === workListSequence) {
			work.value = workResult.status === 'fulfilled' ? workResult.value.data : [];
			overviewWork.value = work.value;
			workCount.value = workResult.status === 'fulfilled' ? workResult.value.count : 0;
		}
		recentActivity.value = activityResult.status === 'fulfilled' ? activityResult.value.data : [];
		toolApprovalAttention.value =
			approvalResult.status === 'fulfilled' ? approvalResult.value : { items: [], hasMore: false };
		toolApprovalLoadFailed.value = approvalResult.status === 'rejected';
		activityLoadFailed.value = activityResult.status === 'rejected';
		const failed = requests.slice(0, 4).find((result) => result.status === 'rejected');
		error.value = failed?.status === 'rejected' ? failed.reason : undefined;
		if (approvalResult.status === 'rejected' && isAccessLoss(approvalResult.reason)) {
			clearDepartmentData();
			accessLost.value = true;
			return;
		}
		accessLost.value = false;
		syncFailed.value = Boolean(failed);
		if (!failed) lastSyncedAt.value = Date.now();
	}

	function isAccessLoss(cause: unknown) {
		const status =
			typeof cause === 'object' && cause !== null && 'httpStatusCode' in cause
				? cause.httpStatusCode
				: undefined;
		return status === 403 || status === 404;
	}

	/**
	 * Refresh members, goals and overview work without a loading state.
	 * Keeps the last known data when the request fails. An access error clears it.
	 * Only the newest request may write, so a slow older response cannot overwrite newer data.
	 */
	async function refreshQuiet(projectId: string) {
		const departmentId = selectedDepartmentId.value;
		if (!departmentId) return;
		const sequence = ++syncSequence;
		const results = await Promise.allSettled([
			listMembers(rootStore.restApiContext, projectId, departmentId),
			listGoals(rootStore.restApiContext, projectId, departmentId),
			listWork(rootStore.restApiContext, projectId, departmentId, { take: 100, skip: 0 }),
			listDepartmentActivity(rootStore.restApiContext, projectId, departmentId),
			listToolApprovalAttention(rootStore.restApiContext, projectId, departmentId),
		]);
		if (sequence !== syncSequence || selectedDepartmentId.value !== departmentId) return;
		const [membersResult, goalsResult, workResult, activityResult, approvalResult] = results;
		const rejected = results.slice(0, 4).find((result) => result.status === 'rejected');
		toolApprovalLoadFailed.value = approvalResult.status === 'rejected';
		if (approvalResult.status === 'fulfilled') toolApprovalAttention.value = approvalResult.value;
		else if (isAccessLoss(approvalResult.reason)) {
			clearDepartmentData();
			accessLost.value = true;
			syncFailed.value = true;
			return;
		}
		if (rejected?.status === 'rejected') {
			syncFailed.value = true;
			activityLoadFailed.value = activityResult.status === 'rejected';
			if (activityResult.status === 'fulfilled') {
				recentActivity.value = activityResult.value.data;
			}
			if (isAccessLoss(rejected.reason)) {
				clearDepartmentData();
				accessLost.value = true;
			}
			return;
		}
		if (
			membersResult.status === 'fulfilled' &&
			goalsResult.status === 'fulfilled' &&
			workResult.status === 'fulfilled' &&
			activityResult.status === 'fulfilled'
		) {
			members.value = membersResult.value;
			goals.value = goalsResult.value;
			overviewWork.value = workResult.value.data;
			recentActivity.value = activityResult.value.data;
			activityLoadFailed.value = false;
			syncFailed.value = false;
			accessLost.value = false;
			lastSyncedAt.value = Date.now();
		}
	}

	async function refreshOperations(projectId: string, departmentId: string, revision: number) {
		if (selectedDepartmentId.value !== departmentId || revision <= operationsRevision.value) return;
		const sequence = ++syncSequence;
		try {
			const snapshot: AiDepartmentOperationsSnapshotDto = await getDepartmentOperations(
				rootStore.restApiContext,
				projectId,
				departmentId,
			);
			if (
				sequence !== syncSequence ||
				selectedDepartmentId.value !== departmentId ||
				snapshot.revision < revision
			) {
				return;
			}
			members.value = snapshot.members;
			overviewWork.value = snapshot.work.data;
			workCount.value = snapshot.work.count;
			recentActivity.value = snapshot.activity.data;
			activityLoadFailed.value = false;
			waitingWorkIds.value = helpWaitingWorkIds(snapshot.helpRequests.items);
			helpLinks.value = helpLinksFrom(snapshot.helpRequests.items);
			operationsRevision.value = snapshot.revision;
			accessLost.value = false;
			syncFailed.value = false;
			lastSyncedAt.value = Date.now();
		} catch (cause) {
			if (sequence !== syncSequence || selectedDepartmentId.value !== departmentId) return;
			syncFailed.value = true;
			error.value = cause;
			if (isAccessLoss(cause)) {
				clearDepartmentData();
				accessLost.value = true;
			}
		}
	}

	function clearDepartmentData() {
		departmentLoadSequence++;
		workListSequence++;
		meetingListSequence++;
		selectedDepartmentId.value = undefined;
		operationsRevision.value = 0;
		members.value = [];
		goals.value = [];
		work.value = [];
		overviewWork.value = [];
		toolApprovalAttention.value = { items: [], hasMore: false };
		toolApprovalLoadFailed.value = false;
		recentActivity.value = [];
		activityLoadFailed.value = false;
		workCount.value = 0;
		meetings.value = [];
		meetingDetail.value = null;
		meetingsLoading.value = false;
		meetingsLoadFailed.value = false;
		meetingsAccessLost.value = false;
		meetingsDisconnected.value = false;
	}

	async function selectDepartment(projectId: string, departmentId: string) {
		loading.value = true;
		error.value = undefined;
		try {
			await loadDepartment(projectId, departmentId);
		} catch (cause) {
			clearDepartmentData();
			error.value = cause;
		} finally {
			loading.value = false;
		}
	}

	async function refreshWork(
		projectId: string,
		options: {
			search?: string;
			state?: AiDepartmentWorkState;
			skip?: number;
		} = {},
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const request = ++workListSequence;
		const response = await listWork(rootStore.restApiContext, projectId, departmentId, {
			take: 100,
			skip: options.skip ?? 0,
			...options,
		});
		if (request !== workListSequence || selectedDepartmentId.value !== departmentId) return;
		work.value = response.data;
		workCount.value = response.count;
		if (!options.search && !options.state && !options.skip) overviewWork.value = response.data;
	}

	async function createGoal(projectId: string, title: string) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentGoal(rootStore.restApiContext, projectId, selectedDepartmentId.value, {
				title,
				requestId: crypto.randomUUID(),
			});
			goals.value = await listGoals(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function loadMeetings(projectId: string) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const request = ++meetingListSequence;
		meetingsLoading.value = true;
		meetingsAccessLost.value = false;
		meetingsDisconnected.value = false;
		try {
			const result = await listDepartmentMeetings(
				rootStore.restApiContext,
				projectId,
				departmentId,
			);
			if (request !== meetingListSequence || selectedDepartmentId.value !== departmentId) return;
			meetings.value = result.items;
			meetingsLoadFailed.value = false;
			meetingsAccessLost.value = false;
			meetingsDisconnected.value = false;
		} catch (cause) {
			if (request !== meetingListSequence || selectedDepartmentId.value !== departmentId) return;
			if (isAccessLoss(cause)) {
				meetings.value = [];
				meetingDetail.value = null;
				meetingsAccessLost.value = true;
				meetingsLoadFailed.value = false;
				meetingsDisconnected.value = false;
			} else {
				meetingsLoadFailed.value = true;
				meetingsDisconnected.value = typeof navigator !== 'undefined' && !navigator.onLine;
			}
		} finally {
			if (request === meetingListSequence) meetingsLoading.value = false;
		}
	}

	async function createMeeting(
		projectId: string,
		input: {
			purpose: AiDepartmentMeetingPurpose;
			topic: string;
			desiredOutcome: string;
			participantMemberIds: string[];
			facilitatorMemberId: string;
			approvedDecisionIds?: string[];
		},
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		const departmentId = selectedDepartmentId.value;
		const payload = {
			...input,
			approvedDecisionIds: input.approvedDecisionIds ?? [],
			referencedWorkIds: [],
		};
		const requestKey = `meeting.create:${projectId}:${departmentId}`;
		try {
			const requestId = await prepareMeetingCommand(requestKey, projectId, departmentId);
			const body: CreateAiDepartmentMeetingDto = { ...payload, requestId };
			await createDepartmentMeeting(rootStore.restApiContext, projectId, departmentId, body);
			clearMeetingCommandId(requestKey);
			if (selectedDepartmentId.value === departmentId) await loadMeetings(projectId);
		} finally {
			saving.value = false;
		}
	}

	async function prepareMeetingCommand(key: string, projectId: string, departmentId: string) {
		const existingRequestId = pendingMeetingCommands.get(key);
		const requestId = existingRequestId ?? crypto.randomUUID();
		const retryingUncertainRequest =
			existingRequestId !== undefined && pendingMeetingCommandScopes.has(existingRequestId);
		await resolvePendingMeetingCommands(
			projectId,
			departmentId,
			retryingUncertainRequest ? requestId : null,
		);
		pendingMeetingCommands.set(key, requestId);
		pendingMeetingCommandScopes.set(requestId, { projectId, departmentId });
		persistPendingMeetingCommands();
		return requestId;
	}

	function persistPendingMeetingCommands() {
		if (typeof sessionStorage === 'undefined') return;
		const commands: StoredMeetingCommand[] = Array.from(
			pendingMeetingCommandScopes.entries(),
			([requestId, scope]) => ({
				key:
					Array.from(pendingMeetingCommands.entries()).find(
						([, value]) => value === requestId,
					)?.[0] ?? '',
				requestId,
				...scope,
			}),
		).filter(({ key }) => key.length > 0);
		try {
			sessionStorage.setItem(pendingMeetingCommandsStorageKey, JSON.stringify(commands));
		} catch {
			// Keep command recovery in memory when session storage is unavailable.
		}
	}

	function clearMeetingCommandId(key: string) {
		const requestId = pendingMeetingCommands.get(key);
		pendingMeetingCommands.delete(key);
		if (requestId) pendingMeetingCommandScopes.delete(requestId);
		persistPendingMeetingCommands();
	}

	async function resolvePendingMeetingCommands(
		projectId: string,
		departmentId: string,
		currentRequestId: string | null,
	) {
		meetingCommandBlocked.value = false;
		for (const [requestId, scope] of pendingMeetingCommandScopes) {
			if (
				requestId === currentRequestId ||
				scope.projectId !== projectId ||
				scope.departmentId !== departmentId
			) {
				continue;
			}

			let status: AiDepartmentMeetingCommandStatusDto;
			try {
				status = await getDepartmentMeetingCommandStatus(
					rootStore.restApiContext,
					projectId,
					departmentId,
					requestId,
				);
			} catch (error) {
				meetingCommandBlocked.value = true;
				throw error;
			}
			if (status.status !== 'completed') {
				meetingCommandBlocked.value = true;
				throw new Error('A previous meeting command is still unresolved.');
			}

			pendingMeetingCommandScopes.delete(requestId);
			for (const [key, pendingRequestId] of pendingMeetingCommands) {
				if (pendingRequestId === requestId) pendingMeetingCommands.delete(key);
			}
			persistPendingMeetingCommands();
			if (selectedDepartmentId.value === departmentId) {
				if (status.meetingId) await loadMeeting(projectId, status.meetingId);
				await loadMeetings(projectId);
			}
		}
	}

	async function loadMeeting(projectId: string, meetingId: string) {
		if (!selectedDepartmentId.value) return;
		try {
			meetingDetail.value = await getDepartmentMeeting(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				meetingId,
			);
		} catch (cause) {
			if (isAccessLoss(cause)) meetingDetail.value = null;
			throw cause;
		}
	}

	async function loadApprovedDecisionChoices(projectId: string, sourceMeetingId: string) {
		const departmentId = selectedDepartmentId.value;
		if (!departmentId) return [];
		const source = await getDepartmentMeeting(
			rootStore.restApiContext,
			projectId,
			departmentId,
			sourceMeetingId,
		);
		if (!['approved', 'completed'].includes(source.state)) return [];
		return source.minutes
			.filter((minutes) => minutes.state === 'approved' && minutes.approvedAt !== null)
			.flatMap((minutes) =>
				minutes.decisions
					.filter((decision) => decision.state === 'approved' && decision.text.length > 0)
					.map((decision) => ({
						id: decision.id,
						text: decision.text,
						meetingId: source.id,
						minutesRevision: minutes.revision,
					})),
			);
	}

	async function updateMeeting(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		changes: Omit<UpdateAiDepartmentMeetingDto, 'expectedVersion' | 'requestId'>,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.update:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const result = await updateDepartmentMeeting(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			{
				...changes,
				expectedVersion: meeting.version,
				requestId,
			},
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function startMeeting(projectId: string, meeting: AiDepartmentMeetingDto) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.start:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: StartAiDepartmentMeetingDto = {
			expectedVersion: meeting.version,
			requestId,
		};
		const result = await startDepartmentMeeting(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function cancelMeeting(projectId: string, meeting: AiDepartmentMeetingDto) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.cancel:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: CancelAiDepartmentMeetingDto = { requestId };
		const result = await cancelDepartmentMeeting(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function retryMeetingParticipant(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		participantId: string,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.retry:${meeting.id}:${participantId}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: RetryAiDepartmentMeetingDto = {
			expectedVersion: meeting.version,
			requestId,
		};
		const result = await retryDepartmentMeetingParticipant(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			participantId,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function retryMeetingSynthesis(projectId: string, meeting: AiDepartmentMeetingDto) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.synthesis.retry:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: RetryAiDepartmentMeetingDto = {
			expectedVersion: meeting.version,
			requestId,
		};
		const result = await retryDepartmentMeetingSynthesis(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function excludeMeetingParticipant(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		participantId: string,
		reason: string,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.exclude:${meeting.id}:${participantId}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: ExcludeAiDepartmentMeetingParticipantDto = {
			expectedVersion: meeting.version,
			reason,
			requestId,
		};
		const result = await excludeDepartmentMeetingParticipant(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			participantId,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function takeoverMeeting(projectId: string, meeting: AiDepartmentMeetingDto) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.takeover:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: TakeoverAiDepartmentMeetingDto = {
			expectedVersion: meeting.version,
			requestId,
		};
		const result = await takeoverDepartmentMeeting(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId)
			await Promise.all([loadMeeting(projectId, meeting.id), loadMeetings(projectId)]);
		return result;
	}

	async function saveMeetingMinutes(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		content: Omit<SaveAiDepartmentMeetingMinutesDto, 'expectedVersion' | 'requestId'>,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.minutes:${meeting.id}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const result = await saveDepartmentMeetingMinutes(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			{
				...content,
				expectedVersion: meeting.version,
				requestId,
			},
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId) await loadMeeting(projectId, meeting.id);
		return result;
	}

	async function approveMeetingMinutes(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		minutesId: string,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.minutes.approve:${meeting.id}:${minutesId}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const result = await approveDepartmentMeetingMinutes(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			minutesId,
			{ expectedVersion: meeting.version, requestId },
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId) await loadMeeting(projectId, meeting.id);
		return result;
	}

	async function resolveMeetingActionItem(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		itemId: string,
		decision: 'approve' | 'decline',
		reason?: string,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.action:${meeting.id}:${itemId}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: ResolveAiDepartmentMeetingItemDto = {
			expectedVersion: meeting.version,
			requestId,
			reason,
		};
		const result = await resolveDepartmentMeetingActionItem(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			itemId,
			decision,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId) await loadMeeting(projectId, meeting.id);
		return result;
	}

	async function convertMeetingActionItem(
		projectId: string,
		meeting: AiDepartmentMeetingDto,
		itemId: string,
		reason?: string | null,
	) {
		if (!selectedDepartmentId.value) return;
		const departmentId = selectedDepartmentId.value;
		const commandKey = `meeting.action:${meeting.id}:${itemId}`;
		const requestId = await prepareMeetingCommand(commandKey, projectId, departmentId);
		const body: ResolveAiDepartmentMeetingActionItemDto = {
			expectedVersion: meeting.version,
			requestId,
			reason,
		};
		const result = await convertDepartmentMeetingActionItem(
			rootStore.restApiContext,
			projectId,
			departmentId,
			meeting.id,
			itemId,
			body,
		);
		clearMeetingCommandId(commandKey);
		if (selectedDepartmentId.value === departmentId) await loadMeeting(projectId, meeting.id);
		return result;
	}

	async function createDepartmentItem(projectId: string, name: string) {
		saving.value = true;
		try {
			await createDepartment(rootStore.restApiContext, projectId, {
				name,
				requestId: crypto.randomUUID(),
			} satisfies CreateAiDepartmentDto);
			departments.value = await listDepartments(rootStore.restApiContext, projectId);
			const created = departments.value.find((item) => item.name === name);
			if (created) await loadDepartment(projectId, created.id);
		} finally {
			saving.value = false;
		}
	}

	function markReadyFlag() {
		isReady.value = true;
	}

	async function createMember(projectId: string, name: string, role: string) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentMember(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				{
					name,
					role,
					expertiseTags: [],
					requestId: crypto.randomUUID(),
				},
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function loadHelpWaiting(projectId: string) {
		const departmentId = selectedDepartmentId.value;
		if (!departmentId) return;
		try {
			const page = await listWorkHelpAttention(rootStore.restApiContext, projectId, departmentId);
			if (selectedDepartmentId.value === departmentId) {
				waitingWorkIds.value = helpWaitingWorkIds(page.items);
				helpLinks.value = helpLinksFrom(page.items);
			}
		} catch {
			// Keep the last known set. Blocked work then shows as blocked, never as waiting.
		}
	}

	async function patchMember(
		projectId: string,
		member: AiDepartmentMemberDto,
		patch: { managerMemberId: string | null } | { expertiseTags: string[] },
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await updateDepartmentMember(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				member.id,
				{ ...patch, expectedVersion: member.version, requestId: crypto.randomUUID() },
			);
		} finally {
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
			saving.value = false;
		}
	}

	async function setMemberManager(
		projectId: string,
		member: AiDepartmentMemberDto,
		managerMemberId: string | null,
	) {
		if (member.managerMemberId === managerMemberId) return;
		await patchMember(projectId, member, { managerMemberId });
	}

	async function setMemberExpertise(
		projectId: string,
		member: AiDepartmentMemberDto,
		expertiseTags: string[],
	) {
		await patchMember(projectId, member, { expertiseTags });
	}

	async function loadAgents(projectId: string) {
		agents.value = await listProjectAgents(rootStore.restApiContext, projectId);
	}

	async function loadMemberBinding(
		projectId: string,
		memberId: string,
	): Promise<AiDepartmentMemberBinding> {
		if (!selectedDepartmentId.value) throw new Error('No department is selected.');
		return await getMemberExecutorBinding(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			memberId,
		);
	}

	async function setMemberBinding(
		projectId: string,
		member: AiDepartmentMemberDto,
		executorId: string,
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await setMemberExecutorBinding(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				member.id,
				{
					provider: 'n8n-agent',
					executorId,
					expectedVersion: member.version,
					requestId: crypto.randomUUID(),
				},
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function clearMemberBinding(projectId: string, member: AiDepartmentMemberDto) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await clearMemberExecutorBinding(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				member.id,
				{ expectedVersion: member.version, requestId: crypto.randomUUID() },
			);
			members.value = await listMembers(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
			);
		} finally {
			saving.value = false;
		}
	}

	async function createWorkItem(
		projectId: string,
		instruction: string,
		assigneeMemberId: string | undefined,
		goalId: string | undefined,
	) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			await createDepartmentWork(rootStore.restApiContext, projectId, selectedDepartmentId.value, {
				instruction,
				assigneeMemberId: assigneeMemberId ?? null,
				goalId: goalId ?? null,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId: crypto.randomUUID(),
			});
			await refreshWork(projectId);
		} finally {
			saving.value = false;
		}
	}

	async function markWorkReady(projectId: string, item: AiDepartmentWorkItemDto) {
		if (!selectedDepartmentId.value) return;
		await markDepartmentWorkReady(
			rootStore.restApiContext,
			projectId,
			selectedDepartmentId.value,
			item,
			crypto.randomUUID(),
		);
		await refreshWork(projectId);
	}

	async function startWork(projectId: string, item: AiDepartmentWorkItemDto, retry = false) {
		if (!selectedDepartmentId.value) throw new Error('No department is selected.');
		const commandKey = `work.${retry ? 'retry' : 'start'}:${item.id}:${item.version}`;
		let requestId = pendingWorkCommands.get(commandKey);
		if (!requestId) {
			requestId = crypto.randomUUID();
			pendingWorkCommands.set(commandKey, requestId);
		}
		saving.value = true;
		try {
			const result = await startDepartmentWork(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				item,
				requestId,
				retry,
			);
			pendingWorkCommands.delete(commandKey);
			await refreshWork(projectId);
			return result;
		} finally {
			saving.value = false;
		}
	}

	async function cancelWork(
		projectId: string,
		item: AiDepartmentWorkItemDto,
		reason?: string,
	): Promise<AiDepartmentCancelWorkResult> {
		if (!selectedDepartmentId.value) throw new Error('No department is selected.');
		saving.value = true;
		try {
			const result = await cancelDepartmentWork(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				item,
				reason,
			);
			await refreshWork(projectId);
			return result;
		} finally {
			saving.value = false;
		}
	}

	async function addActivity(
		projectId: string,
		item: AiDepartmentWorkItemDto,
		action: CreateAiDepartmentWorkActivityDto['action'],
		body: string,
	): Promise<AiDepartmentWorkActivityResult> {
		if (!selectedDepartmentId.value) throw new Error('No department is selected.');
		const commandKey = `${item.id}:${item.version}:${action}`;
		let pending = pendingWorkActivityCommands.get(commandKey);
		if (pending && pending.body !== body) {
			throw new Error('Retry the pending update before changing its text.');
		}
		if (!pending) {
			pending = { requestId: crypto.randomUUID(), body };
			pendingWorkActivityCommands.set(commandKey, pending);
		}
		saving.value = true;
		try {
			const result = await addWorkActivity(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				item.id,
				{
					action,
					body,
					expectedVersion: item.version,
					requestId: pending.requestId,
				},
			);
			pendingWorkActivityCommands.delete(commandKey);
			await refreshWork(projectId);
			return result;
		} finally {
			saving.value = false;
		}
	}

	async function review(
		projectId: string,
		item: AiDepartmentWorkItemDto,
		attempt: AiDepartmentWorkAttemptDto,
		decision: 'accept' | 'return',
		reason?: string,
	) {
		if (!selectedDepartmentId.value || !item.currentAttemptId) return;
		const reviewContext =
			attempt.submittedResultId &&
			attempt.reviewRoundId &&
			attempt.reviewActiveStageId &&
			attempt.reviewRoundVersion
				? {
						resultId: attempt.submittedResultId,
						reviewRoundId: attempt.reviewRoundId,
						stageId: attempt.reviewActiveStageId,
						expectedReviewVersion: attempt.reviewRoundVersion,
					}
				: {};
		saving.value = true;
		try {
			await reviewDepartmentWork(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				item,
				{
					attemptId: item.currentAttemptId,
					...reviewContext,
					decision,
					reason,
					requestId: crypto.randomUUID(),
				},
			);
			await refreshWork(projectId);
		} finally {
			saving.value = false;
		}
	}

	async function reopenReview(projectId: string, item: AiDepartmentWorkItemDto, reason: string) {
		if (!selectedDepartmentId.value) return;
		saving.value = true;
		try {
			const result = await reopenDepartmentWorkReview(
				rootStore.restApiContext,
				projectId,
				selectedDepartmentId.value,
				item,
				reason,
			);
			await refreshWork(projectId);
			return result;
		} finally {
			saving.value = false;
		}
	}

	return {
		departments,
		isReady,
		selectedDepartmentId,
		members,
		agents,
		goals,
		meetings,
		meetingDetail,
		meetingsLoading,
		meetingsLoadFailed,
		meetingsAccessLost,
		meetingsDisconnected,
		work,
		overviewWork,
		toolApprovalAttention,
		toolApprovalLoadFailed,
		recentActivity,
		activityLoadFailed,
		workCount,
		section,
		loading,
		saving,
		meetingCommandBlocked,
		error,
		lastSyncedAt,
		syncFailed,
		accessLost,
		refreshQuiet,
		refreshOperations,
		department,
		attentionWork,
		activeWork,
		load,
		markReady: markReadyFlag,
		selectDepartment,
		refreshWork,
		createGoal,
		loadMeetings,
		loadMeeting,
		loadApprovedDecisionChoices,
		updateMeeting,
		createMeeting,
		startMeeting,
		cancelMeeting,
		retryMeetingParticipant,
		retryMeetingSynthesis,
		excludeMeetingParticipant,
		takeoverMeeting,
		saveMeetingMinutes,
		approveMeetingMinutes,
		resolveMeetingActionItem,
		convertMeetingActionItem,
		createDepartmentItem,
		createMember,
		setMemberManager,
		setMemberExpertise,
		waitingWorkIds,
		helpLinks,
		loadHelpWaiting,
		loadAgents,
		loadMemberBinding,
		setMemberBinding,
		clearMemberBinding,
		createWorkItem,
		markWorkReady,
		startWork,
		cancelWork,
		addActivity,
		review,
		reopenReview,
	};
});
