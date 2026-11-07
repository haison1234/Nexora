import type { AiDepartmentMemberDto } from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import 'fake-indexeddb/auto';
import { loadOrgPositions, removeOrgPositions, type OrgLayoutScope } from './org-layout-storage';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import OrgCanvas from './OrgCanvas.vue';

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

describe('OrgCanvas accessibility', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'vi';
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {}
			},
		);
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
		vi.unstubAllGlobals();
	});

	it('uses Vietnamese labels and moves focus between member cards with arrow keys', async () => {
		render(OrgCanvas, {
			props: {
				members: [member('a', 'Ada'), member('b', 'Bob', 'a')],
				work: [],
				selectedId: null,
			},
		});

		expect(screen.getByRole('group', { name: /Sơ đồ tổ chức/ })).toBeInTheDocument();
		const ada = screen.getByRole('button', { name: 'Mở Ada' });
		const bob = screen.getByRole('button', { name: 'Mở Bob' });

		ada.focus();
		await fireEvent.keyDown(ada, { key: 'ArrowDown' });

		expect(bob).toHaveFocus();
	});

	describe('drag to change manager', () => {
		const team = [
			member('a', 'Ada'),
			member('b', 'Bob', 'a'),
			member('c', 'Cat', 'b'),
			member('d', 'Dan'),
		];

		function stubHit(target: () => Element | null) {
			document.elementFromPoint = vi.fn(() => target());
			Element.prototype.setPointerCapture = vi.fn();
			Element.prototype.getBoundingClientRect = vi.fn(
				() => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect,
			);
		}

		const pointer = (type: string, init: Record<string, number>) =>
			new MouseEvent(type, { bubbles: true, button: 0, ...init });
		const fire = async (el: Element, type: string, init: Record<string, number>) => {
			const event = pointer(type, init);
			Object.assign(event, { pointerId: 1, pointerType: 'mouse' });
			await fireEvent(el, event);
		};

		it('emits reparent when a card is dropped on an eligible card', async () => {
			const { emitted } = render(OrgCanvas, {
				props: { members: team, work: [], selectedId: null, editable: true },
			});
			const bob = screen.getByRole('button', { name: 'Mở Bob' });
			const dan = screen.getByRole('button', { name: 'Mở Dan' });
			stubHit(() => dan);

			await fire(bob, 'pointerdown', { clientX: 10, clientY: 10 });
			await fire(bob, 'pointermove', { clientX: 60, clientY: 60 });
			await fire(bob, 'pointerup', { clientX: 60, clientY: 60 });

			expect(emitted().reparent).toEqual([['b', 'd']]);
		});

		it('does not emit when dropped on a report of the dragged card', async () => {
			const { emitted } = render(OrgCanvas, {
				props: { members: team, work: [], selectedId: null, editable: true },
			});
			const bob = screen.getByRole('button', { name: 'Mở Bob' });
			const cat = screen.getByRole('button', { name: 'Mở Cat' });
			stubHit(() => cat);

			await fire(bob, 'pointerdown', { clientX: 10, clientY: 10 });
			await fire(bob, 'pointermove', { clientX: 60, clientY: 60 });
			await fire(bob, 'pointerup', { clientX: 60, clientY: 60 });

			expect(emitted().reparent).toBeUndefined();
		});

		it('does not start a drag without edit access', async () => {
			const { emitted } = render(OrgCanvas, {
				props: { members: team, work: [], selectedId: null },
			});
			const bob = screen.getByRole('button', { name: 'Mở Bob' });
			const dan = screen.getByRole('button', { name: 'Mở Dan' });
			stubHit(() => dan);

			await fire(bob, 'pointerdown', { clientX: 10, clientY: 10 });
			await fire(bob, 'pointermove', { clientX: 60, clientY: 60 });
			await fire(bob, 'pointerup', { clientX: 60, clientY: 60 });

			expect(emitted().reparent).toBeUndefined();
		});

		it('cancels the drag with Escape', async () => {
			const { emitted } = render(OrgCanvas, {
				props: { members: team, work: [], selectedId: null, editable: true },
			});
			const bob = screen.getByRole('button', { name: 'Mở Bob' });
			const dan = screen.getByRole('button', { name: 'Mở Dan' });
			stubHit(() => dan);

			await fire(bob, 'pointerdown', { clientX: 10, clientY: 10 });
			await fire(bob, 'pointermove', { clientX: 60, clientY: 60 });
			await fireEvent.keyDown(bob, { key: 'Escape' });
			await fire(bob, 'pointerup', { clientX: 60, clientY: 60 });

			expect(emitted().reparent).toBeUndefined();
		});
	});

	it('moves and saves a card only in layout mode', async () => {
		const team = [member('a', 'Ada'), member('b', 'Bob', 'a')];
		const positionScope: OrgLayoutScope = {
			userId: `layout-user-${Date.now()}`,
			projectId: 'project-1',
			departmentId: 'department-1',
		};
		Element.prototype.setPointerCapture = vi.fn();
		Element.prototype.getBoundingClientRect = vi.fn(
			() => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect,
		);
		const { emitted } = render(OrgCanvas, {
			props: { members: team, work: [], selectedId: null, editable: true, positionScope },
		});
		const bob = screen.getByRole('button', { name: 'Mở Bob' });
		const originalLeft = Number.parseFloat(bob.parentElement?.style.left ?? '0');
		const originalTop = Number.parseFloat(bob.parentElement?.style.top ?? '0');
		await fireEvent.click(screen.getByTestId('org-move-mode'));

		const fire = async (type: string, x: number, y: number) => {
			const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
			Object.assign(event, { pointerId: 1, pointerType: 'mouse' });
			await fireEvent(bob, event);
		};
		await fire('pointerdown', 10, 10);
		await fire('pointermove', 60, 70);
		await fire('pointerup', 60, 70);

		expect(emitted().reparent).toBeUndefined();
		expect(Number.parseFloat(bob.parentElement?.style.left ?? '0')).toBe(originalLeft + 50);
		expect(Number.parseFloat(bob.parentElement?.style.top ?? '0')).toBe(originalTop + 60);
		await expect(loadOrgPositions(positionScope)).resolves.toEqual({
			b: { x: originalLeft + 50, y: originalTop + 60 },
		});
		await fireEvent.keyDown(bob, { key: 'ArrowRight' });
		await waitFor(async () => {
			await expect(loadOrgPositions(positionScope)).resolves.toEqual({
				b: { x: originalLeft + 74, y: originalTop + 60 },
			});
		});
		await removeOrgPositions(positionScope);
	});

	describe('search and emphasis', () => {
		const people = [
			{ ...member('a', 'Ada'), role: 'Lead' },
			{ ...member('b', 'Bob', 'a'), role: 'Writer', expertiseTags: ['marketing'] },
			{ ...member('c', 'Cat', 'a'), role: 'Analyst' },
			{ ...member('d', 'Dan'), role: 'Designer' },
		];

		it('dims members that do not match the search and reports the count', async () => {
			i18nInstance.global.locale.value = 'en';
			render(OrgCanvas, { props: { members: people, work: [], selectedId: null } });

			await fireEvent.update(screen.getByTestId('org-search'), 'marketing');

			expect(screen.getByText('1 found')).toBeInTheDocument();
			expect(screen.getByTestId('org-card-b')).not.toHaveClass('card--dim');
			expect(screen.getByTestId('org-card-c')).toHaveClass('card--dim');
			expect(screen.getByTestId('org-card-a')).toHaveClass('card--dim');
		});

		it('selects the first match when Enter is pressed in the search box', async () => {
			i18nInstance.global.locale.value = 'en';
			const { emitted } = render(OrgCanvas, {
				props: { members: people, work: [], selectedId: null },
			});
			const search = screen.getByTestId('org-search');

			await fireEvent.update(search, 'designer');
			await fireEvent.keyDown(search, { key: 'Enter' });

			expect(emitted().select).toEqual([['d']]);
		});

		it('keeps the selected member, its manager chain, and its reports in focus', () => {
			render(OrgCanvas, { props: { members: people, work: [], selectedId: 'b' } });

			expect(screen.getByTestId('org-card-b')).not.toHaveClass('card--dim');
			expect(screen.getByTestId('org-card-a')).not.toHaveClass('card--dim');
			expect(screen.getByTestId('org-card-c')).toHaveClass('card--dim');
			expect(screen.getByTestId('org-card-d')).toHaveClass('card--dim');
		});

		it('shows how many active work items a member has', () => {
			const work = [
				{ id: 'w1', assigneeMemberId: 'b', state: 'running' },
				{ id: 'w2', assigneeMemberId: 'b', state: 'ready' },
				{ id: 'w3', assigneeMemberId: 'b', state: 'done' },
			] as never;
			render(OrgCanvas, { props: { members: people, work, selectedId: null } });

			expect(screen.getByTestId('org-card-b')).toHaveTextContent('2');
		});
	});

	describe('narrow screens', () => {
		it('renders a nested list instead of the canvas below 640 px', async () => {
			vi.stubGlobal(
				'matchMedia',
				vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
			);
			render(OrgCanvas, {
				props: {
					members: [member('a', 'Ada'), member('b', 'Bob', 'a')],
					work: [],
					selectedId: null,
				},
			});

			expect(await screen.findByTestId('org-tree-list')).toBeInTheDocument();
			expect(screen.queryByTestId('org-canvas')).not.toBeInTheDocument();
		});
	});
});
