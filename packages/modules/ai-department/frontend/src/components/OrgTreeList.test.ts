import type { AiDepartmentMemberDto } from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { fireEvent, render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import { buildOrgTree } from './org-tree';
import OrgTreeList from './OrgTreeList.vue';

function member(id: string, name: string, managerMemberId: string | null = null) {
	return {
		id,
		projectId: 'project-1',
		departmentId: 'department-1',
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

describe('OrgTreeList', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('nests reports under their manager and emits the chosen member', async () => {
		const nodes = buildOrgTree([
			member('a', 'Ada'),
			member('b', 'Bob', 'a'),
			member('c', 'Cat', 'b'),
		]);
		const { emitted } = render(OrgTreeList, {
			props: {
				nodes,
				selectedId: 'b',
				statusOf: (id: string) => (id === 'c' ? 'blocked' : 'idle'),
			},
		});

		expect(screen.getAllByText('1 direct report', { selector: 'summary' })).toHaveLength(2);
		expect(screen.getAllByText('Blocked')).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Open Bob' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Open Cat' }));
		expect(emitted().select).toEqual([['c']]);
	});
});
