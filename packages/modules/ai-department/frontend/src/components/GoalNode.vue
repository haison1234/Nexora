<script setup lang="ts">
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import type { GoalTreeNode } from './goal-tree';

const props = defineProps<{ node: GoalTreeNode; depth?: number }>();
const emit = defineEmits<{ openWork: [workId: string]; selectGoal: [goalId: string] }>();

const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);

const date = (value: string) =>
	new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const progressLabel = () =>
	props.node.progress.total === 0
		? text('aiDepartment.goals.noWork')
		: text('aiDepartment.goals.progress', {
				done: props.node.progress.done,
				total: props.node.progress.total,
			});
</script>

<template>
	<li class="goal" :data-test-id="`goal-${node.goal.id}`">
		<article class="card" :class="`card--${node.goal.state}`">
			<header>
				<h3>
					<button type="button" class="goal-title" @click="emit('selectGoal', node.goal.id)">
						{{ node.goal.title }}
					</button>
				</h3>
				<span class="state" :class="`state--${node.goal.state}`">
					{{ text(`aiDepartment.goals.state.${node.goal.state}`) }}
				</span>
			</header>
			<p v-if="node.goal.successCriteria" class="criteria">{{ node.goal.successCriteria }}</p>
			<p class="meta">
				<span>
					{{
						node.ownerName
							? text('aiDepartment.goals.owner', { name: node.ownerName })
							: text('aiDepartment.goals.noOwner')
					}}
				</span>
				<span v-if="node.goal.dueAt">
					{{ text('aiDepartment.goals.due', { date: date(node.goal.dueAt) }) }}
				</span>
			</p>
			<div class="progress">
				<div
					class="bar"
					role="progressbar"
					:aria-valuemin="0"
					:aria-valuemax="100"
					:aria-valuenow="node.progress.percent"
					:aria-valuetext="progressLabel()"
				>
					<span :style="{ inlineSize: `${node.progress.percent}%` }" />
				</div>
				<span class="progress-text">{{ progressLabel() }}</span>
			</div>
			<details v-if="node.work.length" class="linked">
				<summary>{{ text('aiDepartment.goals.linkedWork', { count: node.work.length }) }}</summary>
				<ul>
					<li v-for="item in node.work" :key="item.id">
						<button type="button" @click="emit('openWork', item.id)">
							<span class="instruction">{{ item.instruction }}</span>
							<span class="work-state" :class="`work-state--${item.state}`">
								{{ text(`aiDepartment.state.${item.state}`) }}
							</span>
						</button>
					</li>
				</ul>
			</details>
		</article>
		<ul v-if="node.children.length" class="children">
			<GoalNode
				v-for="child in node.children"
				:key="child.goal.id"
				:node="child"
				:depth="(depth ?? 0) + 1"
				@open-work="emit('openWork', $event)"
				@select-goal="emit('selectGoal', $event)"
			/>
		</ul>
	</li>
</template>

<style lang="scss" scoped>
.goal {
	list-style: none;
}

.children {
	margin: var(--spacing--2xs) 0 0 var(--spacing--sm);
	padding: 0 0 0 var(--spacing--sm);
	border-left: 2px solid var(--color--primary--tint-2);
	display: grid;
	gap: var(--spacing--2xs);
}

.card {
	display: grid;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	transition: box-shadow 0.15s ease;

	&:hover {
		box-shadow: var(--shadow--sm);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing--xs);
	}
	h3 {
		margin: 0;
		font-size: var(--font-size--md);
	}
	p {
		margin: 0;
	}
}

.goal-title {
	padding: 0;
	border: 0;
	background: none;
	color: var(--text-color);
	font: inherit;
	text-align: start;
	cursor: pointer;

	&:hover {
		color: var(--color--primary);
	}
	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}
}
.card--archived {
	opacity: 0.65;
}

.criteria,
.meta,
.progress-text {
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
}

.meta {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs) var(--spacing--sm);
}

.state,
.work-state {
	flex: none;
	padding: var(--spacing--5xs) var(--spacing--2xs);
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--medium);
}
.state--active {
	background: var(--color--primary--tint-3);
	color: var(--color--primary--shade-1);
}
.state--done,
.work-state--done {
	background: var(--color--success--tint-3);
	color: var(--color--success--shade-1);
}
.work-state--running {
	background: var(--color--primary--tint-3);
	color: var(--color--primary--shade-1);
}
.work-state--review {
	background: var(--color--warning--tint-2);
	color: var(--color--warning--shade-1);
}
.work-state--blocked {
	background: var(--color--danger--tint-3);
	color: var(--color--danger--shade-1);
}

.progress {
	display: grid;
	gap: var(--spacing--3xs);
}
.bar {
	block-size: 8px;
	overflow: hidden;
	border-radius: var(--radius--full);
	background: var(--background--subtle);

	span {
		display: block;
		block-size: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--color--primary), var(--color--success));
		@media (prefers-reduced-motion: no-preference) {
			transition: inline-size 0.4s ease;
		}
	}
}

.linked {
	summary {
		color: var(--color--primary);
		font-size: var(--font-size--xs);
		cursor: pointer;
	}
	ul {
		display: grid;
		gap: var(--spacing--3xs);
		margin: var(--spacing--2xs) 0 0;
		padding: 0;
		list-style: none;
	}
	button {
		display: flex;
		align-items: center;
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
	.instruction {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}
</style>
