<script setup lang="ts">
import type {
	AiDepartmentMemberDto,
	AiDepartmentWorkActivityDto,
	AiDepartmentWorkItemDto,
	AiDepartmentWorkState,
} from '@n8n/api-types';
import {
	N8nButton,
	N8nEmptyState,
	N8nInput,
	N8nOption,
	N8nSelect,
	N8nTag,
} from '@n8n/design-system';
import { capabilities, capabilityRegistry, componentRegistry } from '@n8n/frontend-module-sdk';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { getResourcePermissions } from '@n8n/permissions';
import { useRootStore } from '@n8n/stores/useRootStore';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { listAttempts, listWorkHistory, listWorkActivity } from '../ai-department.api';
import type { AiDepartmentWorkTransition } from '../ai-department.api';
import { useAiDepartmentStore } from '../ai-department.store';
import { DEBOUNCE_TIME } from '@n8n/frontend-constants/durations';
import { getDebounceTime, useDebounce } from '@n8n/composables/useDebounce';

const i18n = useI18n();
const route = useRoute();
const router = useRouter();
const store = useAiDepartmentStore();
const rootStore = useRootStore();
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
const section = computed(() => {
	const candidate = route.query.section;
	return candidate === 'work' || candidate === 'people' || candidate === 'activity'
		? candidate
		: 'overview';
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
const workStateOptions: AiDepartmentWorkState[] = [
	'backlog',
	'ready',
	'running',
	'review',
	'blocked',
	'done',
	'cancelled',
];
const departmentName = ref('');
const goalTitle = ref('');
const memberName = ref('');
const memberRole = ref('');
const workInstruction = ref('');
const workAssignee = ref('');
const workGoal = ref('');
const workSearch = ref('');
const workFilter = ref<AiDepartmentWorkState | ''>('');
const workPage = ref(0);
const selectedWork = ref<AiDepartmentWorkItemDto | null>(null);
const attempts = ref<Awaited<ReturnType<typeof listAttempts>>>([]);
const history = ref<AiDepartmentWorkTransition[]>([]);
const workActivity = ref<AiDepartmentWorkActivityDto[]>([]);
const activityCount = ref(0);
let detailRequest = 0;
const returnReason = ref('');
const actionError = ref('');
const detailLoading = ref(false);
const bindingMember = ref<AiDepartmentMemberDto | null>(null);
const bindingSelection = ref('');
const bindingLoading = ref(false);

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

function text(key: string, options?: Record<string, string | number>) {
	return i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
}

function goToSection(next: 'overview' | 'work' | 'people' | 'activity') {
	void router.replace({
		query: { ...route.query, section: next === 'overview' ? undefined : next },
	});
}

async function loadPage() {
	detailRequest++;
	workActivity.value = [];
	if (!projectId.value) return;
	selectedWork.value = null;
	await store.load(projectId.value, departmentIdFromRoute.value);
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
	};
	return text(`aiDepartment.activityAction.${labels[kind] ?? 'updated'}`);
}

async function openWork(item: AiDepartmentWorkItemDto) {
	const request = ++detailRequest;
	selectedWork.value = item;
	attempts.value = [];
	history.value = [];
	workActivity.value = [];
	activityCount.value = 0;
	detailLoading.value = true;
	actionError.value = '';
	const currentProject = projectId.value;
	const currentDepartment = store.selectedDepartmentId;
	if (!currentProject || !currentDepartment) {
		detailLoading.value = false;
		return;
	}
	try {
		const [nextAttempts, nextHistory, nextActivity] = await Promise.all([
			listAttempts(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkHistory(rootStore.restApiContext, currentProject, currentDepartment, item.id),
			listWorkActivity(rootStore.restApiContext, currentProject, currentDepartment, item.id),
		]);
		if (request !== detailRequest) return;
		attempts.value = nextAttempts;
		history.value = nextHistory;
		workActivity.value = nextActivity.data;
		activityCount.value = nextActivity.count;
	} catch {
		if (request === detailRequest) actionError.value = text('aiDepartment.loadError');
	} finally {
		if (request === detailRequest) detailLoading.value = false;
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

async function decideReview(item: AiDepartmentWorkItemDto, decision: 'accept' | 'return') {
	if (!projectId.value) return;
	actionError.value = '';
	try {
		await store.review(
			projectId.value,
			item,
			decision,
			decision === 'return' ? returnReason.value.trim() : undefined,
		);
		selectedWork.value = store.work.find(({ id }) => id === item.id) ?? null;
		returnReason.value = '';
	} catch {
		actionError.value = text('aiDepartment.actionError');
	}
}

function displayDate(value: string) {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(value),
	);
}

watch([projectId, departmentIdFromRoute], async () => await loadPage(), { immediate: true });
watch(section, (value) => (store.section = value));
watch([workSearch, workFilter], () => {
	workPage.value = 0;
	void refreshWorkDebounced();
});
onMounted(() => (store.section = section.value));
</script>

<template>
	<component :is="PageViewLayout" v-if="PageViewLayout">
		<template #header>
			<component :is="ProjectHeader" v-if="ProjectHeader" />
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

			<nav class="section-nav" :aria-label="text('aiDepartment.navigation')">
				<button
					v-for="item in ['overview', 'work', 'people', 'activity'] as const"
					:key="item"
					:aria-current="section === item ? 'page' : undefined"
					@click="goToSection(item)"
				>
					{{ text(`aiDepartment.nav.${item}`) }}
				</button>
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
					<div v-if="actionError" class="inline-error" role="alert">{{ actionError }}</div>
					<section v-if="section === 'overview'" class="overview-grid">
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
							<p v-if="store.attentionWork.length === 0" class="muted">
								{{ text('aiDepartment.noAttention') }}
							</p>
							<ul v-else class="compact-list">
								<li v-for="item in store.attentionWork.slice(0, 5)" :key="item.id">
									<button class="text-link" @click="goToSection('work')">
										{{ item.instruction }}
									</button>
									<N8nTag :text="text(`aiDepartment.state.${item.state}`)" />
								</li>
							</ul>
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
							<li v-for="member in activeMembers" :key="member.id">
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
									<p v-if="entry.body">{{ entry.body }}</p>
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
								:description="text('aiDepartment.empty.work.description')"
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
								<p v-if="detailLoading" role="status">{{ text('aiDepartment.loading') }}</p>
								<section v-if="selectedWork.state === 'review' && canUpdate" class="review-panel">
									<h4>{{ text('aiDepartment.businessReview') }}</h4>
									<label
										><span>{{ text('aiDepartment.returnReason') }}</span
										><N8nInput v-model="returnReason" type="textarea" :rows="2"
									/></label>
									<div class="action-row">
										<N8nButton
											variant="outline"
											:disabled="!returnReason.trim()"
											@click="decideReview(selectedWork!, 'return')"
											>{{ text('aiDepartment.returnWork') }}</N8nButton
										><N8nButton @click="decideReview(selectedWork!, 'accept')">{{
											text('aiDepartment.acceptWork')
										}}</N8nButton>
									</div>
								</section>
								<N8nButton
									v-if="selectedWork.state === 'backlog' && canUpdate"
									variant="outline"
									@click="markReady(selectedWork)"
									>{{ text('aiDepartment.markReady') }}</N8nButton
								>
								<section v-if="workActivity.length" class="history-section">
									<h4>{{ text('aiDepartment.activityTitle') }}</h4>
									<ol>
										<li v-for="entry in workActivity" :key="entry.id">
											<strong>{{ activityLabel(entry.kind) }}</strong>
											<p v-if="entry.body">{{ entry.body }}</p>
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
								<section v-if="attempts.length" class="history-section">
									<h4>{{ text('aiDepartment.attempts') }}</h4>
									<ul>
										<li v-for="attempt in attempts" :key="attempt.id">
											{{
												text('aiDepartment.attemptSummary', {
													ordinal: attempt.ordinal,
													phase: attempt.phase,
												})
											}}
										</li>
									</ul>
								</section>
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
						</div>
						<nav
							v-if="store.workCount > 100"
							class="pagination"
							:aria-label="text('aiDepartment.pagination')"
						>
							<N8nButton
								variant="outline"
								:disabled="workPage === 0"
								@click="
									workPage--;
									refreshWork();
								"
								>{{ text('aiDepartment.previous') }}</N8nButton
							>
							<span>{{ text('aiDepartment.page', { page: workPage + 1 }) }}</span>
							<N8nButton
								variant="outline"
								:disabled="(workPage + 1) * 100 >= store.workCount"
								@click="
									workPage++;
									refreshWork();
								"
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

.section-nav {
	display: flex;
	gap: var(--spacing--2xs);
	margin-bottom: var(--spacing--lg);
	border-bottom: var(--border);

	button {
		padding: var(--spacing--xs) var(--spacing--sm);
		border: 0;
		border-bottom: var(--focus--border-width) solid transparent;
		background: transparent;
		color: var(--text-color--subtle);
		cursor: pointer;
	}

	button[aria-current='page'] {
		border-bottom-color: var(--color--primary);
		color: var(--text-color);
	}
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
	border-radius: var(--radius--xs);
	background: var(--background--surface);
}

.summary-card h2,
.content-section h2,
.work-detail h3 {
	margin-top: 0;
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
</style>
