import {
	AiDepartmentListQueryDto,
	ArchiveAiDepartmentDto,
	ClearAiDepartmentExecutorBindingDto,
	CreateAiDepartmentMemberDto,
	SetAiDepartmentExecutorBindingDto,
	UpdateAiDepartmentMemberDto,
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
	Put,
	Query,
	RestController,
} from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { Response } from 'express';
import { MemberService } from './member.service';

@Service()
@RestController('/projects/:projectId/ai-departments/:departmentId/members')
export class MemberController {
	constructor(private readonly service: MemberService) {}

	@Get('/')
	@ProjectScope('agent:list')
	async list(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Query query: AiDepartmentListQueryDto,
	) {
		return await this.service.list(
			req.params.projectId,
			req.params.departmentId,
			query.includeArchived === 'true',
		);
	}

	@Post('/')
	@ProjectScope('agent:create')
	async create(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentMemberDto,
	) {
		return await this.service.create(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			dto,
		);
	}

	@Patch('/:memberId')
	@ProjectScope('agent:update')
	async update(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('memberId') memberId: string,
		@Body dto: UpdateAiDepartmentMemberDto,
	) {
		return await this.service.update(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			memberId,
			dto,
		);
	}

	@Post('/:memberId/archive')
	@ProjectScope('agent:update')
	async archive(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('memberId') memberId: string,
		@Body dto: ArchiveAiDepartmentDto,
	) {
		return await this.service.archive(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			memberId,
			dto,
		);
	}

	@Get('/:memberId/executor-binding')
	@ProjectScope('agent:read')
	async getBinding(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('memberId') memberId: string,
	) {
		return await this.service.getBinding(req.params.projectId, req.params.departmentId, memberId);
	}

	@Put('/:memberId/executor-binding')
	@ProjectScope('agent:update')
	async setBinding(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('memberId') memberId: string,
		@Body dto: SetAiDepartmentExecutorBindingDto,
	) {
		return await this.service.setBinding(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			memberId,
			dto,
		);
	}

	@Delete('/:memberId/executor-binding')
	@ProjectScope('agent:update')
	async clearBinding(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('memberId') memberId: string,
		@Body dto: ClearAiDepartmentExecutorBindingDto,
	) {
		return await this.service.clearBinding(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			memberId,
			dto,
		);
	}
}
