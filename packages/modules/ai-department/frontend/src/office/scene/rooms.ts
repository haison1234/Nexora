import type * as ThreeTypes from 'three';
import { labelTexture } from './workstations';
import { WALL_HEIGHT, wallSegments, type OfficeLayout } from './layout';
import type { Disposer, Three } from './resources';

export type RoomSign = { roomTitle: string; officeTitle: string };

const THICKNESS = 0.08;
const RAIL = 0.1;

/**
 * Glass walls with a dark top rail for each walled team room and its lead office, plus a sign above
 * each door. The walls come from `wallSegments`, the same list the walking tests check.
 */
export function createRooms(
	T: Three,
	d: Disposer,
	layout: OfficeLayout,
	signs: Map<string, RoomSign>,
): ThreeTypes.Group {
	const group = new T.Group();
	const glass = d.track(
		new T.MeshPhysicalMaterial({
			color: '#7cc4d6',
			transparent: true,
			opacity: 0.14,
			roughness: 0.05,
			metalness: 0,
			depthWrite: false,
			side: T.DoubleSide,
		}),
	);
	const rail = d.track(
		new T.MeshStandardMaterial({ color: '#1a2230', roughness: 0.5, metalness: 0.5 }),
	);
	const box = d.track(new T.BoxGeometry(1, 1, 1));

	for (const { a, b } of wallSegments(layout)) {
		const length = Math.hypot(b.x - a.x, b.z - a.z);
		const angle = Math.atan2(b.z - a.z, b.x - a.x);
		const centre = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };

		const pane = new T.Mesh(box, glass);
		pane.scale.set(length, WALL_HEIGHT, THICKNESS);
		pane.position.set(centre.x, WALL_HEIGHT / 2, centre.z);
		pane.rotation.y = -angle;
		pane.renderOrder = 2;
		group.add(pane);

		const top = new T.Mesh(box, rail);
		top.scale.set(length, RAIL, RAIL);
		top.position.set(centre.x, WALL_HEIGHT, centre.z);
		top.rotation.y = -angle;
		top.castShadow = true;
		group.add(top);
	}

	const plane = d.track(new T.PlaneGeometry(1, 1));
	const sign = (text: string, x: number, y: number, z: number, width: number, color: string) => {
		const material = d.track(
			new T.MeshBasicMaterial({
				map: labelTexture(T, d, text, color),
				transparent: true,
				depthWrite: false,
				toneMapped: false,
			}),
		);
		const mesh = new T.Mesh(plane, material);
		mesh.scale.set(width, width / 4, 1);
		mesh.position.set(x, y, z);
		mesh.renderOrder = 3;
		group.add(mesh);
	};

	for (const room of layout.rooms) {
		const text = signs.get(room.id);
		if (!room.walled || !text) continue;
		sign(text.roomTitle, room.door.x - 2.4, WALL_HEIGHT + 0.55, room.door.z + 0.06, 4.4, '#9ad7e6');
		if (room.office) {
			sign(
				text.officeTitle,
				room.office.door.x - 1.2,
				WALL_HEIGHT - 0.35,
				room.office.door.z + 0.06,
				2.6,
				'#f2b46a',
			);
		}
	}
	return group;
}
