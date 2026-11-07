import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS } from '@n8n/api-types';
import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentMeetingContextReader,
	type DepartmentMeetingResolvedContext,
} from '@/modules/agents/agent-department-meeting-invocation.contracts';
import { DirectoryRepository } from './database/repositories/directory.repository';
import { MeetingRepository } from './database/repositories/meeting.repository';
import { createHash } from 'node:crypto';
import { WorkService } from './work/work.service';

function hashBriefing(value: unknown) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Service()
export class MeetingContextReaderService extends DepartmentMeetingContextReader {
	constructor(
		private readonly meetings: MeetingRepository,
		private readonly directory: DirectoryRepository,
		private readonly users: UserRepository,
		private readonly work: WorkService,
	) {
		super();
	}

	async resolve(input: {
		projectId: string;
		departmentId: string;
		meetingId: string;
		participantId: string;
		actorId: string;
		contextRef: string;
		round: 'contribution' | 'synthesis';
	}): Promise<DepartmentMeetingResolvedContext | null> {
		const [meeting, participant, context, department, user] = await Promise.all([
			this.meetings.findMeeting(input.projectId, input.departmentId, input.meetingId, {}),
			this.meetings.findParticipant(
				input.projectId,
				input.departmentId,
				input.meetingId,
				input.participantId,
				{},
			),
			this.meetings.findContextSnapshot(
				input.projectId,
				input.departmentId,
				input.meetingId,
				input.contextRef,
				{},
			),
			this.directory.findDepartment(input.projectId, input.departmentId),
			this.users.findByIdWithRole(input.actorId),
		]);
		if (
			!meeting ||
			!participant ||
			!context ||
			!department ||
			department.archived ||
			!user ||
			user.disabled ||
			!(await userHasScopes(user, ['agent:execute'], false, { projectId: input.projectId })) ||
			meeting.executionActorId !== input.actorId ||
			context.toolPolicy !== 'supplied-material-only' ||
			participant.executorId === null ||
			participant.bindingVersion === null
		) {
			return null;
		}
		if (input.round === 'contribution') {
			if (
				meeting.state !== 'collecting' ||
				meeting.collectionClosedAt !== null ||
				!meeting.collectionDeadlineAt ||
				meeting.collectionDeadlineAt.getTime() <= Date.now() ||
				!['pending', 'queued', 'running', 'unknown'].includes(participant.responseState)
			)
				return null;
		} else if (
			meeting.state !== 'synthesizing' ||
			meeting.frozenContributionIds === null ||
			!participant.facilitator
		) {
			return null;
		}

		const participants = await this.meetings.listParticipants(
			input.projectId,
			input.departmentId,
			input.meetingId,
			{},
		);
		const sources = await this.meetings.listSources(
			input.projectId,
			input.departmentId,
			input.meetingId,
			{},
		);
		if (
			sources.length > 0 &&
			!(await userHasScopes(user, ['agent:read'], true, { projectId: input.projectId }))
		) {
			return null;
		}
		const sourceContent: string[] = [];
		for (const source of sources) {
			if (source.accessState !== 'available') return null;
			if (source.sourceKind === 'goal' || source.sourceKind === 'work') {
				const current = await this.work.readMeetingSourceSnapshot(
					input.projectId,
					input.departmentId,
					source.sourceKind,
					source.sourceId,
				);
				if (
					!current ||
					current.sourceVersion !== source.sourceVersion ||
					current.contentHash !== source.contentHash
				)
					return null;
				sourceContent.push(current.content);
			} else {
				const approved = await this.meetings.findApprovedDecisionSource(
					input.projectId,
					input.departmentId,
					source.sourceId,
					{},
				);
				if (!approved || approved.meeting.id === meeting.id) return null;
				const sourceVersion = `${approved.minutes.revision}:${approved.decision.approvedAt?.toISOString()}`;
				const content = [
					`Approved decision: ${approved.decision.text}`,
					`Source meeting: ${approved.meeting.id}`,
					`Minutes revision: ${approved.minutes.revision}`,
					`Approved by: ${approved.decision.approvedBy}`,
				].join('\n');
				const contentHash = hashBriefing({
					sourceKind: source.sourceKind,
					sourceId: source.sourceId,
					sourceVersion,
					content,
				});
				if (sourceVersion !== source.sourceVersion || contentHash !== source.contentHash)
					return null;
				sourceContent.push(content);
			}
		}
		const briefingHash = hashBriefing({
			topic: meeting.topic,
			desiredOutcome: meeting.desiredOutcome,
			goalId: meeting.goalId,
			referencedWorkIds: meeting.referencedWorkIds,
			actorId: meeting.executionActorId,
			participants: [...participants]
				.sort((left, right) => left.memberId.localeCompare(right.memberId))
				.map((item) => ({
					memberId: item.memberId,
					name: item.memberNameSnapshot,
					role: item.roleSnapshot,
					executorId: item.executorId,
					bindingVersion: item.bindingVersion,
				})),
			sources: sources
				.sort((left, right) =>
					`${left.sourceKind}:${left.sourceId}`.localeCompare(
						`${right.sourceKind}:${right.sourceId}`,
					),
				)
				.map((source) => ({
					kind: source.sourceKind,
					sourceId: source.sourceId,
					sourceVersion: source.sourceVersion,
					snapshotRef: source.snapshotRef,
					contentHash: source.contentHash,
				})),
		});
		if (briefingHash !== context.briefingHash) return null;

		let synthesisMaterial: string | null = null;
		if (input.round === 'synthesis') {
			const frozenIds = meeting.frozenContributionIds ?? [];
			if (frozenIds.length === 0) return null;
			const [contributions, allParticipants] = await Promise.all([
				this.meetings.listContributions(input.projectId, input.departmentId, meeting.id, {}),
				this.meetings.listParticipants(input.projectId, input.departmentId, meeting.id, {}),
			]);
			const frozen = new Map(
				contributions
					.filter(({ id }) => frozenIds.includes(id))
					.map((contribution) => [contribution.id, contribution]),
			);
			if (frozen.size !== frozenIds.length) return null;
			const participantById = new Map(allParticipants.map((item) => [item.id, item]));
			const contributionLines = frozenIds.map((id) => {
				const contribution = frozen.get(id);
				if (!contribution) return null;
				const sourceParticipant = participantById.get(contribution.participantId);
				if (!sourceParticipant) return null;
				return [
					`Contribution ${contribution.id} — ${sourceParticipant.memberNameSnapshot} (${sourceParticipant.roleSnapshot}), stance: ${contribution.contribution.stance}`,
					...contribution.contribution.keyPoints.map((point) => `Key point: ${point}`),
					...contribution.contribution.risks.map((risk) => `Risk: ${risk}`),
					`Proposed action: ${contribution.contribution.proposedAction}`,
				].join('\n');
			});
			if (contributionLines.some((line) => line === null)) return null;
			const absenceLines = (meeting.absenceSnapshots ?? []).map((absence) => {
				const absentParticipant = participantById.get(absence.participantId);
				return absentParticipant
					? `Absent: ${absentParticipant.memberNameSnapshot} (${absentParticipant.roleSnapshot}); last known state: ${absence.lastKnownState}`
					: null;
			});
			if (absenceLines.some((line) => line === null)) return null;
			synthesisMaterial = [
				'Frozen participant contributions:',
				...contributionLines,
				'Participants without an accepted contribution:',
				...(absenceLines.length > 0 ? absenceLines : ['None']),
			].join('\n\n');
		}

		const inputText = [
			`Purpose: ${meeting.purpose}`,
			`Topic: ${meeting.topic}`,
			`Desired outcome: ${meeting.desiredOutcome}`,
			`Your role: ${participant.roleSnapshot}`,
			sourceContent.length > 0
				? `Authorized source material:\n${sourceContent.join('\n\n')}`
				: null,
			synthesisMaterial,
			input.round === 'synthesis'
				? 'Use only the frozen contributions and supplied meeting context. Return one JSON object and no other text. Use exactly these keys: summary, sourceContributionIds, disagreements, decisions, actionItems. Set summary to one short string. Set sourceContributionIds to the IDs of all contributions used. Each disagreement must have topic and positions; each position must have contributionId and position. Each decision must have text and sourceContributionIds. Each action item must have title, description, assigneeMemberId, and sourceContributionIds; use null for description or assigneeMemberId when unknown. Cite only frozen contribution IDs. Give each opposing position its own contribution ID. Do not state consensus when contributions disagree. Keep every decision and action item proposed.'
				: 'Use only the supplied meeting context. Return one JSON object and no other text. Use exactly these keys: stance, keyPoints, risks, proposedAction. Set stance to agree, disagree, or neutral. Set keyPoints and risks to arrays with at most three short strings each. Set proposedAction to one short string. Do not use Markdown or add keys.',
		]
			.filter((line): line is string => line !== null)
			.join('\n\n');
		if (Array.from(inputText).length > AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS) return null;
		return { contextHash: briefingHash, inputText };
	}
}
