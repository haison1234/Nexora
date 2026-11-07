export type Vec2 = { x: number; z: number };
export type ZoneId = 'review' | 'blocked' | 'lounge';
export type Slot = { position: Vec2; heading: number };

export type DeskPlace = {
	id: string;
	/** The room (team id) the desk stands in. */
	room: string;
	/** Centre of the desk furniture. */
	root: Vec2;
	/** Where the person sits. Behind the desk, facing +z. */
	seat: Vec2;
	/** Walking lane beside the desk. */
	laneX: number;
	/** Row aisle in front of the desk. */
	aisleZ: number;
	row: number;
	column: number;
};

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export type RoomPlace = {
	id: string;
	row: number;
	/** An open area has no walls and no private office. Members without a team sit in one. */
	walled: boolean;
	bounds: Box;
	/** Centre of the gap in the front wall. */
	door: Vec2;
	/** Walking lane in front of the desks, inside the room. */
	frontAisleZ: number;
	/** Hallway the door opens onto: the gap below the row, or the corridor for the last row. */
	hallZ: number;
	/** Shared hallway in front of this room row. */
	corridorZ: number;
	/** Private glass office at the back of the room, for the team lead. */
	office: { leadId: string; bounds: Box; door: Vec2 } | null;
};

export type LayoutTeam = { id: string; leadId: string | null; memberIds: string[] };

export type WallSegment = { a: Vec2; b: Vec2; room: string; kind: 'room' | 'office' };

export type OfficeLayout = {
	desks: Map<string, DeskPlace>;
	rooms: RoomPlace[];
	/** Free column at the left edge, outside every room, that joins the hallways. */
	sideX: number;
	roomById: Map<string, RoomPlace>;
	deskOrder: string[];
	columns: number;
	rows: number;
	roomsWidth: number;
	corridorZ: number;
	sideCorridorX: number;
	hallways: Array<{ center: Vec2; width: number; depth: number }>;
	zones: Record<ZoneId, { center: Vec2; slots: Slot[] }>;
	boardCenter: Vec2;
	floor: { minX: number; maxX: number; minZ: number; maxZ: number };
	width: number;
	depth: number;
};

export const DESK_SPACING = { x: 3.6, z: 4.0 } as const;
export const SEAT_OFFSET_Z = -0.55;
export const SLOTS_PER_ZONE = 8;
export const ROOM_GAP = 1.4;
export const MAX_ROOM_ROW_WIDTH = 26;
export const ROOM_PAD_RIGHT = 0.9;
export const ROOM_FRONT_PAD = 0.4;
export const DOOR_WIDTH = 1.6;
export const OFFICE_DOOR_WIDTH = 1.4;
export const WALL_HEIGHT = 2.4;
export const HALL_WIDTH = 0.9;
const SIDE_GAP = 1.2;

export type Anchor = { kind: 'desk'; id: string } | { kind: 'slot'; zone: ZoneId; index: number };

const ring = (center: Vec2, radius: number, count: number, start = 0): Slot[] =>
	Array.from({ length: count }, (_, index) => {
		const angle = start + (index / count) * Math.PI * 2;
		const position = {
			x: center.x + Math.sin(angle) * radius,
			z: center.z + Math.cos(angle) * radius,
		};
		return { position, heading: Math.atan2(center.x - position.x, center.z - position.z) };
	});

type Draft = {
	team: LayoutTeam;
	lead: string | null;
	staff: string[];
	cols: number;
	rowsTotal: number;
	width: number;
	depth: number;
};

function draftRoom(team: LayoutTeam): Draft {
	const lead = team.leadId && team.memberIds.includes(team.leadId) ? team.leadId : null;
	const staff = team.memberIds.filter((id) => id !== lead);
	const wide = lead === null ? 6 : 4;
	const cols =
		staff.length === 0 ? 1 : Math.min(wide, Math.max(2, Math.ceil(Math.sqrt(staff.length * 1.6))));
	const rows = staff.length === 0 ? 0 : Math.ceil(staff.length / cols);
	const rowsTotal = Math.max(1, rows + (lead ? 1 : 0));
	return {
		team,
		lead,
		staff,
		cols,
		rowsTotal,
		width: cols * DESK_SPACING.x + ROOM_PAD_RIGHT,
		depth: rowsTotal * DESK_SPACING.z + (lead ? ROOM_FRONT_PAD : 0),
	};
}

