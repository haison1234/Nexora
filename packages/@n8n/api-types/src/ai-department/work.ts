import { z } from 'zod';
import { Z } from '../zod-class';

const commandFields = {
	requestId: z.string().trim().min(1).max(36),
};

const versionedCommandFields = {
	...commandFields,
	expectedVersion: z.number().int().positive(),
};

export const AI_DEPARTMENT_GOAL_STATES = ['active', 'done', 'archived'] as const;
export const AI_DEPARTMENT_WORK_PRIORITIES = ['low', 'normal', 'high'] as const;
export const AI_DEPARTMENT_REVIEW_POLICIES = ['required', 'automatic'] as const;
export const AI_DEPARTMENT_REVIEWER_FILTERS = ['anyone', 'not_creator', 'human_only'] as const;
export const AI_DEPARTMENT_WORK_STATES = [
	'backlog',
	'ready',
	'running',
	'review',
	'blocked',
	'done',
	'cancelled',
] as const;

export const AI_DEPARTMENT_WORK_COORDINATION_LIMITS = {
	completionResultChars: 4000,
	completionListItems: 10,
	completionListItemChars: 500,
	helpQuestionChars: 2000,
	helpReasonChars: 1000,
	helpAttemptedSteps: 10,
	helpAttemptedStepChars: 500,
	helpExpertiseTags: 5,
	helpExpertiseTagChars: 64,
	helpAnswerTokens: 1000,
	helpAnswerChars: 4000,
	helpRequestsPerCompletionCycle: 2,
	helpRecipientDeadlineMinutes: 10,
	delegatedTitleChars: 200,
	delegatedInstructionChars: 4000,
} as const;

export type AiDepartmentGoalState = (typeof AI_DEPARTMENT_GOAL_STATES)[number];
export type AiDepartmentWorkPriority = (typeof AI_DEPARTMENT_WORK_PRIORITIES)[number];
export type AiDepartmentReviewPolicy = (typeof AI_DEPARTMENT_REVIEW_POLICIES)[number];
export type AiDepartmentWorkState = (typeof AI_DEPARTMENT_WORK_STATES)[number];

export const aiDepartmentReviewStageSchema = z.object({
	id: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9_-]+$/),
	reviewers: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('authorized_writers') }),
		z.object({ kind: z.literal('users'), userIds: z.array(z.string().uuid()).min(1).max(100) }),
		z.object({ kind: z.literal('members'), memberIds: z.array(z.string().uuid()).min(1).max(100) }),
	]),
	actorFilter: z.enum(AI_DEPARTMENT_REVIEWER_FILTERS),
});
export type AiDepartmentReviewStage = z.infer<typeof aiDepartmentReviewStageSchema>;

const reviewStagesSchema = z
	.array(aiDepartmentReviewStageSchema)
	.min(1)
	.max(20)
	.superRefine((stages, context) => {
		const ids = new Set<string>();
		for (const [index, stage] of stages.entries()) {
			if (ids.has(stage.id)) {
				context.addIssue({
					code: 'custom',
					path: [index, 'id'],
					message: 'Stage IDs must be unique.',
				});
			}
			ids.add(stage.id);
		}
	});

export class CreateAiDepartmentGoalDto extends Z.class({
	title: z.string().trim().min(1).max(256),
	successCriteria: z.string().trim().max(10000).nullable().optional(),
	parentId: z.string().max(36).nullable().optional(),
	ownerMemberId: z.string().max(36).nullable().optional(),
	dueAt: z.string().datetime().nullable().optional(),
	...commandFields,
}) {}

export class UpdateAiDepartmentGoalDto extends Z.class({
	title: z.string().trim().min(1).max(256).optional(),
	successCriteria: z.string().trim().max(10000).nullable().optional(),
	parentId: z.string().max(36).nullable().optional(),
	ownerMemberId: z.string().max(36).nullable().optional(),
	dueAt: z.string().datetime().nullable().optional(),
	state: z.enum(AI_DEPARTMENT_GOAL_STATES).optional(),
	...versionedCommandFields,
}) {}

export class CreateAiDepartmentWorkDto extends Z.class({
	instruction: z.string().trim().min(1).max(20000),
	goalId: z.string().max(36).nullable().optional(),
	assigneeMemberId: z.string().max(36).nullable().optional(),
	priority: z.enum(AI_DEPARTMENT_WORK_PRIORITIES).default('normal'),
	dueAt: z.string().datetime().nullable().optional(),
	reviewPolicy: z.enum(AI_DEPARTMENT_REVIEW_POLICIES).default('required'),
	reviewStages: reviewStagesSchema.optional(),
	...commandFields,
}) {}

