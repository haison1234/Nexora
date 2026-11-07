import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { createHash, randomUUID } from 'node:crypto';
import { mock } from 'vitest-mock-extended';
import { createMember as createTestUser } from '@test-integration/db/users';

import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { MeetingService } from '../meeting.service';
import { MeetingRepository } from '../database/repositories/meeting.repository';
import {
	AiDepartmentMeetingActionItem,
	AiDepartmentMeetingContribution,
	AiDepartmentMeetingDecision,
	AiDepartmentMeetingInvocation,
	AiDepartmentMeetingMinutes,
	AiDepartmentMeetingSource,
} from '../database/entities/meeting.entity';
import { DepartmentService } from '../department.service';
import { MemberService } from '../member.service';
import { ActiveDepartmentWorkGuardProxy } from '../active-department-work-guard.contracts';
import { ActiveDepartmentArchiveGuardProxy } from '../active-department-archive-guard.contracts';
import { ActiveDepartmentArchiveGuardImpl } from '../active-department-archive-guard';
import { ActiveDepartmentWorkGuardImpl } from '../work/active-department-work-guard';
import { WorkService } from '../work/work.service';
import {
	DepartmentMeetingInvocationOwnerProxy,
	type DepartmentMeetingInvocationOwner,
	type DepartmentMeetingContributionResult,
} from '@/modules/agents/agent-department-meeting-invocation.contracts';
import { AgentDepartmentMeetingInvocationOwnerService } from '@/modules/agents/agent-department-meeting-invocation-owner.service';
import { createAgentBindingFixture } from '@/modules/agents/testing/agent-binding-fixture';
import { AgentDepartmentMeetingInvocationRepository } from '@/modules/agents/repositories/agent-department-meeting-invocation.repository';

