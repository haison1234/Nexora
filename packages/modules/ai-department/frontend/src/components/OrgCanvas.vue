<script setup lang="ts">
import type { AiDepartmentMemberDto, AiDepartmentWorkItemDto } from '@n8n/api-types';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildOfficeModel, type OfficeCharacter, type OfficeStatus } from '../office/office-model';
import OfficeStatusIcon from '../office/OfficeStatusIcon.vue';
import { STATUS_VISUAL } from '../office/status-visual';
import {
	clampZoom,
	edgePath,
	fitOrg,
	layoutOrg,
	neighbour,
	ORG_CARD,
	revealNode,
	zoomAround,
	type OrgDirection,
	type OrgView,
	type Point,
} from './org-layout';
import { buildOrgTree, eligibleManagers } from './org-tree';
import OrgTreeList from './OrgTreeList.vue';
import type { OrgLayoutScope } from './org-layout-storage';
import { loadOrgPositions, removeOrgPositions, saveOrgPosition } from './org-layout-storage';

const props = defineProps<{
	members: AiDepartmentMemberDto[];
	work: AiDepartmentWorkItemDto[];
	selectedId: string | null;
	editable?: boolean;
	waitingWorkIds?: ReadonlySet<string>;
	positionScope?: OrgLayoutScope;
}>();
const emit = defineEmits<{
	select: [memberId: string];
	reparent: [memberId: string, managerMemberId: string];
}>();

const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);

const positions = ref<Record<string, Point>>({});
const layout = computed(() => layoutOrg(buildOrgTree(props.members), positions.value));
const characters = computed(() => {
	const model = buildOfficeModel(
		props.members,
		props.work,
		Math.max(props.members.length, 1),
		props.waitingWorkIds,
	);
	return new Map<string, OfficeCharacter>(model.characters.map((item) => [item.memberId, item]));
});

const statusOf = (id: string): OfficeStatus => characters.value.get(id)?.status ?? 'idle';
const visualOf = (id: string) => STATUS_VISUAL[statusOf(id)];

const activeWorkCount = computed(() => {
	const counts = new Map<string, number>();
	for (const { assigneeMemberId, state } of props.work) {
		if (assigneeMemberId && !['done', 'cancelled'].includes(state)) {
			counts.set(assigneeMemberId, (counts.get(assigneeMemberId) ?? 0) + 1);
		}
	}
	return counts;
});

const query = ref('');
const matches = computed(() => {
	const needle = query.value.trim().toLocaleLowerCase();
	if (!needle) return null;
	return new Set(
		props.members
			.filter(({ name, role, expertiseTags }) =>
				[name, role, ...expertiseTags].some((value) => value.toLocaleLowerCase().includes(needle)),
			)
			.map(({ id }) => id),
	);
});

const related = computed(() => {
	const id = props.selectedId;
	if (!id) return null;
	const byId = new Map(props.members.map((member) => [member.id, member]));
	const ids = new Set([id]);
	for (
		let cursor = byId.get(id)?.managerMemberId;
		cursor && !ids.has(cursor);
		cursor = byId.get(cursor)?.managerMemberId
	) {
		ids.add(cursor);
	}
	for (const { id: memberId, managerMemberId } of props.members) {
		if (managerMemberId === id) ids.add(memberId);
	}
	return ids;
});
const emphasis = computed(() => matches.value ?? related.value);

const container = ref<HTMLElement | null>(null);
const view = ref<OrgView>({ zoom: 1, pan: { x: 0, y: 0 } });
const dragging = ref(false);
const moveMode = ref(false);
let userMoved = false;
let size = { width: 0, height: 0 };

const transform = computed(
	() => `translate(${view.value.pan.x}px, ${view.value.pan.y}px) scale(${view.value.zoom})`,
);
const zoomLabel = computed(() => `${Math.round(view.value.zoom * 100)}%`);

