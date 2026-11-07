import { z } from 'zod';
import { Z } from '../zod-class';

export const AI_DEPARTMENT_WORKFLOW_DISPATCH_STATES = [
	'pending',
	'acknowledged',
	'unknown',
	'rejected',
] as const;
export const AI_DEPARTMENT_WORKFLOW_CHILD_STATES = [
	'pending',
	'running',
	'waiting',
	'retrying',
	'succeeded',
	'failed',
	'cancelled',
	'unknown',
] as const;

export type AiDepartmentWorkflowDispatchState =
	(typeof AI_DEPARTMENT_WORKFLOW_DISPATCH_STATES)[number];
export type AiDepartmentWorkflowChildState = (typeof AI_DEPARTMENT_WORKFLOW_CHILD_STATES)[number];

/** Approved capability revision copied into a department work attempt. */
export type AiDepartmentWorkflowCapabilitySnapshot = {
	id: string;
	workflowId: string;
	version: number;
	purpose: string;
	publishedVersionRef: string;
	triggerCompatibilityRef: string;
	inputSchemaFingerprint: string;
};

const requestId = z.string().trim().min(1).max(36);

export class CreateAiDepartmentWorkflowCapabilityDto extends Z.class({
	workflowId: z.string().trim().min(1).max(36),
	purpose: z.string().trim().min(1).max(2000),
	enabled: z.boolean().default(false),
	requestId,
}) {}

export class UpdateAiDepartmentWorkflowCapabilityDto extends Z.class({
	purpose: z.string().trim().min(1).max(2000).optional(),
	enabled: z.boolean().optional(),
	refreshPublication: z.boolean().default(false),
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}

export class InvokeAiDepartmentWorkflowDto extends Z.class({
	capabilityId: z.string().trim().min(1).max(36),
	requestId,
	inputsRef: z.string().trim().min(1).max(255),
}) {}

export const aiDepartmentWorkflowCapabilityDtoSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	departmentId: z.string(),
	memberId: z.string(),
	workflowId: z.string(),
	purpose: z.string(),
	publishedVersionRef: z.string(),
	triggerCompatibilityRef: z.string(),
	inputSchemaFingerprint: z.string(),
	enabled: z.boolean(),
	version: z.number().int().positive(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type AiDepartmentWorkflowCapabilityDto = z.infer<
	typeof aiDepartmentWorkflowCapabilityDtoSchema
>;

export const aiDepartmentWorkflowInvocationDtoSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	workId: z.string(),
	attemptId: z.string(),
	memberId: z.string(),
	capabilityId: z.string(),
	capabilityVersion: z.number().int().positive(),
	claimGeneration: z.number().int().nonnegative(),
	requestId: z.string(),
	dispatchState: z.enum(AI_DEPARTMENT_WORKFLOW_DISPATCH_STATES),
	childState: z.enum(AI_DEPARTMENT_WORKFLOW_CHILD_STATES),
	ownerExecutionRef: z.string().nullable(),
	expectedWorkflowVersion: z.string().nullable(),
	actualWorkflowVersion: z.string().nullable(),
	version: z.number().int().positive(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type AiDepartmentWorkflowInvocationDto = z.infer<
	typeof aiDepartmentWorkflowInvocationDtoSchema
>;

export const aiDepartmentWorkflowInvocationListSchema = z.object({
	data: z.array(aiDepartmentWorkflowInvocationDtoSchema),
});
export type AiDepartmentWorkflowInvocationList = z.infer<
	typeof aiDepartmentWorkflowInvocationListSchema
>;
