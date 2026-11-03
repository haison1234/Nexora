import { z } from 'zod';
import { Z } from '../zod-class';

export type AiDepartmentDto = {
	id: string;
	projectId: string;
	name: string;
	description: string | null;
	archived: boolean;
	version: number;
	createdAt: string;
	updatedAt: string;
};

export type AiDepartmentMemberDto = {
	id: string;
	projectId: string;
	departmentId: string;
	name: string;
	role: string;
	managerMemberId: string | null;
	archived: boolean;
	version: number;
	executionState: 'unconfigured' | 'available' | 'unavailable';
	createdAt: string;
	updatedAt: string;
};

const requestId = z.string().trim().min(1).max(128);

export class AiDepartmentListQueryDto extends Z.class({
	includeArchived: z.enum(['true', 'false']).optional(),
}) {}

export class CreateAiDepartmentDto extends Z.class({
	name: z.string().trim().min(1).max(128),
	description: z.string().trim().max(2000).nullable().optional(),
	requestId,
}) {}

export class UpdateAiDepartmentDto extends Z.class({
	name: z.string().trim().min(1).max(128).optional(),
	description: z.string().trim().max(2000).nullable().optional(),
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}

export class ArchiveAiDepartmentDto extends Z.class({
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}

export class CreateAiDepartmentMemberDto extends Z.class({
	name: z.string().trim().min(1).max(128),
	role: z.string().trim().min(1).max(128),
	managerMemberId: z.string().max(36).nullable().optional(),
	requestId,
}) {}

export class UpdateAiDepartmentMemberDto extends Z.class({
	name: z.string().trim().min(1).max(128).optional(),
	role: z.string().trim().min(1).max(128).optional(),
	managerMemberId: z.string().max(36).nullable().optional(),
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}

export class SetAiDepartmentExecutorBindingDto extends Z.class({
	provider: z.literal('n8n-agent'),
	executorId: z.string().trim().min(1).max(36),
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}

export class ClearAiDepartmentExecutorBindingDto extends Z.class({
	expectedVersion: z.number().int().positive(),
	requestId,
}) {}
