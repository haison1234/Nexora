import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, UnexpectedError } from '@n8n/errors';
import { DataSource, In, IsNull, LessThanOrEqual, type EntityManager } from '@n8n/typeorm';
import { randomUUID } from 'node:crypto';
import type { AiDepartmentWorkState } from '@n8n/api-types';

import { Department } from '../entities/department.entity';
import { DepartmentGoal } from '../entities/department-goal.entity';
import { Member } from '../entities/member.entity';
import { WorkAttempt } from '../entities/work-attempt.entity';
import { WorkDispatchIntent } from '../entities/work-dispatch-intent.entity';
import { WorkItem } from '../entities/work-item.entity';
import { WorkClaim } from '../entities/work-claim.entity';
import { WorkActivity } from '../entities/work-activity.entity';
import { WorkWakeIntent } from '../entities/work-wake-intent.entity';
import { WorkWakeLane } from '../entities/work-wake-lane.entity';
import { WorkEligibility } from '../entities/work-eligibility.entity';
import { WorkRelationship } from '../entities/work-relationship.entity';
import { WorkOwnerEventReceipt } from '../entities/work-owner-event-receipt.entity';
import { WorkReviewDecision } from '../entities/work-review-decision.entity';
import { WorkTransition } from '../entities/work-transition.entity';
import { DepartmentAdmissionFence } from '../entities/department-admission-fence.entity';

class WorkTable extends BaseRepository<WorkItem> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(WorkItem, dataSource.manager, runner);
	}
}

export type WorkListFilter = {
	state?: AiDepartmentWorkState;
	goalId?: string;
	assigneeMemberId?: string;
	search?: string;
	take: number;
	skip: number;
};

