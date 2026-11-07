import type { WorkflowEntity } from '@n8n/db';
import { mock } from 'vitest-mock-extended';

import { AgentWorkflowCapabilityDescriptorService } from '../agent-workflow-capability-descriptor.service';
import type { WorkflowToolWorkflowLoader } from '../tools/workflow-tool-workflow-loader.service';

describe('AgentWorkflowCapabilityDescriptorService', () => {
	it('rejects Engine v2 workflows because they do not create owner execution rows', async () => {
		const workflowLoader = mock<WorkflowToolWorkflowLoader>();
		workflowLoader.loadWorkflow.mockResolvedValue({
			settings: { engineType: 'v2' },
		} as WorkflowEntity);
		const service = new AgentWorkflowCapabilityDescriptorService(workflowLoader);

		await expect(
			service.describePublished('project-1', 'workflow-1', 'Workflow'),
		).rejects.toMatchObject({
			reason: 'incompatible',
			message:
				'Select a published workflow that uses the standard engine and a supported workflow trigger.',
		});
	});
});
