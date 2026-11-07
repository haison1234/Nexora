import type { AiDepartmentWorkState, AiDepartmentWorkRelationshipDto } from '@n8n/api-types';

export function getBlockerWorkIds(
	workId: string,
	relationships: readonly AiDepartmentWorkRelationshipDto[],
) {
	return relationships
		.filter(({ kind, relatedWorkId }) => kind === 'blocks' && relatedWorkId === workId)
		.map(({ workId: blockerId }) => blockerId);
}

export function areWorkBlockersResolved(
	blockerIds: readonly string[],
	workById: Readonly<Record<string, { state: AiDepartmentWorkState } | undefined>>,
	loadFailed: boolean,
) {
	return (
		!loadFailed &&
		blockerIds.every((id) => {
			const state = workById[id]?.state;
			return state === 'done' || state === 'cancelled';
		})
	);
}
