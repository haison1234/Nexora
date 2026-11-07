import type {
	AiDepartmentMeetingCommandStatusDto,
	AiDepartmentMeetingDto,
	AiDepartmentMeetingPageDto,
	AiDepartmentMeetingSummaryDto,
	CreateAiDepartmentMeetingDto,
	CreateAiDepartmentWorkDto,
	AiDepartmentMeetingSourceDto,
	AiDepartmentMeetingSynthesisResult,
	CancelAiDepartmentMeetingDto,
	ExcludeAiDepartmentMeetingParticipantDto,
	RetryAiDepartmentMeetingDto,
	ResolveAiDepartmentMeetingActionItemDto,
	ResolveAiDepartmentMeetingItemDto,
	StartAiDepartmentMeetingDto,
	TakeoverAiDepartmentMeetingDto,
	SaveAiDepartmentMeetingMinutesDto,
	UpdateAiDepartmentMeetingDto,
} from '@n8n/api-types';
import { aiDepartmentMeetingSynthesisResultSchema } from '@n8n/api-types';
import { TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import { DirectoryRepository } from './database/repositories/directory.repository';
import { MeetingRepository } from './database/repositories/meeting.repository';
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
} from './database/entities/meeting.entity';
import {
	DepartmentMeetingInvocationOwnerProxy,
	hashDepartmentMeetingInvocationRequest,
	type DepartmentMeetingInvocationRequest,
} from '@/modules/agents/agent-department-meeting-invocation.contracts';
import { WorkService } from './work/work.service';

const participantStates = [
	'pending',
	'queued',
	'running',
	'submitted',
	'failed',
	'unavailable',
	'stop_pending',
	'unknown',
	'excluded',
] as const;

function payloadHash(payload: unknown) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function parseSynthesisResult(
	text: string,
	allowedContributionIds: string[],
	contributions: AiDepartmentMeetingContribution[],
): AiDepartmentMeetingSynthesisResult | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	const parsed = aiDepartmentMeetingSynthesisResultSchema.safeParse(value);
	if (!parsed.success) return null;
	const allowed = new Set(allowedContributionIds);
	const allReferences = [
		...parsed.data.sourceContributionIds,
		...parsed.data.decisions.flatMap(({ sourceContributionIds }) => sourceContributionIds),
		...parsed.data.actionItems.flatMap(({ sourceContributionIds }) => sourceContributionIds),
		...parsed.data.disagreements.flatMap(({ positions }) =>
			positions.map(({ contributionId }) => contributionId),
		),
	];
	if (allReferences.some((id) => !allowed.has(id))) return null;
	const contributionById = new Map(
		contributions.map((contribution) => [contribution.id, contribution]),
	);
	if (
		parsed.data.disagreements.some((disagreement) => {
			const participantIds = new Set(
				disagreement.positions.map(
					({ contributionId }) => contributionById.get(contributionId)?.participantId,
				),
			);
			return participantIds.has(undefined) || participantIds.size < 2;
		})
	)
		return null;
	if (
		parsed.data.decisions.some(({ sourceContributionIds }) => sourceContributionIds.length === 0) ||
		parsed.data.actionItems.some(({ sourceContributionIds }) => sourceContributionIds.length === 0)
	)
		return null;
	return parsed.data;
}

function workRequestId(projectId: string, actorId: string, requestId: string) {
	return createHash('sha256')
		.update(JSON.stringify({ projectId, actorId, requestId, operation: 'meeting-work-create' }))
		.digest('hex')
		.slice(0, 36);
}

function actionItemWorkPayload(
	departmentId: string,
	item: Pick<AiDepartmentMeetingActionItem, 'title' | 'description' | 'assigneeMemberId'>,
) {
	const instruction = item.description
		? `${item.title.trim()}\n\n${item.description.trim()}`
		: item.title.trim();
	return {
		input: {
			departmentId,
			instruction,
			goalId: null,
			assigneeMemberId: item.assigneeMemberId,
			priority: 'normal' as const,
			dueAt: null,
			reviewPolicy: 'required' as const,
		},
		toDto(requestId: string): CreateAiDepartmentWorkDto {
			return {
				instruction,
				assigneeMemberId: item.assigneeMemberId,
				priority: 'normal',
				reviewPolicy: 'required',
				requestId,
			};
		},
	};
}

function meetingSourceIdentity(source: AiDepartmentMeetingSource) {
	return {
		kind: source.sourceKind,
		sourceId: source.sourceId,
		sourceVersion: source.sourceVersion,
		snapshotRef: source.snapshotRef,
		contentHash: source.contentHash,
	};
}

function safeReplay(responseJson: string | null, payloadHashMatches: boolean) {
	if (!payloadHashMatches)
		throw new ConflictError('Request ID was already used for a different command.');
	if (!responseJson) throw new ConflictError('This command is still being processed.');
	return JSON.parse(responseJson);
}

function toCommandResult(meeting: AiDepartmentMeeting, requestId: string) {
	return {
		meetingId: meeting.id,
		meetingVersion: meeting.version,
		state: meeting.state,
		status: 'accepted' as const,
		requestId,
		invocations: [],
	};
}

function toSummary(meeting: AiDepartmentMeeting, counts: Map<string, number>) {
	const participantCounts = Object.fromEntries(
		participantStates.map((state) => [state, 0]),
	) as Record<(typeof participantStates)[number], number>;
	for (const state of participantStates) participantCounts[state] = counts.get(state) ?? 0;
	return {
		id: meeting.id,
		departmentId: meeting.departmentId,
		topic: meeting.referencedWorkIds.length > 0 || meeting.goalId ? null : meeting.topic,
		state: meeting.state,
		participantCounts,
		createdBy: meeting.createdBy,
		updatedAt: meeting.updatedAt.toISOString(),
	} satisfies AiDepartmentMeetingSummaryDto;
}

@Service()
export class MeetingService {
	constructor(
		private readonly meetings: MeetingRepository,
		private readonly directory: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly invocationOwner: DepartmentMeetingInvocationOwnerProxy,
		private readonly work: WorkService,
	) {}

	async list(
		projectId: string,
		departmentId: string,
		query: { take: number; skip: number; state?: AiDepartmentMeeting['state']; search?: string },
	): Promise<AiDepartmentMeetingPageDto> {
		await this.requireDepartment(projectId, departmentId);
		const [rows, total] = await this.meetings.listMeetings(
			projectId,
			departmentId,
			{ take: query.take, skip: query.skip, state: query.state, search: query.search },
			{},
		);
		const grouped = await this.meetings.countParticipants(
			projectId,
			departmentId,
			rows.map(({ id }) => id),
			{},
		);
		const countsByMeeting = new Map<string, Map<string, number>>();
		for (const row of grouped) {
			const counts = countsByMeeting.get(row.meetingId) ?? new Map<string, number>();
			counts.set(row.state, Number(row.count));
			countsByMeeting.set(row.meetingId, counts);
		}
		return {
			items: rows.map((row) => toSummary(row, countsByMeeting.get(row.id) ?? new Map())),
			total,
			take: query.take,
			skip: query.skip,
		};
	}

