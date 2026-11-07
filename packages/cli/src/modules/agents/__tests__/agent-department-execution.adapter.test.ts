import type { User, UserRepository } from '@n8n/db';
import { Logger } from '@n8n/backend-common';
import { mock } from 'vitest-mock-extended';

import { userHasScopes } from '@/permissions.ee/check-access';

import { AgentDepartmentExecutionAdapter } from '../agent-department-execution.adapter';
import type { AgentBindingResolver } from '../agent-binding-resolver.service';
import type { AgentMessageQueueService } from '../agent-message-queue.service';
import type { AgentSessionStopService } from '../agent-session-stop.service';
import type { AgentExecutionService } from '../agent-execution.service';
import type { AgentExecutionRepository } from '../repositories/agent-execution.repository';
import type { AgentExecutionThreadRepository } from '../repositories/agent-execution-thread.repository';
import type { AgentMessageQueueRepository } from '../repositories/agent-message-queue.repository';
import type { AgentDepartmentStopReceiptRepository } from '../repositories/agent-department-stop-receipt.repository';
import type { AgentMessageQueue } from '../entities/agent-message-queue.entity';
import type { AgentExecution } from '../entities/agent-execution.entity';
import type { AgentExecutionThread } from '../entities/agent-execution-thread.entity';
import { productionChatMemoryResourceId } from '../utils/agent-memory-scope';
import { queuedMessageId } from '../utils/queued-message-id';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

