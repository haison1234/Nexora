import type { AiDepartmentOperationsSnapshotDto } from '@n8n/api-types';
import { ConflictError, NotFoundError } from '@n8n/errors';
import { Service } from '@n8n/di';

import { DirectoryRepository } from './database/repositories/directory.repository';
import { MemberService } from './member.service';
import { WorkService } from './work/work.service';
import { WorkHelpService } from './work/work-help.service';

@Service()
export class AiDepartmentOperationsService {
	constructor(
		private readonly directory: DirectoryRepository,
		private readonly members: MemberService,
		private readonly work: WorkService,
		private readonly help: WorkHelpService,
	) {}

	async getSnapshot(
		projectId: string,
		departmentId: string,
	): Promise<AiDepartmentOperationsSnapshotDto> {
		for (let attempt = 0; attempt < 3; attempt++) {
			const before = await this.directory.findDepartment(projectId, departmentId);
			if (!before || before.archived) throw new NotFoundError('Department not found.');
			const [members, work, helpRequests, activity] = await Promise.all([
				this.members.list(projectId, departmentId, false),
				this.work.listWork(projectId, departmentId, { take: 100, skip: 0 }),
				this.help.listAttention(projectId, departmentId),
				this.work.listDepartmentActivity(projectId, departmentId, 100, 0),
			]);
			const after = await this.directory.findDepartment(projectId, departmentId);
			if (!after || after.archived) throw new NotFoundError('Department not found.');
			if (before.projectionSequence === after.projectionSequence) {
				return {
					projectId,
					departmentId,
					revision: after.projectionSequence,
					members,
					work,
					helpRequests,
					activity,
				};
			}
		}
		throw new ConflictError('Department changed while its operations snapshot was loading.');
	}
}
