/* Adapted from 3D Claude Hub Remote. Copyright 2026 NinelXram. MIT. */
import type * as ThreeTypes from 'three';
import {
	layoutSignature,
	shouldContinueOfficeAnimation,
	statusIsAnimated,
	type OfficeModel,
	type OfficeStatus,
} from './office-model';
import { createAnimState, pose, type AnimState } from './scene/animator';
import { createCameraRig, type CameraRig } from './scene/camera';
import { createEnvironment, type Environment } from './scene/environment';
import { buildLayout, type OfficeLayout } from './scene/layout';
import { createLighting } from './scene/lighting';
import { OfficeMotion, poseFor } from './scene/motion';
import { OFFICE_THEME } from './office-theme';
import type { OfficePresetId } from './scene/presets';
import { Disposer } from './scene/resources';
import { createHelpLinks, type HelpLink } from './scene/links';
import { createRooms, type RoomSign } from './scene/rooms';
import { createFleet, type Fleet } from './scene/robots';
import { blobTexture } from './scene/textures';
import { createWorkstations, type Workstations, type ZoneLabels } from './scene/workstations';

type Three = typeof ThreeTypes;

export type OfficeFailureReason = 'unsupported' | 'init-failed' | 'context-lost';
export type LabelPosition = { x: number; y: number; visible: boolean };

export type OfficeRendererHooks = {
	onSelect: (memberId: string | null) => void;
	onFailure: (reason: OfficeFailureReason) => void;
	onLabels: (positions: Map<string, LabelPosition>) => void;
};

export type OfficeRendererOptions = {
	zoneLabels?: ZoneLabels;
	/** The sign above a team room door, from the lead's name. */
	teamTitle?: (leadName: string) => string;
};

export type OfficeUpdateOptions = {
	selectedMemberId: string | null;
	reducedMotion: boolean;
	helpLinks?: HelpLink[];
};

export type OfficeRenderer = {
	update: (model: OfficeModel, options: OfficeUpdateOptions) => void;
	setPreset: (id: OfficePresetId) => void;
	dispose: () => void;
};

export class OfficeRendererError extends Error {
	constructor(readonly reason: OfficeFailureReason) {
		super(reason);
	}
}

const DEFAULT_ZONE_LABELS: ZoneLabels = {
	review: 'Review',
	blocked: 'Blocked',
	lounge: 'Lounge',
	board: 'Work board',
	empty: 'No active work',
};

const MAX_HIGH_QUALITY_MEMBERS = 40;

export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
	} catch {
		return false;
	}
}

type World = {
	disposer: Disposer;
	group: ThreeTypes.Group;
	env: Environment;
	workstations: Workstations;
	fleet: Fleet;
	motion: OfficeMotion;
	anim: Map<string, AnimState>;
	camera: CameraRig;
	statuses: Map<string, OfficeStatus>;
	pickables: ThreeTypes.Object3D[];
	layout: OfficeLayout;
	links: { key: string; group: ThreeTypes.Group; disposer: Disposer } | null;
};

