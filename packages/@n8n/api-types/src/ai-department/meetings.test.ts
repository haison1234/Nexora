import { describe, expect, it } from 'vitest';

import {
	AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS,
	AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS,
	aiDepartmentMeetingStructuredContributionSchema,
	aiDepartmentMeetingCommandStatusDtoSchema,
	CreateAiDepartmentMeetingDto,
} from './meetings';

describe('aiDepartmentMeetingStructuredContributionSchema', () => {
	const valid = {
		stance: 'neutral' as const,
		keyPoints: ['A useful point'],
		risks: [],
		proposedAction: 'Review the result',
	};

	it('accepts bounded structured contributions', () => {
		expect(aiDepartmentMeetingStructuredContributionSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects extra fields, too many points, and oversized Unicode fields', () => {
		expect(
			aiDepartmentMeetingStructuredContributionSchema.safeParse({ ...valid, extra: 'value' })
				.success,
		).toBe(false);
		expect(
			aiDepartmentMeetingStructuredContributionSchema.safeParse({
				...valid,
				keyPoints: ['1', '2', '3', '4'],
			}).success,
		).toBe(false);
		expect(
			aiDepartmentMeetingStructuredContributionSchema.safeParse({
				...valid,
				proposedAction: '😀'.repeat(AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS + 1),
			}).success,
		).toBe(false);
	});

	it('keeps the serialized payload within the total Unicode limit', () => {
		const tooLarge = {
			stance: 'agree' as const,
			keyPoints: [
				'😀'.repeat(AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS),
				'😀'.repeat(500),
				'😀'.repeat(500),
			],
			risks: ['😀'.repeat(500), '😀'.repeat(500), '😀'.repeat(500)],
			proposedAction: '😀'.repeat(500),
			padding: '😀'.repeat(500),
		};
		expect(Array.from(JSON.stringify(tooLarge)).length).toBeGreaterThan(
			AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS,
		);
		expect(aiDepartmentMeetingStructuredContributionSchema.safeParse(tooLarge).success).toBe(false);
	});
});

describe('CreateAiDepartmentMeetingDto', () => {
	it('accepts supported purposes and defaults to a decision meeting', () => {
		const input = {
			topic: 'Choose a direction',
			desiredOutcome: 'Select one option',
			participantMemberIds: ['member-a', 'member-b'],
			facilitatorMemberId: 'member-a',
			approvedDecisionIds: ['decision-a'],
			requestId: 'request-a',
		};
		expect(CreateAiDepartmentMeetingDto.safeParse(input).data).toMatchObject({
			purpose: 'decision',
			approvedDecisionIds: ['decision-a'],
		});
		expect(
			CreateAiDepartmentMeetingDto.safeParse({ ...input, purpose: 'risk-review' }).success,
		).toBe(true);
		expect(
			CreateAiDepartmentMeetingDto.safeParse({ ...input, purpose: 'unsupported' }).success,
		).toBe(false);
	});
});

describe('aiDepartmentMeetingCommandStatusDtoSchema', () => {
	it('accepts pending, completed, and unknown outcomes without a result body', () => {
		for (const status of ['pending', 'completed', 'unknown'] as const) {
			expect(
				aiDepartmentMeetingCommandStatusDtoSchema.safeParse({
					requestId: 'request-a',
					status,
					meetingId: status === 'completed' ? 'meeting-a' : null,
				}).success,
			).toBe(true);
		}
	});
});