describe('Department execution identity', () => {
	const binding = mock<AgentBindingResolver>();
	const users = mock<UserRepository>();
	const queue = mock<AgentMessageQueueService>();
	const executions = mock<AgentExecutionRepository>();
	const threads = mock<AgentExecutionThreadRepository>();
	const queueRepository = mock<AgentMessageQueueRepository>();
	const stopReceipts = mock<AgentDepartmentStopReceiptRepository>();
	const stop = mock<AgentSessionStopService>();
	const agentExecutions = mock<AgentExecutionService>();
	const logger = mock<Logger>();
	const adapter = new AgentDepartmentExecutionAdapter(
		binding,
		users,
		queue,
		executions,
		threads,
		queueRepository,
		stopReceipts,
		stop,
		agentExecutions,
		logger,
	);
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
		executions.findLatestByThreadId.mockResolvedValue(null);
		threads.incrementDepartmentSnapshotSequence.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
		stopReceipts.record.mockResolvedValue('accepted');
		stopReceipts.findPending.mockResolvedValue([]);
		users.findByIdWithRole.mockResolvedValue(mock<User>());
		vi.mocked(userHasScopes).mockResolvedValue(true);
		binding.resolveInProject.mockResolvedValue({ exists: true, available: true });
	});
	it('verifies the accepted department input with the execution permission', async () => {
		expect(await adapter.verifyRun(input)).toBe(true);
		expect(userHasScopes).toHaveBeenCalledWith(expect.anything(), ['agent:execute'], false, {
			projectId: 'project',
		});
	});
	it('keeps workflow capability calls separate from department work actions', async () => {
		queue.enqueue.mockResolvedValue({ status: 'accepted', item: mock<AgentMessageQueue>() });
		const context = {
			actorId: 'user',
			projectId: 'project',
			departmentId: 'department',
			workId: 'work',
			attemptId: 'attempt',
			memberId: 'member',
			executorId: 'agent',
			bindingVersion: 1,
			dispatchKey: 'dispatch',
			workflowIds: ['workflow'],
			workflowCapabilities: [],
			instruction: 'Call the published workflow capability with {"key":"value"}.',
			reviewPolicy: 'required' as const,
		};

		expect(await adapter.dispatch(context)).toMatchObject({ kind: 'accepted' });
		const payload = queue.enqueue.mock.calls[0][0].payload;
		expect(payload.message).toContain('call that workflow tool separately');
		expect(payload.message).toContain('Do not send workflow arguments to department_work.');
		expect(payload.message).toContain('Use submit_department_work with a structured report');
		expect(payload.message).toContain('Use delegate_department_work to create child work');
		expect(payload.message).toContain('childReports entry with state done');
		expect(payload.message).toContain(context.instruction);
	});
	it.each(['n8n-chat', 'workflow', 'test'])('denies a %s execution', async (source) => {
		execution.source = source;
		expect(await adapter.verifyRun(input)).toBe(false);
	});
	it('denies an unaccepted input and a delegated execution', async () => {
		executions.findByInputMessageId.mockResolvedValueOnce(null);
		expect(await adapter.verifyRun(input)).toBe(false);
		expect(logger.warn).toHaveBeenCalledWith('Department Agent run verification failed', {
			reason: 'accepted_input_missing',
			projectId: 'project',
			attemptId: 'attempt',
			executionId: 'execution',
		});
		execution.parentExecutionId = 'parent';
		expect(await adapter.verifyRun(input)).toBe(false);
		expect(logger.warn).toHaveBeenLastCalledWith('Department Agent run verification failed', {
			reason: 'execution_is_delegated',
			projectId: 'project',
			attemptId: 'attempt',
			executionId: 'execution',
		});
	});
	it('locates an accepted queued input by its stable dispatch key', async () => {
		const context = {
			actorId: 'user',
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			dispatchKey: 'dispatch',
		};
		const messageId = queuedMessageId('agent', 'attempt', {
			kind: 'n8n_chat',
			userId: 'user',
			messageId: 'dispatch',
			message: '',
			resourceId: productionChatMemoryResourceId('user'),
			hidden: true,
		});
		queue.findDepartmentDispatch.mockResolvedValue(mock<AgentMessageQueue>({ messageId, thread }));

		expect(await adapter.lookup(context)).toEqual({
			kind: 'accepted',
			ownerExecutionRef: messageId,
		});
	});
	it('locates an accepted execution after its queue item was consumed', async () => {
		const context = {
			actorId: 'user',
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			dispatchKey: 'dispatch',
		};
		const messageId = queuedMessageId('agent', 'attempt', {
			kind: 'n8n_chat',
			userId: 'user',
			messageId: 'dispatch',
			message: '',
			resourceId: productionChatMemoryResourceId('user'),
			hidden: true,
		});
		queue.findDepartmentDispatch.mockResolvedValue(null);
		executions.findByInputMessageId.mockResolvedValue(execution);

		expect(await adapter.lookup(context)).toEqual({
			kind: 'accepted',
			ownerExecutionRef: messageId,
		});
		expect(executions.findByInputMessageId).toHaveBeenCalledWith(messageId);
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
		expect(await adapter.isRunStopped(execution.id)).toBe(false);
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
		expect(threads.incrementDepartmentSnapshotSequence).toHaveBeenCalledTimes(2);
	});
	it('reports a native tool approval without exposing its payload', async () => {
		execution.status = 'success';
		execution.hitlStatus = 'suspended';
		executions.findLatestByThreadId.mockResolvedValue(execution);
		agentExecutions.getThreadDetail.mockResolvedValue({
			thread,
			executions: [
				{
					...execution,
					timeline: [
						{
							type: 'suspension',
							toolName: 'send_email',
							toolCallId: 'call-a',
							timestamp: 1,
							suspendPayload: { type: 'approval', toolName: 'send_email' },
						},
					],
				},
			],
		});

		const result = await adapter.nativeToolApproval({
			...input,
			ownerExecutionRef: 'accepted-message',
		});

		expect(result).toBe('pending');
		expect(JSON.stringify(result)).not.toContain('send_email');
		expect(threads.incrementDepartmentSnapshotSequence).not.toHaveBeenCalled();
	});
	it('does not classify other human input suspensions as native tool approvals', async () => {
		execution.status = 'success';
		execution.hitlStatus = 'suspended';
		executions.findLatestByThreadId.mockResolvedValue(execution);
		agentExecutions.getThreadDetail.mockResolvedValue({
			thread,
			executions: [
				{
					...execution,
					timeline: [
						{
							type: 'suspension',
							toolName: 'ask_questions',
							toolCallId: 'call-a',
							timestamp: 1,
							suspendPayload: { questions: ['Continue?'] },
						},
					],
				},
			],
		});

		const result = await adapter.nativeToolApproval({
			...input,
			ownerExecutionRef: 'accepted-message',
		});

		expect(result).toBe('not_pending');
	});
	it('allows a scoped revocation stop after user execution access is lost', async () => {
		vi.mocked(userHasScopes).mockResolvedValue(false);
		executions.findByInputMessageId.mockResolvedValue(null);
		threads.incrementDepartmentSnapshotSequence.mockResolvedValue(1);
		queueRepository.findByMessageId.mockResolvedValue(
			mock<AgentMessageQueue>({
				messageId: 'accepted-message',
				executionId: 'execution',
				thread,
			}),
		);
		queue.findDepartmentDispatch.mockResolvedValue(
			mock<AgentMessageQueue>({
				messageId: 'accepted-message',
				executionId: 'execution',
				thread,
			}),
		);
		stop.stopDepartmentExecution.mockResolvedValue(true);
		const result = await adapter.requestStop({
			actorId: 'user',
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			ownerExecutionRef: 'accepted-message',
			commandId: 'command-1',
			reason: 'authority-revoked',
			authorityContext: {
				kind: 'department-control-plane',
				commandId: 'command-1',
				reason: 'authority-revoked',
			},
		});
		expect(result).toMatchObject({ status: 'accepted', acknowledged: true, confirmed: false });
		expect(stop.stopDepartmentExecution).toHaveBeenCalledWith({
			projectId: 'project',
			agentId: 'agent',
			threadId: 'attempt',
			ownerExecutionRef: 'accepted-message',
		});
	});
	it('reports a repeated durable stop receipt as duplicate', async () => {
		stopReceipts.record.mockResolvedValue('duplicate');
		queueRepository.findByMessageId.mockResolvedValue(
			mock<AgentMessageQueue>({
				messageId: 'accepted-message',
				executionId: 'execution',
				thread,
			}),
		);
		const result = await adapter.requestStop({
			actorId: 'user',
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			ownerExecutionRef: 'accepted-message',
			commandId: 'command-1',
			reason: 'cancel',
			authorityContext: {
				kind: 'department-control-plane',
				commandId: 'command-1',
				reason: 'cancel',
			},
		});
		expect(result.status).toBe('duplicate');
	});
	it('replays pending stop receipts after restart without user scope checks', async () => {
		stopReceipts.findPending.mockResolvedValue([
			mock({
				commandId: 'command-1',
				projectId: 'project',
				agentId: 'agent',
				threadId: 'attempt',
				ownerExecutionRef: 'accepted-message',
				actorId: 'user',
				status: 'pending',
			}),
		]);
		stop.stopDepartmentExecution.mockResolvedValue(true);
		await adapter.reconcilePendingStops();
		expect(stop.stopDepartmentExecution).toHaveBeenCalledWith({
			projectId: 'project',
			agentId: 'agent',
			threadId: 'attempt',
			ownerExecutionRef: 'accepted-message',
		});
		expect(userHasScopes).not.toHaveBeenCalled();
	});
});
