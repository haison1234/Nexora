import { z } from 'zod';
import { Z } from '../zod-class';

const idSchema = z.string().trim().min(1).max(36);
const requestIdSchema = z.string().trim().min(1).max(36);
const commandFields = { requestId: requestIdSchema };
const versionedCommandFields = {
	...commandFields,
	expectedVersion: z.number().int().positive(),
};

export const AI_DEPARTMENT_MEETING_STATES = [
	'draft',
	'collecting',
	'synthesizing',
	'review',
	'approved',
	'completed',
	'cancelling',
	'cancelled',
] as const;

export const AI_DEPARTMENT_MEETING_PARTICIPANT_STATES = [
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

export const AI_DEPARTMENT_MEETING_INVOCATION_STATES = [
	'reserved',
	'queued',
	'running',
	'succeeded',
	'failed',
	'unavailable',
	'stop_pending',
	'unknown',
	'cancelled',
] as const;

export const AI_DEPARTMENT_MEETING_INVOCATION_KINDS = ['contribution', 'synthesis'] as const;
export const AI_DEPARTMENT_MEETING_MINUTES_STATES = ['draft', 'approved'] as const;
export const AI_DEPARTMENT_MEETING_DECISION_STATES = ['proposed', 'approved'] as const;
export const AI_DEPARTMENT_MEETING_ACTION_ITEM_STATES = [
	'proposed',
	'approved',
	'conversion_pending',
	'recovery_required',
	'converted',
	'declined',
] as const;
export const AI_DEPARTMENT_MEETING_SOURCE_ACCESS_STATES = [
	'available',
	'denied',
	'expired',
] as const;
export const AI_DEPARTMENT_MEETING_EXECUTION_STATES = [
	'unconfigured',
	'available',
	'unavailable',
] as const;
export const AI_DEPARTMENT_MEETING_PURPOSES = ['decision', 'risk-review', 'ideation'] as const;
export type AiDepartmentMeetingPurpose = (typeof AI_DEPARTMENT_MEETING_PURPOSES)[number];

export const AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS = 500;
export const AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS = 4_000;
export const AI_DEPARTMENT_MEETING_MAX_CONTEXT_CHARS = 48_000;

const boundedUnicodeText = (max: number) =>
	z
		.string()
		.trim()
		.min(1)
		.refine((value) => Array.from(value).length <= max);

const structuredContributionFields = {
	stance: z.enum(['agree', 'disagree', 'neutral']),
	keyPoints: z.array(boundedUnicodeText(AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS)).max(3),
	risks: z.array(boundedUnicodeText(AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS)).max(3),
	proposedAction: boundedUnicodeText(AI_DEPARTMENT_MEETING_MAX_FIELD_CHARS),
};

export const aiDepartmentMeetingStructuredContributionSchema = z
	.object(structuredContributionFields)
	.strict()
	.refine(
		(value) =>
			Array.from(JSON.stringify(value)).length <= AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS,
	);
export type AiDepartmentMeetingStructuredContribution = z.infer<
	typeof aiDepartmentMeetingStructuredContributionSchema
>;

export type AiDepartmentMeetingState = (typeof AI_DEPARTMENT_MEETING_STATES)[number];
export type AiDepartmentMeetingParticipantState =
	(typeof AI_DEPARTMENT_MEETING_PARTICIPANT_STATES)[number];
export type AiDepartmentMeetingInvocationState =
	(typeof AI_DEPARTMENT_MEETING_INVOCATION_STATES)[number];
export type AiDepartmentMeetingInvocationKind =
	(typeof AI_DEPARTMENT_MEETING_INVOCATION_KINDS)[number];
export type AiDepartmentMeetingMinutesState = (typeof AI_DEPARTMENT_MEETING_MINUTES_STATES)[number];
export type AiDepartmentMeetingDecisionState =
	(typeof AI_DEPARTMENT_MEETING_DECISION_STATES)[number];
export type AiDepartmentMeetingActionItemState =
	(typeof AI_DEPARTMENT_MEETING_ACTION_ITEM_STATES)[number];
export type AiDepartmentMeetingSourceAccessState =
	(typeof AI_DEPARTMENT_MEETING_SOURCE_ACCESS_STATES)[number];
export type AiDepartmentMeetingExecutionState =
	(typeof AI_DEPARTMENT_MEETING_EXECUTION_STATES)[number];

const meetingBriefingFields = {
	purpose: z.enum(AI_DEPARTMENT_MEETING_PURPOSES).default('decision'),
	topic: z.string().trim().min(1).max(256),
	desiredOutcome: z.string().trim().min(1).max(2000),
	participantMemberIds: z.array(idSchema).min(2).max(10),
	facilitatorMemberId: idSchema,
	goalId: idSchema.nullable().optional(),
	referencedWorkIds: z.array(idSchema).max(20).default([]),
	approvedDecisionIds: z.array(idSchema).max(20).default([]).optional(),
};

export class CreateAiDepartmentMeetingDto extends Z.class({
	...meetingBriefingFields,
	...commandFields,
}) {}

export class UpdateAiDepartmentMeetingDto extends Z.class({
	purpose: z.enum(AI_DEPARTMENT_MEETING_PURPOSES).optional(),
	topic: meetingBriefingFields.topic.optional(),
	desiredOutcome: meetingBriefingFields.desiredOutcome.optional(),
	participantMemberIds: meetingBriefingFields.participantMemberIds.optional(),
	facilitatorMemberId: idSchema.optional(),
	goalId: idSchema.nullable().optional(),
	referencedWorkIds: z.array(idSchema).max(20).optional(),
	approvedDecisionIds: z.array(idSchema).max(20).optional(),
	...versionedCommandFields,
}) {}

export class StartAiDepartmentMeetingDto extends Z.class({
	...versionedCommandFields,
}) {}

export class CancelAiDepartmentMeetingDto extends Z.class({
	...commandFields,
}) {}

export class RetryAiDepartmentMeetingDto extends Z.class({
	...versionedCommandFields,
}) {}

export class ExcludeAiDepartmentMeetingParticipantDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().min(1).max(500),
}) {}

