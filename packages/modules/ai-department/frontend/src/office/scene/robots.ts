/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import type { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { OfficeStatus } from '../office-model';
import { Disposer, type Three } from './resources';
import { hashString } from './resources';

export type Archetype = 'commander' | 'scout' | 'planner' | 'builder' | 'tester' | 'reviewer';
export const ARCHETYPES: Archetype[] = [
	'commander',
	'scout',
	'planner',
	'builder',
	'tester',
	'reviewer',
];

export const STATUS_COLOR: Record<OfficeStatus, number> = {
	working: 0x22c55e,
	review: 0xf59e0b,
	waiting: 0xa78bfa,
	blocked: 0xef4444,
	queued: 0x3b82f6,
	idle: 0x64748b,
	unconfigured: 0x9ca3af,
	unavailable: 0x78716c,
};

const KEYWORDS: Array<[Archetype, RegExp]> = [
	['commander', /lead|head|chief|director|manager|ceo|cto|coo|captain|boss|trưởng|giám đốc/i],
	['reviewer', /review|editor|audit|approv|duyệt|biên tập/i],
	['tester', /\bqa\b|test|ops|quality|support|check|kiểm/i],
	['scout', /research|analy|data|scout|search|nghiên|phân tích/i],
	['planner', /plan|product|\bpm\b|strateg|market|schedul|kế hoạch/i],
	['builder', /engineer|dev|code|program|writer|design|build|content|kỹ sư|lập trình|viết/i],
];

/** Same role text always gives the same silhouette. Unknown roles fall back to a stable hash. */
export function archetypeFor(role: string, id: string): Archetype {
	for (const [archetype, pattern] of KEYWORDS) if (pattern.test(role)) return archetype;
	return ARCHETYPES[hashString(id) % ARCHETYPES.length];
}

export type Rig = {
	scale: number;
	hipY: number;
	thigh: number;
	shin: number;
	hipX: number;
	shoulderY: number;
	shoulderX: number;
	upperArm: number;
	forearm: number;
	headY: number;
	torsoW: number;
	torsoD: number;
	headW: number;
	headH: number;
};

const rig = (
	scale: number,
	hipY: number,
	leg: number,
	hipX: number,
	shoulderY: number,
	shoulderX: number,
	arm: number,
	headY: number,
	torsoW: number,
	torsoD: number,
	headW: number,
	headH: number,
): Rig => ({
	scale,
	hipY,
	thigh: leg,
	shin: leg,
	hipX,
	shoulderY,
	shoulderX,
	upperArm: arm,
	forearm: arm - 0.01,
	headY,
	torsoW,
	torsoD,
	headW,
	headH,
});

export const RIGS: Record<Archetype, Rig> = {
	commander: rig(1.12, 0.7, 0.31, 0.13, 0.5, 0.36, 0.26, 0.64, 0.6, 0.38, 0.44, 0.34),
	scout: rig(0.98, 0.66, 0.29, 0.11, 0.44, 0.29, 0.25, 0.58, 0.4, 0.32, 0.4, 0.38),
	planner: rig(1.0, 0.66, 0.29, 0.12, 0.46, 0.31, 0.25, 0.6, 0.46, 0.34, 0.42, 0.34),
	builder: rig(1.04, 0.66, 0.29, 0.13, 0.47, 0.34, 0.26, 0.61, 0.54, 0.38, 0.46, 0.36),
	tester: rig(0.96, 0.6, 0.26, 0.13, 0.42, 0.33, 0.23, 0.55, 0.52, 0.4, 0.44, 0.32),
	reviewer: rig(1.02, 0.7, 0.31, 0.11, 0.5, 0.29, 0.27, 0.64, 0.4, 0.3, 0.38, 0.4),
};

export type Bone =
	| 'body'
	| 'spine'
	| 'head'
	| 'lHip'
	| 'lKnee'
	| 'rHip'
	| 'rKnee'
	| 'lShoulder'
	| 'lElbow'
	| 'rShoulder'
	| 'rElbow';
type GeoKey = 'soft' | 'box' | 'limb' | 'sphere' | 'cyl' | 'cone' | 'torus';
type MatKey = 'shell' | 'paint' | 'joint' | 'visor' | 'glow';
type Tone = 'accent' | 'light' | 'status' | 'plain';
type V3 = readonly [number, number, number];
type Part = { g: GeoKey; m: MatKey; b: Bone; p: V3; s: V3; r?: V3; tone?: Tone };

const X90: V3 = [Math.PI / 2, 0, 0];
const Z90: V3 = [0, 0, Math.PI / 2];

function limb(bone: Bone, length: number, radius: number): Part {
	return {
		g: 'limb',
		m: 'shell',
		b: bone,
		p: [0, -length / 2, 0],
		s: [2 * radius, (length + radius) / 2.6, 2 * radius],
		tone: 'light',
	};
}

function commonParts(r: Rig): Part[] {
	const parts: Part[] = [
		{ g: 'cyl', m: 'joint', b: 'body', p: [0, 0, 0], s: [(r.hipX + 0.09) * 2, 0.13, 0.27] },
		{
			g: 'soft',
			m: 'shell',
			b: 'spine',
			p: [0, 0.3, 0],
			s: [r.torsoW, 0.55, r.torsoD],
			tone: 'accent',
		},
		{ g: 'cyl', m: 'joint', b: 'spine', p: [0, r.headY - 0.04, 0], s: [0.12, 0.1, 0.12] },
		{
			g: 'soft',
			m: 'shell',
			b: 'head',
			p: [0, 0.17, 0],
			s: [r.headW, r.headH, 0.38],
			tone: 'light',
		},
		{ g: 'soft', m: 'visor', b: 'head', p: [0, 0.17, 0.17], s: [r.headW - 0.06, 0.15, 0.06] },
		{
			g: 'box',
			m: 'glow',
			b: 'head',
			p: [0, 0.175, 0.205],
			s: [r.headW - 0.14, 0.035, 0.02],
			tone: 'accent',
		},
	];
	for (const side of ['l', 'r'] as const) {
		const hip = `${side}Hip` as Bone;
		const knee = `${side}Knee` as Bone;
		const shoulder = `${side}Shoulder` as Bone;
		const elbow = `${side}Elbow` as Bone;
		parts.push(
			limb(hip, r.thigh, 0.085),
			{ g: 'sphere', m: 'joint', b: knee, p: [0, 0, 0], s: [0.125, 0.125, 0.125] },
			limb(knee, r.shin, 0.078),
			{
				g: 'soft',
				m: 'paint',
				b: knee,
				p: [0, -r.shin - 0.035, 0.035],
				s: [0.17, 0.09, 0.28],
				tone: 'accent',
			},
			{ g: 'sphere', m: 'joint', b: shoulder, p: [0, 0, 0], s: [0.14, 0.14, 0.14] },
			limb(shoulder, r.upperArm, 0.066),
			{ g: 'sphere', m: 'joint', b: elbow, p: [0, 0, 0], s: [0.1, 0.1, 0.1] },
			limb(elbow, r.forearm, 0.062),
			{ g: 'sphere', m: 'joint', b: elbow, p: [0, -r.forearm - 0.02, 0], s: [0.11, 0.12, 0.11] },
		);
	}
	return parts;
}

function extraParts(kind: Archetype, r: Rig): Part[] {
	const antenna: Part[] = [
		{ g: 'cyl', m: 'joint', b: 'head', p: [0, 0.4, 0], s: [0.02, 0.2, 0.02] },
		{
			g: 'sphere',
			m: 'glow',
			b: 'head',
			p: [0, 0.51, 0],
			s: [0.075, 0.075, 0.075],
			tone: 'status',
		},
	];
	switch (kind) {
		case 'commander':
			return [
				{
					g: 'sphere',
					m: 'paint',
					b: 'spine',
					p: [-r.shoulderX - 0.01, r.shoulderY + 0.05, 0],
					s: [0.25, 0.17, 0.26],
					tone: 'accent',
				},
				{
					g: 'sphere',
					m: 'paint',
					b: 'spine',
					p: [r.shoulderX + 0.01, r.shoulderY + 0.05, 0],
					s: [0.25, 0.17, 0.26],
					tone: 'accent',
				},
				{
					g: 'soft',
					m: 'paint',
					b: 'spine',
					p: [0, 0.22, -0.21],
					r: [0.12, 0, 0],
					s: [0.58, 0.7, 0.045],
					tone: 'accent',
				},
				{
					g: 'cone',
					m: 'glow',
					b: 'head',
					p: [-0.11, 0.43, 0.04],
					s: [0.06, 0.14, 0.06],
					tone: 'accent',
				},
				{
					g: 'cone',
					m: 'glow',
					b: 'head',
					p: [0, 0.47, 0.06],
					s: [0.075, 0.22, 0.075],
					tone: 'status',
				},
				{
					g: 'cone',
					m: 'glow',
					b: 'head',
					p: [0.11, 0.43, 0.04],
					s: [0.06, 0.14, 0.06],
					tone: 'accent',
				},
			];
		case 'scout':
			return [
				...antenna,
				{
					g: 'soft',
					m: 'paint',
					b: 'spine',
					p: [0, 0.32, -0.2],
					s: [0.3, 0.34, 0.14],
					tone: 'light',
				},
				{
					g: 'cyl',
					m: 'paint',
					b: 'head',
					p: [0.085, 0.2, 0.25],
					r: X90,
					s: [0.15, 0.17, 0.15],
					tone: 'light',
				},
				{
					g: 'cyl',
					m: 'glow',
					b: 'head',
					p: [0.085, 0.2, 0.336],
					r: X90,
					s: [0.11, 0.015, 0.11],
					tone: 'accent',
				},
			];
		case 'planner':
			return [
				...antenna,
				{ g: 'soft', m: 'visor', b: 'lElbow', p: [0.02, -0.17, 0.1], s: [0.2, 0.28, 0.035] },
				{
					g: 'box',
					m: 'glow',
					b: 'lElbow',
					p: [0.02, -0.17, 0.122],
					s: [0.17, 0.24, 0.01],
					tone: 'accent',
				},
				{ g: 'cyl', m: 'paint', b: 'spine', p: [0, 0.55, 0], s: [0.3, 0.06, 0.26], tone: 'accent' },
			];
		case 'builder':
			return [
				...antenna.slice(1),
				{ g: 'box', m: 'joint', b: 'head', p: [0, 0.345, 0], s: [0.48, 0.025, 0.06] },
				{
					g: 'cyl',
					m: 'paint',
					b: 'head',
					p: [-0.23, 0.17, 0],
					r: Z90,
					s: [0.14, 0.05, 0.14],
					tone: 'accent',
				},
				{
					g: 'cyl',
					m: 'paint',
					b: 'head',
					p: [0.23, 0.17, 0],
					r: Z90,
					s: [0.14, 0.05, 0.14],
					tone: 'accent',
				},
				{
					g: 'cyl',
					m: 'joint',
					b: 'head',
					p: [-0.17, 0.08, 0.2],
					r: [1.3, 0, 0.3],
					s: [0.015, 0.18, 0.015],
				},
				{
					g: 'sphere',
					m: 'glow',
					b: 'head',
					p: [-0.14, 0.0, 0.29],
					s: [0.04, 0.04, 0.04],
					tone: 'status',
				},
			];
		case 'tester':
			return [
				{ g: 'cyl', m: 'joint', b: 'head', p: [-0.1, 0.4, 0], s: [0.02, 0.18, 0.02] },
				{ g: 'cyl', m: 'joint', b: 'head', p: [0.1, 0.4, 0], s: [0.02, 0.18, 0.02] },
				{
					g: 'sphere',
					m: 'glow',
					b: 'head',
					p: [-0.1, 0.51, 0],
					s: [0.06, 0.06, 0.06],
					tone: 'accent',
				},
				{
					g: 'sphere',
					m: 'glow',
					b: 'head',
					p: [0.1, 0.51, 0],
					s: [0.06, 0.06, 0.06],
					tone: 'status',
				},
				{ g: 'cyl', m: 'paint', b: 'spine', p: [0, 0.06, 0], s: [0.5, 0.08, 0.36], tone: 'accent' },
			];
		default:
			return [
				...antenna,
				{ g: 'torus', m: 'joint', b: 'head', p: [0.09, 0.19, 0.2], s: [0.14, 0.14, 0.14] },
				{
					g: 'cyl',
					m: 'glow',
					b: 'head',
					p: [0.09, 0.19, 0.201],
					r: X90,
					s: [0.11, 0.012, 0.11],
					tone: 'accent',
				},
				{ g: 'cyl', m: 'paint', b: 'spine', p: [0, 0.55, 0], s: [0.3, 0.05, 0.26], tone: 'light' },
				{
					g: 'cone',
					m: 'paint',
					b: 'spine',
					p: [-0.07, 0.48, 0.18],
					r: [0, 0, -Math.PI / 2],
					s: [0.1, 0.1, 0.06],
					tone: 'accent',
				},
				{
					g: 'cone',
					m: 'paint',
					b: 'spine',
					p: [0.07, 0.48, 0.18],
					r: [0, 0, Math.PI / 2],
					s: [0.1, 0.1, 0.06],
					tone: 'accent',
				},
			];
	}
}

export type RobotHandle = {
	id: string;
	archetype: Archetype;
	rig: Rig;
	root: ThreeTypes.Group;
	bones: Record<Bone, ThreeTypes.Object3D>;
	accent: ThreeTypes.Color;
	pick: ThreeTypes.Mesh;
	blob: ThreeTypes.Mesh;
};

export type Fleet = {
	group: ThreeTypes.Group;
	robots: Map<string, RobotHandle>;
	pickables: ThreeTypes.Object3D[];
	/** Copy bone transforms into the shared instanced meshes. Call once per frame after posing. */
	sync: () => void;
	setStatus: (id: string, status: OfficeStatus) => void;
	headWorld: (id: string, out: ThreeTypes.Vector3) => ThreeTypes.Vector3 | null;
	setBubble: (id: string, text: string | null, visible: boolean) => void;
};

type Placement = {
	mesh: ThreeTypes.InstancedMesh;
	index: number;
	bone: ThreeTypes.Object3D;
	local: ThreeTypes.Matrix4;
};

export function createFleet(
	T: Three,
	d: Disposer,
	Rounded: typeof RoundedBoxGeometry,
	members: Array<{ id: string; role: string }>,
	blobMap: ThreeTypes.Texture,
): Fleet {
	const group = new T.Group();
	const geometries: Record<GeoKey, ThreeTypes.BufferGeometry> = {
		soft: d.track(new Rounded(1, 1, 1, 3, 0.22)),
		box: d.track(new T.BoxGeometry(1, 1, 1)),
		limb: d.track(new T.CapsuleGeometry(0.5, 1.6, 4, 12)),
		sphere: d.track(new T.SphereGeometry(0.5, 16, 12)),
		cyl: d.track(new T.CylinderGeometry(0.5, 0.5, 1, 16)),
		cone: d.track(new T.ConeGeometry(0.5, 1, 14)),
		torus: d.track(new T.TorusGeometry(0.5, 0.09, 8, 32)),
	};
	const materials: Record<MatKey, ThreeTypes.Material> = {
		shell: d.track(
			new T.MeshStandardMaterial({
				color: '#ffffff',
				roughness: 0.34,
				metalness: 0.32,
				envMapIntensity: 0.9,
			}),
		),
		paint: d.track(
			new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.28 }),
		),
		joint: d.track(
			new T.MeshStandardMaterial({ color: '#2a3140', roughness: 0.4, metalness: 0.6 }),
		),
		visor: d.track(
			new T.MeshStandardMaterial({
				color: '#070b12',
				roughness: 0.1,
				metalness: 0.7,
				envMapIntensity: 1.4,
			}),
		),
		glow: d.track(new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })),
	};

	type Built = {
		handle: RobotHandle;
		parts: Array<{ part: Part; bone: ThreeTypes.Object3D }>;
		accent: ThreeTypes.Color;
	};
	const built: Built[] = members.map(({ id, role }) => {
		const archetype = archetypeFor(role, id);
		const r = RIGS[archetype];
		const root = new T.Group();
		root.scale.setScalar(r.scale);
		const node = (parent: ThreeTypes.Object3D, x: number, y: number, z: number) => {
			const object = new T.Object3D();
			object.position.set(x, y, z);
			parent.add(object);
			return object;
		};
		const body = node(root, 0, r.hipY, 0);
		const spine = node(body, 0, 0.06, 0);
		const bones = {
			body,
			spine,
			head: node(spine, 0, r.headY, 0),
			lHip: node(body, -r.hipX, 0, 0),
			rHip: node(body, r.hipX, 0, 0),
			lShoulder: node(spine, -r.shoulderX, r.shoulderY, 0),
			rShoulder: node(spine, r.shoulderX, r.shoulderY, 0),
		} as Record<Bone, ThreeTypes.Object3D>;
		bones.lKnee = node(bones.lHip, 0, -r.thigh, 0);
		bones.rKnee = node(bones.rHip, 0, -r.thigh, 0);
		bones.lElbow = node(bones.lShoulder, 0, -r.upperArm, 0);
		bones.rElbow = node(bones.rShoulder, 0, -r.upperArm, 0);

		const accent = new T.Color().setHSL((hashString(id) % 360) / 360, 0.62, 0.58);
		const pick = new T.Mesh(
			d.track(new T.CapsuleGeometry(0.46, 1.0, 2, 8)),
			d.track(new T.MeshBasicMaterial({ visible: false })),
		);
		pick.userData.memberId = id;
		const blob = new T.Mesh(
			d.track(new T.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2)),
			d.track(
				new T.MeshBasicMaterial({
					map: blobMap,
					color: '#000000',
					transparent: true,
					opacity: 0.45,
					depthWrite: false,
				}),
			),
		);
		blob.position.y = 0.012;
		group.add(root, pick, blob);
		return {
			handle: { id, archetype, rig: r, root, bones, accent, pick, blob },
			parts: [...commonParts(r), ...extraParts(archetype, r)].map((part) => ({
				part,
				bone: bones[part.b],
			})),
			accent,
		};
	});

	// One instanced mesh per (geometry, material) pair.
	const counts = new Map<string, number>();
	for (const item of built) {
		for (const { part } of item.parts) {
			const key = `${part.g}|${part.m}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	const meshes = new Map<string, ThreeTypes.InstancedMesh>();
	const used = new Map<string, number>();
	for (const [key, count] of counts) {
		const [g, m] = key.split('|') as [GeoKey, MatKey];
		const mesh = new T.InstancedMesh(geometries[g], materials[m], count);
		mesh.castShadow = m !== 'glow';
		mesh.receiveShadow = m !== 'glow';
		mesh.frustumCulled = false;
		meshes.set(key, mesh);
		group.add(mesh);
		d.track({ dispose: () => mesh.dispose() });
	}

	const placements: Placement[] = [];
	const perRobot = new Map<string, Placement[]>();
	const statusSlots = new Map<string, Array<{ mesh: ThreeTypes.InstancedMesh; index: number }>>();
	const bubbles = new Map<
		string,
		{ group: ThreeTypes.Group; disposer: Disposer; text: string; visible: boolean }
	>();
	const quaternion = new T.Quaternion();
	const euler = new T.Euler();
	const white = new T.Color('#ffffff');
	const lightTone = (accent: ThreeTypes.Color) => accent.clone().lerp(white, 0.84);

	for (const item of built) {
		const own: Placement[] = [];
		const statuses: Array<{ mesh: ThreeTypes.InstancedMesh; index: number }> = [];
		for (const { part, bone } of item.parts) {
			const key = `${part.g}|${part.m}`;
			const mesh = meshes.get(key)!;
			const index = used.get(key) ?? 0;
			used.set(key, index + 1);
			const [rx, ry, rz] = part.r ?? [0, 0, 0];
			quaternion.setFromEuler(euler.set(rx, ry, rz));
			const local = new T.Matrix4().compose(
				new T.Vector3(...part.p),
				quaternion,
				new T.Vector3(...part.s),
			);
			const placement = { mesh, index, bone, local };
			placements.push(placement);
			own.push(placement);
			const tone = part.tone ?? 'plain';
			if (part.m === 'joint' || part.m === 'visor') mesh.setColorAt(index, white);
			else if (tone === 'accent') mesh.setColorAt(index, item.accent);
			else if (tone === 'light') mesh.setColorAt(index, lightTone(item.accent));
			else if (tone === 'status') {
				mesh.setColorAt(index, new T.Color(STATUS_COLOR.idle));
				statuses.push({ mesh, index });
			} else mesh.setColorAt(index, white);
		}
		perRobot.set(item.handle.id, own);
		statusSlots.set(item.handle.id, statuses);
	}
	for (const mesh of meshes.values()) {
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}
	const bubbleGeometry = d.track(new T.BoxGeometry(1.8, 0.58, 0.035));
	const bubbleMaterial = d.track(
		new T.MeshBasicMaterial({
			color: '#eef2f7',
			transparent: true,
			opacity: 0.94,
			depthTest: false,
		}),
	);
	const bubbleTextGeometry = d.track(new T.PlaneGeometry(1.66, 0.42));

	const robots = new Map(built.map(({ handle }) => [handle.id, handle]));
	const world = new T.Matrix4();
	const color = new T.Color();

	return {
		group,
		robots,
		pickables: built.flatMap(({ handle }) => [handle.pick]),
		sync() {
			for (const { handle } of built) handle.root.updateMatrixWorld(true);
			for (const placement of placements) {
				world.multiplyMatrices(placement.bone.matrixWorld, placement.local);
				placement.mesh.setMatrixAt(placement.index, world);
			}
			for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true;
		},
		setStatus(id, status) {
			const slots = statusSlots.get(id);
			if (!slots) return;
			color.setHex(STATUS_COLOR[status]);
			for (const slot of slots) {
				slot.mesh.setColorAt(slot.index, color);
				if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
			}
		},
		headWorld(id, out) {
			const handle = robots.get(id);
			if (!handle) return null;
			handle.bones.head.getWorldPosition(out);
			out.y += 0.62 * handle.rig.scale;
			return out;
		},
		setBubble(id, text, visible) {
			const existing = bubbles.get(id);
			if (existing?.text === text) {
				existing.group.visible = visible;
				return;
			}
			if (existing) {
				existing.group.parent?.remove(existing.group);
				existing.disposer.disposeAll();
				bubbles.delete(id);
			}
			if (!text) return;
			const handle = robots.get(id);
			if (!handle) return;
			const bubbleDisposer = new Disposer();
			const canvas = document.createElement('canvas');
			canvas.width = 512;
			canvas.height = 128;
			const context = canvas.getContext('2d');
			if (!context) return;
			context.fillStyle = '#182131';
			context.font = '600 40px Inter, system-ui, sans-serif';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			const source = text.trim();
			const label = source.length > 32 ? `${source.slice(0, 31)}…` : source;
			context.fillText(label, 256, 64, 450);
			const texture = bubbleDisposer.track(new T.CanvasTexture(canvas));
			texture.colorSpace = T.SRGBColorSpace;
			const textMaterial = bubbleDisposer.track(
				new T.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }),
			);
			const bubble = new T.Group();
			const panel = new T.Mesh(bubbleGeometry, bubbleMaterial);
			panel.renderOrder = 10;
			const caption = new T.Mesh(bubbleTextGeometry, textMaterial);
			caption.position.z = 0.025;
			caption.renderOrder = 11;
			bubble.add(panel, caption);
			bubble.position.set(-0.5, 0.55, 0);
			bubble.scale.setScalar(handle.rig.scale);
			bubble.visible = visible;
			handle.bones.head.add(bubble);
			bubbles.set(id, { group: bubble, disposer: bubbleDisposer, text, visible });
		},
	};
}
