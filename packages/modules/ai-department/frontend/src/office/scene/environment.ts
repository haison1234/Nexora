/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import type { OfficeLayout } from './layout';
import type { Disposer, Three } from './resources';
import { seeded } from './resources';
import { blobTexture, floorTexture, skyTexture, windowsTexture } from './textures';

export type Environment = {
	group: ThreeTypes.Group;
	update: (seconds: number, animate: boolean) => void;
};

const WALL_HEIGHT = 4.4;
const MULLION_STEP = 3.75;

/** Dark glass office high above a night-blue city: floor, window wall, skyline, plants and dust. */
export function createEnvironment(
	T: Three,
	d: Disposer,
	layout: OfficeLayout,
	high: boolean,
): Environment {
	const group = new T.Group();
	const { floor } = layout;
	const width = floor.maxX - floor.minX;
	const depth = floor.maxZ - floor.minZ;
	const centreX = (floor.minX + floor.maxX) / 2;
	const centreZ = (floor.minZ + floor.maxZ) / 2;

	const floorMap = floorTexture(T, d, width / 4, depth / 4);
	const floorGeometry = d.track(new T.PlaneGeometry(width, depth).rotateX(-Math.PI / 2));
	const floorMaterial = d.track(
		new T.MeshStandardMaterial({ map: floorMap, roughness: 0.52, metalness: 0.18 }),
	);
	const floorMesh = new T.Mesh(floorGeometry, floorMaterial);
	floorMesh.position.set(centreX, 0, centreZ);
	floorMesh.receiveShadow = true;
	group.add(floorMesh);

	const plateGeometry = d.track(new T.BoxGeometry(width + 0.6, 120, depth + 0.6));
	const trimMaterial = d.track(
		new T.MeshStandardMaterial({ color: '#10151f', roughness: 0.7, metalness: 0.4 }),
	);
	const plate = new T.Mesh(plateGeometry, trimMaterial);
	plate.position.set(centreX, -60.05, centreZ);
	group.add(plate);

	const corridorMaterial = d.track(
		new T.MeshBasicMaterial({
			color: '#7cc4d6',
			transparent: true,
			opacity: 0.05,
			depthWrite: false,
		}),
	);
	const corridorGeometry = d.track(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
	for (const hallway of layout.hallways) {
		const corridor = new T.Mesh(corridorGeometry, corridorMaterial);
		corridor.scale.set(hallway.width, hallway.depth, 1);
		corridor.position.set(hallway.center.x, 0.01, hallway.center.z);
		group.add(corridor);
	}

	// Sky and window wall.
	const sky = new T.Mesh(
		d.track(new T.PlaneGeometry(1, 1)),
		d.track(new T.MeshBasicMaterial({ map: skyTexture(T, d), fog: false, depthWrite: false })),
	);
	sky.position.set(centreX, 20, floor.minZ - 160);
	sky.scale.set(700, 300, 1);
	sky.renderOrder = -10;
	group.add(sky);

	const boxGeometry = d.track(new T.BoxGeometry(1, 1, 1));
	const mullions: Array<[number, number, number, number, number, number]> = [];
	for (let x = floor.minX; x <= floor.maxX + 1e-6; x += MULLION_STEP) {
		mullions.push([x, WALL_HEIGHT / 2, floor.minZ, 0.12, WALL_HEIGHT, 0.22]);
	}
	mullions.push([centreX, 0.09, floor.minZ, width + 0.3, 0.18, 0.34]);
	mullions.push([centreX, 3.05, floor.minZ, width, 0.06, 0.12]);
	mullions.push([centreX, WALL_HEIGHT, floor.minZ, width + 0.3, 0.3, 0.34]);
	for (const x of [floor.minX - 0.1, floor.maxX + 0.1]) {
		mullions.push([x, 0.45, centreZ, 0.3, 0.9, depth + 0.3]);
		mullions.push([x, WALL_HEIGHT, centreZ, 0.32, 0.3, depth + 0.3]);
		for (let z = floor.minZ + MULLION_STEP; z < floor.maxZ - 0.5; z += MULLION_STEP) {
			mullions.push([x, WALL_HEIGHT / 2, z, 0.2, WALL_HEIGHT, 0.12]);
		}
	}
	const trim = new T.InstancedMesh(boxGeometry, trimMaterial, mullions.length);
	const matrix = new T.Matrix4();
	const quaternion = new T.Quaternion();
	mullions.forEach(([x, y, z, sx, sy, sz], index) => {
		trim.setMatrixAt(
			index,
			matrix.compose(new T.Vector3(x, y, z), quaternion, new T.Vector3(sx, sy, sz)),
		);
	});
	trim.castShadow = true;
	group.add(trim);

	const glass = d.track(
		new T.MeshStandardMaterial({
			color: '#9fc5ff',
			transparent: true,
			opacity: 0.07,
			roughness: 0.05,
			metalness: 0,
			depthWrite: false,
		}),
	);
	const pane = new T.Mesh(boxGeometry, glass);
	pane.position.set(centreX, WALL_HEIGHT / 2, floor.minZ + 0.04);
	pane.scale.set(width, WALL_HEIGHT, 0.02);
	group.add(pane);

	// Skyline.
	const windows = windowsTexture(T, d);
	const towerMaterial = d.track(
		new T.MeshStandardMaterial({
			color: '#0a0e16',
			roughness: 0.85,
			metalness: 0.2,
			emissive: '#ffffff',
			emissiveMap: windows,
			emissiveIntensity: 0.9,
		}),
	);
	towerMaterial.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader.replace(
			'#include <uv_vertex>',
			`#include <uv_vertex>
#if defined( USE_INSTANCING ) && defined( USE_EMISSIVEMAP )
	{
		float sx = length( instanceMatrix[0].xyz );
		float sy = length( instanceMatrix[1].xyz );
		vec2 jitter = vec2( instanceMatrix[3].x * 0.37, instanceMatrix[3].z * 0.11 );
		vEmissiveMapUv = abs( normal.y ) > 0.5 ? vec2( 0.0 ) : vec2( uv.x * sx * 0.08, uv.y * sy * 0.012 ) + jitter;
	}
#endif`,
		);
	};
	towerMaterial.customProgramCacheKey = () => 'office-skyline';
	const towerCount = high ? 170 : 80;
	const towerGeometry = d.track(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
	const towers = new T.InstancedMesh(towerGeometry, towerMaterial, towerCount);
	const random = seeded(23);
	const color = new T.Color();
	for (let index = 0; index < towerCount; index++) {
		const far = random();
		const z = floor.minZ - 18 - far * 90;
		const spread = 45 + far * 95;
		let x = centreX + (random() - 0.5) * 2 * spread;
		if (Math.abs(x - centreX) < width / 2 + 6 && z > floor.minZ - 40)
			x += Math.sign(x - centreX || 1) * (width / 2 + 6);
		const w = 8 + random() * 12;
		const dep = 8 + random() * 12;
		const h = 50 + random() * random() * 90;
		quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), (random() - 0.5) * 0.4);
		towers.setMatrixAt(
			index,
			matrix.compose(new T.Vector3(x, -90, z), quaternion, new T.Vector3(w, h, dep)),
		);
		towers.setColorAt(index, color.setHSL(0.6 + random() * 0.05, 0.25, 0.45 + random() * 0.55));
	}
	towers.frustumCulled = false;
	group.add(towers);

	// Plants.
	const potGeometry = d.track(new T.CylinderGeometry(0.28, 0.22, 0.45, 14));
	const leafGeometry = d.track(new T.SphereGeometry(0.34, 14, 10));
	const potMaterial = d.track(new T.MeshStandardMaterial({ color: '#232b3a', roughness: 0.6 }));
	const leafMaterial = d.track(new T.MeshStandardMaterial({ color: '#2f7d5b', roughness: 0.7 }));
	const plantSpots: Array<[number, number]> = [
		[floor.minX + 1.4, floor.minZ + 1.2],
		[floor.maxX - 1.4, floor.minZ + 1.2],
		[floor.minX + 1.4, layout.corridorZ + 0.2],
		[floor.maxX - 1.4, layout.corridorZ + 0.2],
		[floor.minX + 1.4, floor.maxZ - 1.2],
		[floor.maxX - 1.4, floor.maxZ - 1.2],
	];
	for (const [x, z] of plantSpots) {
		const pot = new T.Mesh(potGeometry, potMaterial);
		pot.position.set(x, 0.22, z);
		pot.castShadow = true;
		group.add(pot);
		for (const [ox, oy, oz, s] of [
			[0, 0.75, 0, 1],
			[0.18, 0.62, 0.1, 0.7],
			[-0.16, 0.66, -0.08, 0.75],
		] as const) {
			const leaf = new T.Mesh(leafGeometry, leafMaterial);
			leaf.position.set(x + ox, oy, z + oz);
			leaf.scale.setScalar(s);
			leaf.castShadow = true;
			group.add(leaf);
		}
	}

	// Dust drifting in the light.
	const dustCount = high ? 220 : 80;
	const dustPositions = new Float32Array(dustCount * 3);
	const dustBase = new Float32Array(dustCount * 3);
	for (let index = 0; index < dustCount; index++) {
		dustBase[index * 3] = floor.minX + random() * width;
		dustBase[index * 3 + 1] = 0.5 + random() * 3.6;
		dustBase[index * 3 + 2] = floor.minZ + random() * depth;
	}
	dustPositions.set(dustBase);
	const dustGeometry = d.track(new T.BufferGeometry());
	dustGeometry.setAttribute('position', new T.BufferAttribute(dustPositions, 3));
	const dustMaterial = d.track(
		new T.PointsMaterial({
			map: blobTexture(T, d),
			color: '#ffd9a8',
			size: 0.09,
			transparent: true,
			opacity: 0.4,
			depthWrite: false,
			blending: T.AdditiveBlending,
		}),
	);
	const dust = new T.Points(dustGeometry, dustMaterial);
	dust.frustumCulled = false;
	group.add(dust);

	return {
		group,
		update(seconds, animate) {
			if (!animate) return;
			for (let index = 0; index < dustCount; index++) {
				const phase = index * 1.7;
				dustPositions[index * 3] = dustBase[index * 3] + Math.sin(seconds * 0.12 + phase) * 0.6;
				dustPositions[index * 3 + 1] =
					dustBase[index * 3 + 1] + Math.sin(seconds * 0.2 + phase) * 0.25;
				dustPositions[index * 3 + 2] =
					dustBase[index * 3 + 2] + Math.cos(seconds * 0.1 + phase) * 0.6;
			}
			dustGeometry.attributes.position.needsUpdate = true;
		},
	};
}