describe('AI Department work planning', () => {
	let departments: DepartmentService;
	let members: MemberService;
	let work: WorkService;
	let directory: DirectoryRepository;
	let workRepository: WorkRepository;
	let meetings: MeetingService;
	let projectId: string;
	let otherProjectId: string;
	let actorId: string;

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		actorId = (await createTestUser()).id;
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
		);
		Container.get(ActiveDepartmentArchiveGuardProxy).register(
			Container.get(ActiveDepartmentArchiveGuardImpl),
		);
		departments = Container.get(DepartmentService);
		members = Container.get(MemberService);
		work = Container.get(WorkService);
		directory = Container.get(DirectoryRepository);
		workRepository = Container.get(WorkRepository);
		meetings = Container.get(MeetingService);
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

	it('records coordinator comments and progress with version checks and idempotent receipts', async () => {
		const department = await createDepartment();
		const item = await createWork(department.id);
		const requestId = randomUUID();
		const command = {
			action: 'comment' as const,
			body: 'The research scope is clear.',
			expectedVersion: item.version,
			requestId,
		};

		const result = await work.addUserWorkActivity(
			projectId,
			actorId,
			department.id,
			item.id,
			command,
		);
		const replay = await work.addUserWorkActivity(
			projectId,
			actorId,
			department.id,
			item.id,
			command,
		);

		expect(result.work.version).toBe(item.version + 1);
		expect(result.activity).toMatchObject({
			actorId,
			actorKind: 'user',
			kind: 'comment',
			body: command.body,
			workVersion: item.version + 1,
		});
		expect(replay).toEqual(result);
		await expect(
			work.listActivity(projectId, department.id, item.id, 10, 0),
		).resolves.toMatchObject({
			count: 2,
			data: expect.arrayContaining([expect.objectContaining({ id: result.activity.id })]),
		});
		await expect(
			work.listDepartmentActivity(projectId, department.id, 5, 0),
		).resolves.toMatchObject({
			count: 2,
			data: expect.arrayContaining([expect.objectContaining({ id: result.activity.id })]),
		});
		await expect(
			work.addUserWorkActivity(projectId, actorId, department.id, item.id, {
				...command,
				body: 'Changed after the request.',
			}),
		).rejects.toThrow('already used');
		await expect(
			work.addUserWorkActivity(projectId, actorId, department.id, item.id, {
				action: 'progress',
				body: 'The work is underway.',
				expectedVersion: item.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Work item has changed');
	});

	it('tracks the user who assigned the current work member', async () => {
		const department = await createDepartment();
		const firstMember = await createMember(department.id);
		const nextMember = await createMember(department.id);
		const assigner = await createTestUser();
		const reassigner = await createTestUser();
		const item = await work.createWork(projectId, assigner.id, department.id, {
			instruction: 'Prepare the research summary',
			assigneeMemberId: firstMember.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		expect(await workRepository.findWork(projectId, department.id, item.id)).toMatchObject({
			assignedByUserId: assigner.id,
		});

		await work.updateWork(projectId, reassigner.id, department.id, item.id, {
			assigneeMemberId: nextMember.id,
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		expect(await workRepository.findWork(projectId, department.id, item.id)).toMatchObject({
			assigneeMemberId: nextMember.id,
			assignedByUserId: reassigner.id,
		});

		const updated = await workRepository.findWork(projectId, department.id, item.id);
		if (!updated) throw new Error('Expected the work item to exist.');
		await work.updateWork(projectId, assigner.id, department.id, item.id, {
			assigneeMemberId: null,
			expectedVersion: updated.version,
			requestId: randomUUID(),
		});
		expect(await workRepository.findWork(projectId, department.id, item.id)).toMatchObject({
			assigneeMemberId: null,
			assignedByUserId: null,
		});
	});

	it('returns only the scoped wake delivery state for work', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const item = await createWork(department.id, member.id);
		expect(await work.getWakeStatus(projectId, department.id, item.id)).toEqual({
			state: null,
			createdAt: null,
			deliveredAt: null,
		});

		await work.markReady(projectId, actorId, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		expect(await work.getWakeStatus(projectId, department.id, item.id)).toMatchObject({
			state: 'pending',
			createdAt: expect.any(String),
			deliveredAt: null,
		});
		const wakeIntent = await workRepository.findWakeIntent(projectId, department.id, item.id);
		if (!wakeIntent) throw new Error('Expected a wake intent.');
		await workRepository.markWakeDelivered(item.id, wakeIntent.requestId);
		expect(await work.getWakeStatus(projectId, department.id, item.id)).toMatchObject({
			state: 'delivered',
			deliveredAt: expect.any(String),
		});
		await expect(work.getWakeStatus(otherProjectId, department.id, item.id)).rejects.toThrow(
			'Work item not found.',
		);
	});

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
		).rejects.toThrow(/prevent archive/);
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

	it('resolves only completed work-create commands for their project and actor', async () => {
		const department = await createDepartment();
		const requestId = randomUUID();
		const created = await work.createWork(projectId, actorId, department.id, {
			instruction: 'Create a bounded research task',
			priority: 'normal',
			reviewPolicy: 'required',
			requestId,
		});

		await expect(work.lookupCreateCommand(projectId, actorId, requestId)).resolves.toEqual({
			kind: 'found',
			work: { id: created.id, projectId, departmentId: department.id },
			payloadHash: expect.any(String),
		});
		await expect(work.lookupCreateCommand(projectId, randomUUID(), requestId)).resolves.toEqual({
			kind: 'absent',
		});
		await expect(work.lookupCreateCommand(otherProjectId, actorId, requestId)).resolves.toEqual({
			kind: 'absent',
		});

		const goalRequestId = randomUUID();
		await work.createGoal(projectId, actorId, department.id, {
			title: 'A different command',
			requestId: goalRequestId,
		});
		await expect(work.lookupCreateCommand(projectId, actorId, goalRequestId)).resolves.toEqual({
			kind: 'conflict',
		});
	});

	it('resumes an uncertain action-item conversion with the same work command', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Create one follow-up task',
			participantMemberIds: [member.id, (await createMember(department.id)).id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const meetingRepository = Container.get(MeetingRepository);
		const meeting = await meetingRepository.findMeeting(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		if (!meeting) throw new Error('Meeting was not created.');
		await meetingRepository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ state: 'approved', version: meeting.version + 1 },
			{},
		);
		const minutesId = randomUUID();
		await meetingRepository.saveMinutes(
			Object.assign(new AiDepartmentMeetingMinutes(), {
				id: minutesId,
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				revision: 1,
				state: 'approved',
				summary: 'Approved follow-up.',
				sourceContributionIds: [],
				disagreements: [],
				authoredBy: actorId,
				approvedBy: actorId,
				approvedAt: new Date(),
			}),
			{},
		);
		const itemId = randomUUID();
		await meetingRepository.saveActionItem(
			Object.assign(new AiDepartmentMeetingActionItem(), {
				id: itemId,
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				minutesId,
				title: 'Prepare the approved follow-up',
				description: 'Write a short research summary.',
				assigneeMemberId: member.id,
				sourceContributionIds: [],
				state: 'proposed',
				workId: null,
				conversionRequestId: null,
				payloadHash: null,
				resolutionReason: null,
				approvedBy: null,
				approvedAt: null,
				resolvedAt: null,
			}),
			{},
		);
		const command = { expectedVersion: meeting.version + 2, requestId: randomUUID() };
		await meetings.resolveActionItem(
			projectId,
			department.id,
			draft.meetingId,
			itemId,
			actorId,
			{ expectedVersion: meeting.version + 1, requestId: randomUUID() },
			'approve',
		);
		const createWorkOriginal = work.createWork.bind(work);
		const createWorkSpy = vi.spyOn(work, 'createWork').mockImplementationOnce(async (...args) => {
			await createWorkOriginal(...args);
			throw new Error('Unknown result');
		});
		const first = await meetings.convertActionItem(
			projectId,
			department.id,
			draft.meetingId,
			itemId,
			actorId,
			command,
		);
		expect(first).toMatchObject({ state: 'converted', actionItemId: itemId });

		const recovered = await meetings.convertActionItem(
			projectId,
			department.id,
			draft.meetingId,
			itemId,
			actorId,
			command,
		);
		expect(recovered).toMatchObject({ state: 'converted', actionItemId: itemId });
		expect(createWorkSpy).toHaveBeenCalledTimes(1);
		const workRequestId = createHash('sha256')
			.update(
				JSON.stringify({
					projectId,
					actorId,
					requestId: command.requestId,
					operation: 'meeting-work-create',
				}),
			)
			.digest('hex')
			.slice(0, 36);
		const commandWork = await work.lookupCreateCommand(projectId, actorId, workRequestId);
		expect(commandWork).toMatchObject({ kind: 'found', work: { id: recovered.workId } });
		const replay = await meetings.convertActionItem(
			projectId,
			department.id,
			draft.meetingId,
			itemId,
			actorId,
			command,
		);
		expect(replay).toEqual(recovered);
		const savedItem = await meetingRepository.findActionItem(
			projectId,
			department.id,
			draft.meetingId,
			itemId,
			{},
		);
		expect(savedItem).toMatchObject({ state: 'converted', workId: recovered.workId });
		const linkedWork = await work.getWork(projectId, department.id, recovered.workId);
		expect(linkedWork).toMatchObject({ state: 'backlog', reviewPolicy: 'required' });
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
		).rejects.toThrow(/prevent archive/);
		expect((await directory.findDepartment(projectId, department.id))?.archived).toBe(false);
	});

	it('blocks department and participant archive while a meeting is active', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const activeWork = await createWork(department.id, first.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Review risks',
			desiredOutcome: 'Agree on next steps',
			participantMemberIds: [first.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const meetingRepository = Container.get(MeetingRepository);
		const meeting = await meetingRepository.findMeeting(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		if (!meeting) throw new Error('Meeting not found');
		await meetingRepository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ state: 'collecting' },
			{},
		);

		await expect(
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining(draft.meetingId),
			meta: {
				blockers: [
					{ kind: 'work', id: activeWork.id },
					{ kind: 'meeting', id: draft.meetingId },
				],
			},
		});
		await expect(
			members.archive(projectId, actorId, department.id, first.id, {
				expectedVersion: first.version,
				requestId: randomUUID(),
			}),
		).rejects.toMatchObject({
			message: expect.stringContaining(activeWork.id),
			meta: {
				blockers: [
					{ kind: 'work', id: activeWork.id },
					{ kind: 'meeting', id: draft.meetingId },
				],
			},
		});
	});

	it('carries forward only decisions approved in the same department', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const second = await createMember(department.id);
		const sourceMeeting = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Prior direction',
			desiredOutcome: 'Approve a direction',
			participantMemberIds: [first.id, second.id],
			facilitatorMemberId: first.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const sourceRecord = await repository.findMeeting(
			projectId,
			department.id,
			sourceMeeting.meetingId,
			{},
		);
		if (!sourceRecord) throw new Error('Source meeting not found');
		await repository.updateMeeting(
			projectId,
			department.id,
			sourceMeeting.meetingId,
			sourceRecord.version,
			{ state: 'approved', version: sourceRecord.version + 1 },
			{},
		);
		const minutesId = randomUUID();
		await repository.saveMinutes(
			Object.assign(new AiDepartmentMeetingMinutes(), {
				id: minutesId,
				projectId,
				departmentId: department.id,
				meetingId: sourceMeeting.meetingId,
				revision: 1,
				state: 'approved',
				summary: 'Approved direction.',
				sourceContributionIds: [randomUUID()],
				disagreements: [],
				authoredBy: actorId,
				approvedBy: actorId,
				approvedAt: new Date(),
			}),
			{},
		);
		const approvedDecision = Object.assign(new AiDepartmentMeetingDecision(), {
			id: randomUUID(),
			projectId,
			departmentId: department.id,
			meetingId: sourceMeeting.meetingId,
			minutesId,
			text: 'Keep the rollout staged.',
			sourceContributionIds: [randomUUID()],
			state: 'approved',
			approvedBy: actorId,
			approvedAt: new Date(),
		});
		const proposedDecision = Object.assign(new AiDepartmentMeetingDecision(), {
			projectId,
			departmentId: department.id,
			meetingId: sourceMeeting.meetingId,
			minutesId,
			id: `proposed-${randomUUID().slice(9)}`,
			text: 'Proposed only.',
			sourceContributionIds: [],
			state: 'proposed',
			approvedBy: null,
			approvedAt: null,
		});
		await repository.saveDecisions([approvedDecision, proposedDecision], {});
		expect(
			await repository.findApprovedDecisionSource(
				projectId,
				department.id,
				proposedDecision.id,
				{},
			),
		).toBeNull();
		const targetParticipants = await Promise.all([
			createMember(department.id),
			createMember(department.id),
		]);
		await expect(
			meetings.create(projectId, department.id, actorId, {
				purpose: 'decision',
				topic: 'Reject a proposal',
				desiredOutcome: 'Confirm the direction',
				participantMemberIds: targetParticipants.map(({ id }) => id),
				facilitatorMemberId: targetParticipants[0].id,
				referencedWorkIds: [],
				approvedDecisionIds: [proposedDecision.id],
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Meeting source is unavailable or not approved.');
		const carried = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Use an approved decision',
			desiredOutcome: 'Confirm the direction',
			participantMemberIds: targetParticipants.map(({ id }) => id),
			facilitatorMemberId: targetParticipants[0].id,
			referencedWorkIds: [],
			approvedDecisionIds: [approvedDecision.id],
			requestId: randomUUID(),
		});
		expect(
			await repository.listSources(projectId, department.id, carried.meetingId, {}),
		).toMatchObject([
			{ sourceKind: 'decision', sourceId: approvedDecision.id, accessState: 'available' },
		]);
	});

	it('resolves only the caller own completed meeting command receipt', async () => {
		const department = await createDepartment();
		const participants = await Promise.all([
			createMember(department.id),
			createMember(department.id),
		]);
		const requestId = randomUUID();
		const created = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Confirm the plan',
			desiredOutcome: 'Select one option',
			participantMemberIds: participants.map(({ id }) => id),
			facilitatorMemberId: participants[0].id,
			referencedWorkIds: [],
			requestId,
		});

		expect(await meetings.getCommandStatus(projectId, department.id, actorId, requestId)).toEqual({
			requestId,
			status: 'completed',
			meetingId: created.meetingId,
		});
		const pendingRequestId = randomUUID();
		await Container.get(MeetingRepository).createOrReadCommandReceipt(
			{
				id: randomUUID(),
				projectId,
				actorId,
				requestId: pendingRequestId,
				payloadHash: 'a'.repeat(64),
				operation: 'meeting.start',
				status: 'pending',
				responseJson: null,
				createdAt: new Date(),
			},
			{},
		);
		expect(
			await meetings.getCommandStatus(projectId, department.id, actorId, pendingRequestId),
		).toEqual({ requestId: pendingRequestId, status: 'pending', meetingId: null });
		expect(
			await meetings.getCommandStatus(projectId, department.id, randomUUID(), requestId),
		).toEqual({ requestId, status: 'unknown', meetingId: null });

		const otherDepartment = await createDepartment();
		expect(
			await meetings.getCommandStatus(projectId, otherDepartment.id, actorId, requestId),
		).toEqual({ requestId, status: 'unknown', meetingId: null });
	});

	it('accepts goal and work references only from the same department', async () => {
		const department = await createDepartment();
		const participant = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const goal = await work.createGoal(projectId, actorId, department.id, {
			title: 'Meeting goal',
			requestId: randomUUID(),
		});
		const referencedWork = await createWork(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Review the project',
			desiredOutcome: 'Agree on next steps',
			participantMemberIds: [participant.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			goalId: goal.id,
			referencedWorkIds: [referencedWork.id],
			requestId: randomUUID(),
		});
		const detail = await meetings.get(projectId, department.id, draft.meetingId);
		expect(detail).toMatchObject({
			goalId: goal.id,
			referencedWorkIds: [referencedWork.id],
			topic: null,
		});

		const otherDepartment = await createDepartment();
		const foreignWork = await createWork(otherDepartment.id);
		await expect(
			meetings.create(projectId, department.id, actorId, {
				purpose: 'decision',
				topic: 'Review foreign work',
				desiredOutcome: 'Reject the reference',
				participantMemberIds: [participant.id, facilitator.id],
				facilitatorMemberId: facilitator.id,
				referencedWorkIds: [foreignWork.id],
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Meeting work references must belong to this department.');
	});

	it('validates active meeting participants and allows edits only before start', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const second = await createMember(department.id);
		const third = await createMember(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Initial topic',
			desiredOutcome: 'Initial outcome',
			participantMemberIds: [first.id, second.id],
			facilitatorMemberId: first.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const edited = await meetings.update(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
			topic: 'Updated topic',
			participantMemberIds: [first.id, third.id],
			facilitatorMemberId: third.id,
		});
		expect(edited).toMatchObject({ state: 'draft', meetingVersion: 2 });
		await expect(
			meetings.update(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: edited.meetingVersion,
				requestId: randomUUID(),
				participantMemberIds: [first.id, first.id],
				facilitatorMemberId: first.id,
			}),
		).rejects.toThrow('Select each participant only once.');
		await expect(
			meetings.update(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: edited.meetingVersion,
				requestId: randomUUID(),
				participantMemberIds: [first.id, second.id],
				facilitatorMemberId: third.id,
			}),
		).rejects.toThrow('The facilitator must be a participant.');

		const archived = await createMember(department.id);
		await members.archive(projectId, actorId, department.id, archived.id, {
			expectedVersion: archived.version,
			requestId: randomUUID(),
		});
		await expect(
			meetings.create(projectId, department.id, actorId, {
				purpose: 'decision',
				topic: 'Archived participant',
				desiredOutcome: 'Reject inactive members',
				participantMemberIds: [first.id, archived.id],
				facilitatorMemberId: first.id,
				referencedWorkIds: [],
				requestId: randomUUID(),
			}),
		).rejects.toThrow('All participants must be active members of this department.');

		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: edited.meetingVersion,
			requestId: randomUUID(),
		});
		await expect(
			meetings.update(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: edited.meetingVersion + 1,
				requestId: randomUUID(),
				topic: 'Too late',
			}),
		).rejects.toThrow('Only draft meetings can be changed.');
	});

	it('freezes current participant details on start and replays the start command', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'risk-review',
			topic: 'Review risks',
			desiredOutcome: 'Agree on next steps',
			participantMemberIds: [first.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const updatedMember = await members.update(projectId, actorId, department.id, first.id, {
			role: 'Risk analyst',
			expectedVersion: first.version,
			requestId: randomUUID(),
		});
		const command = { expectedVersion: draft.meetingVersion, requestId: randomUUID() };

		const started = await meetings.start(
			projectId,
			department.id,
			draft.meetingId,
			actorId,
			command,
		);
		const replayed = await meetings.start(
			projectId,
			department.id,
			draft.meetingId,
			actorId,
			command,
		);
		const detail = await meetings.get(projectId, department.id, draft.meetingId);

		expect(started).toMatchObject({ state: 'collecting', status: 'pending' });
		expect(replayed).toEqual(started);
		expect(detail.purpose).toBe('risk-review');
		expect(detail.participants).toContainEqual(
			expect.objectContaining({ memberId: first.id, role: updatedMember.role, facilitator: false }),
		);
		await expect(
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
		).rejects.toMatchObject({
			meta: { blockers: [{ kind: 'meeting', id: draft.meetingId }] },
		});
	});

	it('durably reserves and dispatches configured participants after meeting start commits', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [member.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		const command = { expectedVersion: draft.meetingVersion, requestId: randomUUID() };
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				...command,
			});
			await meetings.start(projectId, department.id, draft.meetingId, actorId, command);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}

		const repository = Container.get(MeetingRepository);
		const invocations = await repository.listInvocations(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		expect(owner.lookup).toHaveBeenCalledOnce();
		expect(owner.dispatch).toHaveBeenCalledOnce();
		expect(owner.dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				participantId: expect.any(String),
				contextRef: expect.any(String),
				expectedInputHash: invocations[0].inputHash,
			}),
		);
		expect(invocations).toHaveLength(1);
		expect(invocations[0]).toMatchObject({ state: 'queued', ownerInvocationRef: 'owner-ref' });
		const detail = await meetings.get(projectId, department.id, draft.meetingId);
		expect(detail.participants[0].state).toBe('queued');
		expect(detail.participants[0].invocations).toMatchObject([
			{ id: invocations[0].id, state: 'queued' },
		]);
	});

	it('keeps cancellation pending until the Agents owner confirms a terminal snapshot', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [member.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		owner.requestStop.mockResolvedValue({ acknowledged: true, confirmedTerminal: false });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const requested = await meetings.cancel(projectId, department.id, draft.meetingId, actorId, {
				requestId: randomUUID(),
			});
			expect(requested.state).toBe('cancelling');
			const invocation = (
				await Container.get(MeetingRepository).listInvocations(
					projectId,
					department.id,
					draft.meetingId,
					{},
				)
			)[0];
			expect(invocation).toMatchObject({
				state: 'stop_pending',
				stopCommandId: expect.any(String),
			});
			owner.snapshot.mockResolvedValue({
				ownerInvocationRef: 'owner-ref',
				sequence: '1',
				phase: 'stopping',
			});
			await meetings.reconcileInvocation(projectId, department.id, draft.meetingId, invocation.id);
			expect((await meetings.get(projectId, department.id, draft.meetingId)).state).toBe(
				'cancelling',
			);
			owner.snapshot.mockResolvedValue({
				ownerInvocationRef: 'owner-ref',
				sequence: '2',
				phase: 'terminal',
				outcome: 'cancelled',
			});
			await meetings.reconcileInvocation(projectId, department.id, draft.meetingId, invocation.id);
			expect((await meetings.get(projectId, department.id, draft.meetingId)).state).toBe(
				'cancelled',
			);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('allows one idempotent participant retry only after terminal failure proof', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const otherMember = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [member.id, otherMember.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const initial = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			)[0];
			initial.state = 'failed';
			initial.ownerSequence = '1';
			initial.terminalAt = new Date();
			await repository.saveInvocation(initial, {});
			await repository.updateParticipantResponse(
				projectId,
				draft.meetingId,
				initial.participantId,
				'failed',
				{},
			);
			const beforeRetry = await meetings.get(projectId, department.id, draft.meetingId);
			const retry = { expectedVersion: beforeRetry.version, requestId: randomUUID() };
			const accepted = await meetings.retryParticipant(
				projectId,
				department.id,
				draft.meetingId,
				initial.participantId,
				actorId,
				retry,
			);
			const replay = await meetings.retryParticipant(
				projectId,
				department.id,
				draft.meetingId,
				initial.participantId,
				actorId,
				retry,
			);
			expect(replay).toEqual(accepted);
			const rows = await repository.listInvocations(projectId, department.id, draft.meetingId, {});
			expect(rows).toHaveLength(2);
			expect(rows[1]).toMatchObject({
				state: 'queued',
				retryOfInvocationId: initial.id,
				requestKey: expect.not.stringMatching(initial.requestKey),
			});
			expect(owner.dispatch).toHaveBeenCalledTimes(2);
			const afterRetry = await meetings.get(projectId, department.id, draft.meetingId);
			await expect(
				meetings.retryParticipant(
					projectId,
					department.id,
					draft.meetingId,
					initial.participantId,
					actorId,
					{ expectedVersion: afterRetry.version, requestId: randomUUID() },
				),
			).rejects.toThrow('Only one participant retry is allowed.');
			expect(owner.dispatch).toHaveBeenCalledTimes(2);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('takes over future invocation authority without changing the accepted actor', async () => {
		const department = await createDepartment();
		const participant = await createMember(department.id);
		const otherParticipant = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, participant.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: participant.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [participant.id, otherParticipant.id],
			facilitatorMemberId: participant.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const initial = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			)[0];
			const takeoverActorId = randomUUID();
			const beforeTakeover = await meetings.get(projectId, department.id, draft.meetingId);
			const takeoverCommand = {
				expectedVersion: beforeTakeover.version,
				requestId: randomUUID(),
			};
			const takeover = await meetings.takeover(
				projectId,
				department.id,
				draft.meetingId,
				takeoverActorId,
				takeoverCommand,
			);
			expect(
				await meetings.takeover(
					projectId,
					department.id,
					draft.meetingId,
					takeoverActorId,
					takeoverCommand,
				),
			).toEqual(takeover);
			initial.state = 'failed';
			initial.ownerSequence = '1';
			initial.terminalAt = new Date();
			await repository.saveInvocation(initial, {});
			await repository.updateParticipantResponse(
				projectId,
				draft.meetingId,
				initial.participantId,
				'failed',
				{},
			);
			const current = await meetings.get(projectId, department.id, draft.meetingId);
			await meetings.retryParticipant(
				projectId,
				department.id,
				draft.meetingId,
				initial.participantId,
				takeoverActorId,
				{ expectedVersion: current.version, requestId: randomUUID() },
			);
			const rows = await repository.listInvocations(projectId, department.id, draft.meetingId, {});
			expect(rows).toHaveLength(2);
			expect(rows[0].actorId).toBe(actorId);
			expect(rows[1].actorId).toBe(takeoverActorId);
			expect((await meetings.get(projectId, department.id, draft.meetingId)).executionActorId).toBe(
				takeoverActorId,
			);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('allows one synthesis retry after terminal failure', async () => {
		const department = await createDepartment();
		const participants = await Promise.all([
			createMember(department.id, 'Facilitator'),
			createMember(department.id, 'Reviewer'),
		]);
		const agents = await Promise.all([
			createAgentBindingFixture(projectId, true),
			createAgentBindingFixture(projectId, true),
		]);
		for (let index = 0; index < participants.length; index++) {
			await members.setBinding(projectId, actorId, department.id, participants[index].id, {
				provider: 'n8n-agent',
				executorId: agents[index].id,
				expectedVersion: participants[index].version,
				requestId: randomUUID(),
			});
		}
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Record a supported recommendation',
			participantMemberIds: participants.map(({ id }) => id),
			facilitatorMemberId: participants[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const invocations = await repository.listInvocations(
				projectId,
				department.id,
				draft.meetingId,
				{},
			);
			for (const [index, invocation] of invocations.entries()) {
				await repository.acceptContribution(
					Object.assign(new AiDepartmentMeetingContribution(), {
						id: randomUUID(),
						projectId,
						departmentId: department.id,
						meetingId: draft.meetingId,
						participantId: invocation.participantId,
						invocationId: invocation.id,
						contribution: {
							stance: 'neutral',
							keyPoints: [`Review point ${index + 1}.`],
							risks: [],
							proposedAction: 'Review the evidence.',
						},
						sourceContributionIds: [],
						acceptedAt: new Date(),
					}),
					{},
				);
				await repository.updateParticipantResponse(
					projectId,
					draft.meetingId,
					invocation.participantId,
					'submitted',
					{},
				);
			}
			expect(
				await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
			).toBe(true);
			const synthesis = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			).find(({ kind }) => kind === 'synthesis');
			if (!synthesis) throw new Error('Synthesis invocation not found.');
			synthesis.state = 'failed';
			synthesis.ownerSequence = '1';
			synthesis.terminalAt = new Date();
			await repository.saveInvocation(synthesis, {});
			const meeting = await meetings.get(projectId, department.id, draft.meetingId);
			await repository.updateMeeting(
				projectId,
				department.id,
				draft.meetingId,
				meeting.version,
				{ state: 'review', version: meeting.version + 1 },
				{},
			);
			const beforeRetry = await meetings.get(projectId, department.id, draft.meetingId);
			const command = { expectedVersion: beforeRetry.version, requestId: randomUUID() };
			const result = await meetings.retrySynthesis(
				projectId,
				department.id,
				draft.meetingId,
				actorId,
				command,
			);
			expect(
				await meetings.retrySynthesis(projectId, department.id, draft.meetingId, actorId, command),
			).toEqual(result);
			const afterRetry = await repository.listInvocations(
				projectId,
				department.id,
				draft.meetingId,
				{},
			);
			const synthesisRows = afterRetry.filter(({ kind }) => kind === 'synthesis');
			expect(synthesisRows).toHaveLength(2);
			expect(synthesisRows[1]).toMatchObject({
				state: 'queued',
				retryOfInvocationId: synthesis.id,
			});
			expect(owner.dispatch).toHaveBeenCalledTimes(4);
			synthesisRows[1].state = 'failed';
			synthesisRows[1].ownerSequence = '1';
			synthesisRows[1].terminalAt = new Date();
			await repository.saveInvocation(synthesisRows[1], {});
			const retryMeeting = await meetings.get(projectId, department.id, draft.meetingId);
			await repository.updateMeeting(
				projectId,
				department.id,
				draft.meetingId,
				retryMeeting.version,
				{ state: 'review', version: retryMeeting.version + 1 },
				{},
			);
			const failedRetryMeeting = await meetings.get(projectId, department.id, draft.meetingId);
			await expect(
				meetings.retrySynthesis(projectId, department.id, draft.meetingId, actorId, {
					expectedVersion: failedRetryMeeting.version,
					requestId: randomUUID(),
				}),
			).rejects.toThrow('Only one synthesis retry is allowed.');
			expect(owner.dispatch).toHaveBeenCalledTimes(4);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('excludes a participant, requests stop, and rejects its late contribution', async () => {
		const department = await createDepartment();
		const participants = await Promise.all([
			createMember(department.id, 'Facilitator'),
			createMember(department.id, 'Reviewer'),
		]);
		const agents = await Promise.all([
			createAgentBindingFixture(projectId, true),
			createAgentBindingFixture(projectId, true),
		]);
		for (let index = 0; index < participants.length; index++) {
			await members.setBinding(projectId, actorId, department.id, participants[index].id, {
				provider: 'n8n-agent',
				executorId: agents[index].id,
				expectedVersion: participants[index].version,
				requestId: randomUUID(),
			});
		}
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Record a supported recommendation',
			participantMemberIds: participants.map(({ id }) => id),
			facilitatorMemberId: participants[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		owner.requestStop.mockResolvedValue({ acknowledged: true, confirmedTerminal: false });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const participantRows = await repository.listParticipants(
				projectId,
				department.id,
				draft.meetingId,
				{},
			);
			const invocation = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			).find(({ participantId }) => participantId === participantRows[1].id);
			if (!invocation) throw new Error('Participant invocation not found.');
			const before = await meetings.get(projectId, department.id, draft.meetingId);
			const command = {
				expectedVersion: before.version,
				reason: 'Participant is no longer available.',
				requestId: randomUUID(),
			};
			const excluded = await meetings.excludeParticipant(
				projectId,
				department.id,
				draft.meetingId,
				participantRows[1].id,
				actorId,
				command,
			);
			expect(
				await meetings.excludeParticipant(
					projectId,
					department.id,
					draft.meetingId,
					participantRows[1].id,
					actorId,
					command,
				),
			).toEqual(excluded);
			expect(owner.requestStop).toHaveBeenCalledWith(
				expect.objectContaining({ invocationId: invocation.id }),
			);
			const detail = await meetings.get(projectId, department.id, draft.meetingId);
			expect(detail.participants.find(({ id }) => id === participantRows[1].id)).toMatchObject({
				state: 'excluded',
				exclusionReason: command.reason,
				contribution: null,
			});
			owner.snapshot.mockResolvedValue({
				ownerInvocationRef: invocation.ownerInvocationRef!,
				sequence: '1',
				phase: 'terminal',
				outcome: 'succeeded',
			});
			owner.readResult.mockResolvedValue({
				invocationId: invocation.id,
				participantId: invocation.participantId,
				ownerInvocationRef: invocation.ownerInvocationRef!,
				sequence: '1',
				resultHash: 'e'.repeat(64),
				round: 'contribution',
				contribution: {
					stance: 'agree',
					keyPoints: ['This result arrived late.'],
					risks: [],
					proposedAction: 'Keep it out of the accepted set.',
				},
			} satisfies DepartmentMeetingContributionResult);
			await meetings.reconcileInvocation(projectId, department.id, draft.meetingId, invocation.id);
			const afterLateResult = await meetings.get(projectId, department.id, draft.meetingId);
			expect(
				afterLateResult.participants.find(({ id }) => id === participantRows[1].id),
			).toMatchObject({ state: 'excluded', contribution: null });
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('fences a dispatch that returns after cancellation starts', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [member.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.requestStop.mockResolvedValue({ acknowledged: true, confirmedTerminal: false });
		owner.dispatch.mockImplementation(async () => {
			await meetings.cancel(projectId, department.id, draft.meetingId, actorId, {
				requestId: randomUUID(),
			});
			return { kind: 'accepted', ownerInvocationRef: 'late-owner-ref' };
		});
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const invocation = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			)[0];
			expect(owner.requestStop).toHaveBeenCalledWith(
				expect.objectContaining({
					invocationId: invocation.id,
					requestKey: invocation.requestKey,
					expectedInputHash: invocation.inputHash,
				}),
			);
			expect(invocation).toMatchObject({ state: 'stop_pending', ownerInvocationRef: null });
			expect((await meetings.get(projectId, department.id, draft.meetingId)).state).toBe(
				'cancelling',
			);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('completes cancellation after the owner rejects a dispatch behind its tombstone', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: [member.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.requestStop.mockResolvedValue({ acknowledged: true, confirmedTerminal: false });
		owner.dispatch.mockImplementation(async () => {
			await meetings.cancel(projectId, department.id, draft.meetingId, actorId, {
				requestId: randomUUID(),
			});
			return { kind: 'rejected', code: 'cancelled' };
		});
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const invocation = (
				await repository.listInvocations(projectId, department.id, draft.meetingId, {})
			)[0];
			expect(invocation).toMatchObject({
				state: 'cancelled',
				ownerInvocationRef: null,
				safeFailureCode: 'cancelled_before_enqueue',
				terminalAt: expect.any(Date),
			});
			expect((await meetings.get(projectId, department.id, draft.meetingId)).state).toBe(
				'cancelled',
			);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('terminally cancels a reserved Agents owner row after its tombstone is written', async () => {
		const repository = Container.get(AgentDepartmentMeetingInvocationRepository);
		const invocationId = randomUUID();
		const requestKey = randomUUID();
		const inputHash = 'c'.repeat(64);
		const ownerRef = randomUUID();
		const reserved = await repository.reserve({
			id: ownerRef,
			projectId,
			departmentId: randomUUID(),
			meetingId: randomUUID(),
			participantId: randomUUID(),
			invocationId,
			round: 'contribution',
			actorId,
			memberId: randomUUID(),
			executorId: randomUUID(),
			bindingVersion: 1,
			requestKey,
			inputHash,
			contextRef: randomUUID(),
			inputText: 'Bound test context.',
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			toolPolicy: 'supplied-material-only',
			toolPolicyVersion: null,
			threadId: randomUUID(),
			deadlineAt: new Date(Date.now() + 60_000),
		});
		expect(reserved.kind).toBe('created');
		await repository.cancelGate({
			projectId,
			invocationId,
			requestKey,
			inputHash,
			commandId: 'cancel-reserved',
			payloadHash: 'd'.repeat(64),
		});
		const stopped = await repository.requestStop({
			projectId,
			invocationId,
			ownerInvocationRef: ownerRef,
			commandId: 'cancel-reserved',
			payloadHash: 'e'.repeat(64),
		});
		expect(stopped.kind).toBe('terminal');
		if (stopped.kind === 'terminal')
			expect(stopped.invocation).toMatchObject({
				state: 'terminal',
				outcome: 'cancelled',
				safeErrorCode: 'cancelled_before_acceptance',
			});
	});

	it('freezes the quorum contribution set and records each absent participant outcome', async () => {
		const department = await createDepartment();
		const membersInMeeting = await Promise.all([
			createMember(department.id),
			createMember(department.id),
			createMember(department.id),
		]);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: membersInMeeting.map(({ id }) => id),
			facilitatorMemberId: membersInMeeting[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		for (const participant of participants.slice(0, 2)) {
			const invocationId = randomUUID();
			await repository.saveInvocation(
				Object.assign(new AiDepartmentMeetingInvocation(), {
					id: invocationId,
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					participantId: participant.id,
					kind: 'contribution',
					requestKey: randomUUID(),
					inputHash: 'b'.repeat(64),
					contextRef: randomUUID(),
					actorId,
					memberId: participant.memberId,
					executorId: randomUUID(),
					bindingVersion: 1,
					ownerInvocationRef: randomUUID(),
					state: 'succeeded',
					ownerSequence: '1',
					deadlineAt: new Date(Date.now() + 60_000),
					terminalAt: new Date(),
					retryOfInvocationId: null,
					safeFailureCode: null,
					safeFailureSummary: null,
					stopCommandId: null,
				}),
				{},
			);
			await repository.acceptContribution(
				Object.assign(new AiDepartmentMeetingContribution(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					participantId: participant.id,
					invocationId,
					contribution: {
						stance: 'agree',
						keyPoints: ['The option meets the goal.'],
						risks: [],
						proposedAction: 'Proceed with the option.',
					},
					sourceContributionIds: [],
					acceptedAt: new Date(),
				}),
				{},
			);
			await repository.updateParticipantResponse(
				projectId,
				draft.meetingId,
				participant.id,
				'submitted',
				{},
			);
		}

		expect(
			await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
		).toBe(true);
		const detail = await meetings.get(projectId, department.id, draft.meetingId);

		expect(detail.collection).toMatchObject({
			closeReason: 'quorum',
			acceptedContributionIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
			absences: [
				expect.objectContaining({
					participantId: participants[2].id,
					lastKnownState: 'unavailable',
				}),
			],
		});
		expect(
			await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
		).toBe(false);
	});

	it('dispatches one synthesis call and persists cited, attributed minutes', async () => {
		const department = await createDepartment();
		const participants = await Promise.all([
			createMember(department.id, 'Facilitator'),
			createMember(department.id, 'Reviewer'),
		]);
		const agents = await Promise.all([
			createAgentBindingFixture(projectId, true),
			createAgentBindingFixture(projectId, true),
		]);
		for (let index = 0; index < participants.length; index++) {
			await members.setBinding(projectId, actorId, department.id, participants[index].id, {
				provider: 'n8n-agent',
				executorId: agents[index].id,
				expectedVersion: participants[index].version,
				requestId: randomUUID(),
			});
		}
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Approve a sourced recommendation',
			participantMemberIds: participants.map(({ id }) => id),
			facilitatorMemberId: participants[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: 'owner-ref' });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const participantRows = await repository.listParticipants(
				projectId,
				department.id,
				draft.meetingId,
				{},
			);
			const contributionIds: string[] = [];
			for (const [index, participant] of participantRows.entries()) {
				const invocation = (
					await repository.listInvocations(projectId, department.id, draft.meetingId, {})
				).find((row) => row.kind === 'contribution' && row.participantId === participant.id);
				if (!invocation) throw new Error('Participant invocation not found.');
				invocation.state = 'succeeded';
				invocation.ownerSequence = '1';
				invocation.terminalAt = new Date();
				await repository.saveInvocation(invocation, {});
				const contribution = Object.assign(new AiDepartmentMeetingContribution(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					participantId: participant.id,
					invocationId: invocation.id,
					contribution: {
						stance: index === 0 ? 'agree' : 'disagree',
						keyPoints: [
							index === 0 ? 'The option meets the goal.' : 'The rollout needs another review.',
						],
						risks: [],
						proposedAction:
							index === 0 ? 'Approve the staged rollout.' : 'Review the schedule first.',
					},
					sourceContributionIds: [],
					acceptedAt: new Date(),
				});
				const stored = await repository.acceptContribution(contribution, {});
				if (!stored) throw new Error('Contribution was not stored.');
				contributionIds.push(stored.id);
				await repository.updateParticipantResponse(
					projectId,
					draft.meetingId,
					participant.id,
					'submitted',
					{},
				);
			}
			expect(
				await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
			).toBe(true);
			const invocations = await repository.listInvocations(
				projectId,
				department.id,
				draft.meetingId,
				{},
			);
			const synthesisInvocation = invocations.find(({ kind }) => kind === 'synthesis');
			expect(synthesisInvocation).toMatchObject({
				state: 'queued',
				ownerInvocationRef: 'owner-ref',
			});
			expect(owner.dispatch).toHaveBeenCalledTimes(3);
			expect(owner.dispatch).toHaveBeenLastCalledWith(
				expect.objectContaining({
					round: 'synthesis',
					expectedInputHash: synthesisInvocation?.inputHash,
				}),
			);
			if (!synthesisInvocation) throw new Error('Synthesis invocation not found.');
			owner.snapshot.mockResolvedValue({
				ownerInvocationRef: 'owner-ref',
				sequence: '1',
				phase: 'terminal',
				outcome: 'succeeded',
			});
			owner.readResult.mockResolvedValue({
				invocationId: synthesisInvocation.id,
				participantId: synthesisInvocation.participantId,
				ownerInvocationRef: 'owner-ref',
				sequence: '1',
				resultHash: 'a'.repeat(64),
				round: 'synthesis',
				text: JSON.stringify({
					summary: 'The staged rollout meets the goal, but schedule risk remains.',
					sourceContributionIds: contributionIds,
					disagreements: [
						{
							topic: 'Schedule readiness',
							positions: [
								{
									contributionId: contributionIds[0],
									position: 'Proceed with the staged rollout.',
								},
								{ contributionId: contributionIds[1], position: 'Review the schedule first.' },
							],
						},
					],
					decisions: [
						{ text: 'Use a staged rollout.', sourceContributionIds: [contributionIds[0]] },
					],
					actionItems: [
						{ title: 'Review the rollout schedule.', sourceContributionIds: [contributionIds[1]] },
					],
				}),
			});
			await meetings.reconcileInvocation(
				projectId,
				department.id,
				draft.meetingId,
				synthesisInvocation.id,
			);
			const detail = await meetings.get(projectId, department.id, draft.meetingId);
			expect(detail.state).toBe('review');
			expect(detail.minutes[0]).toMatchObject({
				state: 'draft',
				summary: expect.stringContaining('schedule risk'),
				sourceContributionIds: contributionIds,
				disagreements: [
					{
						topic: 'Schedule readiness',
						positions: expect.arrayContaining([
							expect.objectContaining({ contributionId: contributionIds[0] }),
							expect.objectContaining({ contributionId: contributionIds[1] }),
						]),
					},
				],
			});
			expect(detail.minutes[0].decisions).toEqual([
				expect.objectContaining({ text: 'Use a staged rollout.', state: 'proposed' }),
			]);
			expect(detail.minutes[0].actionItems).toEqual([
				expect.objectContaining({ title: 'Review the rollout schedule.', state: 'proposed' }),
			]);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('freezes a partial contribution set when the collection deadline expires', async () => {
		const department = await createDepartment();
		const membersInMeeting = await Promise.all([
			createMember(department.id),
			createMember(department.id),
			createMember(department.id),
		]);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'risk-review',
			topic: 'Review the risk',
			desiredOutcome: 'Record the outcome',
			participantMemberIds: membersInMeeting.map(({ id }) => id),
			facilitatorMemberId: membersInMeeting[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		const meeting = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!meeting) throw new Error('Meeting not found');
		await repository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ collectionDeadlineAt: new Date(Date.now() - 1_000) },
			{},
		);
		const invocationId = randomUUID();
		await repository.saveInvocation(
			Object.assign(new AiDepartmentMeetingInvocation(), {
				id: invocationId,
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				participantId: participants[0].id,
				kind: 'contribution',
				requestKey: randomUUID(),
				inputHash: 'c'.repeat(64),
				contextRef: randomUUID(),
				actorId,
				memberId: participants[0].memberId,
				executorId: randomUUID(),
				bindingVersion: 1,
				ownerInvocationRef: randomUUID(),
				state: 'succeeded',
				ownerSequence: '1',
				deadlineAt: new Date(Date.now() + 60_000),
				terminalAt: new Date(),
				retryOfInvocationId: null,
				safeFailureCode: null,
				safeFailureSummary: null,
				stopCommandId: null,
			}),
			{},
		);
		await repository.acceptContribution(
			Object.assign(new AiDepartmentMeetingContribution(), {
				id: randomUUID(),
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				participantId: participants[0].id,
				invocationId,
				contribution: {
					stance: 'disagree',
					keyPoints: ['The risk remains open.'],
					risks: ['The outcome may be delayed.'],
					proposedAction: 'Keep the review open.',
				},
				sourceContributionIds: [],
				acceptedAt: new Date(),
			}),
			{},
		);

		expect(
			await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
		).toBe(true);
		const detail = await meetings.get(projectId, department.id, draft.meetingId);
		expect(detail.collection.closeReason).toBe('deadline');
		expect(detail.collection.acceptedContributionIds).toHaveLength(1);
		expect(detail.collection.absences).toHaveLength(2);
	});

	it('saves coordinator minutes only with citations from the frozen set', async () => {
		const department = await createDepartment();
		const membersInMeeting = await Promise.all([
			createMember(department.id),
			createMember(department.id),
		]);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose a direction',
			desiredOutcome: 'Record one decision',
			participantMemberIds: membersInMeeting.map(({ id }) => id),
			facilitatorMemberId: membersInMeeting[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		const meeting = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!meeting) throw new Error('Meeting not found');
		await repository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{
				collectionDeadlineAt: new Date(Date.now() - 1_000),
			},
			{},
		);
		for (const participant of participants) {
			const invocationId = randomUUID();
			await repository.saveInvocation(
				Object.assign(new AiDepartmentMeetingInvocation(), {
					id: invocationId,
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					participantId: participant.id,
					kind: 'contribution',
					requestKey: randomUUID(),
					inputHash: 'a'.repeat(64),
					contextRef: randomUUID(),
					actorId,
					memberId: participant.memberId,
					executorId: randomUUID(),
					bindingVersion: 1,
					ownerInvocationRef: randomUUID(),
					state: 'succeeded',
					ownerSequence: '1',
					deadlineAt: new Date(),
					terminalAt: new Date(),
					retryOfInvocationId: null,
					safeFailureCode: null,
					safeFailureSummary: null,
					stopCommandId: null,
				}),
				{},
			);
			await repository.acceptContribution(
				Object.assign(new AiDepartmentMeetingContribution(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					participantId: participant.id,
					invocationId,
					contribution: {
						stance: 'agree',
						keyPoints: ['A point'],
						risks: [],
						proposedAction: 'Proceed',
					},
					sourceContributionIds: [],
					acceptedAt: new Date(),
				}),
				{},
			);
			await repository.updateParticipantResponse(
				projectId,
				draft.meetingId,
				participant.id,
				'submitted',
				{},
			);
		}
		await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId);
		const frozen = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!frozen?.frozenContributionIds) throw new Error('Frozen contributions not found');
		const invalidDto = {
			expectedVersion: frozen.version,
			requestId: randomUUID(),
			summary: 'Summary',
			sourceContributionIds: [randomUUID()],
			disagreements: [],
			decisions: [],
			actionItems: [],
		};
		await expect(
			meetings.saveMinutes(projectId, department.id, draft.meetingId, actorId, invalidDto),
		).rejects.toThrow('Minutes can cite only frozen contributions.');
		const saveDto = {
			...invalidDto,
			requestId: randomUUID(),
			sourceContributionIds: [frozen.frozenContributionIds[0]],
			actionItems: [
				{
					title: 'Follow up on option A',
					sourceContributionIds: [frozen.frozenContributionIds[0]],
				},
				{
					title: 'Follow up on option B',
					sourceContributionIds: [frozen.frozenContributionIds[1]],
				},
			],
		};
		const saved = await meetings.saveMinutes(
			projectId,
			department.id,
			draft.meetingId,
			actorId,
			saveDto,
		);
		expect(saved.revision).toBe(1);
		expect(
			await meetings.saveMinutes(projectId, department.id, draft.meetingId, actorId, saveDto),
		).toEqual(saved);
		await expect(
			meetings.saveMinutes(projectId, department.id, draft.meetingId, actorId, {
				...saveDto,
				summary: 'Changed content',
			}),
		).rejects.toThrow('Request ID was already used for a different command.');
		const afterSave = await meetings.get(projectId, department.id, draft.meetingId);
		expect(afterSave.minutes).toHaveLength(1);
		expect(afterSave.minutes).toMatchObject([
			{ id: saved.minutesId, state: 'draft', authoredBy: actorId },
		]);
		const edited = await meetings.saveMinutes(projectId, department.id, draft.meetingId, actorId, {
			...saveDto,
			expectedVersion: afterSave.version,
			requestId: randomUUID(),
			summary: 'Edited summary',
		});
		expect(edited.revision).toBe(2);
		expect(edited.minutesId).not.toBe(saved.minutesId);
		const afterEdit = await meetings.get(projectId, department.id, draft.meetingId);
		expect(afterEdit.minutes).toHaveLength(2);
		expect(afterEdit.minutes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: saved.minutesId, revision: 1, state: 'draft' }),
				expect.objectContaining({ id: edited.minutesId, revision: 2, summary: 'Edited summary' }),
			]),
		);
		const approveDto = { expectedVersion: afterEdit.version, requestId: randomUUID() };
		const approved = await meetings.approveMinutes(
			projectId,
			department.id,
			draft.meetingId,
			edited.minutesId,
			actorId,
			approveDto,
		);
		expect(approved.state).toBe('approved');
		expect(
			await meetings.approveMinutes(
				projectId,
				department.id,
				draft.meetingId,
				edited.minutesId,
				actorId,
				approveDto,
			),
		).toEqual(approved);
		const afterApproval = await meetings.get(projectId, department.id, draft.meetingId);
		expect(afterApproval.state).toBe('approved');
		expect(afterApproval.minutes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: saved.minutesId, revision: 1, state: 'draft' }),
				expect.objectContaining({ id: edited.minutesId, revision: 2, state: 'approved' }),
			]),
		);
		const approvedRevision = afterApproval.minutes.find(({ id }) => id === edited.minutesId);
		if (!approvedRevision) throw new Error('Approved minutes revision not found.');
		const firstResolutionDto = {
			expectedVersion: afterApproval.version,
			requestId: randomUUID(),
			reason: 'No longer needed',
		};
		const firstResolution = await meetings.resolveActionItem(
			projectId,
			department.id,
			draft.meetingId,
			approvedRevision.actionItems[0].id,
			actorId,
			firstResolutionDto,
			'decline',
		);
		expect(firstResolution.state).toBe('declined');
		expect(
			await meetings.resolveActionItem(
				projectId,
				department.id,
				draft.meetingId,
				approvedRevision.actionItems[0].id,
				actorId,
				firstResolutionDto,
				'decline',
			),
		).toEqual(firstResolution);
		const beforeLastResolution = await meetings.get(projectId, department.id, draft.meetingId);
		const finalRevision = beforeLastResolution.minutes.find(({ id }) => id === edited.minutesId);
		if (!finalRevision) throw new Error('Approved minutes revision not found.');
		const lastResolution = await meetings.resolveActionItem(
			projectId,
			department.id,
			draft.meetingId,
			finalRevision.actionItems[1].id,
			actorId,
			{
				expectedVersion: beforeLastResolution.version,
				requestId: randomUUID(),
				reason: 'Not selected',
			},
			'decline',
		);
		expect(lastResolution.state).toBe('completed');
		await expect(
			meetings.approveMinutes(projectId, department.id, draft.meetingId, saved.minutesId, actorId, {
				expectedVersion: afterSave.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Meeting changed or is not ready for approval.');
	});

	it('closes an empty contribution set when the collection deadline expires', async () => {
		const department = await createDepartment();
		const membersInMeeting = await Promise.all([
			createMember(department.id),
			createMember(department.id),
		]);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose the next step',
			desiredOutcome: 'Record one decision',
			participantMemberIds: membersInMeeting.map(({ id }) => id),
			facilitatorMemberId: membersInMeeting[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		const meeting = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!meeting) throw new Error('Meeting not found');
		await repository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ collectionDeadlineAt: new Date(Date.now() - 1_000) },
			{},
		);

		expect(
			await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
		).toBe(true);
		const detail = await meetings.get(projectId, department.id, draft.meetingId);
		expect(detail.collection).toMatchObject({
			closeReason: 'deadline',
			acceptedContributionIds: [],
		});
		expect(detail.collection.absences).toHaveLength(participants.length);
		expect(detail.collection.absences).toEqual(
			expect.arrayContaining(
				participants.map(({ id }) =>
					expect.objectContaining({ participantId: id, lastKnownState: 'unavailable' }),
				),
			),
		);
		expect(
			await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId),
		).toBe(false);
	});

	it('keeps a late successful result out of an empty frozen set', async () => {
		const department = await createDepartment();
		const membersInMeeting = await Promise.all([
			createMember(department.id),
			createMember(department.id),
		]);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose the next step',
			desiredOutcome: 'Record one decision',
			participantMemberIds: membersInMeeting.map(({ id }) => id),
			facilitatorMemberId: membersInMeeting[0].id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		await meetings.start(projectId, department.id, draft.meetingId, actorId, {
			expectedVersion: draft.meetingVersion,
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		const meeting = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!meeting) throw new Error('Meeting not found');
		await repository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ collectionDeadlineAt: new Date(Date.now() - 1_000) },
			{},
		);
		await meetings.freezeCollectionAtDeadline(projectId, department.id, draft.meetingId);

		const invocationId = randomUUID();
		const ownerRef = randomUUID();
		await repository.saveInvocation(
			Object.assign(new AiDepartmentMeetingInvocation(), {
				id: invocationId,
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				participantId: participants[0].id,
				kind: 'contribution',
				requestKey: randomUUID(),
				inputHash: 'd'.repeat(64),
				contextRef: randomUUID(),
				actorId,
				memberId: participants[0].memberId,
				executorId: randomUUID(),
				bindingVersion: 1,
				ownerInvocationRef: ownerRef,
				state: 'running',
				ownerSequence: '1',
				deadlineAt: new Date(Date.now() + 60_000),
				terminalAt: null,
				retryOfInvocationId: null,
				safeFailureCode: null,
				safeFailureSummary: null,
				stopCommandId: null,
			}),
			{},
		);
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.snapshot.mockResolvedValue({
			ownerInvocationRef: ownerRef,
			sequence: '2',
			phase: 'terminal',
			outcome: 'succeeded',
		});
		owner.readResult.mockResolvedValue({
			invocationId,
			participantId: participants[0].id,
			ownerInvocationRef: ownerRef,
			sequence: '2',
			resultHash: 'e'.repeat(64),
			round: 'contribution',
			contribution: {
				stance: 'agree',
				keyPoints: ['This result arrived late.'],
				risks: [],
				proposedAction: 'Do not add it to the accepted set.',
			},
		} satisfies DepartmentMeetingContributionResult);
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.reconcileInvocation(projectId, department.id, draft.meetingId, invocationId);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}

		expect(
			await repository.listContributions(projectId, department.id, draft.meetingId, {}),
		).toHaveLength(0);
		const detail = await meetings.get(projectId, department.id, draft.meetingId);
		expect(detail.collection.acceptedContributionIds).toEqual([]);
	});

	it('accepts a terminal contribution when reconciliation sees it before a running snapshot', async () => {
		const department = await createDepartment();
		const member = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		await members.setBinding(projectId, actorId, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Choose the next step',
			desiredOutcome: 'Record one decision',
			participantMemberIds: [member.id],
			facilitatorMemberId: member.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const ownerRef = randomUUID();
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		owner.dispatch.mockResolvedValue({ kind: 'accepted', ownerInvocationRef: ownerRef });
		owner.snapshot.mockResolvedValue({
			ownerInvocationRef: ownerRef,
			sequence: '2',
			phase: 'terminal',
			outcome: 'succeeded',
		});
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		const repository = Container.get(MeetingRepository);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const participant = (
				await repository.listParticipants(projectId, department.id, draft.meetingId, {})
			)[0];
			const invocation = (
				await repository.listMeetingInvocations(projectId, department.id, draft.meetingId, {})
			)[0];
			if (!invocation) throw new Error('Missing invocation');
			owner.readResult.mockResolvedValue({
				invocationId: invocation.id,
				participantId: participant.id,
				ownerInvocationRef: ownerRef,
				sequence: '2',
				resultHash: 'e'.repeat(64),
				round: 'contribution',
				contribution: {
					stance: 'agree',
					keyPoints: ['A terminal result can arrive first.'],
					risks: [],
					proposedAction: 'Accept the correlated result.',
				},
			} satisfies DepartmentMeetingContributionResult);
			expect(
				await meetings.reconcileInvocation(
					projectId,
					department.id,
					draft.meetingId,
					invocation.id,
				),
			).toBe(true);
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}

		expect(
			await repository.listContributions(projectId, department.id, draft.meetingId, {}),
		).toHaveLength(1);
	});

	it('requests owner stop when a participant binding changes during a call', async () => {
		const department = await createDepartment();
		const participant = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const agent = await createAgentBindingFixture(projectId, true);
		for (const member of [participant, facilitator]) {
			await members.setBinding(projectId, actorId, department.id, member.id, {
				provider: 'n8n-agent',
				executorId: agent.id,
				expectedVersion: member.version,
				requestId: randomUUID(),
			});
		}
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Revoke a participant binding',
			desiredOutcome: 'Stop the active call after the binding changes',
			participantMemberIds: [participant.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const owner = mock<DepartmentMeetingInvocationOwner>();
		owner.lookup.mockResolvedValue({ kind: 'absent' });
		let ownerRef = 0;
		owner.dispatch.mockImplementation(async () => ({
			kind: 'accepted',
			ownerInvocationRef: `owner-ref-${++ownerRef}`,
		}));
		owner.requestStop.mockResolvedValue({ acknowledged: true, confirmedTerminal: false });
		const ownerProxy = Container.get(DepartmentMeetingInvocationOwnerProxy);
		ownerProxy.register(owner);
		try {
			await meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			});
			const repository = Container.get(MeetingRepository);
			const invocation = (
				await repository.listMeetingInvocations(projectId, department.id, draft.meetingId, {})
			).find((item) => item.memberId === participant.id);
			if (!invocation) throw new Error('Missing participant invocation');
			const currentMember = await directory.findMember(projectId, department.id, participant.id);
			if (!currentMember) throw new Error('Missing participant member');
			await members.clearBinding(projectId, actorId, department.id, participant.id, {
				expectedVersion: currentMember.version,
				requestId: randomUUID(),
			});

			expect(
				await meetings.reconcileInvocation(
					projectId,
					department.id,
					draft.meetingId,
					invocation.id,
				),
			).toBe(true);
			expect(owner.requestStop).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId,
					invocationId: invocation.id,
					requestKey: invocation.requestKey,
					expectedInputHash: invocation.inputHash,
					ownerInvocationRef: invocation.ownerInvocationRef,
				}),
			);
			expect(
				await repository.findInvocation(
					projectId,
					department.id,
					draft.meetingId,
					invocation.id,
					{},
				),
			).toMatchObject({ state: 'stop_pending', stopCommandId: expect.any(String) });
		} finally {
			ownerProxy.register(Container.get(AgentDepartmentMeetingInvocationOwnerService));
		}
	});

	it('does not return structured contributions when meeting bodies are protected', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Review risks',
			desiredOutcome: 'Agree on next steps',
			participantMemberIds: [first.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const repository = Container.get(MeetingRepository);
		const participants = await repository.listParticipants(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);
		const invocationId = randomUUID();
		await repository.saveInvocation(
			Object.assign(new AiDepartmentMeetingInvocation(), {
				id: invocationId,
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				participantId: participants[0].id,
				kind: 'contribution',
				requestKey: randomUUID(),
				inputHash: 'a'.repeat(64),
				contextRef: randomUUID(),
				actorId,
				memberId: first.id,
				executorId: randomUUID(),
				bindingVersion: 1,
				ownerInvocationRef: randomUUID(),
				state: 'succeeded',
				ownerSequence: '1',
				deadlineAt: new Date(Date.now() + 60_000),
				terminalAt: new Date(),
				retryOfInvocationId: null,
				safeFailureCode: null,
				safeFailureSummary: null,
				stopCommandId: null,
			}),
			{},
		);
		await repository.acceptContribution(
			Object.assign(new AiDepartmentMeetingContribution(), {
				id: randomUUID(),
				projectId,
				departmentId: department.id,
				meetingId: draft.meetingId,
				participantId: participants[0].id,
				invocationId,
				contribution: {
					stance: 'disagree',
					keyPoints: ['Keep the review open.'],
					risks: [],
					proposedAction: 'Review again tomorrow.',
				},
				sourceContributionIds: [],
				acceptedAt: new Date(),
			}),
			{},
		);
		const meeting = await repository.findMeeting(projectId, department.id, draft.meetingId, {});
		if (!meeting) throw new Error('Meeting not found');
		const goal = await work.createGoal(projectId, actorId, department.id, {
			title: 'Protected meeting goal',
			requestId: randomUUID(),
		});
		await repository.updateMeeting(
			projectId,
			department.id,
			draft.meetingId,
			meeting.version,
			{ goalId: goal.id },
			{},
		);
		await repository.saveSources(
			[
				Object.assign(new AiDepartmentMeetingSource(), {
					id: randomUUID(),
					projectId,
					departmentId: department.id,
					meetingId: draft.meetingId,
					sourceKind: 'goal',
					sourceId: goal.id,
					sourceVersion: '1',
					snapshotRef: randomUUID(),
					contentHash: 'f'.repeat(64),
					labelSnapshot: null,
					accessState: 'available',
				}),
			],
			{},
		);

		const detail = await meetings.get(projectId, department.id, draft.meetingId);

		expect(detail.participants).toContainEqual(
			expect.objectContaining({ memberId: first.id, contribution: null }),
		);
	});

	it('serializes meeting start against department archive on the shared fence', async () => {
		const department = await createDepartment();
		const first = await createMember(department.id);
		const facilitator = await createMember(department.id);
		const draft = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Review risks',
			desiredOutcome: 'Agree on next steps',
			participantMemberIds: [first.id, facilitator.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const outcomes = await Promise.allSettled([
			meetings.start(projectId, department.id, draft.meetingId, actorId, {
				expectedVersion: draft.meetingVersion,
				requestId: randomUUID(),
			}),
			departments.archive(projectId, actorId, department.id, {
				expectedVersion: department.version,
				requestId: randomUUID(),
			}),
		]);
		const started = outcomes[0].status === 'fulfilled';
		const archived = await directory.findDepartment(projectId, department.id);
		const currentMeeting = await Container.get(MeetingRepository).findMeeting(
			projectId,
			department.id,
			draft.meetingId,
			{},
		);

		if (started) {
			expect(archived?.archived).toBe(false);
			expect(currentMeeting?.state).toBe('collecting');
		} else {
			expect(archived?.archived).toBe(true);
			expect(currentMeeting?.state).toBe('draft');
		}
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
		).rejects.toThrow('Resolve all blocking work before marking this item ready.');
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
		await expect(
			work.markReady(projectId, actorId, department.id, blocked.id, {
				expectedVersion: blocked.version,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('Resolve all blocking work before marking this item ready.');
		const blockerAfterCancellation = await work.getWork(projectId, department.id, blocker.id);
		await work.deleteRelationship(projectId, actorId, department.id, blocker.id, relationship.id, {
			expectedVersion: blockerAfterCancellation.version,
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
