import {
	AiDepartmentMeetingListQueryDto,
	CancelAiDepartmentMeetingDto,
	RetryAiDepartmentMeetingDto,
	CreateAiDepartmentMeetingDto,
	ExcludeAiDepartmentMeetingParticipantDto,
	ResolveAiDepartmentMeetingActionItemDto,
	ResolveAiDepartmentMeetingItemDto,
	SaveAiDepartmentMeetingMinutesDto,
	StartAiDepartmentMeetingDto,
	TakeoverAiDepartmentMeetingDto,
	UpdateAiDepartmentMeetingDto,
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
import { ForbiddenError } from '@n8n/errors';
import type { Response } from 'express';

import { userHasScopes } from '@/permissions.ee/check-access';

import { MeetingService } from './meeting.service';

@Service()
@RestController('/projects/:projectId/ai-departments/:departmentId/meetings')
export class MeetingController {
	constructor(private readonly service: MeetingService) {}

	@Get('/')
	@ProjectScope('agent:list')
	async list(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Query query: AiDepartmentMeetingListQueryDto,
	) {
		return await this.service.list(req.params.projectId, req.params.departmentId, query);
	}

	@Post('/')
	@ProjectScope('agent:create')
	async create(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Body dto: CreateAiDepartmentMeetingDto,
	) {
		return await this.service.create(
			req.params.projectId,
			req.params.departmentId,
			req.user.id,
			dto,
		);
	}

	@Get('/commands/:requestId')
	@ProjectScope('agent:read')
	async commandStatus(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('requestId') requestId: string,
	) {
		return await this.service.getCommandStatus(
			req.params.projectId,
			req.params.departmentId,
			req.user.id,
			requestId,
		);
	}

	@Get('/:meetingId')
	@ProjectScope('agent:read')
	async get(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
	) {
		return await this.service.get(req.params.projectId, req.params.departmentId, meetingId);
	}

	@Patch('/:meetingId')
	@ProjectScope('agent:update')
	async update(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: UpdateAiDepartmentMeetingDto,
	) {
		return await this.service.update(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/start')
	@ProjectScope('agent:execute')
	async start(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: StartAiDepartmentMeetingDto,
	) {
		return await this.service.start(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/cancel')
	@ProjectScope('agent:update')
	async cancel(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: CancelAiDepartmentMeetingDto,
	) {
		return await this.service.cancel(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/participants/:participantId/retry')
	@ProjectScope('agent:update')
	async retryParticipant(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('participantId') participantId: string,
		@Body dto: RetryAiDepartmentMeetingDto,
	) {
		return await this.service.retryParticipant(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			participantId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/synthesis/retry')
	@ProjectScope('agent:update')
	async retrySynthesis(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: RetryAiDepartmentMeetingDto,
	) {
		return await this.service.retrySynthesis(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/participants/:participantId/exclude')
	@ProjectScope('agent:update')
	async excludeParticipant(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('participantId') participantId: string,
		@Body dto: ExcludeAiDepartmentMeetingParticipantDto,
	) {
		return await this.service.excludeParticipant(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			participantId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/takeover')
	@ProjectScope('agent:execute')
	async takeover(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: TakeoverAiDepartmentMeetingDto,
	) {
		if (
			!(await userHasScopes(req.user, ['agent:update'], false, { projectId: req.params.projectId }))
		) {
			throw new ForbiddenError('You need agent update access to take over this meeting');
		}
		return await this.service.takeover(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/action-items/:itemId/convert')
	@ProjectScope('agent:create')
	async convertActionItem(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('itemId') itemId: string,
		@Body dto: ResolveAiDepartmentMeetingActionItemDto,
	) {
		return await this.service.convertActionItem(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			itemId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/minutes')
	@ProjectScope('agent:update')
	async saveMinutes(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Body dto: SaveAiDepartmentMeetingMinutesDto,
	) {
		return await this.service.saveMinutes(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/minutes/:minutesId/approve')
	@ProjectScope('agent:update')
	async approveMinutes(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('minutesId') minutesId: string,
		@Body dto: ResolveAiDepartmentMeetingItemDto,
	) {
		return await this.service.approveMinutes(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			minutesId,
			req.user.id,
			dto,
		);
	}

	@Post('/:meetingId/action-items/:itemId/approve')
	@ProjectScope('agent:update')
	async approveActionItem(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('itemId') itemId: string,
		@Body dto: ResolveAiDepartmentMeetingItemDto,
	) {
		return await this.service.resolveActionItem(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			itemId,
			req.user.id,
			dto,
			'approve',
		);
	}

	@Post('/:meetingId/action-items/:itemId/decline')
	@ProjectScope('agent:update')
	async declineActionItem(
		req: AuthenticatedRequest<{ projectId: string; departmentId: string }>,
		_res: Response,
		@Param('meetingId') meetingId: string,
		@Param('itemId') itemId: string,
		@Body dto: ResolveAiDepartmentMeetingItemDto,
	) {
		return await this.service.resolveActionItem(
			req.params.projectId,
			req.params.departmentId,
			meetingId,
			itemId,
			req.user.id,
			dto,
			'decline',
		);
	}
}
