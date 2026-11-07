import type { TransactionRunner, User } from '@n8n/db';
import { ControllerRegistryMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';
import { ConflictError, NotFoundError, UserError } from '@n8n/errors';
import { mock } from 'vitest-mock-extended';

import type { AgentWorkflowCapabilityDescriptorService } from '@/modules/agents/agent-workflow-capability-descriptor.service';
import { WorkflowToolUnavailableError } from '@/modules/agents/tools/workflow-tool-unavailable-error';
import type { WorkflowFinderService } from '@/workflows/workflow-finder.service';

import type { WorkflowCapabilityRepository } from '../../database/repositories/workflow-capability.repository';
import { WorkflowCapabilityService } from '../../workflow/workflow-capability.service';
import { WorkflowCapabilityController } from '../../workflow/workflow-capability.controller';

function setup() {
	const repository = mock<WorkflowCapabilityRepository>();
	const txRunner = mock<TransactionRunner>();
	txRunner.run.mockImplementation(async (_ctx, operation) => await operation({}));
	const workflowFinder = mock<WorkflowFinderService>();
	const capabilityDescriptor = mock<AgentWorkflowCapabilityDescriptorService>();
	const service = new WorkflowCapabilityService(
		repository,
		txRunner,
		workflowFinder,
		capabilityDescriptor,
	);
	return { repository, workflowFinder, capabilityDescriptor, service };
}

function prepareCreate(repository: WorkflowCapabilityRepository) {
	vi.mocked(repository.findReceipt).mockResolvedValue(null);
	vi.mocked(repository.findDepartment).mockResolvedValue(mock({ archived: false }));
	vi.mocked(repository.findMember).mockResolvedValue(mock());
	vi.mocked(repository.findForWorkflow).mockResolvedValue(null);
}

const user = mock<User>({ id: 'actor-a' });
const validRequest = {
	workflowId: 'workflow-a',
	purpose: 'Create a campaign draft',
	enabled: false,
	requestId: 'request-a',
};

describe('WorkflowCapabilityService configuration', () => {
	it('rejects enabling a capability while workflow invocation owner gates are open', async () => {
		const { repository, service } = setup();

		await expect(
			service.create('project-a', 'actor-a', user, 'department-a', 'member-a', {
				...validRequest,
				enabled: true,
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.save).not.toHaveBeenCalled();
	});

	it('does not expose previously enabled capabilities while invocation gates are open', async () => {
		const { repository, service } = setup();
		repository.findDepartment.mockResolvedValue(mock({ archived: false }));
		repository.findMember.mockResolvedValue(mock());
		repository.listEnabledWorkflowIds.mockResolvedValue(['workflow-a']);

		await expect(
			service.listEnabledWorkflowIds('project-a', 'department-a', 'member-a'),
		).resolves.toEqual([]);
		expect(repository.listEnabledWorkflowIds).not.toHaveBeenCalled();
	});

	it('requires an existing enabled capability to be disabled before editing it', async () => {
		const { repository, service } = setup();
		repository.find.mockResolvedValue(
			mock({
				id: 'capability-a',
				projectId: 'project-a',
				departmentId: 'department-a',
				memberId: 'member-a',
				enabled: true,
			}),
		);

		await expect(
			service.update('project-a', 'actor-a', user, 'department-a', 'member-a', 'capability-a', {
				purpose: 'Revise purpose',
				expectedVersion: 1,
				requestId: 'request-b',
				refreshPublication: false,
			}),
		).rejects.toBeInstanceOf(ConflictError);
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('requires publication review before refreshing a changed workflow capability', async () => {
		const { repository, workflowFinder, capabilityDescriptor, service } = setup();
		repository.find.mockResolvedValue(
			mock({
				id: 'capability-a',
				projectId: 'project-a',
				departmentId: 'department-a',
				memberId: 'member-a',
				workflowId: 'workflow-a',
				purpose: 'Create a campaign draft',
				enabled: false,
				version: 1,
				publishedVersionRef: 'published-v1',
				triggerCompatibilityRef: 'n8n-nodes-base.executeWorkflowTrigger@1.1',
				inputSchemaFingerprint: 'schema-v1',
			}),
		);
		repository.findReceipt.mockResolvedValue(null);
		workflowFinder.findWorkflowForUser.mockResolvedValue(mock({ name: 'Campaign' }));
		capabilityDescriptor.describePublished.mockResolvedValue({
			versionId: 'published-v2',
			triggerCompatibilityRef: 'n8n-nodes-base.executeWorkflowTrigger@1.1',
			inputSchemaFingerprint: 'schema-v2',
		});

		await expect(
			service.update('project-a', 'actor-a', user, 'department-a', 'member-a', 'capability-a', {
				expectedVersion: 1,
				requestId: 'request-c',
				refreshPublication: false,
			}),
		).rejects.toThrow('Published workflow changed. Review and refresh this capability.');
		expect(repository.updateAtVersion).not.toHaveBeenCalled();
	});

	it('rejects a workflow the actor cannot access', async () => {
		const { repository, workflowFinder, capabilityDescriptor, service } = setup();
		prepareCreate(repository);
		workflowFinder.findWorkflowForUser.mockResolvedValue(null);

		await expect(
			service.create('project-a', 'actor-a', user, 'department-a', 'member-a', validRequest),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(workflowFinder.findWorkflowForUser).toHaveBeenCalledWith('workflow-a', user, [
			'workflow:read',
		]);
		expect(capabilityDescriptor.describePublished).not.toHaveBeenCalled();
		expect(repository.save).not.toHaveBeenCalled();
	});

	it('rejects a workflow that is no longer available', async () => {
		const { repository, workflowFinder, capabilityDescriptor, service } = setup();
		prepareCreate(repository);
		workflowFinder.findWorkflowForUser.mockResolvedValue(mock({ name: 'Campaign' }));
		capabilityDescriptor.describePublished.mockRejectedValue(
			new WorkflowToolUnavailableError('not_found', 'Workflow not found.'),
		);

		await expect(
			service.create('project-a', 'actor-a', user, 'department-a', 'member-a', validRequest),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(repository.save).not.toHaveBeenCalled();
	});

	it('rejects a workflow that does not have a supported published trigger', async () => {
		const { repository, workflowFinder, capabilityDescriptor, service } = setup();
		prepareCreate(repository);
		workflowFinder.findWorkflowForUser.mockResolvedValue(mock({ name: 'Campaign' }));
		capabilityDescriptor.describePublished.mockRejectedValue(
			new WorkflowToolUnavailableError('incompatible', 'Unsupported trigger.'),
		);

		await expect(
			service.create('project-a', 'actor-a', user, 'department-a', 'member-a', validRequest),
		).rejects.toBeInstanceOf(UserError);
		expect(repository.save).not.toHaveBeenCalled();
	});

	it('rejects a purpose that becomes empty after trimming', async () => {
		const { repository, workflowFinder, capabilityDescriptor, service } = setup();

		await expect(
			service.create('project-a', 'actor-a', user, 'department-a', 'member-a', {
				...validRequest,
				purpose: '  ',
			}),
		).rejects.toBeInstanceOf(UserError);
		expect(repository.findReceipt).not.toHaveBeenCalled();
		expect(workflowFinder.findWorkflowForUser).not.toHaveBeenCalled();
		expect(capabilityDescriptor.describePublished).not.toHaveBeenCalled();
	});
});

describe('WorkflowCapabilityController route access scopes', () => {
	const { routes } = Container.get(ControllerRegistryMetadata).getControllerMetadata(
		WorkflowCapabilityController as never,
	);

	it('requires project-scoped agent access on every route', () => {
		const expectedScopes = {
			list: 'agent:read',
			create: 'agent:update',
			update: 'agent:update',
		} as const;

		expect(Array.from(routes.keys()).sort()).toEqual(Object.keys(expectedScopes).sort());
		for (const [handler, scope] of Object.entries(expectedScopes)) {
			expect(routes.get(handler)?.accessScope).toEqual({ scope, globalOnly: false });
			expect(routes.get(handler)?.skipAuth).not.toBe(true);
		}
	});
});
