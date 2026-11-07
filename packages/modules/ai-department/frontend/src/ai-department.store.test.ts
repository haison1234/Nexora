import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AiDepartmentMeetingDto } from '@n8n/api-types';

const {
	createMeetingMock,
	listMeetingsMock,
	getMeetingMock,
	getMeetingCommandStatusMock,
	updateMeetingMock,
	startMeetingMock,
	saveMinutesMock,
	approveMinutesMock,
	resolveActionItemMock,
	convertActionItemMock,
	cancelMeetingMock,
	retryParticipantMock,
	retrySynthesisMock,
	excludeParticipantMock,
	takeoverMeetingMock,
	startWorkMock,
	reviewWorkMock,
	reopenWorkReviewMock,
	addWorkActivityMock,
	listMembersMock,
	updateMemberMock,
	listDepartmentsMock,
	listGoalsMock,
	listWorkMock,
	listDepartmentActivityMock,
	listToolApprovalAttentionMock,
} = vi.hoisted(() => ({
	updateMemberMock: vi.fn(),
	createMeetingMock: vi.fn(),
	listMeetingsMock: vi.fn(),
	getMeetingMock: vi.fn(),
	getMeetingCommandStatusMock: vi.fn(),
	updateMeetingMock: vi.fn(),
	startMeetingMock: vi.fn(),
	saveMinutesMock: vi.fn(),
	approveMinutesMock: vi.fn(),
	resolveActionItemMock: vi.fn(),
	convertActionItemMock: vi.fn(),
	cancelMeetingMock: vi.fn(),
	retryParticipantMock: vi.fn(),
	retrySynthesisMock: vi.fn(),
	excludeParticipantMock: vi.fn(),
	takeoverMeetingMock: vi.fn(),
	startWorkMock: vi.fn(),
	reviewWorkMock: vi.fn(),
	reopenWorkReviewMock: vi.fn(),
	addWorkActivityMock: vi.fn(),
	listMembersMock: vi.fn(),
	listDepartmentsMock: vi.fn(),
	listGoalsMock: vi.fn(),
	listWorkMock: vi.fn(),
	listDepartmentActivityMock: vi.fn(),
	listToolApprovalAttentionMock: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
}));

vi.mock('./ai-department.api', async (importOriginal) => ({
	...(await importOriginal<typeof import('./ai-department.api')>()),
	updateDepartmentMember: updateMemberMock,
	createDepartmentMeeting: createMeetingMock,
	listDepartmentMeetings: listMeetingsMock,
	getDepartmentMeeting: getMeetingMock,
	getDepartmentMeetingCommandStatus: getMeetingCommandStatusMock,
	updateDepartmentMeeting: updateMeetingMock,
	startDepartmentMeeting: startMeetingMock,
	saveDepartmentMeetingMinutes: saveMinutesMock,
	approveDepartmentMeetingMinutes: approveMinutesMock,
	resolveDepartmentMeetingActionItem: resolveActionItemMock,
	convertDepartmentMeetingActionItem: convertActionItemMock,
	cancelDepartmentMeeting: cancelMeetingMock,
	retryDepartmentMeetingParticipant: retryParticipantMock,
	retryDepartmentMeetingSynthesis: retrySynthesisMock,
	excludeDepartmentMeetingParticipant: excludeParticipantMock,
	takeoverDepartmentMeeting: takeoverMeetingMock,
	startDepartmentWork: startWorkMock,
	reviewDepartmentWork: reviewWorkMock,
	reopenDepartmentWorkReview: reopenWorkReviewMock,
	addWorkActivity: addWorkActivityMock,
	listWork: listWorkMock,
	listMembers: listMembersMock,
	listDepartments: listDepartmentsMock,
	listGoals: listGoalsMock,
	listDepartmentActivity: listDepartmentActivityMock,
	listToolApprovalAttention: listToolApprovalAttentionMock,
}));

import { useAiDepartmentStore } from './ai-department.store';