/**
 * Teams stand side by side, each in its own room. A team with a lead gets glass walls and a private
 * office for the lead at the back. Lanes run between the desk columns and stay free of walls, so a
 * walk never crosses a wall except through a door.
 */
/** Fill rows left to right. A room starts a new row when it would make the row too wide. */
function packRows(drafts: Draft[]): Draft[][] {
	const rows: Draft[][] = [];
	let current: Draft[] = [];
	let used = 0;
	for (const draft of drafts) {
		const fits = current.length > 0 && used + ROOM_GAP + draft.width <= MAX_ROOM_ROW_WIDTH;
		if (current.length > 0 && !fits) {
			rows.push(current);
			current = [];
			used = 0;
		}
		used = current.length === 0 ? draft.width : used + ROOM_GAP + draft.width;
		current.push(draft);
	}
	if (current.length > 0) rows.push(current);
	return rows;
}

/**
 * Teams stand in rows, each team in its own room. Rows follow the reporting tree from the top, with a
 * hallway between rows. Every room opens its door onto the hallway below it, and a free column at the
 * left edge joins all hallways, so a walk never crosses a wall except through a door.
 */
export function buildLayout(teams: LayoutTeam[]): OfficeLayout {
	const rows = packRows(teams.map(draftRoom));
	const rowWidth = (row: Draft[]) =>
		row.reduce((sum, draft) => sum + draft.width, 0) + ROOM_GAP * Math.max(0, row.length - 1);
	const rowDepth = (row: Draft[]) => Math.max(DESK_SPACING.z, ...row.map(({ depth }) => depth));
	const maxRowWidth = Math.max(0, ...rows.map(rowWidth));
	const totalDepth = rows.reduce(
		(sum, row, index) => sum + rowDepth(row) + (index < rows.length - 1 ? HALL_WIDTH : 0),
		0,
	);
	const bottom = totalDepth / 2;
	const corridorZ = bottom + 1.4;
	const sideX = -maxRowWidth / 2 - SIDE_GAP;
	const width = Math.max(maxRowWidth + 3, 26);
	const zoneZ = bottom + 6.4;

	const desks = new Map<string, DeskPlace>();
	const rooms: RoomPlace[] = [];
	const hallways: OfficeLayout['hallways'] = [];
	let top = -totalDepth / 2;
	rows.forEach((row, index) => {
		const depth = rowDepth(row);
		const maxZ = top + depth;
		const isLast = index === rows.length - 1;
		const hallZ = isLast ? corridorZ : maxZ + HALL_WIDTH / 2;
		hallways.push({
			center: { x: (sideX + maxRowWidth / 2) / 2, z: hallZ },
			width: maxRowWidth / 2 - sideX,
			depth: HALL_WIDTH,
		});
		let x = -rowWidth(row) / 2;
		for (const draft of row) {
			const x0 = x;
			const x1 = x0 + draft.width;
			x = x1 + ROOM_GAP;
			const deskX = (column: number) => x0 + column * DESK_SPACING.x + DESK_SPACING.x / 2;
			const place = (id: string, column: number, deskRow: number) => {
				const deskZ = top + deskRow * DESK_SPACING.z + 2.0;
				desks.set(id, {
					id,
					room: draft.team.id,
					root: { x: deskX(column), z: deskZ },
					seat: { x: deskX(column), z: deskZ + SEAT_OFFSET_Z },
					laneX: deskX(column) + DESK_SPACING.x / 2,
					aisleZ: deskZ + 1.9,
					row: deskRow,
					column,
				});
			};

			const leadColumn = Math.floor((draft.cols - 1) / 2);
			if (draft.lead) place(draft.lead, leadColumn, 0);
			const first = draft.lead ? 1 : 0;
			draft.staff.forEach((id, staffIndex) =>
				place(id, staffIndex % draft.cols, first + Math.floor(staffIndex / draft.cols)),
			);

			let office: RoomPlace['office'] = null;
			if (draft.lead) {
				const leadDesk = deskX(leadColumn);
				office = {
					leadId: draft.lead,
					bounds: {
						minX: leadDesk - DESK_SPACING.x / 2,
						maxX: Math.min(x1, leadDesk + DESK_SPACING.x / 2 + 0.9),
						minZ: top,
						maxZ: top + DESK_SPACING.z,
					},
					door: { x: leadDesk + DESK_SPACING.x / 2, z: top + DESK_SPACING.z },
				};
			}
			const lastRoot = top + (draft.rowsTotal - 1) * DESK_SPACING.z + 2.0;
			rooms.push({
				id: draft.team.id,
				row: index,
				walled: draft.lead !== null,
				bounds: { minX: x0, maxX: x1, minZ: top, maxZ },
				door: { x: x0 + draft.cols * DESK_SPACING.x, z: maxZ },
				frontAisleZ: lastRoot + 1.9,
				hallZ,
				corridorZ: hallZ,
				office,
			});
		}
		top = maxZ + HALL_WIDTH;
	});
	hallways.push({ center: { x: sideX, z: 0 }, width: SIDE_GAP, depth: totalDepth });

	const reviewCenter = { x: -width / 3, z: zoneZ };
	const loungeCenter = { x: width / 3, z: zoneZ };
	const boardCenter = { x: 0, z: zoneZ + 2.9 };
	const boardSlots: Slot[] = Array.from({ length: SLOTS_PER_ZONE }, (_, index) => ({
		position: { x: (index - (SLOTS_PER_ZONE - 1) / 2) * 0.95, z: zoneZ + 1.1 },
		heading: 0,
	})).sort((a, b) => Math.abs(a.position.x) - Math.abs(b.position.x));

	return {
		desks,
		rooms,
		roomById: new Map(rooms.map((room) => [room.id, room])),
		sideX,
		deskOrder: rooms.flatMap((room) => {
			const ids = [...desks.values()].filter((desk) => desk.room === room.id);
			return ids.map(({ id }) => id);
		}),
		columns: Math.max(2, Math.ceil(maxRowWidth / DESK_SPACING.x)),
		rows: rows.length,
		corridorZ,
		roomsWidth: maxRowWidth,
		sideCorridorX: sideX,
		hallways,
		zones: {
			review: { center: reviewCenter, slots: ring(reviewCenter, 1.95, SLOTS_PER_ZONE, 0.4) },
			blocked: { center: { x: 0, z: zoneZ + 1.6 }, slots: boardSlots },
			lounge: { center: loungeCenter, slots: ring(loungeCenter, 2.15, SLOTS_PER_ZONE, 0.2) },
		},
		boardCenter,
		floor: {
			minX: -width / 2 - 1.5,
			maxX: width / 2 + 1.5,
			minZ: -totalDepth / 2 - 3.8,
			maxZ: zoneZ + 5.2,
		},
		width,
		depth: totalDepth,
	};
}

