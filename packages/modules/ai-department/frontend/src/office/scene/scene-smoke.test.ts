import type { AiDepartmentMemberDto, AiDepartmentWorkItemDto } from '@n8n/api-types';
import * as T from 'three';
import type * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildOfficeModel } from '../office-model';
import { createAnimState, pose } from './animator';
import { createEnvironment } from './environment';
import { buildLayout, wallSegments } from './layout';
import { OfficeMotion, poseFor } from './motion';
import { Disposer } from './resources';
import { createHelpLinks } from './links';
import { createRooms } from './rooms';
import { createFleet } from './robots';
import { blobTexture } from './textures';
import { createWorkstations } from './workstations';

function member(id: string, role: string, managerMemberId: string | null = null) {
	return {
		id,
		projectId: 'p',
		departmentId: 'd',
		name: `Member ${id}`,
		role,
		managerMemberId,
		expertiseTags: [],
		archived: false,
		version: 1,
		executionState: 'available',
		createdAt: '',
		updatedAt: '',
	} satisfies AiDepartmentMemberDto;
}

function work(id: string, assigneeMemberId: string, state: AiDepartmentWorkItemDto['state']) {
	return { id, assigneeMemberId, state, instruction: id, version: 1 } as AiDepartmentWorkItemDto;
}

const labels = {
	review: 'Review',
	blocked: 'Blocked',
	lounge: 'Lounge',
	board: 'Board',
	empty: 'No active work',
};

function buildScene(workItems: AiDepartmentWorkItemDto[]) {
	const members = [
		member('lead', 'Coordinator'),
		member('a', 'Engineer', 'lead'),
		member('b', 'QA tester', 'lead'),
		member('c', 'Researcher'),
	];
	const model = buildOfficeModel(members, workItems);
	const disposer = new Disposer();
	const layout = buildLayout(
		model.teams.map(({ id, leadMemberId, memberIds }) => ({
			id,
			leadId: leadMemberId,
			memberIds,
		})),
	);
	const env = createEnvironment(T, disposer, layout, true);
	const workstations = createWorkstations(T, disposer, layout, model.characters, labels);
	const fleet = createFleet(
		T,
		disposer,
		RoundedBoxGeometry,
		model.characters.map(({ memberId, role }) => ({ id: memberId, role })),
		blobTexture(T, disposer),
	);
	const motion = new OfficeMotion(layout);
	const anim = new Map([...fleet.robots].map(([id, handle]) => [id, createAnimState(handle.rig)]));
	return { model, layout, env, workstations, fleet, motion, anim, disposer };
}

function poseAll(scene: ReturnType<typeof buildScene>, seconds: number) {
	for (const agent of scene.motion.agents.values()) {
		const handle = scene.fleet.robots.get(agent.id)!;
		handle.root.position.set(agent.position.x, 0, agent.position.z);
		handle.root.rotation.y = agent.heading;
		pose(scene.anim.get(agent.id)!, handle, poseFor(agent), seconds, 0.016, true, agent.walkPhase);
	}
	scene.fleet.sync();
}

function fakeContext2d() {
	const gradient = { addColorStop: () => undefined };
	return new Proxy(
		{},
		{
			get: (_target, property) =>
				property === 'createLinearGradient' || property === 'createRadialGradient'
					? () => gradient
					: () => undefined,
			set: () => true,
		},
	);
}

