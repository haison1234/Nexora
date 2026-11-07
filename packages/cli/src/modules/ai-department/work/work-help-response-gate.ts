import { Service } from '@n8n/di';

@Service()
export class WorkHelpResponseGate {
	canUseAgentResponses() {
		return false;
	}
}
