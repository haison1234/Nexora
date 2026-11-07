/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type { OfficeCharacter, OfficeStatus } from '../office-model';
import {
	anchorPosition,
	routeBetween,
	SLOTS_PER_ZONE,
	type Anchor,
	type OfficeLayout,
	type Vec2,
	type ZoneId,
} from './layout';
import type { PoseName } from './animator';

export const WALK_SPEED = 2.1;
const TURN_SPEED = 9;

export type AgentMotion = {
	id: string;
	position: Vec2;
	heading: number;
	/** The place the agent is at, or heading to the end of its current path. */
	anchor: Anchor;
	path: Vec2[];
	finalHeading: number;
	status: OfficeStatus;
	walkPhase: number;
};

/** Where an agent belongs for a real status. The scene never invents work, it only places agents. */
export function zoneFor(status: OfficeStatus): ZoneId | 'desk' {
	switch (status) {
		case 'review':
			return 'review';
		case 'blocked':
			return 'blocked';
		case 'idle':
			return 'lounge';
		default:
			return 'desk';
	}
}

export function poseFor(motion: AgentMotion): PoseName {
	if (motion.path.length > 0) return 'walk';
	if (motion.anchor.kind === 'desk') return motion.status === 'working' ? 'sit-work' : 'sit-idle';
	if (motion.anchor.zone === 'review') return 'review';
	if (motion.anchor.zone === 'blocked') return 'blocked';
	return 'lounge';
}

const turnToward = (from: number, to: number, maxStep: number) => {
	let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (diff < -Math.PI) diff += Math.PI * 2;
	return from + Math.max(-maxStep, Math.min(maxStep, diff));
};

export class OfficeMotion {
	readonly agents = new Map<string, AgentMotion>();
	private readonly slots: Record<ZoneId, Map<number, string>> = {
		review: new Map(),
		blocked: new Map(),
		lounge: new Map(),
	};

	constructor(private readonly layout: OfficeLayout) {}

	private freeSlot(zone: ZoneId, id: string): number | null {
		const taken = this.slots[zone];
		for (const [index, owner] of taken) if (owner === id) return index;
		for (let index = 0; index < SLOTS_PER_ZONE; index++) if (!taken.has(index)) return index;
		return null;
	}

	private release(id: string) {
		for (const zone of Object.values(this.slots)) {
			for (const [index, owner] of zone) if (owner === id) zone.delete(index);
		}
	}

	private desired(character: OfficeCharacter): Anchor {
		const zone = zoneFor(character.status);
		if (zone !== 'desk') {
			const index = this.freeSlot(zone, character.memberId);
			if (index !== null) {
				this.release(character.memberId);
				this.slots[zone].set(index, character.memberId);
				return { kind: 'slot', zone, index };
			}
		}
		this.release(character.memberId);
		return { kind: 'desk', id: character.memberId };
	}

	/**
	 * Give each agent its real destination. An agent still walking finishes that walk first, so
	 * a change in data never makes it cut through furniture.
	 */
	assign(characters: OfficeCharacter[], instant: boolean) {
		const present = new Set(characters.map(({ memberId }) => memberId));
		for (const id of [...this.agents.keys()]) {
			if (!present.has(id)) {
				this.agents.delete(id);
				this.release(id);
			}
		}
		for (const character of characters) {
			const want = this.desired(character);
			const existing = this.agents.get(character.memberId);
			const place = anchorPosition(this.layout, want);
			if (!existing) {
				this.agents.set(character.memberId, {
					id: character.memberId,
					position: { ...place.position },
					heading: place.heading,
					anchor: want,
					path: [],
					finalHeading: place.heading,
					status: character.status,
					walkPhase: 0,
				});
				continue;
			}
			existing.status = character.status;
			if (instant) {
				existing.position = { ...place.position };
				existing.heading = place.heading;
				existing.finalHeading = place.heading;
				existing.anchor = want;
				existing.path = [];
				continue;
			}
			if (existing.path.length > 0) continue;
			const same =
				existing.anchor.kind === want.kind &&
				(want.kind === 'desk'
					? existing.anchor.kind === 'desk' && existing.anchor.id === want.id
					: existing.anchor.kind === 'slot' &&
						existing.anchor.zone === want.zone &&
						existing.anchor.index === want.index);
			if (same) continue;
			existing.path = routeBetween(this.layout, existing.anchor, want);
			existing.anchor = want;
			existing.finalHeading = place.heading;
		}
	}

	/** Advance every walking agent. Returns true while anybody is still moving. */
	step(dt: number): boolean {
		let moving = false;
		for (const agent of this.agents.values()) {
			if (agent.path.length === 0) {
				agent.heading = turnToward(agent.heading, agent.finalHeading, TURN_SPEED * dt);
				continue;
			}
			moving = true;
			let budget = WALK_SPEED * dt;
			while (budget > 0 && agent.path.length > 0) {
				const next = agent.path[0];
				const dx = next.x - agent.position.x;
				const dz = next.z - agent.position.z;
				const distance = Math.hypot(dx, dz);
				if (distance > 1e-4) {
					agent.heading = turnToward(agent.heading, Math.atan2(dx, dz), TURN_SPEED * dt);
				}
				if (distance <= budget) {
					agent.position = { x: next.x, z: next.z };
					agent.path.shift();
					budget -= distance;
				} else {
					agent.position = {
						x: agent.position.x + (dx / distance) * budget,
						z: agent.position.z + (dz / distance) * budget,
					};
					budget = 0;
				}
			}
			agent.walkPhase += WALK_SPEED * dt * 4.2;
		}
		return moving;
	}
}
