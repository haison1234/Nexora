import { Tool } from '@n8n/agents/tool';
import {
	aiDepartmentAgentWorkActionSchema,
	aiDepartmentAgentWorkToolResultSchema,
	aiDepartmentWorkCompletionReportSchema,
} from '@n8n/api-types';
import type { AiDepartmentAgentWorkAction } from '@n8n/api-types';
import { ForbiddenError, UnexpectedError } from '@n8n/errors';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';

import type { DepartmentWorkActions } from '../agent-department-execution.contracts';
import { hostMetadataExecutionId } from '../types/agent-queued-message';

const departmentWorkDelegationSchema = z
	.object({
		recipientMemberId: z.string().trim().min(1).max(36),
		title: z.string().trim().min(1).max(200).optional(),
		instruction: z.string().trim().min(1).max(4000),
	})
	.strict();
const departmentWorkClaimSchema = z.object({}).strict();
const departmentWorkActionSchema = aiDepartmentAgentWorkActionSchema
	.innerType()
	.omit({
		expectedVersion: true,
		report: true,
		recipientMemberId: true,
		title: true,
		instruction: true,
	})
	.extend({
		action: z.enum([
			'inspect',
			'renew',
			'release',
			'inbox',
			'handoff',
			'comment',
			'progress',
			'block',
			'resume',
			'ask',
		]),
	});
const departmentWorkSubmitSchema = z
	.object({
		report: aiDepartmentWorkCompletionReportSchema,
	})
	.strict();

export function createDepartmentWorkTool(
	service: DepartmentWorkActions,
	projectId: string,
	executorId: string,
) {
	return new Tool('department_work')
		.description(
			'Use department_work with action inspect to read assigned work. Then use claim_department_work with no input; the server checks the current version. Comment, progress, block, resume, ask, and handoff use department_work without a version; the server checks the current version. Submit with submit_department_work and a structured report; the server checks the current version. Use arrays for all report list fields. Keep checkedEvidence empty unless you cite work:<work.id> or attempt:<claim.attemptId> exactly. Never invent an evidence reference. When inspect returns a childReports entry with state done, use its report in submit_department_work. Use delegate_department_work to create a child with recipientMemberId, title, and instruction; the server checks the current version. Do not send null fields. Never add other action fields to claim_department_work. A chat reply does not submit a result.',
		)
		.systemInstruction(
			'Claiming work does not complete it. After claim_department_work, follow work.instruction until you submit a structured result or report a blocker. Submit every report list as an array. Keep checkedEvidence empty unless you use a real work:<work.id> or attempt:<claim.attemptId> reference. When inspect returns a childReports entry with state "done", its report is accepted: do not delegate that child again; use the report in your result. If the instruction requires delegation and no accepted child report exists, call delegate_department_work with recipientMemberId, title, and instruction. Do not send a version. Never invent or use a sub-agent tool for department delegation. Delegation starts the parent release with reason "waiting_for_children". Stop after the delegation result; do not call release again.',
		)
		.input(departmentWorkActionSchema)
		.output(aiDepartmentAgentWorkToolResultSchema)
		.endsTurnWhen(
			(result) =>
				('claim' in result && result.claim !== null && result.claim.releasedAt !== null) ||
				'helpRequest' in result ||
				'child' in result,
		)
		.handler(async (input, context) => {
			const executionId = hostMetadataExecutionId(context.persistence?.hostMetadata);
			const attemptId = context.persistence?.threadId;
			if (!executionId || !attemptId || !context.toolCallId)
				throw new ForbiddenError('A department execution context is required.');
			context.abortSignal?.throwIfAborted();
			const requestId = uuidv5(JSON.stringify([executionId, context.toolCallId]), uuidv5.URL);
			let actionInput: AiDepartmentAgentWorkAction = input;
			if (input.action !== 'inspect' && input.action !== 'inbox') {
				const inspectionRequestId = uuidv5(
					JSON.stringify([executionId, context.toolCallId, 'inspect-version']),
					uuidv5.URL,
				);
				const inspection = await service.executeToolAction(
					{ projectId, executorId, attemptId, executionId },
					inspectionRequestId,
					{ action: 'inspect' },
				);
				if (!('work' in inspection))
					throw new UnexpectedError('Department work inspection returned no work item.');
				context.abortSignal?.throwIfAborted();
				actionInput = { ...input, expectedVersion: inspection.work.version };
			}
			return await service.executeToolAction(
				{ projectId, executorId, attemptId, executionId },
				requestId,
				actionInput,
			);
		});
}

