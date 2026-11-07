<script setup lang="ts">
import type {
	AiDepartmentMemberDto,
	AiDepartmentWorkActivityDto,
	AiDepartmentWorkItemDto,
	AiDepartmentWorkState,
	AiDepartmentWorkHelpRequestDto,
	CreateAiDepartmentWorkHelpAnswerDto,
} from '@n8n/api-types';
import {
	N8nButton,
	N8nEmptyState,
	N8nInput,
	N8nOption,
	N8nSelect,
	N8nTabs,
	N8nTag,
	useMessage,
} from '@n8n/design-system';
import type { TabOptions } from '@n8n/design-system';
import { capabilities, capabilityRegistry, componentRegistry } from '@n8n/frontend-module-sdk';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { getResourcePermissions } from '@n8n/permissions';
import { useRootStore } from '@n8n/stores/useRootStore';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
	getWorkItem,
	getWorkClaim,
	getWorkWakeStatus,
	listAttempts,
	listWorkHistory,
	listWorkReviewDecisions,
	listWorkActivity,
	listWorkHelpRequests,
	listWorkHelpAttention,
	answerWorkHelpRequest,
	listWorkRelationships,
} from '../ai-department.api';
import type { AiDepartmentMemberBinding, AiDepartmentWorkTransition } from '../ai-department.api';
import {
	AI_DEPARTMENT_OFFICE_VIEW,
	AI_DEPARTMENT_POLL_INTERVAL_MS,
	type AiDepartmentSection,
} from '../ai-department.constants';
import { AI_DEPARTMENT_SECTIONS, parseAiDepartmentSection } from '../department-navigation';
import { useAiDepartmentStore } from '../ai-department.store';
import GoalTree from '../components/GoalTree.vue';
import GoalDetail from '../components/GoalDetail.vue';
import MemberPanel from '../components/MemberPanel.vue';
import OrgCanvas from '../components/OrgCanvas.vue';
import RuntimeAttemptList from '../components/RuntimeAttemptList.vue';
import WorkCompletionReport from '../components/WorkCompletionReport.vue';
import WorkHelpPanel from '../components/WorkHelpPanel.vue';
import { useVisiblePolling } from '../composables/useVisiblePolling';
import { resolveWorkDeepLink } from '../work-deep-link';
import { getWorkEmptyStateKey } from '../work-empty-state';
import { parseWorkListQuery } from '../work-query-state';
import { registerAiDepartmentLocales } from '../ai-department.i18n';
import { areWorkBlockersResolved, getBlockerWorkIds } from '../work-relations';
import { DEBOUNCE_TIME } from '@n8n/frontend-constants/durations';
import { getDebounceTime, useDebounce } from '@n8n/composables/useDebounce';
import { useUsersStore } from '@n8n/stores/users.store';

const i18n = useI18n();
registerAiDepartmentLocales();
const message = useMessage();
const route = useRoute();
const router = useRouter();
const store = useAiDepartmentStore();
const rootStore = useRootStore();
const usersStore = useUsersStore();
const { debounce } = useDebounce();
const permissions = capabilityRegistry.use(capabilities.projectPermissions);
const ProjectHeader = computed(() => componentRegistry.get('project-header'));
const PageViewLayout = computed(() => componentRegistry.get('page-view-layout'));
const projectId = computed(() =>
	typeof route.params.projectId === 'string' ? route.params.projectId : undefined,
);
const departmentIdFromRoute = computed(() =>
	typeof route.query.departmentId === 'string' ? route.query.departmentId : undefined,
);
const section = computed<AiDepartmentSection>(() => {
	return parseAiDepartmentSection(route.query.section);
});
const highlightedMemberId = computed(() =>
	typeof route.query.memberId === 'string' ? route.query.memberId : null,
);
const workIdFromRoute = computed(() =>
	typeof route.query.workId === 'string' ? route.query.workId : undefined,
);
const orgPositionScope = computed(() => {
	const userId = usersStore.currentUser?.id;
	const departmentId = store.selectedDepartmentId;
	if (!userId || !projectId.value || !departmentId) return undefined;
	return { userId, projectId: projectId.value, departmentId };
});
const canUpdate = computed(() => {
	if (!projectId.value) return false;
	const agent = getResourcePermissions(permissions.scopesFor(projectId.value)).agent;
	return !permissions.isReadOnly() && Boolean(agent?.update);
});
const canCreate = computed(() => {
	if (!projectId.value) return false;
	const agent = getResourcePermissions(permissions.scopesFor(projectId.value)).agent;
	return !permissions.isReadOnly() && Boolean(agent?.create);
});
const canExecute = computed(() => {
	if (!projectId.value) return false;
	const agent = getResourcePermissions(permissions.scopesFor(projectId.value)).agent;
	return !permissions.isReadOnly() && Boolean(agent?.execute);
});
const workStateOptions: AiDepartmentWorkState[] = [
	'backlog',
	'ready',
	'running',
	'review',
	'blocked',
	'done',
	'cancelled',
];
const initialWorkQuery = parseWorkListQuery(
	route.query.workSearch,
	route.query.workState,
	route.query.workPage,
	workStateOptions,
);
const MAX_BLOCKER_STATUS_READS = 100;
const departmentName = ref('');
const goalTitle = ref('');
const memberName = ref('');
const memberRole = ref('');
const workInstruction = ref('');
const workAssignee = ref('');
const workGoal = ref('');
const workSearch = ref(initialWorkQuery.search);
const workFilter = ref<AiDepartmentWorkState | ''>(initialWorkQuery.state);
const workPage = ref(initialWorkQuery.page);
const workEmptyStateKey = computed(() =>
	getWorkEmptyStateKey(canCreate.value, Boolean(workSearch.value.trim() || workFilter.value)),
);
const selectedWork = ref<AiDepartmentWorkItemDto | null>(null);
const selectedGoalId = ref<string | null>(null);
const selectedGoal = computed(
	() => store.goals.find(({ id }) => id === selectedGoalId.value) ?? null,
);
const attempts = ref<Awaited<ReturnType<typeof listAttempts>>>([]);
const history = ref<AiDepartmentWorkTransition[]>([]);
const reviewDecisions = ref<Awaited<ReturnType<typeof listWorkReviewDecisions>>>([]);
const workActivity = ref<AiDepartmentWorkActivityDto[]>([]);
const workHelpRequests = ref<Awaited<ReturnType<typeof listWorkHelpRequests>>>([]);
const workHelpAttention = ref<Awaited<ReturnType<typeof listWorkHelpAttention>> | null>(null);
const workHelpAttentionLoadFailed = ref(false);
const waitingWorkIds = computed(() => store.waitingWorkIds);
const helpAnswerSubmittingRequestId = ref<string | null>(null);
const workUpdateText = ref('');
const workRelationships = ref<Awaited<ReturnType<typeof listWorkRelationships>>>([]);
const workClaim = ref<Awaited<ReturnType<typeof getWorkClaim>>>(null);
const workWake = ref<Awaited<ReturnType<typeof getWorkWakeStatus>> | null>(null);
const relatedWorkItems = ref<Record<string, AiDepartmentWorkItemDto>>({});
const relationshipLoadFailed = ref(false);
const activityCount = ref(0);
let detailRequest = 0;
let deepLinkRequest = 0;
let applyingWorkQuery = false;
let resettingWorkPageForFilter = false;
const returnReason = ref('');
const returnFormWorkId = ref<string | null>(null);
const reopenReason = ref('');
const actionError = ref('');
const dispatchNotice = ref('');
const detailLoading = ref(false);
const detailStale = ref(false);
const detailAccessLost = ref(false);
const bindingMember = ref<AiDepartmentMemberDto | null>(null);
const bindingSelection = ref('');
const bindingLoading = ref(false);
const cancellationPending = computed(() =>
	attempts.value.some((attempt) => attempt.cancellationPending),
);
const canCancelSelectedWork = computed(
	() =>
		canUpdate.value &&
		selectedWork.value !== null &&
		['backlog', 'ready', 'running', 'blocked'].includes(selectedWork.value.state) &&
		!cancellationPending.value,
);
const blockerWorkIds = computed(() => {
	const workId = selectedWork.value?.id;
	if (!workId) return [];
	return getBlockerWorkIds(workId, workRelationships.value);
});
const blockersResolved = computed(() =>
	areWorkBlockersResolved(
		blockerWorkIds.value,
		relatedWorkItems.value,
		relationshipLoadFailed.value,
	),
);
const canStartSelectedWork = computed(
	() => canExecute.value && blockersResolved.value && !detailLoading.value && !store.saving,
);

const memberNameById = computed(
	() => new Map(store.members.map((member) => [member.id, member.name])),
);
const activeMembers = computed(() => store.members.filter((member) => !member.archived));
const publishedAgents = computed(() =>
	store.agents.filter(({ activeVersionId }) => activeVersionId),
);
const reviewCount = computed(
	() => store.overviewWork.filter(({ state }) => state === 'review').length,
);
const blockedCount = computed(
	() => store.overviewWork.filter(({ state }) => state === 'blocked').length,
);
const doneCount = computed(() => store.overviewWork.filter(({ state }) => state === 'done').length);
const stats = computed(() => [
	{ key: 'members', value: activeMembers.value.length },
	{ key: 'active', value: store.activeWork.length },
	{ key: 'attention', value: store.attentionWork.length },
	{ key: 'done', value: doneCount.value },
]);

const selectedNavigationTab = computed(() =>
	route.name === AI_DEPARTMENT_OFFICE_VIEW ? 'office' : section.value,
);
const sectionTabs = computed<Array<TabOptions<string>>>(() => {
	const items: Array<TabOptions<string>> = AI_DEPARTMENT_SECTIONS.map((item) => ({
		label: text(`aiDepartment.nav.${item}`),
		value: item,
	}));
	if (store.department) {
		items.push({ label: text('aiDepartment.nav.office'), value: 'office' });
	}
	return items;
});

