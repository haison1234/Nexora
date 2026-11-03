import {
	AiDepartmentWorkListQueryDto,
	CreateAiDepartmentWorkRelationshipDto,
	DeleteAiDepartmentWorkRelationshipDto,
	CreateAiDepartmentGoalDto,
	CreateAiDepartmentWorkDto,
	UpdateAiDepartmentGoalDto,
	UpdateAiDepartmentWorkDto,
	UpdateAiDepartmentWorkStateDto,
	ReviewAiDepartmentWorkDto,
} from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import {
	Body,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	ProjectScope,
	Query,
	RestController,
} from '@n8n/decorators';
import { Service } from '@n8n/di';
import { ForbiddenError } from '@n8n/errors';
import type { Response } from 'express';

import { userHasScopes } from '@/permissions.ee/check-access';

import { WorkService } from './work.service';

@Service()
@RestController('/projects/:projectId/ai-departments/:departmentId')
export class WorkController {
	constructor(private readonly service: WorkService) {}

	@Get('/goals')
	@ProjectScope('agent:list')
	async listGoals(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
	) {
		return await this.service.listGoals(req.params.projectId, req.params.departmentId);
	}

	@Get('/goals/:goalId')
	@ProjectScope('agent:read')
	async getGoal(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('goalId') goalId: string,
	) {
		return await this.service.getGoal(req.params.projectId, req.params.departmentId, goalId);
	}

	@Post('/goals')
	@ProjectScope('agent:create')
	async createGoal(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentGoalDto,
	) {
		return await this.service.createGoal(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			dto,
		);
	}

	@Patch('/goals/:goalId')
	@ProjectScope('agent:update')
	async updateGoal(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('goalId') goalId: string,
		@Body dto: UpdateAiDepartmentGoalDto,
	) {
		return await this.service.updateGoal(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			goalId,
			dto,
		);
	}

	@Get('/work')
	@ProjectScope('agent:list')
	async listWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Query query: AiDepartmentWorkListQueryDto,
	) {
		return await this.service.listWork(req.params.projectId, req.params.departmentId, query);
	}

	@Post('/work')
	@ProjectScope('agent:create')
	async createWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentWorkDto,
	) {
		return await this.service.createWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			dto,
		);
	}

	@Get('/work/:workId')
	@ProjectScope('agent:read')
	async getWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
	) {
		return await this.service.getWork(req.params.projectId, req.params.departmentId, workId);
	}

	@Get('/work/:workId/activity')
	@ProjectScope('agent:read')
	async listActivity(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Query query: AiDepartmentWorkListQueryDto,
	) {
		return await this.service.listActivity(
			req.params.projectId,
			req.params.departmentId,
			workId,
			query.take,
			query.skip,
		);
	}

	@Get('/work/:workId/relationships')
	@ProjectScope('agent:list')
	async listRelationships(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
	) {
		return await this.service.listRelationships(
			req.params.projectId,
			req.params.departmentId,
			workId,
		);
	}

	@Post('/work/:workId/relationships')
	@ProjectScope('agent:update')
	async createRelationship(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Body dto: CreateAiDepartmentWorkRelationshipDto,
	) {
		return await this.service.createRelationship(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
	}

	@Delete('/work/:workId/relationships/:relationshipId')
	@ProjectScope('agent:update')
	async deleteRelationship(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Param('relationshipId') relationshipId: string,
		@Body dto: DeleteAiDepartmentWorkRelationshipDto,
	) {
		return await this.service.deleteRelationship(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			relationshipId,
			dto,
		);
	}

	@Patch('/work/:workId')
	@ProjectScope('agent:update')
	async updateWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Body dto: UpdateAiDepartmentWorkDto,
	) {
		return await this.service.updateWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
	}

	@Post('/work/:workId/ready')
	@ProjectScope('agent:update')
	async markReady(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Body dto: UpdateAiDepartmentWorkStateDto,
	) {
		return await this.service.markReady(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
	}

	@Post('/work/:workId/start')
	@ProjectScope('agent:update')
	async startWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		res: Response,
		@Param('workId') workId: string,
		@Body dto: UpdateAiDepartmentWorkStateDto,
	) {
		if (
			!(await userHasScopes(req.user, ['agent:execute'], false, {
				projectId: req.params.projectId,
			}))
		)
			throw new ForbiddenError('You do not have permission to execute this Agent.');
		const result = await this.service.startWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
		res.status(202);
		return result;
	}

	@Post('/work/:workId/retry')
	@ProjectScope('agent:update')
	async retryWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		res: Response,
		@Param('workId') workId: string,
		@Body dto: UpdateAiDepartmentWorkStateDto,
	) {
		if (
			!(await userHasScopes(req.user, ['agent:execute'], false, {
				projectId: req.params.projectId,
			}))
		)
			throw new ForbiddenError('You do not have permission to execute this Agent.');
		const result = await this.service.startWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
			true,
		);
		res.status(202);
		return result;
	}

	@Post('/work/:workId/cancel')
	@ProjectScope('agent:update')
	async cancelWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		res: Response,
		@Param('workId') workId: string,
		@Body dto: UpdateAiDepartmentWorkStateDto,
	) {
		const result = await this.service.cancelWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
		if (result.cancellationPending) res.status(202);
		return result;
	}

	@Post('/work/:workId/review')
	@ProjectScope('agent:update')
	async reviewWork(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Body dto: ReviewAiDepartmentWorkDto,
	) {
		return await this.service.reviewWork(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
	}

	@Get('/work/:workId/history')
	@ProjectScope('agent:read')
	async getWorkHistory(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
	) {
		return await this.service.getWorkHistory(req.params.projectId, req.params.departmentId, workId);
	}

	@Get('/work/:workId/attempts')
	@ProjectScope('agent:read')
	async listAttempts(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
	) {
		return await this.service.listAttempts(req.params.projectId, req.params.departmentId, workId);
	}
}
