import {
	CreateAiDepartmentWorkflowCapabilityDto,
	UpdateAiDepartmentWorkflowCapabilityDto,
} from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import { Body, Get, Param, Patch, Post, ProjectScope, RestController } from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { Response } from 'express';

import { WorkflowCapabilityService } from './workflow-capability.service';

@Service()
@RestController('/projects/:projectId/ai-departments/:departmentId/members/:memberId/capabilities')
export class WorkflowCapabilityController {
	constructor(private readonly service: WorkflowCapabilityService) {}

	@Get('/')
	@ProjectScope('agent:read')
	async list(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string; memberId: string }>,
		_res: Response,
	) {
		return await this.service.list(
			req.params.projectId,
			req.params.departmentId,
			req.params.memberId,
		);
	}

	@Post('/')
	@ProjectScope('agent:update')
	async create(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string; memberId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentWorkflowCapabilityDto,
	) {
		return await this.service.create(
			req.params.projectId,
			req.user.id,
			req.user,
			req.params.departmentId,
			req.params.memberId,
			dto,
		);
	}

	@Patch('/:capabilityId')
	@ProjectScope('agent:update')
	async update(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string; memberId: string }>,
		_res: Response,
		@Param('capabilityId') capabilityId: string,
		@Body dto: UpdateAiDepartmentWorkflowCapabilityDto,
	) {
		return await this.service.update(
			req.params.projectId,
			req.user.id,
			req.user,
			req.params.departmentId,
			req.params.memberId,
			capabilityId,
			dto,
		);
	}
}
