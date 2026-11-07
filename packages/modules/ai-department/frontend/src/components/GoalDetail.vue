<script setup lang="ts">
import type {
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
} from '@n8n/api-types';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { computed } from 'vue';
import { buildGoalTree, type GoalTreeNode } from './goal-tree';

const props = defineProps<{
	goal: AiDepartmentGoalDto;
	goals: AiDepartmentGoalDto[];
	work: AiDepartmentWorkItemDto[];
	members: AiDepartmentMemberDto[];
}>();
const emit = defineEmits<{ openWork: [workId: string] }>();
const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
const owner = computed(
	() => props.members.find(({ id }) => id === props.goal.ownerMemberId) ?? null,
);
const treeNode = computed(() => {
	const roots = buildGoalTree(props.goals, props.work, props.members);
	const find = (nodes: GoalTreeNode[]): GoalTreeNode | null => {
		for (const node of nodes) {
			if (node.goal.id === props.goal.id) return node;
			const child = find(node.children);
			if (child) return child;
		}
		return null;
	};
	return find(roots);
});
const parent = computed(() => props.goals.find(({ id }) => id === props.goal.parentId) ?? null);
const linkedWork = computed(() => treeNode.value?.work ?? []);
const progress = computed(() => treeNode.value?.progress ?? { done: 0, total: 0, percent: 0 });
const dueDate = computed(() =>
	props.goal.dueAt
		? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(props.goal.dueAt))
		: null,
);
</script>

<template>
	<aside class="detail" data-test-id="goal-detail" :aria-label="text('aiDepartment.goals.detail')">
		<header>
			<div>
				<span class="eyebrow">{{ text('aiDepartment.goals.detail') }}</span>
				<h2>{{ goal.title }}</h2>
			</div>
			<span class="state" :class="`state--${goal.state}`">
				{{ text(`aiDepartment.goals.state.${goal.state}`) }}
			</span>
		</header>
		<p v-if="goal.successCriteria" class="criteria">{{ goal.successCriteria }}</p>
		<dl>
			<dt>{{ text('aiDepartment.goals.ownerLabel') }}</dt>
			<dd>{{ owner?.name ?? text('aiDepartment.goals.noOwner') }}</dd>
			<dt>{{ text('aiDepartment.goals.parentLabel') }}</dt>
			<dd>{{ parent?.title ?? text('aiDepartment.goals.noParent') }}</dd>
			<dt>{{ text('aiDepartment.goals.dueLabel') }}</dt>
			<dd>{{ dueDate ?? text('aiDepartment.goals.noDueDate') }}</dd>
			<dt>{{ text('aiDepartment.goals.progressLabel') }}</dt>
			<dd>
				<div
					class="progress"
					role="progressbar"
					:aria-valuemin="0"
					:aria-valuemax="100"
					:aria-valuenow="progress.percent"
					:aria-valuetext="text('aiDepartment.goals.progress', progress)"
				>
					<span :style="{ inlineSize: `${progress.percent}%` }" />
				</div>
				<span class="muted">{{ text('aiDepartment.goals.progress', progress) }}</span>
			</dd>
			<dt>{{ text('aiDepartment.goals.linkedWorkLabel', { count: linkedWork.length }) }}</dt>
			<dd>
				<ul v-if="linkedWork.length" class="work-list">
					<li v-for="item in linkedWork" :key="item.id">
						<button type="button" @click="emit('openWork', item.id)">
							<span>{{ item.instruction }}</span>
							<span class="work-state" :class="`work-state--${item.state}`">
								{{ text(`aiDepartment.state.${item.state}`) }}
							</span>
						</button>
					</li>
				</ul>
				<span v-else class="muted">{{ text('aiDepartment.goals.noWork') }}</span>
			</dd>
		</dl>
	</aside>
</template>

<style lang="scss" scoped>
.detail {
	display: grid;
	align-content: start;
	gap: var(--spacing--xs);
	padding: var(--spacing--md);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--xs);

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
	dl {
		display: grid;
		gap: var(--spacing--3xs);
		margin: 0;
	}
	dt {
		margin-top: var(--spacing--2xs);
		color: var(--text-color--subtle);
		font-size: var(--font-size--2xs);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	dd {
		display: grid;
		gap: var(--spacing--3xs);
		margin: 0;
	}
}
.eyebrow,
.muted,
.criteria {
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
}
.state,
.work-state {
	width: fit-content;
	padding: var(--spacing--5xs) var(--spacing--2xs);
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
}
.progress {
	block-size: 8px;
	overflow: hidden;
	border-radius: var(--radius--full);
	background: var(--background--subtle);

	span {
		display: block;
		block-size: 100%;
		background: var(--color--primary);
	}
}
.work-list {
	display: grid;
	gap: var(--spacing--3xs);
	margin: 0;
	padding: 0;
	list-style: none;

	button {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing--xs);
		width: 100%;
		padding: var(--spacing--2xs) var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--sm);
		background: transparent;
		color: var(--text-color);
		text-align: start;
		cursor: pointer;

		&:hover {
			border-color: var(--color--primary);
		}
		&:focus-visible {
			outline: 2px solid var(--color--primary);
		}
	}
}
</style>
