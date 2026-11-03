import { Service } from '@n8n/di';

import { AgentsService } from './agents.service';

export type AgentBindingAvailability = 'available' | 'unavailable';
export type AgentBindingResolution = { exists: false } | { exists: true; available: boolean };

/** Project-scoped Agent lookup for modules that store an Agent reference. */
@Service()
export class AgentBindingResolver {
	constructor(private readonly agentsService: AgentsService) {}

	async isAvailableInProject(
		agentId: string,
		projectId: string,
	): Promise<AgentBindingAvailability> {
		const agent = await this.agentsService.findById(agentId, projectId);
		return agent?.activeVersionId ? 'available' : 'unavailable';
	}

	async resolveInProject(agentId: string, projectId: string): Promise<AgentBindingResolution> {
		const agent = await this.agentsService.findById(agentId, projectId);
		return agent ? { exists: true, available: agent.activeVersionId !== null } : { exists: false };
	}
}