export function createDepartmentWorkDelegationTool(
	service: DepartmentWorkActions,
	projectId: string,
	executorId: string,
) {
	return new Tool('delegate_department_work')
		.description(
			'Delegate a child Work item to a department member. Send the member ID and exact child instruction from the assigned work. Include a title when available; the tool can infer a title from the instruction. Do not send a work version. The tool claims the work if this run does not hold a current claim. Call this tool only when the assigned instruction requires delegation.',
		)
		.systemInstruction(
			'Use this tool to create department child work. Send recipientMemberId, instruction, and title when it is clear. If title is missing, include the phrase title "..." in the instruction. Do not send a work version; the server checks the current version. Do not call delegate_subagent or another runtime delegation tool. Successful delegation starts the parent release with reason "waiting_for_children". Stop after this tool returns the child work.',
		)
		.input(departmentWorkDelegationSchema)
		.output(aiDepartmentAgentWorkToolResultSchema)
		.endsTurnWhen((result) => 'child' in result)
		.handler(async (input, context) => {
			const executionId = hostMetadataExecutionId(context.persistence?.hostMetadata);
			const attemptId = context.persistence?.threadId;
			if (!executionId || !attemptId || !context.toolCallId)
				throw new ForbiddenError('A department execution context is required.');
			context.abortSignal?.throwIfAborted();
			const requestId = uuidv5(JSON.stringify([executionId, context.toolCallId]), uuidv5.URL);
			const runContext = { projectId, executorId, attemptId, executionId };
			let inspection = await service.executeToolAction(runContext, requestId, {
				action: 'inspect',
			});
			if (!('work' in inspection) || !('claim' in inspection))
				throw new UnexpectedError('Department work inspection returned no work item.');
			context.abortSignal?.throwIfAborted();
			if (!inspection.claim || inspection.claim.releasedAt !== null) {
				const claimRequestId = uuidv5(
					JSON.stringify([executionId, context.toolCallId, 'claim']),
					uuidv5.URL,
				);
				await service.executeToolAction(runContext, claimRequestId, {
					action: 'claim',
					expectedVersion: inspection.work.version,
				});
				inspection = await service.executeToolAction(runContext, requestId, { action: 'inspect' });
				if (!('work' in inspection) || !('claim' in inspection))
					throw new UnexpectedError('Department work inspection returned no work item.');
			}
			const inferredTitle = input.instruction.match(/\btitle\s+["']([^"']{1,200})["']/i)?.[1];
			const title =
				input.title ??
				inferredTitle ??
				(input.instruction
					.split(/[.!?\n]/, 1)[0]
					.slice(0, 200)
					.trim() ||
					'Department follow-up');
			return await service.executeToolAction(runContext, requestId, {
				action: 'delegate',
				expectedVersion: inspection.work.version,
				recipientMemberId: input.recipientMemberId,
				title,
				instruction: input.instruction,
			});
		});
}

export function createDepartmentWorkClaimTool(
	service: DepartmentWorkActions,
	projectId: string,
	executorId: string,
) {
	return new Tool('claim_department_work')
		.description(
			'Claim your assigned department work. Send no input. The server checks the current version. A claim reserves the work; it does not complete the task.',
		)
		.systemInstruction(
			'Call this tool after department_work inspection. Send no input. The server checks the current work version. Then follow the assigned instruction.',
		)
		.input(departmentWorkClaimSchema)
		.output(aiDepartmentAgentWorkToolResultSchema)
		.handler(async (_input, context) => {
			const executionId = hostMetadataExecutionId(context.persistence?.hostMetadata);
			const attemptId = context.persistence?.threadId;
			if (!executionId || !attemptId || !context.toolCallId)
				throw new ForbiddenError('A department execution context is required.');
			context.abortSignal?.throwIfAborted();
			const requestId = uuidv5(JSON.stringify([executionId, context.toolCallId]), uuidv5.URL);
			const runContext = { projectId, executorId, attemptId, executionId };
			const inspection = await service.executeToolAction(runContext, requestId, {
				action: 'inspect',
			});
			if (!('work' in inspection) || !('claim' in inspection))
				throw new UnexpectedError('Department work inspection returned no work item.');
			context.abortSignal?.throwIfAborted();
			if (inspection.claim?.executionId === executionId && inspection.claim.releasedAt === null)
				return inspection;
			return await service.executeToolAction(runContext, requestId, {
				action: 'claim',
				expectedVersion: inspection.work.version,
			});
		});
}

export function createDepartmentWorkSubmitTool(
	service: DepartmentWorkActions,
	projectId: string,
	executorId: string,
) {
	return new Tool('submit_department_work')
		.description(
			'Submit your structured business result for the assigned department work. Send report only; the server checks the current work version. The tool claims the work if this run does not hold a current claim. If childReports contains a child with state done, use its accepted report in your result instead of delegating the child again.',
		)
		.systemInstruction(
			'Use this tool to submit the parent work result after required child reports are accepted. Include result, completedWork, checkedEvidence, openIssues, and nextSteps. Send every list as an array. Do not send a work version. Do not use this tool before the work is complete.',
		)
		.input(departmentWorkSubmitSchema)
		.output(aiDepartmentAgentWorkToolResultSchema)
		.endsTurnWhen((result) => 'work' in result && result.work.state === 'review')
		.handler(async (input, context) => {
			const executionId = hostMetadataExecutionId(context.persistence?.hostMetadata);
			const attemptId = context.persistence?.threadId;
			if (!executionId || !attemptId || !context.toolCallId)
				throw new ForbiddenError('A department execution context is required.');
			context.abortSignal?.throwIfAborted();
			const requestId = uuidv5(JSON.stringify([executionId, context.toolCallId]), uuidv5.URL);
			const runContext = { projectId, executorId, attemptId, executionId };
			let inspection = await service.executeToolAction(runContext, requestId, {
				action: 'inspect',
			});
			if (!('work' in inspection) || !('claim' in inspection))
				throw new UnexpectedError('Department work inspection returned no work item.');
			context.abortSignal?.throwIfAborted();
			if (!inspection.claim || inspection.claim.releasedAt !== null) {
				const claimRequestId = uuidv5(
					JSON.stringify([executionId, context.toolCallId, 'claim']),
					uuidv5.URL,
				);
				await service.executeToolAction(runContext, claimRequestId, {
					action: 'claim',
					expectedVersion: inspection.work.version,
				});
				inspection = await service.executeToolAction(runContext, requestId, { action: 'inspect' });
				if (!('work' in inspection) || !('claim' in inspection))
					throw new UnexpectedError('Department work inspection returned no work item.');
			}
			return await service.executeToolAction(runContext, requestId, {
				action: 'submit',
				expectedVersion: inspection.work.version,
				...input,
			});
		});
}
