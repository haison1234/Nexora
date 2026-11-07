export type WorkEmptyStateKey =
	| 'aiDepartment.empty.work.description'
	| 'aiDepartment.empty.work.readOnly'
	| 'aiDepartment.empty.work.noMatches';

export function getWorkEmptyStateKey(canCreate: boolean, hasFilters: boolean): WorkEmptyStateKey {
	if (hasFilters) return 'aiDepartment.empty.work.noMatches';
	return canCreate ? 'aiDepartment.empty.work.description' : 'aiDepartment.empty.work.readOnly';
}
