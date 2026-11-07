import type { ExecutionPersistence } from '@/executions/execution-persistence';
import type { ExecutionService } from '@/executions/execution.service';
import type { SubworkflowPolicyChecker } from '@/executions/pre-execution-checks/subworkflow-policy-checker';
import { EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE } from 'n8n-workflow';
import type { WorkflowRunner } from '@/workflow-runner';
import { mock } from 'vitest-mock-extended';

import type { DepartmentWorkflowInvocationInputsProxy } from '../agent-department-execution.contracts';
import type { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';
import { AgentDepartmentWorkflowInvocationOwnerService } from '../agent-department-workflow-invocation-owner.service';
import type { WorkflowToolWorkflowLoader } from '../tools/workflow-tool-workflow-loader.service';

const request = {
	projectId: 'project-a',
	invocationId: 'invocation-a',
	ownerInvocationKey: 'owner-key-a',
	inputHash: 'a'.repeat(64),
	expectedWorkflowVersion: 'published-v2',
};

describe('AgentDepartmentWorkflowInvocationOwnerService', () => {
	it('reports absent when native persistence has no matching idempotency key', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue(null);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(service.lookup(request)).resolves.toEqual({ kind: 'absent' });
		expect(persistence.findSingleExecution).not.toHaveBeenCalled();
		expect(events.record).not.toHaveBeenCalled();
	});

	it('returns unknown for a malformed owner execution reference without querying persistence', async () => {
		const persistence = mock<ExecutionPersistence>();
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			mock<ExecutionService>(),
			mock<AgentDepartmentWorkflowEventService>(),
		);

		await expect(
			service.snapshot({ ...request, ownerExecutionRef: 'child-execution-a' }),
		).resolves.toEqual({ kind: 'unknown' });
		expect(persistence.findSingleExecution).not.toHaveBeenCalled();
	});

	it('ignores a malformed owner execution reference when requesting a stop', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			mock<AgentDepartmentWorkflowEventService>(),
		);

		await service.requestStop({ ...request, ownerExecutionRef: 'child-execution-a' });
		expect(persistence.findSingleExecution).not.toHaveBeenCalled();
		expect(executions.stop).not.toHaveBeenCalled();
	});

	it('does not dispatch during lookup when native persistence has no row', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		const inputs = mock<DepartmentWorkflowInvocationInputsProxy>();
		const workflowLoader = mock<WorkflowToolWorkflowLoader>();
		const subworkflowPolicyChecker = mock<SubworkflowPolicyChecker>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue(null);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
			inputs,
			workflowLoader,
			subworkflowPolicyChecker,
		);

		await expect(service.lookup(request)).resolves.toEqual({ kind: 'absent' });
		expect(inputs.resolveDispatch).not.toHaveBeenCalled();
		expect(workflowRunner.run).not.toHaveBeenCalled();
	});

	it('rejects a retained execution whose invocation identity does not match', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			status: 'running',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: 'different-invocation',
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(service.lookup(request)).resolves.toEqual({ kind: 'unknown' });
		expect(events.record).not.toHaveBeenCalled();
	});

	it('records a durable outcome event before returning a verified acceptance', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			status: 'waiting',
			workflowId: 'workflow-a',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(service.lookup(request)).resolves.toEqual({
			kind: 'accepted',
			ownerExecutionRef: '123',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'waiting',
		});
		expect(events.record).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerExecutionRef: '123',
				actualWorkflowVersion: request.expectedWorkflowVersion,
				childState: 'waiting',
			}),
		);
	});

	it('does not accept a new execution row before dispatch is observable', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			status: 'new',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(service.lookup(request)).resolves.toEqual({ kind: 'unknown' });
		expect(events.record).not.toHaveBeenCalled();
	});

	it('accepts a new row only when its queue job is observable', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'new',
			mode: 'integrated',
			workflowId: 'workflow-a',
			workflowData: { id: 'workflow-a', nodes: [], connections: {} },
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
						aiDepartmentWorkflowQueueName: 'jobs-pool-a',
					},
				},
			},
		} as never);
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);

		await expect(service.lookup(request)).resolves.toMatchObject({
			kind: 'accepted',
			ownerExecutionRef: '123',
			childState: 'pending',
		});
		expect(workflowRunner.isDepartmentExecutionQueued).toHaveBeenCalledWith(
			'123',
			expect.objectContaining({
				executionMode: 'integrated',
				projectId: request.projectId,
				executionData: expect.objectContaining({
					resultData: expect.objectContaining({
						metadata: expect.objectContaining({
							aiDepartmentWorkflowQueueName: 'jobs-pool-a',
						}),
					}),
				}),
			}),
		);
	});

	it('keeps recovery unknown until the re-enqueued job is observable', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		const inputs = mock<DepartmentWorkflowInvocationInputsProxy>();
		const workflowLoader = mock<WorkflowToolWorkflowLoader>();
		const subworkflowPolicyChecker = mock<SubworkflowPolicyChecker>();
		const triggerNode = {
			id: 'trigger-a',
			name: 'When Executed by Another Workflow',
			type: EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE,
			typeVersion: 1.1,
			position: [0, 0],
			parameters: { inputSource: 'passthrough' },
		};
		const workflowData = {
			id: 'workflow-a',
			versionId: request.expectedWorkflowVersion,
			nodes: [triggerNode],
			connections: {},
		};
		inputs.resolveDispatch.mockResolvedValue({
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerInvocationKey: request.ownerInvocationKey,
			inputsRef: 'inputs-ref-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
			workflowId: 'workflow-a',
			executionMode: 'integrated',
			userId: 'user-a',
			agentRun: {
				agentId: 'agent-a',
				projectId: request.projectId,
				threadId: 'thread-a',
				runId: 'run-a',
				toolCallId: 'tool-call-a',
				userId: 'user-a',
			},
		});
		inputs.resolve.mockResolvedValue({ value: 1 });
		workflowLoader.loadWorkflow.mockResolvedValue(workflowData as never);
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution
			.mockResolvedValueOnce({
				id: '123',
				status: 'new',
				mode: 'integrated',
				workflowId: 'workflow-a',
				workflowData: { id: 'workflow-a', nodes: [], connections: {} },
				data: {
					parentAgentRun: { userId: 'user-a' },
					resultData: {
						metadata: {
							aiDepartmentProjectId: request.projectId,
							aiDepartmentWorkflowInvocationId: request.invocationId,
							aiDepartmentWorkflowInputHash: request.inputHash,
							aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
						},
					},
				},
			} as never)
			.mockResolvedValueOnce({ status: 'new' } as never);
		workflowRunner.run.mockResolvedValue('123');
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(false);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
			inputs,
			workflowLoader,
			subworkflowPolicyChecker,
		);

		await expect(service.recover(request)).resolves.toEqual({ kind: 'unknown' });
		expect(workflowRunner.run).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user-a' }),
			undefined,
			false,
			expect.objectContaining({ executionId: '123', expectedStatus: 'new' }),
		);
		expect(events.record).not.toHaveBeenCalled();
	});

	it('recovers the same new native execution with its stored caller identity', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'new',
			mode: 'manual',
			workflowId: 'workflow-a',
			storedAt: 'fs',
			workflowData: { id: 'workflow-a', nodes: [], connections: {} },
			data: {
				parentAgentRun: { userId: 'user-a' },
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		workflowRunner.run.mockResolvedValue('123');
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);

		await expect(service.recover(request)).resolves.toEqual({
			kind: 'accepted',
			ownerExecutionRef: '123',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'pending',
		});
		expect(workflowRunner.run).toHaveBeenCalledWith(
			expect.objectContaining({
				executionMode: 'manual',
				projectId: request.projectId,
				userId: 'user-a',
			}),
			undefined,
			false,
			{ executionId: '123', expectedStatus: 'new', storedAt: 'fs' },
		);
	});

	it('recreates a missing native child from its encrypted dispatch request', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		const inputs = mock<DepartmentWorkflowInvocationInputsProxy>();
		const workflowLoader = mock<WorkflowToolWorkflowLoader>();
		const subworkflowPolicyChecker = mock<SubworkflowPolicyChecker>();
		const triggerNode = {
			id: 'trigger-a',
			name: 'When Executed by Another Workflow',
			type: EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE,
			typeVersion: 1.1,
			position: [0, 0],
			parameters: { inputSource: 'passthrough' },
		};
		const workflowData = {
			id: 'workflow-a',
			name: 'Workflow A',
			versionId: request.expectedWorkflowVersion,
			nodes: [triggerNode],
			connections: {},
		};
		const dispatchData = {
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerInvocationKey: request.ownerInvocationKey,
			inputsRef: 'input-ref-a',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
			workflowId: 'workflow-a',
			executionMode: 'manual' as const,
			userId: 'user-a',
			agentRun: {
				agentId: 'agent-a',
				projectId: request.projectId,
				threadId: 'attempt-a',
				runId: 'run-a',
				toolCallId: 'tool-call-a',
				userId: 'user-a',
			},
		};
		persistence.findExecutionIdByDeduplicationKey
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce('123')
			.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'new',
			mode: 'manual',
			workflowData,
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		inputs.resolveDispatch.mockResolvedValue(dispatchData);
		inputs.resolve.mockResolvedValue({ value: 1 });
		workflowLoader.loadWorkflow.mockResolvedValue(workflowData as never);
		workflowRunner.run.mockResolvedValue('123');
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
			inputs,
			workflowLoader,
			subworkflowPolicyChecker,
		);

		await expect(service.recover(request)).resolves.toMatchObject({
			kind: 'accepted',
			ownerExecutionRef: '123',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'pending',
		});
		expect(workflowRunner.run).toHaveBeenCalledWith(
			expect.objectContaining({
				deduplicationKey: request.ownerInvocationKey,
				userId: 'user-a',
				workflowData,
			}),
		);
		expect(subworkflowPolicyChecker.checkForProject).toHaveBeenCalledWith(
			workflowData,
			request.projectId,
			'user-a',
		);
	});

	it('does not recover a new execution when its stored caller identity is missing', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		const executionData = {
			id: '123',
			status: 'new',
			mode: 'manual',
			workflowData: { id: 'workflow-a', nodes: [], connections: {} },
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		};
		persistence.findExecutionIdByDeduplicationKey.mockResolvedValue('123');
		persistence.findSingleExecution.mockResolvedValue(executionData as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);

		await expect(service.recover(request)).resolves.toEqual({ kind: 'unknown' });
		expect(workflowRunner.run).not.toHaveBeenCalled();
		expect(events.record).not.toHaveBeenCalled();
	});

	it('stops only a child execution with matching persisted department identity', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'waiting',
			workflowId: 'workflow-a',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await service.requestStop({
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerExecutionRef: '123',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(executions.stop).toHaveBeenCalledWith('123', ['workflow-a']);
		expect(events.record).not.toHaveBeenCalled();
	});

	it('records owner terminal proof without issuing a redundant stop', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'success',
			workflowId: 'workflow-a',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await service.requestStop({
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerExecutionRef: '123',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(executions.stop).not.toHaveBeenCalled();
		expect(events.record).toHaveBeenCalledWith(
			expect.objectContaining({ childState: 'succeeded', ownerExecutionRef: '123' }),
		);
	});

	it('does not treat a canceled row with an active queue job as terminal proof', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'canceled',
			mode: 'integrated',
			workflowId: 'workflow-a',
			workflowData: { id: 'workflow-a' },
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);

		await service.requestStop({
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerExecutionRef: '123',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
		});

		expect(workflowRunner.isDepartmentExecutionQueued).toHaveBeenCalled();
		expect(executions.stop).not.toHaveBeenCalled();
		expect(events.record).not.toHaveBeenCalled();
	});

	it('returns a snapshot only for a matching persisted child identity', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'waiting',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(
			service.snapshot({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerExecutionRef: '123',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		).resolves.toEqual({
			kind: 'verified',
			ownerExecutionRef: '123',
			actualWorkflowVersion: request.expectedWorkflowVersion,
			childState: 'waiting',
		});
	});

	it('does not report a new execution row as running in a snapshot', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'new',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await expect(
			service.snapshot({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerExecutionRef: '123',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		).resolves.toEqual({ kind: 'unknown' });
	});

	it('keeps a canceled queue child unknown while its Bull job is still active', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		const workflowRunner = mock<WorkflowRunner>();
		workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'canceled',
			mode: 'integrated',
			workflowData: { id: 'workflow-a' },
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);

		await expect(
			service.snapshot({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerExecutionRef: '123',
				inputHash: request.inputHash,
				expectedWorkflowVersion: request.expectedWorkflowVersion,
			}),
		).resolves.toEqual({ kind: 'unknown' });
		expect(events.recordIfChanged).not.toHaveBeenCalled();
	});

	it('writes a durable event when an owner snapshot changes the known child state', async () => {
		const persistence = mock<ExecutionPersistence>();
		const executions = mock<ExecutionService>();
		const events = mock<AgentDepartmentWorkflowEventService>();
		persistence.findSingleExecution.mockResolvedValue({
			id: '123',
			status: 'waiting',
			data: {
				resultData: {
					metadata: {
						aiDepartmentProjectId: request.projectId,
						aiDepartmentWorkflowInvocationId: request.invocationId,
						aiDepartmentWorkflowInputHash: request.inputHash,
						aiDepartmentWorkflowVersion: request.expectedWorkflowVersion,
					},
				},
			},
		} as never);
		const service = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
		);

		await service.reconcileSnapshot({
			projectId: request.projectId,
			invocationId: request.invocationId,
			ownerExecutionRef: '123',
			inputHash: request.inputHash,
			expectedWorkflowVersion: request.expectedWorkflowVersion,
			knownChildState: 'running',
		});

		expect(events.recordIfChanged).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: request.projectId,
				invocationId: request.invocationId,
				ownerExecutionRef: '123',
				childState: 'waiting',
			}),
		);
	});
});
