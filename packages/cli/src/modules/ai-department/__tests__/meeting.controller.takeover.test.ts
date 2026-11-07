import type { AuthenticatedRequest } from '@n8n/db';
import { ForbiddenError } from '@n8n/errors';
import type { Response } from 'express';
import { mock } from 'vitest-mock-extended';

import { userHasScopes } from '@/permissions.ee/check-access';

import { MeetingController } from '../meeting.controller';
import type { MeetingService } from '../meeting.service';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

describe('MeetingController.takeover', () => {
	const service = mock<MeetingService>();
	const controller = new MeetingController(service);
	const response = mock<Response>();
	const req = mock<AuthenticatedRequest<{ projectId: string; departmentId: string }>>({
		params: { projectId: 'project-1', departmentId: 'department-1' },
		user: { id: 'user-1' },
	});
	const dto = { expectedVersion: 3, requestId: 'request-1' };

	afterEach(() => vi.clearAllMocks());

	it('requires project update access in addition to the route execute scope', async () => {
		vi.mocked(userHasScopes).mockResolvedValue(false);

		await expect(controller.takeover(req, response, 'meeting-1', dto)).rejects.toThrow(
			ForbiddenError,
		);

		expect(userHasScopes).toHaveBeenCalledWith(req.user, ['agent:update'], false, {
			projectId: 'project-1',
		});
		expect(service.takeover).not.toHaveBeenCalled();
	});

	it('takes over after project update access passes', async () => {
		vi.mocked(userHasScopes).mockResolvedValue(true);

		await controller.takeover(req, response, 'meeting-1', dto);

		expect(service.takeover).toHaveBeenCalledWith(
			'project-1',
			'department-1',
			'meeting-1',
			'user-1',
			dto,
		);
	});
});
