import type { TransactionRunner } from '@n8n/db';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockEntityManager } from '@test/mocking';

import { AgentDepartmentConsultationInvocation } from '../entities/agent-department-consultation-invocation.entity';
import { AgentDepartmentConsultationInvocationGate } from '../entities/agent-department-consultation-invocation-gate.entity';
import { AgentDepartmentConsultationInvocationRepository } from '../repositories/agent-department-consultation-invocation.repository';

const entityManager = mockEntityManager(AgentDepartmentConsultationInvocation);
const mockDataSource = { manager: entityManager };

describe('AgentDepartmentConsultationInvocationRepository', () => {
	let repository: AgentDepartmentConsultationInvocationRepository;
	let transactionRunner: MockProxy<TransactionRunner>;

	beforeEach(() => {
		vi.clearAllMocks();
		transactionRunner = mock<TransactionRunner>();
		repository = new AgentDepartmentConsultationInvocationRepository(
			mockDataSource as never,
			transactionRunner,
		);
	});

	it('fences a late success after a stop request', async () => {
		entityManager.findOneBy.mockResolvedValue(
			mock<AgentDepartmentConsultationInvocation>({
				projectId: 'project-a',
				invocationId: 'help-a',
				state: 'stopping',
				sequence: '8',
			}),
		);
		entityManager.update.mockResolvedValue({ affected: 1 } as never);

		await repository.markTerminal({
			projectId: 'project-a',
			invocationId: 'help-a',
			outcome: 'succeeded',
			resultText: 'Late answer.',
			resultHash: 'result-hash',
		});

		expect(entityManager.update).toHaveBeenCalledWith(
			AgentDepartmentConsultationInvocation,
			expect.objectContaining({
				projectId: 'project-a',
				invocationId: 'help-a',
				sequence: '8',
				state: 'stopping',
			}),
			expect.objectContaining({
				state: 'terminal',
				outcome: 'cancelled',
				resultText: null,
				resultHash: null,
				sequence: '9',
			}),
		);
	});

	it('sets timestamps when it reserves an invocation and opens its gate', async () => {
		const input = {
			id: 'invocation-a',
			projectId: 'project-a',
			departmentId: 'department-a',
			helpRequestId: 'help-a',
			invocationId: 'help-a',
			sourceAttemptId: 'attempt-a',
			requesterMemberId: 'requester-a',
			recipientMemberId: 'responder-a',
			actorId: '01b2182c-bd40-4a70-8e4b-c9ea05dbd354',
			executorId: 'agent-a',
			bindingVersion: 1,
			commandKey: 'work-help:help-a',
			inputHash: 'a'.repeat(64),
			contextRef: 'context-a',
			contextHash: 'b'.repeat(64),
			inputText: 'Bound context.',
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			threadId: 'thread-a',
			deadlineAt: new Date(Date.now() + 60_000),
		};
		const gate = mock<AgentDepartmentConsultationInvocationGate>({
			projectId: input.projectId,
			invocationId: input.invocationId,
			commandKey: input.commandKey,
			inputHash: input.inputHash,
			state: 'open',
		});
		const invocation = mock<AgentDepartmentConsultationInvocation>({
			...input,
			state: 'reserved',
		});
		const insertQuery = {
			insert: vi.fn().mockReturnThis(),
			into: vi.fn().mockReturnThis(),
			values: vi.fn().mockReturnThis(),
			orIgnore: vi.fn().mockReturnThis(),
			execute: vi.fn().mockResolvedValue({}),
		};
		entityManager.createQueryBuilder.mockReturnValue(insertQuery as never);
		entityManager.findOneBy.mockImplementation(async (entity) => {
			return (entity === AgentDepartmentConsultationInvocationGate ? gate : invocation) as never;
		});

		await expect(repository.reserve(input)).resolves.toMatchObject({ kind: 'created' });
		expect(insertQuery.values).toHaveBeenCalledWith(
			expect.objectContaining({ createdAt: expect.any(Date), updatedAt: expect.any(Date) }),
		);
		expect(insertQuery.values).toHaveBeenCalledWith(
			expect.objectContaining({
				state: 'reserved',
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			}),
		);
	});

	it('sets timestamps when it writes a cancellation tombstone before reservation', async () => {
		const gate = mock<AgentDepartmentConsultationInvocationGate>({
			projectId: 'project-a',
			invocationId: 'help-a',
			commandKey: 'work-help:help-a',
			inputHash: 'a'.repeat(64),
			state: 'cancelled',
			cancelCommandId: 'cancel-a',
			cancelPayloadHash: 'b'.repeat(64),
		});
		const insertQuery = {
			insert: vi.fn().mockReturnThis(),
			into: vi.fn().mockReturnThis(),
			values: vi.fn().mockReturnThis(),
			orIgnore: vi.fn().mockReturnThis(),
			execute: vi.fn().mockResolvedValue({}),
		};
		entityManager.createQueryBuilder.mockReturnValue(insertQuery as never);
		entityManager.update.mockResolvedValue({ affected: 0 } as never);
		entityManager.findOneBy.mockResolvedValue(gate as never);

		await expect(
			repository.cancelGate({
				projectId: 'project-a',
				invocationId: 'help-a',
				commandKey: 'work-help:help-a',
				inputHash: 'a'.repeat(64),
				commandId: 'cancel-a',
				payloadHash: 'b'.repeat(64),
			}),
		).resolves.toMatchObject({ kind: 'cancelled' });
		expect(insertQuery.values).toHaveBeenCalledWith(
			expect.objectContaining({
				state: 'cancelled',
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			}),
		);
	});

	it('does not change a terminal owner result', async () => {
		entityManager.findOneBy.mockResolvedValue(
			mock<AgentDepartmentConsultationInvocation>({
				projectId: 'project-a',
				invocationId: 'help-a',
				state: 'terminal',
			}),
		);

		await expect(
			repository.markTerminal({
				projectId: 'project-a',
				invocationId: 'help-a',
				outcome: 'succeeded',
				resultText: 'Late answer.',
			}),
		).resolves.toEqual({ affected: 0 });
		expect(entityManager.update).not.toHaveBeenCalled();
	});
});
