import {
	AI_DEPARTMENT_WORK_COORDINATION_LIMITS as limits,
	aiDepartmentExpertiseTagsSchema,
	aiDepartmentWorkAskSchema,
	aiDepartmentWorkCompletionReportSchema,
	aiDepartmentWorkDelegateSchema,
	aiDepartmentAgentWorkActionSchema,
	aiDepartmentAgentWorkToolResultSchema,
} from '@n8n/api-types';

describe('AI Department work coordination schemas', () => {
	it('accepts a structured completion report and rejects unknown fields', () => {
		const report = {
			result: 'Completed the requested work.',
			completedWork: ['Updated the workflow.'],
			checkedEvidence: [{ reference: 'attempt:123', summary: 'The run passed.' }],
			openIssues: [],
			nextSteps: [],
		};

		expect(aiDepartmentWorkCompletionReportSchema.safeParse(report).success).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({ action: 'submit', expectedVersion: 1, report })
				.success,
		).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({ action: 'submit', body: 'free text' }).success,
		).toBe(false);
		expect(aiDepartmentAgentWorkActionSchema.safeParse({ action: 'comment', report }).success).toBe(
			false,
		);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'claim',
				expectedVersion: 4,
				recipientMemberId: 'member-2',
				title: 'Research cafe competitors',
				instruction: 'Inspect, claim, and report.',
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({ ...report, extra: 'field' }).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({
				...report,
				checkedEvidence: [{ reference: ' ', summary: 'Evidence summary.' }],
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({
				...report,
				checkedEvidence: [{ reference: 'x'.repeat(129), summary: 'Evidence summary.' }],
			}).success,
		).toBe(false);
	});

	it('keeps Agent work tool results focused on the fields needed for the next action', () => {
		const result = aiDepartmentAgentWorkToolResultSchema.parse({
			work: {
				id: 'work-1',
				goalId: null,
				assigneeMemberId: 'member-1',
				instruction: 'Prepare the report.',
				state: 'ready',
				version: 4,
				childReports: [],
				projectId: 'project-1',
				createdAt: '2026-11-07T00:00:00.000Z',
			},
			claim: null,
		});

		if (!('work' in result)) throw new Error('Expected an Agent work result.');
		expect(result).toMatchObject({ work: { id: 'work-1', version: 4, childReports: [] } });
		expect(result.work).not.toHaveProperty('projectId');
		expect(result.work).not.toHaveProperty('createdAt');
	});

	it('enforces report list and character limits', () => {
		const report = {
			result: 'done',
			completedWork: [],
			checkedEvidence: [],
			openIssues: [],
			nextSteps: [],
		};

		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({ ...report, result: ' ' }).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({
				...report,
				completedWork: Array.from({ length: limits.completionListItems + 1 }, () => 'item'),
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({
				...report,
				openIssues: ['x'.repeat(limits.completionListItemChars + 1)],
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkCompletionReportSchema.safeParse({
				...report,
				result: 'x'.repeat(limits.completionResultChars + 1),
			}).success,
		).toBe(false);
	});

	it('enforces ask limits and normalizes unique expertise tags', () => {
		const ask = {
			expectedVersion: 1,
			question: 'How should I proceed?',
			attemptedSteps: ['Checked the current workflow.'],
			reason: 'The provider contract is unclear.',
			expertiseTags: [' Workflow '],
			requestId: 'help-request-1',
		};

		expect(aiDepartmentWorkAskSchema.parse(ask).expertiseTags).toEqual(['workflow']);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'ask',
				expectedVersion: 1,
				question: ask.question,
				attemptedSteps: ask.attemptedSteps,
				reason: ask.reason,
				expertiseTags: ask.expertiseTags,
			}).success,
		).toBe(true);
		expect(
			aiDepartmentWorkAskSchema.safeParse({ ...ask, expertiseTags: ['DevOps', ' devops '] })
				.success,
		).toBe(false);
		expect(
			aiDepartmentWorkAskSchema.safeParse({
				...ask,
				attemptedSteps: Array.from({ length: limits.helpAttemptedSteps + 1 }, () => 'step'),
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkAskSchema.safeParse({
				...ask,
				question: 'x'.repeat(limits.helpQuestionChars + 1),
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkAskSchema.safeParse({
				...ask,
				reason: 'x'.repeat(limits.helpReasonChars + 1),
			}).success,
		).toBe(false);
	});

	it('validates expertise tag count, length, and normalized duplicates', () => {
		expect(aiDepartmentExpertiseTagsSchema.parse([' Data ', ' Workflow '])).toEqual([
			'data',
			'workflow',
		]);
		expect(
			aiDepartmentExpertiseTagsSchema.safeParse(
				Array.from({ length: limits.helpExpertiseTags + 1 }, (_, index) => `tag-${index}`),
			).success,
		).toBe(false);
		expect(
			aiDepartmentExpertiseTagsSchema.safeParse(['x'.repeat(limits.helpExpertiseTagChars + 1)])
				.success,
		).toBe(false);
		expect(aiDepartmentExpertiseTagsSchema.safeParse(['Data', ' data ']).success).toBe(false);
	});

	it('validates bounded delegated work fields', () => {
		const delegation = {
			expectedVersion: 1,
			recipientMemberId: 'member-1',
			title: 'Check the connection',
			instruction: 'Review the connection and report the safe outcome.',
			requestId: 'delegate-request-1',
		};

		expect(aiDepartmentWorkDelegateSchema.safeParse(delegation).success).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'delegate',
				expectedVersion: delegation.expectedVersion,
				recipientMemberId: delegation.recipientMemberId,
				title: delegation.title,
				instruction: delegation.instruction,
			}).success,
		).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({ action: 'delegate', expectedVersion: 1 })
				.success,
		).toBe(false);
		expect(
			aiDepartmentWorkDelegateSchema.safeParse({
				...delegation,
				title: 'x'.repeat(limits.delegatedTitleChars + 1),
			}).success,
		).toBe(false);
		expect(
			aiDepartmentWorkDelegateSchema.safeParse({
				...delegation,
				instruction: 'x'.repeat(limits.delegatedInstructionChars + 1),
			}).success,
		).toBe(false);
	});
});
