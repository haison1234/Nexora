import { describe, expect, it, vi } from 'vitest';
import type { AiDepartmentWorkItemDto } from '@n8n/api-types';

import { resolveWorkDeepLink } from './work-deep-link';

describe('resolveWorkDeepLink', () => {
	it('loads an item that is not in the current work page', async () => {
		const work = { id: 'older-work' } as AiDepartmentWorkItemDto;
		const loadWork = vi.fn().mockResolvedValue(work);

		await expect(resolveWorkDeepLink('older-work', [], loadWork)).resolves.toBe(work);
		expect(loadWork).toHaveBeenCalledWith('older-work');
	});

	it('uses a loaded item without another request', async () => {
		const work = { id: 'listed-work' } as AiDepartmentWorkItemDto;
		const loadWork = vi.fn();

		await expect(resolveWorkDeepLink('listed-work', [work], loadWork)).resolves.toBe(work);
		expect(loadWork).not.toHaveBeenCalled();
	});
});