function measure() {
	const el = container.value;
	size = { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
}

function fit() {
	measure();
	const next = fitOrg(size, layout.value.bounds);
	if (next) view.value = next;
	userMoved = false;
}

function zoomBy(factor: number) {
	measure();
	view.value = zoomAround(view.value, view.value.zoom * factor, {
		x: size.width / 2,
		y: size.height / 2,
	});
	userMoved = true;
}

const pointers = new Map<number, Point>();
let dragOrigin: { pointer: Point; pan: Point } | null = null;
let pinchStart: { distance: number; zoom: number } | null = null;
let moved = false;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const localPoint = (event: PointerEvent): Point => {
	const rect = container.value!.getBoundingClientRect();
	return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

function onPointerDown(event: PointerEvent) {
	if (event.button !== 0 && event.pointerType === 'mouse') return;
	const point = localPoint(event);
	pointers.set(event.pointerId, point);
	moved = false;
	if (pointers.size === 1) {
		dragOrigin = { pointer: point, pan: { ...view.value.pan } };
	} else if (pointers.size === 2) {
		const [a, b] = [...pointers.values()];
		pinchStart = { distance: distance(a, b), zoom: view.value.zoom };
		dragOrigin = null;
	}
}

type CardDrag = {
	id: string;
	pointerId: number;
	origin: Point;
	positionOrigin: Point | null;
	active: boolean;
};
let cardDrag: CardDrag | null = null;
const draggedId = ref<string | null>(null);
const dropTargets = ref<ReadonlySet<string>>(new Set());
const dropOver = ref<string | null>(null);
const ghost = ref<Point | null>(null);
const draggedName = computed(
	() => props.members.find(({ id }) => id === draggedId.value)?.name ?? '',
);

function onCardPointerDown(event: PointerEvent, id: string) {
	if (!props.editable || (event.button !== 0 && event.pointerType === 'mouse')) return;
	event.stopPropagation();
	moved = false;
	const item = layout.value.nodes.find(({ id: memberId }) => memberId === id);
	cardDrag = {
		id,
		pointerId: event.pointerId,
		origin: localPoint(event),
		positionOrigin: moveMode.value && item ? { x: item.x, y: item.y } : null,
		active: false,
	};
}

function moveCardDrag(drag: CardDrag, event: PointerEvent) {
	const point = localPoint(event);
	if (!drag.active) {
		if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) < 4) return;
		drag.active = true;
		moved = true;
		container.value?.setPointerCapture(event.pointerId);
		const currentManager = props.members.find(({ id }) => id === drag.id)?.managerMemberId;
		dropTargets.value = new Set(
			eligibleManagers(props.members, drag.id)
				.filter(({ id }) => id !== currentManager)
				.map(({ id }) => id),
		);
		draggedId.value = drag.id;
	}
	ghost.value = point;
	if (moveMode.value) {
		dropOver.value = null;
		return;
	}
	const hovered = document
		.elementFromPoint(event.clientX, event.clientY)
		?.closest<HTMLElement>('[data-org-id]')?.dataset.orgId;
	dropOver.value = hovered && dropTargets.value.has(hovered) ? hovered : null;
}

async function endCardDrag(commit: boolean) {
	const drag = cardDrag;
	const target = dropOver.value;
	const end = ghost.value;
	cardDrag = null;
	draggedId.value = null;
	dropTargets.value = new Set();
	dropOver.value = null;
	ghost.value = null;
	if (!commit || !drag?.active) return;
	if (moveMode.value && drag.positionOrigin && end) {
		const position = {
			x: Math.max(56, drag.positionOrigin.x + (end.x - drag.origin.x) / view.value.zoom),
			y: Math.max(56, drag.positionOrigin.y + (end.y - drag.origin.y) / view.value.zoom),
		};
		await setMemberPosition(drag.id, position);
		return;
	}
	if (target) emit('reparent', drag.id, target);
}

async function setMemberPosition(memberId: string, position: Point) {
	positions.value = { ...positions.value, [memberId]: position };
	if (!props.positionScope) return;
	try {
		await saveOrgPosition(props.positionScope, memberId, position);
	} catch {
		// The automatic tree layout remains available when browser storage is unavailable.
	}
}

async function resetPositions() {
	positions.value = {};
	if (!props.positionScope) return;
	try {
		await removeOrgPositions(props.positionScope);
	} catch {
		// Reset still restores the automatic layout for this view.
	}
}