export class TakeoverAiDepartmentMeetingDto extends Z.class({
	...versionedCommandFields,
}) {}

export class AiDepartmentMeetingListQueryDto extends Z.class({
	take: z.coerce.number().int().min(1).max(100).default(50),
	skip: z.coerce.number().int().min(0).default(0),
	state: z.enum(AI_DEPARTMENT_MEETING_STATES).optional(),
	search: z.string().trim().max(256).optional(),
}) {}

export class AiDepartmentMeetingCommandDto extends Z.class({
	...versionedCommandFields,
}) {}

export class AiDepartmentMeetingReasonCommandDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().min(1).max(2000),
}) {}

const contributionSourceSchema = z.object({
	contributionId: idSchema,
	label: z.string().trim().min(1).max(256),
});

const proposedDecisionSchema = z.object({
	text: z.string().trim().min(1).max(4000),
	sourceContributionIds: z.array(idSchema).max(20).default([]),
});

const proposedActionItemSchema = z.object({
	title: z.string().trim().min(1).max(256),
	description: z.string().trim().max(4000).nullable().optional(),
	assigneeMemberId: idSchema.nullable().optional(),
	sourceContributionIds: z.array(idSchema).max(20).default([]),
});

const disagreementPositionSchema = z.object({
	contributionId: idSchema,
	position: boundedUnicodeText(500),
});

export const aiDepartmentMeetingDisagreementSchema = z.object({
	topic: boundedUnicodeText(500),
	positions: z.array(disagreementPositionSchema).min(2).max(10),
});

const meetingMinutesContentShape = {
	summary: z.string().trim().min(1).max(20000),
	sourceContributionIds: z.array(idSchema).min(1).max(20),
	disagreements: z.array(aiDepartmentMeetingDisagreementSchema).max(20).default([]),
	decisions: z.array(proposedDecisionSchema).max(50),
	actionItems: z.array(proposedActionItemSchema).max(50),
};

export const aiDepartmentMeetingSynthesisResultSchema = z
	.object({
		...meetingMinutesContentShape,
	})
	.strict()
	.refine(
		(value) =>
			value.decisions.every(({ sourceContributionIds }) => sourceContributionIds.length > 0) &&
			value.actionItems.every(({ sourceContributionIds }) => sourceContributionIds.length > 0),
	);
export type AiDepartmentMeetingSynthesisResult = z.infer<
	typeof aiDepartmentMeetingSynthesisResultSchema
