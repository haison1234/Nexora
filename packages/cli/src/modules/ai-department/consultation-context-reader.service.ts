import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentConsultationContextReader,
	type DepartmentConsultationResolvedContext,
} from '@/modules/agents/agent-department-consultation.contracts';
import { DirectoryRepository } from './database/repositories/directory.repository';
import { WorkRepository } from './database/repositories/work.repository';

const MAX_CONSULTATION_CONTEXT_CHARS = 24_000;

@Service()
export class ConsultationContextReaderService extends DepartmentConsultationContextReader {
	constructor(
		private readonly workRepository: WorkRepository,
		private readonly directory: DirectoryRepository,
		private readonly users: UserRepository,
	) {
		super();
	}

	async resolve(input: {
		projectId: string;
		departmentId: string;
		helpRequestId: string;
		requesterMemberId: string;
		recipientMemberId: string;
		actorId: string;
		contextRef: string;
	}): Promise<DepartmentConsultationResolvedContext | null> {
		const [request, department, recipient, actor] = await Promise.all([
			this.workRepository.findHelpRequestById(input.projectId, input.helpRequestId),
			this.directory.findDepartment(input.projectId, input.departmentId),
			this.directory.findMember(input.projectId, input.departmentId, input.recipientMemberId),
			this.users.findByIdWithRole(input.actorId),
		]);
		if (
			!request ||
			request.departmentId !== input.departmentId ||
			request.requesterMemberId !== input.requesterMemberId ||
			request.recipientMemberId !== input.recipientMemberId ||
			request.initiatingUserId !== input.actorId ||
			!['awaiting_answer', 'queued'].includes(request.state) ||
			request.bindingVersion === null ||
			!request.deadlineAt ||
			request.deadlineAt.getTime() <= Date.now() ||
			!department ||
			department.archived ||
			!recipient ||
			recipient.archived ||
			!actor ||
			actor.disabled ||
			!(await userHasScopes(actor, ['agent:execute'], false, { projectId: input.projectId }))
		) {
			return null;
		}
		const requester = await this.directory.findMember(
			input.projectId,
			input.departmentId,
			request.requesterMemberId,
		);
		const work = await this.workRepository.findWork(
			input.projectId,
			input.departmentId,
			request.workId,
		);
		const attempt = await this.workRepository.findAttempt(input.projectId, request.sourceAttemptId);
		const binding = await this.directory.findBinding(input.projectId, request.recipientMemberId);
		let attemptedStepsValue: unknown;
		try {
			attemptedStepsValue = JSON.parse(request.attemptedStepsJson);
		} catch {
			return null;
		}
		const attemptedSteps = z.array(z.string()).safeParse(attemptedStepsValue);
		if (
			!requester ||
			requester.archived ||
			!work ||
			work.state !== 'blocked' ||
			work.currentAttemptId !== request.sourceAttemptId ||
			!attempt ||
			attempt.phase !== 'terminal' ||
			!binding ||
			binding.provider !== 'n8n-agent' ||
			binding.version !== request.bindingVersion ||
			!attemptedSteps.success
		) {
			return null;
		}
		const context = [
			`Work: ${work.instruction}`,
			`Question: ${request.question}`,
			`Reason: ${request.reason}`,
			`Steps already tried: ${attemptedSteps.data.join('\n')}`,
		].join('\n\n');
		if (input.contextRef !== request.id || context.length > MAX_CONSULTATION_CONTEXT_CHARS)
			return null;
		return {
			contextHash: createHash('sha256').update(context).digest('hex'),
			inputText: context,
		};
	}
}
