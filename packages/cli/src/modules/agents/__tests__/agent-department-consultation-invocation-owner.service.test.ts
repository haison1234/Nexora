import type { User, UserRepository } from '@n8n/db';
import { mock, type MockProxy } from 'vitest-mock-extended';
import { createHash } from 'node:crypto';

import { userHasScopes } from '@/permissions.ee/check-access';

import type {
	DepartmentConsultationBindingVerifierProxy,
	DepartmentConsultationContextReaderProxy,
	DepartmentConsultationInvocationRequest,
} from '../agent-department-consultation.contracts';
import { hashDepartmentConsultationRequest } from '../agent-department-consultation.contracts';
import { AgentDepartmentConsultationInvocationOwnerService } from '../agent-department-consultation-invocation-owner.service';
import type { AgentBindingResolver } from '../agent-binding-resolver.service';
import type { AgentMessageQueueService } from '../agent-message-queue.service';
import type { AgentRuntimeCacheService } from '../agent-runtime-cache.service';
import type { AgentRuntime } from '../agent-runtime-cache.service';
import type { AgentDepartmentConsultationInvocation } from '../entities/agent-department-consultation-invocation.entity';
import type { AgentDepartmentConsultationInvocationRepository } from '../repositories/agent-department-consultation-invocation.repository';
import type { AgentSessionStopService } from '../agent-session-stop.service';
import type { AgentExecutionRepository } from '../repositories/agent-execution.repository';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

const requestIdentity = {
	schemaVersion: 1 as const,
	projectId: 'project-a',
	departmentId: 'department-a',
	helpRequestId: 'help-a',
	invocationId: 'help-a',
	sourceAttemptId: 'attempt-a',
	requesterMemberId: 'member-requester',
	recipientMemberId: 'member-responder',
	actorId: 'user-a',
	executorId: 'agent-a',
	bindingVersion: 3,
	commandKey: 'work-help:help-a',
	contextRef: 'help-a',
	contextHash: 'context-hash-a',
	deadlineAt: new Date(Date.now() + 60_000).toISOString(),
	maxOutputChars: 4_000,
	maxOutputTokens: 1_000,
	toolPolicy: { mode: 'none' as const, policyVersion: 'department-consultation-v1' },
};

function makeRequest(): DepartmentConsultationInvocationRequest {
	return {
		...requestIdentity,
		expectedInputHash: hashDepartmentConsultationRequest(requestIdentity),
	};
}

