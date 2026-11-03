import type { User, UserRepository } from '@n8n/db';
import { mock } from 'vitest-mock-extended';

import { userHasScopes } from '@/permissions.ee/check-access';

import { AgentDepartmentExecutionAdapter } from '../agent-department-execution.adapter';
import type { AgentBindingResolver } from '../agent-binding-resolver.service';
import type { AgentMessageQueueService } from '../agent-message-queue.service';
import type { AgentSessionStopService } from '../agent-session-stop.service';
import type { AgentExecutionRepository } from '../repositories/agent-execution.repository';
import type { AgentExecution } from '../entities/agent-execution.entity';
import type { AgentExecutionThread } from '../entities/agent-execution-thread.entity';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

describe('Department execution identity', () => {
	const binding = mock<AgentBindingResolver>();
	const users = mock<UserRepository>();
	const queue = mock<AgentMessageQueueService>();
	const executions = mock<AgentExecutionRepository>();
	const stop = mock<AgentSessionStopService>();
	const adapter = new AgentDepartmentExecutionAdapter(binding, users, queue, executions, stop);
	const input = {
		projectId: 'project',
		actorId: 'user',
		executorId: 'agent',
		attemptId: 'attempt',
		dispatchKey: 'dispatch',
		executionId: 'execution',
	};
	let execution: AgentExecution;
	let thread: AgentExecutionThread;
	beforeEach(() => {
		vi.clearAllMocks();
		execution = mock<AgentExecution>({
			id: 'execution',
			threadId: 'attempt',
			source: 'ai-department',
			status: 'running',
			parentExecutionId: null,
			hitlStatus: null,
		});
		thread = mock<AgentExecutionThread>({
			id: 'attempt',
			projectId: 'project',
			agentId: 'agent',
			ownerId: 'user',
		});
		executions.findByInputMessageId.mockResolvedValue(execution);
		executions.findExecution.mockResolvedValue(execution);
		executions.findThreadOf.mockResolvedValue(thread);
		users.findByIdWithRole.mockResolvedValue(mock<User>());
		vi.mocked(userHasScopes).mockResolvedValue(true);
		binding.resolveInProject.mockResolvedValue({ exists: true, available: true });
	});
	it('verifies the accepted department input and current owner permissions', async () => {
		expect(await adapter.verifyRun(input)).toBe(true);
		expect(userHasScopes).toHaveBeenCalledWith(
			expect.anything(),
			['agent:execute', 'agent:update'],
			false,
			{ projectId: 'project' },
		);
	});
	it.each(['n8n-chat', 'workflow', 'test'])('denies a %s execution', async (source) => {
		execution.source = source;
		expect(await adapter.verifyRun(input)).toBe(false);
	});
	it('denies an unaccepted input and a delegated execution', async () => {
		executions.findByInputMessageId.mockResolvedValueOnce(null);
		expect(await adapter.verifyRun(input)).toBe(false);
		execution.parentExecutionId = 'parent';
		expect(await adapter.verifyRun(input)).toBe(false);
	});
	it('denies a different project, owner, or Agent', async () => {
		for (const field of ['projectId', 'ownerId', 'agentId'] as const) {
			const original = thread[field];
			thread[field] = 'other';
			expect(await adapter.verifyRun(input)).toBe(false);
			Object.assign(thread, { [field]: original });
		}
	});
	it('checks access loss and publication on each action', async () => {
		vi.mocked(userHasScopes).mockResolvedValueOnce(false);
		expect(await adapter.verifyRun(input)).toBe(false);
		binding.resolveInProject.mockResolvedValueOnce({ exists: false });
		expect(await adapter.verifyRun(input)).toBe(false);
	});
	it('keeps a suspended run reserved and only permits recovery after it stops', async () => {
		execution.status = 'success';
		execution.hitlStatus = 'suspended';
		expect(await adapter.isRunStopped(execution.id)).toBe(false);
		execution.hitlStatus = 'resumed';
		expect(await adapter.isRunStopped(execution.id)).toBe(true);
		executions.findExecution.mockResolvedValueOnce(null);
		expect(await adapter.isRunStopped('missing')).toBe(false);
	});
	it('orders a terminal snapshot after an active snapshot in the same millisecond', async () => {
		execution.updatedAt = new Date('2026-11-02T10:00:00.000Z');
		executions.findLatestByThreadId.mockResolvedValue(execution);
		const reference = { ...input, ownerExecutionRef: 'accepted-message' };
		const active = await adapter.snapshot(reference);
		execution.status = 'success';
		const terminal = await adapter.snapshot(reference);
		expect(active.phase).toBe('active');
		expect(terminal.phase).toBe('terminal');
		expect(BigInt(terminal.sequence)).toBeGreaterThan(BigInt(active.sequence));
	});
});
