import type { AiDepartmentWorkState } from '@n8n/api-types';

type ParsedWorkListQuery = {
	search: string;
	state: AiDepartmentWorkState | '';
	page: number;
};

export function parseWorkListQuery(
	search: unknown,
	state: unknown,
	page: unknown,
	states: readonly AiDepartmentWorkState[],
): ParsedWorkListQuery {
	const parsedPage = typeof page === 'string' ? Number(page) : 0;
	const parsedState = states.find((candidate) => candidate === state) ?? '';
	return {
		search: typeof search === 'string' ? search : '',
		state: parsedState,
		page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage - 1 : 0,
	};
}