export class UpdateAiDepartmentWorkDto extends Z.class({
	instruction: z.string().trim().min(1).max(20000).optional(),
	goalId: z.string().max(36).nullable().optional(),
	assigneeMemberId: z.string().max(36).nullable().optional(),
	priority: z.enum(AI_DEPARTMENT_WORK_PRIORITIES).optional(),
	dueAt: z.string().datetime().nullable().optional(),
	reviewPolicy: z.enum(AI_DEPARTMENT_REVIEW_POLICIES).optional(),
	reviewStages: reviewStagesSchema.optional(),
	...versionedCommandFields,
}) {}

export class AiDepartmentWorkListQueryDto extends Z.class({
	take: z.coerce.number().int().min(1).max(100).default(50),
	skip: z.coerce.number().int().min(0).default(0),
	state: z.enum(AI_DEPARTMENT_WORK_STATES).optional(),
	goalId: z.string().max(36).optional(),
	assigneeMemberId: z.string().max(36).optional(),
	search: z.string().trim().max(256).optional(),
}) {}

export class AiDepartmentAssignedWorkInboxQueryDto extends Z.class({
	take: z.coerce.number().int().min(1).max(100).default(50),
	cursor: z.string().trim().min(1).max(2048).optional(),
}) {}

export class UpdateAiDepartmentWorkStateDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().max(2000).nullable().optional(),
}) {}

export const AI_DEPARTMENT_WORK_RELATIONSHIP_KINDS = ['parent', 'blocks'] as const;
export type AiDepartmentWorkRelationshipKind =
	(typeof AI_DEPARTMENT_WORK_RELATIONSHIP_KINDS)[number];

export class CreateAiDepartmentWorkRelationshipDto extends Z.class({
	...versionedCommandFields,
	relatedWorkId: z.string().min(1).max(36),
	kind: z.enum(AI_DEPARTMENT_WORK_RELATIONSHIP_KINDS),
}) {}

export class DeleteAiDepartmentWorkRelationshipDto extends Z.class({
	...versionedCommandFields,
}) {}

export const aiDepartmentGoalDtoSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	departmentId: z.string(),
	title: z.string(),
	successCriteria: z.string().nullable(),
	parentId: z.string().nullable(),
	ownerMemberId: z.string().nullable(),
	dueAt: z.string().nullable(),
	state: z.enum(AI_DEPARTMENT_GOAL_STATES),
	version: z.number().int(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type AiDepartmentGoalDto = z.infer<typeof aiDepartmentGoalDtoSchema>;

export const aiDepartmentWorkItemDtoSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	departmentId: z.string(),
	goalId: z.string().nullable(),
	assigneeMemberId: z.string().nullable(),
	instruction: z.string(),
	priority: z.enum(AI_DEPARTMENT_WORK_PRIORITIES),
	dueAt: z.string().nullable(),
	reviewPolicy: z.enum(AI_DEPARTMENT_REVIEW_POLICIES),
	reviewStages: z.array(aiDepartmentReviewStageSchema),
	reviewPolicyRevision: z.number().int().positive(),
	currentReviewStageIndex: z.number().int().nonnegative(),
	state: z.enum(AI_DEPARTMENT_WORK_STATES),
	currentAttemptId: z.string().nullable(),
	version: z.number().int(),
	createdAt: z.string(),
	updatedAt: z.string(),
	childReports: z
		.array(
			z.object({
				workId: z.string(),
				state: z.enum(AI_DEPARTMENT_WORK_STATES),
				report: z.lazy(() => aiDepartmentWorkCompletionReportSchema).nullable(),
			}),
		)
		.optional(),
	helpAnswers: z
		.array(
			z.object({
				question: z.string(),
				answer: z.string(),
				responderKind: z.enum(['user', 'agent']),
				answeredAt: z.string(),
			}),
		)
		.optional(),
});
export type AiDepartmentWorkItemDto = z.infer<typeof aiDepartmentWorkItemDtoSchema>;

