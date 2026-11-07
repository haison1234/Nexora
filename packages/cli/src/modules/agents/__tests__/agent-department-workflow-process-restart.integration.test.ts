import { createWorkflow, testDb, testModules } from '@n8n/backend-test-utils';
import { ExecutionPersistence } from '@/executions/execution-persistence';
import { ScalingService } from '@/scaling/scaling.service';
import { WorkflowRunner } from '@/workflow-runner';
import { GlobalConfig } from '@n8n/config';
import { Container } from '@n8n/di';
import Bull from 'bull';
import { createRunExecutionData, EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE } from 'n8n-workflow';
import { mock } from 'vitest-mock-extended';

import type { JobData } from '@/scaling/scaling.types';
import { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';
import { AgentDepartmentWorkflowInvocationOwnerService } from '../agent-department-workflow-invocation-owner.service';
import * as integrationUtils from '@test-integration/utils';
import { loadNodesFromDist } from '@test-integration/utils/node-types-data';

const phase = process.env.N8N_TEST_DEPARTMENT_RESTART_PHASE;
const redisHost = process.env.N8N_TEST_REDIS_HOST;
const redisPort = Number(process.env.N8N_TEST_REDIS_PORT);
const queuePrefix = process.env.N8N_TEST_DEPARTMENT_RESTART_PREFIX;
const queueName = 'jobs-pool-a';
const invocation = {
	projectId: 'restart-project',
	invocationId: 'restart-invocation',
	ownerInvocationKey: 'department-restart-owner-key',
	inputHash: 'c'.repeat(64),
	workflowVersion: 'published-restart-version',
};

describe.skipIf(!['prepare', 'recover'].includes(phase ?? ''))(
	'AI Department child recovery across process restart',
	() => {
		let queue: Bull.Queue<JobData>;
		let scalingService: ScalingService | undefined;

		beforeAll(async () => {
			if (!redisHost || !redisPort || !queuePrefix) {
				throw new Error('Dedicated test Redis settings are required.');
			}
			Object.assign(Container.get(GlobalConfig).queue.bull.redis, {
				host: redisHost,
				port: redisPort,
			});
			Container.get(GlobalConfig).queue.bull.prefix = queuePrefix;
			await testModules.loadModules(['agents']);
			await testDb.init();
			queue = new Bull<JobData>(queueName, {
				prefix: queuePrefix,
				redis: { host: redisHost, port: redisPort },
			});
			await queue.isReady();
		});

		afterAll(async () => {
			if (scalingService) {
				await scalingService.stop();
				const queues = Reflect.get(scalingService, 'queueByName') as Map<
					string,
					Bull.Queue<JobData>
				>;
				await Promise.all([...queues.values()].map(async (item) => await item.close()));
			}
			await queue?.close();
			await testDb.terminate();
		});

		it.skipIf(phase !== 'prepare')(
			'persists one native child under the invocation key before dispatch',
			async () => {
				const triggerNode = {
					id: 'restart-trigger',
					name: 'When Executed by Another Workflow',
					type: EXECUTE_WORKFLOW_TRIGGER_NODE_TYPE,
					typeVersion: 1.1,
					position: [0, 0] as [number, number],
					parameters: { inputSource: 'passthrough' },
				};
				const workflow = await createWorkflow({ nodes: [triggerNode] });
				const workflowData = { ...workflow, versionId: invocation.workflowVersion };
				const triggerInput = { json: { acceptance: 'process-restart' } };
				const pinData = { [triggerNode.name]: [triggerInput] };
				const executionData = createRunExecutionData({
					startData: {},
					resultData: {
						pinData,
						runData: {},
						metadata: {
							aiDepartmentProjectId: invocation.projectId,
							aiDepartmentWorkflowInvocationId: invocation.invocationId,
							aiDepartmentWorkflowInputHash: invocation.inputHash,
							aiDepartmentWorkflowVersion: invocation.workflowVersion,
							aiDepartmentWorkflowQueueName: queueName,
						},
					},
					executionData: {
						contextData: {},
						metadata: {},
						nodeExecutionStack: [
							{
								node: triggerNode,
								data: { main: [[triggerInput]] },
								source: null,
							},
						],
						waitingExecution: {},
						waitingExecutionSource: {},
					},
				});

				const executionId = await Container.get(ExecutionPersistence).create({
					data: executionData,
					mode: 'integrated',
					finished: false,
					workflowData,
					status: 'new',
					workflowId: workflow.id,
					deduplicationKey: invocation.ownerInvocationKey,
				});

				expect(executionId).toBeTruthy();
				expect(await queue.getJob(executionId)).toBeNull();
			},
		);

		it.skipIf(phase !== 'recover')(
			'recovers the same child and accepts one Bull job in a fresh process',
			async () => {
				Object.assign(Container.get(GlobalConfig).executions, { mode: 'queue' });
				await integrationUtils.initNodeTypes(
					loadNodesFromDist(['n8n-nodes-base.executeWorkflowTrigger']),
				);
				scalingService = Container.get(ScalingService);
				const workflowRunner = Container.get(WorkflowRunner);
				const owner = new AgentDepartmentWorkflowInvocationOwnerService(
					Container.get(ExecutionPersistence),
					mock(),
					mock<AgentDepartmentWorkflowEventService>(),
					workflowRunner,
				);
				const ownerInput = {
					projectId: invocation.projectId,
					invocationId: invocation.invocationId,
					ownerInvocationKey: invocation.ownerInvocationKey,
					inputHash: invocation.inputHash,
					expectedWorkflowVersion: invocation.workflowVersion,
				};

				await expect(owner.lookup(ownerInput)).resolves.toEqual({ kind: 'unknown' });
				const recovered = await owner.recover(ownerInput);
				expect(recovered).toMatchObject({
					kind: 'accepted',
					ownerExecutionRef: expect.any(String),
					actualWorkflowVersion: invocation.workflowVersion,
					childState: 'pending',
				});
				const replayed = await owner.recover(ownerInput);
				expect(replayed).toEqual(recovered);
				const [job] = await queue.getJobs(['waiting']);
				expect(job?.id).toBe(
					recovered.kind === 'accepted' ? recovered.ownerExecutionRef : undefined,
				);
				expect(await queue.getJobCounts()).toMatchObject({ waiting: 1 });
			},
			30_000,
		);
	},
);
