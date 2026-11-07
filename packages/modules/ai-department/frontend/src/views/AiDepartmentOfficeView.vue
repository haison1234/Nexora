<script setup lang="ts">
import { N8nButton } from '@n8n/design-system';
import { componentRegistry } from '@n8n/frontend-module-sdk';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	shallowRef,
	watch,
	type ComponentPublicInstance,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
	AI_DEPARTMENT_HOME_VIEW,
	AI_DEPARTMENT_POLL_INTERVAL_MS,
} from '../ai-department.constants';
import { useAiDepartmentStore } from '../ai-department.store';
import { registerAiDepartmentLocales } from '../ai-department.i18n';
import { useVisiblePolling } from '../composables/useVisiblePolling';
import '../office/office-theme.css';
import { buildOfficeModel, connectionFor, OFFICE_LIMITS } from '../office/office-model';
import { placeOfficeLabels } from '../office/office-label-layout';
import { OFFICE_PRESETS, type OfficePresetId } from '../office/scene/presets';
import OfficeRoster from '../office/OfficeRoster.vue';
import OfficeStatusChip from '../office/OfficeStatusChip.vue';
import type { LabelPosition, OfficeFailureReason, OfficeRenderer } from '../office/office-renderer';

const i18n = useI18n();
registerAiDepartmentLocales();
const route = useRoute();
const router = useRouter();
const store = useAiDepartmentStore();
const ProjectHeader = computed(() => componentRegistry.get('project-header'));
const PageViewLayout = computed(() => componentRegistry.get('page-view-layout'));

const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
const projectId = computed(() =>
	typeof route.params.projectId === 'string' ? route.params.projectId : undefined,
);
const departmentIdFromRoute = computed(() =>
	typeof route.query.departmentId === 'string' ? route.query.departmentId : undefined,
);
const mode = computed<'3d' | '2d'>(() => (route.query.view === '2d' ? '2d' : '3d'));

const reducedMotionQuery =
	typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: null;
const reducedMotion = ref(reducedMotionQuery?.matches ?? false);
const onMotionChange = (event: MediaQueryListEvent) => (reducedMotion.value = event.matches);

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

const model = computed(() =>
	buildOfficeModel(
		store.members,
		store.overviewWork,
		OFFICE_LIMITS.characters,
		store.waitingWorkIds,
	),
);
const connection = computed(() => connectionFor(store.lastSyncedAt, store.syncFailed, now.value));
const selectedMemberId = ref<string | null>(null);
const selected = computed(
	() => model.value.characters.find(({ memberId }) => memberId === selectedMemberId.value) ?? null,
);
const selectedTeamName = computed(() => {
	const team = model.value.teams.find(({ id }) => id === selected.value?.teamId);
	const lead = model.value.characters.find(({ memberId }) => memberId === team?.leadMemberId);
	return lead
		? text('aiDepartment.office.team.of', { name: lead.name })
		: text('aiDepartment.office.team.independent');
});

const updatedLabel = computed(() => {
	if (store.lastSyncedAt === null) return text('aiDepartment.office.neverSynced');
	const seconds = Math.max(0, Math.round((now.value - store.lastSyncedAt) / 1000));
	return seconds < 90
		? text('aiDepartment.office.updatedSeconds', { seconds })
		: text('aiDepartment.office.updatedMinutes', { minutes: Math.round(seconds / 60) });
});
const lastKnownLabel = computed(() =>
	store.lastSyncedAt === null
		? ''
		: text('aiDepartment.office.lastKnown', {
				time: new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(
					new Date(store.lastSyncedAt),
				),
			}),
);

const hostEl = ref<HTMLElement | null>(null);
const renderer = shallowRef<OfficeRenderer | null>(null);
const rendererState = ref<'idle' | 'loading' | 'ready'>('idle');
const failure = ref<OfficeFailureReason | null>(null);
const activePreset = ref<OfficePresetId>('overview');
const labelEls = new Map<string, HTMLElement>();
const labelSizes = new Map<string, { width: number; height: number }>();
const hiddenLabelCount = ref(0);
let unmounted = false;
let startToken = 0;

function setLabelRef(id: string, el: Element | ComponentPublicInstance | null) {
	if (el instanceof HTMLElement) labelEls.set(id, el);
	else {
		labelEls.delete(id);
		labelSizes.delete(id);
	}
}

