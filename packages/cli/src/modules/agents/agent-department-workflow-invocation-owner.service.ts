import { Service } from '@n8n/di';
import type { IExecutionResponse } from '@n8n/db';
import { NotFoundError } from '@n8n/errors';
import { isRecord } from '@n8n/utils/is-record';
import { toJsonValue } from '@n8n/utils/json/to-json-value';
import { createRunExecutionData, EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE } from 'n8n-workflow';
import type { IPinData, IWorkflowExecutionDataProcess } from 'n8n-workflow';

import { ExecutionPersistence } from '@/executions/execution-persistence';
import { ExecutionService } from '@/executions/execution.service';
import { SubworkflowPolicyChecker } from '@/executions/pre-execution-checks/subworkflow-policy-checker';
import { ExecutionAlreadyResumingError } from '@/errors/execution-already-resuming.error';
import { WorkflowRunner } from '@/workflow-runner';
import { WorkflowToolWorkflowLoader } from './tools/workflow-tool-workflow-loader.service';

import {
	DepartmentWorkflowInvocationOwner,
	DepartmentWorkflowInvocationInputsProxy,
	type DepartmentWorkflowChildState,
	type DepartmentWorkflowInvocationOwnerLookup,
} from './agent-department-execution.contracts';
import { AgentDepartmentWorkflowEventService } from './agent-department-workflow-event.service';

function isValidExecutionId(executionId: string): boolean {
	const numericId = Number(executionId);
	return Number.isSafeInteger(numericId) && numericId > 0;
}

@Service()
export class AgentDepartmentWorkflowInvocationOwnerService extends DepartmentWorkflowInvocationOwner {
	constructor(
		private readonly persistence: ExecutionPersistence,
		private readonly executions: ExecutionService,
		private readonly events: AgentDepartmentWorkflowEventService,
		private readonly workflowRunner?: WorkflowRunner,
		private readonly inputs?: DepartmentWorkflowInvocationInputsProxy,
		private readonly workflowLoader?: WorkflowToolWorkflowLoader,
		private readonly subworkflowPolicyChecker?: SubworkflowPolicyChecker,
	) {
		super();
	}