describe('office scene wiring', () => {
	beforeAll(() => {
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
			() => fakeContext2d() as never,
		);
	});

	afterAll(() => {
		vi.restoreAllMocks();
	});

	it('builds the environment, desks, and robots and poses every member without error', () => {
		const scene = buildScene([work('w1', 'a', 'running'), work('w2', 'b', 'review')]);
		scene.motion.assign(scene.model.characters, true);
		poseAll(scene, 1);
		scene.env.update(1, true);

		expect(scene.fleet.robots.size).toBe(4);
		for (const [id, handle] of scene.fleet.robots) {
			expect(Number.isFinite(handle.root.position.x)).toBe(true);
			expect(Number.isFinite(handle.root.position.z)).toBe(true);
			expect(handle.pick.userData.memberId).toBe(id);
			const head = scene.fleet.headWorld(id, new T.Vector3());
			expect(head && Number.isFinite(head.y)).toBe(true);
		}
		scene.fleet.setBubble('a', 'Research task', true);
		expect(scene.fleet.robots.get('a')?.bones.head.children.length).toBeGreaterThan(0);
		expect(scene.fleet.robots.get('a')?.bones.head.children.at(-1)?.visible).toBe(true);
		scene.fleet.setBubble('b', 'Review task', true);
		const firstTexture = (
			(scene.fleet.robots.get('a')?.bones.head.children.at(-1) as THREE.Group)
				.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
		).material.map;
		const secondTexture = (
			(scene.fleet.robots.get('b')?.bones.head.children.at(-1) as THREE.Group)
				.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
		).material.map;
		expect(firstTexture).not.toBe(secondTexture);
		scene.fleet.setBubble('a', null, false);
		expect(scene.fleet.robots.get('a')?.bones.head.children).toHaveLength(0);
		expect(scene.workstations.pickables.length).toBeGreaterThan(0);
		scene.disposer.disposeAll();
	});

	it('walks a member to the review area when its work enters review', () => {
		const scene = buildScene([work('w1', 'a', 'running')]);
		scene.motion.assign(scene.model.characters, true);
		const before = { ...scene.motion.agents.get('a')!.position };

		const next = buildOfficeModel(
			[
				member('lead', 'Coordinator'),
				member('a', 'Engineer', 'lead'),
				member('b', 'QA tester', 'lead'),
				member('c', 'Researcher'),
			],
			[work('w1', 'a', 'review')],
		);
		scene.motion.assign(next.characters, false);
		expect(scene.motion.agents.get('a')!.path.length).toBeGreaterThan(0);

		let guard = 0;
		while (scene.motion.step(0.1) && guard++ < 600);
		const after = scene.motion.agents.get('a')!.position;
		const review = scene.layout.zones.review.center;

		expect(guard).toBeLessThan(600);
		expect(Math.hypot(after.x - review.x, after.z - review.z)).toBeLessThan(
			Math.hypot(before.x - review.x, before.z - review.z),
		);
		scene.disposer.disposeAll();
	});

	it('places a waiting member at its desk, not in the blocked area', () => {
		const model = buildOfficeModel(
			[member('a', 'Engineer')],
			[work('w1', 'a', 'blocked')],
			60,
			new Set(['w1']),
		);
		const layout = buildLayout([{ id: '__independent', leadId: null, memberIds: ['a'] }]);
		const motion = new OfficeMotion(layout);
		motion.assign(model.characters, true);

		expect(model.characters[0].status).toBe('waiting');
		expect(motion.agents.get('a')!.anchor.kind).toBe('desk');
	});

	it('draws one arc for each valid help link and ignores unknown members', () => {
		const disposer = new Disposer();
		const layout = buildLayout([{ id: '__independent', leadId: null, memberIds: ['a', 'b', 'c'] }]);
		const group = createHelpLinks(
			T,
			disposer,
			layout,
			[
				{ requesterId: 'a', recipientId: 'b' },
				{ requesterId: 'b', recipientId: 'c' },
				{ requesterId: 'a', recipientId: 'missing' },
				{ requesterId: 'a', recipientId: 'a' },
			],
			0x7cc4d6,
		);

		expect(group.children).toHaveLength(2);
		for (const line of group.children as THREE.Line[]) {
			const position = line.geometry.getAttribute('position');
			expect(position.count).toBe(33);
			expect(Number.isFinite(position.getY(16))).toBe(true);
		}
		disposer.disposeAll();
	});

	it('draws a glass pane and a rail for every wall segment and a sign for every walled room', () => {
		const disposer = new Disposer();
		const layout = buildLayout([
			{ id: 'lead', leadId: 'lead', memberIds: ['lead', 'a', 'b'] },
			{ id: '__independent', leadId: null, memberIds: ['c'] },
		]);
		const signs = new Map([['lead', { roomTitle: 'Lead team', officeTitle: 'CEO' }]]);

		const group = createRooms(T, disposer, layout, signs);

		const walls = wallSegments(layout).length;
		expect(walls).toBeGreaterThan(0);
		const signsDrawn = 2;
		expect(group.children).toHaveLength(walls * 2 + signsDrawn);
		disposer.disposeAll();
	});

	it('draws no walls for an open area', () => {
		const disposer = new Disposer();
		const layout = buildLayout([{ id: '__independent', leadId: null, memberIds: ['a', 'b'] }]);

		expect(wallSegments(layout)).toEqual([]);
		expect(createRooms(T, disposer, layout, new Map()).children).toHaveLength(0);
		disposer.disposeAll();
	});
});