export const aiDepartmentAssignedWorkInboxItemSchema = z.object({
	workId: z.string(),
	departmentId: z.string(),
	goalId: z.string().nullable(),
	assigneeMemberId: z.string(),
	instruction: z.string(),
	priority: z.enum(AI_DEPARTMENT_WORK_PRIORITIES),
	dueAt: z.string().nullable(),
	reviewPolicy: z.enum(AI_DEPARTMENT_REVIEW_POLICIES),
	version: z.number().int(),
	eligibilityGeneration: z.number().int(),
	eligibleAt: z.string(),
});

export const aiDepartmentAssignedWorkInboxSchema = z.object({
	data: z.array(aiDepartmentAssignedWorkInboxItemSchema),
	nextCursor: z.string().nullable(),
	bindingAvailability: z.enum(['available', 'unavailable']),
	wake: z
		.object({
			generation: z.number().int(),
			acknowledgedGeneration: z.number().int(),
			state: z.enum(['pending', 'accepted', 'coalesced', 'unknown', 'delivered', 'rejected']),
		})
		.nullable(),
});
export type AiDepartmentAssignedWorkInbox = z.infer<typeof aiDepartmentAssignedWorkInboxSchema>;

export const aiDepartmentWorkWakeStatusSchema = z.object({
	state: z.enum(['pending', 'delivered']).nullable(),
	createdAt: z.string().nullable(),
	deliveredAt: z.string().nullable(),
});
export type AiDepartmentWorkWakeStatus = z.infer<typeof aiDepartmentWorkWakeStatusSchema>;

export const aiDepartmentWorkRelationshipDtoSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	departmentId: z.string(),
	workId: z.string(),
	relatedWorkId: z.string(),
	kind: z.enum(AI_DEPARTMENT_WORK_RELATIONSHIP_KINDS),
	createdAt: z.string(),
});
export type AiDepartmentWorkRelationshipDto = z.infer<typeof aiDepartmentWorkRelationshipDtoSchema>;

export const aiDepartmentAttemptCommandResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	attemptId: z.string().nullable(),
	dispatchState: z.enum(['unavailable', 'pending', 'acknowledged', 'unknown', 'rejected']),
});
export type AiDepartmentAttemptCommandResult = z.infer<
	typeof aiDepartmentAttemptCommandResultSchema
>;

export class ReviewAiDepartmentWorkDto extends Z.class({
	...versionedCommandFields,
	attemptId: z.string().min(1).max(36),
	resultId: z.string().min(1).max(36).optional(),
	reviewRoundId: z.string().min(1).max(36).optional(),
	stageId: z.string().min(1).max(64).optional(),
	expectedReviewVersion: z.number().int().positive().optional(),
	decision: z.enum(['accept', 'return']),
	reason: z.string().trim().max(2000).nullable().optional(),
}) {}

export class ReopenAiDepartmentWorkReviewDto extends Z.class({
	...versionedCommandFields,
	reason: z.string().trim().min(1).max(2000),
}) {}

export const aiDepartmentWorkReviewReopenResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	attemptId: z.string(),
	reviewRoundId: z.string(),
	reviewPolicyRevision: z.number().int().positive(),
	roundStatus: z.literal('reopened'),
});
export type AiDepartmentWorkReviewReopenResult = z.infer<
	typeof aiDepartmentWorkReviewReopenResultSchema
>;

export class HandoffAiDepartmentWorkDto extends Z.class({
	...versionedCommandFields,
	destinationMemberId: z.string().trim().min(1).max(36),
	reason: z.string().trim().min(1).max(2000),
}) {}

export class AuthorizeAiDepartmentWorkHandoffDto extends Z.class({
	...versionedCommandFields,
}) {}

export const aiDepartmentWorkHandoffResultSchema = z.object({
	handoffId: z.string(),
	state: z.enum(['requested', 'awaiting_stop', 'completed', 'rejected', 'cancelled']),
	work: aiDepartmentWorkItemDtoSchema,
	attemptId: z.string().nullable(),
});
export type AiDepartmentWorkHandoffResult = z.infer<typeof aiDepartmentWorkHandoffResultSchema>;

export const aiDepartmentCancelWorkResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	attemptId: z.string().nullable(),
	cancelRequested: z.boolean(),
	cancellationPending: z.boolean(),
});
export type AiDepartmentCancelWorkResult = z.infer<typeof aiDepartmentCancelWorkResultSchema>;

