import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError } from '@n8n/errors';
import { AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS } from '@n8n/api-types';
import { createHash, randomUUID } from 'node:crypto';
import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentMeetingInvocationOwner,
	DepartmentMeetingBindingVerifierProxy,
	DepartmentMeetingContextReaderProxy,
	hashDepartmentMeetingInvocationRequest,
	parseDepartmentMeetingResult,
	type DepartmentMeetingInvocationRequest,
	type DepartmentMeetingInvocationResolution,
	type DepartmentMeetingDispatchResult,
	type DepartmentMeetingLookupResult,
	type DepartmentMeetingOwnerSnapshot,
} from './agent-department-meeting-invocation.contracts';
import { AgentBindingResolver } from './agent-binding-resolver.service';
import { AgentMessageQueueService } from './agent-message-queue.service';
import { AgentSessionStopService } from './agent-session-stop.service';
import { AgentRuntimeCacheService } from './agent-runtime-cache.service';
import { AgentDepartmentMeetingInvocationRepository } from './repositories/agent-department-meeting-invocation.repository';
import { AgentExecutionRepository } from './repositories/agent-execution.repository';

@Service()
export class AgentDepartmentMeetingInvocationOwnerService extends DepartmentMeetingInvocationOwner {
	constructor(
		private readonly bindingResolver: AgentBindingResolver,
		private readonly users: UserRepository,
		private readonly queue: AgentMessageQueueService,
		private readonly invocations: AgentDepartmentMeetingInvocationRepository,
		private readonly runtimes: AgentRuntimeCacheService,
		private readonly stopService: AgentSessionStopService,
		private readonly executions: AgentExecutionRepository,
		private readonly meetingBindings: DepartmentMeetingBindingVerifierProxy,
		private readonly contextReader: DepartmentMeetingContextReaderProxy,
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
		const binding = await this.bindingResolver.resolveInProject(input.executorId, input.projectId);
		const user = await this.users.findByIdWithRole(input.actorId);
		const authorized =
			user !== null &&
			!user.disabled &&
			(await userHasScopes(user, ['agent:execute'], false, { projectId: input.projectId }));
		const available = binding.exists && binding.available;
		const bindingMatches = await this.meetingBindings.isCurrentBinding({
			projectId: input.projectId,
			departmentId: input.departmentId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
		});
		return {
			available,
			authorized,
			canStart: available && authorized && bindingMatches,
			canStop: authorized && bindingMatches,
		};
	}