let positionLoadGeneration = 0;
watch(
	() => {
		const scope = props.positionScope;
		return scope ? `${scope.userId}/${scope.projectId}/${scope.departmentId}` : '';
	},
	async () => {
		const generation = ++positionLoadGeneration;
		positions.value = {};
		const scope = props.positionScope;
		if (!scope) return;
		try {
			const loaded = await loadOrgPositions(scope);
			if (generation === positionLoadGeneration) {
				positions.value = loaded;
				if (props.members.every((member) => member.departmentId === scope.departmentId)) {
					await removeOrgPositions(scope, new Set(props.members.map(({ id }) => id)));
				}
			}
		} catch {
			positions.value = {};
		}
	},
	{ immediate: true },
);
watch(
	() => props.members.map(({ id }) => id).join('|'),
	async () => {
		const scope = props.positionScope;
		if (!scope || props.members.some((member) => member.departmentId !== scope.departmentId))
			return;
		try {
			await removeOrgPositions(scope, new Set(props.members.map(({ id }) => id)));
		} catch {
			// A storage failure does not block the authorized member list.
		}
	},
);

function onPointerMove(event: PointerEvent) {
	if (cardDrag?.pointerId === event.pointerId) {
		moveCardDrag(cardDrag, event);
		return;
	}
	if (!pointers.has(event.pointerId)) return;
	const point = localPoint(event);
	pointers.set(event.pointerId, point);
	if (pointers.size === 2 && pinchStart) {
		const [a, b] = [...pointers.values()];
		const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		view.value = zoomAround(
			view.value,
			pinchStart.zoom * (distance(a, b) / Math.max(pinchStart.distance, 1)),
			center,
		);
		userMoved = true;
		moved = true;
		return;
	}
	if (!dragOrigin) return;
	const dx = point.x - dragOrigin.pointer.x;
	const dy = point.y - dragOrigin.pointer.y;
	if (!moved && Math.hypot(dx, dy) < 4) return;
	if (!moved) {
		moved = true;
		dragging.value = true;
		container.value?.setPointerCapture(event.pointerId);
	}
	view.value = {
		zoom: view.value.zoom,
		pan: { x: dragOrigin.pan.x + dx, y: dragOrigin.pan.y + dy },
	};
	userMoved = true;
}

function onPointerEnd(event: PointerEvent) {
	if (cardDrag?.pointerId === event.pointerId) {
		void endCardDrag(event.type === 'pointerup');
		return;
	}
	pointers.delete(event.pointerId);
	if (pointers.size < 2) pinchStart = null;
	if (pointers.size === 0) {
		dragOrigin = null;
		dragging.value = false;
	}
}

function onWheel(event: WheelEvent) {
	const rect = container.value!.getBoundingClientRect();
	const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
	const factor = Math.exp(-event.deltaY * 0.0016);
	view.value = zoomAround(view.value, clampZoom(view.value.zoom * factor), anchor);
	userMoved = true;
}

function onCardClick(event: MouseEvent, id: string) {
	if (moved) {
		event.preventDefault();
		event.stopPropagation();
		moved = false;
		return;
	}
	emit('select', id);
}

async function onKeydown(event: KeyboardEvent, id: string) {
	if (event.key === 'Escape' && cardDrag?.active) {
		void endCardDrag(false);
		return;
	}
	const keys: Record<string, OrgDirection> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right',
	};
	const direction = keys[event.key];
	if (!direction) return;
	if (moveMode.value) {
		const current = layout.value.nodes.find(({ id: memberId }) => memberId === id);
		if (!current) return;
		event.preventDefault();
		const delta = event.shiftKey ? 80 : 24;
		const position = {
			x: Math.max(
				56,
				current.x + (direction === 'left' ? -delta : direction === 'right' ? delta : 0),
			),
			y: Math.max(56, current.y + (direction === 'up' ? -delta : direction === 'down' ? delta : 0)),
		};
		await setMemberPosition(id, position);
		return;
	}
	const next = neighbour(layout.value, id, direction);
	if (!next) return;
	event.preventDefault();
	measure();
	view.value = revealNode(view.value, next, size);
	userMoved = true;
	await nextTick();
	container.value?.querySelector<HTMLElement>(`[data-org-id="${CSS.escape(next.id)}"]`)?.focus();
}

async function onSearchKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		query.value = '';
		return;
	}
	if (event.key !== 'Enter' || !matches.value) return;
	const first = layout.value.nodes.find(({ id }) => matches.value?.has(id));
	if (!first) return;
	event.preventDefault();
	measure();
	view.value = revealNode(view.value, first, size);
	userMoved = true;
	emit('select', first.id);
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

