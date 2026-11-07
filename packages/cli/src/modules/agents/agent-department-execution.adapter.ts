import { createHash } from 'node:crypto';

import { Logger } from '@n8n/backend-common';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentExecutor,
	type DepartmentAttemptContext,
	type DepartmentDispatchResult,
	type DepartmentDispatchLookup,
	type DepartmentExecutionSnapshot,
	type DepartmentExecutionIdentity,
	type DepartmentExecutorResolution,
} from './agent-department-execution.contracts';
import { AgentMessageQueueService } from './agent-message-queue.service';
import { AgentSessionStopService } from './agent-session-stop.service';
import { AgentBindingResolver } from './agent-binding-resolver.service';
import { AgentExecutionService } from './agent-execution.service';
import { AgentDepartmentStopReceiptRepository } from './repositories/agent-department-stop-receipt.repository';
import { AgentExecutionRepository } from './repositories/agent-execution.repository';
import { AgentExecutionThreadRepository } from './repositories/agent-execution-thread.repository';
import { AgentMessageQueueRepository } from './repositories/agent-message-queue.repository';
import { productionChatMemoryResourceId } from './utils/agent-memory-scope';
import { queuedMessageId } from './utils/queued-message-id';
import { isApprovalSuspendPayload } from './integrations/agent-chat-suspension-cards';

const PROVIDER = 'n8n-agent';

@Service()
export class AgentDepartmentExecutionAdapter extends DepartmentExecutor {
	constructor(
		private readonly bindingResolver: AgentBindingResolver,
		private readonly users: UserRepository,
		private readonly queue: AgentMessageQueueService,
		private readonly executions: AgentExecutionRepository,
		private readonly threads: AgentExecutionThreadRepository,
		private readonly queueRepository: AgentMessageQueueRepository,
		private readonly stopReceipts: AgentDepartmentStopReceiptRepository,
		private readonly stopService: AgentSessionStopService,
		private readonly agentExecutions: AgentExecutionService,
		private readonly logger: Logger,
	) {
		super();
	}

