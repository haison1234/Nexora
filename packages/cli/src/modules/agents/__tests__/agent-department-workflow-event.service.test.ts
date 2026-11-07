import type { Logger } from '@n8n/backend-common';
import { mock } from 'vitest-mock-extended';

import { DepartmentWorkflowInvocationProxy } from '../agent-department-execution.contracts';
import { AgentDepartmentWorkflowEventService } from '../agent-department-workflow-event.service';
import { AgentDepartmentWorkflowInvocationInputService } from '../agent-department-workflow-invocation-input.service';
import type { AgentDepartmentWorkflowEvent } from '../entities/agent-department-workflow-event.entity';
import type { AgentDepartmentWorkflowEventRepository } from '../repositories/agent-department-workflow-event.repository';

describe('AgentDepartmentWorkflowEventService', () => {
	function setup() {
		const repository = mock<AgentDepartmentWorkflowEventRepository>();
		const invocations = mock<DepartmentWorkflowInvocationProxy>();
		const inputs = mock<AgentDepartmentWorkflowInvocationInputService>();
		const logger = mock<Logger>();
		const event = mock<AgentDepartmentWorkflowEvent>({
			id: 123,
			eventId: 'event-a',
			projectId: 'project-a',
			invocationId: 'invocation-a',
			ownerExecutionRef: 'execution-a',
			retryOfExecutionRef: null,
			actualWorkflowVersion: 'published-v2',
			childState: 'waiting',
			occurredAt: new Date('2026-11-04T00:00:00.000Z'),
		});
		repository.append.mockResolvedValue(event);
		const service = new AgentDepartmentWorkflowEventService(
			repository,
			invocations,
			inputs,
			logger,
		);
		return { repository, invocations, inputs, logger, event, service };
	}

	it('delivers the durable event ID and owner-generated sequence', async () => {
		const { repository, invocations, inputs, event, service } = setup();

		await service.record({
			projectId: event.projectId,
			invocationId: event.invocationId,
			ownerExecutionRef: event.ownerExecutionRef,
			actualWorkflowVersion: event.actualWorkflowVersion,
			childState: event.childState,
			occurredAt: event.occurredAt,
		});

		expect(repository.append).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: event.projectId,
				invocationId: event.invocationId,
				eventId: expect.any(String),
			}),
		);
		expect(invocations.outcome).toHaveBeenCalledWith({
			projectId: event.projectId,
			invocationId: event.invocationId,
			eventId: event.eventId,
			ownerSequence: '123',
			occurredAt: event.occurredAt.toISOString(),
			childState: event.childState,
			ownerExecutionRef: event.ownerExecutionRef,
			actualWorkflowVersion: event.actualWorkflowVersion,
		});
		expect(repository.markDelivered).toHaveBeenCalledWith(event.id);
		expect(inputs.delete).toHaveBeenCalledWith(event.projectId, event.invocationId);
	});

	it('leaves a rejected delivery pending for reconciliation', async () => {
		const { repository, invocations, logger, event, service } = setup();
		invocations.outcome.mockRejectedValue(new Error('invocation is not accepted yet'));

		await service.record({
			projectId: event.projectId,
			invocationId: event.invocationId,
			ownerExecutionRef: event.ownerExecutionRef,
			actualWorkflowVersion: event.actualWorkflowVersion,
			childState: event.childState,
			occurredAt: event.occurredAt,
		});

		expect(repository.markDelivered).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'Department workflow outcome delivery remains pending',
			expect.objectContaining({ eventId: event.eventId }),
		);
	});

	it('delivers the retry parent reference to AI Department', async () => {
		const { repository, invocations, event, service } = setup();
		event.retryOfExecutionRef = 'execution-original';
		repository.findPending.mockResolvedValue([event]);

		await service.reconcile();

		expect(repository.findPending).toHaveBeenCalledWith(100);
		expect(invocations.outcome).toHaveBeenLastCalledWith(
			expect.objectContaining({ retryOfExecutionRef: 'execution-original' }),
		);
	});

	it('does not append a duplicate snapshot while the prior state event is pending', async () => {
		const { repository, event, service } = setup();
		repository.findLatestForInvocation.mockResolvedValue(event);

		await service.recordIfChanged({
			projectId: event.projectId,
			invocationId: event.invocationId,
			ownerExecutionRef: event.ownerExecutionRef,
			actualWorkflowVersion: event.actualWorkflowVersion,
			childState: event.childState,
			occurredAt: event.occurredAt,
		});

		expect(repository.append).not.toHaveBeenCalled();
	});

	it('appends a snapshot when the owner state changes', async () => {
		const { repository, event, service } = setup();
		repository.findLatestForInvocation.mockResolvedValue(
			mock<AgentDepartmentWorkflowEvent>({
				ownerExecutionRef: event.ownerExecutionRef,
				childState: 'running',
			}),
		);

		await service.recordIfChanged({
			projectId: event.projectId,
			invocationId: event.invocationId,
			ownerExecutionRef: event.ownerExecutionRef,
			actualWorkflowVersion: event.actualWorkflowVersion,
			childState: event.childState,
			occurredAt: event.occurredAt,
		});

		expect(repository.append).toHaveBeenCalledWith(
			expect.objectContaining({
				childState: 'waiting',
				ownerExecutionRef: event.ownerExecutionRef,
			}),
		);
	});

	it('retries pending events in owner sequence order', async () => {
		const { repository, invocations, inputs, event, service } = setup();
		repository.findPending.mockResolvedValue([event]);

		await service.reconcile(10);

		expect(repository.findPending).toHaveBeenCalledWith(10);
		expect(invocations.outcome).toHaveBeenCalledWith(
			expect.objectContaining({ ownerSequence: '123', eventId: event.eventId }),
		);
		expect(repository.markDelivered).toHaveBeenCalledWith(event.id);
		expect(inputs.delete).toHaveBeenCalledWith(event.projectId, event.invocationId);
	});
});
