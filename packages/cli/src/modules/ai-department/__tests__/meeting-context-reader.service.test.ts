import { UserRepository } from '@n8n/db';
import { AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS } from '@n8n/api-types';
import { mock, type MockProxy } from 'vitest-mock-extended';
import { createHash } from 'node:crypto';

import { userHasScopes } from '@/permissions.ee/check-access';

import type { DirectoryRepository } from '../database/repositories/directory.repository';
import type { MeetingRepository } from '../database/repositories/meeting.repository';
import { MeetingContextReaderService } from '../meeting-context-reader.service';
import type { WorkService } from '../work/work.service';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

describe('MeetingContextReaderService', () => {
	let meetings: MockProxy<MeetingRepository>;
	let directory: MockProxy<DirectoryRepository>;
	let users: MockProxy<UserRepository>;
	let work: MockProxy<WorkService>;
	let service: MeetingContextReaderService;

	const participant = {
		id: 'participant-a',
		memberId: 'member-a',
		memberNameSnapshot: 'Analyst',
		roleSnapshot: 'Risk analyst',
		executorId: 'agent-a',
		bindingVersion: 2,
		responseState: 'pending',
		facilitator: true,
	};
	const secondParticipant = {
		...participant,
		id: 'participant-b',
		memberId: 'member-b',
		roleSnapshot: 'Operations lead',
	};
	const participants = [secondParticipant, participant];

	const meeting = {
		id: 'meeting-a',
		projectId: 'project-a',
		departmentId: 'department-a',
		executionActorId: 'user-a',
		topic: 'Review launch risks',
		purpose: 'risk-review',
		desiredOutcome: 'List the highest risks',
		state: 'collecting',
		goalId: null,
		referencedWorkIds: [],
		collectionClosedAt: null,
		collectionDeadlineAt: new Date(Date.now() + 60_000),
		frozenContributionIds: null,
		absenceSnapshots: [],
	};

	function hashBriefing(value: unknown) {
		return createHash('sha256').update(JSON.stringify(value)).digest('hex');
	}

	function frozenBriefingHash(
		sources: Array<{
			sourceKind: 'goal' | 'work' | 'decision';
			sourceId: string;
			sourceVersion: string;
			snapshotRef: string;
			contentHash: string;
		}> = [],
	) {
		return hashBriefing({
			topic: meeting.topic,
			desiredOutcome: meeting.desiredOutcome,
			goalId: meeting.goalId,
			referencedWorkIds: meeting.referencedWorkIds,
			actorId: meeting.executionActorId,
			participants: [...participants]
				.sort((left, right) => left.memberId.localeCompare(right.memberId))
				.map((item) => ({
					memberId: item.memberId,
					name: item.memberNameSnapshot,
					role: item.roleSnapshot,
					executorId: item.executorId,
					bindingVersion: item.bindingVersion,
				})),
			sources: [...sources]
				.sort((left, right) =>
					`${left.sourceKind}:${left.sourceId}`.localeCompare(
						`${right.sourceKind}:${right.sourceId}`,
					),
				)
				.map((source) => ({
					kind: source.sourceKind,
					sourceId: source.sourceId,
					sourceVersion: source.sourceVersion,
					snapshotRef: source.snapshotRef,
					contentHash: source.contentHash,
				})),
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		meetings = mock<MeetingRepository>();
		directory = mock<DirectoryRepository>();
		users = mock<UserRepository>();
		work = mock<WorkService>();
		service = new MeetingContextReaderService(meetings, directory, users, work);
		vi.mocked(userHasScopes).mockResolvedValue(true);
		meetings.findMeeting.mockResolvedValue(meeting as never);
		meetings.findParticipant.mockResolvedValue(participant as never);
		meetings.findContextSnapshot.mockResolvedValue({
			briefingHash: frozenBriefingHash(),
			toolPolicy: 'supplied-material-only',
		} as never);
		meetings.listParticipants.mockResolvedValue(participants as never);
		meetings.listSources.mockResolvedValue([]);
		directory.findDepartment.mockResolvedValue({ archived: false } as never);
		users.findByIdWithRole.mockResolvedValue({ disabled: false } as never);
	});

	it('includes source meeting, minutes revision, and approver for a carried decision', async () => {
		const source = {
			sourceKind: 'decision' as const,
			sourceId: 'decision-a',
			sourceVersion: '3:2026-11-04T00:00:00.000Z',
			snapshotRef: 'snapshot-a',
			contentHash: 'f'.repeat(64),
			accessState: 'available',
		};
		const content = [
			'Approved decision: Keep the rollout staged.',
			'Source meeting: source-meeting-a',
			'Minutes revision: 3',
			'Approved by: coordinator-a',
		].join('\n');
		const sourceHash = hashBriefing({
			sourceKind: 'decision',
			sourceId: 'decision-a',
			sourceVersion: source.sourceVersion,
			content,
		});
		const decisionSource = {
			...source,
			contentHash: sourceHash,
		};
		meetings.listSources.mockResolvedValue([decisionSource] as never);
		meetings.findApprovedDecisionSource.mockResolvedValue({
			decision: {
				text: 'Keep the rollout staged.',
				approvedBy: 'coordinator-a',
				approvedAt: new Date('2026-11-04T00:00:00.000Z'),
			},
			minutes: { revision: 3 },
			meeting: { id: 'source-meeting-a' },
		} as never);
		meetings.findContextSnapshot.mockResolvedValue({
			briefingHash: frozenBriefingHash([decisionSource]),
			toolPolicy: 'supplied-material-only',
		} as never);

		await expect(
			service.resolve({
				projectId: meeting.projectId,
				departmentId: meeting.departmentId,
				meetingId: meeting.id,
				participantId: participant.id,
				actorId: meeting.executionActorId,
				contextRef: 'context-a',
				round: 'contribution',
			}),
		).resolves.toMatchObject({
			inputText: expect.stringContaining('Source meeting: source-meeting-a'),
		});
	});

	it('resolves only the frozen supplied material for an authorized participant', async () => {
		const resolved = await service.resolve({
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			meetingId: meeting.id,
			participantId: participant.id,
			actorId: meeting.executionActorId,
			contextRef: 'context-a',
			round: 'contribution',
		});
		expect(resolved).toMatchObject({
			contextHash: expect.any(String),
			inputText: expect.stringContaining('Your role: Risk analyst'),
		});
		expect(resolved?.inputText).toContain('Return one JSON object and no other text.');
		expect(resolved?.inputText).toContain(
			'Use exactly these keys: stance, keyPoints, risks, proposedAction.',
		);
	});

	it('builds synthesis context from frozen contributions and recorded absences', async () => {
		meetings.findMeeting.mockResolvedValue({
			...meeting,
			state: 'synthesizing',
			frozenContributionIds: ['contribution-a'],
			absenceSnapshots: [
				{
					participantId: secondParticipant.id,
					lastKnownState: 'failed',
					recordedAt: new Date().toISOString(),
				},
			],
		} as never);
		meetings.listContributions.mockResolvedValue([
			{
				id: 'contribution-a',
				participantId: participant.id,
				contribution: {
					stance: 'disagree',
					keyPoints: ['Keep the rollout staged.'],
					risks: ['A full launch has no rollback window.'],
					proposedAction: 'Run the staged rollout.',
				},
			},
		] as never);

		const resolved = await service.resolve({
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			meetingId: meeting.id,
			participantId: participant.id,
			actorId: meeting.executionActorId,
			contextRef: 'context-a',
			round: 'synthesis',
		});
		expect(resolved?.inputText).toContain('Contribution contribution-a — Analyst (Risk analyst)');
		expect(resolved?.inputText).toContain('Return one JSON object and no other text.');
		expect(resolved?.inputText).toContain(
			'Use exactly these keys: summary, sourceContributionIds, disagreements, decisions, actionItems.',
		);
		expect(resolved?.inputText).toContain('each position must have contributionId and position.');
	});

	it('keeps ten maximum-size contributions inside the synthesis input bound', async () => {
		const frozenContributionIds = Array.from({ length: 10 }, (_, index) => `contribution-${index}`);
		meetings.findMeeting.mockResolvedValue({
			...meeting,
			state: 'synthesizing',
			frozenContributionIds,
		} as never);
		meetings.listContributions.mockResolvedValue(
			frozenContributionIds.map(
				(id) =>
					({
						id,
						participantId: participant.id,
						contribution: {
							stance: 'disagree',
							keyPoints: ['k'.repeat(500), 'k'.repeat(500), 'k'.repeat(500)],
							risks: ['r'.repeat(500), 'r'.repeat(500), 'r'.repeat(500)],
							proposedAction: 'a'.repeat(500),
						},
					}) as never,
			),
		);

		const resolved = await service.resolve({
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			meetingId: meeting.id,
			participantId: participant.id,
			actorId: meeting.executionActorId,
			contextRef: 'context-a',
			round: 'synthesis',
		});

		expect(resolved).not.toBeNull();
		expect(Array.from(resolved?.inputText ?? '').length).toBeLessThanOrEqual(
			AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS,
		);
		for (const id of frozenContributionIds) expect(resolved?.inputText).toContain(id);
	});

	it('fails closed after access loss, a changed snapshot, or a stale source', async () => {
		const input = {
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			meetingId: meeting.id,
			participantId: participant.id,
			actorId: meeting.executionActorId,
			contextRef: 'context-a',
			round: 'contribution' as const,
		};

		vi.mocked(userHasScopes).mockResolvedValue(false);
		await expect(service.resolve(input)).resolves.toBeNull();

		vi.mocked(userHasScopes).mockResolvedValue(true);
		meetings.findContextSnapshot.mockResolvedValue({ briefingHash: 'stale' } as never);
		await expect(service.resolve(input)).resolves.toBeNull();

		meetings.findContextSnapshot.mockResolvedValue({
			briefingHash: frozenBriefingHash(),
		} as never);
		meetings.listSources.mockResolvedValue([
			{
				sourceKind: 'goal',
				sourceId: 'goal-a',
				sourceVersion: '1',
				contentHash: 'a'.repeat(64),
				snapshotRef: 'snapshot-a',
				accessState: 'available',
			},
		] as never);
		work.readMeetingSourceSnapshot.mockResolvedValue(null);
		await expect(service.resolve(input)).resolves.toBeNull();

		meetings.listSources.mockResolvedValue([]);
		meetings.findMeeting.mockResolvedValue(meeting as never);
		meetings.findParticipant.mockResolvedValue({
			...participant,
			responseState: 'submitted',
		} as never);
		await expect(service.resolve(input)).resolves.toBeNull();
	});
});
