import type {
	AiDepartmentAssignedWorkInbox,
	AiDepartmentAssignedWorkInboxQueryDto,
} from '@n8n/api-types';
import { Service } from '@n8n/di';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@n8n/errors';
import { z } from 'zod';

import type {
	DepartmentInboxAuthority,
	DepartmentWorkInbox,
} from '@/modules/agents/agent-department-execution.contracts';

import { DirectoryRepository } from '../database/repositories/directory.repository';
import { WorkRepository } from '../database/repositories/work.repository';
import { DepartmentExecutorProxy } from './executor.contracts';

type InboxCursor = {
	projectId: string;
	departmentId: string;
	actorId: string;
	memberId: string;
	bindingVersion: number;
	eligibleAt: string;
	workId: string;
};

const inboxCursorSchema = z
	.object({
		projectId: z.string().min(1),
		departmentId: z.string().min(1),
		actorId: z.string().min(1),
		memberId: z.string().min(1),
		bindingVersion: z.number().int().positive(),
		eligibleAt: z.string().datetime(),
		workId: z.string().min(1),
	})
	.strict();

function decodeCursor(value: string): InboxCursor {
	try {
		return inboxCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
	} catch {
		throw new BadRequestError('The assigned work cursor is invalid.');
	}
}

function encodeCursor(cursor: InboxCursor) {
	return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Lists eligible work for one verified member and binding lane. */
@Service()
export class WorkInboxService implements DepartmentWorkInbox {
	constructor(
		private readonly repository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly executor: DepartmentExecutorProxy,
	) {}

	async listAssigned(
		authority: DepartmentInboxAuthority,
		query: AiDepartmentAssignedWorkInboxQueryDto,
	): Promise<AiDepartmentAssignedWorkInbox> {
		const member = await this.repository.findMemberById(authority.projectId, authority.memberId);
		if (!member || member.archived) throw new NotFoundError('Department member not found.');
		const department = await this.repository.findDepartment(
			authority.projectId,
			member.departmentId,
		);
		if (!department || department.archived) throw new NotFoundError('Department not found.');

		const binding = await this.directory.findBinding(authority.projectId, member.id);
		if (
			!binding ||
			binding.provider !== 'n8n-agent' ||
			binding.executorId !== authority.executorId ||
			binding.version !== authority.bindingVersion
		)
			throw new ConflictError('The assigned work binding has changed. Reload the inbox.');

		const resolution = await this.executor.resolve({
			actorId: authority.actorId,
			projectId: authority.projectId,
			memberId: member.id,
			executorId: binding.executorId,
			bindingVersion: binding.version,
		});
		if (!resolution.authorized)
			throw new ForbiddenError('You do not have permission to read this Agent inbox.');

		let after: { eligibleAt: Date; workId: string } | undefined;
		if (query.cursor) {
			const cursor = decodeCursor(query.cursor);
			if (
				cursor.projectId !== authority.projectId ||
				cursor.departmentId !== member.departmentId ||
				cursor.actorId !== authority.actorId ||
				cursor.memberId !== member.id ||
				cursor.bindingVersion !== binding.version
			)
				throw new ConflictError('The assigned work cursor is for a different inbox lane.');
			after = { eligibleAt: new Date(cursor.eligibleAt), workId: cursor.workId };
		}

		const rows = await this.repository.listPendingAssignedEligibility(
			authority.projectId,
			member.departmentId,
			member.id,
			authority.actorId,
			binding.version,
			query.take + 1,
			after,
			{},
		);
		const hasMore = rows.length > query.take;
		const page = rows.slice(0, query.take);
		const works = await this.repository.findWorkItemsByIds(
			authority.projectId,
			member.departmentId,
			page.map(({ workId }) => workId),
			{},
		);
		const workById = new Map(works.map((work) => [work.id, work]));
		const data = page.flatMap((eligibility) => {
			const work = workById.get(eligibility.workId);
			if (!work) return [];
			return [
				{
					workId: work.id,
					departmentId: work.departmentId,
					goalId: work.goalId,
					assigneeMemberId: member.id,
					instruction: work.instruction,
					priority: work.priority,
					dueAt: work.dueAt?.toISOString() ?? null,
					reviewPolicy: work.reviewPolicy,
					version: work.version,
					eligibilityGeneration: eligibility.generation,
					eligibleAt: eligibility.eligibleAt.toISOString(),
				},
			];
		});
		const last = page.at(-1);
		const nextCursor =
			hasMore && last
				? encodeCursor({
						projectId: authority.projectId,
						departmentId: member.departmentId,
						actorId: authority.actorId,
						memberId: member.id,
						bindingVersion: binding.version,
						eligibleAt: last.eligibleAt.toISOString(),
						workId: last.workId,
					})
				: null;
		const lane = await this.repository.findWakeLane(
			authority.projectId,
			member.id,
			authority.actorId,
			binding.version,
			{},
		);
		return {
			data,
			nextCursor,
			bindingAvailability: resolution.canStart ? 'available' : 'unavailable',
			wake: lane
				? {
						generation: lane.generation,
						acknowledgedGeneration: lane.acknowledgedGeneration,
						state: lane.state,
					}
				: null,
		};
	}
}
