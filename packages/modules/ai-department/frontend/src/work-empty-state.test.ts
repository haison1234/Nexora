import { describe, expect, it } from 'vitest';

import { getWorkEmptyStateKey } from './work-empty-state';

describe('getWorkEmptyStateKey', () => {
	it('shows creation guidance to a coordinator when no filters are active', () => {
		expect(getWorkEmptyStateKey(true, false)).toBe('aiDepartment.empty.work.description');
	});

	it('does not suggest creation to a reader', () => {
		expect(getWorkEmptyStateKey(false, false)).toBe('aiDepartment.empty.work.readOnly');
	});

	it('explains when active filters return no work', () => {
		expect(getWorkEmptyStateKey(true, true)).toBe('aiDepartment.empty.work.noMatches');
	});
});