function placeLabels(positions: Map<string, LabelPosition>) {
	for (const id of positions.keys()) {
		if (labelSizes.has(id)) continue;
		const el = labelEls.get(id);
		if (!el) continue;
		const bounds = el.getBoundingClientRect();
		labelSizes.set(id, { width: bounds.width, height: bounds.height });
	}
	const placed = placeOfficeLabels(
		positions,
		labelSizes,
		selectedMemberId.value,
		{
			width: hostEl.value?.clientWidth ?? 1,
			height: hostEl.value?.clientHeight ?? 1,
		},
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
			Number.parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue('--spacing--4xs'),
			),
	);
	const hidden = [...positions].filter(
		([id, position]) => position.visible && !placed.get(id)?.visible,
	).length;
	if (hidden !== hiddenLabelCount.value) hiddenLabelCount.value = hidden;
	for (const [id, position] of placed) {
		const el = labelEls.get(id);
		if (!el) continue;
		el.style.transform = `translate(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px) translate(-50%, -100%)`;
		el.style.visibility = position.visible ? 'visible' : 'hidden';
		el.style.zIndex = String(
			Math.round(position.y) + (el.classList.contains('label--selected') ? 10_000 : 0),
		);
	}
}

function pushModel() {
	labelSizes.clear();
	renderer.value?.update(model.value, {
		selectedMemberId: selectedMemberId.value,
		reducedMotion: reducedMotion.value,
		helpLinks: store.helpLinks,
	});
}

function setPreset(id: OfficePresetId) {
	activePreset.value = id;
	renderer.value?.setPreset(id);
}

function stopRenderer() {
	startToken++;
	renderer.value?.dispose();
	renderer.value = null;
	rendererState.value = 'idle';
	labelEls.clear();
	labelSizes.clear();
}

async function startRenderer() {
	const host = hostEl.value;
	if (!host || renderer.value || rendererState.value === 'loading' || failure.value) return;
	const token = ++startToken;
	rendererState.value = 'loading';
	try {
		const { createOfficeRenderer } = await import('../office/office-renderer');
		const next = await createOfficeRenderer(
			host,
			{
				onSelect: (memberId) => (selectedMemberId.value = memberId),
				onLabels: placeLabels,
				onFailure: (reason) => {
					stopRenderer();
					failure.value = reason;
				},
			},
			{
				teamTitle: (name) => text('aiDepartment.office.team.of', { name }),
				zoneLabels: {
					review: text('aiDepartment.office.zone.review'),
					blocked: text('aiDepartment.office.zone.blocked'),
					lounge: text('aiDepartment.office.zone.lounge'),
					board: text('aiDepartment.office.zone.board'),
					empty: text('aiDepartment.office.board.empty'),
				},
			},
		);
		if (unmounted || token !== startToken || hostEl.value !== host) {
			next.dispose();
			return;
		}
		renderer.value = next;
		rendererState.value = 'ready';
		next.setPreset(activePreset.value);
		pushModel();
	} catch (cause) {
		if (token !== startToken) return;
		rendererState.value = 'idle';
		failure.value =
			cause instanceof Error && 'reason' in cause && typeof cause.reason === 'string'
				? (cause.reason as OfficeFailureReason)
				: 'init-failed';
	}
}

async function retry3d() {
	failure.value = null;
	await nextTick();
	await startRenderer();
}

function setMode(next: '3d' | '2d') {
	void router.replace({ query: { ...route.query, view: next === '3d' ? undefined : '2d' } });
}

function select(memberId: string) {
	selectedMemberId.value = memberId === selectedMemberId.value ? null : memberId;
}

function openMember(memberId: string) {
	void router.push({
		name: AI_DEPARTMENT_HOME_VIEW,
		params: { projectId: projectId.value },
		query: { departmentId: store.selectedDepartmentId, section: 'people', memberId },
	});
}

function openWork(workId: string) {
	void router.push({
		name: AI_DEPARTMENT_HOME_VIEW,
		params: { projectId: projectId.value },
		query: { departmentId: store.selectedDepartmentId, section: 'work', workId },
	});
}

function openPeople() {
	void router.push({
		name: AI_DEPARTMENT_HOME_VIEW,
		params: { projectId: projectId.value },
		query: { departmentId: store.selectedDepartmentId, section: 'people' },
	});
}

async function selectDepartment(event: Event) {
	const value = (event.target as HTMLSelectElement).value;
	if (!value) return;
	await router.replace({ query: { ...route.query, departmentId: value } });
}

