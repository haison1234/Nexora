import { ConflictError, UserError } from '@n8n/errors';
import { mock } from 'vitest-mock-extended';

import { DepartmentService } from '../department.service';
import { MemberService } from '../member.service';
import type { DirectoryRepository } from '../database/repositories/directory.repository';
import type { ActiveDepartmentWorkGuardProxy } from '../active-department-work-guard.contracts';
import type { AgentBindingResolver } from '@/modules/agents/agent-binding-resolver.service';
import type { Department } from '../database/entities/department.entity';
import type { Member } from '../database/entities/member.entity';
import type { OperationContext, TransactionRunner } from '@n8n/db';

const context = { trx: { getIsolationLevel: () => 'READ COMMITTED' } } as OperationContext;

function makeServices() {
	const repository = mock<DirectoryRepository>();
	const txRunner = mock<TransactionRunner>();
	txRunner.run.mockImplementation(async (_ctx, operation) => await operation(context));
	const guard = mock<ActiveDepartmentWorkGuardProxy>({ isRegistered: () => false });
	const agentBindingResolver = mock<AgentBindingResolver>();
	return {
		repository,
		departments: new DepartmentService(repository, txRunner, guard),
		members: new MemberService(repository, txRunner, guard, agentBindingResolver),
	};
}

describe('AI department directory policies', () => {
	it('trims and case folds department names when checking duplicates', async () => {
		const { repository, departments } = makeServices();
		repository.findActiveDepartmentByName.mockResolvedValue(null);
		repository.saveDepartment.mockImplementation(async (row) => ({
			...row,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));
		repository.findReceipt.mockResolvedValue(null);

		const created = await departments.create('project-a', 'user-a', {
			name: '  Marketing  ',
			requestId: 'command-a',
		});

		expect(created.name).toBe('Marketing');
		expect(repository.findActiveDepartmentByName).toHaveBeenCalledWith(
			'project-a',
			'marketing',
			context,
		);
	});

	it('rejects a duplicate normalized department name', async () => {
		const { repository, departments } = makeServices();
		repository.findActiveDepartmentByName.mockResolvedValue(mock<Department>());
		repository.findReceipt.mockResolvedValue(null);

		await expect(
			departments.create('project-a', 'user-a', { name: 'marketing', requestId: 'command-b' }),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.saveDepartment).not.toHaveBeenCalled();
	});

	it('rejects a stale department edit without writing', async () => {
		const { repository, departments } = makeServices();
		repository.findDepartment.mockResolvedValue(mock<Department>({ version: 3 }));
		repository.findReceipt.mockResolvedValue(null);

		await expect(
			departments.update('project-a', 'user-a', 'department-a', {
				name: 'Sales',
				expectedVersion: 2,
				requestId: 'command-c',
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.saveDepartment).not.toHaveBeenCalled();
	});

	it('rejects self-management and manager cycles', async () => {
		const { repository, members } = makeServices();
		repository.findDepartment.mockResolvedValue(mock<Department>({ archived: false }));
		repository.findMember.mockResolvedValue(
			mock<Member>({
				id: 'member-a',
				projectId: 'project-a',
				departmentId: 'department-a',
				version: 1,
			}),
		);
		await expect(
			members.update('project-a', 'user-a', 'department-a', 'member-a', {
				managerMemberId: 'member-a',
				expectedVersion: 1,
				requestId: 'command-d',
			}),
		).rejects.toBeInstanceOf(UserError);

		repository.findMember
			.mockResolvedValueOnce(
				mock<Member>({
					id: 'member-a',
					projectId: 'project-a',
					departmentId: 'department-a',
					version: 1,
				}),
			)
			.mockResolvedValueOnce(
				mock<Member>({
					id: 'member-b',
					managerMemberId: 'member-a',
					projectId: 'project-a',
					departmentId: 'department-a',
				}),
			);
		await expect(
			members.update('project-a', 'user-a', 'department-a', 'member-a', {
				managerMemberId: 'member-b',
				expectedVersion: 1,
				requestId: 'command-e',
			}),
		).rejects.toBeInstanceOf(UserError);
	});

	it('creates members as unconfigured', async () => {
		const { repository, members } = makeServices();
		repository.findDepartment.mockResolvedValue(mock<Department>({ archived: false }));
		repository.saveMember.mockImplementation(async (row) => ({
			...row,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));
		repository.findReceipt.mockResolvedValue(null);

		const created = await members.create('project-a', 'user-a', 'department-a', {
			name: 'Researcher',
			role: 'Research',
			requestId: 'command-f',
		});
		expect(created.executionState).toBe('unconfigured');
		expect(created.managerMemberId).toBeNull();
	});
});
