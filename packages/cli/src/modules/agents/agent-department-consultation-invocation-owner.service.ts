import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';
import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentConsultationInvocationOwner,
	DepartmentConsultationBindingVerifierProxy,
	DepartmentConsultationContextReaderProxy,
	hashDepartmentConsultationRequest,
	parseDepartmentConsultationAnswer,
	type DepartmentConsultationInvocationRequest,
	type DepartmentConsultationResolution,
	type DepartmentConsultationDispatchResult,
	type DepartmentConsultationLookupResult,
} from './agent-department-consultation.contracts';
import { AgentBindingResolver } from './agent-binding-resolver.service';
import { AgentMessageQueueService } from './agent-message-queue.service';
import { AgentSessionStopService } from './agent-session-stop.service';
import { AgentRuntimeCacheService } from './agent-runtime-cache.service';
import { AgentDepartmentConsultationInvocationRepository } from './repositories/agent-department-consultation-invocation.repository';
import { AgentDepartmentConsultationInvocation } from './entities/agent-department-consultation-invocation.entity';
import { AgentExecutionRepository } from './repositories/agent-execution.repository';

const CONSULTATION_POLICY_VERSION = 'department-consultation-v1';

@Service()
export class AgentDepartmentConsultationInvocationOwnerService extends DepartmentConsultationInvocationOwner {
	constructor(
		private readonly bindingResolver: AgentBindingResolver,
		private readonly users: UserRepository,
		private readonly queue: AgentMessageQueueService,
		private readonly invocations: AgentDepartmentConsultationInvocationRepository,
		private readonly runtimes: AgentRuntimeCacheService,
		private readonly stopService: AgentSessionStopService,
		private readonly executions: AgentExecutionRepository,
		private readonly bindings: DepartmentConsultationBindingVerifierProxy,
		private readonly contextReader: DepartmentConsultationContextReaderProxy,
	) {
		super();
	}

	private async checkAccess(input: {
		actorId: string;
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}) {
		const [binding, user, bindingMatches] = await Promise.all([
			this.bindingResolver.resolveInProject(input.executorId, input.projectId),
			this.users.findByIdWithRole(input.actorId),
			this.bindings.isCurrentBinding({
				projectId: input.projectId,
				departmentId: input.departmentId,
				memberId: input.memberId,
				executorId: input.executorId,
				bindingVersion: input.bindingVersion,
			}),
		]);
		const authorized =
			user !== null &&
			!user.disabled &&
			(await userHasScopes(user, ['agent:execute'], false, { projectId: input.projectId }));
		const available = binding.exists && binding.available;
		return { available, authorized, canStart: available && authorized && bindingMatches };
	}