async function loadPage() {
	if (!projectId.value) return;
	selectedMemberId.value = null;
	await store.load(projectId.value, departmentIdFromRoute.value);
	await store.loadHelpWaiting(projectId.value);
}

useVisiblePolling(async () => {
	if (!projectId.value || store.loading) return;
	await store.refreshQuiet(projectId.value);
	await store.loadHelpWaiting(projectId.value);
}, AI_DEPARTMENT_POLL_INTERVAL_MS);

watch([projectId, departmentIdFromRoute], async () => await loadPage(), { immediate: true });
watch(
	hostEl,
	(el) => {
		if (el) void startRenderer();
		else stopRenderer();
	},
	{ flush: 'post' },
);
watch([model, selectedMemberId, reducedMotion, () => store.helpLinks], pushModel);
watch(model, (next) => {
	if (
		selectedMemberId.value &&
		!next.characters.some(({ memberId }) => memberId === selectedMemberId.value)
	) {
		selectedMemberId.value = null;
	}
});
watch(mode, () => {
	failure.value = null;
});

onMounted(() => {
	clock = setInterval(() => (now.value = Date.now()), 1000);
	reducedMotionQuery?.addEventListener('change', onMotionChange);
});

onBeforeUnmount(() => {
	unmounted = true;
	if (clock) clearInterval(clock);
	reducedMotionQuery?.removeEventListener('change', onMotionChange);
	stopRenderer();
});

const show3d = computed(
	() => mode.value === '3d' && model.value.characters.length > 0 && !failure.value,
);
</script>