>;

export class SaveAiDepartmentMeetingMinutesDto extends Z.class({
	...versionedCommandFields,
	...meetingMinutesContentShape,
}) {}

export class ResolveAiDepartmentMeetingItemDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().max(2000).nullable().optional(),
}) {}

export class ResolveAiDepartmentMeetingActionItemDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().max(2000).nullable().optional(),
}) {}

export const aiDepartmentMeetingInvocationDtoSchema = z.object({
	id: idSchema,
	kind: z.enum(AI_DEPARTMENT_MEETING_INVOCATION_KINDS),
	state: z.enum(AI_DEPARTMENT_MEETING_INVOCATION_STATES),
	sequence: z.string().nullable(),
	safeFailureCode: z.string().nullable(),
	safeFailureSummary: z.string().nullable(),
	deadlineAt: z.string().datetime().nullable(),
	terminalAt: z.string().datetime().nullable(),
	retryOfInvocationId: idSchema.nullable(),
});
export type AiDepartmentMeetingInvocationDto = z.infer<
	typeof aiDepartmentMeetingInvocationDtoSchema
>;

export const aiDepartmentMeetingContributionDtoSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	...structuredContributionFields,
	sources: z.array(contributionSourceSchema),
	acceptedAt: z.string().datetime(),
});
export type AiDepartmentMeetingContributionDto = z.infer<
	typeof aiDepartmentMeetingContributionDtoSchema
>;

export const aiDepartmentMeetingParticipantDtoSchema = z.object({
	id: idSchema,
	memberId: idSchema,
	name: z.string(),
	role: z.string(),
	executionState: z.enum(AI_DEPARTMENT_MEETING_EXECUTION_STATES),
	facilitator: z.boolean(),
	state: z.enum(AI_DEPARTMENT_MEETING_PARTICIPANT_STATES),
	exclusionReason: z.string().nullable(),
	invocations: z.array(aiDepartmentMeetingInvocationDtoSchema),
	contribution: aiDepartmentMeetingContributionDtoSchema.nullable(),
});
export type AiDepartmentMeetingParticipantDto = z.infer<
	typeof aiDepartmentMeetingParticipantDtoSchema
>;

export const aiDepartmentMeetingDecisionDtoSchema = z.object({
	id: idSchema,
	text: z.string(),
	state: z.enum(AI_DEPARTMENT_MEETING_DECISION_STATES),
	sourceContributionIds: z.array(idSchema),
	approvedBy: idSchema.nullable(),
	approvedAt: z.string().datetime().nullable(),
});
export type AiDepartmentMeetingDecisionDto = z.infer<typeof aiDepartmentMeetingDecisionDtoSchema>;

export const aiDepartmentMeetingActionItemDtoSchema = z.object({
	id: idSchema,
	title: z.string(),
	description: z.string().nullable(),
	assigneeMemberId: idSchema.nullable(),
	state: z.enum(AI_DEPARTMENT_MEETING_ACTION_ITEM_STATES),
	sourceContributionIds: z.array(idSchema),
	workId: idSchema.nullable(),
	resolutionReason: z.string().nullable(),
});
export type AiDepartmentMeetingActionItemDto = z.infer<
	typeof aiDepartmentMeetingActionItemDtoSchema
>;

export const aiDepartmentMeetingMinutesDtoSchema = z.object({
	id: idSchema,
	revision: z.number().int().positive(),
	state: z.enum(AI_DEPARTMENT_MEETING_MINUTES_STATES),
	summary: z.string(),
	sourceContributionIds: z.array(idSchema),
	disagreements: z.array(aiDepartmentMeetingDisagreementSchema),
	decisions: z.array(aiDepartmentMeetingDecisionDtoSchema),
	actionItems: z.array(aiDepartmentMeetingActionItemDtoSchema),
	authoredBy: idSchema,
	approvedBy: idSchema.nullable(),
	approvedAt: z.string().datetime().nullable(),
});
export type AiDepartmentMeetingMinutesDto = z.infer<typeof aiDepartmentMeetingMinutesDtoSchema>;

