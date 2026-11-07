import { Logger } from '@n8n/backend-common';
import { createTeamProject, createWorkflow, testDb, testModules } from '@n8n/backend-test-utils';
import type { EventService } from '@n8n/backend-services';
import { TransactionRunner, type ExecutionRepository, type WorkflowRepository } from '@n8n/db';
import { DataSource } from '@n8n/typeorm';
import { ExecutionsConfig, GlobalConfig } from '@n8n/config';
import { Container } from '@n8n/di';
import Bull from 'bull';
import { Redis } from 'ioredis';
import { StorageConfig, type InstanceSettings } from 'n8n-core';
import {
	NodeConnectionTypes,
	createRunExecutionData,
	type IExecuteFunctions,
	type INodeTypeData,
} from 'n8n-workflow';
import { mock } from 'vitest-mock-extended';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ActiveExecutions } from '@/active-executions';
import { ExecutionPersistence } from '@/executions/execution-persistence';
import { ManualExecutionService } from '@/manual-execution.service';
import { NodeTypes } from '@/node-types';
import { JobProcessor } from '@/scaling/job-processor';
import { ExecutionStopService } from '@/scaling/execution-stop.service';
import { COMMAND_PUBSUB_CHANNEL, JOB_TYPE_NAME } from '@/scaling/constants';
import { Subscriber } from '@/scaling/pubsub/subscriber.service';
import { PubSubEventBus } from '@/scaling/pubsub/pubsub.eventbus';
import type { JobData, JobQueue } from '@/scaling/scaling.types';
import { WebhookResponseRelay } from '@/scaling/webhook-response-relay';
import { createOwner } from '@test-integration/db/users';
import { initNodeTypes } from '@test-integration/utils';
import type {
	DepartmentExecutorProxy,
	DepartmentWorkflowInvocationOwnerProxy,
} from '../agent-department-execution.contracts';
import { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';
import { AgentDepartmentWorkflowInvocationOwnerService } from '../agent-department-workflow-invocation-owner.service';
import { ExecutionService } from '@/executions/execution.service';
import { WorkflowInvocationService } from '@/modules/ai-department/workflow/workflow-invocation.service';
import { Department } from '@/modules/ai-department/database/entities/department.entity';
import { Member } from '@/modules/ai-department/database/entities/member.entity';
import { WorkAttempt } from '@/modules/ai-department/database/entities/work-attempt.entity';
import { WorkClaim } from '@/modules/ai-department/database/entities/work-claim.entity';
import { WorkItem } from '@/modules/ai-department/database/entities/work-item.entity';
import { WorkflowCapability } from '@/modules/ai-department/database/entities/workflow-capability.entity';
import { WorkflowCapabilityRevision } from '@/modules/ai-department/database/entities/workflow-capability-revision.entity';
import { WorkflowInvocation } from '@/modules/ai-department/database/entities/workflow-invocation.entity';
import { WorkflowInvocationRepository } from '@/modules/ai-department/database/repositories/workflow-invocation.repository';

vi.mock('@/execution-lifecycle/execution-lifecycle-hooks', () => ({
	getLifecycleHooksForScalingWorker: () => ({
		addHandler: () => {},
		runHook: async () => {},
	}),
}));

const phase = process.env.N8N_TEST_DEPARTMENT_STOP_PHASE;
const redisHost = process.env.N8N_TEST_REDIS_HOST;
const redisPort = Number(process.env.N8N_TEST_REDIS_PORT);
const channelPrefix =
	process.env.N8N_TEST_DEPARTMENT_STOP_PREFIX ??
	`department-cross-process-${process.pid}-${Date.now()}`;
const stateFile = process.env.N8N_TEST_DEPARTMENT_STOP_STATE_FILE;
let executionId =
	process.env.N8N_TEST_DEPARTMENT_STOP_EXECUTION_ID ??
	`department-cross-process-execution-${process.pid}`;
let workflowId =
	process.env.N8N_TEST_DEPARTMENT_STOP_WORKFLOW_ID ?? 'department-cross-process-workflow';
let projectId = '';
let invocationId = `department-cross-process-invocation-${process.pid}`;
let inputHash = 'f'.repeat(64);
let workflowVersion = 'process-stop-version';
type ChildState = 'waiting' | 'retrying';
type RestartStopState = {
	executionId: string;
	workflowId: string;
	projectId: string;
	invocationId: string;
	inputHash: string;
	workflowVersion: string;
	childState: ChildState;
};
const testFile = path.join(
	__dirname,
	'agent-department-workflow-cross-process-stop.integration.test.ts',
);
const cliRoot = path.resolve(__dirname, '../../../../');

async function createRevokedInvocation(childState: ChildState): Promise<RestartStopState> {
	if (!stateFile) throw new Error('Department stop state file is required.');
	const user = await createOwner();
	const project = await createTeamProject('Cross-process workflow stop', user);
	const workflow = await createWorkflow({}, project);
	projectId = project.id;
	workflowId = workflow.id;
	invocationId = randomUUID();
	inputHash = 'f'.repeat(64);
	workflowVersion = 'process-stop-version';
	const executionData = createRunExecutionData({
		resultData: {
			runData: {},
			metadata: {
				aiDepartmentProjectId: projectId,
				aiDepartmentWorkflowInvocationId: invocationId,
				aiDepartmentWorkflowInputHash: inputHash,
				aiDepartmentWorkflowVersion: workflowVersion,
			},
		},
	});
	executionId = await Container.get(ExecutionPersistence).create({
		data: executionData,
		mode: 'integrated',
		finished: false,
		workflowData: workflow,
		status: 'running',
		workflowId,
	});

	const now = new Date();
	const departmentId = randomUUID();
	const memberId = randomUUID();
	const workId = randomUUID();
	const attemptId = randomUUID();
	const capabilityId = randomUUID();
	const manager = Container.get(DataSource).manager;
	await manager.save(
		Department,
		Object.assign(new Department(), {
			id: departmentId,
			projectId,
			name: 'Cross-process stop',
			normalizedName: departmentId,
			description: null,
			archived: false,
			version: 1,
			projectionSequence: 0,
		}),
	);
	await manager.save(
		Member,
		Object.assign(new Member(), {
			id: memberId,
			projectId,
			departmentId,
			name: 'Worker',
			role: 'worker',
			managerMemberId: null,
			archived: false,
			version: 1,
		}),
	);
	await manager.save(
		WorkItem,
		Object.assign(new WorkItem(), {
			id: workId,
			projectId,
			departmentId,
			goalId: null,
			assigneeMemberId: memberId,
			instruction: 'Run the selected workflow.',
			priority: 'normal',
			dueAt: null,
			reviewPolicy: 'required',
			state: 'running',
			currentAttemptId: null,
			version: 1,
		}),
	);
	await manager.save(
		WorkAttempt,
		Object.assign(new WorkAttempt(), {
			id: attemptId,
			projectId,
			departmentId,
			workId,
			ordinal: 1,
			initiatingUserId: user.id,
			memberId,
			bindingVersion: 1,
			provider: 'n8n-agent',
			executorId: randomUUID(),
			reviewPolicy: 'required',
			dispatchKey: randomUUID(),
			workflowIdsJson: JSON.stringify([workflowId]),
			workflowCapabilitiesJson: '[]',
			ownerExecutionRef: executionId,
			phase: 'active',
			lastOwnerSequence: '0',
			cancelRequestId: null,
			outcome: null,
			resultReference: null,
			safeSummary: null,
			startedAt: now,
			finishedAt: null,
			cancelRequestedAt: null,
		}),
	);
	await manager.save(
		WorkClaim,
		Object.assign(new WorkClaim(), {
			id: randomUUID(),
			projectId,
			departmentId,
			workId,
			attemptId,
			memberId,
			executionId: randomUUID(),
			claimGeneration: 1,
			leaseUntil: new Date(now.getTime() + 60_000),
			claimedAt: now,
			releasedAt: null,
		}),
	);
	await manager.update(WorkItem, { id: workId }, { currentAttemptId: attemptId });
	await manager.save(
		WorkflowCapability,
		Object.assign(new WorkflowCapability(), {
			id: capabilityId,
			projectId,
			departmentId,
			memberId,
			workflowId,
			purpose: 'Run a controlled workflow.',
			publishedVersionRef: workflowVersion,
			triggerCompatibilityRef: 'execute-workflow-trigger@1',
			inputSchemaFingerprint: 'schema-fingerprint',
			enabled: true,
			version: 1,
		}),
	);
	await manager.save(
		WorkflowCapabilityRevision,
		Object.assign(new WorkflowCapabilityRevision(), {
			id: randomUUID(),
			projectId,
			capabilityId,
			version: 1,
			purpose: 'Run a controlled workflow.',
			publishedVersionRef: workflowVersion,
			triggerCompatibilityRef: 'execute-workflow-trigger@1',
			inputSchemaFingerprint: 'schema-fingerprint',
			enabled: true,
			changedById: user.id,
			createdAt: now,
		}),
	);
	await manager.save(
		WorkflowInvocation,
		Object.assign(new WorkflowInvocation(), {
			id: invocationId,
			projectId,
			workId,
			attemptId,
			memberId,
			capabilityId,
			capabilityVersion: 1,
			claimGeneration: 1,
			requestId: randomUUID(),
			ownerInvocationKey: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
			inputHash,
			inputsRef: `inputs:${invocationId}`,
			expectedWorkflowVersion: workflowVersion,
			actualWorkflowVersion: workflowVersion,
			ownerExecutionRef: executionId,
			dispatchState: 'acknowledged',
			childState,
			safeResultReference: null,
			safeErrorReference: null,
			version: 1,
			cancelRequestedAt: null,
		}),
	);

	return {
		executionId,
		workflowId,
		projectId,
		invocationId,
		inputHash,
		workflowVersion,
		childState,
	};
}

describe.skipIf(!redisHost || !redisPort || phase !== 'worker')(
	'AI Department cross-process stop worker',
	() => {
		it('receives and handles a stop command from another process', async () => {
			const redisOptions = { host: redisHost, port: redisPort };
			const resultKey = process.env.N8N_TEST_DEPARTMENT_STOP_RESULT_KEY;
			const failureKey = process.env.N8N_TEST_DEPARTMENT_STOP_FAILURE_KEY;
			const readyKey = process.env.N8N_TEST_DEPARTMENT_STOP_READY_KEY;
			const startedKey = process.env.N8N_TEST_DEPARTMENT_STOP_STARTED_KEY;
			const nodeStartedKey = process.env.N8N_TEST_DEPARTMENT_STOP_NODE_STARTED_KEY;
			const nodeStoppedKey = process.env.N8N_TEST_DEPARTMENT_STOP_NODE_STOPPED_KEY;
			const queuePrefix = process.env.N8N_TEST_DEPARTMENT_STOP_BULL_PREFIX;
			if (
				!resultKey ||
				!failureKey ||
				!readyKey ||
				!startedKey ||
				!nodeStartedKey ||
				!nodeStoppedKey ||
				!queuePrefix
			) {
				throw new Error('Stop process test settings are required.');
			}

			const redis = new Redis(redisOptions);
			const stopProbeNode: INodeTypeData = {
				'n8n-nodes-base.departmentStopProbe': {
					type: {
						description: {
							displayName: 'Department stop probe',
							name: 'departmentStopProbe',
							group: ['transform'],
							version: 1,
							description: 'Waits for an execution stop signal.',
							defaults: { name: 'Department stop probe' },
							inputs: [NodeConnectionTypes.Main],
							outputs: [NodeConnectionTypes.Main],
							properties: [],
						},
						async execute(this: IExecuteFunctions) {
							const signal = this.getExecutionCancelSignal();
							if (!signal) throw new Error('Execution cancel signal is unavailable.');
							await redis.set(nodeStartedKey, 'started');
							await new Promise<void>((resolve) => {
								signal.addEventListener(
									'abort',
									() => {
										void redis.set(nodeStoppedKey, 'stopped').then(() => resolve());
									},
									{ once: true },
								);
							});
							return [this.getInputData()];
						},
					},
					sourcePath: '',
				},
			};
			await testModules.loadModules(['agents', 'ai-department']);
			await testDb.init();
			await initNodeTypes(stopProbeNode);
			const logger = mock<Logger>();
			logger.scoped.mockReturnValue(logger);
			const instanceSettings = { instanceType: 'worker', hostId: 'stop-worker' } as never;
			const executionsConfig = { mode: 'queue' } as ExecutionsConfig;
			const globalConfig = { redis: { prefix: channelPrefix } } as GlobalConfig;
			const queueOptions = {
				prefix: queuePrefix,
				redis: redisOptions,
				settings: { maxStalledCount: 0 },
			};
			const producer = new Bull<JobData>('department-cross-process-stop', queueOptions) as JobQueue;
			const worker = new Bull<JobData>('department-cross-process-stop', queueOptions) as JobQueue;
			const eventBus = new PubSubEventBus();
			const subscriber = new Subscriber(
				logger,
				instanceSettings,
				eventBus,
				{ createClient: () => new Redis(redisOptions) } as never,
				executionsConfig,
				globalConfig,
			);
			const activeExecutions = mock<ActiveExecutions>();
			const executionData = createRunExecutionData({ resultData: { runData: {} } });
			executionData.executionData = undefined;
			Object.assign(executionData.resultData, { runData: undefined });
			const persistence = mock<ExecutionPersistence>();
			persistence.findSingleExecution.mockResolvedValue({
				id: executionId,
				status: 'running',
				mode: 'manual',
				workflowId,
				workflowData: {
					id: workflowId,
					name: 'Department child',
					nodes: [
						{
							id: 'department-stop-probe',
							name: 'Department stop probe',
							type: 'n8n-nodes-base.departmentStopProbe',
							typeVersion: 1,
							position: [0, 0],
							parameters: {},
						},
					],
					connections: {},
					staticData: {},
				},
				data: executionData,
				storedAt: new Date(),
			} as never);
			const executionRepository = mock<ExecutionRepository>();
			executionRepository.setRunning.mockResolvedValue(new Date());
			const manualExecutionService = new ManualExecutionService(
				logger,
				Container.get(StorageConfig),
			);
			const jobProcessor = new JobProcessor(
				logger,
				executionRepository,
				persistence,
				mock<WorkflowRepository>(),
				Container.get(NodeTypes),
				instanceSettings as InstanceSettings,
				manualExecutionService,
				executionsConfig,
				mock<EventService>(),
				mock<WebhookResponseRelay>(),
			);
			const stopService = new ExecutionStopService(
				logger,
				instanceSettings,
				mock(),
				activeExecutions,
				jobProcessor,
			);
			eventBus.on('stop-execution', ({ executionId: stoppedExecutionId }) => {
				stopService.handleStopExecution({ executionId: stoppedExecutionId });
			});
			let workerError: unknown;
			worker.on('failed', (_job, error) => {
				workerError = error;
				void redis.set(failureKey, error.message);
			});

			try {
				await Promise.all([producer.isReady(), worker.isReady()]);
				await subscriber.subscribe(`${channelPrefix}:${COMMAND_PUBSUB_CHANNEL}`);
				void worker.process(JOB_TYPE_NAME, 1, async (job) => await jobProcessor.processJob(job));
				await redis.set(readyKey, 'ready');
				await producer.add(
					JOB_TYPE_NAME,
					{
						executionId,
						workflowId,
						loadStaticData: false,
					} as JobData,
					{ jobId: executionId },
				);
				await vi.waitFor(() => expect(jobProcessor.getRunningJobsSummary()).toHaveLength(1));
				await vi.waitFor(async () => expect(await redis.get(nodeStartedKey)).toBe('started'));
				await redis.set(startedKey, 'started');
				await vi.waitFor(() => expect(workerError).toBeDefined(), { timeout: 15_000 });
				expect(workerError).toMatchObject({ name: 'ManualExecutionCancelledError' });
				expect(await redis.get(nodeStoppedKey)).toBe('stopped');
				expect(jobProcessor.getRunningJobsSummary()).toEqual([]);
				expect(jobProcessor.getTrackedJobIds()).toEqual([]);
				await redis.set(
					resultKey,
					JSON.stringify({
						errorName: (workerError as Error).name,
						runningJobs: jobProcessor.getRunningJobsSummary(),
						trackedJobIds: jobProcessor.getTrackedJobIds(),
					}),
				);
			} finally {
				subscriber.shutdown();
				await Promise.all([worker.close(), producer.close()]);
				redis.disconnect();
				await testDb.terminate();
			}
		}, 20_000);
	},
);

describe.skipIf(!redisHost || !redisPort || !['prepare', 'recover'].includes(phase ?? ''))(
	'AI Department cross-process stop command',
	() => {
		beforeAll(async () => {
			if (!stateFile) throw new Error('Department stop state file is required.');
			const globalConfig = Container.get(GlobalConfig);
			Object.assign(globalConfig.queue.bull.redis, { host: redisHost, port: redisPort });
			globalConfig.redis.prefix = channelPrefix;
			Object.assign(globalConfig.executions, { mode: 'queue' });
			await testModules.loadModules(['agents', 'ai-department']);
			await testDb.init();
			if (phase === 'prepare') {
				const childState = process.env.N8N_TEST_DEPARTMENT_STOP_CHILD_STATE;
				if (childState !== 'waiting' && childState !== 'retrying') {
					throw new Error('A waiting or retrying child state is required.');
				}
				await createRevokedInvocation(childState);
				return;
			}

			const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RestartStopState;
			({ executionId, workflowId, projectId, invocationId, inputHash, workflowVersion } = state);
		});

		afterAll(async () => await testDb.terminate());

		it.skipIf(phase !== 'prepare')(
			'persists the revoked child stop intent before process exit',
			async () => {
				if (!stateFile) throw new Error('Department stop state file is required.');
				const invocationService = new WorkflowInvocationService(
					Container.get(WorkflowInvocationRepository),
					Container.get(TransactionRunner),
					mock<DepartmentExecutorProxy>(),
					mock<DepartmentWorkflowInvocationOwnerProxy>(),
				);
				await invocationService.reconcileRevokedAuthority();
				const persisted = await Container.get(DataSource).manager.findOneBy(WorkflowInvocation, {
					id: invocationId,
				});
				expect(persisted?.cancelRequestedAt).toBeInstanceOf(Date);
				writeFileSync(
					stateFile,
					JSON.stringify({
						executionId,
						workflowId,
						projectId,
						invocationId,
						inputHash,
						workflowVersion,
						childState: process.env.N8N_TEST_DEPARTMENT_STOP_CHILD_STATE,
					}),
				);
			},
		);

		it.skipIf(phase !== 'recover')(
			'uses the durable revoked stop intent to stop a child in a worker process',
			async () => {
				const redisOptions = { host: redisHost, port: redisPort };
				const readyKey = `${channelPrefix}:ready`;
				const startedKey = `${channelPrefix}:started`;
				const resultKey = `${channelPrefix}:result`;
				const failureKey = `${channelPrefix}:failure`;
				const nodeStartedKey = `${channelPrefix}:node-started`;
				const nodeStoppedKey = `${channelPrefix}:node-stopped`;
				const queuePrefix = `${channelPrefix}-bull`;
				const child = spawn(
					process.execPath,
					[
						path.join(cliRoot, 'node_modules/vitest/vitest.mjs'),
						'run',
						'--config',
						path.join(cliRoot, 'vitest.config.integration.ts'),
						testFile,
						'--maxWorkers=1',
					],
					{
						cwd: cliRoot,
						env: {
							...process.env,
							N8N_TEST_DEPARTMENT_STOP_PHASE: 'worker',
							N8N_TEST_DEPARTMENT_STOP_PREFIX: channelPrefix,
							N8N_TEST_DEPARTMENT_STOP_EXECUTION_ID: executionId,
							N8N_TEST_DEPARTMENT_STOP_WORKFLOW_ID: workflowId,
							N8N_TEST_DEPARTMENT_STOP_BULL_PREFIX: queuePrefix,
							N8N_TEST_DEPARTMENT_STOP_READY_KEY: readyKey,
							N8N_TEST_DEPARTMENT_STOP_STARTED_KEY: startedKey,
							N8N_TEST_DEPARTMENT_STOP_NODE_STARTED_KEY: nodeStartedKey,
							N8N_TEST_DEPARTMENT_STOP_NODE_STOPPED_KEY: nodeStoppedKey,
							N8N_TEST_DEPARTMENT_STOP_RESULT_KEY: resultKey,
							N8N_TEST_DEPARTMENT_STOP_FAILURE_KEY: failureKey,
						},
						stdio: ['ignore', 'pipe', 'pipe'],
					},
				);
				const childOutput: string[] = [];
				child.stdout.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));
				child.stderr.on('data', (chunk: Buffer) => childOutput.push(chunk.toString()));
				const childExit = new Promise<number>((resolve) => {
					child.once('error', () => resolve(-1));
					child.once('exit', (code) => resolve(code ?? -1));
				});

				const redis = new Redis(redisOptions);
				const logger = mock<Logger>();
				logger.scoped.mockReturnValue(logger);
				const invocationRepository = mock<WorkflowInvocationRepository>();
				invocationRepository.findNeedingStopReconciliation.mockResolvedValue([
					{
						projectId,
						id: invocationId,
						ownerExecutionRef: executionId,
						inputHash,
						expectedWorkflowVersion: workflowVersion,
					} as WorkflowInvocation,
				]);
				const owner = new AgentDepartmentWorkflowInvocationOwnerService(
					Container.get(ExecutionPersistence),
					Container.get(ExecutionService),
					mock<AgentDepartmentWorkflowEventService>(),
				);
				const ownerProxy = mock<DepartmentWorkflowInvocationOwnerProxy>();
				ownerProxy.requestStop.mockImplementation(async (input) => await owner.requestStop(input));
				const invocationService = new WorkflowInvocationService(
					invocationRepository,
					mock<TransactionRunner>(),
					mock<DepartmentExecutorProxy>(),
					ownerProxy,
				);

				try {
					await vi.waitFor(async () => expect(await redis.get(readyKey)).toBe('ready'), {
						timeout: 20_000,
					});
					await vi.waitFor(
						async () => {
							const workerFailure = await redis.get(failureKey);
							if (workerFailure) {
								throw new Error(`Worker failed before stop: ${workerFailure}`);
							}
							expect(await redis.get(startedKey)).toBe('started');
						},
						{ timeout: 15_000 },
					);
					expect(await redis.get(nodeStartedKey)).toBe('started');
					await invocationService.reconcileRequestedStops();
					const stoppedExecution = await Container.get(ExecutionPersistence).findSingleExecution(
						executionId,
						{ includeData: true },
					);
					expect(stoppedExecution?.status).toBe('canceled');
					await vi.waitFor(
						async () =>
							expect(JSON.parse((await redis.get(resultKey)) ?? 'null')).toEqual({
								errorName: 'ManualExecutionCancelledError',
								runningJobs: [],
								trackedJobIds: [],
							}),
						{ timeout: 15_000 },
					);
					expect(await redis.get(nodeStoppedKey)).toBe('stopped');
					expect(await childExit, childOutput.join('')).toBe(0);
				} finally {
					if (child.exitCode === null) child.kill('SIGTERM');
					redis.disconnect();
				}
			},
			40_000,
		);
	},
);
