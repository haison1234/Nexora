import { ProjectRelationRepository } from '@n8n/db';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { DirectoryRepository } from '../database/repositories/directory.repository';
import type { Member } from '../database/entities/member.entity';
import type { DepartmentExecutorProxy } from '../work/executor.contracts';
import { WorkHelpRoutingService } from '../work/work-help-routing.service';

describe('WorkHelpRoutingService', () => {
	let directory: MockProxy<DirectoryRepository>;
	let executor: MockProxy<DepartmentExecutorProxy>;
	let projectRelations: MockProxy<ProjectRelationRepository>;
	let service: WorkHelpRoutingService;

	beforeEach(() => {
		directory = mock<DirectoryRepository>();
		executor = mock<DepartmentExecutorProxy>();
		projectRelations = mock<ProjectRelationRepository>();
		service = new WorkHelpRoutingService(directory, executor, projectRelations);
	});

	it('checks current executor availability before selecting the expertise specialist', async () => {
		directory.listMembers.mockResolvedValue([
			{
				id: 'member-specialist',
				projectId: 'project-1',
				departmentId: 'department-1',
				archived: false,
				expertiseTags: ['workflow'],
			} as Member,
		]);
		directory.findBinding.mockResolvedValue({
			memberId: 'member-specialist',
			projectId: 'project-1',
			executorId: 'agent-1',
			version: 4,
		} as never);
		executor.resolve.mockResolvedValue({
			status: 'available',
			provider: 'n8n-agent',
			executorId: 'agent-1',
			bindingVersion: 4,
			canStart: true,
			canStop: true,
			authorized: true,
		});

		const result = await service.route({
			projectId: 'project-1',
			departmentId: 'department-1',
			requesterMemberId: 'requester',
			managerMemberId: null,
			assignmentActorUserId: null,
			expertiseTags: ['workflow'],
			requestChainMemberIds: [],
			requestChainUserIds: [],
			initiatingUserId: 'user-1',
		});

		expect(result).toMatchObject({
			state: 'specialist',
			recipientMemberId: 'member-specialist',
			bindingVersion: 4,
		});
		expect(executor.resolve).toHaveBeenCalledWith({
			actorId: 'user-1',
			projectId: 'project-1',
			memberId: 'member-specialist',
			executorId: 'agent-1',
			bindingVersion: 4,
		});
	});

	it('does not route an assignment actor without the current project update scope', async () => {
		directory.listMembers.mockResolvedValue([]);
		projectRelations.findProjectRole.mockResolvedValue({ scopes: [] } as never);

		const result = await service.route({
			projectId: 'project-1',
			departmentId: 'department-1',
			requesterMemberId: 'requester',
			managerMemberId: null,
			assignmentActorUserId: 'user-assigner',
			expertiseTags: [],
			requestChainMemberIds: [],
			requestChainUserIds: [],
			initiatingUserId: 'user-1',
		});

		expect(result.state).toBe('unresolved');
		expect(projectRelations.findProjectRole).toHaveBeenCalledWith({
			userId: 'user-assigner',
			projectId: 'project-1',
		});
	});
});
