import Bull from 'bull';
import { Logger } from '@n8n/backend-common';
import type { EventService } from '@n8n/backend-services';
import type { ExecutionsConfig } from '@n8n/config';
import type { ExecutionRepository, WorkflowRepository } from '@n8n/db';
import type { InstanceSettings } from 'n8n-core';
import { Redis } from 'ioredis';
import { createRunExecutionData, type IRun } from 'n8n-workflow';
import { mock } from 'vitest-mock-extended';

import { ExecutionPersistence } from '@/executions/execution-persistence';
import { ExecutionService } from '@/executions/execution.service';
import { ManualExecutionService } from '@/manual-execution.service';
import { NodeTypes } from '@/node-types';
import { JobProcessor } from '@/scaling/job-processor';
import { ExecutionStopService } from '@/scaling/execution-stop.service';
import { COMMAND_PUBSUB_CHANNEL } from '@/scaling/constants';
import { Publisher } from '@/scaling/pubsub/publisher.service';
import { Subscriber } from '@/scaling/pubsub/subscriber.service';
import { PubSubEventBus } from '@/scaling/pubsub/pubsub.eventbus';
import type { ActiveExecutions } from '@/active-executions';
import { WorkflowRunner } from '@/workflow-runner';

import type { JobData, JobQueue } from '@/scaling/scaling.types';
import { WebhookResponseRelay } from '@/scaling/webhook-response-relay';
import { JOB_TYPE_NAME } from '@/scaling/constants';
import * as WorkflowExecuteAdditionalData from '@/workflow-execute-additional-data';
import { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';
import { AgentDepartmentWorkflowInvocationOwnerService } from '../agent-department-workflow-invocation-owner.service';

vi.mock('@/execution-lifecycle/execution-lifecycle-hooks', () => ({
	getLifecycleHooksForScalingWorker: () => ({
		addHandler: () => {},
		runHook: async () => {},
	}),
}));

const redisHost = process.env.N8N_TEST_REDIS_HOST;
const redisPort = Number(process.env.N8N_TEST_REDIS_PORT);
const prefix = `department-stop-${process.pid}-${Date.now()}`;
const queueName = 'department-stop-proof';
const executionId = 'department-stop-execution';
const projectId = 'department-stop-project';
const invocationId = 'department-stop-invocation';
const inputHash = 'a'.repeat(64);
const workflowVersion = 'published-version';

describe.skipIf(!redisHost || !redisPort)('AI Department queue stop proof (real Redis)', () => {
	let producer: JobQueue;
	let worker: JobQueue;
	let jobId: string;
	let releaseWorker: () => void;
	let executionData: ReturnType<typeof createRunExecutionData>;
	let workflowRunner: WorkflowRunner;
	let owner: AgentDepartmentWorkflowInvocationOwnerService;
	const persistence = mock<ExecutionPersistence>();
	const executions = mock<ExecutionService>();
	const events = mock<AgentDepartmentWorkflowEventService>();
	const logger = mock<Logger>();
	logger.scoped.mockReturnValue(logger);

	beforeEach(() => {
		producer = new Bull<JobData>(queueName, {
			prefix,
			redis: { host: redisHost, port: redisPort },
			settings: { maxStalledCount: 0 },
		}) as JobQueue;
		worker = new Bull<JobData>(queueName, {
			prefix,
			redis: { host: redisHost, port: redisPort },
			settings: { maxStalledCount: 0 },
		}) as JobQueue;
		releaseWorker = () => {};
		executionData = createRunExecutionData({
			resultData: {
				runData: {},
				metadata: {
					aiDepartmentProjectId: projectId,
					aiDepartmentWorkflowInvocationId: invocationId,
					aiDepartmentWorkflowInputHash: inputHash,
					aiDepartmentWorkflowVersion: workflowVersion,
					aiDepartmentWorkflowQueueName: queueName,
				},
			},
		});
		workflowRunner = Object.create(WorkflowRunner.prototype) as WorkflowRunner;
		Reflect.set(workflowRunner, 'executionsConfig', { mode: 'queue' });
		Reflect.set(workflowRunner, 'poolConfigService', {});
		Reflect.set(workflowRunner, 'scalingService', {
			getOrCreateQueue: async () => producer,
		});

		persistence.findSingleExecution.mockResolvedValue({
			id: executionId,
			status: 'canceled',
			mode: 'integrated',
			workflowId: 'department-child-workflow',
			workflowData: { id: 'department-child-workflow' },
			data: executionData,
		} as never);
		owner = new AgentDepartmentWorkflowInvocationOwnerService(
			persistence,
			executions,
			events,
			workflowRunner,
		);
	});

	afterEach(async () => {
		releaseWorker();
		await worker.close();
		if (jobId) {
			const job = await producer.getJob(jobId);
			if (job) await job.remove();
		}
		await producer.close();
		jobId = '';
		vi.clearAllMocks();
	});

	it('keeps cancellation unconfirmed while the stable Bull job is active', async () => {
		await Promise.all([producer.isReady(), worker.isReady()]);
		const job = await producer.add(
			JOB_TYPE_NAME,
			{
				executionId,
				workflowId: 'department-child-workflow',
				loadStaticData: false,
			} as JobData,
			{ jobId: executionId },
		);
		jobId = String(job.id);

		await expect(
			owner.snapshot({
				projectId,
				invocationId,
				ownerExecutionRef: executionId,
				inputHash,
				expectedWorkflowVersion: workflowVersion,
			}),
		).resolves.toEqual({ kind: 'unknown' });

		let markWorkerStarted = () => {};
		const workerStarted = new Promise<void>((resolve) => (markWorkerStarted = resolve));
		const blockedWorker = new Promise<void>((resolve) => (releaseWorker = resolve));
		const jobProcessor = new JobProcessor(
			logger,
			mock<ExecutionRepository>(),
			persistence,
			mock<WorkflowRepository>(),
			mock<NodeTypes>(),
			mock<InstanceSettings>(),
			mock<ManualExecutionService>(),
			mock<ExecutionsConfig>(),
			mock<EventService>(),
			mock<WebhookResponseRelay>(),
		);
		let workerResult: Awaited<ReturnType<JobProcessor['processJob']>> | undefined;
		void worker.process(JOB_TYPE_NAME, 1, async (job) => {
			markWorkerStarted();
			await blockedWorker;
			workerResult = await jobProcessor.processJob(job);
		});
		await workerStarted;
		await vi.waitFor(async () => expect(await job.getState()).toBe('active'));

		await owner.requestStop({
			projectId,
			invocationId,
			ownerExecutionRef: executionId,
			inputHash,
			expectedWorkflowVersion: workflowVersion,
		});
		await expect(
			owner.snapshot({
				projectId,
				invocationId,
				ownerExecutionRef: executionId,
				inputHash,
				expectedWorkflowVersion: workflowVersion,
			}),
		).resolves.toEqual({ kind: 'unknown' });
		expect(events.record).not.toHaveBeenCalled();

		releaseWorker();
		releaseWorker = () => {};
		await vi.waitFor(async () => expect(await job.getState()).toBe('completed'));
		expect(workerResult).toEqual({ success: false });
		await expect(
			owner.snapshot({
				projectId,
				invocationId,
				ownerExecutionRef: executionId,
				inputHash,
				expectedWorkflowVersion: workflowVersion,
			}),
		).resolves.toMatchObject({ kind: 'verified', childState: 'cancelled' });
	});

	it('delivers a main-process stop broadcast to the worker JobProcessor over Redis', async () => {
		const restoreGetBase = vi
			.spyOn(WorkflowExecuteAdditionalData, 'getBase')
			.mockResolvedValue({} as never);
		const redisConfig = { host: redisHost, port: redisPort };
		const mainClient = new Redis(redisConfig);
		const subscriberClient = new Redis(redisConfig);
		const pubsubPrefix = `${prefix}-pubsub`;
		const mainSettings = { instanceType: 'main', hostId: 'department-main' } as never;
		const workerSettings = { instanceType: 'worker', hostId: 'department-worker' } as never;
		const executionsConfig = { mode: 'queue' } as never;
		const globalConfig = { redis: { prefix: pubsubPrefix } } as never;
		const publisher = new Publisher(
			logger,
			{ createClient: () => mainClient } as never,
			mainSettings,
			executionsConfig,
			globalConfig,
		);
		const eventBus = new PubSubEventBus();
		const subscriber = new Subscriber(
			logger,
			workerSettings,
			eventBus,
			{ createClient: () => subscriberClient } as never,
			executionsConfig,
			globalConfig,
		);
		const runningExecutionPersistence = mock<ExecutionPersistence>();
		const runningExecutionData = createRunExecutionData({ resultData: { runData: {} } });
		runningExecutionData.executionData = undefined;
		runningExecutionPersistence.findSingleExecution.mockResolvedValue({
			id: executionId,
			status: 'running',
			mode: 'manual',
			workflowId: 'department-child-workflow',
			workflowData: {
				id: 'department-child-workflow',
				name: 'Department child',
				nodes: [],
				connections: {},
				staticData: {},
			},
			data: runningExecutionData,
			storedAt: new Date(),
		} as never);
		const executionRepository = mock<ExecutionRepository>();
		executionRepository.setRunning.mockResolvedValue(new Date());
		const manualExecutionService = mock<ManualExecutionService>();
		const cancel = vi.fn();
		let resolveRun!: (run: IRun) => void;
		const runPromise = new Promise<IRun>((resolve) => {
			resolveRun = resolve;
		});
		cancel.mockImplementation(() => resolveRun({ status: 'canceled' } as IRun));
		manualExecutionService.runManually.mockReturnValue(
			Object.assign(runPromise, { cancel }) as never,
		);
		const jobProcessor = new JobProcessor(
			logger,
			executionRepository,
			runningExecutionPersistence,
			mock<WorkflowRepository>(),
			mock<NodeTypes>(),
			workerSettings,
			manualExecutionService,
			mock<ExecutionsConfig>(),
			mock<EventService>(),
			mock<WebhookResponseRelay>(),
		);
		const workerStop = new ExecutionStopService(
			logger,
			workerSettings,
			mock(),
			mock<ActiveExecutions>(),
			jobProcessor,
		);
		eventBus.on('stop-execution', async ({ executionId: stoppedExecutionId }) => {
			workerStop.handleStopExecution({ executionId: stoppedExecutionId });
		});
		let workerError: unknown;
		worker.on('failed', (_job, error) => {
			workerError = error;
		});

		try {
			await Promise.all([producer.isReady(), worker.isReady()]);
			await subscriber.subscribe(`${pubsubPrefix}:${COMMAND_PUBSUB_CHANNEL}`);
			const job = await producer.add(
				JOB_TYPE_NAME,
				{
					executionId,
					workflowId: 'department-child-workflow',
					loadStaticData: false,
				} as JobData,
				{ jobId: executionId },
			);
			jobId = String(job.id);
			let markWorkerStarted = () => {};
			const workerStarted = new Promise<void>((resolve) => (markWorkerStarted = resolve));
			void worker.process(JOB_TYPE_NAME, 1, async (activeJob) => {
				markWorkerStarted();
				return await jobProcessor.processJob(activeJob);
			});
			await workerStarted;
			await vi.waitFor(() => expect(jobProcessor.getRunningJobsSummary()).toHaveLength(1));
			await publisher.publishCommand({
				command: 'stop-execution',
				payload: { executionId },
			});
			await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
			await vi.waitFor(() => expect(workerError).toBeDefined());
			expect(workerError).toMatchObject({ name: 'ManualExecutionCancelledError' });
			expect(jobProcessor.getRunningJobsSummary()).toEqual([]);
			expect(jobProcessor.getTrackedJobIds()).toEqual([]);
		} finally {
			restoreGetBase.mockRestore();
			subscriber.shutdown();
			publisher.shutdown();
		}
	});
});
