import type * as ThreeTypes from 'three';

export type Three = typeof ThreeTypes;

/** Collects GPU resources so one call frees all of them. */
export class Disposer {
	private items: Array<{ dispose: () => void }> = [];

	track<V extends { dispose: () => void }>(value: V): V {
		this.items.push(value);
		return value;
	}

	disposeAll() {
		for (const item of this.items.splice(0)) item.dispose();
	}
}

/** FNV-1a. Stable across runs, so a member always gets the same look. */
export function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** Small seeded generator for scenery that must not change between frames. */
export function seeded(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