	async resolve(input: {
		actorId: string;
		projectId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentExecutorResolution> {
		const binding = await this.bindingResolver.resolveInProject(input.executorId, input.projectId);
		const user = await this.users.findByIdWithRole(input.actorId);
		const canExecute =
			user !== null &&
			(await userHasScopes(user, ['agent:execute'], false, { projectId: input.projectId }));
		const canStart = binding.exists && binding.available && canExecute;
		return {
			status: canStart ? 'available' : 'unavailable',
			provider: PROVIDER,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
			canStart,
			canStop: canStart,
			authorized: canExecute,
		};
	}

	async verifyRun(input: Parameters<DepartmentExecutor['verifyRun']>[0]): Promise<boolean> {
		const accepted = await this.executions.findByInputMessageId(this.messageId(input));
		const execution = await this.executions.findExecution(input.executionId);
		if (!accepted) return this.rejectRun(input, 'accepted_input_missing');
		if (accepted.threadId !== input.attemptId)
			return this.rejectRun(input, 'accepted_input_thread_mismatch');
		if (!execution) return this.rejectRun(input, 'execution_missing');
		if (execution.threadId !== accepted.threadId)
			return this.rejectRun(input, 'execution_thread_mismatch');
		if (execution.source !== 'ai-department')
			return this.rejectRun(input, 'execution_source_mismatch');
		if (execution.status !== 'running') return this.rejectRun(input, 'execution_not_running');
		if (execution.parentExecutionId) return this.rejectRun(input, 'execution_is_delegated');
		const thread = await this.executions.findThreadOf(execution.id);
		if (!thread) return this.rejectRun(input, 'thread_missing');
		if (thread.id !== input.attemptId) return this.rejectRun(input, 'thread_id_mismatch');
		if (thread.agentId !== input.executorId) return this.rejectRun(input, 'thread_agent_mismatch');
		if (thread.projectId !== input.projectId)
			return this.rejectRun(input, 'thread_project_mismatch');
		if (thread.ownerId !== input.actorId) return this.rejectRun(input, 'thread_owner_mismatch');
		const user = await this.users.findByIdWithRole(input.actorId);
		if (!user) return this.rejectRun(input, 'actor_missing');
		if (
			!(await userHasScopes(user, ['agent:execute'], false, {
				projectId: input.projectId,
			}))
		)
			return this.rejectRun(input, 'agent_execute_scope_missing');
		const binding = await this.bindingResolver.resolveInProject(input.executorId, input.projectId);
		if (!binding.exists) return this.rejectRun(input, 'agent_binding_missing');
		if (!binding.available) return this.rejectRun(input, 'agent_binding_unavailable');
		return true;
	}

	private rejectRun(input: Parameters<DepartmentExecutor['verifyRun']>[0], reason: string): false {
		this.logger.warn('Department Agent run verification failed', {
			reason,
			projectId: input.projectId,
			attemptId: input.attemptId,
			executionId: input.executionId,
		});
		return false;
	}

	async isRunStopped(executionId: string): Promise<boolean> {
		const execution = await this.executions.findExecution(executionId);
		return (
			execution !== null && execution.status !== 'running' && execution.hitlStatus !== 'suspended'
		);
	}

	async dispatch(context: DepartmentAttemptContext): Promise<DepartmentDispatchResult> {
		const resolved = await this.resolve(context);
		if (!resolved.canStart)
			return { kind: 'rejected', reason: 'Agent is unavailable or access is denied.' };

		const payload = {
			kind: 'n8n_chat' as const,
			userId: context.actorId,
			messageId: context.dispatchKey,
			message:
				'You have assigned department work. Call department_work with action inspect, then call claim_department_work with no input. ' +
				'If the instruction names a workflow capability, call that workflow tool separately with its stated input. Do not send workflow arguments to department_work. ' +
				'Use department_work to report progress and blockers. Use submit_department_work with a structured report to finish work; send no work version. Use delegate_department_work to create child work when the instruction requires delegation; send no work version. Do not use runtime sub-agent delegation for department work. A final chat reply does not complete work.\n\n' +
				'When a resumed work item has a childReports entry with state done, use that accepted report and do not create a duplicate child.\n\n' +
				context.instruction,
			resourceId: productionChatMemoryResourceId(context.actorId),
			hidden: true,
			departmentWorkflowIds: context.workflowIds,
			departmentWorkflowCapabilities: context.workflowCapabilities,
		};
		try {
			await this.queue.enqueue({
				agentId: context.executorId,
				projectId: context.projectId,
				threadId: context.attemptId,
				sessionMode: 'new',
				source: 'ai-department',
				payload,
			});
			const result = await this.lookup(context);
			if (result.kind === 'accepted') return result;
			return { kind: 'unknown' };
		} catch {
			return { kind: 'unknown' };
		}
	}

	async lookup(
		context: Pick<
			DepartmentAttemptContext,
			'actorId' | 'projectId' | 'executorId' | 'attemptId' | 'dispatchKey'
		>,
	): Promise<DepartmentDispatchLookup> {
		const messageId = this.messageId(context);
		const queued = await this.queue.findDepartmentDispatch(messageId);
		if (
			queued &&
			queued.thread.projectId === context.projectId &&
			queued.thread.agentId === context.executorId &&
			queued.thread.ownerId === context.actorId
		) {
			return { kind: 'accepted', ownerExecutionRef: messageId };
		}
		const execution = await this.executions.findByInputMessageId(messageId);
		if (!execution) return { kind: queued ? 'unknown' : 'absent' };
		const thread = await this.executions.findThreadOf(execution.id);
		if (
			!thread ||
			thread.projectId !== context.projectId ||
			thread.agentId !== context.executorId ||
			thread.ownerId !== context.actorId
		) {
			return { kind: 'unknown' };
		}
		return { kind: 'accepted', ownerExecutionRef: messageId };
	}

	async requestStop(input: {
		actorId: string;
		projectId: string;
		executorId: string;
		attemptId: string;
		ownerExecutionRef: string;
		commandId: string;
		reason: 'cancel' | 'handoff' | 'release' | 'authority-revoked';
		authorityContext: Parameters<DepartmentExecutor['requestStop']>[0]['authorityContext'];
	}): Promise<{
		status: 'accepted' | 'duplicate' | 'rejected' | 'unknown';
		acknowledged: boolean;
		confirmed: boolean;
	}> {
		const reject = (status: 'rejected' | 'unknown') => ({
			status,
			acknowledged: false,
			confirmed: false,
		});
		const queued = await this.queueRepository.findByMessageId(input.ownerExecutionRef);
		const execution = await this.executions.findByInputMessageId(input.ownerExecutionRef);
		const thread =
			queued?.thread ?? (execution ? await this.executions.findThreadOf(execution.id) : null);
		const queueItem =
			queued ??
			(execution ? await this.queueRepository.findByMessageId(input.ownerExecutionRef) : null);
		if (
			!thread ||
			thread.id !== input.attemptId ||
			thread.projectId !== input.projectId ||
			thread.agentId !== input.executorId ||
			thread.ownerId !== input.actorId ||
			(queueItem && queueItem.messageId !== input.ownerExecutionRef) ||
			(execution &&
				(execution.threadId !== input.attemptId || execution.source !== 'ai-department'))
		)
			return reject('unknown');
		if (input.authorityContext.kind === 'user') {
			if (input.authorityContext.userId !== input.actorId) return reject('rejected');
			const user = await this.users.findByIdWithRole(input.actorId);
			if (
				!user ||
				!(await userHasScopes(user, ['agent:execute'], false, {
					projectId: input.projectId,
				}))
			)
				return reject('rejected');
		} else if (
			input.authorityContext.commandId !== input.commandId ||
			input.authorityContext.reason !== input.reason
		) {
			return reject('rejected');
		}
		const payloadHash = createHash('sha256')
			.update(
				JSON.stringify({
					projectId: input.projectId,
					executorId: input.executorId,
					attemptId: input.attemptId,
					ownerExecutionRef: input.ownerExecutionRef,
					reason: input.reason,
				}),
			)
			.digest('hex');
		const recorded = await this.stopReceipts.record({
			commandId: input.commandId,
			projectId: input.projectId,
			agentId: input.executorId,
			threadId: input.attemptId,
			ownerExecutionRef: input.ownerExecutionRef,
			actorId: input.actorId,
			reason: input.reason,
			payloadHash,
		});
		if (recorded === 'rejected') return reject('rejected');
		const accepted = recorded === 'accepted' || recorded === 'duplicate';
		const current = await this.snapshot(input);
		if (current.phase === 'terminal') {
			await this.stopReceipts.markConfirmed(input.commandId);
			return {
				status: recorded === 'duplicate' ? 'duplicate' : 'accepted',
				acknowledged: accepted,
				confirmed: true,
			};
		}
		if (current.phase === 'unknown') return reject('unknown');
		const requested = await this.stopService.stopDepartmentExecution({
			projectId: input.projectId,
			agentId: input.executorId,
			threadId: input.attemptId,
			ownerExecutionRef: input.ownerExecutionRef,
		});
		if (!requested && current.phase !== 'suspended') return reject('unknown');
		return {
			status: recorded === 'duplicate' ? 'duplicate' : 'accepted',
			acknowledged: accepted,
			confirmed: false,
		};
	}

	async reconcilePendingStops(take = 100): Promise<void> {
		for (const receipt of await this.stopReceipts.findPending(take)) {
			const input = {
				actorId: receipt.actorId,
				projectId: receipt.projectId,
				executorId: receipt.agentId,
				attemptId: receipt.threadId,
				ownerExecutionRef: receipt.ownerExecutionRef,
			};
			const current = await this.snapshot(input);
			if (current.phase === 'terminal') {
				await this.stopReceipts.markConfirmed(receipt.commandId);
				continue;
			}
			if (current.phase === 'unknown') continue;
			await this.stopService.stopDepartmentExecution({
				projectId: receipt.projectId,
				agentId: receipt.agentId,
				threadId: receipt.threadId,
				ownerExecutionRef: receipt.ownerExecutionRef,
			});
		}
	}

	async snapshot(input: {
		actorId: string;
		projectId: string;
		executorId: string;
		attemptId: string;
		ownerExecutionRef: string;
	}): Promise<DepartmentExecutionSnapshot> {
		let execution = await this.executions.findByInputMessageId(input.ownerExecutionRef);
		if (!execution) {
			const queueItem = await this.queue.findDepartmentDispatch(input.ownerExecutionRef);
			if (
				queueItem?.thread.projectId === input.projectId &&
				queueItem.thread.agentId === input.executorId &&
				queueItem.thread.id === input.attemptId &&
				queueItem.thread.ownerId === input.actorId
			) {
				const nextSequence = await this.threads.incrementDepartmentSnapshotSequence(
					input.attemptId,
				);
				if (nextSequence === null) return { phase: 'unknown', sequence: '0' };
				const stopping = await this.stopReceipts.hasPendingForOwnerExecutionRef({
					projectId: input.projectId,
					agentId: input.executorId,
					threadId: input.attemptId,
					ownerExecutionRef: input.ownerExecutionRef,
				});
				return {
					phase: stopping ? 'stopping' : 'active',
					sequence: String(nextSequence),
				};
			}
			return { phase: 'unknown', sequence: '0' };
		}
		const nextSequence = await this.threads.incrementDepartmentSnapshotSequence(input.attemptId);
		if (nextSequence === null) return { phase: 'unknown', sequence: '0' };
		const thread = await this.executions.findThreadOf(execution.id);
		if (
			!thread ||
			thread.projectId !== input.projectId ||
			thread.agentId !== input.executorId ||
			thread.id !== input.attemptId ||
			thread.ownerId !== input.actorId
		) {
			return { phase: 'unknown', sequence: '0' };
		}
		const latest = await this.executions.findLatestByThreadId(input.attemptId);
		if (latest?.source === 'ai-department') execution = latest;
		if (execution.hitlStatus === 'suspended')
			return { phase: 'suspended', sequence: String(nextSequence) };
		if (execution.status === 'running') {
			const stopping = await this.stopReceipts.hasPendingForOwnerExecutionRef({
				projectId: input.projectId,
				agentId: input.executorId,
				threadId: input.attemptId,
				ownerExecutionRef: input.ownerExecutionRef,
			});
			return {
				phase: stopping ? 'stopping' : 'active',
				sequence: String(nextSequence),
			};
		}
		const sequence = String(nextSequence);
		const outcome =
			execution.status === 'success'
				? 'succeeded'
				: execution.status === 'cancelled'
					? 'cancelled'
					: 'failed';
		return {
			phase: 'terminal',
			sequence,
			result: {
				outcome,
				reference: execution.id,
			},
		};
	}

	async nativeToolApproval(input: DepartmentExecutionIdentity) {
		let execution = await this.executions.findByInputMessageId(input.ownerExecutionRef);
		if (!execution) return 'unknown' as const;
		const thread = await this.executions.findThreadOf(execution.id);
		if (
			!thread ||
			thread.projectId !== input.projectId ||
			thread.agentId !== input.executorId ||
			thread.id !== input.attemptId ||
			thread.ownerId !== input.actorId
		) {
			return 'unknown' as const;
		}
		const latest = await this.executions.findLatestByThreadId(input.attemptId);
		if (latest?.source === 'ai-department') execution = latest;
		if (execution.hitlStatus !== 'suspended') return 'not_pending' as const;

		try {
			const detail = await this.agentExecutions.getThreadDetail(
				thread.id,
				input.projectId,
				input.executorId,
				input.actorId,
			);
			const timeline = detail?.executions.find(({ id }) => id === execution.id)?.timeline;
			if (!timeline) return 'unknown' as const;
			for (let index = timeline.length - 1; index >= 0; index--) {
				const event = timeline[index];
				if (event.type === 'suspension') {
					return isApprovalSuspendPayload(event.suspendPayload)
						? ('pending' as const)
						: ('not_pending' as const);
				}
			}
		} catch {
			// A timeline read must not block work history or stop requests.
		}
		return 'unknown' as const;
	}

	private messageId(
		context: Pick<DepartmentAttemptContext, 'actorId' | 'executorId' | 'attemptId' | 'dispatchKey'>,
	) {
		return (
			queuedMessageId(context.executorId, context.attemptId, {
				kind: 'n8n_chat',
				userId: context.actorId,
				messageId: context.dispatchKey,
				message: '',
				resourceId: productionChatMemoryResourceId(context.actorId),
				hidden: true,
			}) ?? ''
		);
	}
}
