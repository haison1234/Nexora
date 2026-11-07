import { AuthenticatedRequest } from '@n8n/db';
import { Get, Param, ProjectScope, RestController } from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { Response } from 'express';

import { AiDepartmentOperationsService } from './operations.service';

@Service()
@RestController('/projects/:projectId/ai-departments')
export class AiDepartmentOperationsController {
	constructor(private readonly operations: AiDepartmentOperationsService) {}

	@Get('/:departmentId/operations')
	@ProjectScope('agent:read')
	async getSnapshot(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('departmentId') departmentId: string,
	) {
		return await this.operations.getSnapshot(req.params.projectId, departmentId);
	}
}