let observer: ResizeObserver | undefined;

const compact = ref(false);
let mediaQuery: MediaQueryList | undefined;
const onMediaChange = () => {
	compact.value = mediaQuery?.matches ?? false;
};

function observeContainer() {
	observer?.disconnect();
	if (container.value) {
		observer?.observe(container.value);
		fit();
	}
}

onMounted(() => {
	observer = new ResizeObserver(() => {
		measure();
		if (!userMoved) fit();
	});
	mediaQuery = window.matchMedia?.('(max-width: 639px)');
	onMediaChange();
	mediaQuery?.addEventListener('change', onMediaChange);
	observeContainer();
});
onBeforeUnmount(() => {
	observer?.disconnect();
	mediaQuery?.removeEventListener('change', onMediaChange);
});
watch(container, observeContainer, { flush: 'post' });

watch(
	() => layout.value.nodes.map(({ id, x, y }) => `${id}:${x}:${y}`).join('|'),
	() => {
		if (!userMoved) fit();
	},
);
</script>

<template>
	<OrgTreeList
		v-if="compact"
		:nodes="layout.roots.map(({ node }) => node)"
		:selected-id="selectedId"
		:status-of="statusOf"
		data-test-id="org-tree-list"
		@select="emit('select', $event)"
	/>
	<div
		v-else
		ref="container"
		class="canvas"
		:class="{ dragging }"
		data-test-id="org-canvas"
		role="group"
		:aria-label="text('aiDepartment.org.canvasLabel')"
		@pointerdown="onPointerDown"
		@pointermove="onPointerMove"
		@pointerup="onPointerEnd"
		@pointercancel="onPointerEnd"
		@wheel.prevent="onWheel"
	>
		<div class="search" role="search">
			<input
				v-model="query"
				type="search"
				data-test-id="org-search"
				:placeholder="text('aiDepartment.org.searchPlaceholder')"
				:aria-label="text('aiDepartment.org.searchLabel')"
				@pointerdown.stop
				@keydown="onSearchKeydown"
			/>
			<span v-if="matches" class="search-count" aria-live="polite">
				{{ text('aiDepartment.org.searchResults', { count: matches.size }) }}
			</span>
		</div>

		<div class="controls">
			<button type="button" :aria-label="text('aiDepartment.org.zoomIn')" @click="zoomBy(1.2)">
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
			</button>
			<button type="button" :aria-label="text('aiDepartment.org.zoomOut')" @click="zoomBy(1 / 1.2)">
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
			</button>
			<button
				type="button"
				data-test-id="org-fit"
				:aria-label="text('aiDepartment.org.fit')"
				@click="fit"
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
				</svg>
			</button>
			<button
				v-if="editable && positionScope"
				type="button"
				data-test-id="org-move-mode"
				:aria-pressed="moveMode"
				@click="moveMode = !moveMode"
			>
				{{ text(moveMode ? 'aiDepartment.org.finishLayout' : 'aiDepartment.org.editLayout') }}
			</button>
			<button
				v-if="editable && positionScope"
				type="button"
				data-test-id="org-reset-layout"
				:disabled="Object.keys(positions).length === 0"
				@click="resetPositions"
			>
				{{ text('aiDepartment.org.resetLayout') }}
			</button>
			<span class="zoom-label" aria-live="polite">{{ zoomLabel }}</span>
		</div>

		<p class="hint" aria-live="polite">
			{{
				draggedId
					? moveMode
						? text('aiDepartment.org.moveMemberHint', { name: draggedName })
						: text('aiDepartment.org.dropHint', { name: draggedName })
					: text(editable ? 'aiDepartment.org.hintEditable' : 'aiDepartment.org.hint')
			}}
		</p>

		<svg class="edges" aria-hidden="true">
			<g :transform="`translate(${view.pan.x}, ${view.pan.y}) scale(${view.zoom})`">
				<path
					v-for="edge in layout.edges"
					:key="`${edge.parent.id}-${edge.child.id}`"
					:d="edgePath(edge)"
				/>
			</g>
		</svg>

		<ul class="layer" :style="{ transform }">
			<li
				v-for="item in layout.nodes"
				:key="item.id"
				class="slot"
				:style="{
					left: `${item.x}px`,
					top: `${item.y}px`,
					width: `${ORG_CARD.width}px`,
					height: `${ORG_CARD.height}px`,
				}"
			>
				<button
					type="button"
					class="card"
					:class="[
						`card--${statusOf(item.id)}`,
						{
							'card--dashed': visualOf(item.id).dashed,
							'card--pulse': visualOf(item.id).pulse,
							'card--dim': emphasis && !emphasis.has(item.id),
							'card--match': matches?.has(item.id),
							'card--selected': item.id === selectedId,
							'card--dragging': item.id === draggedId,
							'card--drop': dropTargets.has(item.id),
							'card--drop-over': item.id === dropOver,
						},
					]"
					:style="{ '--accent': visualOf(item.id).color }"
					:data-org-id="item.id"
					:data-test-id="`org-card-${item.id}`"
					:aria-pressed="item.id === selectedId"
					:aria-label="text('aiDepartment.org.openMember', { name: item.node.member.name })"
					:aria-describedby="`org-desc-${item.id}`"
					@pointerdown="onCardPointerDown($event, item.id)"
					@click="onCardClick($event, item.id)"
					@keydown="onKeydown($event, item.id)"
				>
					<span class="avatar" aria-hidden="true">
						{{ initials(item.node.member.name) }}
						<span class="dot" />
					</span>
					<span class="meta">
						<strong>{{ item.node.member.name }}</strong>
						<span class="role">{{ item.node.member.role }}</span>
						<span class="status">
							<OfficeStatusIcon :status="statusOf(item.id)" />
							{{ text(`aiDepartment.office.status.${statusOf(item.id)}`) }}
						</span>
						<span v-if="item.node.children.length" class="reports">
							{{
								item.node.children.length === 1
									? text('aiDepartment.org.reportsOne')
									: text('aiDepartment.org.reports', { count: item.node.children.length })
							}}
						</span>
					</span>
					<span v-if="activeWorkCount.get(item.id)" class="work-count" aria-hidden="true">
						{{ activeWorkCount.get(item.id) }}
					</span>
					<span :id="`org-desc-${item.id}`" class="sr-only">
						{{ text(`aiDepartment.office.status.${statusOf(item.id)}`) }}.
						{{ text('aiDepartment.org.activeWork', { count: activeWorkCount.get(item.id) ?? 0 }) }}
					</span>
				</button>
			</li>
		</ul>

		<div
			v-if="ghost"
			class="ghost"
			aria-hidden="true"
			:style="{ left: `${ghost.x}px`, top: `${ghost.y}px` }"
		>
			{{ draggedName }}
		</div>
	</div>
