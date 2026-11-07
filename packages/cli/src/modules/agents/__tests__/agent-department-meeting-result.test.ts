import { describe, expect, it } from 'vitest';

import { parseDepartmentMeetingResult } from '../agent-department-meeting-invocation.contracts';

describe('parseDepartmentMeetingResult', () => {
	it('accepts a bounded structured participant contribution', () => {
		const result = parseDepartmentMeetingResult(
			'contribution',
			JSON.stringify({
				stance: 'disagree',
				keyPoints: ['The delivery date is too early.'],
				risks: ['The review may be incomplete.'],
				proposedAction: 'Add one review day.',
			}),
		);

		expect(result).toMatchObject({
			round: 'contribution',
			contribution: { stance: 'disagree' },
		});
	});

	it('rejects malformed and oversized contribution output', () => {
		expect(parseDepartmentMeetingResult('contribution', 'plain text')).toBeNull();
		expect(
			parseDepartmentMeetingResult(
				'contribution',
				JSON.stringify({
					stance: 'agree',
					keyPoints: [],
					risks: [],
					proposedAction: 'Go',
					extra: true,
				}),
			),
		).toBeNull();
		expect(parseDepartmentMeetingResult('synthesis', '😀'.repeat(4_001))).toBeNull();
	});

	it('enforces per-field and key-point bounds by Unicode code point', () => {
		const atLimit = JSON.stringify({
			stance: 'neutral',
			keyPoints: ['😀'.repeat(500), 'Second point.', 'Third point.'],
			risks: [],
			proposedAction: 'Review the evidence.',
		});
		expect(parseDepartmentMeetingResult('contribution', atLimit)).not.toBeNull();

		const tooLong = JSON.stringify({
			stance: 'neutral',
			keyPoints: ['😀'.repeat(501)],
			risks: [],
			proposedAction: 'Review the evidence.',
		});
		expect(parseDepartmentMeetingResult('contribution', tooLong)).toBeNull();

		const tooManyPoints = JSON.stringify({
			stance: 'neutral',
			keyPoints: ['First.', 'Second.', 'Third.', 'Fourth.'],
			risks: [],
			proposedAction: 'Review the evidence.',
		});
		expect(parseDepartmentMeetingResult('contribution', tooManyPoints)).toBeNull();
	});
});
