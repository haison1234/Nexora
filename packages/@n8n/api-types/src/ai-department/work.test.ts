import { describe, expect, it } from 'vitest';

import {
	aiDepartmentToolApprovalAttentionDtoSchema,
	aiDepartmentToolApprovalAttentionPageDtoSchema,
	createAiDepartmentWorkActivitySchema,
} from './work';

describe('createAiDepartmentWorkActivitySchema', () => {
	it('trims activity text and enforces the body limit', () => {
		const parsed = createAiDepartmentWorkActivitySchema.parse({
			action: 'comment',
			body: '  Check the updated plan.  ',
			expectedVersion: 2,
			requestId: 'request-1',
		});

		expect(parsed.body).toBe('Check the updated plan.');
		expect(() =>
			createAiDepartmentWorkActivitySchema.parse({
				action: 'progress',
				body: 'x'.repeat(2001),
				expectedVersion: 2,
				requestId: 'request-2',
			}),
		).toThrow();
	});
});

describe('aiDepartmentToolApprovalAttentionDtoSchema', () => {
	it('allows only safe approval attention fields and states', () => {
		expect(
			aiDepartmentToolApprovalAttentionDtoSchema.parse({
				workId: 'work-1',
				attemptId: 'attempt-1',
				memberId: 'member-1',
				ordinal: 1,
				state: 'pending',
			}),
		).toMatchObject({ state: 'pending' });
		expect(() =>
			aiDepartmentToolApprovalAttentionDtoSchema.parse({
				workId: 'work-1',
				attemptId: 'attempt-1',
				memberId: 'member-1',
				ordinal: 1,
				state: 'pending',
				toolPayload: { secret: 'hidden' },
			}),
		).not.toThrow();
		expect(
			aiDepartmentToolApprovalAttentionDtoSchema.parse({
				workId: 'work-1',
				attemptId: 'attempt-1',
				memberId: 'member-1',
				ordinal: 1,
				state: 'pending',
				toolPayload: { secret: 'hidden' },
			}),
		).not.toHaveProperty('toolPayload');
		expect(
			aiDepartmentToolApprovalAttentionPageDtoSchema.parse({ items: [], hasMore: true }),
		).toEqual({ items: [], hasMore: true });
	});
});