/** Every glass wall, split around doors. The renderer draws these and the tests walk against them. */
export function wallSegments(layout: OfficeLayout): WallSegment[] {
	const segments: WallSegment[] = [];
	const add = (
		room: string,
		kind: WallSegment['kind'],
		ax: number,
		az: number,
		bx: number,
		bz: number,
	) => {
		if (Math.hypot(bx - ax, bz - az) > 0.05)
			segments.push({ room, kind, a: { x: ax, z: az }, b: { x: bx, z: bz } });
	};
	const front = (room: string, kind: WallSegment['kind'], box: Box, doorX: number, gap: number) => {
		add(room, kind, box.minX, box.maxZ, doorX - gap / 2, box.maxZ);
		add(room, kind, doorX + gap / 2, box.maxZ, box.maxX, box.maxZ);
	};
	for (const room of layout.rooms) {
		if (!room.walled) continue;
		const { bounds: b } = room;
		add(room.id, 'room', b.minX, b.minZ, b.maxX, b.minZ);
		add(room.id, 'room', b.minX, b.minZ, b.minX, b.maxZ);
		add(room.id, 'room', b.maxX, b.minZ, b.maxX, b.maxZ);
		front(room.id, 'room', b, room.door.x, DOOR_WIDTH);
		if (room.office) {
			const o = room.office.bounds;
			if (o.minX > b.minX + 0.05) add(room.id, 'office', o.minX, o.minZ, o.minX, o.maxZ);
			if (o.maxX < b.maxX - 0.05) add(room.id, 'office', o.maxX, o.minZ, o.maxX, o.maxZ);
			front(room.id, 'office', o, room.office.door.x, OFFICE_DOOR_WIDTH);
		}
	}
	return segments;
}

