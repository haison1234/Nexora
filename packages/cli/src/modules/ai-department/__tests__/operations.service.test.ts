import { ConflictError, NotFoundError } from '@n8n/errors';
import { mock } from 'vitest-mock-extended';

import type { DirectoryRepository } from '../database/repositories/directory.repository';
import type { Department } from '../database/entities/department.entity';
import type { MemberService } from '../member.service';
import type { WorkService } from '../work/work.service';
import type { WorkHelpService } from '../work/work-help.service';
import { AiDepartmentOperationsService } from '../operations.service';

describe('AiDepartmentOperationsService', () => {
	const directory = mock<DirectoryRepository>();
	const members = mock<MemberService>();
	const work = mock<WorkService>();
	const help = mock<WorkHelpService>();
	const service = new AiDepartmentOperationsService(directory, members, work, help);

	beforeEach(() => vi.clearAllMocks());

	it('returns one snapshot when the projection revision stays stable', async () => {
		directory.findDepartment.mockResolvedValue(
			mock<Department>({
				archived: false,
				projectionSequence: 7,
			}),
		);
		members.list.mockResolvedValue([]);
		work.listWork.mockResolvedValue({ data: [], count: 0 });
		help.listAttention.mockResolvedValue({ items: [], hasMore: false });
		work.listDepartmentActivity.mockResolvedValue({ data: [], count: 0 });

		await expect(service.getSnapshot('project-1', 'department-1')).resolves.toEqual({
			projectId: 'project-1',
			departmentId: 'department-1',
			revision: 7,
			members: [],
			work: { data: [], count: 0 },
			helpRequests: { items: [], hasMore: false },
			activity: { data: [], count: 0 },
		});
	});

	it('retries when a write changes the projection revision during the read', async () => {
		directory.findDepartment
			.mockResolvedValueOnce(mock<Department>({ archived: false, projectionSequence: 7 }))
			.mockResolvedValueOnce(mock<Department>({ archived: false, projectionSequence: 8 }))
			.mockResolvedValueOnce(mock<Department>({ archived: false, projectionSequence: 8 }))
			.mockResolvedValueOnce(mock<Department>({ archived: false, projectionSequence: 8 }));
		members.list.mockResolvedValue([]);
		work.listWork.mockResolvedValue({ data: [], count: 0 });
		help.listAttention.mockResolvedValue({ items: [], hasMore: false });
		work.listDepartmentActivity.mockResolvedValue({ data: [], count: 0 });

		await expect(service.getSnapshot('project-1', 'department-1')).resolves.toMatchObject({
			revision: 8,
		});
		expect(members.list).toHaveBeenCalledTimes(2);
	});

	it('rejects an unstable snapshot after three reads', async () => {
		directory.findDepartment.mockImplementation(async (_projectId, _departmentId) =>
			mock<Department>({ archived: false, projectionSequence: Math.random() * 100 }),
		);
		members.list.mockResolvedValue([]);
		work.listWork.mockResolvedValue({ data: [], count: 0 });
		help.listAttention.mockResolvedValue({ items: [], hasMore: false });
		work.listDepartmentActivity.mockResolvedValue({ data: [], count: 0 });

		await expect(service.getSnapshot('project-1', 'department-1')).rejects.toBeInstanceOf(
			ConflictError,
		);
		expect(members.list).toHaveBeenCalledTimes(3);
	});

	it('does not read data for an archived or missing department', async () => {
		directory.findDepartment.mockResolvedValueOnce(null);
		await expect(service.getSnapshot('project-1', 'department-1')).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(members.list).not.toHaveBeenCalled();
	});
});
