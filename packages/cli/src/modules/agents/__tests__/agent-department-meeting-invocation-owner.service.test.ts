import { createHash } from 'node:crypto';
import type { User, UserRepository } from '@n8n/db';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { userHasScopes } from '@/permissions.ee/check-access';

import {
	DepartmentMeetingBindingVerifierProxy,
	DepartmentMeetingContextReaderProxy,
	hashDepartmentMeetingInvocationRequest,
	type DepartmentMeetingInvocationRequest,
} from '../agent-department-meeting-invocation.contracts';
import { AgentDepartmentMeetingInvocationOwnerService } from '../agent-department-meeting-invocation-owner.service';
import type { AgentBindingResolver } from '../agent-binding-resolver.service';
import type { AgentMessageQueueService } from '../agent-message-queue.service';
import type { AgentRuntimeCacheService } from '../agent-runtime-cache.service';
import type { AgentDepartmentMeetingInvocationRepository } from '../repositories/agent-department-meeting-invocation.repository';
import type { AgentSessionStopService } from '../agent-session-stop.service';
import type { AgentExecutionRepository } from '../repositories/agent-execution.repository';

vi.mock('@/permissions.ee/check-access', () => ({ userHasScopes: vi.fn() }));

const input = {
	schemaVersion: 1 as const,
	projectId: 'project-a',
	departmentId: 'department-a',
	meetingId: 'meeting-a',
	participantId: 'participant-a',
	invocationId: 'invocation-a',
	round: 'contribution' as const,
	actorId: 'user-a',
	memberId: 'member-a',
	executorId: 'agent-a',
	bindingVersion: 3,
	requestKey: 'request-a',
	contextRef: 'context-a',
	inputText: 'Use the supplied meeting notes.',
	maxOutputChars: 4_000,
	maxOutputTokens: 1_000,
	toolPolicy: { mode: 'supplied-material-only' as const },
	deadlineAt: '2099-11-05T00:00:00.000Z',
};

function makeRequest(): DepartmentMeetingInvocationRequest {
	return {
		...input,
		expectedInputHash: hashDepartmentMeetingInvocationRequest(input),
	};
}