</template>

<style lang="scss" scoped>
.canvas {
	position: relative;
	height: clamp(420px, 66vh, 760px);
	overflow: hidden;
	border: var(--border);
	border-radius: var(--radius--lg);
	background-color: var(--background--surface);
	background-image: radial-gradient(
		circle,
		var(--border-color--subtle, var(--border-color)) 1px,
		transparent 1px
	);
	background-size: 22px 22px;
	cursor: grab;
	touch-action: none;
	user-select: none;
}
.canvas.dragging {
	cursor: grabbing;
}

.edges {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;

	path {
		fill: none;
		stroke: var(--border-color--strong, var(--border-color));
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
}

.layer {
	position: absolute;
	inset: 0;
	margin: 0;
	padding: 0;
	list-style: none;
	transform-origin: 0 0;
}

.slot {
	position: absolute;
}

.controls {
	position: absolute;
	top: var(--spacing--xs);
	right: var(--spacing--xs);
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: var(--spacing--3xs);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--sm);

	button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius--md);
		background: transparent;
		color: var(--text-color);
		cursor: pointer;
		transition: background 0.15s ease;

		&:hover {
			background: var(--background--subtle);
		}
		&:focus-visible {
			outline: 2px solid var(--color--primary);
		}
	}
	svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
}
.zoom-label {
	padding-bottom: var(--spacing--5xs);
	color: var(--text-color--subtle);
	font-size: var(--font-size--3xs);
	font-variant-numeric: tabular-nums;
}

.hint {
	position: absolute;
	bottom: var(--spacing--xs);
	left: var(--spacing--sm);
	z-index: 2;
	margin: 0;
	padding: var(--spacing--5xs) var(--spacing--xs);
	border-radius: var(--radius--full);
	background: var(--background--surface);
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
	pointer-events: none;
}

