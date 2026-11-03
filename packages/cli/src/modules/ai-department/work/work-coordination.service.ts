import {
	aiDepartmentAgentWorkActionSchema,
	aiDepartmentAgentWorkResultSchema,
	type AiDepartmentAgentWorkAction,
	type AiDepartmentAgentWorkResult,
} from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, ForbiddenError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import {
	DepartmentExecutorProxy,
	DepartmentWorkActions,
	type DepartmentWorkRunContext,
} from '@/modules/agents/agent-department-execution.contracts';
import { WorkClaim } from '../database/entities/work-claim.entity';
import { WorkActivity } from '../database/entities/work-activity.entity';
import { WorkTransition } from '../database/entities/work-transition.entity';
import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { WorkRepository } from '../database/repositories/work.repository';
import { DirectoryRepository } from '../database/repositories/directory.repository';
import { toWorkDto } from './work-mappers';

const CLAIM_LEASE_MS = 5 * 60 * 1000;

@Service()
export class WorkCoordinationService extends DepartmentWorkActions {
	constructor(
		private readonly repository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly executor: DepartmentExecutorProxy,
	) {
		super();
	}

	async executeAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		rawInput: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkResult> {
		const input = aiDepartmentAgentWorkActionSchema.parse(rawInput);
		const hash = createHash('sha256').update(JSON.stringify({ context, input })).digest('hex');
		return await this.txRunner.run({}, async (ctx) => {
			let attempt = await this.repository.findAttempt(context.projectId, context.attemptId, ctx);
			if (!attempt || attempt.executorId !== context.executorId)
				throw new NotFoundError('Assigned work not found.');
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
			let claim = await this.repository.findClaim(context.projectId, attempt.id, ctx);
			const result = (): AiDepartmentAgentWorkResult => ({
				work: toWorkDto(work),
				claim: claim
					? {
							id: claim.id,
							attemptId: claim.attemptId,
							memberId: claim.memberId,
							executionId: claim.executionId,
							leaseUntil: claim.leaseUntil.toISOString(),
							releasedAt: claim.releasedAt?.toISOString() ?? null,
						}
					: null,
			});
			if (input.action === 'inspect') return result();
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
			if (attempt.phase === 'terminal' || attempt.cancelRequestedAt)
				throw new ConflictError('This work attempt no longer accepts updates.');
			if (input.expectedVersion !== work.version)
				throw new ConflictError('Work item has changed. Inspect it and try again.');
			const fromState = work.state;
			const now = new Date();
			if (input.action === 'claim') {
				if (
					claim &&
					!claim.releasedAt &&
					claim.executionId !== context.executionId &&
					!(await this.executor.isRunStopped(claim.executionId))
				)
					throw new ConflictError('Another execution holds this work claim.');
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
					['comment', 'progress', 'block', 'submit'].includes(input.action)
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
					attempt.safeSummary = input.body ?? null;
					attempt.resultReference = context.executionId;
					await this.repository.saveAttempt(attempt, ctx);
					claim.releasedAt = now;
				}
				if (input.action === 'release') {
					if (work.state !== 'running' && work.state !== 'blocked')
						throw new ConflictError('This work cannot release its claim.');
					work.state = 'blocked';
					claim.releasedAt = now;
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
						reason: input.body ?? null,
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
					body: input.body ?? null,
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
	}
}
