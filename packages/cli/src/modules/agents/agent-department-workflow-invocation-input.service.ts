import { ConflictError, NotFoundError } from '@n8n/errors';
import { Service } from '@n8n/di';
import { Cipher } from 'n8n-core';
import { z } from 'zod';

import {
	DepartmentWorkflowInvocationInputs,
	type DepartmentWorkflowDispatchRequest,
} from './agent-department-execution.contracts';
import { AgentDepartmentWorkflowInput } from './entities/agent-department-workflow-input.entity';
import { AgentDepartmentWorkflowInputRepository } from './repositories/agent-department-workflow-input.repository';

const dispatchRequestSchema = z.object({
	projectId: z.string().min(1),
	invocationId: z.string().min(1),
	ownerInvocationKey: z.string().length(64),
	inputsRef: z.string().min(1).max(255),
	inputHash: z.string().regex(/^[a-f0-9]{64}$/),
	expectedWorkflowVersion: z.string().min(1).max(36),
	workflowId: z.string().min(1).max(36),
	executionMode: z.enum(['manual', 'integrated']),
	userId: z.string().min(1).optional(),
	agentRun: z.object({
		agentId: z.string().min(1),
		projectId: z.string().min(1),
		threadId: z.string().min(1),
		runId: z.string().min(1),
		toolCallId: z.string().min(1),
		integrationType: z.string().optional(),
		previewChat: z.boolean().optional(),
		publishedN8nChat: z.boolean().optional(),
		userId: z.string().min(1).optional(),
	}),
});

@Service()
export class AgentDepartmentWorkflowInvocationInputService extends DepartmentWorkflowInvocationInputs {
	constructor(
		private readonly repository: AgentDepartmentWorkflowInputRepository,
		private readonly cipher: Cipher,
	) {
		super();
	}

	async stage(input: {
		projectId: string;
		invocationId: string;
		inputsRef: string;
		inputHash: string;
		inputs: unknown;
	}): Promise<void> {
		if (!/^[a-f0-9]{64}$/.test(input.inputHash) || !input.inputsRef) {
			throw new ConflictError('Workflow invocation input identity is invalid.');
		}
		const existing = await this.repository.findForInvocation(input.projectId, input.invocationId);
		if (existing) {
			if (existing.inputsRef !== input.inputsRef || existing.inputHash !== input.inputHash) {
				throw new ConflictError('Workflow invocation input does not match its reservation.');
			}
			return;
		}
		const record = Object.assign(new AgentDepartmentWorkflowInput(), {
			id: input.invocationId,
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputsRef: input.inputsRef,
			inputHash: input.inputHash,
			encryptedInputs: await this.cipher.encryptV2(JSON.stringify(input.inputs)),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const inserted = await this.repository.insertIfAbsent(record);
		const persisted = await this.repository.findForInvocation(input.projectId, input.invocationId);
		if (
			!inserted &&
			(!persisted ||
				persisted.inputsRef !== input.inputsRef ||
				persisted.inputHash !== input.inputHash)
		) {
			throw new ConflictError('Workflow invocation input changed while staging.');
		}
	}

	async resolve(input: {
		projectId: string;
		invocationId: string;
		inputsRef: string;
		inputHash: string;
	}): Promise<unknown> {
		const persisted = await this.repository.findForInvocation(input.projectId, input.invocationId);
		if (
			!persisted ||
			persisted.inputsRef !== input.inputsRef ||
			persisted.inputHash !== input.inputHash
		) {
			throw new NotFoundError('Workflow invocation input was not found.');
		}
		try {
			return JSON.parse(await this.cipher.decryptV2(persisted.encryptedInputs)) as unknown;
		} catch {
			throw new ConflictError('Workflow invocation input could not be verified.');
		}
	}

	async stageDispatch(input: {
		dispatchData: DepartmentWorkflowDispatchRequest;
	}): Promise<void> {
		const dispatchData = dispatchRequestSchema.parse(input.dispatchData);
		const persisted = await this.repository.findForInvocation(
			dispatchData.projectId,
			dispatchData.invocationId,
		);
		if (
			!persisted ||
			persisted.inputsRef !== dispatchData.inputsRef ||
			persisted.inputHash !== dispatchData.inputHash
		) {
			throw new NotFoundError('Workflow invocation input was not found.');
		}
		const serialized = JSON.stringify(dispatchData);
		if (!serialized) throw new ConflictError('Workflow dispatch data is invalid.');
		const encrypted = await this.cipher.encryptV2(serialized);
		if (persisted.encryptedDispatchData) {
			const existing = await this.resolveDispatch({
				projectId: dispatchData.projectId,
				invocationId: dispatchData.invocationId,
				inputsRef: dispatchData.inputsRef,
				inputHash: dispatchData.inputHash,
			});
			if (JSON.stringify(existing) !== serialized) {
				throw new ConflictError('Workflow dispatch data changed after it was staged.');
			}
			return;
		}
		await this.repository.saveDispatchData(
			dispatchData.projectId,
			dispatchData.invocationId,
			encrypted,
		);
		const persistedRequest = await this.resolveDispatch({
			projectId: dispatchData.projectId,
			invocationId: dispatchData.invocationId,
			inputsRef: dispatchData.inputsRef,
			inputHash: dispatchData.inputHash,
		});
		if (JSON.stringify(persistedRequest) !== serialized) {
			throw new ConflictError('Workflow dispatch data changed while it was staged.');
		}
	}

	async resolveDispatch(input: {
		projectId: string;
		invocationId: string;
		inputsRef?: string;
		inputHash: string;
	}): Promise<DepartmentWorkflowDispatchRequest> {
		const persisted = await this.repository.findForInvocation(input.projectId, input.invocationId);
		if (
			!persisted ||
			(input.inputsRef !== undefined && persisted.inputsRef !== input.inputsRef) ||
			persisted.inputHash !== input.inputHash ||
			!persisted.encryptedDispatchData
		) {
			throw new NotFoundError('Workflow dispatch data was not found.');
		}
		try {
			const parsed: unknown = JSON.parse(
				await this.cipher.decryptV2(persisted.encryptedDispatchData),
			);
			const dispatch = dispatchRequestSchema.parse(parsed);
			if (
				dispatch.projectId !== input.projectId ||
				dispatch.invocationId !== input.invocationId ||
				dispatch.inputsRef !== persisted.inputsRef ||
				dispatch.inputHash !== input.inputHash
			) {
				throw new ConflictError('Workflow dispatch data does not match its reservation.');
			}
			return dispatch;
		} catch (error) {
			if (error instanceof ConflictError) throw error;
			throw new ConflictError('Workflow dispatch data could not be verified.');
		}
	}

	async delete(projectId: string, invocationId: string) {
		await this.repository.deleteForInvocation(projectId, invocationId);
	}
}
