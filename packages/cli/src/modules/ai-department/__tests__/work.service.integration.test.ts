import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { DepartmentService } from '../department.service';
import { MemberService } from '../member.service';
import { ActiveDepartmentWorkGuardProxy } from '../active-department-work-guard.contracts';
import { ActiveDepartmentWorkGuardImpl } from '../work/active-department-work-guard';
import { WorkService } from '../work/work.service';

describe('AI Department work planning', () => {
	let departments: DepartmentService;
	let members: MemberService;
	let work: WorkService;
	let directory: DirectoryRepository;
	let workRepository: WorkRepository;
	let projectId: string;
	let otherProjectId: string;
	const actorId = randomUUID();

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
		);
		departments = Container.get(DepartmentService);
		members = Container.get(MemberService);
		work = Container.get(WorkService);
		directory = Container.get(DirectoryRepository);
		workRepository = Container.get(WorkRepository);
		projectId = (await createTeamProject('Work planning integration')).id;
		otherProjectId = (await createTeamProject('Other work planning integration')).id;
	});

	afterAll(async () => await testDb.terminate());

	async function createDepartment(name = `Department-${randomUUID()}`) {
		return await departments.create(projectId, actorId, { name, requestId: randomUUID() });
	}

	async function createMember(departmentId: string, name = `Member-${randomUUID()}`) {
		return await members.create(projectId, actorId, departmentId, {
			name,
			role: 'Research',
			requestId: randomUUID(),
		});
	}

	async function createWork(departmentId: string, assigneeMemberId?: string, goalId?: string) {
		return await work.createWork(projectId, actorId, departmentId, {
			instruction: 'Prepare the research summary',
			assigneeMemberId,
			goalId,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
	}

	it('validates goal hierarchy and keeps goal/work references inside the department', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const root = await work.createGoal(projectId, actorId, department.id, {
			title: 'Department objective',
			ownerMemberId: member.id,
			requestId: randomUUID(),
		});
		const child = await work.createGoal(projectId, actorId, department.id, {
			title: 'Research milestone',
			parentId: root.id,
			requestId: randomUUID(),
		});

		await expect(
			work.updateGoal(projectId, actorId, department.id, root.id, {
				parentId: child.id,
				expectedVersion: root.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('cycle');

		const otherDepartment = await createDepartment();
		const otherMember = await createMember(otherDepartment.id);
		const otherGoal = await work.createGoal(projectId, actorId, otherDepartment.id, {
			title: 'Other objective',
			requestId: randomUUID(),
		});
		await expect(createWork(department.id, otherMember.id)).rejects.toThrow('Assignee');
		await expect(createWork(department.id, undefined, otherGoal.id)).rejects.toThrow('Goal');
		await expect(createWork(department.id, member.id, child.id)).resolves.toMatchObject({
			departmentId: department.id,
			goalId: child.id,
			assigneeMemberId: member.id,
			state: 'backlog',
		});
	});

	it('rejects archived assignees and stale edits without changing persisted work', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		await members.archive(projectId, actorId, department.id, member.id, {
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		expect(await directory.findMember(projectId, department.id, member.id)).toMatchObject({
			id: member.id,
			archived: true,
		});
		const item = await createWork(department.id);

		await expect(
			work.updateWork(projectId, actorId, department.id, item.id, {
				assigneeMemberId: null,
				expectedVersion: item.version - 1,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('has changed');
		await expect(createWork(department.id, member.id)).rejects.toThrow('Assignee');
		expect(await work.getWork(projectId, department.id, item.id)).toMatchObject({
			id: item.id,
			assigneeMemberId: null,
			version: item.version,
		});
	});

	it('blocks member archive while nonterminal work exists', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		await createWork(department.id, member.id);

		await expect(
			members.archive(projectId, actorId, department.id, member.id, {
				expectedVersion: member.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Active work prevents archive');
		expect(await directory.findMember(projectId, department.id, member.id)).toMatchObject({
			id: member.id,
			archived: false,
			version: member.version,
		});
	});

	it('replays identical commands and rejects reuse of a request ID with a different payload', async () => {
		const department = await createDepartment();
		const requestId = randomUUID();
		const command = {
			title: 'Quarterly objective',
			requestId,
		};
		const first = await work.createGoal(projectId, actorId, department.id, command);
		const replay = await work.createGoal(projectId, actorId, department.id, command);
		expect(replay).toEqual(first);
		await expect(
			work.createGoal(projectId, actorId, department.id, {
				title: 'Different objective',
				requestId,
			}),
		).rejects.toThrow('different command');
	});

	it('filters work by state, goal, assignee, and instruction text', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const goal = await work.createGoal(projectId, actorId, department.id, {
			title: 'Research objective',
			requestId: randomUUID(),
		});
		const matching = await createWork(department.id, member.id, goal.id);
		await createWork(department.id);

		const result = await work.listWork(projectId, department.id, {
			state: 'backlog',
			goalId: goal.id,
			assigneeMemberId: member.id,
			search: 'research summary',
			take: 10,
			skip: 0,
		});
		expect(result).toMatchObject({
			count: 1,
			data: [expect.objectContaining({ id: matching.id })],
		});
	});

	it('isolates goal and work reads by project and department', async () => {
		const department = await createDepartment();
		const item = await createWork(department.id);
		expect(await workRepository.findWork(otherProjectId, department.id, item.id)).toBeNull();
		await expect(
			work.listWork(otherProjectId, department.id, { take: 50, skip: 0 }),
		).rejects.toThrow('Department not found');
		expect(await directory.findDepartment(otherProjectId, department.id)).toBeNull();
	});

	it('serializes member archive against work assignment through the admission fence', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const outcomes = await Promise.allSettled([
			createWork(department.id, member.id),
			members.archive(projectId, actorId, department.id, member.id, {
				expectedVersion: member.version,
				requestId: randomUUID(),
			}),
		]);
		const createdWork = outcomes[0].status === 'fulfilled' ? outcomes[0].value : null;
		const archivedMember = await directory.findMember(projectId, department.id, member.id);
		const assignedWork = await workRepository.listWork(projectId, department.id, {
			take: 50,
			skip: 0,
		});

		if (createdWork) {
			expect(archivedMember?.archived).toBe(false);
			expect(assignedWork.data).toContainEqual(
				expect.objectContaining({
					id: createdWork.id,
					assigneeMemberId: member.id,
				}),
			);
		} else {
			expect(archivedMember?.archived).toBe(true);
			expect(assignedWork.data).toEqual([]);
		}
	});

	it('blocks department archive while nonterminal work exists', async () => {
		const department = await createDepartment();
		await createWork(department.id);
		await expect(
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Active work prevents archive');
		expect((await directory.findDepartment(projectId, department.id))?.archived).toBe(false);
	});

	it('keeps department members and terminal work readable after archive', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const item = await createWork(department.id, member.id);
		const cancelled = await work.cancelWork(projectId, actorId, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		expect(cancelled.work.state).toBe('cancelled');

		await departments.archive(projectId, actorId, department.id, {
			expectedVersion: department.version,
			requestId: randomUUID(),
		});
		expect(await departments.get(projectId, department.id)).toMatchObject({
			id: department.id,
			archived: true,
			members: [expect.objectContaining({ id: member.id })],
		});
		expect(await work.getWork(projectId, department.id, item.id)).toMatchObject({
			id: item.id,
			assigneeMemberId: member.id,
			state: 'cancelled',
		});
	});
	it('uses Paperclip blocker direction and rejects a reverse cycle', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const blocker = await createWork(department.id, member.id);
		const blocked = await createWork(department.id, member.id);
		const relationship = await work.createRelationship(
			projectId,
			actorId,
			department.id,
			blocker.id,
			{
				relatedWorkId: blocked.id,
				kind: 'blocks',
				expectedVersion: blocker.version,
				requestId: randomUUID(),
			},
		);
		await expect(
			work.markReady(projectId, actorId, department.id, blocked.id, {
				expectedVersion: blocked.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('blocking work');
		await expect(
			work.createRelationship(projectId, actorId, department.id, blocked.id, {
				relatedWorkId: blocker.id,
				kind: 'blocks',
				expectedVersion: blocked.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('cycle');
		expect(await work.listRelationships(projectId, department.id, blocked.id)).toContainEqual(
			relationship,
		);
		const currentBlocker = await work.getWork(projectId, department.id, blocker.id);
		await work.cancelWork(projectId, actorId, department.id, blocker.id, {
			expectedVersion: currentBlocker.version,
			requestId: randomUUID(),
		});
		expect(
			(
				await work.markReady(projectId, actorId, department.id, blocked.id, {
					expectedVersion: blocked.version,
					requestId: randomUUID(),
				})
			).state,
		).toBe('ready');
	});

	it('enforces one parent and rejects hierarchy cycles and cross-department relationships', async () => {
		const department = await createDepartment();
		const parent = await createWork(department.id);
		const child = await createWork(department.id);
		await work.createRelationship(projectId, actorId, department.id, child.id, {
			relatedWorkId: parent.id,
			kind: 'parent',
			expectedVersion: child.version,
			requestId: randomUUID(),
		});
		await expect(
			work.createRelationship(projectId, actorId, department.id, parent.id, {
				relatedWorkId: child.id,
				kind: 'parent',
				expectedVersion: parent.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('cycle');
		const otherDepartment = await createDepartment();
		const other = await createWork(otherDepartment.id);
		await expect(
			work.createRelationship(projectId, actorId, department.id, parent.id, {
				relatedWorkId: other.id,
				kind: 'parent',
				expectedVersion: parent.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('not found');
		expect(await work.listRelationships(projectId, department.id, parent.id)).toHaveLength(1);
	});
});
