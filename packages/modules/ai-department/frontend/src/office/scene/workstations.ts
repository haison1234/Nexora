/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import type { OfficeCharacter, OfficeStatus } from '../office-model';
import type { OfficeLayout, ZoneId } from './layout';
import type { Disposer, Three } from './resources';
import { hashString } from './resources';
import { STATUS_COLOR } from './robots';

export type ZoneLabels = Record<ZoneId, string> & { board: string; empty: string };

export type Workstations = {
	group: ThreeTypes.Group;
	pickables: ThreeTypes.Object3D[];
	setStatus: (id: string, status: OfficeStatus) => void;
};

const TEAM_COLORS = ['#3b5bdb', '#0ca678', '#f08c00', '#d6336c', '#1c7ed6', '#7048e8'];

export function labelTexture(T: Three, d: Disposer, text: string, color: string) {
	const element = document.createElement('canvas');
	element.width = 512;
	element.height = 128;
	const context = element.getContext('2d');
	if (context) {
		context.clearRect(0, 0, 512, 128);
		context.font = '600 54px Inter, system-ui, sans-serif';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = color;
		context.globalAlpha = 0.85;
		context.fillText(text.toUpperCase(), 256, 64, 480);
	}
	const texture = d.track(new T.CanvasTexture(element));
	texture.colorSpace = T.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

function boardTexture(T: Three, d: Disposer, title: string, summary: string) {
	const element = document.createElement('canvas');
	element.width = 1024;
	element.height = 320;
	const context = element.getContext('2d');
	if (context) {
		context.fillStyle = '#10151f';
		context.fillRect(0, 0, 1024, 320);
		context.fillStyle = '#ef4444';
		context.fillRect(0, 0, 1024, 14);
		context.font = '700 44px Inter, system-ui, sans-serif';
		context.fillStyle = '#f2f5fa';
		context.textBaseline = 'middle';
		context.fillText(title.toUpperCase(), 36, 58, 600);
		context.font = '500 34px Inter, system-ui, sans-serif';
		context.fillStyle = 'rgba(238,242,247,0.72)';
		context.fillText(summary.toUpperCase(), 36, 170, 900);
	}
	const texture = d.track(new T.CanvasTexture(element));
	texture.colorSpace = T.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

export function createWorkstations(
	T: Three,
	d: Disposer,
	layout: OfficeLayout,
	characters: OfficeCharacter[],
	labels: ZoneLabels,
): Workstations {
	const group = new T.Group();
	const matrix = new T.Matrix4();
	const quaternion = new T.Quaternion();
	const unitY = new T.Vector3(0, 1, 0);
	const pickables: ThreeTypes.Object3D[] = [];

	const geometry = {
		box: d.track(new T.BoxGeometry(1, 1, 1)),
		cyl: d.track(new T.CylinderGeometry(0.5, 0.5, 1, 20)),
		plane: d.track(new T.PlaneGeometry(1, 1)),
		circle: d.track(new T.CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
	};
	const material = {
		top: d.track(
			new T.MeshStandardMaterial({ color: '#2b3548', roughness: 0.45, metalness: 0.25 }),
		),
		leg: d.track(new T.MeshStandardMaterial({ color: '#1a2130', roughness: 0.5, metalness: 0.5 })),
		chair: d.track(new T.MeshStandardMaterial({ color: '#3b4660', roughness: 0.7 })),
		dark: d.track(new T.MeshStandardMaterial({ color: '#0d121b', roughness: 0.4, metalness: 0.4 })),
		mug: d.track(new T.MeshStandardMaterial({ color: '#e8eef7', roughness: 0.5 })),
		screen: d.track(new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })),
		mat: d.track(
			new T.MeshStandardMaterial({
				color: '#ffffff',
				roughness: 1,
				transparent: true,
				opacity: 0.2,
				depthWrite: false,
			}),
		),
		sofa: d.track(new T.MeshStandardMaterial({ color: '#2d4a6b', roughness: 0.85 })),
		wood: d.track(new T.MeshStandardMaterial({ color: '#6b4f3a', roughness: 0.6 })),
	};

	const ids = layout.deskOrder;
	const count = ids.length;
	const teamIndex = new Map<string, number>();
	for (const character of characters) {
		if (!teamIndex.has(character.teamId)) teamIndex.set(character.teamId, teamIndex.size);
	}
	const teamOf = new Map(
		characters.map((item) => [item.memberId, teamIndex.get(item.teamId) ?? 0]),
	);

	function instances(
		geo: ThreeTypes.BufferGeometry,
		mat: ThreeTypes.Material,
		total: number,
		place: (
			index: number,
			set: (p: [number, number, number], s: [number, number, number], rotY?: number) => void,
		) => void,
		cast = true,
	) {
		const mesh = new T.InstancedMesh(geo, mat, Math.max(total, 1));
		mesh.count = total;
		for (let index = 0; index < total; index++) {
			place(index, (p, s, rotY = 0) => {
				quaternion.setFromAxisAngle(unitY, rotY);
				mesh.setMatrixAt(
					index,
					matrix.compose(new T.Vector3(...p), quaternion, new T.Vector3(...s)),
				);
			});
		}
		mesh.instanceMatrix.needsUpdate = true;
		mesh.castShadow = cast;
		mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		d.track({ dispose: () => mesh.dispose() });
		group.add(mesh);
		return mesh;
	}

	const desk = (index: number) => layout.desks.get(ids[index])!.root;
	const each =
		(
			parts: Array<{
				at: [number, number, number];
				scale: [number, number, number];
				rotY?: number;
			}>,
		) =>
		(
			index: number,
			set: (p: [number, number, number], s: [number, number, number], rotY?: number) => void,
		) => {
			const part = parts[index % parts.length];
			const root = desk(Math.floor(index / parts.length));
			set([root.x + part.at[0], part.at[1], root.z + part.at[2]], part.scale, part.rotY);
		};

	const per = (
		parts: Array<{ at: [number, number, number]; scale: [number, number, number]; rotY?: number }>,
	) => ({ total: count * parts.length, place: each(parts) });

	const top = per([{ at: [0, 0.75, 0.35], scale: [2.0, 0.08, 0.95] }]);
	instances(geometry.box, material.top, top.total, top.place);
	const legs = per([
		{ at: [-0.92, 0.37, 0.35], scale: [0.08, 0.72, 0.8] },
		{ at: [0.92, 0.37, 0.35], scale: [0.08, 0.72, 0.8] },
	]);
	instances(geometry.box, material.leg, legs.total, legs.place);
	const seats = per([{ at: [0, 0.34, -0.55], scale: [0.6, 0.08, 0.6] }]);
	instances(geometry.cyl, material.chair, seats.total, seats.place);
	const backs = per([{ at: [0, 0.62, -0.95], scale: [0.55, 0.5, 0.06] }]);
	instances(geometry.box, material.chair, backs.total, backs.place);
	const posts = per([{ at: [0, 0.17, -0.55], scale: [0.06, 0.3, 0.06] }]);
	instances(geometry.cyl, material.leg, posts.total, posts.place);
	const frames = per([
		{ at: [0, 1.1, 0.56], scale: [0.8, 0.5, 0.04] },
		{ at: [0, 0.9, 0.58], scale: [0.06, 0.2, 0.06] },
		{ at: [0, 0.8, 0.58], scale: [0.3, 0.02, 0.2] },
		{ at: [0, 0.8, 0.18], scale: [0.5, 0.02, 0.18] },
	]);
	instances(geometry.box, material.dark, frames.total, frames.place);
	const mugs = ids.map((id, index) => ({ id, index })).filter(({ id }) => hashString(id) % 2 === 0);
	instances(geometry.cyl, material.mug, mugs.length, (index, set) => {
		const root = desk(mugs[index].index);
		set([root.x + 0.7, 0.84, root.z + 0.3], [0.1, 0.12, 0.1]);
	});

	const screens = instances(
		geometry.plane,
		material.screen,
		count,
		(index, set) => {
			const root = desk(index);
			set([root.x, 1.1, root.z + 0.535], [0.72, 0.42, 1], Math.PI);
		},
		false,
	);
	const color = new T.Color();
	const indexOf = new Map(ids.map((id, index) => [id, index]));
	const setStatus = (id: string, status: OfficeStatus) => {
		const index = indexOf.get(id);
		if (index === undefined) return;
		const base = new T.Color(STATUS_COLOR[status]);
		const dim =
			status === 'idle' || status === 'unconfigured' || status === 'unavailable' ? 0.28 : 0.9;
		screens.setColorAt(index, color.copy(base).multiplyScalar(dim));
		if (screens.instanceColor) screens.instanceColor.needsUpdate = true;
	};
	for (const id of ids) setStatus(id, 'idle');

	const mats = new T.InstancedMesh(geometry.plane, material.mat, Math.max(count, 1));
	mats.count = count;
	const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
	ids.forEach((id, index) => {
		const root = desk(index);
		mats.setMatrixAt(
			index,
			matrix.compose(new T.Vector3(root.x, 0.014, root.z - 0.1), flat, new T.Vector3(2.9, 2.5, 1)),
		);
		mats.setColorAt(index, new T.Color(TEAM_COLORS[(teamOf.get(id) ?? 0) % TEAM_COLORS.length]));
	});
	mats.instanceMatrix.needsUpdate = true;
	if (mats.instanceColor) mats.instanceColor.needsUpdate = true;
	mats.receiveShadow = true;
	mats.frustumCulled = false;
	d.track({ dispose: () => mats.dispose() });
	group.add(mats);

	// Click targets for each desk.
	const hit = d.track(new T.BoxGeometry(2.2, 1.6, 2.4));
	const hitMaterial = d.track(new T.MeshBasicMaterial({ visible: false }));
	for (const id of ids) {
		const root = layout.desks.get(id)!.root;
		const proxy = new T.Mesh(hit, hitMaterial);
		proxy.position.set(root.x, 0.8, root.z - 0.2);
		proxy.userData.memberId = id;
		group.add(proxy);
		pickables.push(proxy);
	}

	// Shared areas.
	const { review, lounge, blocked } = layout.zones;
	const rug = (center: { x: number; z: number }, radius: number, hex: string, opacity: number) => {
		const mesh = new T.Mesh(
			geometry.circle,
			d.track(
				new T.MeshStandardMaterial({
					color: hex,
					roughness: 1,
					transparent: true,
					opacity,
					depthWrite: false,
				}),
			),
		);
		mesh.position.set(center.x, 0.012, center.z);
		mesh.scale.set(radius, 1, radius);
		mesh.receiveShadow = true;
		group.add(mesh);
	};
	rug(review.center, 3.1, '#f59e0b', 0.14);
	rug(lounge.center, 3.1, '#0ea5b7', 0.14);

	const solid = (
		geo: ThreeTypes.BufferGeometry,
		mat: ThreeTypes.Material,
		p: [number, number, number],
		s: [number, number, number],
	) => {
		const mesh = new T.Mesh(geo, mat);
		mesh.position.set(...p);
		mesh.scale.set(...s);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add(mesh);
		return mesh;
	};

	solid(geometry.cyl, material.top, [review.center.x, 0.78, review.center.z], [1.9, 0.06, 1.9]);
	solid(geometry.cyl, material.leg, [review.center.x, 0.38, review.center.z], [0.24, 0.76, 0.24]);
	solid(geometry.cyl, material.mug, [lounge.center.x, 0.42, lounge.center.z], [1.1, 0.05, 1.1]);
	solid(geometry.cyl, material.leg, [lounge.center.x, 0.2, lounge.center.z], [0.18, 0.4, 0.18]);
	solid(
		geometry.box,
		material.sofa,
		[lounge.center.x, 0.25, lounge.center.z + 3.5],
		[3.2, 0.5, 1.0],
	);
	solid(
		geometry.box,
		material.sofa,
		[lounge.center.x, 0.65, lounge.center.z + 3.95],
		[3.2, 0.7, 0.2],
	);
	solid(
		geometry.box,
		material.sofa,
		[lounge.center.x - 2.0, 0.22, lounge.center.z + 2.3],
		[0.9, 0.44, 0.9],
	);
	solid(
		geometry.box,
		material.wood,
		[lounge.center.x + 2.2, 0.28, lounge.center.z + 2.3],
		[0.7, 0.56, 0.7],
	);

	const workCount = characters.filter(({ workId }) => workId !== null).length;
	const boardMaterial = d.track(
		new T.MeshBasicMaterial({
			map: boardTexture(T, d, labels.board, workCount === 0 ? labels.empty : `${workCount}`),
			toneMapped: false,
		}),
	);
	const boardFrame = solid(
		geometry.box,
		material.dark,
		[layout.boardCenter.x, 1.5, layout.boardCenter.z],
		[8.4, 2.5, 0.14],
	);
	boardFrame.castShadow = false;
	const boardFace = new T.Mesh(geometry.plane, boardMaterial);
	boardFace.position.set(layout.boardCenter.x, 1.5, layout.boardCenter.z - 0.08);
	boardFace.scale.set(8.1, 2.4, 1);
	boardFace.rotation.y = Math.PI;
	group.add(boardFace);
	solid(
		geometry.box,
		material.leg,
		[layout.boardCenter.x - 3.6, 0.15, layout.boardCenter.z],
		[0.12, 0.3, 0.5],
	);
	solid(
		geometry.box,
		material.leg,
		[layout.boardCenter.x + 3.6, 0.15, layout.boardCenter.z],
		[0.12, 0.3, 0.5],
	);

	const zoneLabel = (
		text: string,
		center: { x: number; z: number },
		offsetZ: number,
		hex: string,
	) => {
		const mesh = new T.Mesh(
			geometry.plane,
			d.track(
				new T.MeshBasicMaterial({
					map: labelTexture(T, d, text, hex),
					transparent: true,
					depthWrite: false,
				}),
			),
		);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(center.x, 0.02, center.z + offsetZ);
		mesh.scale.set(5, 1.25, 1);
		group.add(mesh);
	};
	zoneLabel(labels.review, review.center, 3.5, '#f6c26a');
	zoneLabel(labels.lounge, lounge.center, 5.5, '#7fd6e3');
	zoneLabel(labels.blocked, blocked.center, -1.8, '#ff9a8a');

	return { group, pickables, setStatus };
}
