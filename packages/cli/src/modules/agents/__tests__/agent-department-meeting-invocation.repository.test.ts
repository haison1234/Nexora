/* eslint-disable @typescript-eslint/unbound-method */
import { type TransactionRunner } from '@n8n/db';
import { IsNull } from '@n8n/typeorm';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockEntityManager } from '@test/mocking';

import { AgentDepartmentMeetingInvocation } from '../entities/agent-department-meeting-invocation.entity';
import { AgentDepartmentMeetingInvocationRepository } from '../repositories/agent-department-meeting-invocation.repository';

const entityManager = mockEntityManager(AgentDepartmentMeetingInvocation);
const mockDataSource = { manager: entityManager };

describe('AgentDepartmentMeetingInvocationRepository', () => {
	let repository: AgentDepartmentMeetingInvocationRepository;
	let transactionRunner: MockProxy<TransactionRunner>;

	beforeEach(() => {
		vi.clearAllMocks();
		transactionRunner = mock<TransactionRunner>();
		repository = new AgentDepartmentMeetingInvocationRepository(
			mockDataSource as never,
			transactionRunner,
		);
	});

	it('claims a stop with a null stop command and moves the owner invocation to stopping', async () => {
		const invocation = mock<AgentDepartmentMeetingInvocation>({
			id: 'owner-invocation',
			projectId: 'project',
			invocationId: 'meeting-invocation',
			state: 'running',
			stopCommandId: null,
		});
		entityManager.findOneBy
			.mockResolvedValueOnce(invocation)
			.mockResolvedValueOnce({ ...invocation, state: 'stopping', stopCommandId: 'stop-command' });
		entityManager.update.mockResolvedValue({ affected: 1 } as never);

		const result = await repository.requestStop({
			projectId: 'project',
			invocationId: 'meeting-invocation',
			ownerInvocationRef: 'owner-invocation',
			commandId: 'stop-command',
			payloadHash: 'payload-hash',
		});

		expect(result.kind).toBe('accepted');
		expect(entityManager.update).toHaveBeenCalledWith(
			AgentDepartmentMeetingInvocation,
			{
				projectId: 'project',
				invocationId: 'meeting-invocation',
				id: 'owner-invocation',
				state: 'running',
				stopCommandId: IsNull(),
			},
			expect.objectContaining({ state: 'stopping', stopCommandId: 'stop-command' }),
		);
	});
});
