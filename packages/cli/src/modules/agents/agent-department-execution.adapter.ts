import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentExecutor,
	type DepartmentAttemptContext,
	type DepartmentDispatchResult,
	type DepartmentDispatchLookup,
	type DepartmentExecutionSnapshot,
	type DepartmentExecutorResolution,
} from './agent-department-execution.contracts';
import { AgentExecutionRepository } from './repositories/agent-execution.repository';
import { AgentMessageQueueService } from './agent-message-queue.service';
import { AgentSessionStopService } from './agent-session-stop.service';
import { AgentBindingResolver } from './agent-binding-resolver.service';
import { productionChatMemoryResourceId } from './utils/agent-memory-scope';
import { queuedMessageId } from './utils/queued-message-id';

const PROVIDER = 'n8n-agent';

@Service()
export class AgentDepartmentExecutionAdapter extends DepartmentExecutor {
	constructor(
		private readonly bindingResolver: AgentBindingResolver,
		private readonly users: UserRepository,
		private readonly queue: AgentMessageQueueService,
		private readonly executions: AgentExecutionRepository,
		private readonly stopService: AgentSessionStopService,
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
		if (
			!accepted ||
			accepted.threadId !== input.attemptId ||
			!execution ||
			execution.threadId !== accepted.threadId ||
			execution.source !== 'ai-department' ||
			execution.status !== 'running' ||
			execution.parentExecutionId
		)
			return false;
		const thread = await this.executions.findThreadOf(execution.id);
		if (
			!thread ||
			thread.id !== input.attemptId ||
			thread.agentId !== input.executorId ||
			thread.projectId !== input.projectId ||
			thread.ownerId !== input.actorId
		)
			return false;
		const user = await this.users.findByIdWithRole(input.actorId);
		if (
			!user ||
			!(await userHasScopes(user, ['agent:execute', 'agent:update'], false, {
				projectId: input.projectId,
			}))
		)
			return false;
		const binding = await this.bindingResolver.resolveInProject(input.executorId, input.projectId);
		return binding.exists && binding.available;
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
				'You have assigned department work. Call department_work with action inspect, then claim with the current expectedVersion. ' +
				'Use department_work to report progress, blockers, and your final result. A final chat reply does not complete work.\n\n' +
				context.instruction,
			resourceId: productionChatMemoryResourceId(context.actorId),
			hidden: true,
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
	}): Promise<{ acknowledged: boolean; confirmed: boolean }> {
		const current = await this.snapshot(input);
		if (current.phase !== 'active' && current.phase !== 'suspended')
			return { acknowledged: false, confirmed: false };
		const user = await this.users.findByIdWithRole(input.actorId);
		if (
			!user ||
			!(await userHasScopes(user, ['agent:execute'], false, { projectId: input.projectId }))
		)
			return { acknowledged: false, confirmed: false };
		const queued = await this.queue.findDepartmentDispatch(input.ownerExecutionRef);
		const execution = await this.executions.findByInputMessageId(input.ownerExecutionRef);
		const result = await this.stopService.stopSession(
			input.projectId,
			input.executorId,
			input.attemptId,
			input.actorId,
		);
		if (!result.cancelRequested) return { acknowledged: false, confirmed: false };
		if (queued?.executionId === null && !execution) {
			const [pending, started] = await Promise.all([
				this.queue.findDepartmentDispatch(input.ownerExecutionRef),
				this.executions.findByInputMessageId(input.ownerExecutionRef),
			]);
			if (!pending && !started) return { acknowledged: true, confirmed: true };
		}
		return { acknowledged: true, confirmed: false };
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
				return {
					phase: 'active',
					sequence: (BigInt(queueItem.updatedAt.getTime()) * 4n).toString(),
				};
			}
			return { phase: 'unknown', sequence: '0' };
		}
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
		const revision = BigInt(execution.updatedAt.getTime()) * 4n;
		if (execution.hitlStatus === 'suspended')
			return { phase: 'suspended', sequence: (revision + 1n).toString() };
		if (execution.status === 'running') return { phase: 'active', sequence: revision.toString() };
		const sequence = (revision + 2n).toString();
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