	async get(
		projectId: string,
		departmentId: string,
		meetingId: string,
	): Promise<AiDepartmentMeetingDto> {
		await this.requireDepartment(projectId, departmentId);
		const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, {});
		if (!meeting) throw new NotFoundError('Meeting not found.');
		const [
			participants,
			sources,
			minutes,
			activity,
			contributions,
			invocations,
			decisions,
			actionItems,
		] = await Promise.all([
			this.meetings.listParticipants(projectId, departmentId, meetingId, {}),
			this.meetings.listSources(projectId, departmentId, meetingId, {}),
			this.meetings.listMinutes(projectId, departmentId, meetingId, {}),
			this.meetings.listActivity(projectId, departmentId, meetingId, {}),
			this.meetings.listContributions(projectId, departmentId, meetingId, {}),
			this.meetings.listInvocations(projectId, departmentId, meetingId, {}),
			this.meetings.listDecisions(projectId, departmentId, meetingId, {}),
			this.meetings.listActionItems(projectId, departmentId, meetingId, {}),
		]);
		const contributionByParticipant = new Map(
			contributions.map((contribution) => [contribution.participantId, contribution]),
		);
		const invocationsByParticipant = new Map<string, AiDepartmentMeetingInvocation[]>();
		for (const invocation of invocations) {
			const participantInvocations = invocationsByParticipant.get(invocation.participantId) ?? [];
			participantInvocations.push(invocation);
			invocationsByParticipant.set(invocation.participantId, participantInvocations);
		}
		const protectedBody = sources.length > 0;
		return {
			id: meeting.id,
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			createdBy: meeting.createdBy,
			executionActorId: meeting.executionActorId,
			topic: protectedBody ? null : meeting.topic,
			purpose: meeting.purpose,
			desiredOutcome: protectedBody ? null : meeting.desiredOutcome,
			state: meeting.state,
			facilitatorMemberId: meeting.facilitatorMemberId,
			goalId: meeting.goalId,
			referencedWorkIds: meeting.referencedWorkIds,
			collection: {
				deadlineAt: meeting.collectionDeadlineAt?.toISOString() ?? null,
				closedAt: meeting.collectionClosedAt?.toISOString() ?? null,
				closeReason: meeting.collectionCloseReason,
				acceptedContributionIds: meeting.frozenContributionIds,
				absences: meeting.absenceSnapshots ?? [],
			},
			sources: sources.map(
				(source): AiDepartmentMeetingSourceDto => ({
					id: source.id,
					kind: source.sourceKind,
					label: null,
					version: source.sourceVersion,
					access: source.accessState,
				}),
			),
			version: meeting.version,
			participants: participants.map((participant) => ({
				id: participant.id,
				memberId: participant.memberId,
				name: participant.memberNameSnapshot,
				role: participant.roleSnapshot,
				executionState:
					participant.executorId === null ? ('unconfigured' as const) : ('unavailable' as const),
				facilitator: participant.facilitator,
				state: participant.responseState,
				exclusionReason: participant.exclusionReason,
				invocations: (invocationsByParticipant.get(participant.id) ?? []).map((invocation) => ({
					id: invocation.id,
					kind: invocation.kind,
					state: invocation.state,
					sequence: invocation.ownerSequence,
					safeFailureCode: invocation.safeFailureCode,
					safeFailureSummary: invocation.safeFailureSummary,
					deadlineAt: invocation.deadlineAt?.toISOString() ?? null,
					terminalAt: invocation.terminalAt?.toISOString() ?? null,
					retryOfInvocationId: invocation.retryOfInvocationId,
				})),
				contribution: protectedBody
					? null
					: (() => {
							const contribution = contributionByParticipant.get(participant.id);
							if (!contribution) return null;
							return {
								id: contribution.id,
								participantId: contribution.participantId,
								...contribution.contribution,
								sources: contribution.sourceContributionIds.map((contributionId) => ({
									contributionId,
									label: 'Meeting contribution',
								})),
								acceptedAt: contribution.acceptedAt.toISOString(),
							};
						})(),
			})),
			minutes: minutes.map((revision) => ({
				id: revision.id,
				revision: revision.revision,
				state: revision.state,
				summary: protectedBody ? '' : revision.summary,
				sourceContributionIds: revision.sourceContributionIds,
				disagreements: protectedBody ? [] : revision.disagreements,
				decisions: decisions
					.filter((decision) => decision.minutesId === revision.id)
					.map((decision) => ({
						id: decision.id,
						text: protectedBody ? '' : decision.text,
						state: decision.state,
						sourceContributionIds: decision.sourceContributionIds,
						approvedBy: decision.approvedBy,
						approvedAt: decision.approvedAt?.toISOString() ?? null,
					})),
				actionItems: actionItems
					.filter((item) => item.minutesId === revision.id)
					.map((item) => ({
						id: item.id,
						title: protectedBody ? '' : item.title,
						description: protectedBody ? null : item.description,
						assigneeMemberId: item.assigneeMemberId,
						state: item.state,
						sourceContributionIds: item.sourceContributionIds,
						workId: item.workId,
						resolutionReason: protectedBody ? null : item.resolutionReason,
					})),
				authoredBy: revision.authoredBy,
				approvedBy: revision.approvedBy,
				approvedAt: revision.approvedAt?.toISOString() ?? null,
			})),
			activity: activity.map((event) => ({
				id: event.id,
				actorId: event.actorId,
				createdAt: event.createdAt.toISOString(),
				action: event.action,
				targetId: event.targetId,
				state: event.state,
				summary: event.summary,
			})),
			createdAt: meeting.createdAt.toISOString(),
			updatedAt: meeting.updatedAt.toISOString(),
		};
	}

	async create(
		projectId: string,
		departmentId: string,
		actorId: string,
		dto: CreateAiDepartmentMeetingDto,
	) {
		this.validateParticipants(dto.participantMemberIds, dto.facilitatorMemberId);
		const hash = payloadHash({ projectId, departmentId, operation: 'meeting.create', ...dto });
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.work.validateMeetingReferences(
				projectId,
				departmentId,
				dto.goalId ?? null,
				dto.referencedWorkIds,
				ctx,
			);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receiptId = randomUUID();
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: receiptId,
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.create',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed') {
				const result = safeReplay(receipt.receipt.responseJson, true);
				const current = await this.meetings.findMeeting(
					projectId,
					departmentId,
					result.meetingId,
					ctx,
				);
				if (!current) throw new NotFoundError('Meeting not found.');
				await this.work.validateMeetingReferences(
					projectId,
					departmentId,
					current.goalId,
					current.referencedWorkIds,
					ctx,
				);
				await this.assertSourcesCurrent(
					projectId,
					departmentId,
					current.id,
					await this.meetings.listSources(projectId, departmentId, current.id, ctx),
					ctx,
				);
				return result;
			}
			const participants = await this.loadParticipants(
				projectId,
				departmentId,
				dto.participantMemberIds,
				ctx,
			);
			const meeting = Object.assign(new AiDepartmentMeeting(), {
				id: randomUUID(),
				projectId,
				departmentId,
				createdBy: actorId,
				executionActorId: actorId,
				topic: dto.topic.trim(),
				purpose: dto.purpose,
				desiredOutcome: dto.desiredOutcome.trim(),
				state: 'draft',
				facilitatorMemberId: dto.facilitatorMemberId,
				goalId: dto.goalId ?? null,
				referencedWorkIds: dto.referencedWorkIds,
				version: 1,
				startedAt: null,
				completedAt: null,
			});
			await this.meetings.createMeeting(meeting, ctx);
			const sources = await this.captureSourceRows(
				projectId,
				departmentId,
				meeting.id,
				dto.goalId ?? null,
				dto.referencedWorkIds,
				dto.approvedDecisionIds ?? [],
				ctx,
			);
			await this.meetings.saveSources(sources, ctx);
			await this.meetings.addParticipants(
				participants.map((member) =>
					this.toParticipant(projectId, departmentId, meeting.id, member, dto.facilitatorMemberId),
				),
				ctx,
			);
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId: meeting.id,
					actorId,
					action: 'created',
					targetId: null,
					state: meeting.state,
					summary: 'Draft meeting created.',
					meetingVersion: meeting.version,
				}),
				ctx,
			);
			const result = toCommandResult(meeting, dto.requestId);
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.create',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	async update(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: UpdateAiDepartmentMeetingDto,
	) {
		this.validateParticipants(dto.participantMemberIds, dto.facilitatorMemberId);
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			operation: 'meeting.update',
			...dto,
		});
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receiptId = randomUUID();
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: receiptId,
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.update',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed') {
				const current = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
				if (!current) throw new NotFoundError('Meeting not found.');
				await this.work.validateMeetingReferences(
					projectId,
					departmentId,
					current.goalId,
					current.referencedWorkIds,
					ctx,
				);
				await this.assertSourcesCurrent(
					projectId,
					departmentId,
					current.id,
					await this.meetings.listSources(projectId, departmentId, current.id, ctx),
					ctx,
				);
				return safeReplay(receipt.receipt.responseJson, true);
			}
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'draft') throw new ConflictError('Only draft meetings can be changed.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const participantIds =
				dto.participantMemberIds ??
				(await this.meetings.listParticipants(projectId, departmentId, meetingId, ctx)).map(
					({ memberId }) => memberId,
				);
			const facilitator = dto.facilitatorMemberId ?? meeting.facilitatorMemberId;
			this.validateParticipants(participantIds, facilitator);
			const goalId = dto.goalId === undefined ? meeting.goalId : dto.goalId;
			const referencedWorkIds = dto.referencedWorkIds ?? meeting.referencedWorkIds;
			await this.work.validateMeetingReferences(
				projectId,
				departmentId,
				goalId,
				referencedWorkIds,
				ctx,
			);
			const existingSources = await this.meetings.listSources(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const decisionIds =
				dto.approvedDecisionIds ??
				existingSources
					.filter(({ sourceKind }) => sourceKind === 'decision')
					.map(({ sourceId }) => sourceId);
			const sources = await this.captureSourceRows(
				projectId,
				departmentId,
				meetingId,
				goalId,
				referencedWorkIds,
				decisionIds,
				ctx,
			);
			const members = await this.loadParticipants(projectId, departmentId, participantIds, ctx);
			meeting.topic = dto.topic?.trim() ?? meeting.topic;
			meeting.purpose = dto.purpose ?? meeting.purpose;
			meeting.desiredOutcome = dto.desiredOutcome?.trim() ?? meeting.desiredOutcome;
			meeting.facilitatorMemberId = facilitator;
			meeting.goalId = goalId;
			meeting.referencedWorkIds = referencedWorkIds;
			meeting.version += 1;
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{
					topic: meeting.topic,
					purpose: meeting.purpose,
					desiredOutcome: meeting.desiredOutcome,
					facilitatorMemberId: meeting.facilitatorMemberId,
					goalId: meeting.goalId,
					referencedWorkIds: meeting.referencedWorkIds,
					version: meeting.version,
				},
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.replaceDraftParticipants(
				projectId,
				departmentId,
				meetingId,
				members.map((member) =>
					this.toParticipant(projectId, departmentId, meetingId, member, facilitator),
				),
				ctx,
			);
			await this.meetings.replaceSources(projectId, departmentId, meetingId, sources, ctx);
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'updated',
					targetId: null,
					state: meeting.state,
					summary: 'Draft meeting updated.',
					meetingVersion: meeting.version,
				}),
				ctx,
			);
			const result = toCommandResult(meeting, dto.requestId);
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.update',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	async start(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: StartAiDepartmentMeetingDto,
	) {
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			operation: 'meeting.start',
			...dto,
		});
		const startResult = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.start',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed')
				return { result: safeReplay(receipt.receipt.responseJson, true), invocations: [] };

			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'draft') throw new ConflictError('Only draft meetings can be started.');
			if (actorId !== meeting.executionActorId)
				throw new ConflictError(
					'Takeover is required before this coordinator can start the meeting.',
				);
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.work.validateMeetingReferences(
				projectId,
				departmentId,
				meeting.goalId,
				meeting.referencedWorkIds,
				ctx,
			);
			const sourceRows = await this.meetings.listSources(projectId, departmentId, meetingId, ctx);
			await this.assertSourcesCurrent(projectId, departmentId, meetingId, sourceRows, ctx);
			const participants = await this.meetings.listParticipants(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const participantIds = participants.map(({ memberId }) => memberId);
			this.validateParticipants(participantIds, meeting.facilitatorMemberId);
			const frozenParticipants = await this.loadParticipants(
				projectId,
				departmentId,
				participantIds,
				ctx,
			);
			const nextVersion = meeting.version + 1;
			const executionActorId = meeting.executionActorId;
			const startedAt = new Date();
			const collectionDeadlineAt = new Date(startedAt.getTime() + 10 * 60_000);
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{ state: 'collecting', startedAt, collectionDeadlineAt, version: nextVersion },
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const frozenParticipantRows = frozenParticipants.map((participant) =>
				this.toParticipant(
					projectId,
					departmentId,
					meetingId,
					participant,
					meeting.facilitatorMemberId,
				),
			);
			await this.meetings.replaceDraftParticipants(
				projectId,
				departmentId,
				meetingId,
				frozenParticipantRows,
				ctx,
			);
			for (const participant of frozenParticipantRows) {
				if (participant.executorId === null || participant.bindingVersion === null) {
					await this.meetings.updateParticipantResponse(
						projectId,
						meetingId,
						participant.id,
						'unavailable',
						ctx,
					);
				}
			}
			const contextRef = randomUUID();
			const briefingHash = payloadHash({
				topic: meeting.topic,
				desiredOutcome: meeting.desiredOutcome,
				goalId: meeting.goalId,
				referencedWorkIds: meeting.referencedWorkIds,
				actorId: executionActorId,
				participants: [...frozenParticipants]
					.sort((left, right) => left.member.id.localeCompare(right.member.id))
					.map(({ member, binding }) => ({
						memberId: member.id,
						name: member.name,
						role: member.role,
						executorId: binding?.executorId ?? null,
						bindingVersion: binding?.version ?? null,
					})),
				sources: sourceRows.map(meetingSourceIdentity),
			});
			await this.meetings.saveContextSnapshot(
				Object.assign(new AiDepartmentMeetingContext(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					snapshotRef: contextRef,
					briefingHash,
					toolPolicy: 'supplied-material-only',
					toolPolicyVersion: null,
					capturedAt: startedAt,
				}),
				ctx,
			);
			const invocations = frozenParticipantRows.flatMap((participant) => {
				return participant.executorId === null || participant.bindingVersion === null
					? []
					: [
							Object.assign(new AiDepartmentMeetingInvocation(), {
								id: randomUUID(),
								projectId,
								departmentId,
								meetingId,
								participantId: participant.id,
								kind: 'contribution' as const,
								requestKey: randomUUID(),
								inputHash: '',
								contextRef,
								actorId: executionActorId,
								memberId: participant.memberId,
								executorId: participant.executorId,
								bindingVersion: participant.bindingVersion,
								ownerInvocationRef: null,
								state: 'reserved' as const,
								ownerSequence: null,
								deadlineAt: collectionDeadlineAt,
								terminalAt: null,
								retryOfInvocationId: null,
								safeFailureCode: null,
								safeFailureSummary: null,
								stopCommandId: null,
							}),
						];
			});
			for (const invocation of invocations) {
				invocation.inputHash = hashDepartmentMeetingInvocationRequest(
					this.toOwnerRequest(invocation),
				);
				await this.meetings.saveInvocation(invocation, ctx);
			}
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'started',
					targetId: null,
					state: 'collecting',
					summary: 'Meeting briefing and participants frozen.',
					meetingVersion: nextVersion,
				}),
				ctx,
			);
			const result = {
				...toCommandResult(
					{ ...meeting, state: 'collecting', version: nextVersion },
					dto.requestId,
				),
				status: 'pending' as const,
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.start',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return { result, invocations };
		});
		for (const invocation of startResult.invocations) {
			await this.dispatchInvocation(invocation);
		}
		return startResult.result;
	}

	async retryParticipant(
		projectId: string,
		departmentId: string,
		meetingId: string,
		participantId: string,
		actorId: string,
		dto: RetryAiDepartmentMeetingDto,
	) {
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			participantId,
			operation: 'meeting.participant.retry',
			...dto,
		});
		const retried = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.participant.retry',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed')
				return { result: safeReplay(receipt.receipt.responseJson, true), invocation: null };

			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'collecting' || meeting.frozenContributionIds !== null)
				throw new ConflictError('Participant retries are only available during collection.');
			if (actorId !== meeting.executionActorId)
				throw new ConflictError('Takeover is required before this coordinator can retry.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			if (!meeting.collectionDeadlineAt || meeting.collectionDeadlineAt <= new Date())
				throw new ConflictError('The collection deadline has passed.');
			const participant = await this.meetings.findParticipant(
				projectId,
				departmentId,
				meetingId,
				participantId,
				ctx,
			);
			if (!participant) throw new NotFoundError('Meeting participant not found.');
			if (participant.responseState === 'excluded')
				throw new ConflictError('This participant cannot be retried.');
			if (
				(await this.meetings.listContributions(projectId, departmentId, meetingId, ctx)).some(
					(contribution) => contribution.participantId === participantId,
				)
			)
				throw new ConflictError('A submitted contribution cannot be retried.');
			const invocations = (
				await this.meetings.listMeetingInvocations(projectId, departmentId, meetingId, ctx)
			).filter(
				(invocation) =>
					invocation.participantId === participantId && invocation.kind === 'contribution',
			);
			const latest = invocations.at(-1);
			if (invocations.some((invocation) => invocation.retryOfInvocationId !== null))
				throw new ConflictError('Only one participant retry is allowed.');
			if (!latest || !['failed', 'unavailable'].includes(latest.state))
				throw new ConflictError('Retry requires a terminal failed invocation.');
			if (!latest.executorId || latest.bindingVersion === null)
				throw new ConflictError('The original executor binding is unavailable.');
			const invocation = Object.assign(new AiDepartmentMeetingInvocation(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				participantId,
				kind: 'contribution' as const,
				requestKey: randomUUID(),
				inputHash: '',
				contextRef: latest.contextRef,
				actorId: meeting.executionActorId,
				memberId: participant.memberId,
				executorId: latest.executorId,
				bindingVersion: latest.bindingVersion,
				ownerInvocationRef: null,
				state: 'reserved' as const,
				ownerSequence: null,
				deadlineAt: meeting.collectionDeadlineAt,
				terminalAt: null,
				retryOfInvocationId: latest.id,
				safeFailureCode: null,
				safeFailureSummary: null,
				stopCommandId: null,
			});
			invocation.inputHash = hashDepartmentMeetingInvocationRequest(
				this.toOwnerRequest(invocation),
			);
			await this.meetings.saveInvocation(invocation, ctx);
			await this.meetings.updateParticipantResponse(
				projectId,
				meetingId,
				participantId,
				'pending',
				ctx,
			);
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				meeting.version,
				{ version: meeting.version + 1 },
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'participant_retry_requested',
					targetId: participantId,
					state: 'reserved',
					summary: 'Coordinator requested one retry after a terminal failure.',
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const result = {
				meetingId,
				meetingVersion: meeting.version + 1,
				state: meeting.state,
				status: 'pending' as const,
				requestId: dto.requestId,
				invocations: [],
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.participant.retry',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return { result, invocation };
		});
		if (retried.invocation) await this.dispatchInvocation(retried.invocation);
		return retried.result;
	}

	async retrySynthesis(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: RetryAiDepartmentMeetingDto,
	) {
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			operation: 'meeting.synthesis.retry',
			...dto,
		});
		const retried = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.synthesis.retry',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed')
				return { result: safeReplay(receipt.receipt.responseJson, true), invocation: null };

			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (
				meeting.state !== 'review' ||
				!meeting.frozenContributionIds ||
				meeting.frozenContributionIds.length === 0
			)
				throw new ConflictError('Synthesis can only be retried after collection closes.');
			if (actorId !== meeting.executionActorId)
				throw new ConflictError('Takeover is required before this coordinator can retry.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const invocations = await this.meetings.listMeetingInvocations(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const synthesisInvocations = invocations.filter(({ kind }) => kind === 'synthesis');
			const latest = synthesisInvocations.at(-1);
			if (synthesisInvocations.some(({ retryOfInvocationId }) => retryOfInvocationId !== null))
				throw new ConflictError('Only one synthesis retry is allowed.');
			if (!latest || !['failed', 'unavailable'].includes(latest.state))
				throw new ConflictError('Retry requires a terminal failed synthesis.');
			if (!latest.executorId || latest.bindingVersion === null)
				throw new ConflictError('The original facilitator binding is unavailable.');
			const retry = Object.assign(new AiDepartmentMeetingInvocation(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				participantId: latest.participantId,
				kind: 'synthesis' as const,
				requestKey: randomUUID(),
				inputHash: '',
				contextRef: latest.contextRef,
				actorId: meeting.executionActorId,
				memberId: latest.memberId,
				executorId: latest.executorId,
				bindingVersion: latest.bindingVersion,
				ownerInvocationRef: null,
				state: 'reserved' as const,
				ownerSequence: null,
				deadlineAt: new Date(Date.now() + 5 * 60_000),
				terminalAt: null,
				retryOfInvocationId: latest.id,
				safeFailureCode: null,
				safeFailureSummary: null,
				stopCommandId: null,
			});
			retry.inputHash = hashDepartmentMeetingInvocationRequest(this.toOwnerRequest(retry));
			await this.meetings.saveInvocation(retry, ctx);
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				meeting.version,
				{ state: 'synthesizing', version: meeting.version + 1 },
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'synthesis_retry_requested',
					targetId: retry.id,
					state: 'reserved',
					summary: 'Coordinator requested one synthesis retry after a terminal failure.',
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const result = {
				meetingId,
				meetingVersion: meeting.version + 1,
				state: 'synthesizing' as const,
				status: 'pending' as const,
				requestId: dto.requestId,
				invocations: [],
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.synthesis.retry',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return { result, invocation: retry };
		});
		if (retried.invocation) await this.dispatchInvocation(retried.invocation);
		return retried.result;
	}

	async cancel(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: CancelAiDepartmentMeetingDto,
	) {
		const result = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state === 'cancelled' || meeting.state === 'cancelling')
				return {
					meeting,
					invocations: await this.meetings.listMeetingInvocations(
						projectId,
						departmentId,
						meetingId,
						ctx,
					),
				};
			if (!['collecting', 'synthesizing', 'review'].includes(meeting.state))
				throw new ConflictError('This meeting cannot be cancelled in its current state.');
			const changed = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				meeting.version,
				{ state: 'cancelling', version: meeting.version + 1 },
				ctx,
			);
			if (changed.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'cancellation_requested',
					targetId: null,
					state: 'cancelling',
					summary: 'Meeting cancellation is waiting for owner confirmation.',
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			return {
				meeting: { ...meeting, state: 'cancelling' as const, version: meeting.version + 1 },
				invocations: await this.meetings.listMeetingInvocations(
					projectId,
					departmentId,
					meetingId,
					ctx,
				),
			};
		});
		for (const invocation of result.invocations) await this.cancelInvocation(invocation);
		await this.finalizeCancellation(projectId, departmentId, meetingId);
		const current = await this.meetings.findMeeting(projectId, departmentId, meetingId, {});
		return {
			meetingId,
			meetingVersion: current?.version ?? result.meeting.version,
			state: current?.state ?? 'cancelling',
			status: 'accepted' as const,
			requestId: dto.requestId,
			invocations: [],
		};
	}

	private async cancelInvocation(invocation: AiDepartmentMeetingInvocation) {
		if (['succeeded', 'failed', 'unavailable', 'cancelled'].includes(invocation.state)) return;
		const command =
			invocation.stopCommandId ??
			createHash('sha256')
				.update(`${invocation.projectId}:${invocation.meetingId}:${invocation.id}:cancel`)
				.digest('hex')
				.slice(0, 36);
		await this.txRunner.run({}, async (ctx) => {
			const current = await this.meetings.findInvocation(
				invocation.projectId,
				invocation.departmentId,
				invocation.meetingId,
				invocation.id,
				ctx,
			);
			if (!current || current.stopCommandId) return;
			current.stopCommandId = command;
			current.state = 'stop_pending';
			await this.meetings.saveInvocation(current, ctx);
		});
		try {
			const response = await this.invocationOwner.requestStop({
				projectId: invocation.projectId,
				invocationId: invocation.id,
				actorId: invocation.actorId,
				requestKey: invocation.requestKey,
				expectedInputHash: invocation.inputHash,
				...(invocation.ownerInvocationRef
					? { ownerInvocationRef: invocation.ownerInvocationRef }
					: {}),
				commandId: command,
			});
			if (response.confirmedTerminal && !invocation.ownerInvocationRef) {
				await this.txRunner.run({}, async (ctx) => {
					const current = await this.meetings.findInvocation(
						invocation.projectId,
						invocation.departmentId,
						invocation.meetingId,
						invocation.id,
						ctx,
					);
					if (!current || current.ownerInvocationRef || current.state !== 'stop_pending') return;
					current.state = 'cancelled';
					current.terminalAt = new Date();
					await this.meetings.saveInvocation(current, ctx);
				});
			}
		} catch {
			// Reconciliation retries the same durable cancellation command.
		}
	}

	private async finalizeCancellation(projectId: string, departmentId: string, meetingId: string) {
		await this.txRunner.run({}, async (ctx) => {
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting || meeting.state !== 'cancelling') return;
			const invocations = await this.meetings.listMeetingInvocations(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			if (
				invocations.some(
					({ state }) => !['succeeded', 'failed', 'unavailable', 'cancelled'].includes(state),
				)
			)
				return;
			const changed = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				meeting.version,
				{ state: 'cancelled', version: meeting.version + 1, completedAt: new Date() },
				ctx,
			);
			if (changed.affected === 1)
				await this.meetings.appendActivity(
					Object.assign(new AiDepartmentMeetingActivity(), {
						id: randomUUID(),
						projectId,
						departmentId,
						meetingId,
						actorId: null,
						action: 'cancelled',
						targetId: null,
						state: 'cancelled',
						summary: 'All meeting invocations reached a terminal state.',
						meetingVersion: meeting.version + 1,
					}),
					ctx,
				);
		});
	}

	private toOwnerRequest(
		invocation: AiDepartmentMeetingInvocation,
	): Omit<DepartmentMeetingInvocationRequest, 'expectedInputHash'> {
		return {
			schemaVersion: 1,
			projectId: invocation.projectId,
			departmentId: invocation.departmentId,
			meetingId: invocation.meetingId,
			participantId: invocation.participantId,
			invocationId: invocation.id,
			round: invocation.kind === 'synthesis' ? 'synthesis' : 'contribution',
			actorId: invocation.actorId,
			memberId: invocation.memberId,
			executorId: invocation.executorId,
			bindingVersion: invocation.bindingVersion,
			requestKey: invocation.requestKey,
			contextRef: invocation.contextRef,
			inputText: '',
			maxOutputChars: 4_000,
			maxOutputTokens: 1_000,
			toolPolicy: { mode: 'supplied-material-only' },
			deadlineAt: invocation.deadlineAt?.toISOString() ?? new Date(0).toISOString(),
		};
	}

	private async dispatchInvocation(invocation: AiDepartmentMeetingInvocation) {
		const requestIdentity = this.toOwnerRequest(invocation);
		const request: DepartmentMeetingInvocationRequest = {
			...requestIdentity,
			expectedInputHash: invocation.inputHash,
		};
		let result: Awaited<ReturnType<DepartmentMeetingInvocationOwnerProxy['lookup']>>;
		let rejectedCode: string | null = null;
		try {
			result = await this.invocationOwner.lookup({
				projectId: invocation.projectId,
				invocationId: invocation.id,
				requestKey: invocation.requestKey,
				expectedInputHash: invocation.inputHash,
			});
			if (result.kind === 'absent' || result.kind === 'unknown') {
				const dispatched = await this.invocationOwner.dispatch(request);
				if (dispatched.kind === 'rejected') rejectedCode = dispatched.code;
				result =
					dispatched.kind === 'accepted'
						? { kind: 'accepted', ownerInvocationRef: dispatched.ownerInvocationRef }
						: dispatched.kind === 'unknown'
							? { kind: 'unknown' }
							: { kind: 'conflict' };
			}
		} catch {
			result = { kind: 'unknown' };
		}
		let finalizeCancellation = false;
		await this.txRunner.run({}, async (ctx) => {
			await this.meetings.acquireDepartmentAdmissionFence(
				invocation.projectId,
				invocation.departmentId,
				ctx,
			);
			const current = await this.meetings.findInvocation(
				invocation.projectId,
				invocation.departmentId,
				invocation.meetingId,
				invocation.id,
				ctx,
			);
			if (!current || current.ownerInvocationRef !== null) return;
			if (
				current.state === 'stop_pending' &&
				result.kind === 'conflict' &&
				rejectedCode === 'cancelled'
			) {
				current.state = 'cancelled';
				current.terminalAt = new Date();
				current.safeFailureCode = 'cancelled_before_enqueue';
				await this.meetings.saveInvocation(current, ctx);
				if (current.kind === 'contribution') {
					const participant = await this.meetings.findParticipant(
						current.projectId,
						current.departmentId,
						current.meetingId,
						current.participantId,
						ctx,
					);
					if (participant && participant.responseState !== 'excluded')
						await this.meetings.updateParticipantResponse(
							current.projectId,
							current.meetingId,
							current.participantId,
							'failed',
							ctx,
						);
				}
				const meeting = await this.meetings.findMeeting(
					current.projectId,
					current.departmentId,
					current.meetingId,
					ctx,
				);
				finalizeCancellation = meeting?.state === 'cancelling';
				return;
			}
			if (!['reserved', 'unknown'].includes(current.state)) return;
			if (result.kind === 'accepted') {
				current.ownerInvocationRef = result.ownerInvocationRef;
				current.state = 'queued';
			} else if (result.kind === 'unknown') {
				current.state = 'unknown';
			} else {
				current.state = 'unavailable';
				current.safeFailureCode = rejectedCode ?? 'owner_conflict';
			}
			await this.meetings.saveInvocation(current, ctx);
			const currentParticipant =
				current.kind === 'contribution'
					? await this.meetings.findParticipant(
							current.projectId,
							current.departmentId,
							current.meetingId,
							current.participantId,
							ctx,
						)
					: null;
			if (current.kind === 'contribution' && currentParticipant?.responseState !== 'excluded')
				await this.meetings.updateParticipantResponse(
					current.projectId,
					current.meetingId,
					current.participantId,
					current.state === 'queued'
						? 'queued'
						: current.state === 'unknown'
							? 'unknown'
							: 'unavailable',
					ctx,
				);
			if (current.kind === 'synthesis' && current.state === 'unavailable') {
				const meeting = await this.meetings.findMeeting(
					current.projectId,
					current.departmentId,
					current.meetingId,
					ctx,
				);
				if (meeting?.state === 'synthesizing') {
					const update = await this.meetings.updateMeeting(
						current.projectId,
						current.departmentId,
						current.meetingId,
						meeting.version,
						{ state: 'review', version: meeting.version + 1 },
						ctx,
					);
					if (update.affected === 1)
						await this.meetings.appendActivity(
							Object.assign(new AiDepartmentMeetingActivity(), {
								id: randomUUID(),
								projectId: current.projectId,
								departmentId: current.departmentId,
								meetingId: current.meetingId,
								actorId: null,
								action: 'synthesis_unavailable',
								targetId: current.id,
								state: 'review',
								summary: 'Synthesis is unavailable. Coordinator minutes can be entered.',
								meetingVersion: meeting.version + 1,
							}),
							ctx,
						);
				}
			}
		});
		if (finalizeCancellation)
			await this.finalizeCancellation(
				invocation.projectId,
				invocation.departmentId,
				invocation.meetingId,
			);
		return true;
	}

	async excludeParticipant(
		projectId: string,
		departmentId: string,
		meetingId: string,
		participantId: string,
		actorId: string,
		dto: ExcludeAiDepartmentMeetingParticipantDto,
	) {
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			participantId,
			operation: 'meeting.participant.exclude',
			...dto,
		});
		const excluded = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.participant.exclude',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed')
				return { result: safeReplay(receipt.receipt.responseJson, true), invocations: [] };

			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'collecting' || meeting.frozenContributionIds !== null)
				throw new ConflictError('Participants can only be excluded before collection closes.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			if (!meeting.collectionDeadlineAt || meeting.collectionDeadlineAt <= new Date())
				throw new ConflictError('The collection deadline has passed.');
			const participant = await this.meetings.findParticipant(
				projectId,
				departmentId,
				meetingId,
				participantId,
				ctx,
			);
			if (!participant) throw new NotFoundError('Meeting participant not found.');
			if (participant.responseState === 'excluded')
				throw new ConflictError('This participant is already excluded.');
			if (
				(await this.meetings.listContributions(projectId, departmentId, meetingId, ctx)).some(
					(contribution) => contribution.participantId === participantId,
				)
			)
				throw new ConflictError('A participant with an accepted contribution cannot be excluded.');
			const changed = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				meeting.version,
				{ version: meeting.version + 1 },
				ctx,
			);
			if (changed.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.excludeParticipant(
				projectId,
				departmentId,
				meetingId,
				participantId,
				dto.reason,
				ctx,
			);
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'participant_excluded',
					targetId: participantId,
					state: 'excluded',
					summary: 'Coordinator excluded a participant before collection closed.',
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const result = {
				meetingId,
				meetingVersion: meeting.version + 1,
				state: meeting.state,
				status: 'accepted' as const,
				requestId: dto.requestId,
				invocations: [],
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.participant.exclude',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return {
				result,
				invocations: (
					await this.meetings.listMeetingInvocations(projectId, departmentId, meetingId, ctx)
				).filter(({ participantId: id, kind }) => id === participantId && kind === 'contribution'),
			};
		});
		for (const invocation of excluded.invocations) await this.cancelInvocation(invocation);
		return excluded.result;
	}

	async takeover(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: TakeoverAiDepartmentMeetingDto,
	) {
		const hash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			operation: 'meeting.takeover',
			...dto,
		});
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			await this.requireDepartment(projectId, departmentId, ctx);
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: hash,
					operation: 'meeting.takeover',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (receipt?.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (!receipt)
				throw new ConflictError('Could not reserve this command. Retry with the same request ID.');
			if (receipt.kind === 'replayed') return safeReplay(receipt.receipt.responseJson, true);

			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (!['draft', 'collecting', 'synthesizing', 'review', 'approved'].includes(meeting.state))
				throw new ConflictError('Execution cannot be taken over in this meeting state.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const changedActor = meeting.executionActorId !== actorId;
			if (changedActor) {
				const update = await this.meetings.updateMeeting(
					projectId,
					departmentId,
					meetingId,
					meeting.version,
					{ executionActorId: actorId, version: meeting.version + 1 },
					ctx,
				);
				if (update.affected !== 1)
					throw new ConflictError('Meeting has changed. Reload and try again.');
				await this.meetings.appendActivity(
					Object.assign(new AiDepartmentMeetingActivity(), {
						id: randomUUID(),
						projectId,
						departmentId,
						meetingId,
						actorId,
						action: 'execution_taken_over',
						targetId: meeting.executionActorId,
						state: meeting.state,
						summary: 'Coordinator took responsibility for future meeting invocations.',
						meetingVersion: meeting.version + 1,
					}),
					ctx,
				);
			}
			const result = {
				meetingId,
				meetingVersion: meeting.version + (changedActor ? 1 : 0),
				state: meeting.state,
				status: 'accepted' as const,
				requestId: dto.requestId,
				invocations: [],
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				'meeting.takeover',
				hash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	async convertActionItem(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		actorId: string,
		dto: ResolveAiDepartmentMeetingActionItemDto,
	) {
		const commandHash = payloadHash({
			projectId,
			departmentId,
			meetingId,
			itemId,
			actorId,
			operation: 'meeting.action-item.convert',
			...dto,
		});
		const reservation = await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: commandHash,
					operation: 'meeting.action-item.convert',
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (!receipt || receipt.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');

			if (receipt.kind === 'replayed') {
				if (receipt.receipt.status === 'completed')
					return { replay: safeReplay(receipt.receipt.responseJson, true) };
				const pendingItem = await this.meetings.findActionItem(
					projectId,
					departmentId,
					meetingId,
					itemId,
					ctx,
				);
				if (
					!pendingItem ||
					pendingItem.state !== 'conversion_pending' ||
					pendingItem.conversionRequestId !== dto.requestId
				)
					throw new ConflictError('Action item conversion is no longer pending.');
				if (meeting.state !== 'approved')
					throw new ConflictError('Meeting is no longer approved for work conversion.');
				return { actorId, pendingItem };
			}

			if (meeting.state !== 'approved')
				throw new ConflictError('Approve the meeting minutes before creating work.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const item = await this.meetings.findActionItem(
				projectId,
				departmentId,
				meetingId,
				itemId,
				ctx,
			);
			if (!item) throw new NotFoundError('Action item not found.');
			if (item.state !== 'approved')
				throw new ConflictError('Only approved action items can create work.');
			const minutes = await this.meetings.findMinutesRevision(
				projectId,
				departmentId,
				meetingId,
				item.minutesId,
				ctx,
			);
			if (!minutes || minutes.state !== 'approved')
				throw new ConflictError('Approve the action item minutes before creating work.');
			if (item.assigneeMemberId) {
				const members = await this.directory.listMembers(projectId, departmentId, false, ctx);
				if (!members.some(({ id }) => id === item.assigneeMemberId))
					throw new UserError('The action item assignee must be an active department member.');
			}
			const workPayload = actionItemWorkPayload(departmentId, item);
			const workHash = payloadHash(workPayload.input);
			const reserved = await this.meetings.reserveActionItemConversion(
				projectId,
				departmentId,
				meetingId,
				itemId,
				dto.requestId,
				workHash,
				ctx,
			);
			if (reserved.affected !== 1)
				throw new ConflictError('Action item conversion has already started.');
			const version = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{ version: meeting.version + 1 },
				ctx,
			);
			if (version.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			return {
				actorId,
				pendingItem: {
					...item,
					state: 'conversion_pending' as const,
					payloadHash: workHash,
				},
			};
		});
		if ('replay' in reservation) return reservation.replay;
		return await this.processActionItemConversion({
			projectId,
			departmentId,
			meetingId,
			itemId,
			requestId: dto.requestId,
			actorId: reservation.actorId,
			item: reservation.pendingItem,
			commandHash,
		});
	}

	async saveMinutes(
		projectId: string,
		departmentId: string,
		meetingId: string,
		actorId: string,
		dto: SaveAiDepartmentMeetingMinutesDto,
	) {
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			const operation = 'meeting.minutes.save';
			const commandHash = payloadHash({
				projectId,
				departmentId,
				meetingId,
				actorId,
				operation,
				...dto,
			});
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: commandHash,
					operation,
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (!receipt || receipt.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (receipt.kind === 'replayed') return safeReplay(receipt.receipt.responseJson, true);
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'review' || !meeting.frozenContributionIds)
				throw new ConflictError('Meeting is not ready for minutes review.');
			if (meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			const allowed = new Set(meeting.frozenContributionIds);
			const contributions = await this.meetings.listContributions(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const contributionById = new Map(contributions.map((item) => [item.id, item]));
			const citations = [
				...dto.sourceContributionIds,
				...dto.decisions.flatMap(({ sourceContributionIds }) => sourceContributionIds),
				...dto.actionItems.flatMap(({ sourceContributionIds }) => sourceContributionIds),
				...dto.disagreements.flatMap(({ positions }) =>
					positions.map(({ contributionId }) => contributionId),
				),
			];
			if (citations.some((id) => !allowed.has(id)))
				throw new UserError('Minutes can cite only frozen contributions.');
			if (
				dto.disagreements.some(({ positions }) => {
					const participants = new Set(
						positions.map(
							({ contributionId }) => contributionById.get(contributionId)?.participantId,
						),
					);
					return participants.has(undefined) || participants.size < 2;
				}) ||
				dto.decisions.some(({ sourceContributionIds }) => sourceContributionIds.length === 0) ||
				dto.actionItems.some(({ sourceContributionIds }) => sourceContributionIds.length === 0)
			)
				throw new UserError('Minutes require valid contribution citations.');
			const revisions = await this.meetings.listMinutes(projectId, departmentId, meetingId, ctx);
			const revision = Math.max(0, ...revisions.map((item) => item.revision)) + 1;
			const minutes = Object.assign(new AiDepartmentMeetingMinutes(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				revision,
				state: 'draft' as const,
				summary: dto.summary,
				sourceContributionIds: dto.sourceContributionIds,
				disagreements: dto.disagreements,
				authoredBy: actorId,
				approvedBy: null,
				approvedAt: null,
			});
			await this.meetings.saveMinutes(minutes, ctx);
			await this.meetings.saveDecisions(
				dto.decisions.map((decision) =>
					Object.assign(new AiDepartmentMeetingDecision(), {
						id: randomUUID(),
						projectId,
						departmentId,
						meetingId,
						minutesId: minutes.id,
						text: decision.text,
						sourceContributionIds: decision.sourceContributionIds,
						state: 'proposed',
						approvedBy: null,
						approvedAt: null,
					}),
				),
				ctx,
			);
			for (const item of dto.actionItems)
				await this.meetings.saveActionItem(
					Object.assign(new AiDepartmentMeetingActionItem(), {
						id: randomUUID(),
						projectId,
						departmentId,
						meetingId,
						minutesId: minutes.id,
						title: item.title,
						description: item.description ?? null,
						assigneeMemberId: item.assigneeMemberId ?? null,
						sourceContributionIds: item.sourceContributionIds,
						state: 'proposed',
						workId: null,
						conversionRequestId: null,
						payloadHash: null,
						resolutionReason: null,
					}),
					ctx,
				);
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{ version: meeting.version + 1 },
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting has changed. Reload and try again.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'minutes_written',
					targetId: minutes.id,
					state: 'draft',
					summary: `Draft minutes revision ${revision} is ready for review.`,
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const result = {
				meetingId,
				meetingVersion: meeting.version + 1,
				minutesId: minutes.id,
				revision,
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				operation,
				commandHash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	async approveMinutes(
		projectId: string,
		departmentId: string,
		meetingId: string,
		minutesId: string,
		actorId: string,
		dto: ResolveAiDepartmentMeetingItemDto,
	) {
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			const operation = 'meeting.minutes.approve';
			const commandHash = payloadHash({
				projectId,
				departmentId,
				meetingId,
				minutesId,
				actorId,
				operation,
				...dto,
			});
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: commandHash,
					operation,
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (!receipt || receipt.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (receipt.kind === 'replayed') return safeReplay(receipt.receipt.responseJson, true);
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'review' || meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting changed or is not ready for approval.');
			const revisions = await this.meetings.listMinutes(projectId, departmentId, meetingId, ctx);
			const revision = revisions.find((item) => item.id === minutesId);
			if (!revision || revision.state !== 'draft')
				throw new ConflictError('Only draft minutes can be approved.');
			const approvedAt = new Date();
			if (
				(
					await this.meetings.approveMinutes(
						projectId,
						departmentId,
						meetingId,
						minutesId,
						actorId,
						approvedAt,
						ctx,
					)
				).affected !== 1
			)
				throw new ConflictError('Minutes changed before approval.');
			await this.meetings.approveProposedDecisions(
				projectId,
				departmentId,
				meetingId,
				minutesId,
				actorId,
				approvedAt,
				ctx,
			);
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{ state: 'approved', version: meeting.version + 1 },
				ctx,
			);
			if (update.affected !== 1) throw new ConflictError('Meeting changed before approval.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: 'minutes_approved',
					targetId: minutesId,
					state: 'approved',
					summary: `Minutes revision ${revision.revision} was approved.`,
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const completed = await this.completeMeetingIfResolved(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const result = {
				meetingId,
				meetingVersion: meeting.version + 1 + Number(completed),
				minutesId,
				state: completed ? ('completed' as const) : ('approved' as const),
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				operation,
				commandHash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	async resolveActionItem(
		projectId: string,
		departmentId: string,
		meetingId: string,
		itemId: string,
		actorId: string,
		dto: ResolveAiDepartmentMeetingItemDto,
		resolution: 'approve' | 'decline',
	) {
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(projectId, departmentId, ctx);
			const operation = `meeting.action-item.${resolution}`;
			const commandHash = payloadHash({
				projectId,
				departmentId,
				meetingId,
				itemId,
				actorId,
				operation,
				...dto,
			});
			const receipt = await this.meetings.createOrReadCommandReceipt(
				{
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash: commandHash,
					operation,
					status: 'pending',
					responseJson: null,
					createdAt: new Date(),
				},
				ctx,
			);
			if (!receipt || receipt.kind === 'conflict')
				throw new ConflictError('Request ID was already used for a different command.');
			if (receipt.kind === 'replayed') return safeReplay(receipt.receipt.responseJson, true);
			const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			if (meeting.state !== 'approved' || meeting.version !== dto.expectedVersion)
				throw new ConflictError('Meeting changed or is not ready for action-item review.');
			const item = await this.meetings.findActionItem(
				projectId,
				departmentId,
				meetingId,
				itemId,
				ctx,
			);
			if (!item || item.state !== 'proposed')
				throw new ConflictError('Action item is no longer proposed.');
			const state = resolution === 'approve' ? 'approved' : 'declined';
			const resolvedAt = new Date();
			const result = await this.meetings.resolveActionItem(
				projectId,
				departmentId,
				meetingId,
				itemId,
				state,
				actorId,
				resolvedAt,
				resolution === 'decline' ? (dto.reason ?? null) : null,
				ctx,
			);
			if (result.affected !== 1) throw new ConflictError('Action item changed during review.');
			const update = await this.meetings.updateMeeting(
				projectId,
				departmentId,
				meetingId,
				dto.expectedVersion,
				{ version: meeting.version + 1 },
				ctx,
			);
			if (update.affected !== 1)
				throw new ConflictError('Meeting changed during action-item review.');
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					actorId,
					action: resolution === 'approve' ? 'action_item_approved' : 'action_item_declined',
					targetId: itemId,
					state,
					summary:
						resolution === 'approve'
							? 'Action item approved for backlog creation.'
							: 'Action item declined by coordinator.',
					meetingVersion: meeting.version + 1,
				}),
				ctx,
			);
			const completed = await this.completeMeetingIfResolved(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			const response = {
				meetingId,
				meetingVersion: meeting.version + 1 + Number(completed),
				actionItemId: itemId,
				state: completed ? ('completed' as const) : state,
			};
			await this.meetings.completeCommandReceipt(
				projectId,
				actorId,
				dto.requestId,
				operation,
				commandHash,
				JSON.stringify(response),
				ctx,
			);
			return response;
		});
	}

	private async processActionItemConversion(input: {
		projectId: string;
		departmentId: string;
		meetingId: string;
		itemId: string;
		requestId: string;
		actorId: string;
		item: AiDepartmentMeetingActionItem;
		commandHash: string;
	}) {
		const workPayload = actionItemWorkPayload(input.departmentId, input.item);
		const workHash = payloadHash(workPayload.input);
		if (input.item.payloadHash !== workHash)
			return await this.finishConversionRecovery(
				input,
				'Action item payload changed during conversion.',
			);
		const workRequest = workRequestId(input.projectId, input.actorId, input.requestId);
		const lookup = await this.work.lookupCreateCommand(input.projectId, input.actorId, workRequest);
		if (lookup.kind === 'found') {
			if (lookup.payloadHash !== workHash)
				return await this.finishConversionRecovery(input, 'Work command payload did not match.');
			return await this.finishActionItemConversion(input, lookup.work.id);
		}
		if (lookup.kind === 'conflict')
			return await this.finishConversionRecovery(input, 'Work request ID is in conflict.');

		try {
			const created = await this.work.createWork(
				input.projectId,
				input.actorId,
				input.departmentId,
				workPayload.toDto(workRequest),
			);
			return await this.finishActionItemConversion(input, created.id);
		} catch {
			const afterCreate = await this.work.lookupCreateCommand(
				input.projectId,
				input.actorId,
				workRequest,
			);
			if (afterCreate.kind === 'found' && afterCreate.payloadHash === workHash)
				return await this.finishActionItemConversion(input, afterCreate.work.id);
			if (afterCreate.kind === 'conflict' || afterCreate.kind === 'found')
				return await this.finishConversionRecovery(input, 'Work request ID is in conflict.');
			return { meetingId: input.meetingId, actionItemId: input.itemId, state: 'pending' as const };
		}
	}

	private async finishActionItemConversion(
		input: Parameters<MeetingService['processActionItemConversion']>[0],
		workId: string,
	) {
		return await this.txRunner.run({}, async (ctx) => {
			await this.requireDepartment(input.projectId, input.departmentId, ctx);
			const meeting = await this.meetings.findMeeting(
				input.projectId,
				input.departmentId,
				input.meetingId,
				ctx,
			);
			if (!meeting) throw new NotFoundError('Meeting not found.');
			const item = await this.meetings.findActionItem(
				input.projectId,
				input.departmentId,
				input.meetingId,
				input.itemId,
				ctx,
			);
			if (item?.state === 'converted' && item.workId === workId)
				return {
					meetingId: input.meetingId,
					actionItemId: input.itemId,
					state: 'converted' as const,
					workId,
				};
			if (meeting.state !== 'approved')
				return await this.markConversionRecovery(
					input,
					'Meeting approval changed during conversion.',
					ctx,
				);
			const completed = await this.meetings.completeActionItemConversion(
				input.projectId,
				input.departmentId,
				input.meetingId,
				input.itemId,
				input.requestId,
				workId,
				ctx,
			);
			if (completed.affected !== 1)
				return await this.markConversionRecovery(
					input,
					'The action item changed during conversion.',
					ctx,
				);
			const result = {
				meetingId: input.meetingId,
				actionItemId: input.itemId,
				state: 'converted' as const,
				workId,
				requestId: input.requestId,
			};
			await this.meetings.appendActivity(
				Object.assign(new AiDepartmentMeetingActivity(), {
					id: randomUUID(),
					projectId: input.projectId,
					departmentId: input.departmentId,
					meetingId: input.meetingId,
					actorId: input.actorId,
					action: 'action_item_converted',
					targetId: input.itemId,
					state: 'converted',
					summary: 'Approved action item created as backlog work.',
					meetingVersion: meeting.version,
				}),
				ctx,
			);
			await this.completeMeetingIfResolved(
				input.projectId,
				input.departmentId,
				input.meetingId,
				ctx,
			);
			await this.meetings.completeCommandReceipt(
				input.projectId,
				input.actorId,
				input.requestId,
				'meeting.action-item.convert',
				input.commandHash,
				JSON.stringify(result),
				ctx,
			);
			return result;
		});
	}

	private async completeMeetingIfResolved(
		projectId: string,
		departmentId: string,
		meetingId: string,
		ctx: OperationContext,
	) {
		const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
		if (!meeting || meeting.state !== 'approved') return false;
		const [items, invocations, minutes] = await Promise.all([
			this.meetings.listActionItems(projectId, departmentId, meetingId, ctx),
			this.meetings.listMeetingInvocations(projectId, departmentId, meetingId, ctx),
			this.meetings.listMinutes(projectId, departmentId, meetingId, ctx),
		]);
		const approvedMinutesIds = new Set(
			minutes.filter(({ state }) => state === 'approved').map(({ id }) => id),
		);
		const unresolved = items.some(
			({ minutesId, state }) =>
				approvedMinutesIds.has(minutesId) &&
				['proposed', 'approved', 'conversion_pending', 'recovery_required'].includes(state),
		);
		const activeInvocation = invocations.some(
			({ state }) => !['succeeded', 'failed', 'unavailable', 'cancelled'].includes(state),
		);
		if (unresolved || activeInvocation) return false;
		const now = new Date();
		const updated = await this.meetings.updateMeeting(
			projectId,
			departmentId,
			meetingId,
			meeting.version,
			{ state: 'completed', version: meeting.version + 1, completedAt: now },
			ctx,
		);
		if (updated.affected !== 1) return false;
		await this.meetings.appendActivity(
			Object.assign(new AiDepartmentMeetingActivity(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				actorId: null,
				action: 'completed',
				targetId: null,
				state: 'completed',
				summary: 'All approved meeting actions are resolved.',
				meetingVersion: meeting.version + 1,
			}),
			ctx,
		);
		return true;
	}

	private async finishConversionRecovery(
		input: Parameters<MeetingService['processActionItemConversion']>[0],
		reason: string,
	) {
		return await this.txRunner.run(
			{},
			async (ctx) => await this.markConversionRecovery(input, reason, ctx),
		);
	}

	private async markConversionRecovery(
		input: Parameters<MeetingService['processActionItemConversion']>[0],
		reason: string,
		ctx: OperationContext,
	) {
		await this.meetings.markActionItemConversionRecoveryRequired(
			input.projectId,
			input.departmentId,
			input.meetingId,
			input.itemId,
			input.requestId,
			ctx,
		);
		const result = {
			meetingId: input.meetingId,
			actionItemId: input.itemId,
			state: 'recovery_required',
			reason,
		};
		await this.meetings.completeCommandReceipt(
			input.projectId,
			input.actorId,
			input.requestId,
			'meeting.action-item.convert',
			input.commandHash,
			JSON.stringify(result),
			ctx,
		);
		return result;
	}

	async reconcileInvocation(
		projectId: string,
		departmentId: string,
		meetingId: string,
		invocationId: string,
	) {
		const invocation = await this.meetings.findInvocation(
			projectId,
			departmentId,
			meetingId,
			invocationId,
			{},
		);
		if (!invocation) return false;
		const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, {});
		if (meeting?.state === 'cancelling') {
			await this.cancelInvocation(invocation);
			if (!invocation.ownerInvocationRef) {
				await this.finalizeCancellation(projectId, departmentId, meetingId);
				return true;
			}
		}
		if (!invocation.ownerInvocationRef) {
			if (invocation.state === 'reserved' || invocation.state === 'unknown')
				return await this.dispatchInvocation(invocation);
			return false;
		}
		if (
			!['stop_pending', 'succeeded', 'failed', 'unavailable', 'cancelled'].includes(
				invocation.state,
			)
		) {
			const [member, binding] = await Promise.all([
				this.directory.findMember(projectId, departmentId, invocation.memberId),
				this.directory.findBinding(projectId, invocation.memberId),
			]);
			if (
				!member ||
				member.archived ||
				!binding ||
				binding.provider !== 'n8n-agent' ||
				binding.executorId !== invocation.executorId ||
				binding.version !== invocation.bindingVersion
			) {
				await this.cancelInvocation(invocation);
				return true;
			}
		}
		const ownerInvocationRef = invocation.ownerInvocationRef;
		const snapshot = await this.invocationOwner.snapshot({
			projectId,
			invocationId,
			ownerInvocationRef,
		});
		if (snapshot.ownerInvocationRef !== ownerInvocationRef) return false;
		let nextState: AiDepartmentMeetingInvocation['state'] =
			snapshot.phase === 'queued'
				? 'queued'
				: snapshot.phase === 'running'
					? 'running'
					: snapshot.phase === 'stopping'
						? 'stop_pending'
						: snapshot.outcome === 'succeeded'
							? 'succeeded'
							: snapshot.outcome === 'cancelled'
								? 'cancelled'
								: snapshot.outcome === 'failed'
									? 'failed'
									: 'unknown';
		const result =
			nextState === 'succeeded'
				? await this.invocationOwner.readResult({
						projectId,
						invocationId,
						ownerInvocationRef,
						expectedInputHash: invocation.inputHash,
					})
				: null;
		if (
			nextState === 'succeeded' &&
			(!result ||
				result.round !== invocation.kind ||
				result.invocationId !== invocationId ||
				result.participantId !== invocation.participantId ||
				result.sequence !== snapshot.sequence)
		) {
			nextState = 'failed';
		}
		const initialMeeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, {});
		const initialContributions =
			invocation.kind === 'synthesis'
				? await this.meetings.listContributions(projectId, departmentId, meetingId, {})
				: [];
		const synthesis =
			nextState === 'succeeded' &&
			invocation.kind === 'synthesis' &&
			result?.round === 'synthesis' &&
			initialMeeting?.frozenContributionIds
				? parseSynthesisResult(
						result.text,
						initialMeeting.frozenContributionIds,
						initialContributions,
					)
				: null;
		if (nextState === 'succeeded' && invocation.kind === 'synthesis' && !synthesis)
			nextState = 'failed';
		const advanced = await this.txRunner.run({}, async (ctx) => {
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			const currentMeeting = await this.meetings.findMeeting(
				projectId,
				departmentId,
				meetingId,
				ctx,
			);
			if (
				!currentMeeting ||
				(currentMeeting.state !== 'cancelling' &&
					invocation.kind === 'contribution' &&
					currentMeeting.state !== 'collecting' &&
					!(
						currentMeeting.frozenContributionIds !== null &&
						['review', 'approved'].includes(currentMeeting.state)
					)) ||
				(currentMeeting.state !== 'cancelling' &&
					invocation.kind === 'synthesis' &&
					currentMeeting.state !== 'synthesizing')
			)
				return false;
			const currentInvocation = await this.meetings.findInvocation(
				projectId,
				departmentId,
				meetingId,
				invocationId,
				ctx,
			);
			if (
				!currentInvocation ||
				currentInvocation.ownerInvocationRef !== ownerInvocationRef ||
				!/^\d+$/.test(snapshot.sequence) ||
				(currentInvocation.ownerSequence !== null &&
					BigInt(snapshot.sequence) <= BigInt(currentInvocation.ownerSequence))
			)
				return false;
			const changed = await this.meetings.updateInvocationOwnerSnapshot(
				projectId,
				meetingId,
				invocationId,
				ownerInvocationRef,
				snapshot.sequence,
				nextState,
				snapshot.safeErrorCode ?? null,
				ctx,
			);
			if (!changed) return false;
			const participant = await this.meetings.findParticipant(
				projectId,
				departmentId,
				meetingId,
				currentInvocation.participantId,
				ctx,
			);
			const participantCanAdvance =
				currentInvocation.kind === 'contribution' &&
				participant !== null &&
				['pending', 'queued', 'running', 'unknown', 'stop_pending'].includes(
					participant.responseState,
				);
			if (participantCanAdvance && (nextState === 'failed' || nextState === 'cancelled')) {
				await this.meetings.updateParticipantResponse(
					projectId,
					meetingId,
					currentInvocation.participantId,
					'failed',
					ctx,
				);
			}
			if (participantCanAdvance && nextState === 'running') {
				await this.meetings.updateParticipantResponse(
					projectId,
					meetingId,
					currentInvocation.participantId,
					'running',
					ctx,
				);
			}
			if (participantCanAdvance && (nextState === 'unknown' || nextState === 'stop_pending')) {
				await this.meetings.updateParticipantResponse(
					projectId,
					meetingId,
					currentInvocation.participantId,
					nextState,
					ctx,
				);
			}
			if (currentInvocation.kind === 'synthesis') {
				if (nextState === 'succeeded' && result?.round === 'synthesis' && synthesis) {
					await this.persistSynthesisMinutes(currentMeeting, currentInvocation, synthesis, ctx);
				} else if (
					['failed', 'cancelled', 'unavailable'].includes(nextState) &&
					currentMeeting.state !== 'cancelling'
				) {
					const update = await this.meetings.updateMeeting(
						projectId,
						departmentId,
						meetingId,
						currentMeeting.version,
						{ state: 'review', version: currentMeeting.version + 1 },
						ctx,
					);
					if (update.affected === 1)
						await this.meetings.appendActivity(
							Object.assign(new AiDepartmentMeetingActivity(), {
								id: randomUUID(),
								projectId,
								departmentId,
								meetingId,
								actorId: null,
								action: 'synthesis_failed',
								targetId: currentInvocation.id,
								state: 'review',
								summary: 'Synthesis did not produce valid draft minutes.',
								meetingVersion: currentMeeting.version + 1,
							}),
							ctx,
						);
				}
				return true;
			}
			if (currentMeeting.frozenContributionIds !== null) return true;
			if (nextState !== 'succeeded' || currentInvocation.kind !== 'contribution') return true;
			if (!result || result.round !== 'contribution') return false;
			if (!participant || !['queued', 'running', 'unknown'].includes(participant.responseState))
				return false;
			const contribution = Object.assign(new AiDepartmentMeetingContribution(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				participantId: participant.id,
				invocationId,
				contribution: result.contribution,
				sourceContributionIds: [],
				acceptedAt: new Date(),
			});
			const stored = await this.meetings.acceptContribution(contribution, ctx);
			if (!stored || stored.invocationId !== invocationId) return false;
			await this.meetings.updateParticipantResponse(
				projectId,
				meetingId,
				participant.id,
				'submitted',
				ctx,
			);
			await this.freezeCollectionWhenReady(
				projectId,
				departmentId,
				meetingId,
				new Date(),
				false,
				ctx,
			);
			return true;
		});
		if (advanced) await this.dispatchPendingSynthesis(projectId, departmentId, meetingId);
		if (advanced && ['succeeded', 'failed', 'unavailable', 'cancelled'].includes(nextState))
			await this.txRunner.run({}, async (ctx) => {
				await this.completeMeetingIfResolved(projectId, departmentId, meetingId, ctx);
			});
		if (advanced) await this.finalizeCancellation(projectId, departmentId, meetingId);
		return advanced;
	}

	private async persistSynthesisMinutes(
		meeting: AiDepartmentMeeting,
		invocation: AiDepartmentMeetingInvocation,
		synthesis: AiDepartmentMeetingSynthesisResult,
		ctx: OperationContext,
	) {
		const revisions = await this.meetings.listMinutes(
			meeting.projectId,
			meeting.departmentId,
			meeting.id,
			ctx,
		);
		const revision = Math.max(0, ...revisions.map((item) => item.revision)) + 1;
		const minutes = Object.assign(new AiDepartmentMeetingMinutes(), {
			id: randomUUID(),
			projectId: meeting.projectId,
			departmentId: meeting.departmentId,
			meetingId: meeting.id,
			revision,
			state: 'draft' as const,
			summary: synthesis.summary,
			sourceContributionIds: synthesis.sourceContributionIds,
			disagreements: synthesis.disagreements,
			authoredBy: invocation.actorId,
			approvedBy: null,
			approvedAt: null,
		});
		await this.meetings.saveMinutes(minutes, ctx);
		await this.meetings.saveDecisions(
			synthesis.decisions.map((decision) =>
				Object.assign(new AiDepartmentMeetingDecision(), {
					id: randomUUID(),
					projectId: meeting.projectId,
					departmentId: meeting.departmentId,
					meetingId: meeting.id,
					minutesId: minutes.id,
					text: decision.text,
					sourceContributionIds: decision.sourceContributionIds,
					state: 'proposed',
					approvedBy: null,
					approvedAt: null,
				}),
			),
			ctx,
		);
		for (const actionItem of synthesis.actionItems) {
			await this.meetings.saveActionItem(
				Object.assign(new AiDepartmentMeetingActionItem(), {
					id: randomUUID(),
					projectId: meeting.projectId,
					departmentId: meeting.departmentId,
					meetingId: meeting.id,
					minutesId: minutes.id,
					title: actionItem.title,
					description: actionItem.description ?? null,
					assigneeMemberId: actionItem.assigneeMemberId ?? null,
					sourceContributionIds: actionItem.sourceContributionIds,
					state: 'proposed',
					workId: null,
					conversionRequestId: null,
					payloadHash: null,
					resolutionReason: null,
				}),
				ctx,
			);
		}
		const update = await this.meetings.updateMeeting(
			meeting.projectId,
			meeting.departmentId,
			meeting.id,
			meeting.version,
			{ state: 'review', version: meeting.version + 1 },
			ctx,
		);
		if (update.affected !== 1)
			throw new ConflictError('Meeting has changed. Reload and try again.');
		await this.meetings.appendActivity(
			Object.assign(new AiDepartmentMeetingActivity(), {
				id: randomUUID(),
				projectId: meeting.projectId,
				departmentId: meeting.departmentId,
				meetingId: meeting.id,
				actorId: invocation.actorId,
				action: 'minutes_generated',
				targetId: minutes.id,
				state: 'review',
				summary: `Draft minutes revision ${revision} is ready for review.`,
				meetingVersion: meeting.version + 1,
			}),
			ctx,
		);
	}

	async freezeCollectionAtDeadline(projectId: string, departmentId: string, meetingId: string) {
		const closed = await this.txRunner.run({}, async (ctx) => {
			await this.meetings.acquireDepartmentAdmissionFence(projectId, departmentId, ctx);
			return await this.freezeCollectionWhenReady(
				projectId,
				departmentId,
				meetingId,
				new Date(),
				true,
				ctx,
			);
		});
		if (closed) await this.dispatchPendingSynthesis(projectId, departmentId, meetingId);
		return closed;
	}

	private async dispatchPendingSynthesis(
		projectId: string,
		departmentId: string,
		meetingId: string,
	) {
		for (const invocation of await this.meetings.listInvocations(
			projectId,
			departmentId,
			meetingId,
			{},
		)) {
			if (invocation.kind === 'synthesis' && ['reserved', 'unknown'].includes(invocation.state))
				await this.dispatchInvocation(invocation);
		}
	}

	private async freezeCollectionWhenReady(
		projectId: string,
		departmentId: string,
		meetingId: string,
		now: Date,
		deadlineExpired: boolean,
		ctx: Parameters<MeetingRepository['findMeeting']>[3],
	) {
		const meeting = await this.meetings.findMeeting(projectId, departmentId, meetingId, ctx);
		if (!meeting || meeting.state !== 'collecting' || meeting.frozenContributionIds !== null)
			return false;
		const [participants, contributions] = await Promise.all([
			this.meetings.listParticipants(projectId, departmentId, meetingId, ctx),
			this.meetings.listContributions(projectId, departmentId, meetingId, ctx),
		]);
		const quorum = Math.ceil((2 * participants.length) / 3);
		const closeReason =
			contributions.length >= quorum && quorum > 0
				? ('quorum' as const)
				: deadlineExpired &&
						meeting.collectionDeadlineAt !== null &&
						now >= meeting.collectionDeadlineAt
					? ('deadline' as const)
					: null;
		if (!closeReason) return false;
		let synthesisInvocation: AiDepartmentMeetingInvocation | null = null;
		let nextMeetingState: AiDepartmentMeeting['state'] = 'review';
		if (contributions.length > 0) {
			const facilitator = participants.find(
				({ facilitator: isFacilitator, responseState }) =>
					isFacilitator && responseState !== 'excluded',
			);
			if (facilitator?.executorId && facilitator.bindingVersion !== null) {
				const priorInvocations = await this.meetings.listInvocations(
					projectId,
					departmentId,
					meetingId,
					ctx,
				);
				const contextInvocation = priorInvocations.find(
					(invocation) =>
						invocation.participantId === facilitator.id && invocation.kind === 'contribution',
				);
				if (contextInvocation) {
					const deadlineAt = new Date(now.getTime() + 5 * 60_000);
					synthesisInvocation = Object.assign(new AiDepartmentMeetingInvocation(), {
						id: randomUUID(),
						projectId,
						departmentId,
						meetingId,
						participantId: facilitator.id,
						kind: 'synthesis',
						requestKey: randomUUID(),
						inputHash: '',
						contextRef: contextInvocation.contextRef,
						actorId: meeting.executionActorId,
						memberId: facilitator.memberId,
						executorId: facilitator.executorId,
						bindingVersion: facilitator.bindingVersion,
						ownerInvocationRef: null,
						state: 'reserved',
						ownerSequence: null,
						deadlineAt,
						terminalAt: null,
						retryOfInvocationId: null,
						safeFailureCode: null,
						safeFailureSummary: null,
						stopCommandId: null,
					});
					synthesisInvocation.inputHash = hashDepartmentMeetingInvocationRequest(
						this.toOwnerRequest(synthesisInvocation),
					);
					nextMeetingState = 'synthesizing';
				}
			}
		}
		const contributionByParticipant = new Set(
			contributions.map(({ participantId }) => participantId),
		);
		const update = await this.meetings.updateMeeting(
			projectId,
			departmentId,
			meetingId,
			meeting.version,
			{
				state: nextMeetingState,
				frozenContributionIds: contributions.map(({ id }) => id),
				collectionClosedAt: now,
				collectionCloseReason: closeReason,
				absenceSnapshots: participants
					.filter(({ id }) => !contributionByParticipant.has(id))
					.map(({ id, responseState }) => ({
						participantId: id,
						lastKnownState: responseState,
						recordedAt: now.toISOString(),
					})),
				version: meeting.version + 1,
			},
			ctx,
		);
		if (update.affected !== 1) return false;
		if (synthesisInvocation) await this.meetings.saveInvocation(synthesisInvocation, ctx);
		await this.meetings.appendActivity(
			Object.assign(new AiDepartmentMeetingActivity(), {
				id: randomUUID(),
				projectId,
				departmentId,
				meetingId,
				actorId: null,
				action: 'collection_frozen',
				targetId: null,
				state: nextMeetingState,
				summary: `Contribution set frozen at ${contributions.length} responses (${closeReason}).`,
				meetingVersion: meeting.version + 1,
			}),
			ctx,
		);
		return true;
	}

	private async captureSourceRows(
		projectId: string,
		departmentId: string,
		meetingId: string,
		goalId: string | null,
		workIds: string[],
		decisionIds: string[],
		ctx: OperationContext,
	) {
		const references: Array<{ sourceKind: 'goal' | 'work' | 'decision'; sourceId: string }> = [];
		if (goalId) references.push({ sourceKind: 'goal', sourceId: goalId });
		for (const sourceId of workIds) references.push({ sourceKind: 'work', sourceId });
		for (const sourceId of decisionIds) references.push({ sourceKind: 'decision', sourceId });
		const rows: AiDepartmentMeetingSource[] = [];
		for (const reference of references) {
			const snapshot = await this.readCurrentSource(
				projectId,
				departmentId,
				meetingId,
				reference.sourceKind,
				reference.sourceId,
				ctx,
			);
			if (!snapshot) throw new UserError('Meeting source is unavailable or not approved.');
			rows.push(
				Object.assign(new AiDepartmentMeetingSource(), {
					id: randomUUID(),
					projectId,
					departmentId,
					meetingId,
					sourceKind: snapshot.sourceKind,
					sourceId: snapshot.sourceId,
					sourceVersion: snapshot.sourceVersion,
					snapshotRef: randomUUID(),
					contentHash: snapshot.contentHash,
					labelSnapshot: null,
					accessState: 'available',
				}),
			);
		}
		return rows;
	}

	private async assertSourcesCurrent(
		projectId: string,
		departmentId: string,
		meetingId: string,
		sources: AiDepartmentMeetingSource[],
		ctx: OperationContext,
	) {
		for (const source of sources) {
			const current = await this.readCurrentSource(
				projectId,
				departmentId,
				meetingId,
				source.sourceKind,
				source.sourceId,
				ctx,
			);
			if (
				!current ||
				current.sourceVersion !== source.sourceVersion ||
				current.contentHash !== source.contentHash
			)
				throw new UserError('Meeting source changed or is no longer approved.');
		}
	}

	private async readCurrentSource(
		projectId: string,
		departmentId: string,
		meetingId: string,
		sourceKind: AiDepartmentMeetingSource['sourceKind'],
		sourceId: string,
		ctx: OperationContext,
	) {
		if (sourceKind === 'goal' || sourceKind === 'work') {
			return await this.work.readMeetingSourceSnapshot(
				projectId,
				departmentId,
				sourceKind,
				sourceId,
				ctx,
			);
		}
		const approved = await this.meetings.findApprovedDecisionSource(
			projectId,
			departmentId,
			sourceId,
			ctx,
		);
		if (!approved || approved.meeting.id === meetingId) return null;
		const content = [
			`Approved decision: ${approved.decision.text}`,
			`Source meeting: ${approved.meeting.id}`,
			`Minutes revision: ${approved.minutes.revision}`,
			`Approved by: ${approved.decision.approvedBy}`,
		].join('\n');
		const sourceVersion = `${approved.minutes.revision}:${approved.decision.approvedAt?.toISOString()}`;
		return {
			sourceKind,
			sourceId,
			sourceVersion,
			content,
			contentHash: payloadHash({ sourceKind, sourceId, sourceVersion, content }),
		};
	}

	async getCommandStatus(
		projectId: string,
		departmentId: string,
		actorId: string,
		requestId: string,
	): Promise<AiDepartmentMeetingCommandStatusDto> {
		await this.requireDepartment(projectId, departmentId);
		const receipt = await this.meetings.findCommandReceipt(projectId, actorId, requestId, {});
		if (!receipt || !receipt.operation.startsWith('meeting.')) {
			return { requestId, status: 'unknown', meetingId: null };
		}

		if (receipt.status !== 'completed') {
			return { requestId, status: 'pending', meetingId: null };
		}

		let meetingId: string | null = null;
		try {
			const result: unknown = JSON.parse(receipt.responseJson ?? 'null');
			if (
				typeof result === 'object' &&
				result !== null &&
				'meetingId' in result &&
				typeof result.meetingId === 'string'
			) {
				meetingId = result.meetingId;
			}
		} catch {
			meetingId = null;
		}

		if (!meetingId || !(await this.meetings.findMeeting(projectId, departmentId, meetingId, {}))) {
			return { requestId, status: 'unknown', meetingId: null };
		}

		return { requestId, status: 'completed', meetingId };
	}

	private validateParticipants(memberIds: string[] | undefined, facilitatorMemberId?: string) {
		if (!memberIds) return;
		if (new Set(memberIds).size !== memberIds.length)
			throw new UserError('Select each participant only once.');
		if (facilitatorMemberId && !memberIds.includes(facilitatorMemberId))
			throw new UserError('The facilitator must be a participant.');
	}

	private async requireDepartment(
		projectId: string,
		departmentId: string,
		ctx: Parameters<DirectoryRepository['findDepartment']>[2] = {},
	) {
		const department = await this.directory.findDepartment(projectId, departmentId, ctx);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		return department;
	}

	private async loadParticipants(
		projectId: string,
		departmentId: string,
		memberIds: string[],
		ctx: Parameters<DirectoryRepository['listMembers']>[3],
	) {
		const members = await this.directory.listMembers(projectId, departmentId, false, ctx);
		const byId = new Map(members.map((member) => [member.id, member]));
		const selected = memberIds.map((id) => byId.get(id));
		if (selected.some((member) => !member))
			throw new UserError('All participants must be active members of this department.');
		const bindings = await this.directory.listBindings(projectId, memberIds, ctx);
		const bindingByMember = new Map(bindings.map((binding) => [binding.memberId, binding]));
		return selected.map((member) => ({
			member: member!,
			binding: bindingByMember.get(member!.id) ?? null,
		}));
	}

	private toParticipant(
		projectId: string,
		departmentId: string,
		meetingId: string,
		value: Awaited<ReturnType<MeetingService['loadParticipants']>>[number],
		facilitatorMemberId: string,
	) {
		return Object.assign(new AiDepartmentMeetingParticipant(), {
			id: randomUUID(),
			projectId,
			departmentId,
			meetingId,
			memberId: value.member.id,
			memberNameSnapshot: value.member.name,
			roleSnapshot: value.member.role,
			executorId: value.binding?.executorId ?? null,
			bindingVersion: value.binding?.version ?? null,
			facilitator: value.member.id === facilitatorMemberId,
			responseState: 'pending',
			exclusionReason: null,
			version: 1,
		});
	}
}
