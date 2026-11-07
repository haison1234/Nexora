import type {
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
} from '@n8n/api-types';
import { buildGoalTree } from './goal-tree';
import { buildOrgTree, eligibleManagers } from './org-tree';

function member(id: string, name: string, managerMemberId: string | null = null) {
	return {
		id,
		projectId: 'p',
		departmentId: 'd',
		name,
		role: 'Role',
		managerMemberId,
		expertiseTags: [],
		archived: false,
		version: 1,
		executionState: 'available',
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentMemberDto;
}

function goal(id: string, title: string, parentId: string | null = null, ownerMemberId = null) {
	return {
		id,
		projectId: 'p',
		departmentId: 'd',
		title,
		successCriteria: null,
		parentId,
		ownerMemberId,
		dueAt: null,
		state: 'active',
		version: 1,
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentGoalDto;
}

function item(id: string, goalId: string | null, state: AiDepartmentWorkItemDto['state']) {
	return {
		id,
		projectId: 'p',
		departmentId: 'd',
		goalId,
		assigneeMemberId: null,
		instruction: id,
		priority: 'normal',
		dueAt: null,
		reviewPolicy: 'required',
		reviewStages: [],
		reviewPolicyRevision: 1,
		currentReviewStageIndex: 0,
		state,
		currentAttemptId: null,
		version: 1,
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentWorkItemDto;
}

describe('buildOrgTree', () => {
	it('nests reports under their manager and sorts siblings by name', () => {
		const [root] = buildOrgTree([
			member('c', 'Zed', 'a'),
			member('a', 'Ada'),
			member('b', 'Bob', 'a'),
		]);
		expect(root.member.id).toBe('a');
		expect(root.children.map(({ member: { name } }) => name)).toEqual(['Bob', 'Zed']);
	});

	it('treats a missing or self manager as a root', () => {
		const roots = buildOrgTree([member('a', 'A', 'gone'), member('b', 'B', 'b')]);
		expect(roots.map(({ member: { id } }) => id)).toEqual(['a', 'b']);
	});

	it('shows every member of a reporting cycle exactly once', () => {
		const roots = buildOrgTree([member('a', 'A', 'b'), member('b', 'B', 'a')]);
		const ids: string[] = [];
		const walk = (nodes: typeof roots) =>
			nodes.forEach((node) => {
				ids.push(node.member.id);
				walk(node.children);
			});
		walk(roots);
		expect(ids.sort()).toEqual(['a', 'b']);
	});
});

describe('buildGoalTree', () => {
	it('derives progress from done over non-cancelled work, rolled up to the parent', () => {
		const [parent] = buildGoalTree(
			[goal('g1', 'Parent'), goal('g2', 'Child', 'g1')],
			[
				item('w1', 'g1', 'done'),
				item('w2', 'g2', 'done'),
				item('w3', 'g2', 'running'),
				item('w4', 'g2', 'cancelled'),
			],
			[],
		);
		expect(parent.progress).toEqual({ total: 3, done: 2, percent: 67 });
		expect(parent.children[0].progress).toEqual({ total: 2, done: 1, percent: 50 });
	});

	it('reports zero progress for a goal with no work', () => {
		const [node] = buildGoalTree([goal('g1', 'Empty')], [], []);
		expect(node.progress).toEqual({ total: 0, done: 0, percent: 0 });
	});

	it('names the owner when the member is visible', () => {
		const [node] = buildGoalTree(
			[goal('g1', 'Owned', null, 'm1' as never)],
			[],
			[member('m1', 'Mia')],
		);
		expect(node.ownerName).toBe('Mia');
	});

	it('keeps goals in a parent cycle visible', () => {
		const roots = buildGoalTree([goal('a', 'A', 'b'), goal('b', 'B', 'a')], [], []);
		expect(roots.length).toBeGreaterThan(0);
	});
});

describe('eligibleManagers', () => {
	const team = [
		member('a', 'Ada'),
		member('b', 'Bob', 'a'),
		member('c', 'Cat', 'b'),
		member('d', 'Dan'),
		{ ...member('e', 'Eve'), archived: true },
	];

	it('excludes the member, all of its reports, and archived members', () => {
		expect(eligibleManagers(team, 'b').map(({ id }) => id)).toEqual(['a', 'd']);
	});

	it('lets a root member report to any active member that is not below it', () => {
		expect(eligibleManagers(team, 'd').map(({ id }) => id)).toEqual(['a', 'b', 'c']);
	});
});