	async resolve(input: {
		actorId: string;
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentConsultationResolution> {
		const access = await this.checkAccess(input);
		return { available: access.available, canStart: access.canStart };
	}

	async invoke(
		request: DepartmentConsultationInvocationRequest,
	): Promise<DepartmentConsultationDispatchResult> {
		if (request.inputText !== undefined) {
			return { kind: 'rejected', code: 'unavailable' };
		}
		const { expectedInputHash, ...requestIdentity } = request;
		if (hashDepartmentConsultationRequest(requestIdentity) !== expectedInputHash) {
			throw new ConflictError('Consultation invocation hash does not match its request.');
		}
		if (
			request.toolPolicy.mode !== 'none' ||
			request.toolPolicy.policyVersion !== CONSULTATION_POLICY_VERSION ||
			request.maxOutputChars < 1 ||
			request.maxOutputChars > 4_000 ||
			request.maxOutputTokens < 1 ||
			request.maxOutputTokens > 1_000
		) {
			return { kind: 'rejected', code: 'tools' };
		}
		const resolvedContext = await this.contextReader.resolve({
			projectId: request.projectId,
			departmentId: request.departmentId,
			helpRequestId: request.helpRequestId,
			requesterMemberId: request.requesterMemberId,
			recipientMemberId: request.recipientMemberId,
			actorId: request.actorId,
			contextRef: request.contextRef,
		});
		if (
			!resolvedContext ||
			resolvedContext.inputText.length === 0 ||
			resolvedContext.inputText.length > 24_000 ||
			resolvedContext.contextHash !== request.contextHash
		) {
			return { kind: 'rejected', code: 'unavailable' };
		}
		const access = await this.checkAccess({
			actorId: request.actorId,
			projectId: request.projectId,
			departmentId: request.departmentId,
			memberId: request.recipientMemberId,
			executorId: request.executorId,
			bindingVersion: request.bindingVersion,
		});
		if (!access.authorized) return { kind: 'rejected', code: 'access' };
		if (!access.canStart) return { kind: 'rejected', code: 'binding' };
		const deadline = Date.parse(request.deadlineAt);
		if (
			!Number.isFinite(deadline) ||
			deadline <= Date.now() ||
			deadline > Date.now() + 10 * 60_000
		) {
			return { kind: 'rejected', code: 'unavailable' };
		}

		const ownerRequest = { ...request, inputText: resolvedContext.inputText };
		const reservation = await this.invocations.reserve({
			id: request.invocationId,
			projectId: request.projectId,
			departmentId: request.departmentId,
			helpRequestId: request.helpRequestId,
			invocationId: request.invocationId,
			sourceAttemptId: request.sourceAttemptId,
			requesterMemberId: request.requesterMemberId,
			recipientMemberId: request.recipientMemberId,
			actorId: request.actorId,
			executorId: request.executorId,
			bindingVersion: request.bindingVersion,
			commandKey: request.commandKey,
			inputHash: expectedInputHash,
			contextRef: request.contextRef,
			contextHash: request.contextHash,
			inputText: resolvedContext.inputText,
			maxOutputChars: request.maxOutputChars,
			maxOutputTokens: request.maxOutputTokens,
			threadId: randomUUID(),
			deadlineAt: new Date(deadline),
		});
		if (reservation.kind === 'cancelled') return { kind: 'rejected', code: 'cancelled' };
		if (reservation.kind === 'conflict') {
			throw new ConflictError('Consultation command key was already used for different input.');
		}
		const invocation = reservation.invocation;
		if (['accepted', 'running', 'terminal'].includes(invocation.state)) {
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		if (invocation.state === 'stopping') {
			return invocation.safeErrorCode === 'enqueue_unknown'
				? { kind: 'unknown' }
				: { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		if (invocation.state === 'reserved' || invocation.state === 'unknown') {
			let runtime;
			try {
				runtime = await this.runtimes.getRuntime({
					agentId: request.executorId,
					projectId: request.projectId,
					usePublishedVersion: true,
					departmentConsultation: true,
				});
				if (
					runtime.agent.declaredTools.length > 0 ||
					runtime.toolRegistry.size > 0 ||
					runtime.mcpServerAttributions.size > 0
				) {
					await this.invocations.markTerminal({
						projectId: request.projectId,
						invocationId: request.invocationId,
						outcome: 'failed',
						safeErrorCode: 'tools',
					});
					return { kind: 'rejected', code: 'tools' };
				}
			} catch {
				await this.invocations.markTerminal({
					projectId: request.projectId,
					invocationId: request.invocationId,
					outcome: 'failed',
					safeErrorCode: 'runtime_unavailable',
				});
				return { kind: 'rejected', code: 'unavailable' };
			} finally {
				if (runtime) this.runtimes.releaseRuntimeLease(runtime.agent);
			}
		}
		try {
			await this.queue.enqueueDepartmentConsultation({
				executorId: request.executorId,
				projectId: request.projectId,
				threadId: invocation.threadId,
				request: ownerRequest,
			});
			await this.invocations.markAccepted(request.projectId, request.invocationId);
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		} catch (error) {
			if (error instanceof ConflictError) throw error;
			await this.invocations.markUnknown(request.projectId, request.invocationId);
			return { kind: 'unknown' };
		}
	}

	async lookup(input: {
		projectId: string;
		invocationId: string;
		commandKey: string;
		expectedInputHash: string;
	}): Promise<DepartmentConsultationLookupResult> {
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation) return { kind: 'absent' };
		if (
			invocation.commandKey !== input.commandKey ||
			invocation.inputHash !== input.expectedInputHash
		) {
			return { kind: 'conflict' };
		}
		if (
			invocation.state === 'accepted' ||
			invocation.state === 'running' ||
			invocation.state === 'terminal'
		) {
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		const request = this.toRequest(invocation);
		const executionId = this.queue.departmentConsultationMessageId(
			invocation.executorId,
			invocation.threadId,
			request,
		);
		if (!executionId) return { kind: 'unknown' };
		const execution = await this.executions.findByInputMessageId(executionId);
		if (execution) {
			if (execution.status === 'running') {
				await this.invocations.markAccepted(input.projectId, input.invocationId);
				await this.invocations.markRunning(input.projectId, input.invocationId);
			} else if (invocation.state !== 'stopping') {
				const resultIsValid =
					invocation.resultText !== null &&
					invocation.resultHash !== null &&
					createHash('sha256').update(invocation.resultText).digest('hex') ===
						invocation.resultHash;
				await this.invocations.markTerminal({
					projectId: input.projectId,
					invocationId: input.invocationId,
					outcome:
						execution.status === 'cancelled' || execution.status === 'interrupted'
							? 'cancelled'
							: execution.status === 'success' && resultIsValid
								? 'succeeded'
								: 'failed',
					safeErrorCode: resultIsValid ? undefined : 'result_missing',
				});
			}
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		const queued = await this.queue.findDepartmentConsultationDispatch({
			executorId: invocation.executorId,
			projectId: invocation.projectId,
			threadId: invocation.threadId,
			request,
		});
		if (!queued) return { kind: 'unknown' };
		if (invocation.state !== 'stopping') {
			await this.invocations.markAccepted(input.projectId, input.invocationId);
		}
		return { kind: 'accepted', ownerInvocationRef: invocation.id };
	}

	async snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
	}) {
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation || invocation.id !== input.ownerInvocationRef) {
			return {
				ownerInvocationRef: input.ownerInvocationRef,
				sequence: '0',
				phase: 'unknown' as const,
			};
		}
		return {
			ownerInvocationRef: invocation.id,
			sequence: invocation.sequence,
			phase:
				invocation.state === 'accepted'
					? ('queued' as const)
					: invocation.state === 'running'
						? ('running' as const)
						: invocation.state === 'stopping'
							? ('stopping' as const)
							: invocation.state === 'terminal'
								? ('terminal' as const)
								: ('unknown' as const),
			...(invocation.outcome ? { outcome: invocation.outcome } : {}),
			...(invocation.safeErrorCode ? { safeErrorCode: invocation.safeErrorCode } : {}),
			...(invocation.terminalAt ? { terminalAt: invocation.terminalAt.toISOString() } : {}),
		};
	}

	async readResult(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
		expectedInputHash: string;
	}) {
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (
			!invocation ||
			invocation.id !== input.ownerInvocationRef ||
			invocation.inputHash !== input.expectedInputHash ||
			invocation.state !== 'terminal' ||
			invocation.outcome !== 'succeeded' ||
			!invocation.resultText ||
			!invocation.resultHash ||
			createHash('sha256').update(invocation.resultText).digest('hex') !== invocation.resultHash
		) {
			return null;
		}
		const access = await this.checkAccess({
			actorId: invocation.actorId,
			projectId: invocation.projectId,
			departmentId: invocation.departmentId,
			memberId: invocation.recipientMemberId,
			executorId: invocation.executorId,
			bindingVersion: invocation.bindingVersion,
		});
		if (!access.canStart || !access.authorized) return null;
		const answer = parseDepartmentConsultationAnswer(invocation.resultText);
		if (!answer) return null;
		return {
			invocationId: invocation.invocationId,
			helpRequestId: invocation.helpRequestId,
			ownerInvocationRef: invocation.id,
			sequence: invocation.sequence,
			resultHash: invocation.resultHash,
			contextHash: invocation.contextHash,
			answer,
		};
	}

	async requestStop(input: {
		projectId: string;
		invocationId: string;
		actorId: string;
		commandKey: string;
		expectedInputHash: string;
		ownerInvocationRef?: string;
		commandId: string;
	}) {
		const actor = await this.users.findByIdWithRole(input.actorId);
		if (
			!actor ||
			actor.disabled ||
			!(await userHasScopes(actor, ['agent:update'], false, { projectId: input.projectId }))
		) {
			return { acknowledged: false, confirmedTerminal: false };
		}
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation) return { acknowledged: true, confirmedTerminal: false };
		if (
			invocation.commandKey !== input.commandKey ||
			invocation.inputHash !== input.expectedInputHash ||
			(input.ownerInvocationRef && invocation.id !== input.ownerInvocationRef)
		) {
			return { acknowledged: false, confirmedTerminal: false };
		}
		if (invocation.state === 'terminal') return { acknowledged: true, confirmedTerminal: true };
		const payloadHash = createHash('sha256')
			.update(
				JSON.stringify([
					input.projectId,
					input.invocationId,
					input.commandKey,
					input.expectedInputHash,
					input.actorId,
					input.commandId,
				]),
			)
			.digest('hex');
		const cancelled = await this.invocations.cancelGate({
			projectId: input.projectId,
			invocationId: input.invocationId,
			commandKey: input.commandKey,
			inputHash: input.expectedInputHash,
			commandId: input.commandId,
			payloadHash,
		});
		if (cancelled.kind === 'conflict') return { acknowledged: false, confirmedTerminal: false };
		const stopping = await this.invocations.markStopping({
			projectId: input.projectId,
			invocationId: input.invocationId,
			commandId: input.commandId,
			payloadHash,
		});
		if (stopping.kind === 'conflict' || stopping.kind === 'absent') {
			return { acknowledged: false, confirmedTerminal: false };
		}
		if (stopping.kind === 'terminal') return { acknowledged: true, confirmedTerminal: true };
		await this.reconcileStop(stopping.invocation);
		const current = await this.invocations.findByInvocationId(input.projectId, input.invocationId);
		return { acknowledged: true, confirmedTerminal: current?.state === 'terminal' };
	}

	async reconcilePendingEnqueues(take = 100) {
		for (const invocation of await this.invocations.findUnresolvedEnqueues(take)) {
			const result = await this.lookup({
				projectId: invocation.projectId,
				invocationId: invocation.invocationId,
				commandKey: invocation.commandKey,
				expectedInputHash: invocation.inputHash,
			});
			if (result.kind !== 'accepted' || invocation.state !== 'stopping') continue;
			const current = await this.invocations.findByInvocationId(
				invocation.projectId,
				invocation.invocationId,
			);
			if (current?.state === 'stopping') await this.reconcileStop(current);
		}
	}

	async reconcilePendingStops(take = 100) {
		for (const invocation of await this.invocations.findPendingStops(take))
			await this.reconcileStop(invocation);
	}

	private async reconcileStop(invocation: AgentDepartmentConsultationInvocation) {
		if (invocation.state !== 'stopping') return;
		const request = this.toRequest(invocation);
		const messageId = this.queue.departmentConsultationMessageId(
			invocation.executorId,
			invocation.threadId,
			request,
		);
		if (!messageId) return;
		const execution = await this.executions.findByInputMessageId(messageId);
		if (execution && execution.status !== 'running') {
			await this.invocations.markTerminal({
				projectId: invocation.projectId,
				invocationId: invocation.invocationId,
				outcome:
					execution.status === 'cancelled' || execution.status === 'interrupted'
						? 'cancelled'
						: 'failed',
				safeErrorCode: 'stopped',
			});
			return;
		}
		const queued = await this.queue.findDepartmentConsultationDispatch({
			executorId: invocation.executorId,
			projectId: invocation.projectId,
			threadId: invocation.threadId,
			request,
		});
		if (!execution && !queued) {
			if (invocation.safeErrorCode === 'enqueue_unknown') return;
			await this.invocations.markTerminal({
				projectId: invocation.projectId,
				invocationId: invocation.invocationId,
				outcome: 'cancelled',
				safeErrorCode: 'stopped_without_execution',
			});
			return;
		}
		const requested = await this.stopService.stopDepartmentExecution({
			projectId: invocation.projectId,
			agentId: invocation.executorId,
			threadId: invocation.threadId,
			ownerExecutionRef: messageId,
			source: 'ai-department-consultation',
		});
		if (!execution && requested) {
			await this.invocations.markTerminal({
				projectId: invocation.projectId,
				invocationId: invocation.invocationId,
				outcome: 'cancelled',
				safeErrorCode: 'stopped_before_start',
			});
		}
	}

	private toRequest(
		invocation: AgentDepartmentConsultationInvocation,
	): DepartmentConsultationInvocationRequest {
		return {
			schemaVersion: 1,
			projectId: invocation.projectId,
			departmentId: invocation.departmentId,
			helpRequestId: invocation.helpRequestId,
			invocationId: invocation.invocationId,
			sourceAttemptId: invocation.sourceAttemptId,
			requesterMemberId: invocation.requesterMemberId,
			recipientMemberId: invocation.recipientMemberId,
			actorId: invocation.actorId,
			executorId: invocation.executorId,
			bindingVersion: invocation.bindingVersion,
			commandKey: invocation.commandKey,
			expectedInputHash: invocation.inputHash,
			contextRef: invocation.contextRef,
			contextHash: invocation.contextHash,
			inputText: invocation.inputText,
			deadlineAt: invocation.deadlineAt.toISOString(),
			maxOutputChars: invocation.maxOutputChars,
			maxOutputTokens: invocation.maxOutputTokens,
			toolPolicy: { mode: 'none', policyVersion: CONSULTATION_POLICY_VERSION },
		};
	}
}