	async lookup(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationKey: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<DepartmentWorkflowInvocationOwnerLookup> {
		const executionId = await this.persistence.findExecutionIdByDeduplicationKey(
			input.ownerInvocationKey,
		);
		if (!executionId) return { kind: 'absent' };

		const execution = await this.persistence.findSingleExecution(executionId, {
			includeData: true,
			unflattenData: true,
		});
		const metadata = execution?.data?.resultData?.metadata;
		if (
			!execution ||
			metadata?.aiDepartmentProjectId !== input.projectId ||
			metadata?.aiDepartmentWorkflowInvocationId !== input.invocationId ||
			metadata?.aiDepartmentWorkflowInputHash !== input.inputHash ||
			metadata?.aiDepartmentWorkflowVersion !== input.expectedWorkflowVersion
		) {
			return { kind: 'unknown' };
		}
		if (
			execution.status === 'canceled' &&
			(await this.hasPendingQueueJob(input.projectId, executionId, execution))
		) {
			return { kind: 'unknown' };
		}
		let childState: Exclude<DepartmentWorkflowChildState, 'unknown'> | undefined;
		if (execution.status === 'new') {
			if (
				!this.workflowRunner ||
				!execution.workflowData ||
				!(await this.workflowRunner.isDepartmentExecutionQueued(executionId, {
					executionMode: execution.mode,
					executionData: execution.data,
					workflowData: execution.workflowData,
					projectId: input.projectId,
				}))
			) {
				return { kind: 'unknown' };
			}
			childState = 'pending';
		} else {
			childState = this.childState(execution.status);
		}
		if (!childState) return { kind: 'unknown' };

		await this.events.record({
			projectId: input.projectId,
			invocationId: input.invocationId,
			ownerExecutionRef: executionId,
			actualWorkflowVersion: input.expectedWorkflowVersion,
			childState,
			occurredAt: new Date(),
		});

		return {
			kind: 'accepted',
			ownerExecutionRef: executionId,
			actualWorkflowVersion: input.expectedWorkflowVersion,
			childState,
		};
	}

	async recover(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationKey: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<DepartmentWorkflowInvocationOwnerLookup> {
		const executionId = await this.persistence.findExecutionIdByDeduplicationKey(
			input.ownerInvocationKey,
		);
		if (!executionId) {
			return (await this.recoverBeforeNativePersistence(
				input,
			)) as DepartmentWorkflowInvocationOwnerLookup;
		}

		const execution = await this.persistence.findSingleExecution(executionId, {
			includeData: true,
			unflattenData: true,
		});
		const metadata = execution?.data?.resultData?.metadata;
		if (
			!execution ||
			metadata?.aiDepartmentProjectId !== input.projectId ||
			metadata?.aiDepartmentWorkflowInvocationId !== input.invocationId ||
			metadata?.aiDepartmentWorkflowInputHash !== input.inputHash ||
			metadata?.aiDepartmentWorkflowVersion !== input.expectedWorkflowVersion
		) {
			return { kind: 'unknown' };
		}
		if (execution.status !== 'new') return await this.lookup(input);
		if (
			!execution.data ||
			!execution.workflowData ||
			!execution.workflowId ||
			!this.workflowRunner
		) {
			return { kind: 'unknown' };
		}

		try {
			const recoveredExecutionId = await this.workflowRunner.run(
				{
					executionMode: execution.mode,
					workflowData: execution.workflowData,
					executionData: execution.data,
					projectId: input.projectId,
					...(execution.data.parentAgentRun?.userId
						? { userId: execution.data.parentAgentRun.userId }
						: {}),
				},
				undefined,
				false,
				{
					executionId,
					expectedStatus: 'new',
					storedAt: execution.storedAt,
				},
			);
			if (recoveredExecutionId !== executionId) return { kind: 'unknown' };
		} catch (error) {
			if (error instanceof ExecutionAlreadyResumingError) return { kind: 'unknown' };
			throw error;
		}
		const latest = await this.persistence.findSingleExecution(executionId, {
			includeData: true,
			unflattenData: true,
		});
		if (!latest) return { kind: 'unknown' };
		return await this.lookup(input);
	}

	private async recoverBeforeNativePersistence(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationKey: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}) {
		if (
			!this.workflowRunner ||
			!this.inputs ||
			!this.workflowLoader ||
			!this.subworkflowPolicyChecker
		) {
			return { kind: 'unknown' } as const;
		}
		const identity = {
			projectId: input.projectId,
			invocationId: input.invocationId,
			inputHash: input.inputHash,
		};
		let dispatch;
		let inputData: unknown;
		try {
			dispatch = await this.inputs.resolveDispatch(identity);
		} catch (error) {
			if (error instanceof NotFoundError) return { kind: 'absent' } as const;
			return { kind: 'unknown' } as const;
		}
		try {
			inputData = await this.inputs.resolve({
				...identity,
				inputsRef: dispatch.inputsRef,
			});
		} catch {
			return { kind: 'unknown' } as const;
		}
		if (
			dispatch.ownerInvocationKey !== input.ownerInvocationKey ||
			dispatch.expectedWorkflowVersion !== input.expectedWorkflowVersion ||
			dispatch.projectId !== input.projectId ||
			dispatch.invocationId !== input.invocationId ||
			dispatch.inputHash !== input.inputHash ||
			!isRecord(inputData)
		) {
			return { kind: 'unknown' } as const;
		}
		const workflow = await this.workflowLoader.loadWorkflow(
			dispatch.projectId,
			{ workflowId: dispatch.workflowId, workflowName: dispatch.workflowId },
			{ usePublishedVersion: true },
		);
		if (!workflow || workflow.versionId !== dispatch.expectedWorkflowVersion) {
			return { kind: 'unknown' } as const;
		}
		const triggerNode = workflow.nodes?.find(
			(node) => node.type === EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE,
		);
		if (!triggerNode) return { kind: 'unknown' } as const;
		await this.subworkflowPolicyChecker.checkForProject(
			workflow,
			dispatch.projectId,
			dispatch.userId,
		);
		const workflowData =
			workflow.pinData === undefined ? workflow : { ...workflow, pinData: undefined };
		const jsonInputData = toJsonValue(inputData);
		if (
			jsonInputData === null ||
			typeof jsonInputData !== 'object' ||
			Array.isArray(jsonInputData)
		) {
			return { kind: 'unknown' } as const;
		}
		const triggerPinData: IPinData = {
			[triggerNode.name]: [{ json: jsonInputData }],
		};
		const runData: IWorkflowExecutionDataProcess = {
			executionMode: dispatch.executionMode,
			...(dispatch.userId ? { userId: dispatch.userId } : {}),
			deduplicationKey: dispatch.ownerInvocationKey,
			workflowData,
			startNodes: [{ name: triggerNode.name, sourceData: null }],
			pinData: triggerPinData,
			executionData: createRunExecutionData({
				parentAgentRun: dispatch.agentRun,
				startData: {},
				resultData: {
					pinData: triggerPinData,
					runData: {},
					metadata: {
						aiDepartmentProjectId: dispatch.projectId,
						aiDepartmentWorkflowInputHash: dispatch.inputHash,
						aiDepartmentWorkflowInvocationId: dispatch.invocationId,
						aiDepartmentWorkflowVersion: dispatch.expectedWorkflowVersion,
					},
				},
				executionData: {
					contextData: {},
					metadata: {},
					nodeExecutionStack: [
						{
							node: triggerNode,
							data: { main: [triggerPinData[triggerNode.name]] },
							source: null,
						},
					],
					waitingExecution: {},
					waitingExecutionSource: {},
				},
			}),
		};
		try {
			await this.workflowRunner.run(runData);
		} catch {
			return await this.lookup(input);
		}
		const executionId = await this.persistence.findExecutionIdByDeduplicationKey(
			input.ownerInvocationKey,
		);
		if (!executionId) return { kind: 'unknown' };
		return await this.lookup(input);
	}

	async requestStop(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<void> {
		if (!isValidExecutionId(input.ownerExecutionRef)) return;
		const execution = await this.persistence.findSingleExecution(input.ownerExecutionRef, {
			includeData: true,
			unflattenData: true,
		});
		const metadata = execution?.data?.resultData?.metadata;
		if (
			!execution ||
			metadata?.aiDepartmentProjectId !== input.projectId ||
			metadata?.aiDepartmentWorkflowInvocationId !== input.invocationId ||
			metadata?.aiDepartmentWorkflowInputHash !== input.inputHash ||
			metadata?.aiDepartmentWorkflowVersion !== input.expectedWorkflowVersion ||
			typeof execution.workflowId !== 'string'
		) {
			return;
		}

		const childState = this.childState(execution.status);
		if (!childState) return;
		if (childState === 'succeeded' || childState === 'failed' || childState === 'cancelled') {
			if (
				childState === 'cancelled' &&
				(await this.hasPendingQueueJob(input.projectId, input.ownerExecutionRef, execution))
			) {
				return;
			}
			await this.events.record({
				projectId: input.projectId,
				invocationId: input.invocationId,
				ownerExecutionRef: input.ownerExecutionRef,
				actualWorkflowVersion: input.expectedWorkflowVersion,
				childState,
				occurredAt: new Date(),
			});
			return;
		}

		await this.executions.stop(input.ownerExecutionRef, [execution.workflowId]);
	}

	async snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}) {
		if (!isValidExecutionId(input.ownerExecutionRef)) return { kind: 'unknown' } as const;
		const execution = await this.persistence.findSingleExecution(input.ownerExecutionRef, {
			includeData: true,
			unflattenData: true,
		});
		const metadata = execution?.data?.resultData?.metadata;
		if (
			!execution ||
			metadata?.aiDepartmentProjectId !== input.projectId ||
			metadata?.aiDepartmentWorkflowInvocationId !== input.invocationId ||
			metadata?.aiDepartmentWorkflowInputHash !== input.inputHash ||
			metadata?.aiDepartmentWorkflowVersion !== input.expectedWorkflowVersion
		) {
			return { kind: 'unknown' } as const;
		}
		if (
			execution.status === 'canceled' &&
			(await this.hasPendingQueueJob(input.projectId, input.ownerExecutionRef, execution))
		) {
			return { kind: 'unknown' } as const;
		}
		// Do not project a persisted row as running until dispatch is observable.
		if (execution.status === 'new') return { kind: 'unknown' } as const;
		const childState = this.childState(execution.status);
		if (!childState) return { kind: 'unknown' } as const;
		return {
			kind: 'verified' as const,
			ownerExecutionRef: input.ownerExecutionRef,
			actualWorkflowVersion: input.expectedWorkflowVersion,
			childState,
		};
	}