export const aiDepartmentReviewResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	decision: z.enum(['accept', 'return']),
	attemptId: z.string(),
	resultId: z.string(),
	reviewRoundId: z.string(),
	activeStageId: z.string().nullable(),
	reviewVersion: z.number().int(),
	reviewPolicyRevision: z.number().int().positive(),
	allowedActions: z.array(z.enum(['accept', 'return'])),
	roundStatus: z.enum(['open', 'accepted', 'returned', 'reopened']).nullable(),
});
export type AiDepartmentReviewResult = z.infer<typeof aiDepartmentReviewResultSchema>;

export const aiDepartmentWorkReviewDecisionDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	reviewRoundId: z.string(),
	stageId: z.string(),
	resultId: z.string(),
	actorId: z.string(),
	actorKind: z.enum(['user', 'agent']),
	decision: z.enum(['accept', 'return']),
	reason: z.string().nullable(),
	priorVersion: z.number().int(),
	createdAt: z.string(),
});
export type AiDepartmentWorkReviewDecisionDto = z.infer<
	typeof aiDepartmentWorkReviewDecisionDtoSchema
>;

export const aiDepartmentWorkAttemptDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	submittedResultId: z.string().nullable(),
	reviewRoundId: z.string().nullable(),
	reviewRoundVersion: z.number().int().positive().nullable(),
	reviewActiveStageId: z.string().nullable(),
	reviewPolicyRevision: z.number().int().positive(),
	ordinal: z.number().int(),
	memberId: z.string(),
	provider: z.string(),
	executorId: z.string(),
	phase: z.enum(['dispatching', 'active', 'suspended', 'stopping', 'terminal']),
	nativeToolApproval: z.enum(['pending', 'not_pending', 'unknown']),
	outcome: z.enum(['succeeded', 'failed', 'cancelled']).nullable(),
	cancellationPending: z.boolean(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	reviewRoundStatus: z.enum(['open', 'accepted', 'returned', 'reopened']).nullable(),
});
export type AiDepartmentWorkAttemptDto = z.infer<typeof aiDepartmentWorkAttemptDtoSchema>;

export const aiDepartmentToolApprovalAttentionDtoSchema = z.object({
	workId: z.string(),
	attemptId: z.string(),
	memberId: z.string(),
	ordinal: z.number().int(),
	state: z.enum(['pending', 'unknown']),
});
export type AiDepartmentToolApprovalAttentionDto = z.infer<
	typeof aiDepartmentToolApprovalAttentionDtoSchema
>;
export const aiDepartmentToolApprovalAttentionPageDtoSchema = z.object({
	items: z.array(aiDepartmentToolApprovalAttentionDtoSchema),
	hasMore: z.boolean(),
});
export type AiDepartmentToolApprovalAttentionPageDto = z.infer<
	typeof aiDepartmentToolApprovalAttentionPageDtoSchema
>;

const coordinationListSchema = z
	.array(
		z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.completionListItemChars),
	)
	.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.completionListItems);

export const aiDepartmentWorkCompletionReportSchema = z
	.object({
		result: z
			.string()
			.trim()
			.min(1)
			.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.completionResultChars),
		completedWork: coordinationListSchema,
		checkedEvidence: z
			.array(
				z
					.object({
						reference: z.string().trim().min(1).max(128).optional(),
						summary: z
							.string()
							.trim()
							.min(1)
							.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.completionListItemChars),
					})
					.strict(),
			)
			.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.completionListItems),
		openIssues: coordinationListSchema,
		nextSteps: coordinationListSchema,
	})
	.strict();
export type AiDepartmentWorkCompletionReport = z.infer<
	typeof aiDepartmentWorkCompletionReportSchema
>;

export const aiDepartmentExpertiseTagsSchema = z
	.array(z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpExpertiseTagChars))
	.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpExpertiseTags)
	.transform((tags) => tags.map((tag) => tag.toLowerCase()))
	.superRefine((tags, context) => {
		if (new Set(tags).size !== tags.length) {
			context.addIssue({ code: 'custom', message: 'Expertise tags must be unique.' });
		}
	});

export const aiDepartmentWorkAskSchema = z
	.object({
		expectedVersion: z.number().int().positive(),
		question: z
			.string()
			.trim()
			.min(1)
			.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpQuestionChars),
		attemptedSteps: z
			.array(
				z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpAttemptedStepChars),
			)
			.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpAttemptedSteps),
		reason: z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpReasonChars),
		expertiseTags: aiDepartmentExpertiseTagsSchema,
		...commandFields,
	})
	.strict();