export function anchorPosition(
	layout: OfficeLayout,
	anchor: Anchor,
): { position: Vec2; heading: number } {
	if (anchor.kind === 'desk') {
		const desk = layout.desks.get(anchor.id);
		return { position: desk?.seat ?? { x: 0, z: 0 }, heading: 0 };
	}
	const slot = layout.zones[anchor.zone].slots[anchor.index];
	return slot
		? { position: slot.position, heading: slot.heading }
		: { position: { x: 0, z: 0 }, heading: 0 };
}

const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3;

/**
 * Walk between two resting places along the lanes: out of the chair to the side lane, down the lane
 * to the front aisle of the room, through the door to the corridor, then to the target. Inside one
 * room the walk stays on the lanes and the aisles and never leaves through the door.
 */
export function routeBetween(layout: OfficeLayout, from: Anchor, to: Anchor): Vec2[] {
	const origin = anchorPosition(layout, from).position;
	const destination = anchorPosition(layout, to).position;

	const leave = (anchor: Anchor): Vec2[] => {
		if (anchor.kind === 'slot') {
			return [
				{ x: anchorPosition(layout, anchor).position.x, z: layout.corridorZ },
				{ x: layout.sideX, z: layout.corridorZ },
			];
		}
		const desk = layout.desks.get(anchor.id);
		const room = desk ? layout.roomById.get(desk.room) : undefined;
		if (!desk || !room) return [];
		return [
			{ x: desk.laneX, z: desk.seat.z },
			{ x: desk.laneX, z: room.frontAisleZ },
			{ x: room.door.x, z: room.frontAisleZ },
			{ x: room.door.x, z: room.hallZ },
			{ x: layout.sideX, z: room.hallZ },
			{ x: layout.sideX, z: layout.corridorZ },
		];
	};
	const enter = (anchor: Anchor): Vec2[] => leave(anchor).reverse();

	if (from.kind === 'desk' && to.kind === 'desk' && from.id === to.id) return [];

	const a = from.kind === 'desk' ? layout.desks.get(from.id) : undefined;
	const b = to.kind === 'desk' ? layout.desks.get(to.id) : undefined;
	let points: Vec2[];
	const shared = a !== undefined && b !== undefined ? a.room === b.room : false;
	if (a && b && shared && a.row === b.row) {
		points = [
			{ x: a.laneX, z: a.seat.z },
			{ x: a.laneX, z: a.aisleZ },
			{ x: b.laneX, z: b.aisleZ },
			{ x: b.laneX, z: b.seat.z },
			destination,
		];
	} else if (a && b && shared) {
		const front = layout.roomById.get(a.room)?.frontAisleZ ?? a.aisleZ;
		points = [
			{ x: a.laneX, z: a.seat.z },
			{ x: a.laneX, z: front },
			{ x: b.laneX, z: front },
			{ x: b.laneX, z: b.seat.z },
			destination,
		];
	} else {
		points = [...leave(from), ...enter(to), destination];
	}

	const path: Vec2[] = [];
	let previous = origin;
	for (const point of points) {
		if (!same(point, previous)) {
			path.push(point);
			previous = point;
		}
	}
	return path;
}

export function pathLength(from: Vec2, path: Vec2[]): number {
	let total = 0;
	let previous = from;
	for (const point of path) {
		total += Math.hypot(point.x - previous.x, point.z - previous.z);
		previous = point;
	}
	return total;
}
