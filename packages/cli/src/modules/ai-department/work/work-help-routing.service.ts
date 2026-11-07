import { ProjectRelationRepository } from '@n8n/db';
import { Service } from '@n8n/di';

import { DirectoryRepository } from '../database/repositories/directory.repository';
import { DepartmentExecutorProxy } from './executor.contracts';
import { routeWorkHelp, type WorkHelpRoutingInput } from './work-help-routing';

export type ResolveWorkHelpRoutingInput = Omit<
	WorkHelpRoutingInput,
	'members' | 'assignmentActorHasProjectAccess'
> & {
	initiatingUserId: string;
};

@Service()
export class WorkHelpRoutingService {
	constructor(
		private readonly directory: DirectoryRepository,
		private readonly executor: DepartmentExecutorProxy,
		private readonly projectRelations: ProjectRelationRepository,
	) {}

	async route(input: ResolveWorkHelpRoutingInput) {
		const members = await this.directory.listMembers(input.projectId, input.departmentId, true);
		const routableMembers: WorkHelpRoutingInput['members'][number][] = [];
		for (const member of members) {
			const binding = await this.directory.findBinding(input.projectId, member.id);
			let bindingAvailable = false;
			if (binding) {
				try {
					const resolution = await this.executor.resolve({
						actorId: input.initiatingUserId,
						projectId: input.projectId,
						memberId: member.id,
						executorId: binding.executorId,
						bindingVersion: binding.version,
					});
					bindingAvailable =
						resolution.status === 'available' &&
						resolution.canStart &&
						resolution.authorized &&
						resolution.executorId === binding.executorId &&
						resolution.bindingVersion === binding.version;
				} catch {
					bindingAvailable = false;
				}
			}
			routableMembers.push({
				id: member.id,
				projectId: member.projectId,
				departmentId: member.departmentId,
				archived: member.archived,
				expertiseTags: member.expertiseTags,
				bindingAvailable,
				bindingVersion: binding?.version ?? 0,
			});
		}

		let assignmentActorHasProjectAccess = false;
		if (input.assignmentActorUserId) {
			const role = await this.projectRelations.findProjectRole({
				userId: input.assignmentActorUserId,
				projectId: input.projectId,
			});
			assignmentActorHasProjectAccess =
				role?.scopes.some(({ slug }) => slug === 'agent:update') ?? false;
		}

		return routeWorkHelp({
			...input,
			assignmentActorHasProjectAccess,
			members: routableMembers,
		});
	}
}
