import {
	aiDepartmentAgentWorkActionSchema,
	type AiDepartmentAgentWorkToolResult,
} from '@n8n/api-types';
import { mock } from 'vitest-mock-extended';

import type { DepartmentWorkActions } from '../agent-department-execution.contracts';
import {
	createDepartmentWorkClaimTool,
	createDepartmentWorkDelegationTool,
	createDepartmentWorkSubmitTool,
	createDepartmentWorkTool,
} from '../tools/department-work.tool';

describe('Department work tool context', () => {
	const service = mock<DepartmentWorkActions>();
	const tool = createDepartmentWorkTool(service, 'project', 'agent').build();
	const delegationTool = createDepartmentWorkDelegationTool(service, 'project', 'agent').build();
	const submitTool = createDepartmentWorkSubmitTool(service, 'project', 'agent').build();
	const inspectedWork: AiDepartmentAgentWorkToolResult = {
		work: {
			id: 'work',
			goalId: null,
			assigneeMemberId: 'member',
			instruction: 'Do the assigned work.',
			state: 'ready',
			version: 7,
			childReports: [],
			helpAnswers: [],
		},
		claim: null,
	};
	const handler = tool.handler;
	if (!handler) throw new Error('Missing tool handler');
	beforeEach(() => vi.clearAllMocks());
	it('rejects a missing host execution context before calling the work service', async () => {
		await expect(handler({ action: 'inspect' }, {})).rejects.toThrow('execution context');
		expect(service.executeToolAction).not.toHaveBeenCalled();
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
		expect(service.executeToolAction.mock.calls[0][0]).toEqual({
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			executionId: 'execution',
		});
		expect(service.executeToolAction.mock.calls[0][1]).toBe(
			service.executeToolAction.mock.calls[1][1],
		);
		await handler({ action: 'inspect' }, { ...context, toolCallId: 'other-call' });
		expect(service.executeToolAction.mock.calls[2][1]).not.toBe(
			service.executeToolAction.mock.calls[0][1],
		);
	});
	it('rejects model-supplied work and actor identifiers', () => {
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'inspect',
				expectedVersion: null,
			}).success,
		).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'claim',
				expectedVersion: 1,
				workId: 'other-work',
				actorId: 'other-actor',
			}).success,
		).toBe(false);
	});
	it('normalizes null optional fields emitted by Agent tool providers', () => {
		const parsed = aiDepartmentAgentWorkActionSchema.safeParse({
			action: 'claim',
			expectedVersion: 4,
			recipientMemberId: null,
			body: null,
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.action).toBe('claim');
			expect(parsed.data.expectedVersion).toBe(4);
			expect(parsed.data.recipientMemberId).toBeUndefined();
			expect(parsed.data.body).toBeUndefined();
		}
	});
	it('keeps the Agent turn open after inspect and claim', () => {
		const endsTurn = tool.endsTurn;
		expect(endsTurn).toBeTypeOf('function');
		expect(endsTurn?.({ claim: null })).toBe(false);
		expect(endsTurn?.({ claim: { releasedAt: null } })).toBe(false);
		expect(endsTurn?.({ claim: { releasedAt: '2026-11-07T00:00:00.000Z' } })).toBe(true);
	});
	it('documents the server-owned version checks for Agent actions', () => {
		const inputSchema = tool.inputSchema;
		if (!inputSchema || !('safeParse' in inputSchema))
			throw new Error('Department work tool schema is unavailable.');
		expect(tool.description).toContain('claim_department_work with no input');
		expect(tool.description).toContain('server checks the current version');
		expect(inputSchema.safeParse({ action: 'progress', body: 'Drafted the post.' }).success).toBe(
			true,
		);
		expect(tool.description).toContain('Use delegate_department_work to create a child');
		expect(tool.systemInstruction).toContain('Claiming work does not complete it');
		expect(tool.systemInstruction).toContain('Never invent or use a sub-agent tool');
		expect(tool.systemInstruction).toContain('childReports entry with state "done"');
		expect(tool.systemInstruction).toContain('waiting_for_children');
		expect(inputSchema.safeParse({ action: 'claim', expectedVersion: 5 }).success).toBe(false);
		expect(inputSchema.safeParse({ action: 'submit', report: {} }).success).toBe(false);
		expect(inputSchema.safeParse({ action: 'delegate', expectedVersion: 5 }).success).toBe(false);
	});
	it('rejects delegation fields on progress actions', () => {
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'progress',
				expectedVersion: 4,
				body: 'Drafted the requested post.',
				title: 'Progress update',
			}).success,
		).toBe(false);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'progress',
				expectedVersion: 4,
				body: 'Drafted the requested post.',
			}).success,
		).toBe(true);
		expect(
			aiDepartmentAgentWorkActionSchema.safeParse({
				action: 'delegate',
				expectedVersion: 4,
				recipientMemberId: 'member-2',
				title: 'Draft a social post',
				instruction: 'Write one short post.',
			}).success,
		).toBe(true);
	});
	it('derives the owner context and stable request ID for inbox and handoff actions', async () => {
		const context = {
			toolCallId: 'handoff-call',
			persistence: {
				threadId: 'attempt',
				resourceId: 'resource',
				hostMetadata: { n8nExecutionId: 'execution' },
			},
		};
		service.executeToolAction
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork);
		await handler({ action: 'inbox', take: 10 }, context);
		await handler(
			{
				action: 'handoff',
				expectedVersion: 3,
				destinationMemberId: 'destination',
				body: 'Transfer this work.',
			},
			context,
		);
		expect(service.executeToolAction.mock.calls[0][0]).toEqual({
			projectId: 'project',
			executorId: 'agent',
			attemptId: 'attempt',
			executionId: 'execution',
		});
		expect(service.executeToolAction.mock.calls[2][1]).toBe(
			service.executeToolAction.mock.calls[0][1],
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ projectId: 'project', executorId: 'agent' }),
			expect.any(String),
			{
				action: 'handoff',
				expectedVersion: 7,
				destinationMemberId: 'destination',
				body: 'Transfer this work.',
			},
		);
	});
	it('runs department delegation through a dedicated owner-bound tool', async () => {
		const handler = delegationTool.handler;
		if (!handler) throw new Error('Missing delegation tool handler');
		const context = {
			toolCallId: 'delegate-call',
			persistence: {
				threadId: 'attempt',
				resourceId: 'resource',
				hostMetadata: { n8nExecutionId: 'execution' },
			},
		};
		service.executeToolAction
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork);
		await handler(
			{
				recipientMemberId: 'member',
				instruction: 'Use title "Cafe social post". Write one cafe post.',
			},
			context,
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			1,
			{
				projectId: 'project',
				executorId: 'agent',
				attemptId: 'attempt',
				executionId: 'execution',
			},
			expect.any(String),
			{ action: 'inspect' },
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ projectId: 'project', executorId: 'agent' }),
			expect.any(String),
			{ action: 'claim', expectedVersion: 7 },
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			4,
			{
				projectId: 'project',
				executorId: 'agent',
				attemptId: 'attempt',
				executionId: 'execution',
			},
			expect.any(String),
			{
				action: 'delegate',
				expectedVersion: 7,
				recipientMemberId: 'member',
				title: 'Cafe social post',
				instruction: 'Use title "Cafe social post". Write one cafe post.',
			},
		);
		expect(delegationTool.name).toBe('delegate_department_work');
		expect(delegationTool.description).toContain('Delegate a child Work item');
		expect(delegationTool.endsTurn?.({ child: {} })).toBe(true);
	});
	it('claims work through a narrow tool that reads the current version on the server', async () => {
		const claimTool = createDepartmentWorkClaimTool(service, 'project', 'agent').build();
		const handler = claimTool.handler;
		if (!handler) throw new Error('Missing claim tool handler');
		service.executeToolAction.mockResolvedValueOnce(inspectedWork);
		await handler(
			{},
			{
				toolCallId: 'claim-call',
				persistence: {
					threadId: 'attempt',
					resourceId: 'resource',
					hostMetadata: { n8nExecutionId: 'execution' },
				},
			},
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ projectId: 'project', executorId: 'agent' }),
			expect.any(String),
			{ action: 'claim', expectedVersion: 7 },
		);
		expect(claimTool.name).toBe('claim_department_work');
		expect(claimTool.endsTurn).toBeUndefined();
	});
	it('does not renew a claim that this execution already holds', async () => {
		const claimTool = createDepartmentWorkClaimTool(service, 'project', 'agent').build();
		const handler = claimTool.handler;
		if (!handler) throw new Error('Missing claim tool handler');
		const heldClaim: AiDepartmentAgentWorkToolResult = {
			...inspectedWork,
			claim: {
				id: 'claim',
				attemptId: 'attempt',
				memberId: 'member',
				executionId: 'execution',
				claimGeneration: 1,
				leaseUntil: '2026-11-07T00:00:00.000Z',
				releasedAt: null,
			},
		};
		service.executeToolAction.mockResolvedValueOnce(heldClaim);
		await expect(
			handler(
				{},
				{
					toolCallId: 'claim-call',
					persistence: {
						threadId: 'attempt',
						resourceId: 'resource',
						hostMetadata: { n8nExecutionId: 'execution' },
					},
				},
			),
		).resolves.toEqual(heldClaim);
		expect(service.executeToolAction).toHaveBeenCalledTimes(1);
	});
	it('uses the latest work version for progress without asking the Agent to send one', async () => {
		service.executeToolAction
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork);
		await handler(
			{ action: 'progress', body: 'Drafted the post.' },
			{
				toolCallId: 'progress-call',
				persistence: {
					threadId: 'attempt',
					resourceId: 'resource',
					hostMetadata: { n8nExecutionId: 'execution' },
				},
			},
		);
		expect(service.executeToolAction).toHaveBeenCalledTimes(2);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ projectId: 'project', executorId: 'agent' }),
			expect.any(String),
			{ action: 'progress', body: 'Drafted the post.', expectedVersion: 7 },
		);
	});
	it('submits a structured report through a narrow owner-bound tool', async () => {
		const handler = submitTool.handler;
		if (!handler) throw new Error('Missing submit tool handler');
		const report = {
			result: 'Draft is ready.',
			completedWork: ['Wrote the post.'],
			checkedEvidence: [],
			openIssues: [],
			nextSteps: [],
		};
		service.executeToolAction
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork)
			.mockResolvedValueOnce(inspectedWork);
		await handler(
			{ report },
			{
				toolCallId: 'submit-call',
				persistence: {
					threadId: 'attempt',
					resourceId: 'resource',
					hostMetadata: { n8nExecutionId: 'execution' },
				},
			},
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ projectId: 'project', executorId: 'agent' }),
			expect.any(String),
			{ action: 'claim', expectedVersion: 7 },
		);
		expect(service.executeToolAction).toHaveBeenNthCalledWith(
			4,
			{
				projectId: 'project',
				executorId: 'agent',
				attemptId: 'attempt',
				executionId: 'execution',
			},
			expect.any(String),
			{ action: 'submit', expectedVersion: 7, report },
		);
		expect(submitTool.name).toBe('submit_department_work');
		expect(submitTool.endsTurn?.({ work: { state: 'running' } })).toBe(false);
		expect(submitTool.endsTurn?.({ work: { state: 'review' } })).toBe(true);
	});
});