export type AiDepartmentWorkAsk = z.infer<typeof aiDepartmentWorkAskSchema>;

export const aiDepartmentWorkDelegateSchema = z
	.object({
		expectedVersion: z.number().int().positive(),
		recipientMemberId: z.string().trim().min(1).max(36),
		title: z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.delegatedTitleChars),
		instruction: z
			.string()
			.trim()
			.min(1)
			.max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.delegatedInstructionChars),
		...commandFields,
	})
	.strict();
export type AiDepartmentWorkDelegate = z.infer<typeof aiDepartmentWorkDelegateSchema>;

export const AI_DEPARTMENT_WORK_HELP_STATES = [
	'pending_stop',
	'queued',
	'awaiting_answer',
	'answered',
	'escalating',
	'expired',
	'failed',
	'cancelled',
] as const;
export const AI_DEPARTMENT_WORK_HELP_ROUTING_STATES = [
	'specialist',
	'manager_fallback',
	'assignment_actor_fallback',
	'unresolved',
] as const;

export const aiDepartmentMemberExpertiseDtoSchema = z
	.object({
		tags: aiDepartmentExpertiseTagsSchema,
	})
	.strict();
export type AiDepartmentMemberExpertiseDto = z.infer<typeof aiDepartmentMemberExpertiseDtoSchema>;

export const aiDepartmentWorkHelpRoutingDtoSchema = z.object({
	state: z.enum(AI_DEPARTMENT_WORK_HELP_ROUTING_STATES),
	recipientMemberId: z.string().nullable(),
	recipientUserId: z.string().uuid().nullable(),
	deadlineAt: z.string().datetime().nullable(),
});
export type AiDepartmentWorkHelpRoutingDto = z.infer<typeof aiDepartmentWorkHelpRoutingDtoSchema>;

export const aiDepartmentWorkHelpRequestDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	requesterMemberId: z.string(),
	sourceAttemptId: z.string(),
	question: z.string(),
	attemptedSteps: z.array(z.string()),
	reason: z.string(),
	expertiseTags: z.array(z.string()),
	state: z.enum(AI_DEPARTMENT_WORK_HELP_STATES),
	routing: aiDepartmentWorkHelpRoutingDtoSchema,
	createdAt: z.string().datetime(),
	version: z.number().int().positive(),
});
export type AiDepartmentWorkHelpRequestDto = z.infer<typeof aiDepartmentWorkHelpRequestDtoSchema>;

export const aiDepartmentWorkHelpActionResultSchema = z.object({
	helpRequest: aiDepartmentWorkHelpRequestDtoSchema,
});
export type AiDepartmentWorkHelpActionResult = z.infer<
	typeof aiDepartmentWorkHelpActionResultSchema
>;

export const aiDepartmentWorkDelegateActionResultSchema = z.object({
	child: aiDepartmentWorkItemDtoSchema,
	relationships: z.array(aiDepartmentWorkRelationshipDtoSchema).length(2),
});

export const aiDepartmentWorkHelpResponseDtoSchema = z.object({
	id: z.string(),
	requestId: z.string(),
	responderKind: z.enum(['user', 'agent']),
	responderId: z.string().nullable(),
	answer: z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpAnswerChars),
	createdAt: z.string().datetime(),
});
export type AiDepartmentWorkHelpResponseDto = z.infer<typeof aiDepartmentWorkHelpResponseDtoSchema>;

export const aiDepartmentWorkHelpDetailDtoSchema = z.object({
	request: aiDepartmentWorkHelpRequestDtoSchema,
	response: aiDepartmentWorkHelpResponseDtoSchema.nullable(),
});
export type AiDepartmentWorkHelpDetailDto = z.infer<typeof aiDepartmentWorkHelpDetailDtoSchema>;

export const aiDepartmentWorkHelpAttentionPageDtoSchema = z.object({
	items: z.array(
		aiDepartmentWorkHelpDetailDtoSchema.extend({
			workTitle: z.string(),
		}),
	),
	hasMore: z.boolean(),
});
export type AiDepartmentWorkHelpAttentionPageDto = z.infer<
	typeof aiDepartmentWorkHelpAttentionPageDtoSchema
>;

