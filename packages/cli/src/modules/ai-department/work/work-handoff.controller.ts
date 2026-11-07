import { AuthorizeAiDepartmentWorkHandoffDto, HandoffAiDepartmentWorkDto } from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import { Body, Get, Param, Post, ProjectScope, RestController } from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { Response } from 'express';

import { WorkHandoffService } from './work-handoff.service';

@Service()
@RestController('/projects/:projectId/ai-departments/:departmentId')
export class WorkHandoffController {
	constructor(private readonly service: WorkHandoffService) {}

	@Post('/work/:workId/handoff')
	@ProjectScope('agent:update')
	async requestHandoff(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		res: Response,
		@Param('workId') workId: string,
		@Body dto: HandoffAiDepartmentWorkDto,
	) {
		const result = await this.service.requestHandoff(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			dto,
		);
		if (result.state === 'awaiting_stop') res.status(202);
		return result;
	}

	@Get('/work/:workId/handoffs/:handoffId')
	@ProjectScope('agent:read')
	async getHandoff(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('workId') workId: string,
		@Param('handoffId') handoffId: string,
	) {
		return await this.service.getHandoff(
			req.params.projectId,
			req.params.departmentId,
			workId,
			handoffId,
		);
	}

	@Post('/work/:workId/handoffs/:handoffId/authorize')
	@ProjectScope('agent:update')
	async authorizeHandoff(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		res: Response,
		@Param('workId') workId: string,
		@Param('handoffId') handoffId: string,
		@Body dto: AuthorizeAiDepartmentWorkHandoffDto,
	) {
		const result = await this.service.authorizeHandoff(
			req.params.projectId,
			req.user.id,
			req.params.departmentId,
			workId,
			handoffId,
			dto,
		);
		if (result.state === 'awaiting_stop') res.status(202);
		return result;
	}
}
