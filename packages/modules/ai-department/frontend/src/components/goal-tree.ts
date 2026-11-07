import type {
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
} from '@n8n/api-types';

export type GoalProgress = { total: number; done: number; percent: number };

export type GoalTreeNode = {
	goal: AiDepartmentGoalDto;
	ownerName: string | null;
	work: AiDepartmentWorkItemDto[];
	children: GoalTreeNode[];
	progress: GoalProgress;
};

const byTitle = (a: AiDepartmentGoalDto, b: AiDepartmentGoalDto) =>
	a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

function progressOf(work: AiDepartmentWorkItemDto[]): GoalProgress {
	const counted = work.filter(({ state }) => state !== 'cancelled');
	const done = counted.filter(({ state }) => state === 'done').length;
	return {
		total: counted.length,
		done,
		percent: counted.length === 0 ? 0 : Math.round((done / counted.length) * 100),
	};
}

/**
 * Build goal trees. Progress is derived from authorized work state only:
 * done work divided by non-cancelled work, rolled up over child goals.
 * Goals in a parent cycle become extra roots.
 */
export function buildGoalTree(
	goals: AiDepartmentGoalDto[],
	work: AiDepartmentWorkItemDto[],
	members: AiDepartmentMemberDto[],
): GoalTreeNode[] {
	const byId = new Map(goals.map((goal) => [goal.id, goal]));
	const ownerNames = new Map(members.map((member) => [member.id, member.name]));
	const workByGoal = new Map<string, AiDepartmentWorkItemDto[]>();
	for (const item of work) {
		if (!item.goalId) continue;
		workByGoal.set(item.goalId, [...(workByGoal.get(item.goalId) ?? []), item]);
	}
	const childrenOf = new Map<string, AiDepartmentGoalDto[]>();
	const rootGoals: AiDepartmentGoalDto[] = [];
	for (const goal of goals) {
		if (goal.parentId && goal.parentId !== goal.id && byId.has(goal.parentId)) {
			childrenOf.set(goal.parentId, [...(childrenOf.get(goal.parentId) ?? []), goal]);
		} else {
			rootGoals.push(goal);
		}
	}

	const visited = new Set<string>();
	const rolledWork = new Map<string, AiDepartmentWorkItemDto[]>();
	const build = (goal: AiDepartmentGoalDto): GoalTreeNode => {
		visited.add(goal.id);
		const children = (childrenOf.get(goal.id) ?? [])
			.filter(({ id }) => !visited.has(id))
			.sort(byTitle)
			.map(build);
		const own = workByGoal.get(goal.id) ?? [];
		const rolled = [
			...own,
			...children.flatMap(({ goal: child }) => rolledWork.get(child.id) ?? []),
		];
		rolledWork.set(goal.id, rolled);
		return {
			goal,
			ownerName: goal.ownerMemberId ? (ownerNames.get(goal.ownerMemberId) ?? null) : null,
			work: own,
			children,
			progress: progressOf(rolled),
		};
	};

	const trees = [...rootGoals].sort(byTitle).map(build);
	for (const goal of [...goals].sort(byTitle)) {
		if (!visited.has(goal.id)) trees.push(build(goal));
	}
	return trees;
}
