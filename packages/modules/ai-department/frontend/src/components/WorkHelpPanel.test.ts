import type { AiDepartmentWorkHelpDetailDto } from '@n8n/api-types';
import { i18nInstance } from '@n8n/i18n';
import { fireEvent, render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import WorkHelpPanel from './WorkHelpPanel.vue';

const detail = {
	request: {
		id: 'help-1',
		workId: 'work-1',
		requesterMemberId: 'member-1',
		sourceAttemptId: 'attempt-1',
		question: 'How should I verify the output?',
		attemptedSteps: ['Checked the workflow run.'],
		reason: 'The result is unclear.',
		expertiseTags: ['workflow'],
		state: 'awaiting_answer',
		routing: {
			state: 'unresolved',
			recipientMemberId: null,
			recipientUserId: null,
			deadlineAt: null,
		},
		createdAt: '2026-11-06T00:00:00.000Z',
		version: 2,
	},
	response: null,
} satisfies AiDepartmentWorkHelpDetailDto;

describe('WorkHelpPanel', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('shows the request and emits a trimmed human answer', async () => {
		const { emitted } = render(WorkHelpPanel, {
			props: { details: [detail], canAnswer: true, submittingRequestId: null },
		});
		expect(screen.getByText(detail.request.question)).toBeInTheDocument();
		expect(screen.getByText('Waiting for your answer')).toBeInTheDocument();
		await fireEvent.update(
			screen.getByRole('textbox', { name: 'Your answer' }),
			'  Check attempt 2.  ',
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
		expect(emitted().answer).toEqual([[detail.request, 'Check attempt 2.']]);
	});

	it('hides the answer form without update permission', () => {
		render(WorkHelpPanel, {
			props: { details: [detail], canAnswer: false, submittingRequestId: null },
		});
		expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
	});
});