export const createAiDepartmentWorkHelpAnswerSchema = z
	.object({
		expectedVersion: z.number().int().positive(),
		answer: z.string().trim().min(1).max(AI_DEPARTMENT_WORK_COORDINATION_LIMITS.helpAnswerChars),
		...commandFields,
	})
	.strict();
export type CreateAiDepartmentWorkHelpAnswerDto = z.infer<
	typeof createAiDepartmentWorkHelpAnswerSchema
>;

export const aiDepartmentAgentWorkActionSchema = z
	.object({
		action: z.enum([
			'inspect',
			'claim',
			'renew',
			'release',
			'inbox',
			'handoff',
			'comment',
			'progress',
			'block',
			'resume',
			'submit',
			'ask',
			'delegate',
		]),
		expectedVersion: z
			.number()
			.int()
			.positive()
			.describe(
				'Copy the numeric work.version from the latest tool result. Do not use a placeholder string.',
			)
			.nullish()
			.transform((version) => version ?? undefined),
		body: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.nullish()
			.transform((value) => value ?? undefined),
		report: aiDepartmentWorkCompletionReportSchema
			.nullish()
			.transform((value) => value ?? undefined),
		question: aiDepartmentWorkAskSchema.shape.question
			.nullish()
			.transform((value) => value ?? undefined),
		attemptedSteps: aiDepartmentWorkAskSchema.shape.attemptedSteps
			.nullish()
			.transform((value) => value ?? undefined),
		reason: aiDepartmentWorkAskSchema.shape.reason
			.nullish()
			.transform((value) => value ?? undefined),
		expertiseTags: aiDepartmentWorkAskSchema.shape.expertiseTags
			.nullish()
			.transform((value) => value ?? undefined),
		recipientMemberId: aiDepartmentWorkDelegateSchema.shape.recipientMemberId
			.nullish()
			.transform((value) => value ?? undefined),
		title: aiDepartmentWorkDelegateSchema.shape.title
			.nullish()
			.transform((value) => value ?? undefined),
		instruction: aiDepartmentWorkDelegateSchema.shape.instruction
			.nullish()
			.transform((value) => value ?? undefined),
		destinationMemberId: z
			.string()
			.trim()
			.min(1)
			.max(36)
			.nullish()
			.transform((value) => value ?? undefined),
		cursor: z
			.string()
			.trim()
			.min(1)
			.max(2048)
			.nullish()
			.transform((value) => value ?? undefined),
		take: z
			.number()
			.int()
			.min(1)
			.max(100)
			.nullish()
			.transform((value) => value ?? undefined),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			value.action !== 'delegate' &&
			(value.recipientMemberId || value.title || value.instruction)
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['action'],
				message: 'Delegate fields can only be used with the delegate action.',
			});
		}
		if (value.action === 'submit') {
			if (!value.report)
				ctx.addIssue({
					code: 'custom',
					path: ['report'],
					message: 'A structured completion report is required.',
				});
			if (value.body)
				ctx.addIssue({
					code: 'custom',
					path: ['body'],
					message: 'Use the structured completion report for submit actions.',
				});
		} else if (value.report) {
			ctx.addIssue({
				code: 'custom',
				path: ['report'],
				message: 'Completion reports are only valid for submit actions.',
			});
		}
		if (value.action === 'release' && !value.body) {
			ctx.addIssue({ code: 'custom', path: ['body'], message: 'A release reason is required.' });
		}
		if (value.action === 'ask') {
			if (!value.expectedVersion)
				ctx.addIssue({
					code: 'custom',
					path: ['expectedVersion'],
					message: 'A work version is required.',
				});
			if (!value.question)
				ctx.addIssue({ code: 'custom', path: ['question'], message: 'A question is required.' });
			if (!value.attemptedSteps)
				ctx.addIssue({
					code: 'custom',
					path: ['attemptedSteps'],
					message: 'Attempted steps are required.',
				});
			if (!value.reason)
				ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required.' });
			if (!value.expertiseTags)
				ctx.addIssue({
					code: 'custom',
					path: ['expertiseTags'],
					message: 'Expertise tags are required.',
				});
			if (value.body || value.report)
				ctx.addIssue({
					code: 'custom',
					path: ['action'],
					message: 'Ask fields cannot include a body or report.',
				});
		}
		if (value.action === 'handoff') {
			if (!value.expectedVersion)
				ctx.addIssue({
					code: 'custom',
					path: ['expectedVersion'],
					message: 'A work version is required.',
				});
			if (!value.destinationMemberId)
				ctx.addIssue({
					code: 'custom',
					path: ['destinationMemberId'],
					message: 'A destination member is required.',
				});
			if (!value.body)
				ctx.addIssue({ code: 'custom', path: ['body'], message: 'A handoff reason is required.' });
		}
		if (value.action === 'delegate') {
			if (!value.expectedVersion || !value.recipientMemberId || !value.title || !value.instruction)
				ctx.addIssue({
					code: 'custom',
					path: ['action'],
					message: 'A work version, recipient, title, and instruction are required.',
				});
			if (
				value.body ||
				value.report ||
				value.question ||
				value.attemptedSteps ||
				value.reason ||
				value.expertiseTags ||
				value.destinationMemberId
			)
				ctx.addIssue({
					code: 'custom',
					path: ['action'],
					message: 'Delegate fields cannot include other action data.',
				});
		}
	});
