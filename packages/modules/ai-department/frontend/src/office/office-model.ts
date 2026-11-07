import type {
	AiDepartmentMemberDto,
	AiDepartmentWorkItemDto,
	AiDepartmentWorkState,
} from '@n8n/api-types';
import { buildLayout } from './scene/layout';

export type OfficeStatus =
	| 'working'
	| 'review'
	| 'waiting'
	| 'blocked'
	| 'queued'
	| 'idle'
	| 'unconfigured'
	| 'unavailable';

export type OfficeCharacter = {
	memberId: string;
	name: string;
	role: string;
	status: OfficeStatus;
	executionState: AiDepartmentMemberDto['executionState'];
	managerMemberId: string | null;
	teamId: string;
	workId: string | null;
	workState: AiDepartmentWorkState | null;
	workInstruction: string | null;
	sourceVersion: number;
	desk: { x: number; z: number };
};

export type OfficeTeam = {
	id: string;
	leadMemberId: string | null;
	memberIds: string[];
	center: { x: number; z: number };
	width: number;
	depth: number;
};

export type OfficeModel = {
	characters: OfficeCharacter[];
	teams: OfficeTeam[];
	truncated: number;
	bounds: { width: number; depth: number };
};

export type OfficeConnection = 'live' | 'stale' | 'disconnected';

export const OFFICE_INDEPENDENT_TEAM = '__independent';
export const OFFICE_LIMITS = { characters: 60, staleAfterMs: 12_000 } as const;

const WORK_PRIORITY: AiDepartmentWorkState[] = ['running', 'review', 'blocked', 'ready'];

function pickWork(memberId: string, work: AiDepartmentWorkItemDto[]) {
	let best: AiDepartmentWorkItemDto | null = null;
	let bestRank = WORK_PRIORITY.length;
	for (const item of work) {
		if (item.assigneeMemberId !== memberId) continue;
		const rank = WORK_PRIORITY.indexOf(item.state);
		if (rank !== -1 && rank < bestRank) {
			best = item;
			bestRank = rank;
		}
	}
	return best;
}

export function deriveStatus(
	member: Pick<AiDepartmentMemberDto, 'executionState'>,
	work: AiDepartmentWorkItemDto | null,
	waitingForAnswer = false,
): OfficeStatus {
	if (member.executionState === 'unconfigured') return 'unconfigured';
	if (member.executionState === 'unavailable') return 'unavailable';
	if (!work) return 'idle';
	if (work.state === 'running') return 'working';
	if (work.state === 'review') return 'review';
	if (work.state === 'blocked') return waitingForAnswer ? 'waiting' : 'blocked';
	return 'queued';
}

const HELP_WAITING_STATES = new Set(['pending_stop', 'queued', 'awaiting_answer', 'escalating']);

/** Work ids that wait for an answer to a help request. Blocked work in this set is not stuck. */
export function helpWaitingWorkIds(
	items: Array<{ request: { workId: string; state: string } }>,
): ReadonlySet<string> {
	return new Set(
		items
			.filter(({ request }) => HELP_WAITING_STATES.has(request.state))
			.map(({ request }) => request.workId),
	);
}

type HelpItem = {
	request: {
		workId: string;
		requesterMemberId: string;
		state: string;
		routing: { recipientMemberId: string | null };
	};
};

/** Open help requests that name a member as the recipient. A person recipient has no desk to link to. */
export function helpLinksFrom(
	items: HelpItem[],
): Array<{ requesterId: string; recipientId: string }> {
	return items.flatMap(({ request }) =>
		HELP_WAITING_STATES.has(request.state) && request.routing.recipientMemberId
			? [{ requesterId: request.requesterMemberId, recipientId: request.routing.recipientMemberId }]
			: [],
	);
}

/**
 * One room for every member who has direct reports. That member leads the room and sits in its
 * office. Everybody else sits in the room of their direct manager. A member with no manager and no
 * reports has a room of their own. Rooms follow the order of the reporting tree.
 */
function groupTeams(members: AiDepartmentMemberDto[]) {
	const byName = (a: AiDepartmentMemberDto, b: AiDepartmentMemberDto) =>
		a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
	const byId = new Map(members.map((member) => [member.id, member]));
	const managerOf = (member: AiDepartmentMemberDto) =>
		member.managerMemberId &&
		member.managerMemberId !== member.id &&
		byId.has(member.managerMemberId)
			? member.managerMemberId
			: null;

	const reports = new Map<string, AiDepartmentMemberDto[]>();
	for (const member of members) {
		const manager = managerOf(member);
		if (manager) reports.set(manager, [...(reports.get(manager) ?? []), member]);
	}

	const rooms = new Map<string, AiDepartmentMemberDto[]>();
	for (const member of members) {
		if (reports.has(member.id)) rooms.set(member.id, [member]);
	}
	for (const member of members) {
		if (reports.has(member.id)) continue;
		const manager = managerOf(member);
		if (manager) rooms.get(manager)?.push(member);
		else rooms.set(member.id, [member]);
	}

	const order: string[] = [];
	const seen = new Set<string>();
	const visit = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		if (rooms.has(id)) order.push(id);
		for (const report of [...(reports.get(id) ?? [])].sort(byName)) visit(report.id);
	};
	for (const root of members.filter((member) => !managerOf(member)).sort(byName)) visit(root.id);
	// Members of a reporting loop have no root. Keep them in the building, in name order.
	for (const member of [...members].sort(byName)) visit(member.id);

	const teams = new Map<string, AiDepartmentMemberDto[]>();
	for (const id of order) teams.set(id, rooms.get(id) ?? []);
	return teams;
}

