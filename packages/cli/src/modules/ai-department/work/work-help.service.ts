import type {
	AiDepartmentWorkHelpActionResult,
	AiDepartmentWorkHelpRequestDto,
	AiDepartmentWorkHelpResponseDto,
	AiDepartmentWorkHelpDetailDto,
	AiDepartmentWorkHelpAttentionPageDto,
	AiDepartmentWorkAsk,
	CreateAiDepartmentWorkHelpAnswerDto,
} from '@n8n/api-types';
import {
	aiDepartmentWorkHelpRequestDtoSchema,
	aiDepartmentWorkAskSchema,
	createAiDepartmentWorkHelpAnswerSchema,
	aiDepartmentWorkHelpResponseDtoSchema,
} from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';

import type { DepartmentWorkRunContext } from '@/modules/agents/agent-department-execution.contracts';
import { WorkActivity } from '../database/entities/work-activity.entity';
import { WorkReleaseIntent } from '../database/entities/work-release-intent.entity';
import { WorkTransition } from '../database/entities/work-transition.entity';
import { WorkHelpRequest } from '../database/entities/work-help-request.entity';
import { WorkHelpResponse } from '../database/entities/work-help-response.entity';
import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { WorkHelpRoutingService } from './work-help-routing.service';
import { WorkReleaseService } from './work-release.service';
import { DepartmentExecutorProxy } from './executor.contracts';
import {
	DepartmentConsultationInvocationOwnerProxy,
	hashDepartmentConsultationRequest,
} from '@/modules/agents/agent-department-consultation.contracts';
import { WorkService } from './work.service';
import { WorkHelpResponseGate } from './work-help-response-gate';
import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