function text(key: string, options?: Record<string, string | number>) {
	return i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
}
function goToSection(next: AiDepartmentSection) {
	void router.replace({
		query: {
			...route.query,
			section: next === 'organization' ? undefined : next,
			memberId: undefined,
			workId: undefined,
		},
	});
}

function onSectionTabSelect(value: string | number) {
	if (value === 'office' && store.department) {
		openOffice();
		return;
	}
	if (
		value === 'organization' ||
		value === 'overview' ||
		value === 'work' ||
		value === 'people' ||
		value === 'goals' ||
		value === 'activity'
	) {
		goToSection(value);
	}
}

const orgSelectedId = ref<string | null>(null);
const orgBinding = ref<AiDepartmentMemberBinding | null>(null);
const orgBindingLoading = ref(false);
const orgBindingError = ref(false);
let orgBindingRequest = 0;
const orgSelected = computed(
	() => store.members.find(({ id }) => id === orgSelectedId.value) ?? null,
);

async function selectOrgMember(memberId: string) {
	const request = ++orgBindingRequest;
	orgSelectedId.value = memberId;
	orgBinding.value = null;
	orgBindingError.value = false;
	if (!projectId.value || !store.selectedDepartmentId) return;
	orgBindingLoading.value = true;
	try {
		const binding = await store.loadMemberBinding(projectId.value, memberId);
		if (request === orgBindingRequest && orgSelectedId.value === memberId) {
			orgBinding.value = binding;
		}
	} catch {
		if (request === orgBindingRequest && orgSelectedId.value === memberId) {
			orgBindingError.value = true;
		}
	} finally {
		if (request === orgBindingRequest) orgBindingLoading.value = false;
	}
}

function clearOrgSelection() {
	orgBindingRequest++;
	orgSelectedId.value = null;
	orgBinding.value = null;
	orgBindingLoading.value = false;
	orgBindingError.value = false;
}

function manageMember(memberId: string) {
	void router.replace({
		query: { ...route.query, section: 'people', memberId, workId: undefined },
	});
}

function openOffice() {
	void router.push({
		name: AI_DEPARTMENT_OFFICE_VIEW,
		params: { projectId: projectId.value },
		query: { departmentId: store.selectedDepartmentId },
	});
}

async function openWorkById(workId: string) {
	const item = store.overviewWork.find(({ id }) => id === workId);
	if (!item) return;
	await router.replace({
		query: { ...route.query, section: 'work', memberId: undefined, workId },
	});
}

