import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, IsNull } from '@n8n/typeorm';
import type { AiDepartmentMeetingState } from '@n8n/api-types';

import { CommandReceipt } from '../entities/command-receipt.entity';
import {
	AiDepartmentMeeting,
	AiDepartmentMeetingActionItem,
	AiDepartmentMeetingActivity,
	AiDepartmentMeetingContext,
	AiDepartmentMeetingContribution,
	AiDepartmentMeetingDecision,
	AiDepartmentMeetingInvocation,
	AiDepartmentMeetingMinutes,
	AiDepartmentMeetingParticipant,
	AiDepartmentMeetingSource,
} from '../entities/meeting.entity';
import { DepartmentAdmissionFence } from '../entities/department-admission-fence.entity';

class MeetingTable extends BaseRepository<AiDepartmentMeeting> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(AiDepartmentMeeting, dataSource.manager, runner);
	}
}

export type MeetingListFilter = {
	take: number;
	skip: number;
	state?: AiDepartmentMeetingState;
	search?: string;
};

const archiveBlockingStates: AiDepartmentMeetingState[] = [
	'collecting',
	'synthesizing',
	'review',
	'approved',
	'cancelling',
];

export type NewMeetingCommandReceipt = Pick<
	CommandReceipt,
	| 'id'
	| 'projectId'
	| 'actorId'
	| 'requestId'
	| 'payloadHash'
	| 'operation'
	| 'status'
	| 'createdAt'
> &
	Pick<CommandReceipt, 'responseJson'>;

export type MeetingCommandReceiptResult =
	| { kind: 'created' | 'replayed'; receipt: CommandReceipt }
	| { kind: 'conflict' };