describe('AgentDepartmentMeetingInvocationOwnerService', () => {
	let bindings: MockProxy<AgentBindingResolver>;
	let users: MockProxy<UserRepository>;
	let queue: MockProxy<AgentMessageQueueService>;
	let invocations: MockProxy<AgentDepartmentMeetingInvocationRepository>;
	let runtimes: MockProxy<AgentRuntimeCacheService>;
	let stopService: MockProxy<AgentSessionStopService>;
	let executions: MockProxy<AgentExecutionRepository>;
	let meetingBindings: MockProxy<DepartmentMeetingBindingVerifierProxy>;
	let contextReader: MockProxy<DepartmentMeetingContextReaderProxy>;
	let service: AgentDepartmentMeetingInvocationOwnerService;

	beforeEach(() => {
		vi.clearAllMocks();
		bindings = mock<AgentBindingResolver>();
		users = mock<UserRepository>();
		queue = mock<AgentMessageQueueService>();
		invocations = mock<AgentDepartmentMeetingInvocationRepository>();
		runtimes = mock<AgentRuntimeCacheService>();
		stopService = mock<AgentSessionStopService>();
		executions = mock<AgentExecutionRepository>();
		meetingBindings = mock<DepartmentMeetingBindingVerifierProxy>();
		contextReader = mock<DepartmentMeetingContextReaderProxy>();
		contextReader.resolve.mockResolvedValue({
			contextHash: 'context-hash-a',
			inputText: 'Authorized frozen meeting context.',
		});
		users.findByIdWithRole.mockResolvedValue(mock<User>({ id: input.actorId, disabled: false }));
		invocations.cancelGate.mockResolvedValue({ kind: 'cancelled' } as never);
		vi.mocked(userHasScopes).mockResolvedValue(true);
		service = new AgentDepartmentMeetingInvocationOwnerService(
			bindings,
			users,
			queue,
			invocations,
			runtimes,
			stopService,
			executions,
			meetingBindings,
			contextReader,
		);
	});

	function stoppingInvocation() {
		return {
			id: 'owner-ref-a',
			projectId: input.projectId,
			departmentId: input.departmentId,
			meetingId: input.meetingId,
			participantId: input.participantId,
			invocationId: input.invocationId,
			round: input.round,
			actorId: input.actorId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
			requestKey: input.requestKey,
			inputHash: makeRequest().expectedInputHash,
			contextRef: input.contextRef,
			inputText: input.inputText,
			maxOutputChars: input.maxOutputChars,
			maxOutputTokens: input.maxOutputTokens,
			toolPolicy: input.toolPolicy.mode,
			toolPolicyVersion: null,
			threadId: 'thread-a',
			state: 'stopping',
			outcome: null,
			safeErrorCode: null,
			deadlineAt: new Date(input.deadlineAt),
			terminalAt: null,
			sequence: '4',
			resultText: null,
			resultHash: null,
			stopCommandId: 'command-a',
			stopPayloadHash: 'a'.repeat(64),
			stopRequestedAt: new Date(),
		};
	}

	it('uses owner-resolved context instead of caller supplied text', async () => {
		const request = makeRequest();
		const invocation = stoppingInvocation();
		invocation.state = 'reserved';
		invocation.inputText = 'Authorized frozen meeting context.';
		invocations.reserve.mockResolvedValue({ kind: 'created', invocation } as never);
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true } as never);
		meetingBindings.isCurrentBinding.mockResolvedValue(true);
		const runtime = {
			agent: { declaredTools: [] },
			toolRegistry: new Map(),
			mcpServerAttributions: new Map(),
		};
		runtimes.getRuntime.mockResolvedValue(runtime as never);
		queue.enqueueDepartmentMeeting.mockResolvedValue({ status: 'accepted' } as never);
		invocations.markAccepted.mockResolvedValue({ affected: 1 } as never);

		await service.dispatch({ ...request, inputText: 'Untrusted caller text.' });

		expect(contextReader.resolve).toHaveBeenCalledWith({
			projectId: input.projectId,
			departmentId: input.departmentId,
			meetingId: input.meetingId,
			participantId: input.participantId,
			actorId: input.actorId,
			contextRef: input.contextRef,
			round: 'contribution',
		});
		expect(invocations.reserve).toHaveBeenCalledWith(
			expect.objectContaining({
				inputText: 'Authorized frozen meeting context.',
			}),
		);
		expect(queue.enqueueDepartmentMeeting).toHaveBeenCalledWith(
			expect.objectContaining({
				request: expect.objectContaining({ inputText: 'Authorized frozen meeting context.' }),
			}),
		);
	});

	it('does not reserve or enqueue when the context reader cannot authorize the snapshot', async () => {
		contextReader.resolve.mockResolvedValue(null);

		await expect(service.dispatch(makeRequest())).resolves.toEqual({
			kind: 'rejected',
			code: 'unavailable',
		});

		expect(invocations.reserve).not.toHaveBeenCalled();
		expect(queue.enqueueDepartmentMeeting).not.toHaveBeenCalled();
	});

	it('does not reserve or enqueue a key with a cancellation tombstone', async () => {
		const request = makeRequest();
		const invocation = stoppingInvocation();
		invocation.state = 'reserved';
		invocation.inputText = 'Authorized frozen meeting context.';
		invocations.reserve.mockResolvedValue({ kind: 'cancelled' } as never);
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true } as never);
		meetingBindings.isCurrentBinding.mockResolvedValue(true);
		contextReader.resolve.mockResolvedValue({
			contextHash: 'context-hash-a',
			inputText: 'Authorized frozen meeting context.',
		});

		await expect(service.dispatch(request)).resolves.toEqual({
			kind: 'rejected',
			code: 'cancelled',
		});
		expect(queue.enqueueDepartmentMeeting).not.toHaveBeenCalled();
	});

	it('acknowledges an idempotent stop without claiming terminal proof', async () => {
		const invocation = stoppingInvocation();
		invocations.findByInvocationId.mockResolvedValue(invocation as never);
		invocations.requestStop.mockResolvedValue({ kind: 'duplicate', invocation } as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		executions.findByInputMessageId.mockResolvedValue({ status: 'running' } as never);
		stopService.stopDepartmentExecution.mockResolvedValue(true);

		await expect(
			service.requestStop({
				projectId: input.projectId,
				invocationId: input.invocationId,
				actorId: input.actorId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
				ownerInvocationRef: 'owner-ref-a',
				commandId: 'command-a',
			}),
		).resolves.toEqual({ acknowledged: true, confirmedTerminal: false });
		expect(stopService.stopDepartmentExecution).toHaveBeenCalledWith({
			projectId: input.projectId,
			agentId: input.executorId,
			threadId: 'thread-a',
			ownerExecutionRef: 'message-a',
			source: 'ai-department-meeting',
		});
	});

	it('persists a cancellation tombstone before an owner invocation exists', async () => {
		invocations.findByInvocationId.mockResolvedValue(null);

		await expect(
			service.requestStop({
				projectId: input.projectId,
				invocationId: input.invocationId,
				actorId: input.actorId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
				commandId: 'command-before-reservation',
			}),
		).resolves.toEqual({ acknowledged: true, confirmedTerminal: false });
		expect(invocations.cancelGate).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				inputHash: makeRequest().expectedInputHash,
				commandId: 'command-before-reservation',
			}),
		);
	});

	it('accepts cancellation of an owner reservation before queue acceptance', async () => {
		const reserved = { ...stoppingInvocation(), state: 'reserved' };
		invocations.findByInvocationId.mockResolvedValue(reserved as never);
		invocations.requestStop.mockResolvedValue({ kind: 'terminal', invocation: reserved } as never);

		await expect(
			service.requestStop({
				projectId: input.projectId,
				invocationId: input.invocationId,
				actorId: input.actorId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
				ownerInvocationRef: 'owner-ref-a',
				commandId: 'command-reserved',
			}),
		).resolves.toEqual({ acknowledged: true, confirmedTerminal: true });
		expect(stopService.stopDepartmentExecution).not.toHaveBeenCalled();
	});

	it('confirms a stop only after a terminal execution is observed', async () => {
		const stopping = stoppingInvocation();
		invocations.findByInvocationId
			.mockResolvedValueOnce(stopping as never)
			.mockResolvedValueOnce({ ...stopping, state: 'terminal', outcome: 'cancelled' } as never);
		invocations.requestStop.mockResolvedValue({ kind: 'duplicate', invocation: stopping } as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		executions.findByInputMessageId.mockResolvedValue({ status: 'cancelled' } as never);

		await expect(
			service.requestStop({
				projectId: input.projectId,
				invocationId: input.invocationId,
				actorId: input.actorId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
				ownerInvocationRef: 'owner-ref-a',
				commandId: 'command-a',
			}),
		).resolves.toEqual({ acknowledged: true, confirmedTerminal: true });
		expect(invocations.markTerminal).toHaveBeenCalledWith({
			projectId: input.projectId,
			invocationId: input.invocationId,
			outcome: 'cancelled',
			safeErrorCode: 'stopped',
		});
	});

	it('retries persisted stop commands during reconciliation', async () => {
		const invocation = stoppingInvocation();
		invocations.findPendingStops.mockResolvedValue([invocation] as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		executions.findByInputMessageId.mockResolvedValue({ status: 'running' } as never);
		stopService.stopDepartmentExecution.mockResolvedValue(true);

		await service.reconcilePendingStops();

		expect(stopService.stopDepartmentExecution).toHaveBeenCalledWith({
			projectId: input.projectId,
			agentId: input.executorId,
			threadId: 'thread-a',
			ownerExecutionRef: 'message-a',
			source: 'ai-department-meeting',
		});
	});

	it('keeps a stop pending while an unknown enqueue has no resolved queue receipt', async () => {
		const invocation = { ...stoppingInvocation(), safeErrorCode: 'enqueue_unknown' };
		invocations.findPendingStops.mockResolvedValue([invocation] as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		queue.findDepartmentMeetingDispatch.mockResolvedValue(null);
		executions.findByInputMessageId.mockResolvedValue(null);

		await service.reconcilePendingStops();

		expect(invocations.markTerminal).not.toHaveBeenCalled();
		expect(stopService.stopDepartmentExecution).not.toHaveBeenCalled();
	});

	it('reconciles an unknown enqueue from its durable queued message', async () => {
		const invocation = { ...stoppingInvocation(), state: 'unknown' };
		invocations.lookup.mockResolvedValue({ kind: 'unknown' } as never);
		invocations.findByInvocationId.mockResolvedValue(invocation as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		queue.findDepartmentMeetingDispatch.mockResolvedValue({} as never);

		await expect(
			service.lookup({
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		).resolves.toEqual({ kind: 'accepted', ownerInvocationRef: invocation.id });
		expect(queue.findDepartmentMeetingDispatch).toHaveBeenCalledWith({
			executorId: input.executorId,
			projectId: input.projectId,
			threadId: invocation.threadId,
			request: expect.objectContaining({
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		});
		expect(invocations.markAccepted).toHaveBeenCalledWith(input.projectId, input.invocationId);
	});

	it('reconciles a claimed meeting execution when its queue row is no longer present', async () => {
		const invocation = { ...stoppingInvocation(), state: 'unknown' };
		invocations.lookup.mockResolvedValue({ kind: 'unknown' } as never);
		invocations.findByInvocationId.mockResolvedValue(invocation as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		executions.findByInputMessageId.mockResolvedValue({ status: 'running' } as never);

		await expect(
			service.lookup({
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		).resolves.toEqual({ kind: 'accepted', ownerInvocationRef: invocation.id });
		expect(executions.findByInputMessageId).toHaveBeenCalledWith('message-a');
		expect(invocations.markAccepted).toHaveBeenCalledWith(input.projectId, input.invocationId);
		expect(invocations.markRunning).toHaveBeenCalledWith(input.projectId, input.invocationId);
		expect(queue.findDepartmentMeetingDispatch).not.toHaveBeenCalled();
	});

	it('runs unknown-enqueue reconciliation from its persisted owner reservation', async () => {
		const invocation = { ...stoppingInvocation(), state: 'unknown' };
		invocations.findUnresolvedEnqueues.mockResolvedValue([invocation] as never);
		invocations.lookup.mockResolvedValue({ kind: 'unknown' } as never);
		invocations.findByInvocationId.mockResolvedValue(invocation as never);
		queue.departmentMeetingMessageId.mockReturnValue('message-a');
		queue.findDepartmentMeetingDispatch.mockResolvedValue({} as never);

		await service.reconcilePendingEnqueues();

		expect(invocations.findUnresolvedEnqueues).toHaveBeenCalledWith(100);
		expect(queue.findDepartmentMeetingDispatch).toHaveBeenCalledOnce();
		expect(invocations.markAccepted).toHaveBeenCalledWith(input.projectId, input.invocationId);
	});

	it('does not reserve or enqueue when current binding cannot be verified', async () => {
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true });
		meetingBindings.isCurrentBinding.mockResolvedValue(false);

		await expect(service.dispatch(makeRequest())).resolves.toEqual({
			kind: 'rejected',
			code: 'binding',
		});
		expect(invocations.reserve).not.toHaveBeenCalled();
		expect(queue.enqueueDepartmentMeeting).not.toHaveBeenCalled();
	});

	it('resolves the current member binding before it permits a meeting call', async () => {
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true });
		meetingBindings.isCurrentBinding.mockResolvedValue(true);

		await expect(
			service.resolve({
				actorId: input.actorId,
				projectId: input.projectId,
				departmentId: input.departmentId,
				memberId: input.memberId,
				executorId: input.executorId,
				bindingVersion: input.bindingVersion,
			}),
		).resolves.toEqual({ available: true, canStart: true, canStop: false });
		expect(meetingBindings.isCurrentBinding).toHaveBeenCalledWith({
			projectId: input.projectId,
			departmentId: input.departmentId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
		});
	});

	it('withholds terminal text while the current binding cannot be verified', async () => {
		const resultText = JSON.stringify({
			stance: 'agree',
			keyPoints: ['Option A meets the target.'],
			risks: [],
			proposedAction: 'Approve option A.',
		});
		const resultHash = createHash('sha256').update(resultText).digest('hex');
		invocations.findByInvocationId.mockResolvedValue({
			id: 'owner-ref-a',
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputHash: makeRequest().expectedInputHash,
			state: 'terminal',
			outcome: 'succeeded',
			resultText,
			resultHash,
			sequence: '4',
			actorId: input.actorId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
			round: 'contribution',
		} as never);
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true });

		await expect(
			service.readResult({
				projectId: input.projectId,
				invocationId: input.invocationId,
				ownerInvocationRef: 'owner-ref-a',
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		).resolves.toBeNull();
		expect(bindings.resolveInProject).toHaveBeenCalledWith(input.executorId, input.projectId);
		expect(userHasScopes).toHaveBeenCalled();
	});

	it('withholds a result when the stored text hash does not match', async () => {
		invocations.findByInvocationId.mockResolvedValue({
			id: 'owner-ref-a',
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputHash: makeRequest().expectedInputHash,
			state: 'terminal',
			outcome: 'succeeded',
			resultText: 'Changed text',
			resultHash: 'f'.repeat(64),
			round: 'contribution',
			actorId: input.actorId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
		} as never);

		await expect(
			service.readResult({
				projectId: input.projectId,
				invocationId: input.invocationId,
				ownerInvocationRef: 'owner-ref-a',
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		).resolves.toBeNull();
		expect(bindings.resolveInProject).not.toHaveBeenCalled();
	});

	it('withholds malformed structured contribution output', async () => {
		const resultText = 'The team selected option A.';
		invocations.findByInvocationId.mockResolvedValue({
			id: 'owner-ref-a',
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputHash: makeRequest().expectedInputHash,
			state: 'terminal',
			outcome: 'succeeded',
			resultText,
			resultHash: createHash('sha256').update(resultText).digest('hex'),
			sequence: '4',
			actorId: input.actorId,
			memberId: input.memberId,
			executorId: input.executorId,
			bindingVersion: input.bindingVersion,
			round: 'contribution',
		} as never);
		bindings.resolveInProject.mockResolvedValue({ exists: true, available: true });

		await expect(
			service.readResult({
				projectId: input.projectId,
				invocationId: input.invocationId,
				ownerInvocationRef: 'owner-ref-a',
				expectedInputHash: makeRequest().expectedInputHash,
			}),
		).resolves.toBeNull();
	});
});