const requestChainSchema = z.object({
	memberIds: z.array(z.string()),
	userIds: z.array(z.string()),
});
const HELP_CONTINUATION_NAMESPACE = '7a5e53e2-1e45-4f20-8b18-93ef0b846e18';
@Service()
export class WorkHelpService {
	constructor(
		private readonly repository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly routing: WorkHelpRoutingService,
		private readonly releases: WorkReleaseService,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly consultationOwner: DepartmentConsultationInvocationOwnerProxy,
		private readonly workService: WorkService,
		private readonly responseGate: WorkHelpResponseGate,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {}

	async ask(
		context: DepartmentWorkRunContext,
		requestId: string,
		rawInput: AiDepartmentWorkAsk,
	): Promise<AiDepartmentWorkHelpRequestDto> {
		const input = aiDepartmentWorkAskSchema.parse({ ...rawInput, requestId });
		const payloadHash = createHash('sha256')
			.update(
				JSON.stringify({
					projectId: context.projectId,
					attemptId: context.attemptId,
					input,
				}),
			)
			.digest('hex');
		let releaseIntentId: string | undefined;
		let helpRequestId: string | undefined;

		let saved = await this.txRunner.run({}, async (ctx) => {
			let attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt || attempt.executorId !== context.executorId)
				throw new NotFoundError('Assigned work not found.');
			await this.repository.acquireAdmissionFence(context.projectId, attempt.departmentId, ctx);
			attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt) throw new NotFoundError('Assigned work not found.');

			const receipt = await this.directory.findReceipt(
				context.projectId,
				attempt.initiatingUserId,
				requestId,
				ctx,
			);
			if (receipt) {
				if (receipt.operation !== 'work.agent.ask' || receipt.payloadHash !== payloadHash)
					throw new ConflictError('This request ID was used for a different work command.');
				const replay = z
					.object({ helpRequest: aiDepartmentWorkHelpRequestDtoSchema })
					.parse(JSON.parse(receipt.responseJson ?? '{}'));
				helpRequestId = replay.helpRequest.id;
				releaseIntentId =
					(
						await this.repository.findHelpRequest(
							context.projectId,
							attempt.departmentId,
							replay.helpRequest.workId,
							replay.helpRequest.id,
							ctx,
						)
					)?.ownerReference ?? undefined;
				return replay.helpRequest;
			}

			const department = await this.repository.findDepartment(
				context.projectId,
				attempt.departmentId,
				ctx,
			);
			const member = await this.repository.findMember(
				context.projectId,
				attempt.departmentId,
				attempt.memberId,
				ctx,
			);
			const binding = await this.directory.findBinding(context.projectId, attempt.memberId, ctx);
			if (
				!department ||
				department.archived ||
				!member ||
				member.archived ||
				!binding ||
				binding.version !== attempt.bindingVersion ||
				binding.executorId !== context.executorId ||
				binding.provider !== attempt.provider
			)
				throw new ForbiddenError('The department assignment is no longer available.');
			if (
				!(await this.executor.verifyRun({
					...context,
					actorId: attempt.initiatingUserId,
					dispatchKey: attempt.dispatchKey,
				}))
			)
				throw new ForbiddenError('This execution cannot ask for department work help.');

			const work = await this.repository.findWork(
				context.projectId,
				attempt.departmentId,
				attempt.workId,
				ctx,
			);
			if (
				!work ||
				work.currentAttemptId !== attempt.id ||
				work.assigneeMemberId !== attempt.memberId
			)
				throw new ConflictError('The work assignment has changed.');
			if (input.expectedVersion !== work.version)
				throw new ConflictError('Work item has changed. Inspect it and try again.');
			if (work.state !== 'running' || attempt.phase === 'terminal' || attempt.cancelRequestedAt)
				throw new ConflictError('Only an active work turn can ask for help.');
			const claim = await this.repository.findClaim(context.projectId, attempt.id, ctx);
			if (
				!claim ||
				claim.releasedAt ||
				claim.executionId !== context.executionId ||
				claim.leaseUntil.getTime() <= Date.now()
			)
				throw new ConflictError('A current work claim is required.');
			if (
				await this.repository.hasUnresolvedBlockers(
					context.projectId,
					attempt.departmentId,
					work.id,
					ctx,
				)
			)
				throw new ConflictError('Resolve blocking work before asking for help.');

			const existingRequests = await this.repository.listHelpRequestsForWork(
				context.projectId,
				attempt.departmentId,
				work.id,
				ctx,
			);
			if (existingRequests.length >= 2)
				throw new ConflictError('This work item has reached its help request limit.');
			const previousChain = existingRequests.flatMap((request) => {
				const parsed = requestChainSchema.safeParse(JSON.parse(request.requestChainJson));
				return parsed.success ? [parsed.data] : [];
			});
			const memberChainIds = [...new Set(previousChain.flatMap(({ memberIds }) => memberIds))];
			const userChainIds = [...new Set(previousChain.flatMap(({ userIds }) => userIds))];
			const releaseIntentIdValue = randomUUID();
			const routed = await this.routing.route({
				projectId: context.projectId,
				departmentId: attempt.departmentId,
				requesterMemberId: attempt.memberId,
				managerMemberId: member.managerMemberId,
				assignmentActorUserId: work.assignedByUserId,
				expertiseTags: input.expertiseTags,
				requestChainMemberIds: memberChainIds,
				requestChainUserIds: userChainIds,
				initiatingUserId: attempt.initiatingUserId,
			});
			const now = new Date();
			const helpRequestIdValue = randomUUID();
			const nextMemberChain = routed.recipientMemberId
				? [...memberChainIds, routed.recipientMemberId]
				: memberChainIds;
			const nextUserChain = routed.recipientUserId
				? [...userChainIds, routed.recipientUserId]
				: userChainIds;
			const helpRequest = Object.assign(new WorkHelpRequest(), {
				id: helpRequestIdValue,
				projectId: work.projectId,
				departmentId: work.departmentId,
				workId: work.id,
				requesterMemberId: attempt.memberId,
				sourceAttemptId: attempt.id,
				initiatingUserId: attempt.initiatingUserId,
				requestId,
				question: input.question,
				attemptedStepsJson: JSON.stringify(input.attemptedSteps),
				reason: input.reason,
				waitingForChildren: false,
				expertiseTagsJson: JSON.stringify(input.expertiseTags),
				requestChainJson: JSON.stringify({
					memberIds: [...new Set(nextMemberChain)],
					userIds: [...new Set(nextUserChain)],
				}),
				recipientMemberId: routed.recipientMemberId,
				recipientUserId: routed.recipientUserId,
				routingState: routed.state,
				bindingVersion: routed.bindingVersion,
				inputHash: payloadHash,
				deadlineAt: null,
				state: 'pending_stop' as const,
				ownerReference: releaseIntentIdValue,
				ownerInvocationHash: null,
				version: 1,
				createdAt: now,
				updatedAt: now,
			});

			const release = Object.assign(new WorkReleaseIntent(), {
				id: releaseIntentIdValue,
				projectId: work.projectId,
				departmentId: work.departmentId,
				workId: work.id,
				sourceAttemptId: attempt.id,
				requestedByActorId: attempt.initiatingUserId,
				reason: input.reason,
				requestId,
				stopCommandId: randomUUID(),
				state: 'awaiting_stop' as const,
				createdAt: now,
				confirmedAt: null,
			});
			work.state = 'blocked';
			work.version += 1;
			await this.repository.saveHelpRequest(helpRequest, ctx);
			await this.repository.saveRelease(release, ctx);
			await this.repository.saveWork(work, ctx);
			await this.repository.addTransition(
				Object.assign(new WorkTransition(), {
					id: randomUUID(),
					projectId: work.projectId,
					departmentId: work.departmentId,
					workId: work.id,
					attemptId: attempt.id,
					actorId: attempt.memberId,
					actorKind: 'agent',
					fromState: 'running',
					toState: 'blocked',
					reason: input.reason,
					workVersion: work.version,
					createdAt: now,
				}),
				ctx,
			);
			await this.repository.addActivity(
				Object.assign(new WorkActivity(), {
					id: randomUUID(),
					projectId: work.projectId,
					departmentId: work.departmentId,
					workId: work.id,
					attemptId: attempt.id,
					actorId: attempt.memberId,
					actorKind: 'agent',
					kind: 'help_requested',
					body: input.question,
					workVersion: work.version,
					createdAt: now,
				}),
				ctx,
			);
			helpRequestId = helpRequest.id;
			releaseIntentId = release.id;
			const response: AiDepartmentWorkHelpActionResult = {
				helpRequest: this.toDto(helpRequest),
			};
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId: work.projectId,
					actorId: attempt.initiatingUserId,
					requestId,
					payloadHash,
					operation: 'work.agent.ask',
					status: 'completed',
					responseJson: JSON.stringify(response),
					createdAt: now,
				}),
				ctx,
			);
			return response.helpRequest;
		});

		if (releaseIntentId) {
			await this.releases.requestOwnerStop(releaseIntentId);
			if (helpRequestId) await this.advanceAfterConfirmedStop(context.projectId, helpRequestId);
			if (helpRequestId && this.responseGate.canUseAgentResponses())
				await this.dispatchConsultation(context.projectId, helpRequestId);
			if (helpRequestId) {
				const request = await this.repository.findHelpRequestById(context.projectId, helpRequestId);
				if (request) saved = this.toDto(request);
			}
		}
		if (helpRequestId) {
			const request = await this.repository.findHelpRequestById(context.projectId, helpRequestId);
			if (request)
				await this.operationsBroadcaster.notifyCurrent(request.projectId, request.departmentId);
		}
		return saved;
	}

	async reconcilePending(signal?: AbortSignal) {
		const pending = await this.repository.listPendingHelpRequests(100);
		for (const request of pending) {
			if (signal?.aborted) break;
			if (!request.ownerReference) continue;
			await this.releases.requestOwnerStop(request.ownerReference);
			await this.advanceAfterConfirmedStop(request.projectId, request.id);
			if (this.responseGate.canUseAgentResponses())
				await this.dispatchConsultation(request.projectId, request.id);
			await this.reconcileConsultation(request.projectId, request.id);
			await this.operationsBroadcaster.notifyCurrent(request.projectId, request.departmentId);
		}
		if (!this.responseGate.canUseAgentResponses()) return;
		const queued = await this.repository.listQueuedHelpRequests(100);
		for (const request of queued) {
			if (signal?.aborted) break;
			await this.reconcileConsultation(request.projectId, request.id);
			await this.operationsBroadcaster.notifyCurrent(request.projectId, request.departmentId);
		}
		const answered = await this.repository.listAnsweredHelpRequests(100);
		for (const request of answered) {
			if (signal?.aborted) break;
			await this.continueRequester(request.projectId, request);
			await this.operationsBroadcaster.notifyCurrent(request.projectId, request.departmentId);
		}
	}

	async listForWork(
		projectId: string,
		departmentId: string,
		workId: string,
	): Promise<AiDepartmentWorkHelpDetailDto[]> {
		const work = await this.repository.findWork(projectId, departmentId, workId);
		if (!work) throw new NotFoundError('Work item not found.');
		const requests = await this.repository.listHelpRequestsForWork(projectId, departmentId, workId);
		const details: AiDepartmentWorkHelpDetailDto[] = [];
		for (const request of requests) {
			const response = await this.repository.findHelpResponse(
				projectId,
				departmentId,
				workId,
				request.id,
			);
			details.push({
				request: this.toDto(request),
				response: response
					? aiDepartmentWorkHelpResponseDtoSchema.parse({
							id: response.id,
							requestId: request.id,
							responderKind: response.responderKind,
							responderId: response.responderUserId ?? response.responderMemberId,
							answer: response.answer,
							createdAt: response.createdAt.toISOString(),
						})
					: null,
			});
		}
		return details;
	}

	async listAttention(
		projectId: string,
		departmentId: string,
	): Promise<AiDepartmentWorkHelpAttentionPageDto> {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		const requests = await this.repository.listHelpAttention(projectId, departmentId, 21);
		const items: AiDepartmentWorkHelpAttentionPageDto['items'] = [];
		for (const request of requests.slice(0, 20)) {
			const work = await this.repository.findWork(projectId, departmentId, request.workId);
			if (!work) continue;
			const response = await this.repository.findHelpResponse(
				projectId,
				departmentId,
				work.id,
				request.id,
			);
			items.push({
				request: this.toDto(request),
				response: response
					? aiDepartmentWorkHelpResponseDtoSchema.parse({
							id: response.id,
							requestId: request.id,
							responderKind: response.responderKind,
							responderId: response.responderUserId ?? response.responderMemberId,
							answer: response.answer,
							createdAt: response.createdAt.toISOString(),
						})
					: null,
				workTitle: work.instruction,
			});
		}
		return { items, hasMore: requests.length > 20 };
	}

	async answer(
		projectId: string,
		departmentId: string,
		workId: string,
		helpRequestId: string,
		userId: string,
		rawInput: CreateAiDepartmentWorkHelpAnswerDto,
	): Promise<AiDepartmentWorkHelpResponseDto> {
		const input = createAiDepartmentWorkHelpAnswerSchema.parse(rawInput);
		const payloadHash = createHash('sha256')
			.update(JSON.stringify({ projectId, departmentId, workId, helpRequestId, input }))
			.digest('hex');
		const answerHash = createHash('sha256').update(input.answer).digest('hex');
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const receipt = await this.directory.findReceipt(projectId, userId, input.requestId, ctx);
					if (receipt) {
						if (receipt.operation !== 'work.help.answer' || receipt.payloadHash !== payloadHash)
							throw new ConflictError('This request ID was used for a different work command.');
						return aiDepartmentWorkHelpResponseDtoSchema.parse(
							JSON.parse(receipt.responseJson ?? '{}'),
						);
					}

					const request = await this.repository.findHelpRequest(
						projectId,
						departmentId,
						workId,
						helpRequestId,
						ctx,
					);
					if (!request) throw new NotFoundError('Help request not found.');
					const existingResponse = await this.repository.findHelpResponse(
						projectId,
						departmentId,
						workId,
						helpRequestId,
						ctx,
					);
					if (existingResponse) {
						if (
							existingResponse.responderUserId !== userId ||
							existingResponse.answerHash !== answerHash
						)
							throw new ConflictError('This help request already has a response.');
						const replay = aiDepartmentWorkHelpResponseDtoSchema.parse({
							id: existingResponse.id,
							requestId: helpRequestId,
							responderKind: 'user',
							responderId: userId,
							answer: existingResponse.answer,
							createdAt: existingResponse.createdAt.toISOString(),
						});
						await this.directory.saveReceipt(
							Object.assign(new CommandReceipt(), {
								id: randomUUID(),
								projectId,
								actorId: userId,
								requestId: input.requestId,
								payloadHash,
								operation: 'work.help.answer',
								status: 'completed',
								responseJson: JSON.stringify(replay),
								createdAt: new Date(),
							}),
							ctx,
						);
						return replay;
					}
					if (request.state !== 'awaiting_answer')
						throw new ConflictError('This help request is not accepting an answer.');
					if (request.deadlineAt && request.deadlineAt.getTime() <= Date.now())
						throw new ConflictError('This help request has expired.');
					if (input.expectedVersion !== request.version)
						throw new ConflictError('Help request has changed. Reload it and try again.');
					if (request.recipientUserId && request.recipientUserId !== userId)
						throw new ForbiddenError('This help request is assigned to another person.');
					if (!request.ownerReference)
						throw new ConflictError('The requester turn has not been confirmed stopped.');
					const release = await this.repository.findRelease(projectId, request.ownerReference, ctx);
					const attempt = await this.repository.findAttempt(
						projectId,
						request.sourceAttemptId,
						ctx,
					);
					if (release?.state !== 'confirmed' || attempt?.phase !== 'terminal')
						throw new ConflictError('The requester turn has not been confirmed stopped.');
					const work = await this.repository.findWork(projectId, departmentId, workId, ctx);
					if (
						!work ||
						work.currentAttemptId !== request.sourceAttemptId ||
						work.state !== 'blocked'
					)
						throw new ConflictError('The work assignment has changed.');

					const now = new Date();
					const activity = Object.assign(new WorkActivity(), {
						id: randomUUID(),
						projectId,
						departmentId,
						workId,
						attemptId: request.sourceAttemptId,
						actorId: userId,
						actorKind: 'user' as const,
						kind: 'help_answered',
						body: input.answer,
						workVersion: work.version + 1,
						createdAt: now,
					});
					const response = Object.assign(new WorkHelpResponse(), {
						id: randomUUID(),
						projectId,
						departmentId,
						workId,
						helpRequestId,
						activityId: activity.id,
						responderKind: 'user' as const,
						responderUserId: userId,
						responderMemberId: null,
						answer: input.answer,
						answerHash,
						sourceAttemptId: request.sourceAttemptId,
						ownerInvocationRef: null,
						ownerSequence: null,
						createdAt: now,
					});
					request.state = 'answered';
					request.version += 1;
					work.version += 1;
					await this.repository.addActivity(activity, ctx);
					await this.repository.saveHelpResponse(response, ctx);
					await this.repository.saveHelpRequest(request, ctx);
					await this.repository.saveWork(work, ctx);
					const result = aiDepartmentWorkHelpResponseDtoSchema.parse({
						id: response.id,
						requestId: request.id,
						responderKind: 'user',
						responderId: userId,
						answer: input.answer,
						createdAt: now.toISOString(),
					});
					await this.directory.saveReceipt(
						Object.assign(new CommandReceipt(), {
							id: randomUUID(),
							projectId,
							actorId: userId,
							requestId: input.requestId,
							payloadHash,
							operation: 'work.help.answer',
							status: 'completed',
							responseJson: JSON.stringify(result),
							createdAt: now,
						}),
						ctx,
					);
					return result;
				}),
		);
	}

	private async runAndNotify<T>(
		projectId: string,
		departmentId: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const result = await operation();
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);
		return result;
	}

	private async dispatchConsultation(projectId: string, helpRequestId: string) {
		if (!this.responseGate.canUseAgentResponses()) return;
		const request = await this.repository.findHelpRequestById(projectId, helpRequestId);
		if (
			!request ||
			!['awaiting_answer', 'queued'].includes(request.state) ||
			!request.recipientMemberId ||
			request.recipientUserId ||
			request.routingState === 'assignment_actor_fallback' ||
			request.bindingVersion === null ||
			!request.deadlineAt ||
			request.deadlineAt.getTime() <= Date.now()
		)
			return;
		const binding = await this.directory.findBinding(projectId, request.recipientMemberId);
		if (!binding || binding.provider !== 'n8n-agent' || binding.version !== request.bindingVersion)
			return;
		const resolution = await this.consultationOwner.resolve({
			actorId: request.initiatingUserId ?? '',
			projectId,
			departmentId: request.departmentId,
			memberId: request.recipientMemberId,
			executorId: binding.executorId,
			bindingVersion: binding.version,
		});
		if (!resolution.available || !resolution.canStart) return;
		const invocationId = request.id;
		const commandKey = `work-help:${request.id}`;
		const intent = {
			schemaVersion: 1 as const,
			projectId,
			departmentId: request.departmentId,
			helpRequestId: request.id,
			invocationId,
			sourceAttemptId: request.sourceAttemptId,
			requesterMemberId: request.requesterMemberId,
			recipientMemberId: request.recipientMemberId,
			actorId: request.initiatingUserId ?? '',
			executorId: binding.executorId,
			bindingVersion: binding.version,
			commandKey,
			contextRef: request.id,
			contextHash: '',
			deadlineAt: request.deadlineAt.toISOString(),
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			toolPolicy: { mode: 'none' as const, policyVersion: 'department-consultation-v1' },
		};
		const context = await this.consultationOwnerContext(projectId, request);
		if (!context) return;
		const invocationRequest = { ...intent, contextHash: context.contextHash };
		const expectedInputHash = hashDepartmentConsultationRequest(invocationRequest);
		const dispatchable = await this.txRunner.run({}, async (ctx) => {
			const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
			if (!current || !['awaiting_answer', 'queued'].includes(current.state)) return false;
			if (current.state === 'awaiting_answer') {
				if (current.version !== request.version) return false;
				current.state = 'queued';
				current.ownerInvocationHash = expectedInputHash;
				current.version += 1;
				await this.repository.saveHelpRequest(current, ctx);
				return true;
			}
			if (current.ownerInvocationHash && current.ownerInvocationHash !== expectedInputHash)
				return false;
			if (!current.ownerInvocationHash) {
				current.ownerInvocationHash = expectedInputHash;
				current.version += 1;
				await this.repository.saveHelpRequest(current, ctx);
			}
			return true;
		});
		if (!dispatchable) return;
		let result: Awaited<ReturnType<DepartmentConsultationInvocationOwnerProxy['invoke']>>;
		try {
			result = await this.consultationOwner.invoke({ ...invocationRequest, expectedInputHash });
		} catch (error) {
			if (!(error instanceof ConflictError)) throw error;
			await this.txRunner.run({}, async (ctx) => {
				const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
				if (current?.state === 'queued') {
					current.state =
						current.deadlineAt && current.deadlineAt.getTime() > Date.now()
							? 'awaiting_answer'
							: 'expired';
					current.version += 1;
					await this.repository.saveHelpRequest(current, ctx);
				}
			});
			return;
		}
		if (result.kind === 'rejected') {
			await this.txRunner.run({}, async (ctx) => {
				const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
				if (current?.state === 'queued' && current.id === invocationId) {
					current.state =
						current.deadlineAt && current.deadlineAt.getTime() > Date.now()
							? 'awaiting_answer'
							: 'expired';
					current.version += 1;
					await this.repository.saveHelpRequest(current, ctx);
				}
			});
		}
	}

	private async consultationOwnerContext(
		projectId: string,
		request: WorkHelpRequest,
	): Promise<{ contextHash: string } | null> {
		const work = await this.repository.findWork(projectId, request.departmentId, request.workId);
		const attempt = await this.repository.findAttempt(projectId, request.sourceAttemptId);
		if (
			!work ||
			work.state !== 'blocked' ||
			work.currentAttemptId !== request.sourceAttemptId ||
			attempt?.phase !== 'terminal'
		)
			return null;
		const context = [
			`Work: ${work.instruction}`,
			`Question: ${request.question}`,
			`Reason: ${request.reason}`,
			`Steps already tried: ${z.array(z.string()).parse(JSON.parse(request.attemptedStepsJson)).join('\n')}`,
		].join('\n\n');
		return { contextHash: createHash('sha256').update(context).digest('hex') };
	}

	private async reconcileConsultation(projectId: string, helpRequestId: string) {
		if (!this.responseGate.canUseAgentResponses()) return;
		const request = await this.repository.findHelpRequestById(projectId, helpRequestId);
		if (
			!request ||
			request.state !== 'queued' ||
			!request.recipientMemberId ||
			!request.ownerReference
		)
			return;
		let expectedInputHash = request.ownerInvocationHash;
		if (!expectedInputHash) {
			await this.dispatchConsultation(projectId, helpRequestId);
			expectedInputHash =
				(await this.repository.findHelpRequestById(projectId, request.id))?.ownerInvocationHash ??
				null;
		}
		if (!expectedInputHash) return;
		let lookup = await this.consultationOwner.lookup({
			projectId,
			invocationId: request.id,
			commandKey: `work-help:${request.id}`,
			expectedInputHash,
		});
		if (lookup.kind === 'absent' || lookup.kind === 'unknown') {
			await this.dispatchConsultation(projectId, helpRequestId);
			lookup = await this.consultationOwner.lookup({
				projectId,
				invocationId: request.id,
				commandKey: `work-help:${request.id}`,
				expectedInputHash,
			});
		}
		if (lookup.kind !== 'accepted') return;
		const snapshot = await this.consultationOwner.snapshot({
			projectId,
			invocationId: request.id,
			ownerInvocationRef: lookup.ownerInvocationRef,
		});
		if (snapshot.phase === 'terminal' && snapshot.outcome !== 'succeeded') {
			await this.txRunner.run({}, async (ctx) => {
				const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
				if (current?.state === 'queued') {
					current.state =
						current.deadlineAt && current.deadlineAt.getTime() > Date.now()
							? 'awaiting_answer'
							: 'expired';
					current.version += 1;
					await this.repository.saveHelpRequest(current, ctx);
				}
			});
			return;
		}
		if (snapshot.phase !== 'terminal') return;
		const deferToHuman = async () =>
			await this.txRunner.run({}, async (ctx) => {
				const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
				if (!current || current.state !== 'queued') return;
				current.state =
					current.deadlineAt && current.deadlineAt.getTime() > Date.now()
						? 'awaiting_answer'
						: 'expired';
				current.version += 1;
				await this.repository.saveHelpRequest(current, ctx);
			});
		const ownerResult = await this.consultationOwner.readResult({
			projectId,
			invocationId: request.id,
			ownerInvocationRef: lookup.ownerInvocationRef,
			expectedInputHash,
		});
		if (!ownerResult || ownerResult.helpRequestId !== request.id) {
			await deferToHuman();
			return;
		}
		const currentContext = await this.consultationOwnerContext(projectId, request);
		if (currentContext?.contextHash !== ownerResult.contextHash) {
			await deferToHuman();
			return;
		}
		await this.txRunner.run({}, async (ctx) => {
			const current = await this.repository.findHelpRequestById(projectId, request.id, ctx);
			if (
				!current ||
				current.state !== 'queued' ||
				current.id !== ownerResult.ownerInvocationRef ||
				!current.recipientMemberId
			)
				return;
			const work = await this.repository.findWork(
				projectId,
				current.departmentId,
				current.workId,
				ctx,
			);
			if (!work || work.state !== 'blocked' || work.currentAttemptId !== current.sourceAttemptId)
				return;
			const context = [
				`Work: ${work.instruction}`,
				`Question: ${current.question}`,
				`Reason: ${current.reason}`,
				`Steps already tried: ${z.array(z.string()).parse(JSON.parse(current.attemptedStepsJson)).join('\n')}`,
			].join('\n\n');
			if (createHash('sha256').update(context).digest('hex') !== ownerResult.contextHash) return;
			const activity = Object.assign(new WorkActivity(), {
				id: randomUUID(),
				projectId,
				departmentId: current.departmentId,
				workId: current.workId,
				attemptId: current.sourceAttemptId,
				actorId: current.recipientMemberId,
				actorKind: 'agent' as const,
				kind: 'help_answered',
				body: ownerResult.answer,
				workVersion: work.version + 1,
				createdAt: new Date(),
			});
			const response = Object.assign(new WorkHelpResponse(), {
				id: randomUUID(),
				projectId,
				departmentId: current.departmentId,
				workId: current.workId,
				helpRequestId: current.id,
				activityId: activity.id,
				responderKind: 'agent' as const,
				responderUserId: null,
				responderMemberId: current.recipientMemberId,
				answer: ownerResult.answer,
				answerHash: ownerResult.resultHash,
				sourceAttemptId: current.sourceAttemptId,
				ownerInvocationRef: ownerResult.ownerInvocationRef,
				ownerSequence: Number(ownerResult.sequence),
				createdAt: activity.createdAt,
			});
			current.state = 'answered';
			current.version += 1;
			work.version += 1;
			await this.repository.addActivity(activity, ctx);
			await this.repository.saveHelpResponse(response, ctx);
			await this.repository.saveHelpRequest(current, ctx);
			await this.repository.saveWork(work, ctx);
		});
		await this.continueRequester(projectId, request);
	}

	private async continueRequester(projectId: string, request: WorkHelpRequest) {
		if (!this.responseGate.canUseAgentResponses()) return;
		const actorId = request.initiatingUserId;
		if (!actorId) return;
		const dispatchRequestId = uuidv5(`${request.id}:continuation`, HELP_CONTINUATION_NAMESPACE);
		const currentRequest = await this.repository.findHelpRequestById(projectId, request.id);
		if (!currentRequest || currentRequest.state !== 'answered') return;
		const work = await this.repository.findWork(
			projectId,
			currentRequest.departmentId,
			currentRequest.workId,
		);
		const attempt = await this.repository.findAttempt(projectId, currentRequest.sourceAttemptId);
		if (
			!work ||
			!attempt ||
			attempt.phase !== 'terminal' ||
			work.state !== 'blocked' ||
			work.currentAttemptId !== attempt.id ||
			work.assigneeMemberId !== currentRequest.requesterMemberId ||
			(await this.repository.hasUnresolvedBlockers(projectId, currentRequest.departmentId, work.id))
		)
			return;
		try {
			await this.workService.startWork(
				projectId,
				actorId,
				currentRequest.departmentId,
				work.id,
				{
					expectedVersion: work.version,
					requestId: dispatchRequestId,
				},
				true,
			);
		} catch (error) {
			if (error instanceof ConflictError) {
				const latestWork = await this.repository.findWork(
					projectId,
					currentRequest.departmentId,
					currentRequest.workId,
				);
				const latestAttempts = await this.repository.listAttempts(projectId, currentRequest.workId);
				const latestRequest = await this.repository.findHelpRequestById(
					projectId,
					currentRequest.id,
				);
				if (
					latestRequest?.state === 'answered' &&
					latestWork?.assigneeMemberId === currentRequest.requesterMemberId &&
					(latestWork.state === 'ready' ||
						latestWork.currentAttemptId !== currentRequest.sourceAttemptId) &&
					latestAttempts.some(({ id }) => id !== currentRequest.sourceAttemptId)
				)
					return;
			}
			throw error;
		}
	}

	private async advanceAfterConfirmedStop(projectId: string, helpRequestId: string) {
		await this.txRunner.run({}, async (ctx) => {
			const request = await this.repository.findHelpRequestById(projectId, helpRequestId, ctx);
			if (!request || request.state !== 'pending_stop' || !request.ownerReference) return;
			const release = await this.repository.findRelease(projectId, request.ownerReference, ctx);
			const attempt = await this.repository.findAttempt(projectId, request.sourceAttemptId, ctx);
			if (release?.state !== 'confirmed' || attempt?.phase !== 'terminal') return;
			request.state = 'awaiting_answer';
			request.deadlineAt = new Date(Date.now() + 10 * 60 * 1000);
			request.version += 1;
			await this.repository.saveHelpRequest(request, ctx);
			const receipt = request.initiatingUserId
				? await this.directory.findReceipt(
						projectId,
						request.initiatingUserId,
						request.requestId,
						ctx,
					)
				: null;
			if (receipt) {
				receipt.responseJson = JSON.stringify({ helpRequest: this.toDto(request) });
				await this.directory.saveReceipt(receipt, ctx);
			}
		});
	}

	private toDto(request: {
		id: string;
		workId: string;
		requesterMemberId: string;
		sourceAttemptId: string;
		question: string;
		attemptedStepsJson: string;
		reason: string;
		expertiseTagsJson: string;
		state: AiDepartmentWorkHelpRequestDto['state'];
		routingState: AiDepartmentWorkHelpRequestDto['routing']['state'];
		recipientMemberId: string | null;
		recipientUserId: string | null;
		deadlineAt: Date | null;
		createdAt: Date;
		version: number;
	}): AiDepartmentWorkHelpRequestDto {
		return aiDepartmentWorkHelpRequestDtoSchema.parse({
			id: request.id,
			workId: request.workId,
			requesterMemberId: request.requesterMemberId,
			sourceAttemptId: request.sourceAttemptId,
			question: request.question,
			attemptedSteps: z.array(z.string()).parse(JSON.parse(request.attemptedStepsJson)),
			reason: request.reason,
			expertiseTags: z.array(z.string()).parse(JSON.parse(request.expertiseTagsJson)),
			state: request.state,
			routing: {
				state: request.routingState,
				recipientMemberId: request.recipientMemberId,
				recipientUserId: request.recipientUserId,
				deadlineAt: request.deadlineAt?.toISOString() ?? null,
			},
			createdAt: request.createdAt.toISOString(),
			version: request.version,
		});
	}
}
