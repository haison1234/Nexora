import { Tool } from '@n8n/agents/tool';
import {
	aiDepartmentAgentWorkActionSchema,
	aiDepartmentAgentWorkResultSchema,
} from '@n8n/api-types';
import { ForbiddenError } from '@n8n/errors';
import { v5 as uuidv5 } from 'uuid';

import type { DepartmentWorkActions } from '../agent-department-execution.contracts';
import { hostMetadataExecutionId } from '../types/agent-queued-message';

export function createDepartmentWorkTool(
	service: DepartmentWorkActions,
	projectId: string,
	executorId: string,
) {
	return new Tool('department_work')
		.description(
			'Inspect your assigned department work. Claim it before making changes. Use the returned work.version as expectedVersion. Renew the claim during long work. Report progress or a blocker. Submit the final business result with submit. A chat reply does not submit a result. Release the claim when you must hand work back to the coordinator.',
		)
		.input(aiDepartmentAgentWorkActionSchema)
		.output(aiDepartmentAgentWorkResultSchema)
		.endsTurnWhen((result) => result.claim?.releasedAt != null)
		.handler(async (input, context) => {
			const executionId = hostMetadataExecutionId(context.persistence?.hostMetadata);
			const attemptId = context.persistence?.threadId;
			if (!executionId || !attemptId || !context.toolCallId)
				throw new ForbiddenError('A department execution context is required.');
			context.abortSignal?.throwIfAborted();
			const requestId = uuidv5(JSON.stringify([executionId, context.toolCallId]), uuidv5.URL);
			return await service.executeAction(
				{ projectId, executorId, attemptId, executionId },
				requestId,
				input,
			);
		});
}
