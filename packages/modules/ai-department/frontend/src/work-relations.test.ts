import { areWorkBlockersResolved, getBlockerWorkIds } from './work-relations';
import type { AiDepartmentWorkRelationshipDto } from '@n8n/api-types';

const relationships = [
	{ workId: 'blocker-1', relatedWorkId: 'work-1', kind: 'blocks' },
	{ workId: 'work-1', relatedWorkId: 'child-1', kind: 'parent' },
	{ workId: 'work-1', relatedWorkId: 'blocked-work-2', kind: 'blocks' },
] as AiDepartmentWorkRelationshipDto[];

describe('work relationship helpers', () => {
	it('finds incoming blockers without treating outgoing blocked work as a blocker', () => {
		expect(getBlockerWorkIds('work-1', relationships)).toEqual(['blocker-1']);
	});

	it('allows start only when every blocker is terminal and readable', () => {
		expect(
			areWorkBlockersResolved(
				['blocker-1', 'blocker-2'],
				{ 'blocker-1': { state: 'done' }, 'blocker-2': { state: 'cancelled' } },
				false,
			),
		).toBe(true);
		expect(areWorkBlockersResolved(['blocker-1'], {}, false)).toBe(false);
		expect(
			areWorkBlockersResolved(['blocker-1'], { 'blocker-1': { state: 'running' } }, true),
		).toBe(false);
	});
});
