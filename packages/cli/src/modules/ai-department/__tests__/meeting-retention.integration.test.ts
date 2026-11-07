import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';
import { createMember as createTestUser } from '@test-integration/db/users';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MeetingRepository } from '../database/repositories/meeting.repository';
import { ActiveDepartmentArchiveGuardProxy } from '../active-department-archive-guard.contracts';
import { ActiveDepartmentArchiveGuardImpl } from '../active-department-archive-guard';
import { ActiveDepartmentWorkGuardProxy } from '../active-department-work-guard.contracts';
import { ActiveDepartmentWorkGuardImpl } from '../work/active-department-work-guard';
import { DepartmentService } from '../department.service';
import { MeetingService } from '../meeting.service';
import { MemberService } from '../member.service';
import { WorkService } from '../work/work.service';

describe('AI Department meeting retention after UI removal', () => {
	let actorId: string;
	let projectId: string;
	let departments: DepartmentService;
	let members: MemberService;
	let meetings: MeetingService;
	let meetingRepository: MeetingRepository;
	let work: WorkService;

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
		meetings = Container.get(MeetingService);
		meetingRepository = Container.get(MeetingRepository);
		work = Container.get(WorkService);
		projectId = (await createTeamProject('AI Department meeting retention')).id;
	});

	afterAll(async () => await testDb.terminate());

	it('keeps existing meeting records when coordinators use Work views', async () => {
		const department = await departments.create(projectId, actorId, {
			name: `Department-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const facilitator = await members.create(projectId, actorId, department.id, {
			name: `Facilitator-${randomUUID()}`,
			role: 'Coordinator',
			requestId: randomUUID(),
		});
		const participant = await members.create(projectId, actorId, department.id, {
			name: `Participant-${randomUUID()}`,
			role: 'Research',
			requestId: randomUUID(),
		});
		const created = await meetings.create(projectId, department.id, actorId, {
			purpose: 'decision',
			topic: 'Existing meeting record',
			desiredOutcome: 'Keep this history available.',
			participantMemberIds: [facilitator.id, participant.id],
			facilitatorMemberId: facilitator.id,
			referencedWorkIds: [],
			requestId: randomUUID(),
		});
		const before = await meetingRepository.findMeeting(
			projectId,
			department.id,
			created.meetingId,
			{},
		);
		expect(before).toMatchObject({ id: created.meetingId, topic: 'Existing meeting record' });

		await work.listWork(projectId, department.id, { take: 20, skip: 0 });
		await work.listGoals(projectId, department.id);

		const after = await meetingRepository.findMeeting(
			projectId,
			department.id,
			created.meetingId,
			{},
		);
		expect(after).toMatchObject({
			id: created.meetingId,
			topic: 'Existing meeting record',
			state: 'draft',
			version: before?.version,
		});
		expect(
			await meetingRepository.listMeetings(projectId, department.id, { take: 20, skip: 0 }, {}),
		).toMatchObject([[{ id: created.meetingId }], 1]);
	});
});
