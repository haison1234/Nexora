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
export const AI_DEPARTMENT_WORK_STATES = [
	'backlog',
	'ready',
	'running',
	'review',
	'blocked',
	'done',
	'cancelled',
] as const;

export type AiDepartmentGoalState = (typeof AI_DEPARTMENT_GOAL_STATES)[number];
export type AiDepartmentWorkPriority = (typeof AI_DEPARTMENT_WORK_PRIORITIES)[number];
export type AiDepartmentReviewPolicy = (typeof AI_DEPARTMENT_REVIEW_POLICIES)[number];
export type AiDepartmentWorkState = (typeof AI_DEPARTMENT_WORK_STATES)[number];

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
	...commandFields,
}) {}

export class UpdateAiDepartmentWorkDto extends Z.class({
	instruction: z.string().trim().min(1).max(20000).optional(),
	goalId: z.string().max(36).nullable().optional(),
	assigneeMemberId: z.string().max(36).nullable().optional(),
	priority: z.enum(AI_DEPARTMENT_WORK_PRIORITIES).optional(),
	dueAt: z.string().datetime().nullable().optional(),
	reviewPolicy: z.enum(AI_DEPARTMENT_REVIEW_POLICIES).optional(),
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
	state: z.enum(AI_DEPARTMENT_WORK_STATES),
	currentAttemptId: z.string().nullable(),
	version: z.number().int(),
	createdAt: z.string(),
	updatedAt: z.string(),
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
	decision: z.enum(['accept', 'return']),
	reason: z.string().trim().max(2000).nullable().optional(),
}) {}

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
});
export type AiDepartmentReviewResult = z.infer<typeof aiDepartmentReviewResultSchema>;

export const aiDepartmentWorkAttemptDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	ordinal: z.number().int(),
	memberId: z.string(),
	provider: z.string(),
	executorId: z.string(),
	phase: z.enum(['dispatching', 'active', 'suspended', 'terminal']),
	outcome: z.enum(['succeeded', 'failed', 'cancelled']).nullable(),
	cancellationPending: z.boolean(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});
export type AiDepartmentWorkAttemptDto = z.infer<typeof aiDepartmentWorkAttemptDtoSchema>;

export const aiDepartmentAgentWorkActionSchema = z
	.object({
		action: z.enum([
			'inspect',
			'claim',
			'renew',
			'release',
			'comment',
			'progress',
			'block',
			'resume',
			'submit',
		]),
		expectedVersion: z.number().int().positive().optional(),
		body: z.string().trim().min(1).max(2000).optional(),
	})
	.strict();
export type AiDepartmentAgentWorkAction = z.infer<typeof aiDepartmentAgentWorkActionSchema>;

export const aiDepartmentWorkClaimDtoSchema = z.object({
	id: z.string(),
	attemptId: z.string(),
	memberId: z.string(),
	executionId: z.string(),
	leaseUntil: z.string(),
	releasedAt: z.string().nullable(),
});
export const aiDepartmentAgentWorkResultSchema = z.object({
	work: aiDepartmentWorkItemDtoSchema,
	claim: aiDepartmentWorkClaimDtoSchema.nullable(),
});
export type AiDepartmentAgentWorkResult = z.infer<typeof aiDepartmentAgentWorkResultSchema>;

export const aiDepartmentWorkActivityDtoSchema = z.object({
	id: z.string(),
	workId: z.string(),
	attemptId: z.string().nullable(),
	actorId: z.string(),
	actorKind: z.enum(['agent', 'user', 'system']),
	kind: z.string(),
	body: z.string().nullable(),
	workVersion: z.number().int(),
	createdAt: z.string(),
});
export type AiDepartmentWorkActivityDto = z.infer<typeof aiDepartmentWorkActivityDtoSchema>;
