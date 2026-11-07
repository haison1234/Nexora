import {
	aiDepartmentAgentWorkActionSchema,
	aiDepartmentWorkAskSchema,
	aiDepartmentWorkDelegateSchema,
	aiDepartmentReviewStageSchema,
	type AiDepartmentAgentWorkResult,
	aiDepartmentAgentWorkResultSchema,
	aiDepartmentWorkDelegateActionResultSchema,
	type AiDepartmentAgentWorkAction,
	type AiDepartmentAgentWorkToolResult,
	type AiDepartmentAssignedWorkInboxQueryDto,
} from '@n8n/api-types';
import { TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
	DepartmentExecutorProxy,
	DepartmentWorkActions,
	DepartmentWorkInboxProxy,
	type DepartmentWorkRunContext,
} from '@/modules/agents/agent-department-execution.contracts';
import { WorkClaim } from '../database/entities/work-claim.entity';
import { WorkActivity } from '../database/entities/work-activity.entity';
import { WorkTransition } from '../database/entities/work-transition.entity';
import { WorkReleaseIntent } from '../database/entities/work-release-intent.entity';
import { WorkEligibility } from '../database/entities/work-eligibility.entity';
import { WorkWakeIntent } from '../database/entities/work-wake-intent.entity';
import {
	SubmittedWorkResult,
	WorkReviewPolicyRevision,
	WorkReviewRound,
} from '../database/entities/work-review-records.entity';
import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { WorkRepository } from '../database/repositories/work.repository';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { toWorkDto } from './work-mappers';
import { WorkReleaseService } from './work-release.service';
import { WorkHandoffService } from './work-handoff.service';
import { WorkHelpService } from './work-help.service';
import { WorkItem } from '../database/entities/work-item.entity';
import { WorkRelationship } from '../database/entities/work-relationship.entity';
import { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

const CLAIM_LEASE_MS = 5 * 60 * 1000;

@Service()
export class WorkCoordinationService extends DepartmentWorkActions {
	constructor(
		private readonly repository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
		private readonly releases: WorkReleaseService,
		private readonly inbox: DepartmentWorkInboxProxy,
		private readonly handoffs: WorkHandoffService,
		private readonly help: WorkHelpService,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {
		super();
	}

	async executeToolAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		rawInput: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkToolResult> {
		const input = aiDepartmentAgentWorkActionSchema.parse(rawInput);
		if (input.action === 'inbox') {
			return await this.listInbox(context, {
				take: input.take ?? 50,
				...(input.cursor ? { cursor: input.cursor } : {}),
			});
		}
		if (input.action === 'handoff') {
			if (!input.expectedVersion || !input.destinationMemberId || !input.body)
				throw new UserError('A work version, destination member, and handoff reason are required.');
			return await this.handoffs.requestAgentHandoff(context, requestId, {
				expectedVersion: input.expectedVersion,
				destinationMemberId: input.destinationMemberId,
				reason: input.body,
			});
		}
		if (input.action === 'ask') {
			if (
				!input.expectedVersion ||
				!input.question ||
				!input.attemptedSteps ||
				!input.reason ||
				!input.expertiseTags
			)
				throw new UserError(
					'A work version, question, attempted steps, reason, and expertise tags are required.',
				);
			const ask = aiDepartmentWorkAskSchema.parse({
				expectedVersion: input.expectedVersion,
				question: input.question,
				attemptedSteps: input.attemptedSteps,
				reason: input.reason,
				expertiseTags: input.expertiseTags,
				requestId,
			});
			return { helpRequest: await this.help.ask(context, requestId, ask) };
		}
		if (input.action === 'delegate') {
			if (!input.expectedVersion || !input.recipientMemberId || !input.title || !input.instruction)
				throw new UserError('A work version, recipient, title, and instruction are required.');
			return await this.delegate(context, requestId, input);
		}
		return await this.executeAction(context, requestId, input);
	}

	async executeAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		rawInput: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkResult> {
		const input = aiDepartmentAgentWorkActionSchema.parse(rawInput);
		if (
			input.action === 'inbox' ||
			input.action === 'handoff' ||
			input.action === 'ask' ||
			input.action === 'delegate'
		)
			throw new UserError('Use the authenticated Agent work tool for this action.');
		const idempotentInput =
			input.action === 'claim' || input.action === 'submit'
				? { ...input, expectedVersion: undefined }
				: input;
		const hash = createHash('sha256')
			.update(JSON.stringify({ context, input: idempotentInput }))
			.digest('hex');
		let releaseIntentId: string | undefined;
		let departmentId: string | undefined;
		const response = await this.txRunner.run({}, async (ctx) => {
			let attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt || attempt.executorId !== context.executorId)
				throw new NotFoundError('Assigned work not found.');
			departmentId = attempt.departmentId;
			await this.repository.acquireAdmissionFence(context.projectId, attempt.departmentId, ctx);
			attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt) throw new NotFoundError('Assigned work not found.');
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
			) {
				throw new ForbiddenError('The department assignment is no longer available.');
			}
			if (
				!(await this.executor.verifyRun({
					...context,
					actorId: attempt.initiatingUserId,
					dispatchKey: attempt.dispatchKey,
				}))
			) {
				throw new ForbiddenError('This execution cannot update department work.');
			}
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
			if (
				input.report?.checkedEvidence.some(
					({ reference }) =>
						reference !== undefined &&
						reference !== `work:${work.id}` &&
						reference !== `attempt:${attempt.id}`,
				)
			)
				throw new UserError('Evidence references must belong to the current Work or attempt.');
			let claim = await this.repository.findClaim(context.projectId, attempt.id, ctx);
			const result = (): AiDepartmentAgentWorkResult => ({
				work: toWorkDto(work),
				claim: claim
					? {
							id: claim.id,
							attemptId: claim.attemptId,
							memberId: claim.memberId,
							executionId: claim.executionId,
							claimGeneration: claim.claimGeneration,
							leaseUntil: claim.leaseUntil.toISOString(),
							releasedAt: claim.releasedAt?.toISOString() ?? null,
						}
					: null,
			});
			if (input.action === 'inspect') {
				const helpRequests = await this.repository.listHelpRequestsForWork(
					context.projectId,
					attempt.departmentId,
					work.id,
					ctx,
				);
				const helpAnswers = await Promise.all(
					helpRequests
						.filter(
							(request) =>
								request.state === 'answered' && request.requesterMemberId === attempt.memberId,
						)
						.map(async (request) => {
							const response = await this.repository.findHelpResponse(
								context.projectId,
								attempt.departmentId,
								work.id,
								request.id,
								ctx,
							);
							return response
								? {
										question: request.question,
										answer: response.answer,
										responderKind: response.responderKind,
										answeredAt: response.createdAt.toISOString(),
									}
								: null;
						}),
				);
				const children = await this.repository.listChildrenForParent(
					context.projectId,
					attempt.departmentId,
					work.id,
					ctx,
				);
				const childReports = await Promise.all(
					children.map(async (child) => ({
						workId: child.id,
						state: child.state,
						report:
							child.state === 'done'
								? await this.repository.findLatestAcceptedReport(
										context.projectId,
										attempt.departmentId,
										child.id,
										ctx,
									)
								: null,
					})),
				);
				return {
					...result(),
					work: {
						...toWorkDto(work),
						childReports,
						helpAnswers: helpAnswers.filter((answer) => answer !== null),
					},
				};
			}
			if (await this.repository.findPendingHandoffForAttempt(context.projectId, attempt.id, ctx))
				throw new ConflictError(
					'This work is waiting for handoff and no longer accepts Agent actions.',
				);
			const previous = await this.directory.findReceipt(
				context.projectId,
				attempt.initiatingUserId,
				requestId,
				ctx,
			);
			if (previous) {
				if (previous.payloadHash !== hash || !previous.responseJson)
					throw new ConflictError('This command identity is already in use.');
				return aiDepartmentAgentWorkResultSchema.parse(JSON.parse(previous.responseJson));
			}
			if (await this.repository.findPendingReleaseForAttempt(context.projectId, attempt.id, ctx))
				throw new ConflictError(
					'Work release is waiting for the current run to stop. Retry is not available yet.',
				);
			if (attempt.phase === 'terminal' || attempt.cancelRequestedAt)
				throw new ConflictError('This work attempt no longer accepts updates.');
			if (input.expectedVersion !== work.version)
				throw new ConflictError('Work item has changed. Inspect it and try again.');
			const fromState = work.state;
			const now = new Date();
			if (input.action === 'claim') {
				if (claim && !claim.releasedAt && claim.executionId !== context.executionId) {
					if (!(await this.executor.isRunStopped(claim.executionId)))
						throw new ConflictError('Another execution holds this work claim.');
					throw new ConflictError(
						'The previous run has stopped. Retry the work to create a new attempt.',
					);
				}
				if (claim?.releasedAt)
					throw new ConflictError('This attempt has released its claim. Start a new attempt.');
				if (
					work.state !== 'ready' &&
					!(claim && (work.state === 'running' || work.state === 'blocked'))
				)
					throw new ConflictError('Only ready work can be claimed.');
				if (
					await this.repository.hasUnresolvedBlockers(
						context.projectId,
						attempt.departmentId,
						work.id,
						ctx,
					)
				)
					throw new ConflictError('Resolve blocking work before claiming this item.');
				claim = Object.assign(claim ?? new WorkClaim(), {
					id: claim?.id ?? randomUUID(),
					projectId: context.projectId,
					departmentId: attempt.departmentId,
					workId: work.id,
					attemptId: attempt.id,
					memberId: attempt.memberId,
					executionId: context.executionId,
					claimGeneration: attempt.ordinal,
					createdAt: claim?.createdAt ?? now,
					leaseUntil: new Date(now.getTime() + CLAIM_LEASE_MS),
					claimedAt: now,
					releasedAt: null,
				});
				work.state = 'running';
			} else {
				if (
					!claim ||
					claim.releasedAt ||
					claim.executionId !== context.executionId ||
					claim.leaseUntil.getTime() <= now.getTime()
				)
					throw new ConflictError('A current work claim is required.');
				if (
					input.action !== 'renew' &&
					!input.body &&
					['comment', 'progress', 'block'].includes(input.action)
				)
					throw new UserError('A description is required for this work action.');
				if (input.action === 'block') work.state = 'blocked';
				if (input.action === 'resume') {
					if (work.state !== 'blocked') throw new ConflictError('Only blocked work can resume.');
					if (
						await this.repository.hasUnresolvedBlockers(
							context.projectId,
							attempt.departmentId,
							work.id,
							ctx,
						)
					)
						throw new ConflictError('Resolve blocking work before resuming this item.');
					work.state = 'running';
				}
				if (input.action === 'submit') {
					if (work.state !== 'running')
						throw new ConflictError('Only running work can submit a result.');
					if (
						await this.repository.hasUnresolvedBlockers(
							context.projectId,
							attempt.departmentId,
							work.id,
							ctx,
						)
					)
						throw new ConflictError('Resolve blocking work before submitting a result.');
					work.state = attempt.reviewPolicy === 'required' ? 'review' : 'done';
					const report = input.report;
					if (!report) throw new UserError('A structured completion report is required.');
					attempt.safeSummary = report.result;
					attempt.resultReference = context.executionId;
					const submittedResult = Object.assign(new SubmittedWorkResult(), {
						id: randomUUID(),
						projectId: work.projectId,
						departmentId: work.departmentId,
						workId: work.id,
						attemptId: attempt.id,
						reference: context.executionId,
						safeSummary: report.result,
						submittedByUserId: attempt.initiatingUserId,
						submittedAt: now,
					});
					await this.repository.saveSubmittedResult(submittedResult, ctx);
					attempt.submittedResultId = submittedResult.id;
					const policyRevision = attempt.reviewPolicyRevisionId
						? await this.repository.findReviewPolicyRevision(
								context.projectId,
								work.id,
								attempt.reviewPolicyRevision,
								ctx,
							)
						: null;
					if (attempt.reviewPolicy === 'required' && policyRevision) {
						const stages = z
							.array(aiDepartmentReviewStageSchema)
							.min(1)
							.parse(JSON.parse(policyRevision.stagesJson));
						const round = Object.assign(new WorkReviewRound(), {
							id: randomUUID(),
							projectId: work.projectId,
							departmentId: work.departmentId,
							workId: work.id,
							attemptId: attempt.id,
							resultId: submittedResult.id,
							requesterKind: 'user' as const,
							requesterId: attempt.initiatingUserId,
							policyRevisionId: policyRevision.id,
							activeStageId: stages[0].id,
							ordinal: attempt.ordinal,
							status: 'open' as const,
							version: 1,
							createdAt: now,
							closedAt: null,
						});
						await this.repository.saveReviewRound(round, ctx);
						attempt.reviewRoundId = round.id;
						attempt.reviewRoundStatus = 'open';
					} else {
						attempt.reviewRoundId = null;
						attempt.reviewRoundStatus = null;
					}
					attempt.reviewRoundClosedAt = null;
					await this.repository.saveAttempt(attempt, ctx);
					claim.releasedAt = now;
				}
				if (input.action === 'release') {
					if (work.state !== 'running' && work.state !== 'blocked')
						throw new ConflictError('This work cannot release its claim.');
					if (!input.body) throw new UserError('A release reason is required.');
					work.state = 'blocked';
					claim.releasedAt = now;
					const release = Object.assign(new WorkReleaseIntent(), {
						id: randomUUID(),
						projectId: work.projectId,
						departmentId: work.departmentId,
						workId: work.id,
						sourceAttemptId: attempt.id,
						requestedByActorId: attempt.initiatingUserId,
						reason: input.body,
						waitingForChildren: input.body === 'waiting_for_children',
						requestId,
						stopCommandId: randomUUID(),
						state: 'awaiting_stop' as const,
						createdAt: now,
						confirmedAt: null,
					});
					await this.repository.saveRelease(release, ctx);
					releaseIntentId = release.id;
				}
				if (!claim.releasedAt) claim.leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
			}
			await this.repository.saveClaim(claim, ctx);
			work.version += 1;
			await this.repository.saveWork(work, ctx);
			if (work.state !== fromState)
				await this.repository.addTransition(
					Object.assign(new WorkTransition(), {
						id: randomUUID(),
						projectId: work.projectId,
						departmentId: work.departmentId,
						workId: work.id,
						attemptId: attempt.id,
						actorId: attempt.memberId,
						actorKind: 'agent',
						fromState,
						toState: work.state,
						reason:
							input.action === 'submit' ? (input.report?.result ?? null) : (input.body ?? null),
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
					kind: input.action,
					body: input.action === 'submit' ? JSON.stringify(input.report) : (input.body ?? null),
					workVersion: work.version,
					createdAt: now,
				}),
				ctx,
			);
			const response = result();
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId: work.projectId,
					actorId: attempt.initiatingUserId,
					requestId,
					payloadHash: hash,
					operation: 'work.agent.action',
					status: 'completed',
					responseJson: JSON.stringify(response),
					createdAt: now,
				}),
				ctx,
			);
			return response;
		});
		if (departmentId)
			await this.operationsBroadcaster.notifyCurrent(context.projectId, departmentId);
		if (releaseIntentId) await this.releases.requestOwnerStop(releaseIntentId);
		return response;
	}

	private async delegate(
		context: DepartmentWorkRunContext,
		requestId: string,
		input: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkToolResult> {
		const payload = aiDepartmentWorkDelegateSchema.parse({
			expectedVersion: input.expectedVersion,
			recipientMemberId: input.recipientMemberId,
			title: input.title,
			instruction: input.instruction,
			requestId,
		});
		const payloadHash = createHash('sha256')
			.update(JSON.stringify({ context, payload: { ...payload, expectedVersion: undefined } }))
			.digest('hex');
		let releaseIntentId: string | undefined;
		let departmentId: string | undefined;
		const result = await this.txRunner.run({}, async (ctx) => {
			let attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt || attempt.executorId !== context.executorId)
				throw new NotFoundError('Assigned work not found.');
			departmentId = attempt.departmentId;
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
				if (receipt.operation !== 'work.agent.delegate' || receipt.payloadHash !== payloadHash)
					throw new ConflictError('This request ID was used for a different work command.');
				return aiDepartmentWorkDelegateActionResultSchema.parse(
					JSON.parse(receipt.responseJson ?? '{}'),
				);
			}
			const department = await this.repository.findDepartment(
				context.projectId,
				attempt.departmentId,
				ctx,
			);
			const source = await this.repository.findWork(
				context.projectId,
				attempt.departmentId,
				attempt.workId,
				ctx,
			);
			const member = await this.repository.findMember(
				context.projectId,
				attempt.departmentId,
				payload.recipientMemberId,
				ctx,
			);
			const binding = await this.directory.findBinding(
				context.projectId,
				payload.recipientMemberId,
				ctx,
			);
			if (!department || department.archived || !source || !member || member.archived || !binding)
				throw new NotFoundError('Delegate recipient or parent work not found.');
			if (member.managerMemberId !== attempt.memberId)
				throw new ForbiddenError('Work can only be delegated to a direct report.');
			const recipientAccess = await this.executor.resolve({
				actorId: attempt.initiatingUserId,
				projectId: context.projectId,
				memberId: member.id,
				executorId: binding.executorId,
				bindingVersion: binding.version,
			});
			if (
				binding.provider !== 'n8n-agent' ||
				recipientAccess.status !== 'available' ||
				!recipientAccess.canStart ||
				!recipientAccess.authorized ||
				recipientAccess.executorId !== binding.executorId ||
				recipientAccess.bindingVersion !== binding.version
			)
				throw new ForbiddenError('Delegate recipient is not available.');
			if (
				source.currentAttemptId !== attempt.id ||
				source.assigneeMemberId !== attempt.memberId ||
				source.version !== payload.expectedVersion
			)
				throw new ConflictError('Parent work assignment has changed.');
			if (attempt.phase !== 'active' || attempt.cancelRequestedAt)
				throw new ConflictError('Only an active work turn can delegate.');
			if (
				!(await this.executor.verifyRun({
					...context,
					actorId: attempt.initiatingUserId,
					dispatchKey: attempt.dispatchKey,
				}))
			)
				throw new ForbiddenError('This execution cannot delegate department work.');
			const claim = await this.repository.findClaim(context.projectId, attempt.id, ctx);
			if (
				!claim ||
				claim.releasedAt ||
				claim.executionId !== context.executionId ||
				claim.leaseUntil.getTime() <= Date.now()
			)
				throw new ConflictError('A current work claim is required.');
			const relationships = await this.repository.listRelationships(
				context.projectId,
				attempt.departmentId,
				source.id,
				ctx,
			);
			for (const relationship of relationships) {
				if (relationship.kind !== 'parent' || relationship.relatedWorkId !== source.id) continue;
				const existingChild = await this.repository.findWork(
					context.projectId,
					attempt.departmentId,
					relationship.workId,
					ctx,
				);
				if (
					existingChild &&
					existingChild.state !== 'cancelled' &&
					existingChild.assigneeMemberId === member.id &&
					existingChild.instruction === `${payload.title.trim()}\n\n${payload.instruction}`
				)
					throw new ConflictError(
						'A matching child work item already exists. Inspect childReports. A child with state done is accepted; use its report instead of delegating again.',
					);
			}
			if (
				await this.repository.hasUnresolvedBlockers(
					context.projectId,
					attempt.departmentId,
					source.id,
					ctx,
				)
			)
				throw new ConflictError('Resolve blocking work before delegating.');
			const now = new Date();
			const child = Object.assign(new WorkItem(), {
				id: randomUUID(),
				projectId: source.projectId,
				departmentId: source.departmentId,
				goalId: source.goalId,
				assigneeMemberId: member.id,
				instruction: `${payload.title.trim()}\n\n${payload.instruction}`,
				priority: 'normal',
				dueAt: null,
				reviewPolicy: 'required' as const,
				reviewStagesJson: JSON.stringify([
					{
						id: 'human-review',
						reviewers: { kind: 'authorized_writers' },
						actorFilter: 'human_only',
					},
				]),
				currentReviewStageIndex: 0,
				reviewPolicyRevision: 1,
				reviewPolicyRevisionId: randomUUID(),
				assignedByUserId: attempt.initiatingUserId,
				state: 'ready' as const,
				currentAttemptId: null,
				version: 1,
				createdAt: now,
				updatedAt: now,
			});
			await this.repository.saveWork(child, ctx);
			await this.repository.saveReviewPolicyRevision(
				Object.assign(new WorkReviewPolicyRevision(), {
					id: child.reviewPolicyRevisionId,
					projectId: child.projectId,
					departmentId: child.departmentId,
					workId: child.id,
					revision: 1,
					mode: child.reviewPolicy,
					stagesJson: child.reviewStagesJson,
					createdByUserId: attempt.initiatingUserId,
					createdAt: now,
				}),
				ctx,
			);
			const parentLink = Object.assign(new WorkRelationship(), {
				id: randomUUID(),
				projectId: child.projectId,
				departmentId: child.departmentId,
				workId: child.id,
				relatedWorkId: source.id,
				kind: 'parent' as const,
				createdAt: now,
			});
			const blockerLink = Object.assign(new WorkRelationship(), {
				id: randomUUID(),
				projectId: child.projectId,
				departmentId: child.departmentId,
				workId: child.id,
				relatedWorkId: source.id,
				kind: 'blocks' as const,
				createdAt: now,
			});
			await this.repository.saveRelationship(parentLink, ctx);
			await this.repository.saveRelationship(blockerLink, ctx);
			await this.createDelegatedWorkEligibility(child, attempt.initiatingUserId, requestId, ctx);
			source.version += 1;
			await this.repository.saveWork(source, ctx);
			claim.releasedAt = now;
			await this.repository.saveClaim(claim, ctx);
			source.state = 'blocked';
			source.version += 1;
			await this.repository.saveWork(source, ctx);
			const release = Object.assign(new WorkReleaseIntent(), {
				id: randomUUID(),
				projectId: source.projectId,
				departmentId: source.departmentId,
				workId: source.id,
				sourceAttemptId: attempt.id,
				requestedByActorId: attempt.initiatingUserId,
				reason: 'waiting_for_children',
				waitingForChildren: true,
				requestId,
				stopCommandId: randomUUID(),
				state: 'awaiting_stop' as const,
				createdAt: now,
				confirmedAt: null,
			});
			await this.repository.saveRelease(release, ctx);
			releaseIntentId = release.id;
			await this.repository.addActivity(
				Object.assign(new WorkActivity(), {
					id: randomUUID(),
					projectId: source.projectId,
					departmentId: source.departmentId,
					workId: source.id,
					attemptId: attempt.id,
					actorId: attempt.memberId,
					actorKind: 'agent',
					kind: 'work.delegate',
					body: `${payload.title}: ${child.id}`,
					workVersion: source.version,
					createdAt: now,
				}),
				ctx,
			);
			const result = aiDepartmentWorkDelegateActionResultSchema.parse({
				child: toWorkDto(child),
				relationships: [parentLink, blockerLink].map((link) => ({
					id: link.id,
					projectId: link.projectId,
					departmentId: link.departmentId,
					workId: link.workId,
					relatedWorkId: link.relatedWorkId,
					kind: link.kind,
					createdAt: now.toISOString(),
				})),
			});
			await this.directory.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId: context.projectId,
					actorId: attempt.initiatingUserId,
					requestId,
					payloadHash,
					operation: 'work.agent.delegate',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: now,
				}),
				ctx,
			);
			return result;
		});
		if (departmentId)
			await this.operationsBroadcaster.notifyCurrent(context.projectId, departmentId);
		if (releaseIntentId) await this.releases.requestOwnerStop(releaseIntentId);
		return result;
	}

	private async createDelegatedWorkEligibility(
		work: WorkItem,
		actorId: string,
		requestId: string,
		ctx: OperationContext,
	) {
		const member = work.assigneeMemberId
			? await this.repository.findMember(
					work.projectId,
					work.departmentId,
					work.assigneeMemberId,
					ctx,
				)
			: null;
		const binding =
			member && !member.archived
				? await this.directory.findBinding(work.projectId, member.id, ctx)
				: null;
		if (!member || member.archived || !binding)
			throw new ConflictError('Delegate recipient is no longer eligible.');
		const eligibleAt = new Date();
		const laneGeneration = await this.repository.advanceWakeLane(
			{
				projectId: work.projectId,
				memberId: member.id,
				actorId,
				bindingVersion: binding.version,
			},
			eligibleAt,
			ctx,
		);
		await this.repository.saveEligibility(
			Object.assign(new WorkEligibility(), {
				workId: work.id,
				generation: await this.repository.nextEligibilityGeneration(work.id, ctx),
				projectId: work.projectId,
				departmentId: work.departmentId,
				memberId: member.id,
				actorId,
				bindingVersion: binding.version,
				laneGeneration,
				requestId,
				state: 'pending',
				eligibleAt,
				consumedAt: null,
				createdAt: eligibleAt,
			}),
			ctx,
		);
		await this.repository.saveWakeIntent(
			Object.assign(new WorkWakeIntent(), {
				workId: work.id,
				projectId: work.projectId,
				departmentId: work.departmentId,
				actorId,
				requestId: randomUUID(),
				createdAt: eligibleAt,
				deliveredAt: null,
			}),
			ctx,
		);
	}

	private async listInbox(
		context: DepartmentWorkRunContext,
		query: AiDepartmentAssignedWorkInboxQueryDto,
	) {
		const attempt = await this.repository.findAttempt(context.projectId, context.attemptId);
		if (!attempt || attempt.executorId !== context.executorId)
			throw new NotFoundError('Assigned work not found.');
		const department = await this.repository.findDepartment(
			context.projectId,
			attempt.departmentId,
		);
		const work = await this.repository.findWork(
			context.projectId,
			attempt.departmentId,
			attempt.workId,
		);
		if (
			!department ||
			department.archived ||
			!work ||
			work.currentAttemptId !== attempt.id ||
			work.assigneeMemberId !== attempt.memberId ||
			attempt.phase === 'terminal' ||
			attempt.cancelRequestedAt
		)
			throw new ConflictError('This department run cannot read the assigned work inbox.');
		if (
			!(await this.executor.verifyRun({
				projectId: context.projectId,
				actorId: attempt.initiatingUserId,
				executorId: attempt.executorId,
				attemptId: attempt.id,
				dispatchKey: attempt.dispatchKey,
				executionId: context.executionId,
			}))
		)
			throw new ForbiddenError('This execution cannot read department work.');
		return await this.inbox.listAssigned(
			{
				projectId: context.projectId,
				actorId: attempt.initiatingUserId,
				memberId: attempt.memberId,
				executorId: attempt.executorId,
				bindingVersion: attempt.bindingVersion,
			},
			query,
		);
	}
}