<template>
	<component :is="PageViewLayout" v-if="PageViewLayout">
		<template #header>
			<component :is="ProjectHeader" v-if="ProjectHeader" hide-header-actions />
		</template>
		<section class="office" aria-labelledby="office-title" data-test-id="ai-department-office">
			<header class="office-header">
				<div class="titles">
					<h1 id="office-title">{{ text('aiDepartment.office.title') }}</h1>
					<p>{{ store.department?.name ?? text('aiDepartment.office.subtitle') }}</p>
				</div>
				<div class="controls">
					<label v-if="store.departments.length > 1" class="department-picker">
						<span>{{ text('aiDepartment.department') }}</span>
						<select
							:value="store.selectedDepartmentId ?? ''"
							:disabled="store.loading"
							@change="selectDepartment"
						>
							<option v-for="item in store.departments" :key="item.id" :value="item.id">
								{{ item.name }}
							</option>
						</select>
					</label>
					<div class="segmented" role="group" :aria-label="text('aiDepartment.office.mode')">
						<button
							type="button"
							data-test-id="office-mode-3d"
							:aria-pressed="mode === '3d'"
							@click="setMode('3d')"
						>
							{{ text('aiDepartment.office.view3d') }}
						</button>
						<button
							type="button"
							data-test-id="office-mode-2d"
							:aria-pressed="mode === '2d'"
							@click="setMode('2d')"
						>
							{{ text('aiDepartment.office.view2d') }}
						</button>
					</div>
				</div>
			</header>

			<div class="sync" :class="`sync--${connection}`" role="status" data-test-id="office-sync">
				<span class="sync-dot" aria-hidden="true" />
				<strong>{{ text(`aiDepartment.office.connection.${connection}`) }}</strong>
				<span>{{ updatedLabel }}</span>
				<span v-if="connection !== 'live' && lastKnownLabel" class="sync-note">
					{{ lastKnownLabel }}
				</span>
			</div>

			<p v-if="store.accessLost" class="notice notice--danger" role="alert">
				{{ text('aiDepartment.office.accessLost') }}
			</p>
			<p v-else-if="store.loading && !store.isReady" class="notice" role="status">
				{{ text('aiDepartment.loading') }}
			</p>
			<p
				v-else-if="store.error && model.characters.length === 0"
				class="notice notice--danger"
				role="alert"
			>
				{{ text('aiDepartment.loadError') }}
				<N8nButton variant="outline" @click="loadPage">{{ text('generic.retry') }}</N8nButton>
			</p>

			<div v-else-if="model.characters.length === 0" class="empty" data-test-id="office-empty">
				<div class="empty-art" aria-hidden="true"><span /><span /><span /></div>
				<h2>{{ text('aiDepartment.office.emptyTitle') }}</h2>
				<p>{{ text('aiDepartment.office.emptyDescription') }}</p>
				<N8nButton @click="openPeople">{{ text('aiDepartment.office.addMembers') }}</N8nButton>
			</div>

			<template v-else>
				<p
					v-if="failure"
					class="notice notice--warning"
					role="alert"
					data-test-id="office-fallback"
				>
					{{
						text(
							failure === 'unsupported'
								? 'aiDepartment.office.fallback.unsupported'
								: failure === 'context-lost'
									? 'aiDepartment.office.fallback.contextLost'
									: 'aiDepartment.office.fallback.initFailed',
						)
					}}
					<N8nButton variant="outline" @click="retry3d">
						{{ text('aiDepartment.office.retry3d') }}
					</N8nButton>
				</p>
				<p v-if="model.truncated > 0 && mode === '3d'" class="notice" role="status">
					{{
						text('aiDepartment.office.truncated', {
							limit: OFFICE_LIMITS.characters,
							hidden: model.truncated,
						})
					}}
				</p>
				<p v-if="reducedMotion && show3d" class="notice" role="status">
					{{ text('aiDepartment.office.reducedMotion') }}
				</p>

				<div class="workspace" :class="{ 'workspace--2d': !show3d, 'office-theme': show3d }">
					<div v-if="show3d" class="stage-wrap">
						<div ref="hostEl" class="stage" data-test-id="office-stage">
							<p v-if="rendererState !== 'ready'" class="stage-loading" role="status">
								{{ text('aiDepartment.office.loading3d') }}
							</p>
							<div
								v-show="rendererState === 'ready'"
								class="presets office-glass"
								role="group"
								:aria-label="text('aiDepartment.office.camera')"
							>
								<button
									v-for="id in OFFICE_PRESETS"
									:key="id"
									type="button"
									:data-test-id="`office-preset-${id}`"
									:aria-pressed="activePreset === id"
									@click="setPreset(id)"
								>
									{{ text(`aiDepartment.office.preset.${id}`) }}
								</button>
							</div>
						</div>
						<div v-show="rendererState === 'ready'" class="labels">
							<button
								v-for="member in model.characters"
								:key="member.memberId"
								:ref="(el) => setLabelRef(member.memberId, el)"
								type="button"
								class="label"
								:class="[
									`label--${member.status}`,
									{ 'label--selected': member.memberId === selectedMemberId },
								]"
								:aria-label="`${text('aiDepartment.office.selectMember', { name: member.name })} (${text(`aiDepartment.office.status.${member.status}`)})`"
								:aria-pressed="member.memberId === selectedMemberId"
								:title="text(`aiDepartment.office.status.${member.status}`)"
								@click="select(member.memberId)"
							>
								<span class="label-dot" aria-hidden="true" />
								<span class="label-name">{{ member.name }}</span>
								<span class="label-status">
									{{ text(`aiDepartment.office.status.${member.status}`) }}
								</span>
							</button>
						</div>
						<p v-if="hiddenLabelCount > 0" class="hint" role="status">
							{{ text('aiDepartment.office.labelsHidden', { hidden: hiddenLabelCount }) }}
						</p>
						<p v-else class="hint">{{ text('aiDepartment.office.help') }}</p>
					</div>

					<aside
						class="side"
						:class="{ 'office-glass': show3d, 'office-glass-tokens': show3d }"
						:aria-label="text('aiDepartment.office.roster')"
					>
						<section v-if="selected" class="detail" aria-live="polite" data-test-id="office-detail">
							<header>
								<div>
									<span class="eyebrow">{{ text('aiDepartment.office.selectedTitle') }}</span>
									<h2>{{ selected.name }}</h2>
									<p>{{ selected.role }} · {{ selectedTeamName }}</p>
								</div>
								<button
									type="button"
									class="icon-button"
									:aria-label="text('aiDepartment.office.clearSelection')"
									@click="selectedMemberId = null"
								>
									×
								</button>
							</header>
							<div class="detail-status"><OfficeStatusChip :status="selected.status" /></div>
							<dl>
								<dt>{{ text('aiDepartment.office.currentWork') }}</dt>
								<dd>{{ selected.workInstruction ?? text('aiDepartment.office.noWork') }}</dd>
							</dl>
							<p class="version">
								{{ text('aiDepartment.office.version', { version: selected.sourceVersion }) }}
							</p>
							<div class="detail-actions">
								<N8nButton @click="openMember(selected.memberId)">
									{{ text('aiDepartment.office.openMember') }}
								</N8nButton>
								<N8nButton
									v-if="selected.workId"
									variant="outline"
									@click="openWork(selected.workId)"
								>
									{{ text('aiDepartment.office.openWork') }}
								</N8nButton>
							</div>
						</section>

						<OfficeRoster
							:model="model"
							:selected-member-id="selectedMemberId"
							:compact="show3d"
							@select="select"
						/>
					</aside>
				</div>

				<ul class="legend" :aria-label="text('aiDepartment.office.legend')">
					<li
						v-for="status in [
							'working',
							'review',
							'waiting',
							'blocked',
							'queued',
							'idle',
							'unconfigured',
						] as const"
						:key="status"
					>
						<OfficeStatusChip :status="status" />
					</li>
				</ul>
			</template>
		</section>
	</component>
