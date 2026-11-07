<script setup lang="ts">
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import type { OfficeStatus } from '../office/office-model';
import OfficeStatusChip from '../office/OfficeStatusChip.vue';
import type { OrgTreeNode } from './org-tree';

defineProps<{
	nodes: OrgTreeNode[];
	selectedId: string | null;
	statusOf: (memberId: string) => OfficeStatus;
}>();
const emit = defineEmits<{ select: [memberId: string] }>();

const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
</script>

<template>
	<ul class="tree">
		<li v-for="node in nodes" :key="node.member.id">
			<button
				type="button"
				class="row"
				:class="{ 'row--selected': node.member.id === selectedId }"
				:data-test-id="`org-row-${node.member.id}`"
				:aria-pressed="node.member.id === selectedId"
				:aria-label="text('aiDepartment.org.openMember', { name: node.member.name })"
				@click="emit('select', node.member.id)"
			>
				<span class="who">
					<strong>{{ node.member.name }}</strong>
					<span class="role">{{ node.member.role }}</span>
				</span>
				<OfficeStatusChip :status="statusOf(node.member.id)" />
			</button>
			<details v-if="node.children.length" open>
				<summary>
					{{
						node.children.length === 1
							? text('aiDepartment.org.reportsOne')
							: text('aiDepartment.org.reports', { count: node.children.length })
					}}
				</summary>
				<OrgTreeList
					:nodes="node.children"
					:selected-id="selectedId"
					:status-of="statusOf"
					@select="emit('select', $event)"
				/>
			</details>
		</li>
	</ul>
</template>

<style lang="scss" scoped>
.tree {
	display: grid;
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}

details {
	margin-inline-start: var(--spacing--sm);
	padding-inline-start: var(--spacing--xs);
	border-inline-start: var(--border);
}

summary {
	margin: var(--spacing--3xs) 0;
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
	}
}

.row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--xs);
	width: 100%;
	padding: var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	color: var(--text-color);
	text-align: start;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}
}

.row--selected {
	border-color: var(--color--primary);
	box-shadow: 0 0 0 2px var(--color--primary--tint-2);
}

.who {
	display: grid;
	min-width: 0;

	strong,
	.role {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	strong {
		font-size: var(--font-size--sm);
	}
	.role {
		color: var(--text-color--subtle);
		font-size: var(--font-size--xs);
	}
}
</style>
