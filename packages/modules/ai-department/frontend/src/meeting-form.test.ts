import { describe, expect, it, vi } from 'vitest';

import { getMeetingCallEstimate, getMeetingPurposeTemplate } from './meeting-form';

describe('getMeetingPurposeTemplate', () => {
	it.each(['decision', 'risk-review', 'ideation'] as const)(
		'returns topic and outcome keys for %s',
		(purpose) => {
			const translate = vi.fn((key: string) => key);

			expect(getMeetingPurposeTemplate(purpose, translate)).toEqual({
				topic: `aiDepartment.meeting.template.${purpose}.topic`,
				outcome: `aiDepartment.meeting.template.${purpose}.outcome`,
			});
			expect(translate).toHaveBeenCalledTimes(2);
			expect(translate).toHaveBeenCalledWith(`aiDepartment.meeting.template.${purpose}.outcome`);
		},
	);
});

describe('getMeetingCallEstimate', () => {
	it.each(Array.from({ length: 9 }, (_, index) => index + 2))(
		'estimates one call per participant and one synthesis call for %i participants',
		(participantCount) => {
			expect(getMeetingCallEstimate(participantCount)).toBe(participantCount + 1);
		},
	);

	it.each([0, 1, 11, 12])('does not estimate for %i participants', (participantCount) => {
		expect(getMeetingCallEstimate(participantCount)).toBeNull();
	});
});
