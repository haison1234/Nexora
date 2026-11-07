import { i18nInstance } from '@n8n/i18n';
import { render, screen } from '@testing-library/vue';

import { registerAiDepartmentLocales } from '../ai-department.i18n';
import WorkCompletionReport from './WorkCompletionReport.vue';

describe('WorkCompletionReport', () => {
	const originalLocale = i18nInstance.global.locale.value;

	beforeEach(() => {
		registerAiDepartmentLocales();
		i18nInstance.global.locale.value = 'en';
	});

	afterEach(() => {
		i18nInstance.global.locale.value = originalLocale;
	});

	it('shows each report section and empty states', () => {
		render(WorkCompletionReport, {
			props: {
				report: {
					result: 'The requested work is complete.',
					completedWork: ['Updated the workflow.'],
					checkedEvidence: [{ reference: 'attempt:1', summary: 'The run passed.' }],
					openIssues: ['The optional follow-up needs review.'],
					nextSteps: ['Review the optional follow-up.'],
				},
			},
		});

		expect(screen.getByRole('region', { name: 'Completion report' })).toBeInTheDocument();
		expect(screen.getByText('The requested work is complete.')).toBeInTheDocument();
		expect(screen.getByText('Updated the workflow.')).toBeInTheDocument();
		expect(screen.getByText('The run passed.')).toBeInTheDocument();
		expect(screen.getByText('Review the optional follow-up.')).toBeInTheDocument();
		expect(screen.getByText('Open issues')).toBeInTheDocument();
		expect(screen.getByText('The optional follow-up needs review.')).toBeInTheDocument();
		expect(screen.getByText('Checked evidence')).toBeInTheDocument();
	});
});
