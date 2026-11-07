import { zodToJsonSchema } from '@n8n/ai-utilities/json-schema';
import { Service } from '@n8n/di';
import { createHash } from 'node:crypto';

import { WorkflowToolWorkflowLoader } from './tools/workflow-tool-workflow-loader.service';
import {
	detectTriggerNode,
	inferInputSchema,
	validateCompatibility,
} from './tools/workflow-tool-factory';
import { WorkflowToolUnavailableError } from './tools/workflow-tool-unavailable-error';

export type PublishedWorkflowCapabilityDescriptor = {
	versionId: string;
	triggerCompatibilityRef: string;
	inputSchemaFingerprint: string;
};

@Service()
export class AgentWorkflowCapabilityDescriptorService {
	constructor(private readonly workflowLoader: WorkflowToolWorkflowLoader) {}

	async describePublished(projectId: string, workflowId: string, workflowName: string) {
		try {
			const workflow = await this.workflowLoader.loadWorkflow(
				projectId,
				{ workflowId, workflowName },
				{ usePublishedVersion: true },
			);
			if (!workflow) throw new WorkflowToolUnavailableError('not_found', 'Workflow not found.');
			if (workflow.settings?.engineType === 'v2') {
				throw new WorkflowToolUnavailableError(
					'incompatible',
					'Engine v2 workflows cannot be used as AI Department workflow capabilities.',
				);
			}
			validateCompatibility(workflow);
			const trigger = detectTriggerNode(workflow);
			const schema = inferInputSchema(trigger.node, trigger.triggerType);
			return {
				versionId: workflow.versionId,
				triggerCompatibilityRef: `${trigger.node.type}@${trigger.node.typeVersion}`,
				inputSchemaFingerprint: createHash('sha256')
					.update(JSON.stringify(zodToJsonSchema(schema)))
					.digest('hex'),
			};
		} catch (error) {
			if (error instanceof WorkflowToolUnavailableError) {
				throw new WorkflowToolUnavailableError(
					error.reason,
					'Select a published workflow that uses the standard engine and a supported workflow trigger.',
				);
			}
			throw error;
		}
	}
}
