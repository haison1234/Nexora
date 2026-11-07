import { Cipher } from 'n8n-core';
import { mock } from 'vitest-mock-extended';

import { AgentDepartmentWorkflowInvocationInputService } from '../agent-department-workflow-invocation-input.service';
import type { AgentDepartmentWorkflowInputRepository } from '../repositories/agent-department-workflow-input.repository';

describe('AgentDepartmentWorkflowInvocationInputService', () => {
	const input = {
		projectId: 'project-a',
		invocationId: 'invocation-a',
		inputsRef: 'input-ref-a',
		inputHash: 'a'.repeat(64),
		inputs: { headline: 'Hello' },
	};
	const dispatchData = {
		projectId: input.projectId,
		invocationId: input.invocationId,
		ownerInvocationKey: 'c'.repeat(64),
		inputsRef: input.inputsRef,
		inputHash: input.inputHash,
		expectedWorkflowVersion: 'published-v2',
		workflowId: 'workflow-a',
		executionMode: 'manual' as const,
		userId: 'user-a',
		agentRun: {
			agentId: 'agent-a',
			projectId: input.projectId,
			threadId: 'attempt-a',
			runId: 'run-a',
			toolCallId: 'tool-call-a',
			userId: 'user-a',
		},
	};

	it('stores encrypted input and resolves it only through its owner reference', async () => {
		const repository = mock<AgentDepartmentWorkflowInputRepository>();
		const cipher = mock<Cipher>();
		cipher.encryptV2.mockResolvedValue('encrypted');
		cipher.decryptV2.mockResolvedValue(JSON.stringify(input.inputs));
		repository.findForInvocation.mockResolvedValue(null);
		repository.insertIfAbsent.mockResolvedValue(true);
		const service = new AgentDepartmentWorkflowInvocationInputService(repository, cipher);

		await service.stage(input);
		repository.findForInvocation.mockResolvedValue({
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputsRef: input.inputsRef,
			inputHash: input.inputHash,
			encryptedInputs: 'encrypted',
		} as never);

		await expect(service.resolve(input)).resolves.toEqual(input.inputs);
		expect(cipher.encryptV2).toHaveBeenCalledWith(JSON.stringify(input.inputs));
		expect(cipher.decryptV2).toHaveBeenCalledWith('encrypted');
	});

	it('fails closed when the reference or input hash does not match', async () => {
		const repository = mock<AgentDepartmentWorkflowInputRepository>();
		const cipher = mock<Cipher>();
		repository.findForInvocation.mockResolvedValue({
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputsRef: input.inputsRef,
			inputHash: input.inputHash,
			encryptedInputs: 'encrypted',
		} as never);
		const service = new AgentDepartmentWorkflowInvocationInputService(repository, cipher);

		await expect(service.resolve({ ...input, inputHash: 'b'.repeat(64) })).rejects.toThrow(
			'Workflow invocation input was not found.',
		);
		expect(cipher.decryptV2).not.toHaveBeenCalled();
	});

	it('does not replace an already staged payload on replay', async () => {
		const repository = mock<AgentDepartmentWorkflowInputRepository>();
		const cipher = mock<Cipher>();
		repository.findForInvocation.mockResolvedValue({
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputsRef: input.inputsRef,
			inputHash: input.inputHash,
			encryptedInputs: 'encrypted',
		} as never);
		const service = new AgentDepartmentWorkflowInvocationInputService(repository, cipher);

		await service.stage(input);
		expect(cipher.encryptV2).not.toHaveBeenCalled();
		expect(repository.insertIfAbsent).not.toHaveBeenCalled();
	});

	it('stores an immutable encrypted dispatch request for owner recovery', async () => {
		const repository = mock<AgentDepartmentWorkflowInputRepository>();
		const cipher = mock<Cipher>();
		cipher.encryptV2.mockResolvedValue('encrypted-dispatch');
		cipher.decryptV2.mockResolvedValue(JSON.stringify(dispatchData));
		repository.findForInvocation
			.mockResolvedValueOnce({
				projectId: input.projectId,
				invocationId: input.invocationId,
				inputsRef: input.inputsRef,
				inputHash: input.inputHash,
				encryptedInputs: 'encrypted-inputs',
				encryptedDispatchData: null,
			} as never)
			.mockResolvedValue({
				projectId: input.projectId,
				invocationId: input.invocationId,
				inputsRef: input.inputsRef,
				inputHash: input.inputHash,
				encryptedInputs: 'encrypted-inputs',
				encryptedDispatchData: 'encrypted-dispatch',
			} as never);
		const service = new AgentDepartmentWorkflowInvocationInputService(repository, cipher);

		await service.stageDispatch({ dispatchData });

		expect(cipher.encryptV2).toHaveBeenCalledWith(JSON.stringify(dispatchData));
		expect(repository.saveDispatchData).toHaveBeenCalledWith(
			input.projectId,
			input.invocationId,
			'encrypted-dispatch',
		);
		await expect(
			service.resolveDispatch({
				projectId: input.projectId,
				invocationId: input.invocationId,
				inputHash: input.inputHash,
			}),
		).resolves.toEqual(dispatchData);
	});

	it('rejects a dispatch request whose reservation identity changed', async () => {
		const repository = mock<AgentDepartmentWorkflowInputRepository>();
		const cipher = mock<Cipher>();
		cipher.decryptV2.mockResolvedValue(
			JSON.stringify({ ...dispatchData, inputHash: 'd'.repeat(64) }),
		);
		repository.findForInvocation.mockResolvedValue({
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputsRef: input.inputsRef,
			inputHash: input.inputHash,
			encryptedInputs: 'encrypted-inputs',
			encryptedDispatchData: 'encrypted-dispatch',
		} as never);
		const service = new AgentDepartmentWorkflowInvocationInputService(repository, cipher);

		await expect(
			service.resolveDispatch({
				projectId: input.projectId,
				invocationId: input.invocationId,
				inputHash: input.inputHash,
			}),
		).rejects.toThrow('Workflow dispatch data does not match its reservation.');
	});
});