describe('AgentDepartmentConsultationInvocationOwnerService', () => {
	let bindingResolver: MockProxy<AgentBindingResolver>;
	let users: MockProxy<UserRepository>;
	let queue: MockProxy<AgentMessageQueueService>;
	let invocations: MockProxy<AgentDepartmentConsultationInvocationRepository>;
	let runtimes: MockProxy<AgentRuntimeCacheService>;
	let stopService: MockProxy<AgentSessionStopService>;
	let executions: MockProxy<AgentExecutionRepository>;
	let bindings: MockProxy<DepartmentConsultationBindingVerifierProxy>;
	let contextReader: MockProxy<DepartmentConsultationContextReaderProxy>;
	let service: AgentDepartmentConsultationInvocationOwnerService;

	const runtimeWithDeclaredTools = (declaredTools: Array<{ name: string }>) => {
		const runtime = mock<AgentRuntime>();
		runtime.agentId = requestIdentity.executorId;
		runtime.projectId = requestIdentity.projectId;
		runtime.telemetryConfiguration = {
			model: null,
			channels: [],
			tool_types: [],
			tool_count: 0,
			num_skills: 0,
			memory_type: 'none',
		};
		runtime.toolAccessCheckedAt = Date.now();
		Object.defineProperty(runtime.agent, 'declaredTools', { value: declaredTools });
		return runtime;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		bindingResolver = mock<AgentBindingResolver>();
		users = mock<UserRepository>();
		queue = mock<AgentMessageQueueService>();
		invocations = mock<AgentDepartmentConsultationInvocationRepository>();
		runtimes = mock<AgentRuntimeCacheService>();
		stopService = mock<AgentSessionStopService>();
		executions = mock<AgentExecutionRepository>();
		bindings = mock<DepartmentConsultationBindingVerifierProxy>();
		contextReader = mock<DepartmentConsultationContextReaderProxy>();
		bindingResolver.resolveInProject.mockResolvedValue({ exists: true, available: true });
		users.findByIdWithRole.mockResolvedValue(mock<User>({ id: 'user-a', disabled: false }));
		bindings.isCurrentBinding.mockResolvedValue(true);
		contextReader.resolve.mockResolvedValue({
			contextHash: requestIdentity.contextHash,
			inputText: 'Owner-resolved work help context.',
		});
		vi.mocked(userHasScopes).mockResolvedValue(true);
		service = new AgentDepartmentConsultationInvocationOwnerService(
			bindingResolver,
			users,
			queue,
			invocations,
			runtimes,
			stopService,
			executions,
			bindings,
			contextReader,
		);
	});

	it('rejects caller supplied input text', async () => {
		const request = makeRequest();
		await expect(service.invoke({ ...request, inputText: 'untrusted' })).resolves.toEqual({
			kind: 'rejected',
			code: 'unavailable',
		});
		expect(invocations.reserve).not.toHaveBeenCalled();
	});

	it('rejects a mismatched context hash before queueing', async () => {
		contextReader.resolve.mockResolvedValue({
			contextHash: 'different-context',
			inputText: 'Changed context.',
		});
		await expect(service.invoke(makeRequest())).resolves.toEqual({
			kind: 'rejected',
			code: 'unavailable',
		});
		expect(queue.enqueueDepartmentConsultation).not.toHaveBeenCalled();
	});

	it('rejects an Agent runtime with declared tools', async () => {
		const invocation = mock<AgentDepartmentConsultationInvocation>({
			id: requestIdentity.invocationId,
			threadId: 'thread-a',
			state: 'reserved',
		});
		invocations.reserve.mockResolvedValue({ kind: 'created', invocation });
		runtimes.getRuntime.mockResolvedValue(runtimeWithDeclaredTools([{ name: 'workflow' }]));
		await expect(service.invoke(makeRequest())).resolves.toEqual({
			kind: 'rejected',
			code: 'tools',
		});
		expect(invocations.markTerminal).toHaveBeenCalledWith({
			projectId: requestIdentity.projectId,
			invocationId: requestIdentity.invocationId,
			outcome: 'failed',
			safeErrorCode: 'tools',
		});
		expect(queue.enqueueDepartmentConsultation).not.toHaveBeenCalled();
	});

	it('uses a durable invocation ID and owner resolved context', async () => {
		const request = makeRequest();
		const invocation = mock<AgentDepartmentConsultationInvocation>({
			id: request.invocationId,
			threadId: 'thread-a',
			state: 'reserved',
		});
		invocations.reserve.mockResolvedValue({ kind: 'created', invocation });
		runtimes.getRuntime.mockResolvedValue(runtimeWithDeclaredTools([]));
		await expect(service.invoke(request)).resolves.toEqual({
			kind: 'accepted',
			ownerInvocationRef: request.invocationId,
		});
		expect(invocations.reserve).toHaveBeenCalledWith(
			expect.objectContaining({
				id: request.invocationId,
				contextHash: request.contextHash,
				inputText: 'Owner-resolved work help context.',
			}),
		);
		expect(queue.enqueueDepartmentConsultation).toHaveBeenCalledWith(
			expect.objectContaining({
				request: expect.objectContaining({ inputText: 'Owner-resolved work help context.' }),
			}),
		);
		expect(invocations.markAccepted).toHaveBeenCalledWith(request.projectId, request.invocationId);
	});

	it('reuses an accepted invocation without enqueueing a second Agent turn', async () => {
		const request = makeRequest();
		invocations.reserve.mockResolvedValue({
			kind: 'duplicate',
			invocation: mock<AgentDepartmentConsultationInvocation>({
				id: request.invocationId,
				threadId: 'thread-a',
				state: 'accepted',
			}),
		});

		await expect(service.invoke(request)).resolves.toEqual({
			kind: 'accepted',
			ownerInvocationRef: request.invocationId,
		});
		expect(queue.enqueueDepartmentConsultation).not.toHaveBeenCalled();
		expect(runtimes.getRuntime).not.toHaveBeenCalled();
	});

	it('confirms a queued consultation stopped before the Agent turn starts', async () => {
		const request = makeRequest();
		const accepted = mock<AgentDepartmentConsultationInvocation>({
			id: request.invocationId,
			projectId: request.projectId,
			invocationId: request.invocationId,
			commandKey: request.commandKey,
			inputHash: request.expectedInputHash,
			threadId: 'thread-a',
			executorId: request.executorId,
			deadlineAt: new Date(request.deadlineAt),
			state: 'accepted',
		});
		const terminal = mock<AgentDepartmentConsultationInvocation>({
			...accepted,
			deadlineAt: new Date(request.deadlineAt),
			state: 'terminal',
			outcome: 'cancelled',
		});
		invocations.findByInvocationId.mockResolvedValueOnce(accepted).mockResolvedValueOnce(terminal);
		invocations.cancelGate.mockResolvedValue({ kind: 'cancelled' });
		invocations.markStopping.mockResolvedValue({
			kind: 'accepted',
			invocation: mock<AgentDepartmentConsultationInvocation>({
				...accepted,
				deadlineAt: new Date(request.deadlineAt),
				state: 'stopping',
			}),
		} as never);
		queue.departmentConsultationMessageId.mockReturnValue('message-a');
		queue.findDepartmentConsultationDispatch.mockResolvedValue({} as never);
		stopService.stopDepartmentExecution.mockResolvedValue(true);

		await expect(
			service.requestStop({
				projectId: request.projectId,
				invocationId: request.invocationId,
				actorId: request.actorId,
				commandKey: request.commandKey,
				expectedInputHash: request.expectedInputHash,
				ownerInvocationRef: request.invocationId,
				commandId: 'stop-command-a',
			}),
		).resolves.toEqual({ acknowledged: true, confirmedTerminal: true });
		expect(stopService.stopDepartmentExecution).toHaveBeenCalledWith(
			expect.objectContaining({
				ownerExecutionRef: 'message-a',
				source: 'ai-department-consultation',
			}),
		);
		expect(invocations.markTerminal).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: 'cancelled',
				safeErrorCode: 'stopped_before_start',
			}),
		);
	});

	it.each([
		{ reason: 'project access was revoked', authorized: false, bindingMatches: true },
		{ reason: 'recipient binding changed', authorized: true, bindingMatches: false },
	])('withholds a completed answer when $reason', async ({ authorized, bindingMatches }) => {
		const request = makeRequest();
		const answer = 'Use the published workflow version as the source of truth.';
		invocations.findByInvocationId.mockResolvedValue(
			mock<AgentDepartmentConsultationInvocation>({
				id: request.invocationId,
				projectId: request.projectId,
				departmentId: request.departmentId,
				helpRequestId: request.helpRequestId,
				invocationId: request.invocationId,
				actorId: request.actorId,
				recipientMemberId: request.recipientMemberId,
				executorId: request.executorId,
				bindingVersion: request.bindingVersion,
				inputHash: request.expectedInputHash,
				contextHash: request.contextHash,
				state: 'terminal',
				outcome: 'succeeded',
				sequence: '4',
				resultText: answer,
				resultHash: createHash('sha256').update(answer).digest('hex'),
			}),
		);
		vi.mocked(userHasScopes).mockResolvedValue(authorized);
		bindings.isCurrentBinding.mockResolvedValue(bindingMatches);

		await expect(
			service.readResult({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerInvocationRef: request.invocationId,
				expectedInputHash: request.expectedInputHash,
			}),
		).resolves.toBeNull();
	});

	it('withholds a completed answer when the responder user is disabled', async () => {
		const request = makeRequest();
		const answer = 'Use the published workflow version as the source of truth.';
		invocations.findByInvocationId.mockResolvedValue(
			mock<AgentDepartmentConsultationInvocation>({
				id: request.invocationId,
				projectId: request.projectId,
				departmentId: request.departmentId,
				helpRequestId: request.helpRequestId,
				invocationId: request.invocationId,
				actorId: request.actorId,
				recipientMemberId: request.recipientMemberId,
				executorId: request.executorId,
				bindingVersion: request.bindingVersion,
				inputHash: request.expectedInputHash,
				contextHash: request.contextHash,
				state: 'terminal',
				outcome: 'succeeded',
				sequence: '4',
				resultText: answer,
				resultHash: createHash('sha256').update(answer).digest('hex'),
			}),
		);
		users.findByIdWithRole.mockResolvedValue(mock<User>({ id: request.actorId, disabled: true }));

		await expect(
			service.readResult({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerInvocationRef: request.invocationId,
				expectedInputHash: request.expectedInputHash,
			}),
		).resolves.toBeNull();
		expect(userHasScopes).not.toHaveBeenCalled();
	});

	it('returns a completed answer only after current access and binding checks', async () => {
		const request = makeRequest();
		const answer = 'Use the published workflow version as the source of truth.';
		invocations.findByInvocationId.mockResolvedValue(
			mock<AgentDepartmentConsultationInvocation>({
				id: request.invocationId,
				projectId: request.projectId,
				departmentId: request.departmentId,
				helpRequestId: request.helpRequestId,
				invocationId: request.invocationId,
				actorId: request.actorId,
				recipientMemberId: request.recipientMemberId,
				executorId: request.executorId,
				bindingVersion: request.bindingVersion,
				inputHash: request.expectedInputHash,
				contextHash: request.contextHash,
				state: 'terminal',
				outcome: 'succeeded',
				sequence: '4',
				resultText: answer,
				resultHash: createHash('sha256').update(answer).digest('hex'),
			}),
		);

		await expect(
			service.readResult({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerInvocationRef: request.invocationId,
				expectedInputHash: request.expectedInputHash,
			}),
		).resolves.toMatchObject({ answer, helpRequestId: request.helpRequestId });
		expect(userHasScopes).toHaveBeenCalledWith(
			expect.objectContaining({ id: request.actorId }),
			['agent:execute'],
			false,
			{ projectId: request.projectId },
		);
		expect(bindings.isCurrentBinding).toHaveBeenCalledWith({
			projectId: request.projectId,
			departmentId: request.departmentId,
			memberId: request.recipientMemberId,
			executorId: request.executorId,
			bindingVersion: request.bindingVersion,
		});
	});
});
