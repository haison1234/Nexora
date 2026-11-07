import type { AiDepartmentMemberDto } from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { fireEvent, render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import MemberPanel from './MemberPanel.vue';

function member(id: string, executionState: AiDepartmentMemberDto['executionState']) {
	return {
		id,
		projectId: 'project-1',
		departmentId: 'department-1',
		name: 'Ada',
		role: 'Coordinator',
		managerMemberId: null,
		expertiseTags: [],
		archived: false,
		version: 1,
		executionState,
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentMemberDto;
}

describe('MemberPanel', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('shows the executor binding state', () => {
		render(MemberPanel, {
			props: {
				member: member('member-1', 'available'),
				members: [],
				work: [],
				binding: {
					memberId: 'member-1',
					executionState: 'available',
					executorId: 'agent-1',
					bindingVersion: 1,
				},
				bindingLoading: false,
				bindingError: false,
			},
		});

		expect(screen.getByText('Executor binding')).toBeInTheDocument();
		expect(screen.getByText('Executor is available')).toBeInTheDocument();
	});

	it('shows an unconfigured binding', () => {
		render(MemberPanel, {
			props: {
				member: member('member-1', 'unconfigured'),
				members: [],
				work: [],
				binding: {
					memberId: 'member-1',
					executionState: 'unconfigured',
					bindingVersion: null,
				},
				bindingLoading: false,
				bindingError: false,
			},
		});
		expect(screen.getByText('No executor is bound')).toBeInTheDocument();
	});

	it('shows a loading state', () => {
		render(MemberPanel, {
			props: {
				member: member('member-1', 'unavailable'),
				members: [],
				work: [],
				binding: null,
				bindingLoading: true,
				bindingError: false,
			},
		});
		expect(screen.getByText('Loading binding…')).toBeInTheDocument();
	});

	it('shows an unavailable binding', () => {
		render(MemberPanel, {
			props: {
				member: member('member-1', 'unavailable'),
				members: [],
				work: [],
				binding: {
					memberId: 'member-1',
					executionState: 'unavailable',
					bindingVersion: 2,
				},
				bindingLoading: false,
				bindingError: false,
			},
		});
		expect(screen.getByText('Executor is unavailable')).toBeInTheDocument();
	});

	describe('manager selector', () => {
		const person = (id: string, name: string, managerMemberId: string | null = null) => ({
			...member(id, 'available'),
			id,
			name,
			managerMemberId,
		});
		const props = {
			work: [],
			binding: null,
			bindingLoading: false,
			bindingError: false,
		};

		it('offers only members that cannot create a loop and emits the choice', async () => {
			const ada = person('a', 'Ada');
			const bob = person('b', 'Bob', 'a');
			const cat = person('c', 'Cat', 'b');
			const dan = person('d', 'Dan');
			const { emitted } = render(MemberPanel, {
				props: { ...props, member: bob, members: [ada, bob, cat, dan], editable: true },
			});

			const select = screen.getByRole('combobox', { name: 'Change who this member reports to' });
			expect(
				Array.from(select.querySelectorAll('option')).map((o) => o.textContent?.trim()),
			).toEqual(['No manager', 'Ada', 'Dan']);

			await fireEvent.update(select, 'd');
			expect(emitted().setManager).toEqual([['b', 'd']]);

			await fireEvent.update(select, '');
			expect(emitted().setManager[1]).toEqual(['b', null]);
		});

		it('shows the manager as text without edit access', () => {
			const ada = person('a', 'Ada');
			const bob = person('b', 'Bob', 'a');
			render(MemberPanel, { props: { ...props, member: bob, members: [ada, bob] } });

			expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Ada' })).toBeInTheDocument();
		});
	});

	it('lists the expertise tags of the member', () => {
		render(MemberPanel, {
			props: {
				member: { ...member('member-1', 'available'), expertiseTags: ['marketing', 'seo'] },
				members: [],
				work: [],
				binding: null,
				bindingLoading: false,
				bindingError: false,
			},
		});

		expect(screen.getByTestId('member-expertise')).toHaveTextContent('marketing');
		expect(screen.getByTestId('member-expertise')).toHaveTextContent('seo');
	});

	describe('expertise editor', () => {
		const props = {
			members: [],
			work: [],
			binding: null,
			bindingLoading: false,
			bindingError: false,
		};

		it('adds a tag and emits the full list', async () => {
			const { emitted } = render(MemberPanel, {
				props: {
					...props,
					member: { ...member('member-1', 'available'), expertiseTags: ['seo'] },
					editable: true,
				},
			});

			await fireEvent.update(screen.getByTestId('member-expertise-input'), '  Marketing ');
			await fireEvent.click(screen.getByRole('button', { name: 'Add' }));

			expect(emitted().setExpertise).toEqual([['member-1', ['seo', 'Marketing']]]);
		});

		it('removes a tag and emits the remaining list', async () => {
			const { emitted } = render(MemberPanel, {
				props: {
					...props,
					member: { ...member('member-1', 'available'), expertiseTags: ['seo', 'ads'] },
					editable: true,
				},
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Remove seo' }));

			expect(emitted().setExpertise).toEqual([['member-1', ['ads']]]);
		});

		it('has no editor and no manager note without edit access', () => {
			render(MemberPanel, {
				props: {
					...props,
					member: { ...member('member-1', 'available'), expertiseTags: ['seo'] },
				},
			});

			expect(screen.queryByTestId('member-expertise-input')).not.toBeInTheDocument();
			expect(screen.queryByText(/escalated help requests/)).not.toBeInTheDocument();
		});

		it('explains what a manager receives when the manager can be changed', () => {
			render(MemberPanel, {
				props: { ...props, member: member('member-1', 'available'), editable: true },
			});

			expect(screen.getByText(/escalated help requests/)).toBeInTheDocument();
		});

		it('shows the waiting status for blocked work with an open help request', () => {
			const work = [
				{ id: 'w1', assigneeMemberId: 'member-1', state: 'blocked', instruction: 'Do it' },
			] as never;
			render(MemberPanel, {
				props: {
					...props,
					work,
					member: member('member-1', 'available'),
					waitingWorkIds: new Set(['w1']),
				},
			});

			expect(screen.getByTestId('office-status-chip')).toHaveTextContent('Waiting for an answer');
		});
	});
});
