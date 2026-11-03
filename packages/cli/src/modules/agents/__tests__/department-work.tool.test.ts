import { aiDepartmentAgentWorkActionSchema } from '@n8n/api-types';
import { mock } from 'vitest-mock-extended';

import type { DepartmentWorkActions } from '../agent-department-execution.contracts';
import { createDepartmentWorkTool } from '../tools/department-work.tool';

describe('Department work tool context', () => {
	const service = mock<DepartmentWorkActions>();
	const tool = createDepartmentWorkTool(service, 'project', 'agent').build();
	const handler = tool.handler;
	if (!handler) throw new Error('Missing tool handler');
	beforeEach(() => vi.clearAllMocks());
	it('rejects a missing host execution context before calling the work service', async () => {
		await expect(handler({ action: 'inspect' }, {})).rejects.toThrow('execution context');
		expect(service.executeAction).not.toHaveBeenCalled();
	});
	it('derives identity and retry keys from the host and tool call', async () => {
		const context = {
			toolCallId: 'call',
			persistence: {
				threadId: 'attempt',
				resourceId: 'resource',
				hostMetadata: { n8nExecutionId: 'execution' },
			},
		};
		await handler({ action: 'inspect' }, context);
		await handler({ action: 'inspect' }, context);
		expect(service.executeAction.mock.calls[0][0]).toEqual({
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			executionId: 'execution',
		});
		expect(service.executeAction.mock.calls[0][1]).toBe(service.executeAction.mock.calls[1][1]);
		await handler({ action: 'inspect' }, { ...context, toolCallId: 'other-call' });
		expect(service.executeAction.mock.calls[2][1]).not.toBe(service.executeAction.mock.calls[0][1]);
	});
	it('rejects model-supplied work and actor identifiers', () => {
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'claim',
				expectedVersion: 1,
				workId: 'other-work',
				actorId: 'other-actor',
			}).success,
		).toBe(false);
	});
});