describe('useAiDepartmentStore', () => {
	it('sends the current result, round, stage, and review version', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		reviewWorkMock.mockResolvedValue({ work: { id: 'work-1' } });
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		const item = {
			id: 'work-1',
			currentAttemptId: 'attempt-1',
			currentReviewStageIndex: 1,
			reviewStages: [{ id: 'stage-2' }],
			version: 8,
		} as never;
		const attempt = {
			id: 'attempt-1',
			submittedResultId: 'result-1',
			reviewRoundId: 'round-1',
			reviewRoundVersion: 3,
			reviewActiveStageId: 'stage-2',
		} as never;

		await store.review('project-1', item, attempt, 'accept');

		expect(reviewWorkMock.mock.calls[0].slice(1, 4)).toEqual(['project-1', 'department-1', item]);
		expect(reviewWorkMock.mock.calls[0][4]).toMatchObject({
			attemptId: 'attempt-1',
			resultId: 'result-1',
			reviewRoundId: 'round-1',
			stageId: 'stage-2',
			expectedReviewVersion: 3,
			decision: 'accept',
		});
	});

	it('changes a member manager with the current version and reloads members', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		updateMemberMock.mockResolvedValue({});
		listMembersMock.mockResolvedValue([{ id: 'member-1', managerMemberId: 'member-2' }]);

		await store.setMemberManager(
			'project-1',
			{ id: 'member-1', managerMemberId: null, version: 4 } as never,
			'member-2',
		);

		expect(updateMemberMock.mock.calls[0].slice(1, 5)).toEqual([
			'project-1',
			'department-1',
			'member-1',
			expect.objectContaining({ managerMemberId: 'member-2', expectedVersion: 4 }),
		]);
		expect(store.members).toEqual([{ id: 'member-1', managerMemberId: 'member-2' }]);
		expect(store.saving).toBe(false);
	});

	it('reloads members after a rejected manager change so the next attempt uses a fresh version', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		updateMemberMock.mockRejectedValue(new Error('Member has changed. Reload and try again.'));
		listMembersMock.mockResolvedValue([{ id: 'member-1', managerMemberId: null, version: 5 }]);

		await expect(
			store.setMemberManager(
				'project-1',
				{ id: 'member-1', managerMemberId: null, version: 4 } as never,
				'member-2',
			),
		).rejects.toThrow('Member has changed');

		expect(store.members).toEqual([{ id: 'member-1', managerMemberId: null, version: 5 }]);
		expect(store.saving).toBe(false);
	});

	it('saves expertise tags with the current version and reloads members', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		updateMemberMock.mockClear();
		updateMemberMock.mockResolvedValue({});
		listMembersMock.mockResolvedValue([{ id: 'member-1', expertiseTags: ['seo'] }]);

		await store.setMemberExpertise(
			'project-1',
			{ id: 'member-1', expertiseTags: [], version: 2 } as never,
			['seo'],
		);

		expect(updateMemberMock.mock.calls[0][4]).toMatchObject({
			expertiseTags: ['seo'],
			expectedVersion: 2,
		});
		expect(store.members).toEqual([{ id: 'member-1', expertiseTags: ['seo'] }]);
	});

	it('does not call the server when the manager is unchanged', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		updateMemberMock.mockClear();

		await store.setMemberManager(
			'project-1',
			{ id: 'member-1', managerMemberId: 'member-2', version: 4 } as never,
			'member-2',
		);

		expect(updateMemberMock).not.toHaveBeenCalled();
	});

	it('reopens stalled review with the coordinator reason', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		reopenWorkReviewMock.mockResolvedValue({ work: { id: 'work-1', state: 'ready' } });
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		const item = { id: 'work-1', version: 6 } as never;

		await store.reopenReview('project-1', item, 'Reviewer access changed.');

		expect(reopenWorkReviewMock.mock.calls[0].slice(1)).toEqual([
			'project-1',
			'department-1',
			item,
			'Reviewer access changed.',
		]);
	});

	it('loads native tool approvals for the overview attention list', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		listDepartmentsMock.mockResolvedValue([{ id: 'department-1' }]);
		listMembersMock.mockResolvedValue([]);
		listGoalsMock.mockResolvedValue([]);
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		listDepartmentActivityMock.mockResolvedValue({ data: [], count: 0 });
		listToolApprovalAttentionMock.mockResolvedValue({
			items: [
				{
					workId: 'work-1',
					attemptId: 'attempt-1',
					memberId: 'member-1',
					ordinal: 1,
					state: 'pending',
				},
			],
			hasMore: false,
		});

		await store.load('project-1', 'department-1');

		expect(store.toolApprovalAttention).toEqual({
			items: [
				{
					workId: 'work-1',
					attemptId: 'attempt-1',
					memberId: 'member-1',
					ordinal: 1,
					state: 'pending',
				},
			],
			hasMore: false,
		});
		expect(store.toolApprovalLoadFailed).toBe(false);
	});

	it('keeps the last approval list on transient errors and clears it on access loss', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		listDepartmentsMock.mockResolvedValue([{ id: 'department-1' }]);
		listMembersMock.mockResolvedValue([]);
		listGoalsMock.mockResolvedValue([]);
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		listDepartmentActivityMock.mockResolvedValue({ data: [], count: 0 });
		const pending = [
			{
				workId: 'work-1',
				attemptId: 'attempt-1',
				memberId: 'member-1',
				ordinal: 1,
				state: 'pending' as const,
			},
		];
		listToolApprovalAttentionMock
			.mockResolvedValueOnce({ items: pending, hasMore: false })
			.mockRejectedValueOnce(new Error('Network lost'));

		await store.load('project-1', 'department-1');
		await store.refreshQuiet('project-1');

		expect(store.toolApprovalAttention).toEqual({ items: pending, hasMore: false });
		expect(store.toolApprovalLoadFailed).toBe(true);

		listToolApprovalAttentionMock.mockRejectedValueOnce({ httpStatusCode: 403 });
		await store.refreshQuiet('project-1');

		expect(store.toolApprovalAttention).toEqual({ items: [], hasMore: false });
		expect(store.accessLost).toBe(true);
	});

	it('keeps meeting rows after a transient list error and clears the error on retry', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		const meetings = [{ id: 'meeting-1', topic: 'Review' }] as never[];
		listMeetingsMock
			.mockResolvedValueOnce({ items: meetings, total: 1, take: 100, skip: 0 })
			.mockRejectedValueOnce(new Error('Connection lost'))
			.mockResolvedValueOnce({ items: meetings, total: 1, take: 100, skip: 0 });

		await store.loadMeetings('project-1');
		await store.loadMeetings('project-1');
		expect(store.meetings).toEqual(meetings);
		expect(store.meetingsLoadFailed).toBe(true);
		expect(store.meetingsAccessLost).toBe(false);

		await store.loadMeetings('project-1');
		expect(store.meetingsLoadFailed).toBe(false);
		expect(store.meetings).toEqual(meetings);
	});

	it('marks a failed meeting refresh as disconnected when the browser is offline', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		listMeetingsMock
			.mockResolvedValueOnce({ items: [{ id: 'meeting-1' }], total: 1, take: 100, skip: 0 })
			.mockRejectedValueOnce(new Error('Connection lost'));

		await store.loadMeetings('project-1');
		const online = navigator.onLine;
		Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
		try {
			await store.loadMeetings('project-1');
			expect(store.meetingsDisconnected).toBe(true);
			expect(store.meetings).toHaveLength(1);
		} finally {
			Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
		}
	});

	it('clears meeting data when list access is lost', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		store.meetings = [{ id: 'meeting-1', topic: 'Protected topic' }] as never;
		store.meetingDetail = { id: 'meeting-1' } as never;
		listMeetingsMock.mockRejectedValueOnce({ httpStatusCode: 403 });

		await store.loadMeetings('project-1');

		expect(store.meetings).toEqual([]);
		expect(store.meetingDetail).toBeNull();
		expect(store.meetingsAccessLost).toBe(true);
		expect(store.meetingsLoadFailed).toBe(false);
	});

	it('replaces an access-loss state when retry returns a transient error', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		listMeetingsMock
			.mockRejectedValueOnce({ httpStatusCode: 403 })
			.mockRejectedValueOnce({ httpStatusCode: 503 });

		await store.loadMeetings('project-1');
		expect(store.meetingsAccessLost).toBe(true);

		await store.loadMeetings('project-1');
		expect(store.meetingsAccessLost).toBe(false);
		expect(store.meetingsLoadFailed).toBe(true);
	});

	it('shows a loading state and ignores an older meeting list response', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		let resolveOlder: (page: {
			items: never[];
			total: number;
			take: number;
			skip: number;
		}) => void = () => {};
		const olderPage = new Promise<{ items: never[]; total: number; take: number; skip: number }>(
			(resolve) => {
				resolveOlder = resolve;
			},
		);
		listMeetingsMock.mockReturnValueOnce(olderPage).mockResolvedValueOnce({
			items: [{ id: 'newer-meeting' }] as never[],
			total: 1,
			take: 100,
			skip: 0,
		});

		const olderRequest = store.loadMeetings('project-1');
		expect(store.meetingsLoading).toBe(true);
		await store.loadMeetings('project-1');
		resolveOlder({ items: [{ id: 'older-meeting' }] as never[], total: 1, take: 100, skip: 0 });
		await olderRequest;

		expect(store.meetings.map(({ id }) => id)).toEqual(['newer-meeting']);
		expect(store.meetingsLoading).toBe(false);
	});

	it('ignores a pending meeting list after the selected department changes', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		let resolveOlder: (page: {
			items: never[];
			total: number;
			take: number;
			skip: number;
		}) => void = () => {};
		const olderPage = new Promise<{ items: never[]; total: number; take: number; skip: number }>(
			(resolve) => {
				resolveOlder = resolve;
			},
		);
		listMeetingsMock.mockReturnValueOnce(olderPage);
		listMembersMock.mockResolvedValue([]);
		listGoalsMock.mockResolvedValue([]);
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		listDepartmentActivityMock.mockResolvedValue({ data: [], count: 0 });
		listToolApprovalAttentionMock.mockResolvedValue({ items: [], hasMore: false });

		const olderRequest = store.loadMeetings('project-1');
		await store.selectDepartment('project-1', 'department-2');
		resolveOlder({
			items: [{ id: 'old-department-meeting' }] as never[],
			total: 1,
			take: 100,
			skip: 0,
		});
		await olderRequest;

		expect(store.selectedDepartmentId).toBe('department-2');
		expect(store.meetings).toEqual([]);
		expect(store.meetingsLoading).toBe(false);
	});

	it('starts not ready and flips once marked', () => {
		const store = useAiDepartmentStore();

		expect(store.isReady).toBe(false);

		store.markReady();

		expect(store.isReady).toBe(true);
	});

	it('reports a failed activity refresh and keeps the last loaded entries', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		listMembersMock.mockResolvedValue([]);
		listGoalsMock.mockResolvedValue([]);
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		listDepartmentActivityMock
			.mockResolvedValueOnce({ data: [{ id: 'activity-1' }], count: 1 })
			.mockRejectedValueOnce(new Error('Connection lost'))
			.mockResolvedValueOnce({ data: [{ id: 'activity-2' }], count: 1 });

		await store.refreshQuiet('project-1');
		expect(store.activityLoadFailed).toBe(false);
		expect(store.recentActivity).toEqual([{ id: 'activity-1' }]);

		await store.refreshQuiet('project-1');
		expect(store.activityLoadFailed).toBe(true);
		expect(store.recentActivity).toEqual([{ id: 'activity-1' }]);

		await store.refreshQuiet('project-1');
		expect(store.activityLoadFailed).toBe(false);
		expect(store.recentActivity).toEqual([{ id: 'activity-2' }]);
	});

	it('does not let an older work query replace a newer page', async () => {
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		let resolveOlder: (response: { data: never[]; count: number }) => void = () => {};
		const olderResponse = new Promise<{ data: never[]; count: number }>((resolve) => {
			resolveOlder = resolve;
		});
		listWorkMock.mockReturnValueOnce(olderResponse).mockResolvedValueOnce({
			data: [{ id: 'newer-result' }],
			count: 1,
		});

		const olderRequest = store.refreshWork('project-1', { search: 'old' });
		await store.refreshWork('project-1', { search: 'new' });
		resolveOlder({ data: [{ id: 'older-result' }] as never[], count: 9 });
		await olderRequest;

		expect(store.work).toEqual([{ id: 'newer-result' }]);
		expect(store.workCount).toBe(1);
	});

	it('reuses the same start command ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		startWorkMock.mockRejectedValueOnce(new Error('Connection lost'));
		startWorkMock.mockResolvedValueOnce({
			work: { id: 'work-1' },
			attemptId: 'attempt-1',
			dispatchState: 'pending',
		});
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		const work = { id: 'work-1', version: 3 } as never;

		await expect(store.startWork('project-1', work)).rejects.toThrow('Connection lost');
		await store.startWork('project-1', work);

		expect(startWorkMock).toHaveBeenCalledTimes(2);
		expect(startWorkMock.mock.calls[0][4]).toBe(startWorkMock.mock.calls[1][4]);
		expect(startWorkMock.mock.calls[0][5]).toBe(false);
	});

	it('reuses a work activity request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		addWorkActivityMock.mockRejectedValueOnce(new Error('Connection lost'));
		addWorkActivityMock.mockResolvedValueOnce({
			activity: { id: 'activity-1' },
			work: { id: 'work-1' },
		});
		listWorkMock.mockResolvedValue({ data: [], count: 0 });
		const item = { id: 'work-1', version: 3 } as never;

		await expect(
			store.addActivity('project-1', item, 'progress', 'The research is underway.'),
		).rejects.toThrow('Connection lost');
		await store.addActivity('project-1', item, 'progress', 'The research is underway.');

		expect(addWorkActivityMock).toHaveBeenCalledTimes(2);
		expect(addWorkActivityMock.mock.calls[0][4].requestId).toBe(
			addWorkActivityMock.mock.calls[1][4].requestId,
		);
	});

	it('reuses a meeting create request ID when the first response is uncertain', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		createMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		createMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		const input = {
			purpose: 'decision' as const,
			topic: 'Review the proposal',
			desiredOutcome: 'Choose the next step',
			participantMemberIds: ['member-1', 'member-2'],
			facilitatorMemberId: 'member-1',
			approvedDecisionIds: ['decision-1'],
		};

		await expect(store.createMeeting('project-1', input)).rejects.toThrow('Connection lost');
		const stored = sessionStorage.getItem('aiDepartment.pendingMeetingCommands') ?? '';
		expect(stored).toContain(createMeetingMock.mock.calls[0][3].requestId);
		expect(stored).not.toContain(input.topic);
		expect(stored).not.toContain(input.desiredOutcome);
		await store.createMeeting('project-1', input);

		expect(createMeetingMock).toHaveBeenCalledTimes(2);
		expect(createMeetingMock.mock.calls[0][3].requestId).toBe(
			createMeetingMock.mock.calls[1][3].requestId,
		);
		expect(createMeetingMock.mock.calls[1][3].approvedDecisionIds).toEqual(['decision-1']);
		expect(sessionStorage.getItem('aiDepartment.pendingMeetingCommands')).toBe('[]');
	});

	it('offers only approved decisions from an authorized completed source meeting', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		getMeetingMock.mockResolvedValue({
			id: 'meeting-source',
			state: 'completed',
			minutes: [
				{
					revision: 2,
					state: 'approved',
					approvedAt: '2026-11-04T00:00:00.000Z',
					decisions: [
						{ id: 'decision-approved', text: 'Keep the weekly review', state: 'approved' },
						{ id: 'decision-proposed', text: 'Review another option', state: 'proposed' },
						{ id: 'decision-protected', text: '', state: 'approved' },
					],
				},
				{
					revision: 3,
					state: 'draft',
					approvedAt: null,
					decisions: [{ id: 'decision-draft', text: 'Do not include', state: 'approved' }],
				},
			],
		});

		const choices = await store.loadApprovedDecisionChoices('project-1', 'meeting-source');

		expect(choices).toEqual([
			{
				id: 'decision-approved',
				text: 'Keep the weekly review',
				meetingId: 'meeting-source',
				minutesRevision: 2,
			},
		]);
		expect(store.meetingDetail).toBeNull();
	});

	it('reuses the draft update request ID and expected version after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		updateMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		updateMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;
		const changes = { topic: 'Updated topic' };

		await expect(store.updateMeeting('project-1', meeting, changes)).rejects.toThrow(
			'Connection lost',
		);
		await store.updateMeeting('project-1', meeting, changes);

		expect(updateMeetingMock).toHaveBeenCalledTimes(2);
		expect(updateMeetingMock.mock.calls[0][4].requestId).toBe(
			updateMeetingMock.mock.calls[1][4].requestId,
		);
		expect(updateMeetingMock.mock.calls[1][4].expectedVersion).toBe(4);
	});

	it('reuses the meeting start request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		startMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		startMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'collecting' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.startMeeting('project-1', meeting)).rejects.toThrow('Connection lost');
		await store.startMeeting('project-1', meeting);

		expect(startMeetingMock).toHaveBeenCalledTimes(2);
		expect(startMeetingMock.mock.calls[0][4].requestId).toBe(
			startMeetingMock.mock.calls[1][4].requestId,
		);
		expect(startMeetingMock.mock.calls[1][4].expectedVersion).toBe(4);
	});

	it('reuses the minutes save request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		saveMinutesMock.mockRejectedValueOnce(new Error('Connection lost'));
		saveMinutesMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'review' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;
		const content = { summary: 'The team selected a plan.' } as never;

		await expect(store.saveMeetingMinutes('project-1', meeting, content)).rejects.toThrow(
			'Connection lost',
		);
		await store.saveMeetingMinutes('project-1', meeting, content);

		expect(saveMinutesMock).toHaveBeenCalledTimes(2);
		expect(saveMinutesMock.mock.calls[0][4].requestId).toBe(
			saveMinutesMock.mock.calls[1][4].requestId,
		);
		expect(saveMinutesMock.mock.calls[1][4].expectedVersion).toBe(4);
	});

	it('reuses the minutes approval request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		approveMinutesMock.mockRejectedValueOnce(new Error('Connection lost'));
		approveMinutesMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'approved' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.approveMeetingMinutes('project-1', meeting, 'minutes-1')).rejects.toThrow(
			'Connection lost',
		);
		await store.approveMeetingMinutes('project-1', meeting, 'minutes-1');

		expect(approveMinutesMock).toHaveBeenCalledTimes(2);
		expect(approveMinutesMock.mock.calls[0][5].requestId).toBe(
			approveMinutesMock.mock.calls[1][5].requestId,
		);
		expect(approveMinutesMock.mock.calls[1][5].expectedVersion).toBe(4);
	});

	it.each(['approve', 'decline'] as const)(
		'reuses the action item %s request ID after an uncertain response',
		async (decision) => {
			const store = useAiDepartmentStore();
			store.selectedDepartmentId = 'department-1';
			resolveActionItemMock.mockRejectedValueOnce(new Error('Connection lost'));
			resolveActionItemMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
			getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'review' });
			const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

			await expect(
				store.resolveMeetingActionItem(
					'project-1',
					meeting,
					'item-1',
					decision,
					'Coordinator review',
				),
			).rejects.toThrow('Connection lost');
			await store.resolveMeetingActionItem(
				'project-1',
				meeting,
				'item-1',
				decision,
				'Coordinator review',
			);

			expect(resolveActionItemMock).toHaveBeenCalledTimes(2);
			expect(resolveActionItemMock.mock.calls[0][6].requestId).toBe(
				resolveActionItemMock.mock.calls[1][6].requestId,
			);
			expect(resolveActionItemMock.mock.calls[1][6].expectedVersion).toBe(4);
		},
	);

	it('reuses the action item conversion request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		convertActionItemMock.mockRejectedValueOnce(new Error('Connection lost'));
		convertActionItemMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'completed' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(
			store.convertMeetingActionItem('project-1', meeting, 'item-1', 'Approved task'),
		).rejects.toThrow('Connection lost');
		await store.convertMeetingActionItem('project-1', meeting, 'item-1', 'Approved task');

		expect(convertActionItemMock).toHaveBeenCalledTimes(2);
		expect(convertActionItemMock.mock.calls[0][5].requestId).toBe(
			convertActionItemMock.mock.calls[1][5].requestId,
		);
		expect(convertActionItemMock.mock.calls[1][5].expectedVersion).toBe(4);
	});

	it('reuses the same cancellation request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		cancelMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		cancelMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'cancelling' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.cancelMeeting('project-1', meeting)).rejects.toThrow('Connection lost');
		await store.cancelMeeting('project-1', meeting);

		expect(cancelMeetingMock).toHaveBeenCalledTimes(2);
		expect(cancelMeetingMock.mock.calls[0][4].requestId).toBe(
			cancelMeetingMock.mock.calls[1][4].requestId,
		);
	});

	it('reuses the same participant retry request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		retryParticipantMock.mockRejectedValueOnce(new Error('Connection lost'));
		retryParticipantMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'collecting' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(
			store.retryMeetingParticipant('project-1', meeting, 'participant-1'),
		).rejects.toThrow('Connection lost');
		await store.retryMeetingParticipant('project-1', meeting, 'participant-1');

		expect(retryParticipantMock).toHaveBeenCalledTimes(2);
		expect(retryParticipantMock.mock.calls[0][5].requestId).toBe(
			retryParticipantMock.mock.calls[1][5].requestId,
		);
	});

	it('reuses the same synthesis retry request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		retrySynthesisMock.mockRejectedValueOnce(new Error('Connection lost'));
		retrySynthesisMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'synthesizing' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.retryMeetingSynthesis('project-1', meeting)).rejects.toThrow(
			'Connection lost',
		);
		await store.retryMeetingSynthesis('project-1', meeting);

		expect(retrySynthesisMock).toHaveBeenCalledTimes(2);
		expect(retrySynthesisMock.mock.calls[0][4].requestId).toBe(
			retrySynthesisMock.mock.calls[1][4].requestId,
		);
	});

	it('reuses the same participant exclusion request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		excludeParticipantMock.mockRejectedValueOnce(new Error('Connection lost'));
		excludeParticipantMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'collecting' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(
			store.excludeMeetingParticipant('project-1', meeting, 'participant-1', 'No longer available'),
		).rejects.toThrow('Connection lost');
		await store.excludeMeetingParticipant(
			'project-1',
			meeting,
			'participant-1',
			'No longer available',
		);

		expect(excludeParticipantMock).toHaveBeenCalledTimes(2);
		expect(excludeParticipantMock.mock.calls[0][5].requestId).toBe(
			excludeParticipantMock.mock.calls[1][5].requestId,
		);
	});

	it('reuses the same takeover request ID after an uncertain response', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		takeoverMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		takeoverMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'collecting' });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.takeoverMeeting('project-1', meeting)).rejects.toThrow('Connection lost');
		await store.takeoverMeeting('project-1', meeting);

		expect(takeoverMeetingMock).toHaveBeenCalledTimes(2);
		expect(takeoverMeetingMock.mock.calls[0][4].requestId).toBe(
			takeoverMeetingMock.mock.calls[1][4].requestId,
		);
	});

	it('resolves an uncertain command before sending a different meeting command', async () => {
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		cancelMeetingMock.mockRejectedValueOnce(new Error('Connection lost'));
		startMeetingMock.mockResolvedValue({ meetingId: 'meeting-1' });
		getMeetingCommandStatusMock
			.mockResolvedValueOnce({ requestId: 'cancel-request', status: 'pending', meetingId: null })
			.mockResolvedValueOnce({
				requestId: 'cancel-request',
				status: 'completed',
				meetingId: 'meeting-1',
			});
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'cancelled' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });
		const meeting = { id: 'meeting-1', version: 4 } as AiDepartmentMeetingDto;

		await expect(store.cancelMeeting('project-1', meeting)).rejects.toThrow('Connection lost');
		await expect(store.startMeeting('project-1', meeting)).rejects.toThrow(
			'A previous meeting command is still unresolved.',
		);
		expect(startMeetingMock).not.toHaveBeenCalled();

		await store.startMeeting('project-1', meeting);

		expect(getMeetingCommandStatusMock).toHaveBeenCalledTimes(2);
		expect(startMeetingMock).toHaveBeenCalledTimes(1);
		expect(store.meetingDetail).toEqual({ id: 'meeting-1', state: 'cancelled' });
	});

	it('restores an unresolved command after a page reload without storing its content', async () => {
		sessionStorage.setItem(
			'aiDepartment.pendingMeetingCommands',
			JSON.stringify([
				{
					key: 'meeting.cancel:meeting-1',
					requestId: 'persisted-request',
					projectId: 'project-1',
					departmentId: 'department-1',
				},
			]),
		);
		setActivePinia(createPinia());
		const store = useAiDepartmentStore();
		store.selectedDepartmentId = 'department-1';
		getMeetingCommandStatusMock.mockResolvedValueOnce({
			requestId: 'persisted-request',
			status: 'completed',
			meetingId: 'meeting-1',
		});
		startMeetingMock.mockResolvedValueOnce({ meetingId: 'meeting-1' });
		getMeetingMock.mockResolvedValue({ id: 'meeting-1', state: 'cancelled' });
		listMeetingsMock.mockResolvedValue({ items: [], total: 0, take: 100, skip: 0 });

		await store.startMeeting('project-1', {
			id: 'meeting-1',
			version: 4,
		} as AiDepartmentMeetingDto);

		expect(getMeetingCommandStatusMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'department-1',
			'persisted-request',
		);
		expect(startMeetingMock).toHaveBeenCalledTimes(1);
		expect(sessionStorage.getItem('aiDepartment.pendingMeetingCommands')).toBe('[]');
	});
});