async function applyDeepLink() {
	const request = ++deepLinkRequest;
	await nextTick();
	if (section.value === 'work' && workIdFromRoute.value) {
		const workId = workIdFromRoute.value;
		const project = projectId.value;
		const department = store.selectedDepartmentId;
		if (!project || !department) return;
		let item: AiDepartmentWorkItemDto;
		try {
			item = await resolveWorkDeepLink(
				workId,
				[...store.work, ...store.overviewWork],
				async (id) => await getWorkItem(rootStore.restApiContext, project, department, id),
			);
		} catch (cause) {
			if (request !== deepLinkRequest || workIdFromRoute.value !== workId) return;
			if (isDetailAccessLoss(cause)) clearSelectedWorkDetails();
			else actionError.value = text('aiDepartment.loadError');
			return;
		}
		if (
			request !== deepLinkRequest ||
			workIdFromRoute.value !== workId ||
			store.selectedDepartmentId !== department
		)
			return;
		if (selectedWork.value?.id !== item.id) await openWork(item);
	}
	if (section.value === 'people' && highlightedMemberId.value) {
		document
			.querySelector(`[data-member-id="${CSS.escape(highlightedMemberId.value)}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}
}

async function loadPage() {
	detailRequest++;
	workActivity.value = [];
	workHelpRequests.value = [];
	clearOrgSelection();
	if (!projectId.value) return;
	selectedWork.value = null;
	await store.load(projectId.value, departmentIdFromRoute.value);
	if (store.selectedDepartmentId) {
		try {
			workHelpAttention.value = await listWorkHelpAttention(
				rootStore.restApiContext,
				projectId.value,
				store.selectedDepartmentId,
			);
			workHelpAttentionLoadFailed.value = false;
		} catch {
			workHelpAttentionLoadFailed.value = true;
		}
	}
	if (workSearch.value || workFilter.value || workPage.value > 0) await refreshWork();
	await applyDeepLink();
}

async function selectDepartment(event: Event) {
	const target = event.target;
	if (!(target instanceof HTMLSelectElement) || !projectId.value) return;
	await router.replace({
		query: { ...route.query, departmentId: target.value || undefined },
	});
}

async function createDepartment() {
	if (!projectId.value || !departmentName.value.trim()) return;
	actionError.value = '';
	try {
		await store.createDepartmentItem(projectId.value, departmentName.value.trim());
		departmentName.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function createGoal() {
	if (!projectId.value || !goalTitle.value.trim()) return;
	actionError.value = '';
	try {
		await store.createGoal(projectId.value, goalTitle.value.trim());
		goalTitle.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function createMember() {
	if (!projectId.value || !memberName.value.trim() || !memberRole.value.trim()) return;
	actionError.value = '';
	try {
		await store.createMember(projectId.value, memberName.value.trim(), memberRole.value.trim());
		memberName.value = '';
		memberRole.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function setMemberManager(memberId: string, managerMemberId: string | null) {
	const member = activeMembers.value.find(({ id }) => id === memberId);
	if (!projectId.value || !member) return;
	actionError.value = '';
	try {
		await store.setMemberManager(projectId.value, member, managerMemberId);
	} catch (error) {
		actionError.value =
			error instanceof Error && error.message ? error.message : text('aiDepartment.actionError');
	}
}

async function setMemberExpertise(memberId: string, tags: string[]) {
	const member = activeMembers.value.find(({ id }) => id === memberId);
	if (!projectId.value || !member) return;
	actionError.value = '';
	try {
		await store.setMemberExpertise(projectId.value, member, tags);
	} catch (error) {
		actionError.value =
			error instanceof Error && error.message ? error.message : text('aiDepartment.actionError');
	}
}

async function openMemberBinding(member: AiDepartmentMemberDto) {
	if (bindingMember.value?.id === member.id) {
		bindingMember.value = null;
		return;
	}
	if (!projectId.value) return;
	bindingMember.value = member;
	bindingSelection.value = '';
	bindingLoading.value = true;
	actionError.value = '';
	try {
		const [, binding] = await Promise.all([
			store.loadAgents(projectId.value),
			store.loadMemberBinding(projectId.value, member.id),
		]);
		bindingSelection.value = store.agents.some(({ id }) => id === binding.executorId)
			? (binding.executorId ?? '')
			: '';
	} catch {
		actionError.value = text('aiDepartment.bindingLoadError');
	} finally {
		bindingLoading.value = false;
	}
}

async function saveMemberBinding() {
	if (!projectId.value || !bindingMember.value || !bindingSelection.value) return;
	actionError.value = '';
	try {
		await store.setMemberBinding(projectId.value, bindingMember.value, bindingSelection.value);
		bindingMember.value = null;
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function clearMemberBinding() {
	if (!projectId.value || !bindingMember.value) return;
	actionError.value = '';
	try {
		await store.clearMemberBinding(projectId.value, bindingMember.value);
		bindingMember.value = null;
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function createWork() {
	if (!projectId.value || !workInstruction.value.trim()) return;
	actionError.value = '';
	try {
		await store.createWorkItem(
			projectId.value,
			workInstruction.value.trim(),
			workAssignee.value || undefined,
			workGoal.value || undefined,
		);
		workInstruction.value = '';
		workAssignee.value = '';
		workGoal.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function refreshWork() {
	if (!projectId.value) return;
	try {
		await store.refreshWork(projectId.value, {
			search: workSearch.value || undefined,
			state: workFilter.value || undefined,
			skip: workPage.value * 100,
		});
	} catch {
		actionError.value = text('aiDepartment.loadError');
	}
}

function syncWorkQuery() {
	const nextQuery = {
		...route.query,
		workSearch: workSearch.value || undefined,
		workState: workFilter.value || undefined,
		workPage: workPage.value > 0 ? String(workPage.value + 1) : undefined,
	};
	if (
		nextQuery.workSearch === route.query.workSearch &&
		nextQuery.workState === route.query.workState &&
		nextQuery.workPage === route.query.workPage
	)
		return;
	void router.replace({ query: nextQuery });
}

const refreshWorkDebounced = debounce(refreshWork, {
	debounceTime: getDebounceTime(DEBOUNCE_TIME.INPUT.SEARCH),
	trailing: true,
});

function activityLabel(kind: string) {
	const labels: Record<string, string> = {
		claim: 'claimed',
		renew: 'renewed',
		release: 'released',
		comment: 'commented',
		progress: 'progress',
		block: 'blocked',
		resume: 'resumed',
		submit: 'submitted',
		'work.create': 'created',
		'work.update': 'updated',
		'work.ready': 'ready',
		'work.start': 'queued',
		'work.retry': 'queued',
		'work.cancel': 'cancelled',
		'work.review': 'reviewed',
		help_answered: 'helpAnswered',
	};
	return text(`aiDepartment.activityAction.${labels[kind] ?? 'updated'}`);
}

async function openWork(item: AiDepartmentWorkItemDto) {
	const request = ++detailRequest;
	detailStale.value = false;
	detailAccessLost.value = false;
	selectedWork.value = item;
	attempts.value = [];
	history.value = [];
	reviewDecisions.value = [];
	workActivity.value = [];
	workHelpRequests.value = [];
	workRelationships.value = [];
	workClaim.value = null;
	workWake.value = null;
	relatedWorkItems.value = {};
	relationshipLoadFailed.value = false;
	activityCount.value = 0;
	detailLoading.value = true;
	actionError.value = '';
	dispatchNotice.value = '';
	const currentProject = projectId.value;
	const currentDepartment = store.selectedDepartmentId;
	if (!currentProject || !currentDepartment) {
		detailLoading.value = false;
		return;
	}
	try {
		const [
			nextAttempts,
			nextHistory,
			nextReviewDecisions,
			nextActivity,
			nextHelpRequests,
			nextRelationships,
			nextClaim,
			nextWake,
		] = await Promise.all([
			listAttempts(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkHistory(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkReviewDecisions(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkActivity(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkHelpRequests(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkRelationships(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			getWorkClaim(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			getWorkWakeStatus(rootStore.restApiContext, currentProject, currentDepartment, item.id),
		]);
		if (request !== detailRequest) return;
		attempts.value = nextAttempts;
		const nextWork = await getWorkItem(
			rootStore.restApiContext,
			currentProject,
			currentDepartment,
			item.id,
		);
		if (request !== detailRequest) return;
		selectedWork.value = nextWork;
		history.value = nextHistory;
		reviewDecisions.value = nextReviewDecisions;
		workActivity.value = nextActivity.data;
		workHelpRequests.value = nextHelpRequests;
		activityCount.value = nextActivity.count;
		workRelationships.value = nextRelationships;
		workClaim.value = nextClaim;
		workWake.value = nextWake;
		const relatedIds = [
			...new Set(
				nextRelationships.map((relationship) =>
					relationship.workId === item.id ? relationship.relatedWorkId : relationship.workId,
				),
			),
		];
		if (relatedIds.length > MAX_BLOCKER_STATUS_READS) {
			relationshipLoadFailed.value = true;
			return;
		}
		const relatedResults = await Promise.allSettled(
			relatedIds.map(
				async (workId) =>
					[
						workId,
						await getWorkItem(rootStore.restApiContext, currentProject, currentDepartment, workId),
					] as const,
			),
		);
		if (request !== detailRequest) return;
		if (
			relatedResults.some(
				(result) => result.status === 'rejected' && isDetailAccessLoss(result.reason),
			)
		) {
			clearSelectedWorkDetails();
			return;
		}
		relatedWorkItems.value = Object.fromEntries(
			relatedResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
		);
		relationshipLoadFailed.value = relatedResults.some((result) => result.status === 'rejected');
		detailStale.value = relationshipLoadFailed.value;
	} catch (cause) {
		if (request === detailRequest) {
			if (isDetailAccessLoss(cause)) clearSelectedWorkDetails();
			else {
				relationshipLoadFailed.value = true;
				detailStale.value = true;
				actionError.value = text('aiDepartment.loadError');
			}
		}
	} finally {
		if (request === detailRequest) detailLoading.value = false;
	}
}

function relatedWorkId(relationship: Awaited<ReturnType<typeof listWorkRelationships>>[number]) {
	return relationship.workId === selectedWork.value?.id
		? relationship.relatedWorkId
		: relationship.workId;
}

function relatedWorkTitle(workId: string) {
	return (
		relatedWorkItems.value[workId]?.instruction ??
		[...store.work, ...store.overviewWork].find(({ id }) => id === workId)?.instruction ??
		workId
	);
}

function relationshipLabel(
	relationship: Awaited<ReturnType<typeof listWorkRelationships>>[number],
) {
	const outgoing = relationship.workId === selectedWork.value?.id;
	const key =
		relationship.kind === 'parent'
			? outgoing
				? 'aiDepartment.relatedWork.parent'
				: 'aiDepartment.relatedWork.child'
			: outgoing
				? 'aiDepartment.relatedWork.blocks'
				: 'aiDepartment.relatedWork.blockedBy';
	return text(key);
}

async function openRelatedWork(workId: string) {
	if (!projectId.value || !store.selectedDepartmentId) return;
	detailLoading.value = true;
	try {
		const item = await getWorkItem(
			rootStore.restApiContext,
			projectId.value,
			store.selectedDepartmentId,
			workId,
		);
		await openWork(item);
	} catch {
		actionError.value = text('aiDepartment.loadError');
	} finally {
		detailLoading.value = false;
	}
}

async function loadMoreActivity() {
	const item = selectedWork.value;
	const currentProject = projectId.value;
	const currentDepartment = store.selectedDepartmentId;
	if (!item || !currentProject || !currentDepartment || detailLoading.value) return;
	const request = detailRequest;
	detailLoading.value = true;
	try {
		const next = await listWorkActivity(
			rootStore.restApiContext,
			currentProject,
			currentDepartment,
			item.id,
			workActivity.value.length,
		);
		if (request !== detailRequest) return;
		workActivity.value.push(...next.data);
		activityCount.value = next.count;
	} catch {
		if (request === detailRequest) actionError.value = text('aiDepartment.loadError');
	} finally {
		if (request === detailRequest) detailLoading.value = false;
	}
}

async function openActivity(item: AiDepartmentWorkItemDto) {
	selectedWork.value = item;
	activityWorkId.value = item.id;
	await openWork(item);
}

const activityWorkId = ref('');

function selectActivityWork(event: Event) {
	const target = event.target;
	const item =
		target instanceof HTMLSelectElement
			? store.work.find(({ id }) => id === target.value)
			: undefined;
	if (item) void openActivity(item);
}

async function markReady(item: AiDepartmentWorkItemDto) {
	if (!projectId.value) return;
	actionError.value = '';
	try {
		await store.markWorkReady(projectId.value, item);
		selectedWork.value = store.work.find(({ id }) => id === item.id) ?? null;
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function startSelectedWork(item: AiDepartmentWorkItemDto, retry = false) {
	if (!projectId.value) return;
	actionError.value = '';
	dispatchNotice.value = '';
	try {
		const result = await store.startWork(projectId.value, item, retry);
		const updated = store.work.find(({ id }) => id === item.id) ?? result.work;
		await openWork(updated);
		dispatchNotice.value = text(`aiDepartment.dispatchState.${result.dispatchState}`);
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function cancelWork(item: AiDepartmentWorkItemDto) {
	if (!projectId.value) return;
	const answer = await message.confirm(
		text('aiDepartment.cancel.confirmation'),
		text('aiDepartment.cancel.title'),
		{
			confirmButtonText: text('aiDepartment.cancel.confirmButton'),
			cancelButtonText: text('generic.cancel'),
			type: 'warning',
		},
	);
	if (answer !== 'confirm') return;
	actionError.value = '';
	try {
		const result = await store.cancelWork(projectId.value, item);
		const updated = store.work.find(({ id }) => id === item.id) ?? result.work;
		await openWork(updated);
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function submitWorkActivity(action: 'comment' | 'progress') {
	const item = selectedWork.value;
	const project = projectId.value;
	const body = workUpdateText.value.trim();
	if (!item || !project || !body) return;
	actionError.value = '';
	try {
		const result = await store.addActivity(project, item, action, body);
		workUpdateText.value = '';
		await openWork(result.work);
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function submitHelpAnswer(request: AiDepartmentWorkHelpRequestDto, answer: string) {
	const project = projectId.value;
	const department = store.selectedDepartmentId;
	const item = selectedWork.value;
	if (!project || !department || !item || helpAnswerSubmittingRequestId.value) return;
	helpAnswerSubmittingRequestId.value = request.id;
	actionError.value = '';
	try {
		const dto: CreateAiDepartmentWorkHelpAnswerDto = {
			expectedVersion: request.version,
			answer,
			requestId: crypto.randomUUID(),
		};
		await answerWorkHelpRequest(
			rootStore.restApiContext,
			project,
			department,
			item.id,
			request.id,
			dto,
		);
		workHelpRequests.value = await listWorkHelpRequests(
			rootStore.restApiContext,
			project,
			department,
			item.id,
		);
		try {
			workHelpAttention.value = await listWorkHelpAttention(
				rootStore.restApiContext,
				project,
				department,
			);
			workHelpAttentionLoadFailed.value = false;
		} catch {
			workHelpAttentionLoadFailed.value = true;
		}
	} catch {
		actionError.value = text('aiDepartment.actionError');
	} finally {
		helpAnswerSubmittingRequestId.value = null;
	}
}

async function decideReview(item: AiDepartmentWorkItemDto, decision: 'accept' | 'return') {
	if (!projectId.value) return;
	actionError.value = '';
	const reviewAttempt = attempts.value.find(({ id }) => id === item.currentAttemptId);
	if (!reviewAttempt) {
		actionError.value = text('aiDepartment.actionError');
		return;
	}
	try {
		await store.review(
			projectId.value,
			item,
			reviewAttempt,
			decision,
			decision === 'return' ? returnReason.value.trim() : undefined,
		);
		selectedWork.value = store.work.find(({ id }) => id === item.id) ?? item;
		await refreshSelectedWorkDetail();
		returnReason.value = '';
		returnFormWorkId.value = null;
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

async function reopenSelectedReview(item: AiDepartmentWorkItemDto) {
	if (!projectId.value || !reopenReason.value.trim()) return;
	actionError.value = '';
	try {
		await store.reopenReview(projectId.value, item, reopenReason.value.trim());
		selectedWork.value = store.work.find(({ id }) => id === item.id) ?? item;
		await refreshSelectedWorkDetail();
		reopenReason.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

function displayDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value),
	);
}

function isDetailAccessLoss(cause: unknown) {
	const status =
		typeof cause === 'object' && cause !== null && 'httpStatusCode' in cause
			? cause.httpStatusCode
			: undefined;
	return status === 403 || status === 404;
}

function clearSelectedWorkDetails() {
	detailRequest++;
	detailLoading.value = false;
	selectedWork.value = null;
	attempts.value = [];
	history.value = [];
	workActivity.value = [];
	workHelpRequests.value = [];
	reviewDecisions.value = [];
	activityCount.value = 0;
	workRelationships.value = [];
	workClaim.value = null;
	workWake.value = null;
	relatedWorkItems.value = {};
	relationshipLoadFailed.value = false;
	detailStale.value = false;
	detailAccessLost.value = true;
}

async function refreshSelectedWorkDetail() {
	const current = selectedWork.value;
	const currentProject = projectId.value;
	const currentDepartment = store.selectedDepartmentId;
	if (!current || !currentProject || !currentDepartment || detailLoading.value || store.saving)
		return;
	const request = ++detailRequest;
	try {
		const [
			nextWork,
			nextAttempts,
			nextHistory,
			nextReviewDecisions,
			nextActivity,
			nextHelpRequests,
			nextRelationships,
			nextClaim,
			nextWake,
		] = await Promise.all([
			getWorkItem(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			listAttempts(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			listWorkHistory(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			listWorkReviewDecisions(
				rootStore.restApiContext,
				currentProject,
				currentDepartment,
				current.id,
			),
			listWorkActivity(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			listWorkHelpRequests(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			listWorkRelationships(
				rootStore.restApiContext,
				currentProject,
				currentDepartment,
				current.id,
			),
			getWorkClaim(rootStore.restApiContext, currentProject, currentDepartment, current.id),
			getWorkWakeStatus(rootStore.restApiContext, currentProject, currentDepartment, current.id),
		]);
		if (request !== detailRequest) return;
		const relatedIds = [
			...new Set(nextRelationships.flatMap(({ workId, relatedWorkId }) => [workId, relatedWorkId])),
		].filter((workId) => workId !== current.id);
		if (relatedIds.length > MAX_BLOCKER_STATUS_READS) {
			relationshipLoadFailed.value = true;
			detailStale.value = true;
			return;
		}
		const relatedResults = await Promise.allSettled(
			relatedIds.map(
				async (workId) =>
					[
						workId,
						await getWorkItem(rootStore.restApiContext, currentProject, currentDepartment, workId),
					] as const,
			),
		);
		if (request !== detailRequest) return;
		if (relatedResults.some((result) => result.status === 'rejected')) {
			if (
				relatedResults.some(
					(result) => result.status === 'rejected' && isDetailAccessLoss(result.reason),
				)
			) {
				clearSelectedWorkDetails();
				return;
			}
			relationshipLoadFailed.value = true;
			detailStale.value = true;
			return;
		}
		selectedWork.value = nextWork;
		attempts.value = nextAttempts;
		history.value = nextHistory;
		reviewDecisions.value = nextReviewDecisions;
		workActivity.value = nextActivity.data;
		workHelpRequests.value = nextHelpRequests;
		activityCount.value = nextActivity.count;
		workRelationships.value = nextRelationships;
		workClaim.value = nextClaim;
		workWake.value = nextWake;
		relatedWorkItems.value = Object.fromEntries(
			relatedResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
		);
		relationshipLoadFailed.value = false;
		detailStale.value = false;
	} catch (cause) {
		if (request !== detailRequest) return;
		if (isDetailAccessLoss(cause)) clearSelectedWorkDetails();
		else detailStale.value = true;
	}
}

watch(
	[projectId, departmentIdFromRoute],
	async () => {
		detailStale.value = false;
		detailAccessLost.value = false;
		await loadPage();
	},
	{ immediate: true },
);
watch(selectedWork, (item) => {
	if (item) detailAccessLost.value = false;
});
watch(section, (value) => (store.section = value));
watch([section, workIdFromRoute, highlightedMemberId], async () => {
	await applyDeepLink();
});
watch(
	() => [route.query.workSearch, route.query.workState, route.query.workPage] as const,
	async ([search, state, page]) => {
		const parsed = parseWorkListQuery(search, state, page, workStateOptions);
		if (
			parsed.search === workSearch.value &&
			parsed.state === workFilter.value &&
			parsed.page === workPage.value
		)
			return;
		applyingWorkQuery = true;
		workSearch.value = parsed.search;
		workFilter.value = parsed.state;
		workPage.value = parsed.page;
		await nextTick();
		applyingWorkQuery = false;
		if (projectId.value && store.selectedDepartmentId) await refreshWork();
	},
);
useVisiblePolling(async () => {
	if (projectId.value && !store.loading && !store.saving) {
		await store.refreshQuiet(projectId.value);
		if (section.value === 'work' || section.value === 'activity') {
			await refreshSelectedWorkDetail();
		}
	}
}, AI_DEPARTMENT_POLL_INTERVAL_MS);
watch(
	[workSearch, workFilter, workPage],
	([search, state, page], [previousSearch, previousState, previousPage]) => {
		if (applyingWorkQuery) return;
		if (resettingWorkPageForFilter) {
			resettingWorkPageForFilter = false;
			if (page === 0) return;
		}
		const filtersChanged = search !== previousSearch || state !== previousState;
		if (filtersChanged && page !== 0) {
			resettingWorkPageForFilter = true;
			workPage.value = 0;
			syncWorkQuery();
			void refreshWorkDebounced();
			return;
		}
		syncWorkQuery();
		if (filtersChanged) void refreshWorkDebounced();
		else if (page !== previousPage) void refreshWork();
	},
);
onMounted(() => {
	store.section = section.value;
});
</script>

<template>
	<component :is="PageViewLayout" v-if="PageViewLayout">
		<template #header>
			<component :is="ProjectHeader" v-if="ProjectHeader" hide-header-actions />
		</template>
		<section class="ai-department" aria-labelledby="ai-department-title">
			<header class="page-header">
				<div>
					<h1 id="ai-department-title">{{ text('aiDepartment.title') }}</h1>
					<p>{{ store.department?.name ?? text('aiDepartment.subtitle') }}</p>
				</div>
				<label class="department-picker">
					<span>{{ text('aiDepartment.department') }}</span>
					<select
						:value="store.selectedDepartmentId ?? ''"
						:disabled="store.departments.length === 0 || store.loading"
						@change="selectDepartment"
					>
						<option value="">{{ text('aiDepartment.selectDepartment') }}</option>
						<option v-for="item in store.departments" :key="item.id" :value="item.id">
							{{ item.name }}
						</option>
					</select>
				</label>
			</header>

			<ul v-if="store.department" class="stats" data-test-id="ai-department-stats">
				<li v-for="stat in stats" :key="stat.key" :class="`stat stat--${stat.key}`">
					<strong>{{ stat.value }}</strong>
					<span>{{ text(`aiDepartment.stat.${stat.key}`) }}</span>
				</li>
			</ul>

			<nav class="section-nav" :aria-label="text('aiDepartment.navigation')">
				<N8nTabs
					:model-value="selectedNavigationTab"
					:options="sectionTabs"
					data-test-id="ai-department-section-tabs"
					@update:model-value="onSectionTabSelect"
				/>
			</nav>

			<p v-if="store.loading" class="state-message" role="status">
				{{ text('aiDepartment.loading') }}
			</p>
			<p v-else-if="store.error" class="state-message error-message" role="alert">
				{{ text('aiDepartment.loadError') }}
				<N8nButton variant="outline" @click="loadPage">{{ text('generic.retry') }}</N8nButton>
			</p>
			<template v-else>
				<section v-if="store.departments.length === 0" class="empty-layout">
					<N8nEmptyState
						:icon="{ type: 'icon', value: 'users' }"
						:heading="text('aiDepartment.empty.departments.heading')"
						:description="text('aiDepartment.empty.departments.description')"
					/>
					<form v-if="canCreate" class="inline-form" @submit.prevent="createDepartment">
						<label>
							<span>{{ text('aiDepartment.form.departmentName') }}</span>
							<N8nInput v-model="departmentName" required :maxlength="128" />
						</label>
						<N8nButton type="submit" :loading="store.saving">
							{{ text('aiDepartment.createDepartment') }}
						</N8nButton>
					</form>
				</section>
				<template v-else>
					<div v-if="actionError" class="inline-error" role="alert">
						{{ actionError }}
					</div>
					<section
						v-if="section === 'organization'"
						class="org-layout"
						data-test-id="ai-department-organization"
					>
						<div class="section-heading">
							<div>
								<h2>{{ text('aiDepartment.nav.organization') }}</h2>
								<p>{{ text('aiDepartment.org.description') }}</p>
							</div>
						</div>
						<N8nEmptyState
							v-if="activeMembers.length === 0"
							:heading="text('aiDepartment.noMembers')"
							:description="text('aiDepartment.org.empty')"
						/>
						<div v-else class="org-grid">
							<OrgCanvas
								:members="activeMembers"
								:work="store.overviewWork"
								:selected-id="orgSelectedId"
								:position-scope="orgPositionScope"
								:editable="canUpdate && !store.saving"
								:waiting-work-ids="waitingWorkIds"
								@select="selectOrgMember"
								@reparent="setMemberManager"
							/>
							<MemberPanel
								v-if="orgSelected"
								:member="orgSelected"
								:members="activeMembers"
								:work="store.overviewWork"
								:binding="orgBinding"
								:binding-loading="orgBindingLoading"
								:binding-error="orgBindingError"
								:editable="canUpdate"
								:saving="store.saving"
								:waiting-work-ids="waitingWorkIds"
								@select="selectOrgMember"
								@set-manager="setMemberManager"
								@set-expertise="setMemberExpertise"
								@open-work="openWorkById"
								@manage="manageMember"
								@close="clearOrgSelection"
							/>
							<p v-else class="org-prompt">{{ text('aiDepartment.org.selectPrompt') }}</p>
						</div>
					</section>

					<section v-else-if="section === 'overview'" class="overview-grid">
						<article class="summary-card">
							<h2>{{ text('aiDepartment.attention') }}</h2>
							<div class="summary-counts">
								<button @click="goToSection('work')">
									<strong>{{ reviewCount }}</strong
									><span>{{ text('aiDepartment.review') }}</span>
								</button>
								<button @click="goToSection('work')">
									<strong>{{ blockedCount }}</strong
									><span>{{ text('aiDepartment.blocked') }}</span>
								</button>
							</div>
							<p
								v-if="
									store.attentionWork.length === 0 &&
									store.toolApprovalAttention.items.length === 0 &&
									(workHelpAttention?.items.length ?? 0) === 0 &&
									!workHelpAttentionLoadFailed &&
									!store.toolApprovalLoadFailed
								"
								class="muted"
							>
								{{ text('aiDepartment.noAttention') }}
							</p>
							<ul v-if="store.attentionWork.length" class="compact-list">
								<li v-for="item in store.attentionWork.slice(0, 5)" :key="item.id">
									<button class="text-link" @click="goToSection('work')">
										{{ item.instruction }}
									</button>
									<N8nTag :text="text(`aiDepartment.state.${item.state}`)" />
								</li>
							</ul>
							<section v-if="workHelpAttention?.items.length" class="attention-approvals">
								<h3>{{ text('aiDepartment.help.attention.title') }}</h3>
								<ul class="compact-list">
									<li v-for="item in workHelpAttention.items" :key="item.request.id">
										<button class="text-link" @click="openWorkById(item.request.workId)">
											{{ item.workTitle }}
										</button>
										<N8nTag
											:text="text(`aiDepartment.help.attention.state.${item.request.state}`)"
										/>
									</li>
								</ul>
							</section>
							<p v-if="workHelpAttention?.hasMore" class="muted">
								{{ text('aiDepartment.help.attention.more') }}
							</p>
							<p v-if="workHelpAttentionLoadFailed" class="muted" role="status">
								{{ text('aiDepartment.help.attention.failed') }}
							</p>
							<section v-if="store.toolApprovalAttention.items.length" class="attention-approvals">
								<h3>{{ text('aiDepartment.toolApproval.attention.title') }}</h3>
								<ul class="compact-list">
									<li
										v-for="approval in store.toolApprovalAttention.items"
										:key="approval.attemptId"
									>
										<button class="text-link" @click="openWorkById(approval.workId)">
											{{
												store.overviewWork.find(({ id }) => id === approval.workId)?.instruction ??
												approval.workId
											}}
										</button>
										<span>{{ text(`aiDepartment.toolApproval.attention.${approval.state}`) }}</span>
									</li>
								</ul>
							</section>
							<p v-if="store.toolApprovalAttention.hasMore" class="muted">
								{{ text('aiDepartment.toolApproval.attention.more') }}
								<N8nButton variant="outline" @click="goToSection('work')">
									{{ text('aiDepartment.nav.work') }}
								</N8nButton>
							</p>
							<p v-if="store.toolApprovalLoadFailed" class="muted" role="status">
								{{ text('aiDepartment.toolApproval.attention.failed') }}
							</p>
						</article>
						<article class="summary-card">
							<h2>{{ text('aiDepartment.activeWork') }}</h2>
							<p class="summary-total">{{ store.activeWork.length }}</p>
							<ul v-if="store.activeWork.length" class="compact-list">
								<li v-for="item in store.activeWork.slice(0, 5)" :key="item.id">
									<span>{{ item.instruction }}</span>
									<N8nTag :text="text(`aiDepartment.state.${item.state}`)" />
								</li>
							</ul>
							<p v-else class="muted">{{ text('aiDepartment.noActiveWork') }}</p>
						</article>
						<article class="summary-card">
							<h2>{{ text('aiDepartment.team') }}</h2>
							<ul v-if="activeMembers.length" class="compact-list people-list">
								<li v-for="member in activeMembers.slice(0, 8)" :key="member.id">
									<span
										><strong>{{ member.name }}</strong
										><small>{{ member.role }}</small></span
									>
									<N8nTag :text="text(`aiDepartment.availability.${member.executionState}`)" />
								</li>
							</ul>
							<p v-else class="muted">{{ text('aiDepartment.noMembers') }}</p>
							<h3>{{ text('aiDepartment.assignedWork') }}</h3>
							<ul
								v-if="store.overviewWork.some(({ assigneeMemberId }) => assigneeMemberId)"
								class="compact-list"
							>
								<li
									v-for="item in store.overviewWork
										.filter(({ assigneeMemberId }) => assigneeMemberId)
										.slice(0, 5)"
									:key="item.id"
								>
									<button class="text-link" @click="openWorkById(item.id)">
										{{ item.instruction }}
									</button>
									<span
										>{{ text('aiDepartment.assignee') }}:
										{{
											activeMembers.find(({ id }) => id === item.assigneeMemberId)?.name ??
											text('aiDepartment.unassigned')
										}}</span
									>
									<N8nTag :text="text(`aiDepartment.state.${item.state}`)" />
								</li>
							</ul>
							<p v-else class="muted">{{ text('aiDepartment.noAssignedWork') }}</p>
						</article>
						<article class="summary-card">
							<h2>{{ text('aiDepartment.recentActivity') }}</h2>
							<p v-if="store.activityLoadFailed" class="muted" role="status">
								{{
									text(
										store.recentActivity.length
											? 'aiDepartment.activityRefreshError'
											: 'aiDepartment.activityLoadError',
									)
								}}
							</p>
							<ul v-if="store.recentActivity.length" class="compact-list">
								<li v-for="entry in store.recentActivity" :key="entry.id">
									<button class="text-link" @click="openWorkById(entry.workId)">
										class="text-link" @click="openWorkById(entry.workId)" >
										{{
											store.overviewWork.find(({ id }) => id === entry.workId)?.instruction ??
											entry.body ??
											activityLabel(entry.kind)
										}}
									</button>
									<strong>{{ activityLabel(entry.kind) }}</strong>
									<time :datetime="entry.createdAt">{{ displayDate(entry.createdAt) }}</time>
								</li>
							</ul>
							<p v-else-if="!store.activityLoadFailed" class="muted">
								{{ text('aiDepartment.noActivity') }}
							</p>
						</article>
						<article class="summary-card">
							<h2>{{ text('aiDepartment.latestWork') }}</h2>
							<ul v-if="store.work.length" class="compact-list">
								<li v-for="item in store.work.slice(0, 5)" :key="item.id">
									<span>{{ item.instruction }}</span>
									<time :datetime="item.updatedAt">{{ displayDate(item.updatedAt) }}</time>
								</li>
							</ul>
							<p v-else class="muted">{{ text('aiDepartment.noWork') }}</p>
						</article>
						<article v-if="canCreate" class="summary-card setup-card">
							<h2>{{ text('aiDepartment.createDepartment') }}</h2>
							<form class="inline-form" @submit.prevent="createDepartment">
								<label
									><span>{{ text('aiDepartment.form.departmentName') }}</span
									><N8nInput v-model="departmentName" required :maxlength="128"
								/></label>
								<N8nButton type="submit" :loading="store.saving">{{
									text('aiDepartment.createDepartment')
								}}</N8nButton>
							</form>
						</article>
						<article v-if="canCreate" class="summary-card setup-card">
							<h2>{{ text('aiDepartment.createGoal') }}</h2>
							<form class="inline-form" @submit.prevent="createGoal">
								<label>
									<span>{{ text('aiDepartment.form.goalTitle') }}</span>
									<N8nInput v-model="goalTitle" required :maxlength="256" />
								</label>
								<N8nButton type="submit" :loading="store.saving">
									{{ text('generic.create') }}
								</N8nButton>
							</form>
						</article>
					</section>

					<section v-else-if="section === 'people'" class="content-section">
						<div class="section-heading">
							<div>
								<h2>{{ text('aiDepartment.peopleTitle') }}</h2>
								<p>{{ text('aiDepartment.peopleDescription') }}</p>
							</div>
						</div>
						<form v-if="canCreate" class="inline-form member-form" @submit.prevent="createMember">
							<label
								><span>{{ text('aiDepartment.form.memberName') }}</span
								><N8nInput v-model="memberName" required :maxlength="128"
							/></label>
							<label
								><span>{{ text('aiDepartment.form.memberRole') }}</span
								><N8nInput v-model="memberRole" required :maxlength="128"
							/></label>
							<N8nButton type="submit" :loading="store.saving">{{
								text('aiDepartment.addMember')
							}}</N8nButton>
						</form>
						<ul v-if="activeMembers.length" class="record-list">
							<li
								v-for="member in activeMembers"
								:key="member.id"
								:data-member-id="member.id"
								:class="{ highlighted: member.id === highlightedMemberId }"
							>
								<div>
									<strong>{{ member.name }}</strong>
									<p>{{ member.role }}</p>
								</div>
								<div class="member-actions">
									<N8nTag :text="text(`aiDepartment.availability.${member.executionState}`)" />
									<N8nButton
										v-if="canUpdate"
										variant="outline"
										:disabled="bindingLoading || store.saving"
										:data-test-id="`member-binding-${member.id}`"
										@click="openMemberBinding(member)"
									>
										{{
											bindingMember?.id === member.id
												? text('aiDepartment.binding.close')
												: text('aiDepartment.binding.manage')
										}}
									</N8nButton>
								</div>
								<div v-if="bindingMember?.id === member.id" class="binding-panel">
									<p>{{ text('aiDepartment.binding.description') }}</p>
									<p v-if="bindingLoading" role="status">
										{{ text('aiDepartment.binding.loading') }}
									</p>
									<template v-else>
										<label>
											<span>{{ text('aiDepartment.binding.agentLabel') }}</span>
											<N8nSelect
												v-model="bindingSelection"
												:placeholder="text('aiDepartment.binding.selectAgent')"
												:disabled="store.saving || publishedAgents.length === 0"
												:aria-label="text('aiDepartment.binding.agentLabel')"
												data-test-id="member-binding-agent-select"
											>
												<N8nOption
													v-for="agent in publishedAgents"
													:key="agent.id"
													:value="agent.id"
													:label="agent.name"
												/>
											</N8nSelect>
										</label>
										<p v-if="publishedAgents.length === 0" class="muted">
											{{ text('aiDepartment.binding.noPublishedAgents') }}
										</p>
										<div class="action-row">
											<N8nButton
												:disabled="!bindingSelection || store.saving"
												:loading="store.saving"
												@click="saveMemberBinding"
											>
												{{ text('aiDepartment.binding.save') }}
											</N8nButton>
											<N8nButton
												v-if="member.executionState !== 'unconfigured'"
												variant="outline"
												:disabled="store.saving"
												@click="clearMemberBinding"
											>
												{{ text('aiDepartment.binding.clear') }}
											</N8nButton>
										</div>
									</template>
								</div>
							</li>
						</ul>
						<N8nEmptyState
							v-else
							:heading="text('aiDepartment.noMembers')"
							:description="text('aiDepartment.empty.members.description')"
						/>
					</section>

					<section v-else-if="section === 'goals'" class="content-section">
						<div class="section-heading">
							<div>
								<h2>{{ text('aiDepartment.goals.title') }}</h2>
								<p>{{ text('aiDepartment.goals.description') }}</p>
							</div>
						</div>
						<GoalTree
							v-if="store.goals.length"
							:goals="store.goals"
							:work="store.overviewWork"
							:members="store.members"
							@open-work="openWorkById"
							@select-goal="selectedGoalId = $event"
						/>
						<GoalDetail
							v-if="selectedGoal"
							:goal="selectedGoal"
							:goals="store.goals"
							:work="store.overviewWork"
							:members="store.members"
							@open-work="openWorkById"
						/>
						<N8nEmptyState
							v-else
							:heading="text('aiDepartment.goals.emptyTitle')"
							:description="text('aiDepartment.goals.emptyDescription')"
						/>
					</section>

					<section v-else-if="section === 'activity'" class="content-section">
						<div class="section-heading">
							<div>
								<h2>{{ text('aiDepartment.activityTitle') }}</h2>
								<p>{{ text('aiDepartment.activityDescription') }}</p>
							</div>
						</div>
						<label class="activity-picker"
							><span>{{ text('aiDepartment.activityWork') }}</span
							><select :value="activityWorkId" @change="selectActivityWork">
								<option value="">{{ text('aiDepartment.selectWork') }}</option>
								<option v-for="item in store.work" :key="item.id" :value="item.id">
									{{ item.instruction }}
								</option>
							</select></label
						>
						<ol v-if="workActivity.length" class="activity-list">
							<li v-for="entry in workActivity" :key="entry.id">
								<div>
									<strong>{{ activityLabel(entry.kind) }}</strong>
									<p v-if="entry.body && !entry.report">{{ entry.body }}</p>
									<WorkCompletionReport v-if="entry.report" :report="entry.report" />
								</div>
								<time :datetime="entry.createdAt">{{ displayDate(entry.createdAt) }}</time>
							</li>
						</ol>
						<ol v-else-if="history.length" class="activity-list">
							<li v-for="entry in history" :key="entry.id">
								<div>
									<strong
										>{{
											entry.fromState
												? text(`aiDepartment.state.${entry.fromState}`)
												: text('aiDepartment.created')
										}}
										→ {{ text(`aiDepartment.state.${entry.toState}`) }}</strong
									>
									<p>
										{{ text(`aiDepartment.actor.${entry.actorKind}`)
										}}<span v-if="entry.reason"> · {{ entry.reason }}</span>
									</p>
								</div>
								<time :datetime="entry.createdAt">{{ displayDate(entry.createdAt) }}</time>
							</li>
						</ol>
						<N8nEmptyState
							v-else
							:heading="text('aiDepartment.noActivity')"
							:description="text('aiDepartment.empty.activity.description')"
						/>
						<N8nButton
							v-if="workActivity.length < activityCount"
							variant="outline"
							:disabled="detailLoading"
							@click="loadMoreActivity"
							>{{ text('aiDepartment.moreActivity') }}</N8nButton
						>
					</section>

					<section v-else class="content-section work-section">
						<div class="section-heading">
							<div>
								<h2>{{ text('aiDepartment.workTitle') }}</h2>
								<p>{{ text('aiDepartment.workCount', { count: store.workCount }) }}</p>
							</div>
							<div class="filters">
								<label
									><span>{{ text('generic.search') }}</span
									><N8nInput v-model="workSearch"
								/></label>
								<label
									><span>{{ text('aiDepartment.filterState') }}</span>
									<select v-model="workFilter">
										<option value="">{{ text('aiDepartment.allStates') }}</option>
										<option v-for="state in workStateOptions" :key="state" :value="state">
											{{ text(`aiDepartment.state.${state}`) }}
										</option>
									</select>
								</label>
							</div>
						</div>
						<form v-if="canCreate" class="create-work-form" @submit.prevent="createWork">
							<label class="wide-field"
								><span>{{ text('aiDepartment.form.instruction') }}</span
								><N8nInput
									v-model="workInstruction"
									type="textarea"
									required
									:maxlength="20000"
									:rows="2"
							/></label>
							<label
								><span>{{ text('aiDepartment.form.assignee') }}</span
								><select v-model="workAssignee">
									<option value="">{{ text('aiDepartment.unassigned') }}</option>
									<option v-for="member in activeMembers" :key="member.id" :value="member.id">
										{{ member.name }}
									</option>
								</select></label
							>
							<label
								><span>{{ text('aiDepartment.form.goal') }}</span
								><select v-model="workGoal">
									<option value="">{{ text('aiDepartment.noGoal') }}</option>
									<option v-for="goal in store.goals" :key="goal.id" :value="goal.id">
										{{ goal.title }}
									</option>
								</select></label
							>
							<N8nButton type="submit" :loading="store.saving">{{
								text('aiDepartment.createWork')
							}}</N8nButton>
						</form>
						<div class="work-layout">
							<ul v-if="store.work.length" class="record-list work-list">
								<li
									v-for="item in store.work"
									:key="item.id"
									:class="{ selected: selectedWork?.id === item.id }"
								>
									<button
										class="record-button"
										:aria-pressed="selectedWork?.id === item.id"
										@click="openWork(item)"
									>
										<strong>{{ item.instruction }}</strong>
										<span>{{
											memberNameById.get(item.assigneeMemberId ?? '') ??
											text('aiDepartment.unassigned')
										}}</span>
									</button>
									<N8nTag :text="text(`aiDepartment.state.${item.state}`)" />
								</li>
							</ul>
							<N8nEmptyState
								v-else
								:heading="text('aiDepartment.noWork')"
								:description="text(workEmptyStateKey)"
							/>
							<aside v-if="selectedWork" class="work-detail" aria-labelledby="work-detail-title">
								<h3 id="work-detail-title">{{ text('aiDepartment.workDetails') }}</h3>
								<p class="instruction">{{ selectedWork.instruction }}</p>
								<dl>
									<dt>{{ text('aiDepartment.assignee') }}</dt>
									<dd>
										{{
											memberNameById.get(selectedWork.assigneeMemberId ?? '') ??
											text('aiDepartment.unassigned')
										}}
									</dd>
									<dt>{{ text('aiDepartment.stateLabel') }}</dt>
									<dd>{{ text(`aiDepartment.state.${selectedWork.state}`) }}</dd>
									<dt>{{ text('aiDepartment.reviewPolicy') }}</dt>
									<dd>{{ text(`aiDepartment.reviewPolicyValue.${selectedWork.reviewPolicy}`) }}</dd>
								</dl>
								<section v-if="workClaim" class="history-section">
									<h4>{{ text('aiDepartment.claim.title') }}</h4>
									<p>
										{{ text('aiDepartment.claim.owner') }}:
										{{ memberNameById.get(workClaim.memberId) ?? workClaim.memberId }}
									</p>
									<p>{{ text(`aiDepartment.claim.state.${workClaim.state}`) }}</p>
									<p>
										{{
											text('aiDepartment.claim.leaseUntil', {
												date: displayDate(workClaim.leaseUntil),
											})
										}}
									</p>
								</section>
								<section v-if="workRelationships.length" class="history-section">
									<h4>{{ text('aiDepartment.relatedWork.title') }}</h4>
									<ul>
										<li
											v-for="relationship in workRelationships.filter(
												({ kind }) => kind === 'parent',
											)"
											:key="relationship.id"
										>
											<span>{{ relationshipLabel(relationship) }}</span>
											<N8nButton
												variant="outline"
												:disabled="detailLoading"
												@click="openRelatedWork(relatedWorkId(relationship))"
											>
												{{ relatedWorkTitle(relatedWorkId(relationship)) }}
											</N8nButton>
											<N8nTag
												v-if="relatedWorkItems[relatedWorkId(relationship)]"
												:text="
													text(
														`aiDepartment.state.${relatedWorkItems[relatedWorkId(relationship)].state}`,
													)
												"
											/>
										</li>
										<li
											v-for="relationship in workRelationships.filter(
												({ kind }) => kind === 'blocks',
											)"
											:key="relationship.id"
										>
											<span>{{ relationshipLabel(relationship) }}</span>
											<N8nButton
												variant="outline"
												:disabled="detailLoading"
												@click="openRelatedWork(relatedWorkId(relationship))"
											>
												{{ relatedWorkTitle(relatedWorkId(relationship)) }}
											</N8nButton>
											<N8nTag
												v-if="relatedWorkItems[relatedWorkId(relationship)]"
												:text="
													text(
														`aiDepartment.state.${relatedWorkItems[relatedWorkId(relationship)].state}`,
													)
												"
											/>
										</li>
									</ul>
								</section>
								<section v-if="selectedWork.childReports?.length" class="history-section">
									<h4>{{ text('aiDepartment.childReports.title') }}</h4>
									<article v-for="child in selectedWork.childReports" :key="child.workId">
										<p>
											<strong>{{ text('aiDepartment.childReports.child') }}</strong>
											<N8nButton variant="outline" @click="openRelatedWork(child.workId)">
												{{ relatedWorkTitle(child.workId) }}
											</N8nButton>
											<N8nTag :text="text(`aiDepartment.state.${child.state}`)" />
										</p>
										<WorkCompletionReport v-if="child.report" :report="child.report" />
									</article>
								</section>
								<WorkHelpPanel
									:details="workHelpRequests"
									:can-answer="canUpdate"
									:submitting-request-id="helpAnswerSubmittingRequestId"
									@answer="submitHelpAnswer"
								/>
								<p v-if="cancellationPending" role="status">
									{{ text('aiDepartment.cancel.pending') }}
								</p>
								<p v-if="dispatchNotice" role="status">{{ dispatchNotice }}</p>
								<p v-if="detailLoading" role="status">{{ text('aiDepartment.loading') }}</p>
								<p v-if="detailStale" role="status">{{ text('aiDepartment.detail.stale') }}</p>
								<section v-if="canUpdate" class="history-section">
									<h4>
										{{
											text(
												['running', 'blocked'].includes(selectedWork.state)
													? 'aiDepartment.workUpdate.title'
													: 'aiDepartment.workUpdate.commentTitle',
											)
										}}
									</h4>
									<label>
										<span>
											{{
												text(
													['running', 'blocked'].includes(selectedWork.state)
														? 'aiDepartment.workUpdate.label'
														: 'aiDepartment.workUpdate.commentLabel',
												)
											}}
										</span>
										<N8nInput
											v-model="workUpdateText"
											type="textarea"
											:rows="3"
											:maxlength="2000"
											:placeholder="
												text(
													['running', 'blocked'].includes(selectedWork.state)
														? 'aiDepartment.workUpdate.placeholder'
														: 'aiDepartment.workUpdate.commentPlaceholder',
												)
											"
										/>
									</label>
									<div class="action-row">
										<N8nButton
											variant="outline"
											:disabled="!workUpdateText.trim() || detailLoading || store.saving"
											@click="submitWorkActivity('comment')"
										>
											{{ text('aiDepartment.workUpdate.comment') }}
										</N8nButton>
										<N8nButton
											v-if="['running', 'blocked'].includes(selectedWork.state)"
											:disabled="!workUpdateText.trim() || detailLoading || store.saving"
											@click="submitWorkActivity('progress')"
										>
											{{ text('aiDepartment.workUpdate.progress') }}
										</N8nButton>
									</div>
								</section>
								<section v-if="selectedWork.state === 'review' && canUpdate" class="review-panel">
									<h4>{{ text('aiDepartment.businessReview') }}</h4>
									<p v-if="selectedWork.reviewStages.length">
										{{ text('aiDepartment.reviewStage') }}
										{{ selectedWork.currentReviewStageIndex + 1 }} /
										{{ selectedWork.reviewStages.length }}
									</p>
									<div v-if="returnFormWorkId !== selectedWork.id" class="action-row">
										<N8nButton
											:disabled="store.saving || detailLoading"
											@click="decideReview(selectedWork!, 'accept')"
										>
											{{ text('aiDepartment.acceptWork') }}
										</N8nButton>
										<N8nButton
											variant="outline"
											:disabled="store.saving || detailLoading"
											@click="
												returnFormWorkId = selectedWork!.id;
												returnReason = '';
											"
										>
											{{ text('aiDepartment.returnWork') }}
										</N8nButton>
									</div>
									<div v-else>
										<label>
											<span>{{ text('aiDepartment.returnReason') }}</span>
											<N8nInput v-model="returnReason" type="textarea" :rows="2" />
										</label>
										<div class="action-row">
											<N8nButton
												variant="outline"
												@click="
													returnFormWorkId = null;
													returnReason = '';
												"
											>
												{{ text('generic.cancel') }}
											</N8nButton>
											<N8nButton
												:disabled="!returnReason.trim() || store.saving || detailLoading"
												@click="decideReview(selectedWork!, 'return')"
											>
												{{ text('aiDepartment.returnWork') }}
											</N8nButton>
										</div>
									</div>
								</section>
								<section v-if="reviewDecisions.length" class="history-section">
									<h4>{{ text('aiDepartment.reviewDecisions') }}</h4>
									<ol class="activity-list">
										<li v-for="decision in reviewDecisions" :key="decision.id">
											<div>
												<strong>{{
													text(`aiDepartment.reviewDecision.${decision.decision}`)
												}}</strong>
												<p>
													{{ text('aiDepartment.reviewStage') }}: {{ decision.stageId }} ·
													{{ text('aiDepartment.reviewActor') }}: {{ decision.actorId }}
												</p>
												<p v-if="decision.reason">{{ decision.reason }}</p>
											</div>
											<time :datetime="decision.createdAt">{{
												displayDate(decision.createdAt)
											}}</time>
										</li>
									</ol>
								</section>
								<details
									v-if="selectedWork.state === 'review' && canUpdate"
									:key="selectedWork.id"
									class="review-secondary-actions"
								>
									<summary>{{ text('aiDepartment.reopenReview.moreActions') }}</summary>
									<p>{{ text('aiDepartment.reopenReview.description') }}</p>
									<label>
										<span>{{ text('aiDepartment.reopenReview.reason') }}</span>
										<N8nInput v-model="reopenReason" type="textarea" :rows="2" :maxlength="2000" />
									</label>
									<N8nButton
										variant="outline"
										:disabled="!reopenReason.trim() || store.saving || detailLoading"
										:loading="store.saving"
										@click="reopenSelectedReview(selectedWork!)"
									>
										{{ text('aiDepartment.reopenReview.button') }}
									</N8nButton>
								</details>
								<N8nButton
									v-if="selectedWork.state === 'backlog' && canUpdate"
									variant="outline"
									@click="markReady(selectedWork)"
									>{{ text('aiDepartment.markReady') }}</N8nButton
								>
								<N8nButton
									v-if="selectedWork.state === 'ready' && canExecute"
									:disabled="!canStartSelectedWork"
									:loading="store.saving"
									@click="startSelectedWork(selectedWork)"
									>{{ text('aiDepartment.startWork') }}</N8nButton
								>
								<p v-if="selectedWork.state === 'ready' && !blockersResolved" role="status">
									{{
										text(
											relationshipLoadFailed
												? 'aiDepartment.blockers.unavailable'
												: 'aiDepartment.blockers.unresolved',
										)
									}}
								</p>
								<N8nButton
									v-if="selectedWork.state === 'blocked' && canExecute"
									:disabled="!canStartSelectedWork"
									:loading="store.saving"
									@click="startSelectedWork(selectedWork, true)"
									>{{ text('aiDepartment.retryWork') }}</N8nButton
								>
								<p v-if="selectedWork.state === 'blocked' && !blockersResolved" role="status">
									{{
										text(
											relationshipLoadFailed
												? 'aiDepartment.blockers.unavailable'
												: 'aiDepartment.blockers.unresolved',
										)
									}}
								</p>
								<N8nButton
									v-if="canCancelSelectedWork"
									variant="destructive"
									:disabled="detailLoading || store.saving"
									:loading="store.saving"
									data-test-id="ai-department-cancel-work"
									@click="cancelWork(selectedWork)"
								>
									{{ text('aiDepartment.cancel.button') }}
								</N8nButton>
								<section v-if="workActivity.length" class="history-section">
									<h4>{{ text('aiDepartment.activityTitle') }}</h4>
									<ol>
										<li v-for="entry in workActivity" :key="entry.id">
											<strong>{{ activityLabel(entry.kind) }}</strong>
											<p v-if="entry.body && !entry.report">{{ entry.body }}</p>
											<WorkCompletionReport v-if="entry.report" :report="entry.report" />
											<time :datetime="entry.createdAt">{{ displayDate(entry.createdAt) }}</time>
										</li>
									</ol>
									<N8nButton
										v-if="workActivity.length < activityCount"
										variant="outline"
										:disabled="detailLoading"
										@click="loadMoreActivity"
										>{{ text('aiDepartment.moreActivity') }}</N8nButton
									>
								</section>
								<RuntimeAttemptList
									:attempts="attempts"
									:members="activeMembers"
									:wake="workWake"
								/>
								<section v-if="history.length" class="history-section">
									<h4>{{ text('aiDepartment.history') }}</h4>
									<ol>
										<li v-for="entry in history" :key="entry.id">
											<span
												>{{
													entry.fromState
														? text(`aiDepartment.state.${entry.fromState}`)
														: text('aiDepartment.created')
												}}
												→ {{ text(`aiDepartment.state.${entry.toState}`) }}</span
											><time :datetime="entry.createdAt">{{ displayDate(entry.createdAt) }}</time>
										</li>
									</ol>
								</section>
							</aside>
							<p v-if="detailAccessLost" role="status">
								{{ text('aiDepartment.detail.accessLost') }}
							</p>
						</div>
						<nav
							v-if="store.workCount > 100"
							class="pagination"
							:aria-label="text('aiDepartment.pagination')"
						>
							<N8nButton variant="outline" :disabled="workPage === 0" @click="workPage--">{{
								text('aiDepartment.previous')
							}}</N8nButton>
							<span>{{ text('aiDepartment.page', { page: workPage + 1 }) }}</span>
							<N8nButton
								variant="outline"
								:disabled="(workPage + 1) * 100 >= store.workCount"
								@click="workPage++"
								>{{ text('generic.next') }}</N8nButton
							>
						</nav>
					</section>
				</template>
			</template>
		</section>
	</component>
</template>

<style lang="scss" scoped>
.ai-department {
	padding-block: var(--spacing--sm);
	color: var(--text-color);
}

.page-header,
.section-heading,
.inline-form,
.create-work-form,
.filters,
.action-row {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: var(--spacing--sm);
}

.page-header {
	align-items: start;
	margin-bottom: var(--spacing--lg);

	h1 {
		margin: 0;
	}
	p {
		margin: var(--spacing--2xs) 0 0;
		color: var(--text-color--subtle);
	}
}

.department-picker,
.inline-form label,
.create-work-form label,
.filters label,
.review-panel label {
	display: grid;
	gap: var(--spacing--2xs);
}

.department-picker select,
.activity-picker select,
.create-work-form select,
.filters select {
	min-height: var(--height--md);
	padding: 0 var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--3xs);
	background: var(--background--surface);
	color: var(--text-color);
}

.stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: var(--spacing--xs);
	margin: 0 0 var(--spacing--md);
	padding: 0;
	list-style: none;
}

.stat {
	--stat-color: var(--color--primary);

	position: relative;
	display: grid;
	gap: var(--spacing--5xs);
	padding: var(--spacing--xs) var(--spacing--sm) var(--spacing--xs) var(--spacing--md);
	overflow: hidden;
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--xs);

	&::before {
		content: '';
		position: absolute;
		inset-block: var(--spacing--xs);
		inset-inline-start: var(--spacing--2xs);
		width: 4px;
		border-radius: var(--radius--full);
		background: var(--stat-color);
	}

	strong {
		font-size: var(--font-size--2xl);
		line-height: 1.1;
	}
	span {
		color: var(--text-color--subtle);
		font-size: var(--font-size--xs);
	}
}
.stat--active {
	--stat-color: var(--color--success);
}
.stat--attention {
	--stat-color: var(--color--warning);
}
.stat--done {
	--stat-color: var(--color--secondary);
}

.section-nav {
	display: flex;
	width: 100%;
	max-width: 100%;
	margin-bottom: var(--spacing--lg);
	border-bottom: var(--border);
}

.org-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
	gap: var(--spacing--sm);
	align-items: start;
}

.org-prompt {
	margin: 0;
	padding: var(--spacing--md);
	border: 1px dashed var(--border-color);
	border-radius: var(--radius--lg);
	color: var(--text-color--subtle);
	text-align: center;
}

.record-list li.highlighted {
	border-color: var(--color--primary);
	box-shadow: 0 0 0 2px var(--color--primary--tint-2);
}

.overview-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--spacing--sm);
}

.summary-card,
.content-section,
.work-detail {
	min-width: 0;
	padding: var(--spacing--md);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--xs);
}

.summary-card h2,
.content-section h2,
.work-detail h3 {
	margin-top: 0;
}

.section-heading {
	margin-bottom: var(--spacing--sm);

	h2 {
		margin-bottom: var(--spacing--3xs);
	}
	p {
		margin: 0;
		color: var(--text-color--subtle);
	}
}

.summary-counts {
	display: flex;
	gap: var(--spacing--sm);
}
.summary-counts button {
	display: grid;
	justify-items: start;
	border: 0;
	background: none;
	color: inherit;
	cursor: pointer;
}
.summary-counts strong,
.summary-total {
	font-size: var(--font-size--2xl);
}
.muted,
.summary-counts span,
.record-list p {
	color: var(--text-color--subtle);
}

.compact-list,
.record-list,
.history-section ul,
.history-section ol {
	margin: 0;
	padding: 0;
	list-style: none;
}

.compact-list li,
.record-list li,
.history-section li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--sm);
	padding: var(--spacing--xs) 0;
	border-bottom: var(--border--base);
}

.compact-list li > span,
.compact-list li > button,
.record-button strong {
	overflow-wrap: anywhere;
}
.compact-list time,
.history-section time {
	color: var(--text-color--subtle);
}
.people-list small {
	display: block;
	color: var(--text-color--subtle);
}
.member-actions {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
}
.binding-panel {
	flex: 1 1 100%;
	padding: var(--spacing--sm);
	border: var(--border);
	border-radius: var(--radius--3xs);
}
.binding-panel label {
	display: grid;
	gap: var(--spacing--2xs);
}
.binding-panel > p:first-child {
	margin-top: 0;
}
.text-link,
.record-button {
	border: 0;
	background: none;
	color: inherit;
	text-align: left;
	cursor: pointer;
}
.text-link {
	text-decoration: underline;
}
.inline-form {
	justify-content: start;
	flex-wrap: wrap;
	margin: var(--spacing--sm) 0;
}
.inline-form label {
	min-width: 0;
}
.member-form {
	align-items: end;
}
.meeting-form {
	display: grid;
	gap: var(--spacing--sm);
	max-width: 42rem;
	margin: var(--spacing--md) 0;
}
.meeting-overview,
.meeting-detail {
	display: grid;
	gap: var(--spacing--md);
}
.meeting-list-actions {
	display: flex;
	align-items: center;
	justify-content: end;
	gap: var(--spacing--2xs);
}
.meeting-detail .record-list li {
	align-items: flex-start;
}
.meeting-contribution {
	margin-top: var(--spacing--xs);
}
.meeting-comparison {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
	gap: var(--spacing--sm);
	padding: 0;
	list-style: none;
}
.meeting-comparison > li {
	min-width: 0;
	padding: var(--spacing--sm);
	border: var(--border);
	border-radius: var(--radius--3xs);
	background: var(--background--surface);
}
.meeting-comparison .meeting-contribution ul {
	padding-inline-start: var(--spacing--md);
}
.meeting-minutes {
	display: grid;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm) 0;
	border-bottom: var(--border--base);
}
.meeting-minutes > :first-child {
	margin-top: 0;
}
.meeting-form > label {
	display: grid;
	gap: var(--spacing--2xs);
}
.meeting-form select,
.meeting-form textarea {
	min-height: var(--height--md);
	padding: var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--3xs);
	background: var(--background--surface);
	color: var(--text-color);
}
.meeting-form fieldset {
	display: grid;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm);
	border: var(--border);
	border-radius: var(--radius--3xs);
}
.meeting-member {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
}
.create-work-form {
	justify-content: start;
	flex-wrap: wrap;
	margin: var(--spacing--sm) 0;
}
.create-work-form .wide-field {
	flex: 1 1 100%;
}
.create-work-form > label:not(.wide-field) {
	flex: 1 1 var(--spacing--lg);
}
.filters {
	align-items: end;
}
.filters label {
	min-width: 0;
}
.work-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
	gap: var(--spacing--sm);
}
.work-list li {
	align-items: start;
}
.work-list li.selected {
	background: var(--color--foreground--tint-1);
}
.record-button {
	display: grid;
	gap: var(--spacing--2xs);
	min-width: 0;
	padding: 0;
}
.record-button span {
	color: var(--text-color--subtle);
}
.work-detail {
	align-self: start;
}
.work-detail dl {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: var(--spacing--2xs) var(--spacing--sm);
}
.work-detail dt {
	color: var(--text-color--subtle);
}
.work-detail dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.instruction {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.review-panel,
.history-section {
	margin-top: var(--spacing--md);
}
.review-secondary-actions {
	margin-top: var(--spacing--sm);
}
.review-secondary-actions summary {
	color: var(--text-color--subtle);
	cursor: pointer;
}
.review-secondary-actions p {
	margin: var(--spacing--2xs) 0 var(--spacing--xs);
	color: var(--text-color--subtle);
}
.review-secondary-actions label {
	display: grid;
	gap: var(--spacing--2xs);
	margin-bottom: var(--spacing--xs);
}
.activity-picker {
	display: grid;
	gap: var(--spacing--2xs);
	max-width: 100%;
	margin: var(--spacing--sm) 0;
}
.activity-picker select {
	min-height: var(--height--md);
	padding: 0 var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--3xs);
	background: var(--background--surface);
	color: var(--text-color);
}
.activity-list {
	padding: 0;
	list-style: none;
}
.activity-list li {
	display: flex;
	justify-content: space-between;
	gap: var(--spacing--sm);
	padding: var(--spacing--xs) 0;
	border-bottom: var(--border);
}
.pagination {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--spacing--sm);
	margin-top: var(--spacing--sm);
}
.activity-list p {
	margin: var(--spacing--2xs) 0 0;
	color: var(--text-color--subtle);
}
.review-panel h4,
.history-section h4 {
	margin-bottom: var(--spacing--2xs);
}
.action-row {
	justify-content: start;
	margin-top: var(--spacing--xs);
}
.state-message,
.inline-error {
	display: flex;
	align-items: center;
	gap: var(--spacing--sm);
}
.error-message,
.inline-error {
	color: var(--text-color--danger);
}
.empty-layout {
	display: grid;
	justify-items: center;
	gap: var(--spacing--sm);
}
.setup-card {
	grid-column: 1 / -1;
}

@media (max-width: 48rem) {
	.page-header,
	.section-heading {
		align-items: stretch;
		flex-direction: column;
	}
	.overview-grid,
	.org-grid,
	.work-layout {
		grid-template-columns: minmax(0, 1fr);
	}
	.filters {
		align-items: stretch;
		flex-direction: column;
	}
	.department-picker select {
		max-width: 100%;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-department :deep(*) {
		scroll-behavior: auto !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
</style>
