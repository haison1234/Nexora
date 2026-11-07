import {
	buildLayout,
	DESK_SPACING,
	MAX_ROOM_ROW_WIDTH,
	routeBetween,
	wallSegments,
	type Anchor,
	type LayoutTeam,
	type OfficeLayout,
	type Vec2,
} from './layout';

const team = (id: string, lead: string | null, staff: number): LayoutTeam => ({
	id,
	leadId: lead,
	memberIds: [...(lead ? [lead] : []), ...Array.from({ length: staff }, (_, i) => `${id}-s${i}`)],
});

function crosses(p: Vec2, q: Vec2, a: Vec2, b: Vec2) {
	const orient = (o: Vec2, u: Vec2, v: Vec2) =>
		(u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x);
	const d1 = orient(p, q, a);
	const d2 = orient(p, q, b);
	const d3 = orient(a, b, p);
	const d4 = orient(a, b, q);
	return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

function firstWallHit(layout: OfficeLayout, origin: Vec2, path: Vec2[]) {
	const walls = wallSegments(layout);
	let previous = origin;
	for (const point of path) {
		const hit = walls.find((wall) => crosses(previous, point, wall.a, wall.b));
		if (hit) return { hit, from: previous, to: point };
		previous = point;
	}
	return null;
}

const sample = () =>
	buildLayout([team('ceo', 'ceo', 7), team('ops', 'ops', 3), team('__independent', null, 4)]);

describe('team rooms', () => {
	it('puts each team in its own room, without overlap', () => {
		const layout = sample();
		expect(layout.rooms.map(({ id }) => id)).toEqual(['ceo', 'ops', '__independent']);
		for (let i = 0; i < layout.rooms.length; i++) {
			for (let j = i + 1; j < layout.rooms.length; j++) {
				const a = layout.rooms[i].bounds;
				const b = layout.rooms[j].bounds;
				const apart = a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ;
				expect(apart).toBe(true);
			}
		}
	});

	it('walls a team that has a lead and leaves members without a team in an open area', () => {
		const layout = sample();
		expect(layout.roomById.get('ceo')?.walled).toBe(true);
		expect(layout.roomById.get('ops')?.walled).toBe(true);
		expect(layout.roomById.get('__independent')?.walled).toBe(false);
		const rooms = new Set(wallSegments(layout).map(({ room }) => room));
		expect(rooms).toEqual(new Set(['ceo', 'ops']));
	});

	it('keeps every desk inside its room and gives the lead a private office at the back', () => {
		const layout = sample();
		for (const desk of layout.desks.values()) {
			const room = layout.roomById.get(desk.room)!;
			expect(desk.root.x).toBeGreaterThan(room.bounds.minX);
			expect(desk.root.x).toBeLessThan(room.bounds.maxX);
			expect(desk.root.z).toBeGreaterThan(room.bounds.minZ);
			expect(desk.root.z).toBeLessThan(room.bounds.maxZ);
		}
		const room = layout.roomById.get('ceo')!;
		const lead = layout.desks.get('ceo')!;
		const office = room.office!;
		expect(office.leadId).toBe('ceo');
		expect(lead.root.x).toBeGreaterThan(office.bounds.minX);
		expect(lead.root.x).toBeLessThan(office.bounds.maxX);
		expect(lead.root.z).toBeLessThan(office.bounds.maxZ);
		for (const id of room.office ? layout.deskOrder : []) {
			if (id === 'ceo' || layout.desks.get(id)!.room !== 'ceo') continue;
			expect(layout.desks.get(id)!.root.z).toBeGreaterThan(office.bounds.maxZ);
		}
	});

	it('aligns the office door and the room door with a walking lane', () => {
		const layout = sample();
		const lead = layout.desks.get('ceo')!;
		const room = layout.roomById.get('ceo')!;
		expect(room.office!.door.x).toBeCloseTo(lead.laneX);
		const lanes = [...layout.desks.values()]
			.filter((desk) => desk.room === 'ceo')
			.map((desk) => desk.laneX);
		expect(lanes.some((lane) => Math.abs(lane - room.door.x) < 1e-6)).toBe(true);
		expect(room.door.x).toBeLessThan(room.bounds.maxX);
		expect(DESK_SPACING.x).toBeGreaterThan(0);
	});

	it('handles an empty office and a team with only a lead', () => {
		expect(buildLayout([]).rooms).toEqual([]);
		const alone = buildLayout([team('solo', 'solo', 0)]);
		expect(alone.desks.has('solo')).toBe(true);
		expect(alone.roomById.get('solo')?.office).not.toBeNull();
	});

	it('wraps a wide organization into rows with connected hallways and clear room bounds', () => {
		const teams = Array.from({ length: 14 }, (_, index) =>
			team(`team-${index}`, `lead-${index}`, 2),
		);
		const layout = buildLayout(teams);
		const rows = [...new Set(layout.rooms.map(({ row }) => row))];

		expect(layout.rows).toBeGreaterThan(1);
		expect(rows).toHaveLength(layout.rows);
		expect(layout.roomsWidth).toBeLessThanOrEqual(MAX_ROOM_ROW_WIDTH);
		for (const row of rows) {
			const rooms = layout.rooms.filter((room) => room.row === row);
			const sorted = [...rooms].sort((a, b) => a.bounds.minX - b.bounds.minX);
			for (let index = 1; index < sorted.length; index++) {
				expect(sorted[index].bounds.minX).toBeGreaterThanOrEqual(sorted[index - 1].bounds.maxX);
			}
			for (const room of rooms) {
				expect(
					layout.hallways.some(
						({ center, depth }) => depth === 0.9 && Math.abs(center.z - room.corridorZ) < 1e-6,
					),
				).toBe(true);
			}
		}

		const slot: Anchor = { kind: 'slot', zone: 'review', index: 3 };
		for (const id of layout.deskOrder) {
			const origin = layout.desks.get(id)!.seat;
			const path = routeBetween(layout, { kind: 'desk', id }, slot);
			expect(firstWallHit(layout, origin, path), `route from ${id}`).toBeNull();
			expect(path).toContainEqual({
				x: layout.sideCorridorX,
				z: layout.roomById.get(layout.desks.get(id)!.room)!.corridorZ,
			});
		}
	});
});

describe('walking between rooms', () => {
	const layout = sample();
	const desks = layout.deskOrder.map((id): Anchor => ({ kind: 'desk', id }));
	const slots: Anchor[] = (['review', 'blocked', 'lounge'] as const).flatMap((zone) =>
		[0, 3, 7].map((index): Anchor => ({ kind: 'slot', zone, index })),
	);
	const place = (anchor: Anchor) =>
		anchor.kind === 'desk'
			? layout.desks.get(anchor.id)!.seat
			: layout.zones[anchor.zone].slots[anchor.index].position;

	it('never crosses a glass wall between any two desks', () => {
		for (const from of desks) {
			for (const to of desks) {
				const path = routeBetween(layout, from, to);
				const hit = firstWallHit(layout, place(from), path);
				expect(hit, JSON.stringify({ from, to, hit })).toBeNull();
			}
		}
	});

	it('never crosses a glass wall going to or from a shared area', () => {
		for (const desk of desks) {
			for (const slot of slots) {
				expect(firstWallHit(layout, place(desk), routeBetween(layout, desk, slot))).toBeNull();
				expect(firstWallHit(layout, place(slot), routeBetween(layout, slot, desk))).toBeNull();
			}
		}
	});

	it('ends every walk at the target place', () => {
		for (const from of desks.slice(0, 6)) {
			for (const to of slots) {
				const path = routeBetween(layout, from, to);
				const last = path.at(-1)!;
				expect(last.x).toBeCloseTo(place(to).x);
				expect(last.z).toBeCloseTo(place(to).z);
			}
		}
	});

	it('keeps a walk inside the room when both desks share it', () => {
		const room = layout.roomById.get('ceo')!;
		const a: Anchor = { kind: 'desk', id: 'ceo-s0' };
		const b: Anchor = { kind: 'desk', id: 'ceo-s6' };
		for (const point of routeBetween(layout, a, b)) {
			expect(point.z).toBeLessThanOrEqual(room.bounds.maxZ);
		}
	});

	it('lets the lead leave the office through its door', () => {
		const path = routeBetween(
			layout,
			{ kind: 'desk', id: 'ceo' },
			{ kind: 'slot', zone: 'lounge', index: 0 },
		);
		expect(path.length).toBeGreaterThan(2);
		expect(firstWallHit(layout, layout.desks.get('ceo')!.seat, path)).toBeNull();
	});

	it('would catch a wall crossing: a straight line between two rooms is detected', () => {
		const from = layout.desks.get('ceo-s0')!.seat;
		const to = layout.desks.get('ops-s0')!.seat;
		expect(firstWallHit(layout, from, [to])).not.toBeNull();
	});
});