export type AiDepartmentAgentWorkAction = z.infer<typeof aiDepartmentAgentWorkActionSchema>;

export const aiDepartmentWorkClaimDtoSchema = z.object({
	id: z.string(),
	attemptId: z.string(),
	memberId: z.string(),
	executionId: z.string(),
	claimGeneration: z.number().int().positive(),
	leaseUntil: z.string(),
	releasedAt: z.string().nullable(),
});
export const aiDepartmentWorkClaimSummaryDtoSchema = z.object({
	memberId: z.string(),
	leaseUntil: z.string(),
	state: z.enum(['active', 'expired', 'released']),
});
export type AiDepartmentWorkClaimSummaryDto = z.infer<typeof aiDepartmentWorkClaimSummaryDtoSchema>;
export const aiDepartmentAgentWorkResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	claim: aiDepartmentWorkClaimDtoSchema.nullable(),
});
export type AiDepartmentAgentWorkResult = z.infer<typeof aiDepartmentAgentWorkResultSchema>;

export const aiDepartmentAgentWorkToolItemSchema = z.object({
	id: z.string(),
	goalId: z.string().nullable(),
	assigneeMemberId: z.string().nullable(),
	instruction: z.string(),
	state: z.enum(AI_DEPARTMENT_WORK_STATES),
	version: z.number().int(),
	childReports: aiDepartmentWorkItemDtoSchema.shape.childReports,
	helpAnswers: aiDepartmentWorkItemDtoSchema.shape.helpAnswers,
});

const aiDepartmentAgentWorkToolActionResultSchema = z.object({
	work: aiDepartmentAgentWorkToolItemSchema,
	claim: aiDepartmentWorkClaimDtoSchema.nullable(),
});

const aiDepartmentWorkDelegateToolResultSchema = aiDepartmentWorkDelegateActionResultSchema.extend({
	child: aiDepartmentAgentWorkToolItemSchema,
});

export const aiDepartmentAgentWorkToolResultSchema = z.union([
	aiDepartmentAgentWorkToolActionResultSchema,
	aiDepartmentAssignedWorkInboxSchema,
	aiDepartmentWorkHandoffResultSchema,
	aiDepartmentWorkHelpActionResultSchema,
	aiDepartmentWorkDelegateToolResultSchema,
]);
export type AiDepartmentAgentWorkToolResult = z.infer<typeof aiDepartmentAgentWorkToolResultSchema>;

export const aiDepartmentWorkActivityDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	attemptId: z.string().nullable(),
	actorId: z.string(),
	actorKind: z.enum(['agent', 'user', 'system']),
	kind: z.string(),
	body: z.string().nullable(),
	report: aiDepartmentWorkCompletionReportSchema.nullable(),
	workVersion: z.number().int(),
	createdAt: z.string(),
});
export type AiDepartmentWorkActivityDto = z.infer<typeof aiDepartmentWorkActivityDtoSchema>;

export class CreateAiDepartmentWorkActivityDto extends Z.class({
	action: z.enum(['comment', 'progress']),
	body: z.string().trim().min(1).max(2000),
	expectedVersion: z.number().int().positive(),
	requestId: z.string().trim().min(1).max(36),
}) {}

export const createAiDepartmentWorkActivitySchema = CreateAiDepartmentWorkActivityDto.schema;

export const aiDepartmentWorkActivityResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	activity: aiDepartmentWorkActivityDtoSchema,
});
export type AiDepartmentWorkActivityResult = z.infer<typeof aiDepartmentWorkActivityResultSchema>;
