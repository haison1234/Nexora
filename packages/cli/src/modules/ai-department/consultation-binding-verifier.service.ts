import { Service } from '@n8n/di';

import { DepartmentConsultationBindingVerifier } from '@/modules/agents/agent-department-consultation.contracts';
import { DirectoryRepository } from './database/repositories/directory.repository';

@Service()
export class ConsultationBindingVerifierService extends DepartmentConsultationBindingVerifier {
	constructor(private readonly directory: DirectoryRepository) {
		super();
	}

	async isCurrentBinding(input: {
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}) {
		const [member, binding] = await Promise.all([
			this.directory.findMember(input.projectId, input.departmentId, input.memberId),
			this.directory.findBinding(input.projectId, input.memberId),
		]);
		return (
			member !== null &&
			!member.archived &&
			binding !== null &&
			binding.provider === 'n8n-agent' &&
			binding.executorId === input.executorId &&
			binding.version === input.bindingVersion
		);
	}
}