export async function createOfficeRenderer(
	host: HTMLElement,
	hooks: OfficeRendererHooks,
	options: OfficeRendererOptions = {},
): Promise<OfficeRenderer> {
	if (!webglSupported()) throw new OfficeRendererError('unsupported');
	const zoneLabels = options.zoneLabels ?? DEFAULT_ZONE_LABELS;

	let T: Three;
	let OrbitControlsCtor: typeof import('three/addons/controls/OrbitControls.js').OrbitControls;
	let Rounded: typeof import('three/addons/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;
	try {
		T = await import('three');
		({ OrbitControls: OrbitControlsCtor } = await import('three/addons/controls/OrbitControls.js'));
		({ RoundedBoxGeometry: Rounded } = await import(
			'three/addons/geometries/RoundedBoxGeometry.js'
		));
	} catch {
		throw new OfficeRendererError('init-failed');
	}

	let renderer: ThreeTypes.WebGLRenderer;
	try {
		renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
	} catch {
		throw new OfficeRendererError('init-failed');
	}

	const canvas = renderer.domElement;
	canvas.style.display = 'block';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.style.touchAction = 'none';
	canvas.setAttribute('aria-hidden', 'true');
	host.appendChild(canvas);

	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = T.PCFShadowMap;
	renderer.toneMapping = T.ACESFilmicToneMapping;
	renderer.setClearColor(OFFICE_THEME.night, 1);

	const scene = new T.Scene();
	const camera = new T.PerspectiveCamera(38, 1, 0.1, 500);
	camera.position.set(0, 14, 20);
	const controls = new OrbitControlsCtor(camera, canvas);

	const selectionGeometry = new T.RingGeometry(0.64, 0.84, 56).rotateX(-Math.PI / 2);
	const selectionMaterial = new T.MeshBasicMaterial({
		color: OFFICE_THEME.selection,
		transparent: true,
		opacity: 0.95,
	});
	const selectionMarker = new T.Mesh(selectionGeometry, selectionMaterial);
	selectionMarker.visible = false;
	selectionMarker.position.y = 0.04;
	scene.add(selectionMarker);

	let world: World | null = null;
	let signature = '';
	let selectedId: string | null = null;
	let reducedMotion = false;
	let preset: OfficePresetId = 'overview';
	let disposed = false;
	let rafId = 0;
	let lastSeconds = 0;
	const labels = new Map<string, LabelPosition>();
	const projected = new T.Vector3();

	function anyAnimated() {
		return world ? [...world.statuses.values()].some(statusIsAnimated) : false;
	}

	function updateSelection() {
		const agent = selectedId ? world?.motion.agents.get(selectedId) : undefined;
		selectionMarker.visible = Boolean(agent);
		if (agent) selectionMarker.position.set(agent.position.x, 0.04, agent.position.z);
	}

	function updateLabels() {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		labels.clear();
		if (world) {
			for (const id of world.fleet.robots.keys()) {
				if (!world.fleet.headWorld(id, projected)) continue;
				projected.project(camera);
				labels.set(id, {
					x: (projected.x * 0.5 + 0.5) * width,
					y: (-projected.y * 0.5 + 0.5) * height,
					visible:
						projected.z < 1 && Math.abs(projected.x) <= 1.05 && Math.abs(projected.y) <= 1.05,
				});
			}
		}
		hooks.onLabels(labels);
	}

	function poseAll(seconds: number, dt: number, animate: boolean) {
		if (!world) return;
		for (const agent of world.motion.agents.values()) {
			const handle = world.fleet.robots.get(agent.id);
			const state = world.anim.get(agent.id);
			if (!handle || !state) continue;
			handle.root.position.set(agent.position.x, 0, agent.position.z);
			handle.root.rotation.y = agent.heading;
			pose(state, handle, poseFor(agent), seconds, dt, animate, agent.walkPhase);
		}
		world.fleet.sync();
	}

	function frame(now: number) {
		rafId = 0;
		if (disposed) return;
		const seconds = now / 1000;
		const dt = lastSeconds ? Math.min(0.1, seconds - lastSeconds) : 1 / 60;
		lastSeconds = seconds;
		const animate = !reducedMotion;
		const walking = world && animate ? world.motion.step(dt) : false;
		const cameraMoving = world ? world.camera.tick(seconds) : false;
		poseAll(seconds, dt, animate);
		world?.env.update(seconds, animate);
		updateSelection();
		renderer.render(scene, camera);
		updateLabels();
		const visible = document.visibilityState === 'visible';
		const keepGoing =
			shouldContinueOfficeAnimation(reducedMotion, anyAnimated() || walking, visible) ||
			(cameraMoving && visible);
		if (keepGoing) rafId = requestAnimationFrame(frame);
		else lastSeconds = 0;
	}

	function requestRender() {
		if (disposed || rafId) return;
		rafId = requestAnimationFrame(frame);
	}

	function resize() {
		const width = Math.max(1, host.clientWidth);
		const height = Math.max(1, host.clientHeight);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		world?.camera.resize(camera.aspect);
		requestRender();
	}

	const pointer = new T.Vector2();
	const raycaster = new T.Raycaster();
	let downAt: { x: number; y: number } | null = null;

	function pick(event: PointerEvent): string | null {
		if (!world) return null;
		const rect = canvas.getBoundingClientRect();
		pointer.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1,
		);
		raycaster.setFromCamera(pointer, camera);
		const hit = raycaster.intersectObjects(world.pickables, false)[0];
		const id: unknown = hit?.object.userData.memberId;
		return typeof id === 'string' ? id : null;
	}

	const onPointerDown = (event: PointerEvent) => {
		downAt = { x: event.clientX, y: event.clientY };
	};
	const onPointerUp = (event: PointerEvent) => {
		if (!downAt) return;
		const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
		downAt = null;
		if (moved < 6) hooks.onSelect(pick(event));
	};
	const onPointerMove = (event: PointerEvent) => {
		if (downAt) return;
		canvas.style.cursor = pick(event) ? 'pointer' : 'grab';
	};
	const onContextLost = (event: Event) => {
		event.preventDefault();
		hooks.onFailure('context-lost');
	};
	const onVisibility = () => {
		if (document.visibilityState === 'visible') requestRender();
	};

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('webglcontextlost', onContextLost);
	document.addEventListener('visibilitychange', onVisibility);
	controls.addEventListener('change', requestRender);

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);

	function disposeWorld() {
		if (!world) return;
		world.camera.dispose();
		world.links?.disposer.disposeAll();
		scene.remove(world.group);
		scene.environment = null;
		world.disposer.disposeAll();
		world = null;
	}

	function buildWorld(model: OfficeModel) {
		const disposer = new Disposer();
		const group = new T.Group();
		const layout = buildLayout(
			model.teams.map(({ id, leadMemberId, memberIds }) => ({
				id,
				leadId: leadMemberId,
				memberIds,
			})),
		);
		const env = createEnvironment(
			T,
			disposer,
			layout,
			model.characters.length <= MAX_HIGH_QUALITY_MEMBERS,
		);
		createLighting(T, disposer, renderer, scene, group, layout);
		const workstations = createWorkstations(T, disposer, layout, model.characters, zoneLabels);
		const fleet = createFleet(
			T,
			disposer,
			Rounded,
			model.characters.map(({ memberId, role }) => ({ id: memberId, role })),
			blobTexture(T, disposer),
		);
		const signs = new Map<string, RoomSign>();
		for (const team of model.teams) {
			const lead = model.characters.find(({ memberId }) => memberId === team.leadMemberId);
			if (!lead) continue;
			signs.set(team.id, {
				roomTitle: options.teamTitle?.(lead.name) ?? lead.name,
				officeTitle: lead.role,
			});
		}
		group.add(env.group, workstations.group, fleet.group, createRooms(T, disposer, layout, signs));
		scene.add(group);

		const cameraRig = createCameraRig(T, camera, controls, layout, requestRender);
		cameraRig.resize(camera.aspect);
		cameraRig.setPreset(preset, false);

		world = {
			disposer,
			group,
			env,
			workstations,
			fleet,
			motion: new OfficeMotion(layout),
			anim: new Map([...fleet.robots].map(([id, handle]) => [id, createAnimState(handle.rig)])),
			camera: cameraRig,
			statuses: new Map(),
			pickables: [...fleet.pickables, ...workstations.pickables],
			layout,
			links: null,
		};
	}

	function applyHelpLinks(links: HelpLink[]) {
		if (!world) return;
		const key = links
			.map(({ requesterId, recipientId }) => `${requesterId}>${recipientId}`)
			.join('|');
		if (world.links?.key === key) return;
		if (world.links) {
			world.group.remove(world.links.group);
			world.links.disposer.disposeAll();
		}
		const disposer = new Disposer();
		const group = createHelpLinks(T, disposer, world.layout, links, OFFICE_THEME.link);
		world.group.add(group);
		world.links = { key, group, disposer };
	}

	resize();

	return {
		update(model, updateOptions) {
			if (disposed) return;
			reducedMotion = updateOptions.reducedMotion;
			selectedId = updateOptions.selectedMemberId;
			const nextSignature = layoutSignature(model);
			const rebuilt = nextSignature !== signature || !world;
			if (rebuilt) {
				signature = nextSignature;
				disposeWorld();
				buildWorld(model);
			}
			if (!world) return;
			world.motion.assign(model.characters, rebuilt || reducedMotion);
			applyHelpLinks(updateOptions.helpLinks ?? []);
			for (const character of model.characters) {
				world.fleet.setBubble(
					character.memberId,
					character.workInstruction,
					character.workInstruction !== null && character.status !== 'idle',
				);
				if (world.statuses.get(character.memberId) === character.status) continue;
				world.statuses.set(character.memberId, character.status);
				world.fleet.setStatus(character.memberId, character.status);
				world.workstations.setStatus(character.memberId, character.status);
			}
			requestRender();
		},
		setPreset(id) {
			preset = id;
			world?.camera.setPreset(id, !reducedMotion);
			requestRender();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (rafId) cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('webglcontextlost', onContextLost);
			controls.removeEventListener('change', requestRender);
			disposeWorld();
			controls.dispose();
			selectionGeometry.dispose();
			selectionMaterial.dispose();
			labels.clear();
			scene.clear();
			renderer.dispose();
			renderer.forceContextLoss();
			canvas.remove();
		},
	};
}