@Service()
export class WorkRepository {
	private readonly workTable: WorkTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.workTable = new WorkTable(dataSource, runner);
	}

	private manager(ctx: OperationContext): EntityManager {
		return this.workTable.managerFor(ctx);
	}

	async acquireAdmissionFence(projectId: string, departmentId: string, ctx: OperationContext) {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(DepartmentAdmissionFence)
			.values({ projectId, departmentId, sequence: 0 })
			.orIgnore()
			.execute();
		await manager.increment(DepartmentAdmissionFence, { projectId, departmentId }, 'sequence', 1);
	}

	async findDepartment(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(Department, { id: departmentId, projectId });
	}

	async findMember(
		projectId: string,
		departmentId: string,
		memberId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(Member, { id: memberId, projectId, departmentId });
	}

	async findMemberById(projectId: string, memberId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(Member, { id: memberId, projectId });
	}

	async listGoals(projectId: string, departmentId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(DepartmentGoal, {
			where: { projectId, departmentId },
			order: { title: 'ASC', id: 'ASC' },
		});
	}

	async findGoal(
		projectId: string,
		departmentId: string,
		goalId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(DepartmentGoal, {
			id: goalId,
			projectId,
			departmentId,
		});
	}

	async saveGoal(goal: DepartmentGoal, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(DepartmentGoal, goal);
		await manager.increment(
			Department,
			{ id: goal.departmentId, projectId: goal.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	async findWork(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkItem, { id: workId, projectId, departmentId });
	}

	async listWork(
		projectId: string,
		departmentId: string,
		filter: WorkListFilter,
		ctx: OperationContext = {},
	) {
		const query = this.manager(ctx)
			.createQueryBuilder(WorkItem, 'work')
			.where('work.projectId = :projectId', { projectId })
			.andWhere('work.departmentId = :departmentId', { departmentId });
		if (filter.state) query.andWhere('work.state = :state', { state: filter.state });
		if (filter.goalId) query.andWhere('work.goalId = :goalId', { goalId: filter.goalId });
		if (filter.assigneeMemberId) {
			query.andWhere('work.assigneeMemberId = :assigneeMemberId', {
				assigneeMemberId: filter.assigneeMemberId,
			});
		}
		if (filter.search)
			query.andWhere('LOWER(work.instruction) LIKE :search', {
				search: `%${filter.search.toLowerCase()}%`,
			});
		const [data, count] = await query
			.orderBy('work.createdAt', 'ASC')
			.addOrderBy('work.id', 'ASC')
			.skip(filter.skip)
			.take(filter.take)
			.getManyAndCount();
		return { data, count };
	}

	async saveWork(work: WorkItem, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(WorkItem, work);
		await manager.increment(
			Department,
			{ id: work.departmentId, projectId: work.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	async listRelationships(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).find(WorkRelationship, {
			where: [
				{ projectId, departmentId, workId },
				{ projectId, departmentId, relatedWorkId: workId },
			],
			order: { kind: 'ASC', workId: 'ASC', relatedWorkId: 'ASC' },
		});
	}

	async listRelationshipEdges(
		projectId: string,
		departmentId: string,
		kind: WorkRelationship['kind'],
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(WorkRelationship, {
			select: ['workId', 'relatedWorkId'],
			where: { projectId, departmentId, kind },
		});
	}

	async findParentRelationship(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkRelationship, {
			projectId,
			departmentId,
			workId,
			kind: 'parent',
		});
	}

	async listBlockerIds(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		const rows = await this.manager(ctx).find(WorkRelationship, {
			select: ['workId'],
			where: { projectId, departmentId, relatedWorkId: workId, kind: 'blocks' },
		});
		return rows.map(({ workId: blockerId }) => blockerId);
	}

	async hasUnresolvedBlockers(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx)
			.createQueryBuilder(WorkRelationship, 'relationship')
			.innerJoin(
				WorkItem,
				'blocker',
				'blocker.id = relationship.workId AND blocker.projectId = relationship.projectId AND blocker.departmentId = relationship.departmentId',
			)
			.where('relationship.projectId = :projectId', { projectId })
			.andWhere('relationship.departmentId = :departmentId', { departmentId })
			.andWhere('relationship.relatedWorkId = :workId', { workId })
			.andWhere('relationship.kind = :kind', { kind: 'blocks' })
			.andWhere('blocker.state NOT IN (:...terminalStates)', {
				terminalStates: ['done', 'cancelled'],
			})
			.getExists();
	}

	async saveRelationship(relationship: WorkRelationship, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(WorkRelationship, relationship);
		await manager.increment(
			Department,
			{ id: relationship.departmentId, projectId: relationship.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	async findRelationship(
		projectId: string,
		departmentId: string,
		workId: string,
		relationshipId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(WorkRelationship, {
			id: relationshipId,
			projectId,
			departmentId,
			workId,
		});
	}

	async removeRelationship(relationship: WorkRelationship, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		await manager.remove(WorkRelationship, relationship);
		await manager.increment(
			Department,
			{ id: relationship.departmentId, projectId: relationship.projectId },
			'projectionSequence',
			1,
		);
	}

	async findClaim(projectId: string, attemptId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkClaim, { projectId, attemptId });
	}
	async saveClaim(claim: WorkClaim, ctx: OperationContext) {
		return await this.manager(ctx).save(WorkClaim, claim);
	}
	async releaseAttemptClaim(projectId: string, attemptId: string, ctx: OperationContext) {
		await this.manager(ctx).update(
			WorkClaim,
			{ projectId, attemptId, releasedAt: IsNull() },
			{ releasedAt: new Date() },
		);
	}
	async addActivity(activity: WorkActivity, ctx: OperationContext) {
		return await this.manager(ctx).save(WorkActivity, activity);
	}
	async listActivity(
		projectId: string,
		departmentId: string,
		workId: string,
		take: number,
		skip: number,
	) {
		return await this.manager({}).findAndCount(WorkActivity, {
			where: { projectId, departmentId, workId },
			order: { workVersion: 'ASC', id: 'ASC' },
			take,
			skip,
		});
	}
	async saveWakeIntent(intent: WorkWakeIntent, ctx: OperationContext) {
		return await this.manager(ctx).save(WorkWakeIntent, intent);
	}
	async findWakeLane(
		projectId: string,
		memberId: string,
		actorId: string,
		bindingVersion: number,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(WorkWakeLane, {
			projectId,
			memberId,
			actorId,
			bindingVersion,
		});
	}
	async saveWakeLane(lane: WorkWakeLane, ctx: OperationContext) {
		return await this.manager(ctx).save(WorkWakeLane, lane);
	}
	async nextEligibilityGeneration(workId: string, ctx: OperationContext) {
		const row = await this.manager(ctx)
			.createQueryBuilder(WorkEligibility, 'eligibility')
			.select('MAX(eligibility.generation)', 'generation')
			.where('eligibility.workId = :workId', { workId })
			.getRawOne<{ generation: number | string | null }>();
		return Number(row?.generation ?? 0) + 1;
	}
	async findPendingEligibilityForWork(projectId: string, workId: string, ctx: OperationContext) {
		return await this.manager(ctx).findOneBy(WorkEligibility, {
			projectId,
			workId,
			state: 'pending',
		});
	}
	async cancelPendingEligibility(projectId: string, workId: string, ctx: OperationContext) {
		await this.manager(ctx).update(
			WorkEligibility,
			{ projectId, workId, state: 'pending' },
			{ state: 'cancelled', consumedAt: new Date() },
		);
	}
	async saveEligibility(eligibility: WorkEligibility, ctx: OperationContext) {
		return await this.manager(ctx).save(WorkEligibility, eligibility);
	}
	async advanceWakeLane(
		lane: Pick<WorkWakeLane, 'projectId' | 'memberId' | 'actorId' | 'bindingVersion'>,
		now: Date,
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(WorkWakeLane)
			.values({
				...lane,
				generation: 0,
				acknowledgedGeneration: 0,
				state: 'pending',
				createdAt: now,
				updatedAt: now,
			})
			.orIgnore()
			.execute();
		await manager.increment(WorkWakeLane, lane, 'generation', 1);
		await manager.update(WorkWakeLane, lane, { state: 'pending', updatedAt: now });
		const saved = await manager.findOneBy(WorkWakeLane, lane);
		if (!saved) throw new UnexpectedError('Failed to advance the department wake lane.');
		return saved.generation;
	}
	async listPendingEligibility(
		projectId: string,
		memberId: string,
		actorId: string,
		bindingVersion: number,
		take: number,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(WorkEligibility, {
			where: { projectId, memberId, actorId, bindingVersion, state: 'pending' },
			order: { eligibleAt: 'ASC', workId: 'ASC', generation: 'ASC' },
			take,
		});
	}
	async listPendingAssignedEligibility(
		projectId: string,
		departmentId: string,
		memberId: string,
		actorId: string,
		bindingVersion: number,
		take: number,
		after: { eligibleAt: Date; workId: string } | undefined,
		ctx: OperationContext,
	) {
		const query = this.manager(ctx)
			.createQueryBuilder(WorkEligibility, 'eligibility')
			.innerJoin(
				WorkItem,
				'work',
				'work.id = eligibility.workId AND work.projectId = eligibility.projectId AND work.departmentId = eligibility.departmentId',
			)
			.where('eligibility.projectId = :projectId', { projectId })
			.andWhere('eligibility.departmentId = :departmentId', { departmentId })
			.andWhere('eligibility.memberId = :memberId', { memberId })
			.andWhere('eligibility.actorId = :actorId', { actorId })
			.andWhere('eligibility.bindingVersion = :bindingVersion', { bindingVersion })
			.andWhere('eligibility.state = :eligibilityState', { eligibilityState: 'pending' })
			.andWhere('work.assigneeMemberId = :memberId', { memberId })
			.andWhere('work.state = :workState', { workState: 'ready' });
		if (after) {
			query.andWhere(
				'(eligibility.eligibleAt > :eligibleAt OR (eligibility.eligibleAt = :eligibleAt AND eligibility.workId > :workId))',
				{ eligibleAt: after.eligibleAt, workId: after.workId },
			);
		}
		return await query
			.orderBy('eligibility.eligibleAt', 'ASC')
			.addOrderBy('eligibility.workId', 'ASC')
			.take(take)
			.getMany();
	}
	async findWorkItemsByIds(
		projectId: string,
		departmentId: string,
		workIds: string[],
		ctx: OperationContext,
	) {
		if (workIds.length === 0) return [];
		return await this.manager(ctx).find(WorkItem, {
			where: { projectId, departmentId, id: In(workIds) },
		});
	}
	async listPendingWakes(take: number) {
		return await this.manager({}).find(WorkWakeIntent, {
			where: { deliveredAt: IsNull(), retryAt: LessThanOrEqual(new Date()) },
			order: { createdAt: 'ASC', workId: 'ASC' },
			take,
		});
	}
	async deferWake(workId: string, requestId: string) {
		await this.manager({}).update(
			WorkWakeIntent,
			{ workId, requestId },
			{ retryAt: new Date(Date.now() + 5 * 60 * 1000) },
		);
	}
	async markWakeDelivered(workId: string, requestId: string, ctx: OperationContext = {}) {
		await this.manager(ctx).update(
			WorkWakeIntent,
			{ workId, requestId },
			{ deliveredAt: new Date() },
		);
	}
	async markPendingWakesDelivered(workId: string, ctx: OperationContext) {
		await this.manager(ctx).update(
			WorkWakeIntent,
			{ workId, deliveredAt: IsNull() },
			{ deliveredAt: new Date() },
		);
	}

	async hasSubmittedResult(
		projectId: string,
		workId: string,
		attemptId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).existsBy(WorkActivity, {
			projectId,
			workId,
			attemptId,
			kind: 'submit',
		});
	}

	async nextAttemptOrdinal(workId: string, ctx: OperationContext = {}) {
		const result = await this.manager(ctx)
			.createQueryBuilder(WorkAttempt, 'attempt')
			.select('MAX(attempt.ordinal)', 'maxOrdinal')
			.where('attempt.workId = :workId', { workId })
			.getRawOne<{ maxOrdinal: number | string | null }>();
		return Number(result?.maxOrdinal ?? 0) + 1;
	}

	async findAttempt(projectId: string, attemptId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkAttempt, { id: attemptId, projectId });
	}

	async listAttempts(projectId: string, workId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(WorkAttempt, {
			where: { projectId, workId },
			order: { ordinal: 'ASC' },
		});
	}

	async listReconciliationCandidates(take: number, ctx: OperationContext = {}) {
		return await this.manager(ctx).find(WorkAttempt, {
			where: { phase: In(['dispatching', 'active', 'suspended']) },
			order: { updatedAt: 'ASC', id: 'ASC' },
			take,
		});
	}

	async findOwnerSnapshotReceipt(provider: string, eventId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkOwnerEventReceipt, {
			provider,
			ownerEventId: eventId,
		});
	}

	async applyOwnerSnapshot(
		input: {
			projectId: string;
			departmentId: string;
			workId: string;
			attemptId: string;
			expectedWorkVersion: number;
			sequence: string;
			phase: 'active' | 'suspended' | 'terminal';
			outcome?: 'succeeded' | 'failed' | 'cancelled';
			resultReference?: string;
			safeSummary?: string;
			toState: AiDepartmentWorkState;
			actorId: string;
		},
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		const work = await manager.findOneBy(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
		const attempt = await manager.findOneBy(WorkAttempt, {
			id: input.attemptId,
			projectId: input.projectId,
			workId: input.workId,
		});
		if (
			!work ||
			!attempt ||
			work.currentAttemptId !== attempt.id ||
			work.version !== input.expectedWorkVersion ||
			attempt.phase === 'terminal'
		) {
			throw new ConflictError('Owner snapshot does not match the current work attempt.');
		}
		if (BigInt(input.sequence) <= BigInt(attempt.lastOwnerSequence)) return work;
		const eventId = `snapshot:${attempt.id}:${input.sequence}`;
		if (await this.findOwnerSnapshotReceipt(attempt.provider, eventId, ctx)) return work;

		const fromState = work.state;
		attempt.lastOwnerSequence = input.sequence;
		if (input.phase === 'terminal') {
			if (!input.outcome) throw new ConflictError('Terminal snapshot has no outcome.');
			attempt.phase = 'terminal';
			attempt.outcome = input.outcome;
			const reportedResult = await manager.findOneBy(WorkActivity, {
				projectId: input.projectId,
				workId: input.workId,
				attemptId: input.attemptId,
				kind: 'submit',
			});
			if (!reportedResult) {
				attempt.resultReference = null;
				attempt.safeSummary = input.safeSummary?.slice(0, 2000) ?? null;
			}
			await this.releaseAttemptClaim(input.projectId, input.attemptId, ctx);
			attempt.finishedAt = new Date();
		} else {
			attempt.phase = input.phase;
		}
		if (input.toState !== work.state) {
			work.state = input.toState;
			work.version += 1;
			work.updatedAt = new Date();
			const update = await manager
				.createQueryBuilder()
				.update(WorkItem)
				.set({ state: work.state, version: work.version, updatedAt: work.updatedAt })
				.where('id = :workId', { workId: work.id })
				.andWhere('projectId = :projectId', { projectId: work.projectId })
				.andWhere('departmentId = :departmentId', { departmentId: work.departmentId })
				.andWhere('version = :version', { version: input.expectedWorkVersion })
				.execute();
			if (update.affected !== 1)
				throw new ConflictError('Work item changed while applying the owner snapshot.');
			await manager.save(
				WorkTransition,
				Object.assign(new WorkTransition(), {
					id: randomUUID(),
					projectId: work.projectId,
					departmentId: work.departmentId,
					workId: work.id,
					attemptId: attempt.id,
					actorId: input.actorId,
					actorKind: 'agent',
					fromState,
					toState: work.state,
					reason: input.safeSummary?.slice(0, 2000) ?? null,
					workVersion: work.version,
					createdAt: new Date(),
				}),
			);
		}
		await manager.save(attempt);
		await manager.save(
			WorkOwnerEventReceipt,
			Object.assign(new WorkOwnerEventReceipt(), {
				id: randomUUID(),
				provider: attempt.provider,
				ownerEventId: eventId,
				projectId: input.projectId,
				workId: input.workId,
				attemptId: input.attemptId,
				sequence: Number(input.sequence),
				schemaVersion: 1,
				kind: input.phase === 'terminal' ? `terminal_${input.outcome}` : input.phase,
				safeSummary: input.safeSummary?.slice(0, 2000) ?? null,
				occurredAt: new Date(),
				receivedAt: new Date(),
			}),
		);
		await manager.increment(
			Department,
			{ id: work.departmentId, projectId: work.projectId },
			'projectionSequence',
			1,
		);
		return work;
	}

	async recordStopRequest(
		input: {
			projectId: string;
			departmentId: string;
			workId: string;
			attemptId: string;
			expectedWorkVersion: number;
			nextState: AiDepartmentWorkState;
			requestId: string;
			actorId: string;
		},
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		const work = await manager.findOneBy(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
		const attempt = await manager.findOneBy(WorkAttempt, {
			id: input.attemptId,
			projectId: input.projectId,
			workId: input.workId,
		});
		if (
			!work ||
			!attempt ||
			work.currentAttemptId !== attempt.id ||
			work.version !== input.expectedWorkVersion ||
			work.state !== input.nextState ||
			!['dispatching', 'active', 'suspended'].includes(attempt.phase) ||
			!['ready', 'running', 'blocked'].includes(work.state)
		) {
			throw new ConflictError('Work item has no stoppable active attempt.');
		}
		if (attempt.cancelRequestedAt) return { work, attempt };

		const fromState = work.state;
		work.version += 1;
		work.updatedAt = new Date();
		attempt.cancelRequestedAt = new Date();
		attempt.cancelRequestId = input.requestId;
		const update = await manager
			.createQueryBuilder()
			.update(WorkItem)
			.set({ state: work.state, version: work.version, updatedAt: work.updatedAt })
			.where('id = :workId', { workId: work.id })
			.andWhere('projectId = :projectId', { projectId: work.projectId })
			.andWhere('departmentId = :departmentId', { departmentId: work.departmentId })
			.andWhere('version = :version', { version: input.expectedWorkVersion })
			.execute();
		if (update.affected !== 1)
			throw new ConflictError('Work item changed while cancellation was requested.');
		await manager.save(attempt);
		await manager.save(
			WorkTransition,
			Object.assign(new WorkTransition(), {
				id: randomUUID(),
				projectId: work.projectId,
				departmentId: work.departmentId,
				workId: work.id,
				attemptId: attempt.id,
				actorId: input.actorId,
				actorKind: 'user',
				fromState,
				toState: work.state,
				reason: 'Stop requested by coordinator.',
				workVersion: work.version,
				createdAt: new Date(),
			}),
		);
		await manager.increment(
			Department,
			{ id: work.departmentId, projectId: work.projectId },
			'projectionSequence',
			1,
		);
		return { work, attempt };
	}

	async saveAttempt(attempt: WorkAttempt, ctx: OperationContext = {}) {
		const manager = this.manager(ctx);
		const saved = await manager.save(WorkAttempt, attempt);
		await manager.increment(
			Department,
			{ id: attempt.departmentId, projectId: attempt.projectId },
			'projectionSequence',
			1,
		);
		return saved;
	}

	/** Reserve one attempt and its dispatch intent in the caller's transaction. */
	async reserveAttempt(
		input: {
			projectId: string;
			departmentId: string;
			workId: string;
			expectedVersion: number;
			nextState: AiDepartmentWorkState;
			attempt: WorkAttempt;
			intent: WorkDispatchIntent;
			actorId: string;
		},
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		const work = await manager.findOneBy(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
		if (!work) throw new ConflictError('Work item is no longer available.');
		if (
			work.version !== input.expectedVersion ||
			work.state !== 'ready' ||
			input.nextState !== 'ready'
		) {
			throw new ConflictError('Work item has changed or is not ready. Reload and try again.');
		}
		if (
			input.attempt.workId !== work.id ||
			input.attempt.projectId !== work.projectId ||
			input.attempt.departmentId !== work.departmentId ||
			input.intent.attemptId !== input.attempt.id ||
			input.intent.projectId !== work.projectId ||
			input.attempt.initiatingUserId !== input.actorId ||
			input.attempt.phase !== 'dispatching' ||
			input.attempt.outcome !== null ||
			input.intent.requestId.length === 0 ||
			input.intent.state !== 'pending' ||
			input.intent.inputHash.length !== 64
		) {
			throw new ConflictError('Attempt reservation does not match the work item.');
		}
		const activeAttempt = await manager.findOneBy(WorkAttempt, {
			workId: work.id,
			phase: In(['dispatching', 'active', 'suspended']),
		});
		if (activeAttempt) throw new ConflictError('Work item already has an active attempt.');

		const savedAttempt = await manager.save(WorkAttempt, input.attempt);
		const update = await manager
			.createQueryBuilder()
			.update(WorkItem)
			.set({
				state: input.nextState,
				currentAttemptId: input.attempt.id,
				version: () => '"version" + 1',
				updatedAt: new Date(),
			})
			.where('id = :workId', { workId: input.workId })
			.andWhere('projectId = :projectId', { projectId: input.projectId })
			.andWhere('departmentId = :departmentId', { departmentId: input.departmentId })
			.andWhere('version = :expectedVersion', { expectedVersion: input.expectedVersion })
			.andWhere('state = :ready', { ready: 'ready' })
			.execute();
		if (update.affected !== 1) {
			throw new ConflictError('Work item has changed or is not ready. Reload and try again.');
		}

		const savedWork = await manager.findOneByOrFail(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
		await manager.save(WorkDispatchIntent, input.intent);
		await manager.save(
			WorkTransition,
			Object.assign(new WorkTransition(), {
				id: randomUUID(),
				projectId: input.projectId,
				departmentId: input.departmentId,
				workId: input.workId,
				attemptId: input.attempt.id,
				actorId: input.actorId,
				actorKind: 'user',
				fromState: 'ready',
				toState: input.nextState,
				reason: null,
				workVersion: savedWork.version,
				createdAt: new Date(),
			}),
		);
		await manager.increment(
			Department,
			{ id: input.departmentId, projectId: input.projectId },
			'projectionSequence',
			1,
		);
		return { work: savedWork, attempt: savedAttempt, intent: input.intent };
	}

	async saveDispatchIntent(intent: WorkDispatchIntent, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkDispatchIntent, intent);
	}

	async findDispatchIntent(attemptId: string, ctx: OperationContext = {}) {
		return await this.manager(ctx).findOneBy(WorkDispatchIntent, { attemptId });
	}

	async recordDispatchResult(
		input: {
			projectId: string;
			departmentId: string;
			workId: string;
			attemptId: string;
			expectedWorkVersion: number;
			result:
				| { kind: 'accepted'; ownerExecutionRef: string }
				| { kind: 'unknown' }
				| { kind: 'rejected'; reason: string };
			actorId: string;
		},
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		const work = await manager.findOneBy(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
		const attempt = await manager.findOneBy(WorkAttempt, {
			id: input.attemptId,
			projectId: input.projectId,
			workId: input.workId,
		});
		const intent = await manager.findOneBy(WorkDispatchIntent, {
			attemptId: input.attemptId,
			projectId: input.projectId,
		});
		if (
			!work ||
			!attempt ||
			!intent ||
			work.currentAttemptId !== attempt.id ||
			(input.result.kind === 'rejected' && work.version !== input.expectedWorkVersion) ||
			attempt.phase !== 'dispatching' ||
			(intent.state !== 'pending' && intent.state !== 'unknown')
		) {
			throw new ConflictError('Dispatch result does not match the current work attempt.');
		}

		if (input.result.kind === 'accepted') {
			attempt.phase = 'active';
			attempt.ownerExecutionRef = input.result.ownerExecutionRef;
			attempt.startedAt ??= new Date();
			intent.state = 'acknowledged';
			intent.acknowledgmentReference = input.result.ownerExecutionRef;
			await manager.save(attempt);
			await manager.save(intent);
			await manager.increment(
				Department,
				{ id: work.departmentId, projectId: work.projectId },
				'projectionSequence',
				1,
			);
		} else if (input.result.kind === 'unknown') {
			intent.state = 'unknown';
			await manager.save(intent);
			await manager.increment(
				Department,
				{ id: work.departmentId, projectId: work.projectId },
				'projectionSequence',
				1,
			);
		} else {
			const fromState = work.state;
			work.state = 'blocked';
			work.version += 1;
			work.updatedAt = new Date();
			attempt.phase = 'terminal';
			attempt.outcome = 'failed';
			attempt.safeSummary = input.result.reason.slice(0, 2000);
			attempt.finishedAt = new Date();
			intent.state = 'rejected';
			await manager.save(attempt);
			await manager.save(intent);
			const update = await manager
				.createQueryBuilder()
				.update(WorkItem)
				.set({ state: 'blocked', version: work.version, updatedAt: work.updatedAt })
				.where('id = :workId', { workId: work.id })
				.andWhere('projectId = :projectId', { projectId: work.projectId })
				.andWhere('departmentId = :departmentId', { departmentId: work.departmentId })
				.andWhere('version = :expectedVersion', { expectedVersion: input.expectedWorkVersion })
				.execute();
			if (update.affected !== 1)
				throw new ConflictError('Work item changed while dispatch was being recorded.');
			await manager.save(
				WorkTransition,
				Object.assign(new WorkTransition(), {
					id: randomUUID(),
					projectId: work.projectId,
					departmentId: work.departmentId,
					workId: work.id,
					attemptId: attempt.id,
					actorId: input.actorId,
					actorKind: 'system',
					fromState,
					toState: 'blocked',
					reason: input.result.reason.slice(0, 2000),
					workVersion: work.version,
					createdAt: new Date(),
				}),
			);
			await manager.increment(
				Department,
				{ id: work.departmentId, projectId: work.projectId },
				'projectionSequence',
				1,
			);
		}
		return await manager.findOneByOrFail(WorkItem, {
			id: input.workId,
			projectId: input.projectId,
			departmentId: input.departmentId,
		});
	}

	async saveOwnerEventReceipt(receipt: WorkOwnerEventReceipt, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkOwnerEventReceipt, receipt);
	}

	async addTransition(transition: WorkTransition, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkTransition, transition);
	}

	async listTransitions(
		projectId: string,
		departmentId: string,
		workId: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).find(WorkTransition, {
			where: { projectId, departmentId, workId },
			order: { workVersion: 'ASC', createdAt: 'ASC' },
		});
	}

	async addReviewDecision(decision: WorkReviewDecision, ctx: OperationContext = {}) {
		return await this.manager(ctx).save(WorkReviewDecision, decision);
	}

	async listActiveWork(
		projectId: string,
		departmentId: string,
		memberId: string | undefined,
		ctx: OperationContext = {},
	) {
		const query = this.manager(ctx)
			.createQueryBuilder(WorkItem, 'work')
			.select(['work.id'])
			.leftJoin(
				WorkAttempt,
				'attempt',
				'attempt.id = work.currentAttemptId AND attempt.projectId = work.projectId',
			)
			.where('work.projectId = :projectId', { projectId })
			.andWhere('work.departmentId = :departmentId', { departmentId })
			.andWhere('(work.state NOT IN (:...terminalStates) OR attempt.phase IN (:...activePhases))', {
				activePhases: ['dispatching', 'active', 'suspended'],
				terminalStates: ['done', 'cancelled'],
			});
		if (memberId) query.andWhere('work.assigneeMemberId = :memberId', { memberId });
		return await query.getMany();
	}
}
