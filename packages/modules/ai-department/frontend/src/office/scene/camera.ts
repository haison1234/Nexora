/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { OfficeLayout } from './layout';
import type { OfficePresetId } from './presets';
import type { Three } from './resources';

type Pose = { position: ThreeTypes.Vector3; target: ThreeTypes.Vector3 };

export type CameraRig = {
	setPreset: (id: OfficePresetId, animate: boolean) => void;
	resize: (aspect: number) => void;
	/** Returns true while a transition is running. */
	tick: (seconds: number) => boolean;
	dispose: () => void;
};

const DURATION = 0.85;
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Orbit camera with named views. Views fit the free area, so a narrow window pulls back instead
 * of cutting the scene. The target stays inside the floor, so the view can not drift away.
 */
export function createCameraRig(
	T: Three,
	camera: ThreeTypes.PerspectiveCamera,
	controls: OrbitControls,
	layout: OfficeLayout,
	onMove: () => void,
): CameraRig {
	let aspect = camera.aspect;
	let current: OfficePresetId = 'overview';
	let tween: { from: Pose; to: Pose; start: number } | null = null;
	let clock = 0;
	let userMoved = false;

	const { floor } = layout;
	const centre = new T.Vector3((floor.minX + floor.maxX) / 2, 0.4, (floor.minZ + floor.maxZ) / 2);

	function fitDistance(width: number, depth: number) {
		const vertical = (camera.fov * Math.PI) / 360;
		const horizontal = Math.atan(Math.tan(vertical) * aspect);
		const radius = Math.max(width / 2, depth * 0.7) + 1.2;
		return (radius / Math.sin(Math.min(vertical, horizontal))) * 0.78;
	}

	function pose(id: OfficePresetId): Pose {
		const direction = new T.Vector3(0, 0.62, 0.82).normalize();
		const make = (target: ThreeTypes.Vector3, distance: number, lean = direction): Pose => ({
			target,
			position: target.clone().addScaledVector(lean, distance),
		});
		switch (id) {
			case 'desks':
				return make(new T.Vector3(0, 0.6, 0), fitDistance(layout.roomsWidth + 3, layout.depth + 2));
			case 'review': {
				const zone = layout.zones.review.center;
				return make(new T.Vector3(zone.x, 0.9, zone.z), fitDistance(8, 7));
			}
			case 'blocked': {
				const zone = layout.zones.blocked.center;
				return make(new T.Vector3(zone.x, 1.1, zone.z + 0.8), fitDistance(11, 6));
			}
			case 'lounge': {
				const zone = layout.zones.lounge.center;
				return make(new T.Vector3(zone.x, 0.9, zone.z), fitDistance(8, 7));
			}
			default:
				return make(centre.clone(), fitDistance(floor.maxX - floor.minX, floor.maxZ - floor.minZ));
		}
	}

	controls.enableDamping = false;
	controls.enablePan = true;
	controls.screenSpacePanning = false;
	controls.minPolarAngle = 0.18;
	controls.maxPolarAngle = 1.36;

	const clampTarget = () => {
		const target = controls.target;
		const x = Math.min(Math.max(target.x, floor.minX), floor.maxX);
		const z = Math.min(Math.max(target.z, floor.minZ), floor.maxZ);
		const y = Math.min(Math.max(target.y, 0), 3);
		if (x !== target.x || y !== target.y || z !== target.z) {
			camera.position.add(new T.Vector3(x - target.x, y - target.y, z - target.z));
			target.set(x, y, z);
		}
	};

	const onStart = () => {
		tween = null;
		userMoved = true;
	};
	const onChange = () => {
		clampTarget();
		onMove();
	};
	controls.addEventListener('start', onStart);
	controls.addEventListener('change', onChange);

	function applyLimits() {
		const span = Math.max(floor.maxX - floor.minX, floor.maxZ - floor.minZ);
		controls.minDistance = 4;
		controls.maxDistance = Math.max(
			30,
			fitDistance(floor.maxX - floor.minX, floor.maxZ - floor.minZ) * 1.5,
			span,
		);
	}

	function jump(to: Pose) {
		camera.position.copy(to.position);
		controls.target.copy(to.target);
		controls.update();
	}

	return {
		setPreset(id, animate) {
			current = id;
			userMoved = false;
			applyLimits();
			const to = pose(id);
			if (!animate) {
				tween = null;
				jump(to);
				onMove();
				return;
			}
			tween = {
				from: { position: camera.position.clone(), target: controls.target.clone() },
				to,
				start: clock,
			};
		},
		resize(next) {
			aspect = next;
			applyLimits();
			if (!userMoved && !tween) {
				jump(pose(current));
				onMove();
			}
		},
		tick(seconds) {
			clock = seconds;
			if (!tween) return false;
			const progress = Math.min(1, (seconds - tween.start) / DURATION);
			const k = ease(progress);
			camera.position.lerpVectors(tween.from.position, tween.to.position, k);
			controls.target.lerpVectors(tween.from.target, tween.to.target, k);
			controls.update();
			if (progress >= 1) tween = null;
			return true;
		},
		dispose() {
			controls.removeEventListener('start', onStart);
			controls.removeEventListener('change', onChange);
		},
	};
}
