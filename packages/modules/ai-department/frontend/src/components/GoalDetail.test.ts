import type {
	AiDepartmentGoalDto,
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
} from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { fireEvent, render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import GoalDetail from './GoalDetail.vue';

const goal = (id: string, title: string, parentId: string | null = null) =>
	({
		id,
		projectId: 'project-1',
		departmentId: 'department-1',
		title,
		successCriteria: 'Meet the target',
		parentId,
		ownerMemberId: 'member-1',
		dueAt: null,
		state: 'active',
		version: 1,
		createdAt: '',
		updatedAt: '',
	}) satisfies AiDepartmentGoalDto;

const member = {
	id: 'member-1',
	projectId: 'project-1',
	departmentId: 'department-1',
	name: 'Mia',
	role: 'Lead',
	managerMemberId: null,
	expertiseTags: [],
	archived: false,
	version: 1,
	executionState: 'available',
	createdAt: '',
	updatedAt: '',
} satisfies AiDepartmentMemberDto;

const item = (id: string, goalId: string, state: AiDepartmentWorkItemDto['state']) =>
	({
		id,
		projectId: 'project-1',
		departmentId: 'department-1',
		goalId,
		assigneeMemberId: null,
		instruction: `Work ${id}`,
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
	}) satisfies AiDepartmentWorkItemDto;

describe('GoalDetail', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('shows owner, parent, criteria, rolled-up progress, and linked work', async () => {
		const goals = [goal('goal-1', 'Parent'), goal('goal-2', 'Child', 'goal-1')];
		render(GoalDetail, {
			props: {
				goal: goals[0],
				goals,
				members: [member],
				work: [item('work-1', 'goal-1', 'done'), item('work-2', 'goal-2', 'ready')],
			},
		});

		expect(screen.getByText('Mia')).toBeInTheDocument();
		expect(screen.getByText('Meet the target')).toBeInTheDocument();
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
		expect(screen.getByRole('button', { name: /Work work-1/ })).toBeInTheDocument();
	});

	it('opens linked work from the goal detail', async () => {
		const goals = [goal('goal-1', 'Parent')];
		const { emitted } = render(GoalDetail, {
			props: {
				goal: goals[0],
				goals,
				members: [member],
				work: [item('work-1', 'goal-1', 'ready')],
			},
		});

		await fireEvent.click(screen.getByRole('button', { name: /Work work-1/ }));
		expect(emitted().openWork).toEqual([['work-1']]);
	});
});
