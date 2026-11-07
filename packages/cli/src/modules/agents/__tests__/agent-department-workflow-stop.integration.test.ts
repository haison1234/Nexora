import { createWorkflow, testDb, testModules } from '@n8n/backend-test-utils';
import { GlobalConfig } from '@n8n/config';
import { ExecutionRepository } from '@n8n/db';
import { Container } from '@n8n/di';
import { createRunExecutionData } from 'n8n-workflow';
import { stringify } from 'flatted';

import { ExecutionPersistence } from '@/executions/execution-persistence';
import { ExecutionService } from '@/executions/execution.service';
import type { WorkflowRunner } from '@/workflow-runner';
import { ExecutionStopService } from '@/scaling/execution-stop.service';
import { AgentDepartmentWorkflowInvocationOwnerService } from '../agent-department-workflow-invocation-owner.service';
import { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';

import { createExecution } from '@test-integration/db/executions';
import { createOwner } from '@test-integration/db/users';
import { mock } from 'vitest-mock-extended';

const invocation = {
	projectId: 'department-project',
	invocationId: 'department-invocation',
	inputHash: 'a'.repeat(64),
	workflowVersion: 'published-version',
};

describe('AI Department workflow child stop with native persistence', () => {
	const config = Container.get(GlobalConfig);
	let workflow: Awaited<ReturnType<typeof createWorkflow>>;

	beforeAll(async () => {
		await testModules.loadModules(['agents']);
		await testDb.init();
		const owner = await createOwner();
		workflow = await createWorkflow({}, owner);
	});

	afterEach(async () => {
		await testDb.truncate(['ExecutionEntity']);
		config.executions.mode = 'regular';
	});

	afterAll(async () => await testDb.terminate());

	it.each(['regular', 'queue'] as const)(
		'requests native stop for a verified waiting child in %s mode',
		async (mode) => {
			config.executions.mode = mode;
			const executionData = createRunExecutionData({
				resultData: {
					runData: {},
					metadata: {
						aiDepartmentProjectId: invocation.projectId,
						aiDepartmentWorkflowInvocationId: invocation.invocationId,
						aiDepartmentWorkflowInputHash: invocation.inputHash,
						aiDepartmentWorkflowVersion: invocation.workflowVersion,
					},
				},
			});
			const execution = await createExecution(
				{
					status: 'waiting',
					finished: false,
					mode: 'integrated',
					data: stringify(executionData),
				},
				workflow,
			);
			const stopBroadcast = vi
				.spyOn(Container.get(ExecutionStopService), 'requestStop')
				.mockResolvedValue(undefined);
			const owner = new AgentDepartmentWorkflowInvocationOwnerService(
				Container.get(ExecutionPersistence),
				Container.get(ExecutionService),
				mock<AgentDepartmentWorkflowEventService>(),
			);

			await owner.requestStop({
				...invocation,
				ownerExecutionRef: execution.id,
				expectedWorkflowVersion: invocation.workflowVersion,
			});

			await expect(
				Container.get(ExecutionRepository).findOneBy({ id: execution.id }),
			).resolves.toMatchObject({ status: 'canceled', finished: false });
			expect(stopBroadcast).toHaveBeenCalledTimes(mode === 'queue' ? 1 : 0);
		},
	);

	it('requests native stop for a verified retrying child', async () => {
		config.executions.mode = 'queue';
		const executionData = createRunExecutionData({
			resultData: {
				runData: {},
				metadata: {
					aiDepartmentProjectId: invocation.projectId,
					aiDepartmentWorkflowInvocationId: invocation.invocationId,
					aiDepartmentWorkflowInputHash: invocation.inputHash,
					aiDepartmentWorkflowVersion: invocation.workflowVersion,
				},
			},
		});
		const execution = await createExecution(
			{
				status: 'running',
				finished: false,
				mode: 'integrated',
				data: stringify(executionData),
				retryOf: 'original-execution',
			},
			workflow,
		);
		const stopBroadcast = vi
			.spyOn(Container.get(ExecutionStopService), 'requestStop')
			.mockResolvedValue(undefined);
		const owner = new AgentDepartmentWorkflowInvocationOwnerService(
			Container.get(ExecutionPersistence),
			Container.get(ExecutionService),
			mock<AgentDepartmentWorkflowEventService>(),
		);

		await owner.requestStop({
			...invocation,
			ownerExecutionRef: execution.id,
			expectedWorkflowVersion: invocation.workflowVersion,
		});

		await expect(
			Container.get(ExecutionRepository).findOneBy({ id: execution.id }),
		).resolves.toMatchObject({ status: 'canceled', finished: false });
		expect(stopBroadcast).toHaveBeenCalledTimes(1);
	});

	it('looks up the same queued child after owner reconstruction', async () => {
		config.executions.mode = 'queue';
		const ownerInvocationKey = 'b'.repeat(64);
		const executionData = createRunExecutionData({
			resultData: {
				runData: {},
				metadata: {
					aiDepartmentProjectId: invocation.projectId,
					aiDepartmentWorkflowInvocationId: invocation.invocationId,
					aiDepartmentWorkflowInputHash: invocation.inputHash,
					aiDepartmentWorkflowVersion: invocation.workflowVersion,
					aiDepartmentWorkflowQueueName: 'jobs-pool-a',
				},
			},
		});
		const persistence = Container.get(ExecutionPersistence);
		const executionId = await persistence.create({
			data: executionData,
			mode: 'integrated',
			finished: false,
			workflowData: workflow,
			status: 'new',
			workflowId: workflow.id,
			deduplicationKey: ownerInvocationKey,
		});
		const createOwnerService = () => {
			const workflowRunner = mock<WorkflowRunner>();
			workflowRunner.isDepartmentExecutionQueued.mockResolvedValue(true);
			return new AgentDepartmentWorkflowInvocationOwnerService(
				persistence,
				Container.get(ExecutionService),
				mock<AgentDepartmentWorkflowEventService>(),
				workflowRunner,
			);
		};
		const ownerInput = {
			...invocation,
			ownerInvocationKey,
			expectedWorkflowVersion: invocation.workflowVersion,
		};

		const firstOwner = await createOwnerService().lookup(ownerInput);
		const recoveredOwner = await createOwnerService().lookup(ownerInput);

		expect(firstOwner).toMatchObject({
			kind: 'accepted',
			ownerExecutionRef: executionId,
			actualWorkflowVersion: invocation.workflowVersion,
			childState: 'pending',
		});
		expect(recoveredOwner).toEqual(firstOwner);
	});
});
