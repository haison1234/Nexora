import {
	AiDepartmentListQueryDto,
	ArchiveAiDepartmentDto,
	CreateAiDepartmentDto,
	UpdateAiDepartmentDto,
} from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import {
	Body,
	Get,
	Param,
	Patch,
	Post,
	ProjectScope,
	Query,
	RestController,
} from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { Response } from 'express';
import { DepartmentService } from './department.service';

@Service()
@RestController('/projects/:projectId/ai-departments')
export class DepartmentController {
	constructor(private readonly service: DepartmentService) {}

	@Get('/')
	@ProjectScope('agent:list')
	async list(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Query query: AiDepartmentListQueryDto,
	) {
		return await this.service.list(req.params.projectId, query.includeArchived === 'true');
	}

	@Post('/')
	@ProjectScope('agent:create')
	async create(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentDto,
	) {
		return await this.service.create(req.params.projectId, req.user.id, dto);
	}

	@Get('/:departmentId')
	@ProjectScope('agent:read')
	async get(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('departmentId') departmentId: string,
	) {
		return await this.service.get(req.params.projectId, departmentId);
	}

	@Patch('/:departmentId')
	@ProjectScope('agent:update')
	async update(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('departmentId') departmentId: string,
		@Body dto: UpdateAiDepartmentDto,
	) {
		return await this.service.update(req.params.projectId, req.user.id, departmentId, dto);
	}

	@Post('/:departmentId/archive')
	@ProjectScope('agent:update')
	async archive(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('departmentId') departmentId: string,
		@Body dto: ArchiveAiDepartmentDto,
	) {
		return await this.service.archive(req.params.projectId, req.user.id, departmentId, dto);
	}
}
