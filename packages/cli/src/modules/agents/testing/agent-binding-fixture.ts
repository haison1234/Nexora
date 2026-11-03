import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { AgentHistoryRepository } from '../repositories/agent-history.repository';
import { AgentRepository } from '../repositories/agent.repository';

/** Creates a project Agent for cross-module binding integration tests. */
export async function createAgentBindingFixture(projectId: string, published: boolean) {
	const agents = Container.get(AgentRepository);
	const histories = Container.get(AgentHistoryRepository);
	const versionId = randomUUID();
	const agent = await agents.save(
		agents.create({
			id: randomUUID(),
			name: `Binding fixture ${randomUUID()}`,
			projectId,
			scope: 'project',
			integrations: [],
			tools: {},
			versionId,
		}),
	);
	if (!published) return agent;
	await histories.save(
		histories.create({ versionId, agentId: agent.id, author: 'Integration test' }),
	);
	await agents.update({ id: agent.id }, { activeVersionId: versionId });
	return { ...agent, activeVersionId: versionId };
}

/** Use the production adapter with a test-owned database. */
export async function registerDepartmentExecutionFixture() {
	const { DepartmentExecutorProxy } = await import('../agent-department-execution.contracts.js');
	const { AgentDepartmentExecutionAdapter } = await import(
		'../agent-department-execution.adapter.js'
	);
	Container.get(DepartmentExecutorProxy).register(Container.get(AgentDepartmentExecutionAdapter));
}

/** Admit the queued turn without calling a model provider. */
export async function admitDepartmentRunFixture(attemptId: string) {
	const { AgentMessageQueueService } = await import('../agent-message-queue.service.js');
	const { AgentExecutionService } = await import('../agent-execution.service.js');
	const { ExecutionRecorder } = await import('../execution-recorder.js');
	const queue = Container.get(AgentMessageQueueService);
	const claim = await queue.claimNext(attemptId, async () => true);
	if (!claim) throw new Error('The department turn was not admitted.');
	return {
		executionId: claim.admission.executionId,
		finish: async () => {
			await Container.get(AgentExecutionService).finalizeExecution(claim.admission.executionId, {
				...claim.recording,
				record: new ExecutionRecorder().getMessageRecord(),
			});
			await queue.settle(attemptId, claim.admission.executionId);
		},
	};
}