	async reconcileSnapshot(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
		knownChildState: DepartmentWorkflowChildState;
	}): Promise<void> {
		const snapshot = await this.snapshot(input);
		if (snapshot.kind !== 'verified' || snapshot.childState === input.knownChildState) return;
		await this.events.recordIfChanged({
			projectId: input.projectId,
			invocationId: input.invocationId,
			ownerExecutionRef: snapshot.ownerExecutionRef,
			actualWorkflowVersion: snapshot.actualWorkflowVersion,
			childState: snapshot.childState,
			occurredAt: new Date(),
		});
	}

	private childState(
		status: string,
	): 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | undefined {
		if (status === 'waiting') return 'waiting';
		if (status === 'success') return 'succeeded';
		if (status === 'error' || status === 'crashed') return 'failed';
		if (status === 'canceled') return 'cancelled';
		if (status === 'new' || status === 'running') return 'running';
		return undefined;
	}

	private async hasPendingQueueJob(
		projectId: string,
		executionId: string,
		execution: IExecutionResponse,
	): Promise<boolean> {
		if (!this.workflowRunner || !execution.data || !execution.workflowData) return true;
		try {
			return await this.workflowRunner.isDepartmentExecutionQueued(executionId, {
				executionMode: execution.mode,
				projectId,
				executionData: execution.data,
				workflowData: execution.workflowData,
			});
		} catch {
			return true;
		}
	}
}
