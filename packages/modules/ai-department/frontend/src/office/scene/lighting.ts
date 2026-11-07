/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import type { OfficeLayout } from './layout';
import type { Disposer, Three } from './resources';

export type Lighting = {
	setShadows: (enabled: boolean) => void;
};

/**
 * Blue-hour exterior and warm interior: a cool hemisphere fill, one shadow-casting low sun,
 * a cold rim from the windows, warm lamps over each area, and a small procedural reflection
 * environment so glossy parts have something to reflect.
 */
export function createLighting(
	T: Three,
	d: Disposer,
	renderer: ThreeTypes.WebGLRenderer,
	scene: ThreeTypes.Scene,
	parent: ThreeTypes.Object3D,
	layout: OfficeLayout,
): Lighting {
	parent.add(new T.HemisphereLight('#a8bdf0', '#3a2c20', 1.5));
	parent.add(new T.AmbientLight('#4a5a80', 0.12));

	const sun = new T.DirectionalLight('#ffdcbc', 2.2);
	const { floor } = layout;
	const spanX = (floor.maxX - floor.minX) / 2;
	const spanZ = (floor.maxZ - floor.minZ) / 2;
	const centre = { x: (floor.minX + floor.maxX) / 2, z: (floor.minZ + floor.maxZ) / 2 };
	sun.position.set(centre.x - 8, 18, centre.z + 11);
	sun.target.position.set(centre.x, 0, centre.z);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -spanX - 3;
	sun.shadow.camera.right = spanX + 3;
	sun.shadow.camera.top = spanZ + 3;
	sun.shadow.camera.bottom = -spanZ - 3;
	sun.shadow.camera.near = 2;
	sun.shadow.camera.far = 60;
	sun.shadow.camera.updateProjectionMatrix();
	sun.shadow.radius = 4;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.025;
	parent.add(sun, sun.target);

	const rim = new T.DirectionalLight('#7d97d8', 0.45);
	rim.position.set(4, 6, floor.minZ - 12);
	parent.add(rim);

	const lamps: Array<[number, number, number]> = [
		[-layout.width / 4, 3.3, 0],
		[layout.width / 4, 3.3, 0],
		[0, 3.5, -layout.depth / 4],
		[layout.zones.review.center.x, 3.1, layout.zones.review.center.z],
		[layout.zones.lounge.center.x, 3.1, layout.zones.lounge.center.z],
		[0, 3.1, layout.zones.blocked.center.z],
	];
	for (const [x, y, z] of lamps) {
		const lamp = new T.PointLight('#ffbf82', 26, 13, 1.6);
		lamp.position.set(x, y, z);
		parent.add(lamp);
	}

	// Reflection environment: a dark room with a few bright panels.
	const room = new T.Scene();
	const roomShell = d.track(new T.BoxGeometry(70, 34, 70));
	const roomMaterial = d.track(new T.MeshBasicMaterial({ color: 0x05070c, side: T.BackSide }));
	room.add(new T.Mesh(roomShell, roomMaterial));
	const panels: Array<
		[string, number, [number, number, number], [number, number, number], [number, number]]
	> = [
		['#e89a6a', 1.6, [0, 2, -30], [0, 0, 0], [60, 5]],
		['#3a4f8f', 0.9, [0, 9, -30], [0, 0, 0], [60, 9]],
		['#ffd2a1', 2.2, [0, 12, -4], [Math.PI / 2, 0, 0], [16, 6]],
		['#ffd2a1', 2.2, [0, 12, 8], [Math.PI / 2, 0, 0], [16, 6]],
		['#8fb0ff', 0.7, [0, 4, 30], [0, Math.PI, 0], [50, 8]],
	];
	const panelGeometry = d.track(new T.PlaneGeometry(1, 1));
	for (const [color, strength, position, rotation, scale] of panels) {
		const material = d.track(
			new T.MeshBasicMaterial({
				color: new T.Color(color).multiplyScalar(strength),
				side: T.DoubleSide,
			}),
		);
		const mesh = new T.Mesh(panelGeometry, material);
		mesh.position.set(...position);
		mesh.rotation.set(...rotation);
		mesh.scale.set(scale[0], scale[1], 1);
		room.add(mesh);
	}
	const pmrem = new T.PMREMGenerator(renderer);
	const target = pmrem.fromScene(room, 0.04);
	pmrem.dispose();
	d.track(target);
	scene.environment = target.texture;
	scene.environmentIntensity = 0.55;

	return {
		setShadows(enabled) {
			sun.castShadow = enabled;
			renderer.shadowMap.enabled = enabled;
			renderer.shadowMap.needsUpdate = true;
		},
	};
}
