<script setup lang="ts">
import type {
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
} from '@n8n/api-types';
import { computed } from 'vue';
import { buildGoalTree } from './goal-tree';
import GoalNode from './GoalNode.vue';

const props = defineProps<{
	goals: AiDepartmentGoalDto[];
	work: AiDepartmentWorkItemDto[];
	members: AiDepartmentMemberDto[];
}>();
const emit = defineEmits<{
	openWork: [workId: string];
	selectGoal: [goalId: string];
}>();

const roots = computed(() => buildGoalTree(props.goals, props.work, props.members));
</script>

<template>
	<ul class="goal-tree" data-test-id="goal-tree">
		<GoalNode
			v-for="node in roots"
			:key="node.goal.id"
			:node="node"
			@open-work="emit('openWork', $event)"
			@select-goal="emit('selectGoal', $event)"
		/>
	</ul>
</template>

<style lang="scss" scoped>
.goal-tree {
	display: grid;
	gap: var(--spacing--xs);
	margin: 0;
	padding: 0;
	list-style: none;
}
</style>
