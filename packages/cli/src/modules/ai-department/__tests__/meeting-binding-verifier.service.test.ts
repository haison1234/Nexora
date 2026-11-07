import { mock, type MockProxy } from 'vitest-mock-extended';

import type { DirectoryRepository } from '../database/repositories/directory.repository';
import { MeetingBindingVerifierService } from '../meeting-binding-verifier.service';

describe('MeetingBindingVerifierService', () => {
	let directory: MockProxy<DirectoryRepository>;
	let service: MeetingBindingVerifierService;

	beforeEach(() => {
		directory = mock<DirectoryRepository>();
		service = new MeetingBindingVerifierService(directory);
	});

	it('accepts the active member binding at the frozen version', async () => {
		directory.findMember.mockResolvedValue({ archived: false } as never);
		directory.findBinding.mockResolvedValue({
			provider: 'n8n-agent',
			executorId: 'agent-a',
			version: 3,
		} as never);

		await expect(
			service.isCurrentBinding({
				projectId: 'project-a',
				departmentId: 'department-a',
				memberId: 'member-a',
				executorId: 'agent-a',
				bindingVersion: 3,
			}),
		).resolves.toBe(true);
	});

	it('rejects a changed binding revision', async () => {
		directory.findMember.mockResolvedValue({ archived: false } as never);
		directory.findBinding.mockResolvedValue({
			provider: 'n8n-agent',
			executorId: 'agent-a',
			version: 4,
		} as never);

		await expect(
			service.isCurrentBinding({
				projectId: 'project-a',
				departmentId: 'department-a',
				memberId: 'member-a',
				executorId: 'agent-a',
				bindingVersion: 3,
			}),
		).resolves.toBe(false);
	});

	it('rejects an archived member', async () => {
		directory.findMember.mockResolvedValue({ archived: true } as never);
		directory.findBinding.mockResolvedValue({
			provider: 'n8n-agent',
			executorId: 'agent-a',
			version: 3,
		} as never);

		await expect(
			service.isCurrentBinding({
				projectId: 'project-a',
				departmentId: 'department-a',
				memberId: 'member-a',
				executorId: 'agent-a',
				bindingVersion: 3,
			}),
		).resolves.toBe(false);
	});
});
