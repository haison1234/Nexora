import { describe, expect, it } from 'vitest';

import { parseWorkListQuery } from './work-query-state';

const states = ['backlog', 'ready', 'running', 'review', 'blocked', 'done', 'cancelled'] as const;

describe('parseWorkListQuery', () => {
	it('reads valid search, state, and page values', () => {
		expect(parseWorkListQuery('invoice', 'review', '3', states)).toEqual({
			search: 'invoice',
			state: 'review',
			page: 2,
		});
	});

	it('uses safe defaults for invalid query values', () => {
		expect(parseWorkListQuery(['invoice'], 'private', '-2', states)).toEqual({
			search: '',
			state: '',
			page: 0,
		});
	});
});