export const aiDepartmentMeetingActivityDtoSchema = z.object({
	id: idSchema,
	actorId: idSchema.nullable(),
	createdAt: z.string().datetime(),
	action: z.string().trim().min(1).max(128),
	targetId: idSchema.nullable(),
	state: z.string().trim().min(1).max(64),
	summary: z.string().trim().max(512),
});
export type AiDepartmentMeetingActivityDto = z.infer<typeof aiDepartmentMeetingActivityDtoSchema>;

export const aiDepartmentMeetingSourceDtoSchema = z.object({
	id: idSchema,
	kind: z.enum(['goal', 'work', 'decision']),
	label: z.string().nullable(),
	version: z.string().nullable(),
	access: z.enum(AI_DEPARTMENT_MEETING_SOURCE_ACCESS_STATES),
});
export type AiDepartmentMeetingSourceDto = z.infer<typeof aiDepartmentMeetingSourceDtoSchema>;

export const aiDepartmentMeetingDtoSchema = z.object({
	id: idSchema,
	projectId: idSchema,
	departmentId: idSchema,
	createdBy: idSchema,
	executionActorId: idSchema,
	topic: z.string().nullable(),
	purpose: z.enum(AI_DEPARTMENT_MEETING_PURPOSES),
	desiredOutcome: z.string().nullable(),
	state: z.enum(AI_DEPARTMENT_MEETING_STATES),
	facilitatorMemberId: idSchema,
	goalId: idSchema.nullable(),
	referencedWorkIds: z.array(idSchema),
	collection: z.object({
		deadlineAt: z.string().datetime().nullable(),
		closedAt: z.string().datetime().nullable(),
		closeReason: z.enum(['quorum', 'deadline']).nullable(),
		acceptedContributionIds: z.array(idSchema).nullable(),
		absences: z.array(
			z.object({
				participantId: idSchema,
				lastKnownState: z.enum(AI_DEPARTMENT_MEETING_PARTICIPANT_STATES),
				recordedAt: z.string().datetime(),
			}),
		),
	}),
	sources: z.array(aiDepartmentMeetingSourceDtoSchema),
	version: z.number().int().positive(),
	participants: z.array(aiDepartmentMeetingParticipantDtoSchema),
	minutes: z.array(aiDepartmentMeetingMinutesDtoSchema),
	activity: z.array(aiDepartmentMeetingActivityDtoSchema),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});
export type AiDepartmentMeetingDto = z.infer<typeof aiDepartmentMeetingDtoSchema>;

export const aiDepartmentMeetingSummaryDtoSchema = z.object({
	id: idSchema,
	departmentId: idSchema,
	topic: z.string().nullable(),
	state: z.enum(AI_DEPARTMENT_MEETING_STATES),
	participantCounts: z.record(
		z.enum(AI_DEPARTMENT_MEETING_PARTICIPANT_STATES),
		z.number().int().nonnegative(),
	),
	createdBy: idSchema,
	updatedAt: z.string().datetime(),
});
export type AiDepartmentMeetingSummaryDto = z.infer<typeof aiDepartmentMeetingSummaryDtoSchema>;

export const aiDepartmentMeetingPageDtoSchema = z.object({
	items: z.array(aiDepartmentMeetingSummaryDtoSchema),
	total: z.number().int().nonnegative(),
	take: z.number().int().positive(),
	skip: z.number().int().nonnegative(),
});
export type AiDepartmentMeetingPageDto = z.infer<typeof aiDepartmentMeetingPageDtoSchema>;

export const aiDepartmentMeetingCommandResultDtoSchema = z.object({
	meetingId: idSchema,
	meetingVersion: z.number().int().positive(),
	state: z.enum(AI_DEPARTMENT_MEETING_STATES),
	status: z.enum(['accepted', 'pending', 'completed']),
	requestId: requestIdSchema,
	invocations: z.array(aiDepartmentMeetingInvocationDtoSchema).default([]),
});
export type AiDepartmentMeetingCommandResultDto = z.infer<
	typeof aiDepartmentMeetingCommandResultDtoSchema
>;

export const aiDepartmentMeetingCommandStatusDtoSchema = z.object({
	requestId: requestIdSchema,
	status: z.enum(['unknown', 'pending', 'completed']),
	meetingId: idSchema.nullable(),
});
export type AiDepartmentMeetingCommandStatusDto = z.infer<
	typeof aiDepartmentMeetingCommandStatusDtoSchema
>;