</template>

<style lang="scss" scoped>
.office {
	display: grid;
	gap: var(--spacing--sm);
	padding-block: var(--spacing--sm);
	color: var(--text-color);
}

.office-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--spacing--sm);

	h1 {
		margin: 0;
	}
	p {
		margin: var(--spacing--3xs) 0 0;
		color: var(--text-color--subtle);
	}
}

.controls {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: var(--spacing--xs);
}

.department-picker {
	display: grid;
	gap: var(--spacing--3xs);
	font-size: var(--font-size--xs);

	select {
		min-height: var(--height--md);
		padding: 0 var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--3xs);
		background: var(--background--surface);
		color: var(--text-color);
	}
}

.segmented {
	display: inline-flex;
	padding: 3px;
	border: var(--border);
	border-radius: var(--radius--full);
	background: var(--background--subtle);

	button {
		padding: var(--spacing--3xs) var(--spacing--sm);
		border: 0;
		border-radius: var(--radius--full);
		background: transparent;
		color: var(--text-color--subtle);
		font-weight: var(--font-weight--medium);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;

		&[aria-pressed='true'] {
			background: var(--background--surface);
			box-shadow: var(--shadow--xs);
			color: var(--text-color);
		}

		&:focus-visible {
			outline: 2px solid var(--color--primary);
			outline-offset: 1px;
		}
	}
}

.sync {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: var(--spacing--2xs) var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--md);
	background: var(--background--surface);
	font-size: var(--font-size--xs);
	--sync-color: var(--color--success);
	--sync-text-color: var(--color--success);

	.sync-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius--full);
		background: var(--sync-color);
	}
	strong {
		color: var(--sync-text-color);
	}
	.sync-note {
		color: var(--text-color--subtle);
	}
}
.sync--stale {
	--sync-color: var(--color--warning);
	--sync-text-color: var(--color--warning);
}
.sync--disconnected {
	--sync-color: var(--color--danger);
	--sync-text-color: var(--color--danger);
}
.sync--live {
	--sync-text-color: #08702c;
}
.sync--live .sync-dot {
	@media (prefers-reduced-motion: no-preference) {
		animation: live-pulse 2s ease-in-out infinite;
	}
}

.notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--xs);
	margin: 0;
	padding: var(--spacing--xs) var(--spacing--sm);
	border: var(--border);
	border-radius: var(--radius--md);
	background: var(--background--subtle);
	color: var(--text-color);
	font-size: var(--font-size--sm);
}
.notice--warning {
	border-color: var(--color--warning);
	background: var(--color--warning--tint-2);
}
.notice--danger {
	border-color: var(--color--danger);
	background: var(--color--danger--tint-3);
}

.empty {
	display: grid;
	justify-items: center;
	gap: var(--spacing--xs);
	padding: var(--spacing--3xl) var(--spacing--md);
	border: 1px dashed var(--border-color);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	text-align: center;

	h2,
	p {
		margin: 0;
	}
	p {
		color: var(--text-color--subtle);
	}
}
.empty-art {
	display: flex;
	gap: var(--spacing--2xs);

	span {
		width: 34px;
		height: 44px;
		border-radius: 17px 17px 8px 8px;
		background: var(--color--primary--tint-2);
	}
	span:nth-child(2) {
		height: 54px;
		background: var(--color--primary--tint-1);
	}
}

.workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
	gap: var(--spacing--sm);
	align-items: start;
}
.workspace--2d {
	grid-template-columns: minmax(0, 1fr);
}

.stage-wrap {
	position: relative;
	display: grid;
	gap: var(--spacing--2xs);
	min-width: 0;
}

