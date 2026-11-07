import type {
	AiDepartmentMemberDto,
	AiDepartmentWorkAttemptDto,
	AiDepartmentWorkWakeStatus,
} from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import RuntimeAttemptList from './RuntimeAttemptList.vue';

const member = {
	id: 'member-1',
	projectId: 'project-1',
	departmentId: 'department-1',
	name: 'Mia',
	role: 'Lead',
	managerMemberId: null,
	expertiseTags: [],
	archived: false,
	version: 1,
	executionState: 'available',
	createdAt: '',
	updatedAt: '',
} satisfies AiDepartmentMemberDto;

const attempt = {
	id: 'attempt-1',
	workId: 'work-1',
	submittedResultId: null,
	reviewRoundId: null,
	reviewRoundVersion: null,
	reviewActiveStageId: null,
	reviewPolicyRevision: 1,
	ordinal: 2,
	memberId: 'member-1',
	provider: 'test-provider',
	executorId: 'executor-1',
	phase: 'stopping',
	nativeToolApproval: 'not_pending',
	outcome: null,
	cancellationPending: true,
	startedAt: '2026-11-05T00:00:00.000Z',
	finishedAt: null,
	reviewRoundStatus: null,
} satisfies AiDepartmentWorkAttemptDto;

const wake = {
	state: 'pending',
	createdAt: '2026-11-05T00:00:00.000Z',
	deliveredAt: null,
} satisfies AiDepartmentWorkWakeStatus;

describe('RuntimeAttemptList', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('shows runtime phase and pending stop separately from outcome', () => {
		render(RuntimeAttemptList, {
			props: { attempts: [attempt], members: [member], wake },
		});

		expect(screen.getByText('Agent runs')).toBeInTheDocument();
		expect(screen.getByText('Run state: Stopping')).toBeInTheDocument();
		expect(screen.getByText('Outcome is pending')).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Stop request is pending confirmation.');
		expect(screen.getByText('Member: Mia')).toBeInTheDocument();
		expect(screen.getByText('Provider: test-provider')).toBeInTheDocument();
		expect(screen.getByText('Agent wake')).toBeInTheDocument();
		expect(screen.getByText('Wake delivery is pending.')).toBeInTheDocument();
	});

	it('does not render a runtime section without attempts', () => {
		render(RuntimeAttemptList, {
			props: { attempts: [], members: [member], wake: { ...wake, state: null } },
		});
		expect(screen.queryByTestId('runtime-attempts')).not.toBeInTheDocument();
		expect(screen.getByText('No wake has been sent for this work.')).toBeInTheDocument();
	});

	it('shows native tool approval separately from the work outcome', () => {
		render(RuntimeAttemptList, {
			props: {
				attempts: [{ ...attempt, phase: 'suspended', nativeToolApproval: 'pending' }],
				members: [member],
				wake,
			},
		});

		expect(screen.getByText('Waiting for native tool approval.')).toBeInTheDocument();
		expect(screen.getByText('Outcome is pending')).toBeInTheDocument();
	});
});