@Service()
export class MeetingRepository {
	private readonly table: MeetingTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.table = new MeetingTable(dataSource, runner);
	}

	private manager(ctx: OperationContext) {
		return this.table.managerFor(ctx);
	}

	async findMeeting(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeeting, {
			id: meetingId,
			projectId,
			departmentId,
		});
	}

	async listMeetings(
		projectId: string,
		departmentId: string,
		filter: MeetingListFilter,
		ctx: OperationContext,
	) {
		const query = this.manager(ctx)
			.createQueryBuilder(AiDepartmentMeeting, 'meeting')
			.where('meeting.projectId = :projectId', { projectId })
			.andWhere('meeting.departmentId = :departmentId', { departmentId });

		if (filter.state) query.andWhere('meeting.state = :state', { state: filter.state });
		if (filter.search) {
			query.andWhere('LOWER(meeting.topic) LIKE LOWER(:search)', {
				search: `%${filter.search}%`,
			});
		}

		return await query
			.orderBy('meeting.updatedAt', 'DESC')
			.addOrderBy('meeting.id', 'DESC')
			.skip(filter.skip)
			.take(filter.take)
			.getManyAndCount();
	}

	async listArchiveBlockingMeetingIds(
		projectId: string,
		departmentId: string | undefined,
		memberId: string | undefined,
		ctx: OperationContext,
	) {
		const query = this.manager(ctx)
			.createQueryBuilder(AiDepartmentMeeting, 'meeting')
			.select('meeting.id', 'id')
			.where('meeting.projectId = :projectId', { projectId })
			.andWhere('meeting.state IN (:...states)', { states: archiveBlockingStates });
		if (departmentId) query.andWhere('meeting.departmentId = :departmentId', { departmentId });

		if (memberId) {
			query
				.innerJoin(
					AiDepartmentMeetingParticipant,
					'participant',
					'participant.projectId = meeting.projectId AND participant.departmentId = meeting.departmentId AND participant.meetingId = meeting.id',
				)
				.andWhere('participant.memberId = :memberId', { memberId });
		}

		const rows = await query.distinct(true).getRawMany<{ id: string }>();
		return rows.map(({ id }) => id);
	}

	async acquireDepartmentAdmissionFence(
		projectId: string,
		departmentId: string,
		ctx: OperationContext,
	) {
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

	async listActiveMeetingIdsForMember(projectId: string, memberId: string, ctx: OperationContext) {
		return await this.listArchiveBlockingMeetingIds(projectId, undefined, memberId, ctx);
	}

	async createMeeting(meeting: AiDepartmentMeeting, ctx: OperationContext) {
		return await this.manager(ctx).save(AiDepartmentMeeting, meeting);
	}

	async updateMeeting(
		projectId: string,
		departmentId: string,
		meetingId: string,
		expectedVersion: number,
		changes: Partial<
			Pick<
				AiDepartmentMeeting,
				| 'topic'
				| 'purpose'
				| 'desiredOutcome'
				| 'facilitatorMemberId'
				| 'goalId'
				| 'referencedWorkIds'
				| 'state'
				| 'version'
				| 'startedAt'
				| 'collectionDeadlineAt'
				| 'frozenContributionIds'
				| 'collectionClosedAt'
				| 'collectionCloseReason'
				| 'absenceSnapshots'
				| 'completedAt'
				| 'executionActorId'
			>
		>,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeeting,
			{ id: meetingId, projectId, departmentId, version: expectedVersion },
			changes,
		);
	}

	async listParticipants(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingParticipant, {
			where: { projectId, departmentId, meetingId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async findParticipant(
		projectId: string,
		departmentId: string,
		meetingId: string,
		participantId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingParticipant, {
			id: participantId,
			projectId,
			departmentId,
			meetingId,
		});
	}

	async updateParticipantResponse(
		projectId: string,
		meetingId: string,
		participantId: string,
		responseState: AiDepartmentMeetingParticipant['responseState'],
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingParticipant,
			{ projectId, meetingId, id: participantId },
			{ responseState },
		);
	}

	async excludeParticipant(
		projectId: string,
		departmentId: string,
		meetingId: string,
		participantId: string,
		reason: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingParticipant,
			{ projectId, departmentId, meetingId, id: participantId },
			{ responseState: 'excluded', exclusionReason: reason },
		);
	}

	async addParticipants(participants: AiDepartmentMeetingParticipant[], ctx: OperationContext) {
		if (participants.length === 0) return;
		await this.manager(ctx).insert(AiDepartmentMeetingParticipant, participants);
	}

	async replaceDraftParticipants(
		projectId: string,
		departmentId: string,
		meetingId: string,
		participants: AiDepartmentMeetingParticipant[],
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		await manager.delete(AiDepartmentMeetingParticipant, { projectId, departmentId, meetingId });
		if (participants.length > 0) await manager.insert(AiDepartmentMeetingParticipant, participants);
	}

	async countParticipants(
		projectId: string,
		departmentId: string,
		meetingIds: string[],
		ctx: OperationContext,
	) {
		if (meetingIds.length === 0) return [];
		return await this.manager(ctx)
			.createQueryBuilder(AiDepartmentMeetingParticipant, 'participant')
			.select('participant.meetingId', 'meetingId')
			.addSelect('participant.responseState', 'state')
			.addSelect('COUNT(*)', 'count')
			.where('participant.projectId = :projectId', { projectId })
			.andWhere('participant.departmentId = :departmentId', { departmentId })
			.andWhere('participant.meetingId IN (:...meetingIds)', { meetingIds })
			.groupBy('participant.meetingId')
			.addGroupBy('participant.responseState')
			.getRawMany<{ meetingId: string; state: string; count: string }>();
	}

	async listSources(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingSource, {
			where: { projectId, departmentId, meetingId },
			order: { sourceKind: 'ASC', sourceId: 'ASC' },
		});
	}

	async saveContextSnapshot(snapshot: AiDepartmentMeetingContext, ctx: OperationContext) {
		return await this.manager(ctx).save(AiDepartmentMeetingContext, snapshot);
	}

	async findContextSnapshot(
		projectId: string,
		departmentId: string,
		meetingId: string,
		snapshotRef: string,
		ctx: OperationContext = {},
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingContext, {
			projectId,
			departmentId,
			meetingId,
			snapshotRef,
		});
	}

	async saveSources(sources: AiDepartmentMeetingSource[], ctx: OperationContext) {
		if (sources.length === 0) return;
		await this.manager(ctx).insert(AiDepartmentMeetingSource, sources);
	}

	async replaceSources(
		projectId: string,
		departmentId: string,
		meetingId: string,
		sources: AiDepartmentMeetingSource[],
		ctx: OperationContext,
	) {
		const manager = this.manager(ctx);
		await manager.delete(AiDepartmentMeetingSource, { projectId, departmentId, meetingId });
		if (sources.length > 0) await manager.insert(AiDepartmentMeetingSource, sources);
	}

	async findApprovedDecisionSource(
		projectId: string,
		departmentId: string,
		decisionId: string,
		ctx: OperationContext = {},
	) {
		const manager = this.manager(ctx);
		const decision = await manager.findOne(AiDepartmentMeetingDecision, {
			where: {
				id: decisionId,
				projectId,
				departmentId,
				state: 'approved',
			},
		});
		if (!decision || !decision.approvedBy || !decision.approvedAt) return null;
		const [minutes, meeting] = await Promise.all([
			manager.findOneBy(AiDepartmentMeetingMinutes, {
				id: decision.minutesId,
				projectId,
				departmentId,
				state: 'approved',
			}),
			manager.findOneBy(AiDepartmentMeeting, {
				id: decision.meetingId,
				projectId,
				departmentId,
			}),
		]);
		if (!minutes || !meeting || !['approved', 'completed'].includes(meeting.state)) return null;
		return { decision, minutes, meeting };
	}

	async listInvocations(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingInvocation, {
			where: { projectId, departmentId, meetingId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async findInvocationByRequestKey(projectId: string, requestKey: string, ctx: OperationContext) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingInvocation, {
			projectId,
			requestKey,
		});
	}

	async saveInvocation(invocation: AiDepartmentMeetingInvocation, ctx: OperationContext) {
		return await this.manager(ctx).save(AiDepartmentMeetingInvocation, invocation);
	}

	async findInvocation(
		projectId: string,
		departmentId: string,
		meetingId: string,
		invocationId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingInvocation, {
			projectId,
			departmentId,
			meetingId,
			id: invocationId,
		});
	}

	async listReconciliationInvocationIds(take: number, ctx: OperationContext) {
		return await this.manager(ctx)
			.createQueryBuilder(AiDepartmentMeetingInvocation, 'invocation')
			.select('invocation.projectId', 'projectId')
			.addSelect('invocation.departmentId', 'departmentId')
			.addSelect('invocation.meetingId', 'meetingId')
			.addSelect('invocation.id', 'invocationId')
			.where('invocation.state IN (:...states)', {
				states: ['reserved', 'queued', 'running', 'unknown', 'stop_pending'],
			})
			.orderBy('invocation.updatedAt', 'ASC')
			.take(take)
			.getRawMany<{
				projectId: string;
				departmentId: string;
				meetingId: string;
				invocationId: string;
			}>();
	}

	async listDueCollectionMeetings(now: Date, take: number, ctx: OperationContext) {
		return await this.manager(ctx)
			.createQueryBuilder(AiDepartmentMeeting, 'meeting')
			.select('meeting.projectId', 'projectId')
			.addSelect('meeting.departmentId', 'departmentId')
			.addSelect('meeting.id', 'meetingId')
			.where('meeting.state = :state', { state: 'collecting' })
			.andWhere('meeting.collectionDeadlineAt IS NOT NULL')
			.andWhere('meeting.collectionDeadlineAt <= :now', { now })
			.andWhere('meeting.frozenContributionIds IS NULL')
			.orderBy('meeting.collectionDeadlineAt', 'ASC')
			.addOrderBy('meeting.id', 'ASC')
			.take(take)
			.getRawMany<{ projectId: string; departmentId: string; meetingId: string }>();
	}

	async listContributions(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingContribution, {
			where: { projectId, departmentId, meetingId },
			order: { acceptedAt: 'ASC', id: 'ASC' },
		});
	}

	async acceptContribution(contribution: AiDepartmentMeetingContribution, ctx: OperationContext) {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(AiDepartmentMeetingContribution)
			.values(contribution)
			.orIgnore()
			.execute();
		return await manager.findOneBy(AiDepartmentMeetingContribution, {
			projectId: contribution.projectId,
			invocationId: contribution.invocationId,
		});
	}

	async updateInvocationOwnerSnapshot(
		projectId: string,
		meetingId: string,
		invocationId: string,
		ownerInvocationRef: string,
		ownerSequence: string,
		state: AiDepartmentMeetingInvocation['state'],
		safeFailureCode: string | null,
		ctx: OperationContext,
	) {
		const current = await this.manager(ctx).findOneBy(AiDepartmentMeetingInvocation, {
			projectId,
			meetingId,
			id: invocationId,
		});
		if (!current || current.ownerInvocationRef !== ownerInvocationRef) return false;
		if (current.ownerSequence && BigInt(ownerSequence) <= BigInt(current.ownerSequence))
			return false;
		const result = await this.manager(ctx).update(
			AiDepartmentMeetingInvocation,
			{ projectId, meetingId, id: invocationId, ownerInvocationRef },
			{ ownerSequence, state, safeFailureCode },
		);
		return result.affected === 1;
	}

	async listMinutes(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingMinutes, {
			where: { projectId, departmentId, meetingId },
			order: { revision: 'DESC' },
		});
	}

	async findMinutesRevision(
		projectId: string,
		departmentId: string,
		meetingId: string,
		minutesId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingMinutes, {
			id: minutesId,
			projectId,
			departmentId,
			meetingId,
		});
	}

	async saveMinutes(minutes: AiDepartmentMeetingMinutes, ctx: OperationContext) {
		return await this.manager(ctx).save(AiDepartmentMeetingMinutes, minutes);
	}

	async approveMinutes(
		projectId: string,
		departmentId: string,
		meetingId: string,
		minutesId: string,
		actorId: string,
		approvedAt: Date,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingMinutes,
			{ id: minutesId, projectId, departmentId, meetingId, state: 'draft' },
			{ state: 'approved', approvedBy: actorId, approvedAt },
		);
	}

	async approveProposedDecisions(
		projectId: string,
		departmentId: string,
		meetingId: string,
		minutesId: string,
		actorId: string,
		approvedAt: Date,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingDecision,
			{ projectId, departmentId, meetingId, minutesId, state: 'proposed' },
			{ state: 'approved', approvedBy: actorId, approvedAt },
		);
	}

	async listDecisions(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingDecision, {
			where: { projectId, departmentId, meetingId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async saveDecisions(decisions: AiDepartmentMeetingDecision[], ctx: OperationContext) {
		if (decisions.length === 0) return;
		await this.manager(ctx).insert(AiDepartmentMeetingDecision, decisions);
	}

	async listActionItems(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingActionItem, {
			where: { projectId, departmentId, meetingId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async listMeetingInvocations(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingInvocation, {
			where: { projectId, departmentId, meetingId },
		});
	}

	async findActionItem(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(AiDepartmentMeetingActionItem, {
			id: itemId,
			projectId,
			departmentId,
			meetingId,
		});
	}

	async saveActionItem(actionItem: AiDepartmentMeetingActionItem, ctx: OperationContext) {
		return await this.manager(ctx).save(AiDepartmentMeetingActionItem, actionItem);
	}

	async resolveActionItem(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		state: 'approved' | 'declined',
		actorId: string,
		resolvedAt: Date,
		reason: string | null,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingActionItem,
			{ id: itemId, projectId, departmentId, meetingId, state: 'proposed' },
			{
				state,
				approvedBy: state === 'approved' ? actorId : null,
				approvedAt: state === 'approved' ? resolvedAt : null,
				resolvedAt,
				resolutionReason: state === 'declined' ? reason : null,
			},
		);
	}

	async reserveActionItemConversion(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		requestId: string,
		payloadHash: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingActionItem,
			{
				id: itemId,
				projectId,
				departmentId,
				meetingId,
				state: 'approved',
				conversionRequestId: IsNull(),
			},
			{ state: 'conversion_pending', conversionRequestId: requestId, payloadHash },
		);
	}

	async completeActionItemConversion(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		requestId: string,
		workId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingActionItem,
			{
				id: itemId,
				projectId,
				departmentId,
				meetingId,
				state: 'conversion_pending',
				conversionRequestId: requestId,
			},
			{ state: 'converted', workId, resolvedAt: new Date() },
		);
	}

	async markActionItemConversionRecoveryRequired(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		requestId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			AiDepartmentMeetingActionItem,
			{
				id: itemId,
				projectId,
				departmentId,
				meetingId,
				state: 'conversion_pending',
				conversionRequestId: requestId,
			},
			{ state: 'recovery_required', resolvedAt: new Date() },
		);
	}

	async appendActivity(activity: AiDepartmentMeetingActivity, ctx: OperationContext) {
		return await this.manager(ctx).insert(AiDepartmentMeetingActivity, activity);
	}

	async listActivity(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).find(AiDepartmentMeetingActivity, {
			where: { projectId, departmentId, meetingId },
			order: { createdAt: 'ASC', id: 'ASC' },
		});
	}

	async createOrReadCommandReceipt(
		receipt: NewMeetingCommandReceipt,
		ctx: OperationContext,
	): Promise<MeetingCommandReceiptResult | null> {
		const manager = this.manager(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(CommandReceipt)
			.values(receipt)
			.orIgnore()
			.execute();
		const stored = await manager.findOneBy(CommandReceipt, {
			projectId: receipt.projectId,
			actorId: receipt.actorId,
			requestId: receipt.requestId,
		});
		if (!stored) return null;
		if (stored.operation !== receipt.operation || stored.payloadHash !== receipt.payloadHash) {
			return { kind: 'conflict' };
		}
		return {
			kind: stored.id === receipt.id ? 'created' : 'replayed',
			receipt: stored,
		};
	}

	async findCommandReceipt(
		projectId: string,
		actorId: string,
		requestId: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).findOneBy(CommandReceipt, { projectId, actorId, requestId });
	}

	async completeCommandReceipt(
		projectId: string,
		actorId: string,
		requestId: string,
		operation: string,
		payloadHash: string,
		responseJson: string,
		ctx: OperationContext,
	) {
		return await this.manager(ctx).update(
			CommandReceipt,
			{ projectId, actorId, requestId, operation, payloadHash, status: 'pending' },
			{ status: 'completed', responseJson },
		);
	}
}