.stage {
	position: relative;
	height: clamp(380px, 64vh, 720px);
	overflow: hidden;
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--office-ink-950, var(--background--subtle));
	box-shadow: var(--shadow--sm);
}

.presets {
	position: absolute;
	bottom: var(--spacing--xs);
	left: var(--spacing--xs);
	z-index: 3;
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--4xs, 2px);
	max-width: calc(100% - var(--spacing--md));
	padding: var(--spacing--4xs, 2px);
	border-radius: var(--radius--full);

	button {
		padding: var(--spacing--3xs) var(--spacing--xs);
		border: 0;
		border-radius: var(--radius--full);
		background: transparent;
		color: var(--office-mist-300);
		font-size: var(--font-size--2xs);
		font-weight: var(--font-weight--medium);
		cursor: pointer;

		&[aria-pressed='true'] {
			background: rgb(124 196 214 / 0.18);
			color: var(--office-mist-100);
		}
		&:focus-visible {
			outline: 2px solid var(--office-signal);
		}
	}
}

.stage-loading {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	margin: 0;
	color: var(--text-color--subtle);
}

.labels {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: clamp(380px, 64vh, 720px);
	overflow: hidden;
	border-radius: var(--radius--lg);
	pointer-events: none;
}

.label {
	--label-color: var(--text-color--subtle);

	position: absolute;
	top: 0;
	left: 0;
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	max-width: 220px;
	padding: 2px var(--spacing--2xs);
	border: var(--border-width) var(--border-style) var(--label-color);
	border-radius: var(--radius--full);
	background: var(--office-glass-solid, var(--background--surface));
	box-shadow: var(--shadow--sm);
	color: var(--office-mist-100, var(--text-color));
	font-size: var(--font-size--2xs);
	white-space: nowrap;
	cursor: pointer;
	pointer-events: auto;
	visibility: hidden;
	will-change: transform;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}
}
.label-dot {
	flex: none;
	width: 8px;
	height: 8px;
	border-radius: var(--radius--full);
	background: var(--label-color);
}
.label-name {
	overflow: hidden;
	font-weight: var(--font-weight--medium);
	text-overflow: ellipsis;
}
.label-status {
	display: inline;
	color: var(--office-mist-100, var(--text-color));
}
.label--working {
	--label-color: var(--office-ok, var(--color--success));
}
.label--review {
	--label-color: var(--office-warn, var(--color--warning));
}
.label--waiting {
	--label-color: var(--office-signal, var(--color--primary));
}
.label--blocked {
	--label-color: var(--office-bad, var(--color--danger));
}
.label--queued {
	--label-color: var(--office-signal, var(--color--primary));
}
.label--selected {
	background: var(--office-signal, var(--color--primary));
	color: var(--office-ink-950, var(--text-color--inverse));
	z-index: 2;

	.label-status {
		color: inherit;
	}
}

.hint {
	margin: 0;
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
}

.side {
	display: grid;
	gap: var(--spacing--sm);
	min-width: 0;
	max-height: clamp(380px, 64vh, 720px);
	overflow: auto;
}
.workspace--2d .side {
	max-height: none;
	overflow: visible;
}
.side.office-glass {
	padding: var(--spacing--sm);
}

.detail {
	display: grid;
	gap: var(--spacing--xs);
	padding: var(--spacing--sm);
	border: 1px solid var(--color--primary);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--sm);

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing--xs);
	}
	h2 {
		margin: 0;
		font-size: var(--font-size--lg);
	}
	p {
		margin: 0;
		color: var(--text-color--subtle);
		font-size: var(--font-size--xs);
	}
	dl {
		display: grid;
		gap: var(--spacing--3xs);
		margin: 0;
	}
	dt {
		color: var(--text-color--subtle);
		font-size: var(--font-size--2xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
}
.eyebrow {
	color: var(--color--primary);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.detail-status {
	display: flex;
}
.detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs);
}
.icon-button {
	width: 28px;
	height: 28px;
	border: 0;
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color);
	font-size: var(--font-size--lg);
	line-height: 1;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
	}
}

.legend {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}

@keyframes live-pulse {
	50% {
		opacity: 0.4;
	}
}

@media (max-width: 900px) {
	.workspace {
		grid-template-columns: minmax(0, 1fr);
	}
	.side {
		max-height: none;
	}
}

@media (max-width: 480px) {
	.stage,
	.labels {
		height: 340px;
	}
}
</style>