.search {
	position: absolute;
	top: var(--spacing--xs);
	left: var(--spacing--sm);
	z-index: 2;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);

	input {
		width: 220px;
		min-height: var(--height--md);
		padding: 0 var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--3xs);
		background: var(--background--surface);
		color: var(--text-color);

		&:focus-visible {
			outline: 2px solid var(--color--primary);
		}
	}
}
.search-count {
	padding: var(--spacing--5xs) var(--spacing--xs);
	border-radius: var(--radius--full);
	background: var(--background--surface);
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
}

.work-count {
	position: absolute;
	top: calc(var(--spacing--3xs) * -1);
	right: var(--spacing--xs);
	min-width: 20px;
	padding: 0 var(--spacing--3xs);
	border: 2px solid var(--background--surface);
	border-radius: var(--radius--full);
	background: var(--color--primary);
	color: var(--color--neutral-white);
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	line-height: 16px;
	text-align: center;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.ghost {
	position: absolute;
	z-index: 3;
	max-width: 200px;
	padding: var(--spacing--5xs) var(--spacing--xs);
	overflow: hidden;
	border: var(--border);
	border-radius: var(--radius--full);
	background: var(--background--surface);
	box-shadow: var(--shadow--sm);
	color: var(--text-color);
	font-size: var(--font-size--2xs);
	text-overflow: ellipsis;
	white-space: nowrap;
	pointer-events: none;
	transform: translate(12px, 12px);
}

.card--dragging {
	opacity: 0.5;
}
.card--drop {
	outline: 2px dashed var(--color--primary);
	outline-offset: 2px;
}
.card--drop-over {
	outline-style: solid;
	background: var(--background--subtle);
}

.card {
	--accent: var(--text-color--subtler, var(--text-color--subtle));

	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	width: 100%;
	height: 100%;
	padding: var(--spacing--xs) var(--spacing--sm);
	border: var(--border-width) var(--border-style)
		color-mix(in srgb, var(--accent) 38%, var(--background--surface));
	border-radius: var(--radius--2xl, var(--radius--xl));
	background: color-mix(in srgb, var(--accent) 12%, var(--background--surface));
	box-shadow: var(--shadow--md);
	color: var(--text-color);
	text-align: start;
	cursor: pointer;
	transition:
		box-shadow 0.15s ease,
		border-color 0.15s ease;

	&:hover {
		border-color: var(--accent);
	}
	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}
}
.card--selected {
	border-color: var(--color--primary);
	box-shadow:
		0 0 0 2px var(--color--primary--tint-2),
		var(--shadow--md);

	@media (prefers-reduced-motion: no-preference) {
		animation: selected-ring 2s ease-out infinite;
	}
}

@keyframes selected-ring {
	0% {
		box-shadow:
			0 0 0 0 color-mix(in srgb, var(--color--primary) 50%, transparent),
			var(--shadow--md);
	}
	70%,
	100% {
		box-shadow:
			0 0 0 10px color-mix(in srgb, var(--color--primary) 0%, transparent),
			var(--shadow--md);
	}
}
.card--dashed {
	border-style: dashed;
}
.card--dim {
	opacity: 0.45;
}
.card--match {
	border-color: var(--color--primary);
}

.avatar {
	position: relative;
	display: grid;
	flex: none;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
}
.dot {
	position: absolute;
	right: -1px;
	bottom: -1px;
	width: 12px;
	height: 12px;
	border: 2px solid var(--background--surface);
	border-radius: var(--radius--full);
	background: var(--accent);
}
.card--pulse .dot {
	@media (prefers-reduced-motion: no-preference) {
		animation: pulse 1.8s ease-in-out infinite;
	}
}

.meta {
	display: grid;
	gap: var(--spacing--5xs);
	min-width: 0;

	strong,
	.role,
	.status,
	.reports {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	strong {
		font-size: var(--font-size--sm);
	}
	.role,
	.reports {
		color: var(--text-color--subtle);
		font-size: var(--font-size--xs);
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing--3xs);
		color: var(--accent);
		font-size: var(--font-size--2xs);
		font-weight: var(--font-weight--medium);
	}
}

@keyframes pulse {
	50% {
		opacity: 0.4;
	}
}
</style>
