/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type { Bone, RobotHandle, Rig } from './robots';

export type PoseName = 'sit-work' | 'sit-idle' | 'stand' | 'walk' | 'review' | 'blocked' | 'lounge';

type Euler3 = [number, number, number];
type Angles = Record<Bone, Euler3>;

const BONES: Bone[] = [
	'body',
	'spine',
	'head',
	'lHip',
	'lKnee',
	'rHip',
	'rKnee',
	'lShoulder',
	'lElbow',
	'rShoulder',
	'rElbow',
];

export type AnimState = { values: Angles; bodyY: number; phase: number };

const blank = (): Angles =>
	Object.fromEntries(BONES.map((bone) => [bone, [0, 0, 0] as Euler3])) as Angles;

export const sitHeight = (rig: Rig) => rig.shin + 0.12;

export function createAnimState(rig: Rig): AnimState {
	return { values: blank(), bodyY: rig.hipY, phase: 0 };
}

const target = blank();

/**
 * Pose a robot toward `pose`. `animated` false gives the same pose without motion (reduced motion
 * or stale data): it never fakes work. `walk` is a phase in radians from the movement system.
 */
export function pose(
	state: AnimState,
	handle: RobotHandle,
	name: PoseName,
	seconds: number,
	dt: number,
	animated: boolean,
	walk: number,
) {
	const rig = handle.rig;
	const t = seconds + state.phase;
	for (const bone of BONES) target[bone][0] = target[bone][1] = target[bone][2] = 0;
	let bodyY = rig.hipY;
	const sway = animated ? Math.sin(t * 1.5) : 0;

	// Resting arms hang slightly away from the body.
	target.lShoulder[2] = -0.08;
	target.rShoulder[2] = 0.08;
	target.spine[0] = 0.012 * sway;

	const sit = () => {
		bodyY = sitHeight(rig);
		target.lHip[0] = target.rHip[0] = -1.5;
		target.lHip[2] = -0.05;
		target.rHip[2] = 0.05;
		target.lKnee[0] = target.rKnee[0] = 1.5;
	};

	switch (name) {
		case 'sit-work': {
			sit();
			target.spine[0] = 0.1;
			target.head[0] = 0.14;
			target.lShoulder[0] = target.rShoulder[0] = -0.95;
			target.lShoulder[2] = -0.04;
			target.rShoulder[2] = 0.04;
			target.lElbow[0] = target.rElbow[0] = -1.0;
			if (animated) {
				target.lElbow[0] += Math.sin(t * 9) * 0.12;
				target.rElbow[0] += Math.sin(t * 9 + 2.1) * 0.12;
				target.head[0] += Math.sin(t * 2.2) * 0.03;
				target.head[1] = Math.sin(t * 0.9) * 0.06;
			}
			break;
		}
		case 'sit-idle': {
			sit();
			target.spine[0] = 0.04;
			target.lShoulder[0] = target.rShoulder[0] = -0.5;
			target.lElbow[0] = target.rElbow[0] = -0.9;
			target.head[1] = animated ? Math.sin(t * 0.6) * 0.08 : 0;
			break;
		}
		case 'walk': {
			const stride = animated ? Math.sin(walk) : 0;
			bodyY = rig.hipY + Math.abs(stride) * 0.03;
			target.lHip[0] = stride * 0.65;
			target.rHip[0] = -stride * 0.65;
			target.lKnee[0] = Math.max(0, -stride) * 0.9;
			target.rKnee[0] = Math.max(0, stride) * 0.9;
			target.lShoulder[0] = -stride * 0.5;
			target.rShoulder[0] = stride * 0.5;
			target.lElbow[0] = target.rElbow[0] = -0.3;
			target.spine[0] = 0.05;
			break;
		}
		case 'review': {
			target.head[0] = 0.18;
			target.rShoulder[0] = -1.1;
			target.rElbow[0] = -1.25 + (animated ? Math.sin(t * 5) * 0.08 : 0);
			target.lShoulder[0] = -0.3;
			target.lElbow[0] = -0.5;
			target.head[1] = animated ? Math.sin(t * 0.8) * 0.15 : 0;
			break;
		}
		case 'blocked': {
			target.rShoulder[0] = -2.55;
			target.rElbow[0] = -0.95;
			target.head[0] = 0.08;
			target.head[1] = animated ? Math.sin(t * 3) * 0.28 : 0;
			target.lShoulder[2] = -0.12;
			break;
		}
		case 'lounge': {
			target.rShoulder[0] = -0.85;
			target.rElbow[0] = -1.4;
			target.lShoulder[2] = -0.14;
			target.head[1] = animated ? Math.sin(t * 0.5) * 0.18 : 0;
			target.spine[2] = animated ? Math.sin(t * 0.7) * 0.02 : 0;
			break;
		}
		default:
			target.head[1] = animated ? Math.sin(t * 0.5) * 0.1 : 0;
			break;
	}

	// Walking blends fast, everything else eases.
	const k = 1 - Math.exp(-dt * (name === 'walk' ? 16 : 9));
	for (const bone of BONES) {
		const current = state.values[bone];
		current[0] += (target[bone][0] - current[0]) * k;
		current[1] += (target[bone][1] - current[1]) * k;
		current[2] += (target[bone][2] - current[2]) * k;
		if (bone !== 'body') handle.bones[bone].rotation.set(current[0], current[1], current[2]);
	}
	state.bodyY += (bodyY - state.bodyY) * k;
	handle.bones.body.position.y = state.bodyY;
}