function orderTeamMembers(teamId: string, members: AiDepartmentMemberDto[]) {
	return [...members].sort((a, b) => {
		if (a.id === teamId) return -1;
		if (b.id === teamId) return 1;
		return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
	});
}

/** Map authorized members and work to display characters. Order: teams first, then independents. */
export function buildOfficeModel(
	allMembers: AiDepartmentMemberDto[],
	work: AiDepartmentWorkItemDto[],
	limit: number = OFFICE_LIMITS.characters,
	waitingWorkIds?: ReadonlySet<string>,
): OfficeModel {
	const active = allMembers.filter(({ archived }) => !archived);
	const members = [...active]
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
		.slice(0, limit);
	const truncated = Math.max(0, active.length - members.length);

	const grouped = [...groupTeams(members)].map(([id, list]) => ({
		id,
		members: orderTeamMembers(id, list),
	}));

	const characters: OfficeCharacter[] = [];
	const teams: OfficeTeam[] = [];
	const layout = buildLayout(
		grouped.map(({ id, members: teamMembers }) => ({
			id,
			leadId: id === OFFICE_INDEPENDENT_TEAM ? null : id,
			memberIds: teamMembers.map((member) => member.id),
		})),
	);
	for (const team of grouped) {
		const deskPlaces = team.members.flatMap(({ id }) => {
			const desk = layout.desks.get(id);
			return desk ? [desk.root] : [];
		});
		const minX = Math.min(...deskPlaces.map(({ x }) => x));
		const maxX = Math.max(...deskPlaces.map(({ x }) => x));
		const minZ = Math.min(...deskPlaces.map(({ z }) => z));
		const maxZ = Math.max(...deskPlaces.map(({ z }) => z));
		teams.push({
			id: team.id,
			leadMemberId: team.id === OFFICE_INDEPENDENT_TEAM ? null : team.id,
			memberIds: team.members.map(({ id }) => id),
			center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
			width: Math.max(4, maxX - minX + 3.6),
			depth: Math.max(4, maxZ - minZ + 4),
		});
		for (const member of team.members) {
			const item = pickWork(member.id, work);
			characters.push({
				memberId: member.id,
				name: member.name,
				role: member.role,
				status: deriveStatus(member, item, item ? waitingWorkIds?.has(item.id) : false),
				executionState: member.executionState,
				managerMemberId: member.managerMemberId,
				teamId: team.id,
				workId: item?.id ?? null,
				workState: item?.state ?? null,
				workInstruction: item?.instruction?.trim().replace(/\s+/g, ' ').slice(0, 64) ?? null,
				sourceVersion: Math.max(member.version, item?.version ?? 0),
				desk: layout.desks.get(member.id)?.root ?? { x: 0, z: 0 },
			});
		}
	}
	return { characters, teams, truncated, bounds: { width: layout.width, depth: layout.depth + 8 } };
}

export function connectionFor(
	lastSyncedAt: number | null,
	syncFailed: boolean,
	now: number,
): OfficeConnection {
	if (lastSyncedAt === null) return 'disconnected';
	if (syncFailed) return 'disconnected';
	return now - lastSyncedAt > OFFICE_LIMITS.staleAfterMs ? 'stale' : 'live';
}

export function statusIsAnimated(status: OfficeStatus) {
	return status === 'working' || status === 'review' || status === 'blocked';
}

export function shouldContinueOfficeAnimation(
	reducedMotion: boolean,
	hasAnimatedStatus: boolean,
	isVisible: boolean,
) {
	return !reducedMotion && hasAnimatedStatus && isVisible;
}

/** Changes when members join, leave or move between teams. Status changes do not alter it. */
export function rosterSignature(model: OfficeModel) {
	return model.characters.map(({ memberId, teamId }) => `${memberId}:${teamId}`).join('|');
}

/** Changes when a desk or team moves, or a name or role on a sign changes. Status updates do not alter it. */
export function layoutSignature(model: OfficeModel) {
	return model.characters
		.map(
			({ memberId, teamId, desk, name, role }) =>
				`${memberId}:${teamId}:${desk.x}:${desk.z}:${name}:${role}`,
		)
		.join('|');
}