	async resolve(input: {
		actorId: string;
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentMeetingInvocationResolution> {
		const result = await this.checkAccess(input);
		return {
			available: result.available,
			canStart: result.canStart,
			canStop: false,
		};
	}

	async dispatch(
		request: DepartmentMeetingInvocationRequest,
	): Promise<DepartmentMeetingDispatchResult> {
		const { expectedInputHash, ...requestIdentity } = request;
		if (hashDepartmentMeetingInvocationRequest(requestIdentity) !== expectedInputHash) {
			throw new ConflictError('Meeting invocation hash does not match its request.');
		}
		if (request.toolPolicy.mode !== 'supplied-material-only') {
			return { kind: 'rejected', code: 'tools' };
		}
		const resolvedContext = await this.contextReader.resolve({
			projectId: request.projectId,
			departmentId: request.departmentId,
			meetingId: request.meetingId,
			participantId: request.participantId,
			actorId: request.actorId,
			contextRef: request.contextRef,
			round: request.round,
		});
		if (
			!resolvedContext ||
			resolvedContext.inputText.length === 0 ||
			resolvedContext.inputText.length > AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS ||
			request.maxOutputChars < 1 ||
			request.maxOutputChars > 4_000 ||
			request.maxOutputTokens < 1 ||
			request.maxOutputTokens > 1_000
		) {
			return { kind: 'rejected', code: 'unavailable' };
		}
		request = { ...request, inputText: resolvedContext.inputText };
		const access = await this.checkAccess(request);
		if (!access.authorized) return { kind: 'rejected', code: 'access' };
		if (!access.canStart) return { kind: 'rejected', code: 'binding' };
		const deadline = Date.parse(request.deadlineAt);
		if (!Number.isFinite(deadline) || deadline <= Date.now()) {
			return { kind: 'rejected', code: 'unavailable' };
		}

		const reservation = await this.invocations.reserve({
			id: randomUUID(),
			projectId: request.projectId,
			departmentId: request.departmentId,
			meetingId: request.meetingId,
			participantId: request.participantId,
			invocationId: request.invocationId,
			round: request.round,
			actorId: request.actorId,
			memberId: request.memberId,
			executorId: request.executorId,
			bindingVersion: request.bindingVersion,
			requestKey: request.requestKey,
			inputHash: request.expectedInputHash,
			contextRef: request.contextRef,
			inputText: request.inputText,
			maxOutputChars: request.maxOutputChars,
			maxOutputTokens: request.maxOutputTokens,
			deadlineAt: new Date(deadline),
			toolPolicy: request.toolPolicy.mode,
			toolPolicyVersion: null,
			threadId: randomUUID(),
		});
		if (reservation.kind === 'cancelled') return { kind: 'rejected', code: 'cancelled' };
		if (reservation.kind === 'conflict') {
			throw new ConflictError('Meeting invocation key was already used for different input.');
		}
		const invocation = reservation.invocation;
		if (invocation.state === 'reserved' || invocation.state === 'unknown') {
			let runtime;
			try {
				runtime = await this.runtimes.getRuntime({
					agentId: request.executorId,
					projectId: request.projectId,
					usePublishedVersion: true,
					departmentMeeting: true,
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
		if (
			invocation.state === 'accepted' ||
			invocation.state === 'running' ||
			invocation.state === 'terminal'
		) {
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		if (invocation.state === 'stopping') {
			return invocation.safeErrorCode === 'enqueue_unknown'
				? { kind: 'unknown' }
				: { kind: 'accepted', ownerInvocationRef: invocation.id };
		}

		try {
			await this.queue.enqueueDepartmentMeeting({
				executorId: request.executorId,
				projectId: request.projectId,
				threadId: invocation.threadId,
				request,
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
		requestKey: string;
		expectedInputHash: string;
	}): Promise<DepartmentMeetingLookupResult> {
		const result = await this.invocations.lookup({
			projectId: input.projectId,
			invocationId: input.invocationId,
			requestKey: input.requestKey,
			inputHash: input.expectedInputHash,
		});
		if (result.kind !== 'unknown') return result;
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation) return { kind: 'unknown' };
		const request = this.toRequest(invocation);
		const messageId = this.queue.departmentMeetingMessageId(
			invocation.executorId,
			invocation.threadId,
			request,
		);
		if (!messageId) return { kind: 'unknown' };
		const execution = await this.executions.findByInputMessageId(messageId);
		if (execution) {
			if (invocation.state !== 'stopping' && invocation.state !== 'terminal') {
				if (execution.status === 'running') {
					await this.invocations.markAccepted(input.projectId, input.invocationId);
					await this.invocations.markRunning(input.projectId, input.invocationId);
				} else {
					const hasValidResult =
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
								: execution.status === 'success' && hasValidResult
									? 'succeeded'
									: 'failed',
						safeErrorCode:
							execution.status === 'success' && !hasValidResult
								? 'result_missing'
								: execution.status === 'error'
									? 'execution_failed'
									: undefined,
					});
				}
			}
			return { kind: 'accepted', ownerInvocationRef: invocation.id };
		}
		const queued = await this.queue.findDepartmentMeetingDispatch({
			executorId: invocation.executorId,
			projectId: invocation.projectId,
			threadId: invocation.threadId,
			request,
		});
		if (!queued) return { kind: 'unknown' };
		if (invocation.state !== 'stopping' && invocation.state !== 'terminal') {
			await this.invocations.markAccepted(input.projectId, input.invocationId);
		}
		return { kind: 'accepted', ownerInvocationRef: invocation.id };
	}

	async reconcilePendingEnqueues(take = 100): Promise<void> {
		for (const invocation of await this.invocations.findUnresolvedEnqueues(take)) {
			const result = await this.lookup({
				projectId: invocation.projectId,
				invocationId: invocation.invocationId,
				requestKey: invocation.requestKey,
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

	async snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
	}): Promise<DepartmentMeetingOwnerSnapshot> {
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation || invocation.id !== input.ownerInvocationRef) {
			return {
				ownerInvocationRef: input.ownerInvocationRef,
				sequence: '0',
				phase: 'unknown',
			};
		}
		const phase =
			invocation.state === 'accepted'
				? 'queued'
				: invocation.state === 'running'
					? 'running'
					: invocation.state === 'stopping'
						? 'stopping'
						: invocation.state === 'terminal'
							? 'terminal'
							: 'unknown';
		return {
			ownerInvocationRef: invocation.id,
			sequence: invocation.sequence,
			phase,
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
			memberId: invocation.memberId,
			executorId: invocation.executorId,
			bindingVersion: invocation.bindingVersion,
		});
		if (!access.canStart || !access.authorized) return null;
		const parsed = parseDepartmentMeetingResult(invocation.round, invocation.resultText);
		if (!parsed) return null;
		return {
			invocationId: invocation.invocationId,
			participantId: invocation.participantId,
			ownerInvocationRef: invocation.id,
			sequence: invocation.sequence,
			resultHash: invocation.resultHash,
			...parsed,
		};
	}

	async requestStop(input: {
		projectId: string;
		invocationId: string;
		actorId: string;
		requestKey: string;
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
		const payloadHash = createHash('sha256')
			.update(
				JSON.stringify({
					projectId: input.projectId,
					invocationId: input.invocationId,
					requestKey: input.requestKey,
					expectedInputHash: input.expectedInputHash,
					actorId: input.actorId,
					commandId: input.commandId,
				}),
			)
			.digest('hex');
		const cancellation = await this.invocations.cancelGate({
			projectId: input.projectId,
			invocationId: input.invocationId,
			requestKey: input.requestKey,
			inputHash: input.expectedInputHash,
			commandId: input.commandId,
			payloadHash,
		});
		if (cancellation.kind === 'conflict') return { acknowledged: false, confirmedTerminal: false };
		const invocation = await this.invocations.findByInvocationId(
			input.projectId,
			input.invocationId,
		);
		if (!invocation) return { acknowledged: true, confirmedTerminal: false };
		if (
			invocation.requestKey !== input.requestKey ||
			invocation.inputHash !== input.expectedInputHash ||
			(input.ownerInvocationRef && invocation.id !== input.ownerInvocationRef)
		)
			return { acknowledged: false, confirmedTerminal: false };
		if (invocation.state === 'terminal') {
			return { acknowledged: true, confirmedTerminal: true };
		}
		const stopPayloadHash = createHash('sha256')
			.update(JSON.stringify([payloadHash, invocation.id, invocation.threadId]))
			.digest('hex');
		const receipt = await this.invocations.requestStop({
			projectId: invocation.projectId,
			invocationId: invocation.invocationId,
			ownerInvocationRef: invocation.id,
			commandId: input.commandId,
			payloadHash: stopPayloadHash,
		});
		if (receipt.kind === 'terminal') return { acknowledged: true, confirmedTerminal: true };
		if (
			receipt.kind === 'conflict' ||
			receipt.kind === 'absent' ||
			receipt.kind === 'unavailable'
		) {
			return { acknowledged: false, confirmedTerminal: false };
		}
		await this.reconcileStop(receipt.invocation);
		const current = await this.invocations.findByInvocationId(
			invocation.projectId,
			invocation.invocationId,
		);
		return { acknowledged: true, confirmedTerminal: current?.state === 'terminal' };
	}

	async reconcilePendingStops(take = 100): Promise<void> {
		for (const invocation of await this.invocations.findPendingStops(take)) {
			await this.reconcileStop(invocation);
		}
	}

	private async reconcileStop(
		invocation: NonNullable<
			Awaited<ReturnType<AgentDepartmentMeetingInvocationRepository['findByInvocationId']>>
		>,
	): Promise<void> {
		if (invocation.state !== 'stopping') return;
		const messageId = this.queue.departmentMeetingMessageId(
			invocation.executorId,
			invocation.threadId,
			this.toRequest(invocation),
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
		const queued = await this.queue.findDepartmentMeetingDispatch({
			executorId: invocation.executorId,
			projectId: invocation.projectId,
			threadId: invocation.threadId,
			request: this.toRequest(invocation),
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
			source: 'ai-department-meeting',
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
		invocation: NonNullable<
			Awaited<ReturnType<AgentDepartmentMeetingInvocationRepository['findByInvocationId']>>
		>,
	): DepartmentMeetingInvocationRequest {
		return {
			schemaVersion: 1,
			projectId: invocation.projectId,
			departmentId: invocation.departmentId,
			meetingId: invocation.meetingId,
			participantId: invocation.participantId,
			invocationId: invocation.invocationId,
			round: invocation.round,
			actorId: invocation.actorId,
			memberId: invocation.memberId,
			executorId: invocation.executorId,
			bindingVersion: invocation.bindingVersion,
			requestKey: invocation.requestKey,
			expectedInputHash: invocation.inputHash,
			contextRef: invocation.contextRef,
			inputText: invocation.inputText,
			maxOutputChars: invocation.maxOutputChars,
			maxOutputTokens: invocation.maxOutputTokens,
			toolPolicy: { mode: 'supplied-material-only' },
			deadlineAt: invocation.deadlineAt?.toISOString() ?? new Date(0).toISOString(),
		};
	}
}
