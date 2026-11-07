import type { AiDepartmentMemberDto, AiDepartmentWorkItemDto } from '@n8n/api-types';
import {
	buildOfficeModel,
	connectionFor,
	deriveStatus,
	helpLinksFrom,
	helpWaitingWorkIds,
	layoutSignature,
	shouldContinueOfficeAnimation,
	OFFICE_LIMITS,
} from './office-model';

function member(id: string, overrides: Partial<AiDepartmentMemberDto> = {}): AiDepartmentMemberDto {
	return {
		id,
		projectId: 'p1',
		departmentId: 'd1',
		name: `Member ${id}`,
		role: 'Engineer',
		managerMemberId: null,
		expertiseTags: [],
		archived: false,
		version: 1,
		executionState: 'available',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

function work(
	id: string,
	assigneeMemberId: string | null,
	state: AiDepartmentWorkItemDto['state'],
	overrides: Partial<AiDepartmentWorkItemDto> = {},
): AiDepartmentWorkItemDto {
	return {
		id,
		projectId: 'p1',
		departmentId: 'd1',
		goalId: null,
		assigneeMemberId,
		instruction: `Task ${id}`,
		priority: 'normal',
		dueAt: null,
		reviewPolicy: 'required',
		reviewStages: [],
		reviewPolicyRevision: 1,
		currentReviewStageIndex: 0,
		state,
		currentAttemptId: null,
		version: 1,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('deriveStatus', () => {
	it('shows an unconfigured or unavailable executor before any work state', () => {
		const running = work('w', 'a', 'running');
		expect(deriveStatus({ executionState: 'unconfigured' }, running)).toBe('unconfigured');
		expect(deriveStatus({ executionState: 'unavailable' }, running)).toBe('unavailable');
	});

	it.each([
		['running', 'working'],
		['review', 'review'],
		['blocked', 'blocked'],
		['ready', 'queued'],
	] as const)('maps %s work to %s', (state, expected) => {
		expect(deriveStatus({ executionState: 'available' }, work('w', 'a', state))).toBe(expected);
	});

	it('is idle with no active work', () => {
		expect(deriveStatus({ executionState: 'available' }, null)).toBe('idle');
	});
});

describe('office work labels', () => {
	it('limits the displayed work title to a short, single-line summary', () => {
		const model = buildOfficeModel(
			[member('a')],
			[work('w', 'a', 'running', { instruction: `  ${'Long title '.repeat(20)}  ` })],
		);
		expect(model.characters[0].workInstruction).toHaveLength(64);
		expect(model.characters[0].workInstruction).not.toContain('\n');
	});
});

describe('waiting for an answer', () => {
	const helpItem = (workId: string, state: string) => ({ request: { workId, state } });

	it('shows blocked work as waiting only when a help request is open for it', () => {
		const blocked = work('w1', 'a', 'blocked');
		expect(deriveStatus(member('a'), blocked, true)).toBe('waiting');
		expect(deriveStatus(member('a'), blocked, false)).toBe('blocked');
		expect(deriveStatus(member('a'), work('w2', 'a', 'running'), true)).toBe('working');
	});

	it('counts only open help request states', () => {
		const ids = helpWaitingWorkIds([
			helpItem('w1', 'awaiting_answer'),
			helpItem('w2', 'escalating'),
			helpItem('w3', 'queued'),
			helpItem('w4', 'pending_stop'),
			helpItem('w5', 'answered'),
			helpItem('w6', 'expired'),
			helpItem('w7', 'failed'),
		]);
		expect([...ids].sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
	});

	it('uses the waiting set when it builds characters', () => {
		const model = buildOfficeModel(
			[member('a'), member('b')],
			[work('w1', 'a', 'blocked'), work('w2', 'b', 'blocked')],
			OFFICE_LIMITS.characters,
			new Set(['w1']),
		);
		const status = (id: string) => model.characters.find(({ memberId }) => memberId === id)?.status;
		expect(status('a')).toBe('waiting');
		expect(status('b')).toBe('blocked');
	});
});

describe('help links', () => {
	const item = (requesterMemberId: string, recipientMemberId: string | null, state: string) => ({
		request: { workId: 'w', requesterMemberId, state, routing: { recipientMemberId } },
	});

	it('links the requester to a member recipient for open requests only', () => {
		expect(
			helpLinksFrom([
				item('a', 'b', 'awaiting_answer'),
				item('c', 'd', 'escalating'),
				item('e', 'f', 'answered'),
				item('g', 'h', 'expired'),
			]),
		).toEqual([
			{ requesterId: 'a', recipientId: 'b' },
			{ requesterId: 'c', recipientId: 'd' },
		]);
	});

	it('skips requests whose recipient is a person or not chosen yet', () => {
		expect(helpLinksFrom([item('a', null, 'awaiting_answer')])).toEqual([]);
	});
});

describe('shouldContinueOfficeAnimation', () => {
	it('stops the animation loop when reduced motion is active', () => {
		expect(shouldContinueOfficeAnimation(true, true, true)).toBe(false);
	});

	it('keeps the animation loop for animated statuses when the scene is visible', () => {
		expect(shouldContinueOfficeAnimation(false, true, true)).toBe(true);
	});

	it('stops the animation loop when the scene is hidden or has no animated statuses', () => {
		expect(shouldContinueOfficeAnimation(false, true, false)).toBe(false);
		expect(shouldContinueOfficeAnimation(false, false, true)).toBe(false);
	});
});

describe('buildOfficeModel', () => {
	it('returns an empty model without inventing characters', () => {
		const model = buildOfficeModel([], [work('w', 'a', 'running')]);
		expect(model.characters).toEqual([]);
		expect(model.teams).toEqual([]);
	});

	it('leaves archived members out', () => {
		const model = buildOfficeModel([member('a'), member('b', { archived: true })], []);
		expect(model.characters.map(({ memberId }) => memberId)).toEqual(['a']);
	});

	it('picks the most urgent active work for a member', () => {
		const model = buildOfficeModel(
			[member('a')],
			[work('w1', 'a', 'ready'), work('w2', 'a', 'review'), work('w3', 'a', 'running')],
		);
		expect(model.characters[0]).toMatchObject({ status: 'working', workId: 'w3' });
	});

	it('ignores finished, cancelled and unassigned work', () => {
		const model = buildOfficeModel(
			[member('a')],
			[work('w1', 'a', 'done'), work('w2', 'a', 'cancelled'), work('w3', null, 'running')],
		);
		expect(model.characters[0]).toMatchObject({ status: 'idle', workId: null });
	});

	it('gives every manager a room and puts staff in the room of their direct manager', () => {
		const model = buildOfficeModel(
			[
				member('lead'),
				member('s1', { managerMemberId: 'lead' }),
				member('mid', { managerMemberId: 'lead' }),
				member('s2', { managerMemberId: 'mid' }),
				member('s3', { managerMemberId: 'mid' }),
				member('solo'),
			],
			[],
		);
		const room = (id: string) => model.teams.find((team) => team.id === id);
		expect(room('lead')?.memberIds).toEqual(['lead', 's1']);
		expect(room('mid')?.memberIds).toEqual(['mid', 's2', 's3']);
		expect(room('solo')?.memberIds).toEqual(['solo']);
		expect(model.characters.find(({ memberId }) => memberId === 'mid')?.teamId).toBe('mid');
		expect(model.characters.find(({ memberId }) => memberId === 's2')?.teamId).toBe('mid');
	});

	it('orders rooms like the reporting tree, then a room for each member with no reports or manager', () => {
		const model = buildOfficeModel(
			[
				member('ceo', { name: 'Ceo' }),
				member('b', { name: 'B head', managerMemberId: 'ceo' }),
				member('a', { name: 'A head', managerMemberId: 'ceo' }),
				member('a1', { name: 'A one', managerMemberId: 'a' }),
				member('b1', { name: 'B one', managerMemberId: 'b' }),
				member('z', { name: 'Zed' }),
			],
			[],
		);
		expect(model.teams.map(({ id }) => id)).toEqual(['ceo', 'a', 'b', 'z']);
	});

	it('shows a manager whose reports are all managers as a room with only that manager', () => {
		const model = buildOfficeModel(
			[
				member('lead'),
				member('r1', { managerMemberId: 'lead' }),
				member('r2', { managerMemberId: 'r1' }),
			],
			[],
		);
		expect(model.teams.find(({ id }) => id === 'lead')?.memberIds).toEqual(['lead']);
		expect(model.teams.find(({ id }) => id === 'r1')?.memberIds).toEqual(['r1', 'r2']);
	});

	it('gives each member with no manager and no reports a room, led by that member', () => {
		const model = buildOfficeModel([member('a'), member('b'), member('c')], []);
		expect(model.teams.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
		expect(model.teams[0].leadMemberId).toBe('a');
	});

	it('keeps every member of a reporting loop in a room', () => {
		const model = buildOfficeModel(
			[
				member('a', { managerMemberId: 'b' }),
				member('b', { managerMemberId: 'a' }),
				member('c', { managerMemberId: 'a' }),
			],
			[],
		);
		const seated = model.teams.flatMap(({ memberIds }) => memberIds).sort();
		expect(seated).toEqual(['a', 'b', 'c']);
	});

	it('survives a reporting cycle', () => {
		const model = buildOfficeModel(
			[member('a', { managerMemberId: 'b' }), member('b', { managerMemberId: 'a' })],
			[],
		);
		expect(model.characters).toHaveLength(2);
	});

	it('treats a manager outside the visible members as no manager', () => {
		const model = buildOfficeModel([member('a', { managerMemberId: 'gone' })], []);
		expect(model.teams.map(({ id }) => id)).toEqual(['a']);
	});

	it('gives every character its own desk', () => {
		const members = Array.from({ length: 14 }, (_, index) =>
			member(`m${index}`, { managerMemberId: index % 4 === 0 ? null : `m${index - (index % 4)}` }),
		);
		const model = buildOfficeModel(members, []);
		const desks = new Set(model.characters.map(({ desk }) => `${desk.x}:${desk.z}`));
		expect(desks.size).toBe(model.characters.length);
		expect(model.bounds.width).toBeGreaterThan(0);
		expect(model.bounds.depth).toBeGreaterThan(0);
	});

	it('limits the scene and reports how many members were left out', () => {
		const members = Array.from({ length: OFFICE_LIMITS.characters + 5 }, (_, index) =>
			member(`m${String(index).padStart(3, '0')}`),
		);
		const model = buildOfficeModel(members, []);
		expect(model.characters).toHaveLength(OFFICE_LIMITS.characters);
		expect(model.truncated).toBe(5);
	});

	it('uses the highest member or work version as the source version', () => {
		const model = buildOfficeModel(
			[member('a', { version: 2 })],
			[work('w', 'a', 'running', { version: 7 })],
		);
		expect(model.characters[0].sourceVersion).toBe(7);
	});
});

describe('layoutSignature', () => {
	it('ignores status changes but changes when the layout changes', () => {
		const before = buildOfficeModel([member('a'), member('b')], []);
		const sameLayout = buildOfficeModel([member('a'), member('b')], [work('w', 'a', 'running')]);
		const grown = buildOfficeModel([member('a'), member('b'), member('c')], []);
		expect(layoutSignature(sameLayout)).toBe(layoutSignature(before));
		expect(layoutSignature(grown)).not.toBe(layoutSignature(before));
	});

	it('changes when a name or role shown on a sign changes', () => {
		const before = buildOfficeModel([member('a', { name: 'Ada', role: 'Lead' })], []);
		const renamed = buildOfficeModel([member('a', { name: 'Ada B', role: 'Lead' })], []);
		const promoted = buildOfficeModel([member('a', { name: 'Ada', role: 'CEO' })], []);
		expect(layoutSignature(renamed)).not.toBe(layoutSignature(before));
		expect(layoutSignature(promoted)).not.toBe(layoutSignature(before));
	});
});

describe('connectionFor', () => {
	it('is disconnected before any data arrives', () => {
		expect(connectionFor(null, false, 1_000)).toBe('disconnected');
	});

	it('is live within the stale window and stale after it', () => {
		expect(connectionFor(1_000, false, 1_000 + OFFICE_LIMITS.staleAfterMs)).toBe('live');
		expect(connectionFor(1_000, false, 1_001 + OFFICE_LIMITS.staleAfterMs)).toBe('stale');
	});

	it('is disconnected after a failed refresh, even when the data is recent', () => {
		expect(connectionFor(1_000, true, 1_500)).toBe('disconnected');
	});
});
