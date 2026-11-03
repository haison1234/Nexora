import type {
	AiDepartmentMemberDto,
	CreateAiDepartmentMemberDto,
	UpdateAiDepartmentMemberDto,
} from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import { ActiveDepartmentWorkGuardProxy } from './active-department-work-guard.contracts';
import { AgentBindingResolver } from '@/modules/agents/agent-binding-resolver.service';
import { DirectoryRepository } from './database/repositories/directory.repository';
import { Member } from './database/entities/member.entity';
import { CommandReceipt } from './database/entities/command-receipt.entity';
import { DirectoryChange } from './database/entities/directory-change.entity';
import { ExecutorBinding } from './database/entities/executor-binding.entity';
import { ExecutorBindingRevision } from './database/entities/executor-binding-revision.entity';

function hashPayload(payload: unknown) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function replayReceipt<T>(receipt: CommandReceipt | null, payloadHash: string): T | undefined {
	if (!receipt) return undefined;
	if (receipt.payloadHash !== payloadHash)
		throw new ConflictError('Request ID was already used for a different command.');
	if (receipt.status !== 'completed' || !receipt.responseJson) {
		throw new ConflictError('This command is still being processed.');
	}
	return JSON.parse(receipt.responseJson) as T;
}

function normalizeField(value: string, label: string) {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 128)
		throw new UserError(`${label} must contain 1 to 128 characters.`);
	return trimmed;
}

function toDto(
	row: Member,
	executionState: AiDepartmentMemberDto['executionState'] = 'unconfigured',
): AiDepartmentMemberDto {
	return {
		id: row.id,
		projectId: row.projectId,
		departmentId: row.departmentId,
		name: row.name,
		role: row.role,
		managerMemberId: row.managerMemberId,
		archived: row.archived,
		version: row.version,
		executionState,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

@Service()
export class MemberService {
	constructor(
		private readonly repository: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly workGuard: ActiveDepartmentWorkGuardProxy,
		private readonly agentBindingResolver: AgentBindingResolver,
	) {}

	async create(
		projectId: string,
		actorId: string,
		departmentId: string,
		dto: CreateAiDepartmentMemberDto,
	) {
		const input = {
			departmentId,
			name: normalizeField(dto.name, 'Name'),
			role: normalizeField(dto.role, 'Role'),
			managerMemberId: dto.managerMemberId ?? null,
		};
		const payloadHash = hashPayload(input);
		return await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt<AiDepartmentMemberDto>(
				await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
				payloadHash,
			);
			if (prior) return prior;
			const department = await this.repository.findDepartment(projectId, departmentId, ctx);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			const managerId = dto.managerMemberId ?? null;
			if (managerId) {
				const manager = await this.repository.findMember(projectId, departmentId, managerId, ctx);
				if (!manager || manager.archived)
					throw new UserError('Manager must be an active member of this department.');
			}
			const row = Object.assign(new Member(), {
				id: randomUUID(),
				projectId,
				departmentId,
				name: input.name,
				role: input.role,
				managerMemberId: managerId,
				archived: false,
				version: 1,
			});
			const saved = await this.repository.saveMember(row, ctx);
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'member',
					entityId: saved.id,
					action: 'created',
					entityVersion: saved.version,
					createdAt: new Date(),
				}),
				ctx,
			);
			const result = toDto(saved);
			await this.repository.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash,
					operation: 'member.create',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
	}

	async update(
		projectId: string,
		actorId: string,
		departmentId: string,
		memberId: string,
		dto: UpdateAiDepartmentMemberDto,
	) {
		const payloadHash = hashPayload({
			departmentId,
			memberId,
			name: dto.name,
			role: dto.role,
			managerMemberId: dto.managerMemberId,
			expectedVersion: dto.expectedVersion,
		});
		return await this.txRunner.run({}, async (ctx) => {
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const prior = replayReceipt<AiDepartmentMemberDto>(
				await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
				payloadHash,
			);
			if (prior) return prior;
			const row = await this.repository.findMember(projectId, departmentId, memberId, ctx);
			if (!row) throw new NotFoundError('Member not found.');
			const department = await this.repository.findDepartment(projectId, departmentId, ctx);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			if (row.version !== dto.expectedVersion)
				throw new ConflictError('Member has changed. Reload and try again.');
			if (dto.name !== undefined) row.name = normalizeField(dto.name, 'Name');
			if (dto.role !== undefined) row.role = normalizeField(dto.role, 'Role');
			if (dto.managerMemberId !== undefined) {
				if (dto.managerMemberId === memberId) throw new UserError('A member cannot manage itself.');
				if (dto.managerMemberId) {
					const manager = await this.repository.findMember(
						projectId,
						departmentId,
						dto.managerMemberId,
						ctx,
					);
					if (!manager || manager.archived)
						throw new UserError('Manager must be an active member of this department.');
					let cursor: Member | null = manager;
					const seen = new Set<string>();
					while (cursor) {
						if (cursor.id === memberId || seen.has(cursor.id))
							throw new UserError('Reporting relationships cannot contain a cycle.');
						seen.add(cursor.id);
						cursor = cursor.managerMemberId
							? await this.repository.findMember(
									projectId,
									departmentId,
									cursor.managerMemberId,
									ctx,
								)
							: null;
					}
				}
				row.managerMemberId = dto.managerMemberId;
			}
			row.version += 1;
			const saved = await this.repository.saveMember(row, ctx);
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'member',
					entityId: saved.id,
					action: 'updated',
					entityVersion: saved.version,
					createdAt: new Date(),
				}),
				ctx,
			);
			const result = toDto(saved);
			await this.repository.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash,
					operation: 'member.update',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
	}

	async archive(
		projectId: string,
		actorId: string,
		departmentId: string,
		memberId: string,
		dto: { expectedVersion: number; requestId: string },
	) {
		if (!this.workGuard.isRegistered())
			throw new ConflictError('Member archive is unavailable until work management is connected.');
		const payloadHash = hashPayload({
			departmentId,
			memberId,
			expectedVersion: dto.expectedVersion,
		});
		return await this.txRunner.run({}, async (ctx) => {
			const prior = replayReceipt<AiDepartmentMemberDto>(
				await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
				payloadHash,
			);
			if (prior) return prior;
			await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
			const row = await this.repository.findMember(projectId, departmentId, memberId, ctx);
			if (!row) throw new NotFoundError('Member not found.');
			if (row.version !== dto.expectedVersion)
				throw new ConflictError('Member has changed. Reload and try again.');
			if (
				await this.repository
					.listMembers(projectId, departmentId, false, ctx)
					.then((members) => members.some((member) => member.managerMemberId === memberId))
			) {
				throw new ConflictError('Reassign active reports before archiving this member.');
			}
			const active = await this.workGuard.forMember(projectId, memberId, ctx);
			if (active.active)
				throw new ConflictError(`Active work prevents archive: ${active.workIds.join(', ')}.`);
			row.archived = true;
			row.version += 1;
			const saved = await this.repository.saveMember(row, ctx);
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'member',
					entityId: saved.id,
					action: 'archived',
					entityVersion: saved.version,
					createdAt: new Date(),
				}),
				ctx,
			);
			const result = toDto(saved);
			await this.repository.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash,
					operation: 'member.archive',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
	}

	async list(projectId: string, departmentId: string, includeArchived: boolean) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department) throw new NotFoundError('Department not found.');
		const members = await this.repository.listMembers(projectId, departmentId, includeArchived);
		const bindings = await this.repository.listBindings(
			projectId,
			members.map(({ id }) => id),
		);
		const bindingByMemberId = new Map(bindings.map((binding) => [binding.memberId, binding]));
		return await Promise.all(
			members.map(async (member) => {
				const binding = bindingByMemberId.get(member.id);
				if (!binding) return toDto(member, 'unconfigured');
				const state = await this.agentBindingResolver.isAvailableInProject(
					binding.executorId,
					projectId,
				);
				return toDto(member, state);
			}),
		);
	}

	async getBinding(projectId: string, departmentId: string, memberId: string) {
		const member = await this.repository.findMember(projectId, departmentId, memberId);
		if (!member) throw new NotFoundError('Member not found.');
		const binding = await this.repository.findBinding(projectId, memberId);
		if (!binding)
			return { memberId, executionState: 'unconfigured' as const, bindingVersion: null };
		const executionState = await this.agentBindingResolver.isAvailableInProject(
			binding.executorId,
			projectId,
		);
		return {
			memberId,
			provider: binding.provider,
			executorId: binding.executorId,
			bindingVersion: binding.version,
			executionState,
		};
	}

	async setBinding(
		projectId: string,
		actorId: string,
		departmentId: string,
		memberId: string,
		dto: { provider: 'n8n-agent'; executorId: string; expectedVersion: number; requestId: string },
	) {
		const payloadHash = hashPayload({ departmentId, memberId, ...dto });
		return await this.txRunner.run({}, async (ctx) => {
			const prior = replayReceipt<{
				memberId: string;
				provider: string;
				executorId: string;
				bindingVersion: number;
				executionState: 'available' | 'unavailable';
			}>(await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx), payloadHash);
			if (prior) return prior;
			const member = await this.repository.findMember(projectId, departmentId, memberId, ctx);
			if (!member) throw new NotFoundError('Member not found.');
			if (member.archived)
				throw new ConflictError('Archived members cannot receive executor bindings.');
			if (member.version !== dto.expectedVersion)
				throw new ConflictError('Member has changed. Reload and try again.');
			const resolved = await this.agentBindingResolver.resolveInProject(dto.executorId, projectId);
			if (!resolved.exists) {
				throw new NotFoundError('Executor not found in this project.');
			}
			const current = await this.repository.findBinding(projectId, memberId, ctx);
			const binding = Object.assign(new ExecutorBinding(), {
				memberId,
				projectId,
				provider: dto.provider,
				executorId: dto.executorId,
				version: (current?.version ?? 0) + 1,
			});
			member.version += 1;
			await this.repository.saveMember(member, ctx);
			await this.repository.saveBinding(binding, ctx);
			await this.repository.saveBindingRevision(
				Object.assign(new ExecutorBindingRevision(), {
					id: randomUUID(),
					memberId,
					version: binding.version,
					provider: binding.provider,
					executorId: binding.executorId,
					changedById: actorId,
					createdAt: new Date(),
				}),
				ctx,
			);
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'member',
					entityId: memberId,
					action: 'binding_changed',
					entityVersion: member.version,
					createdAt: new Date(),
				}),
				ctx,
			);
			const executionState = resolved.available ? ('available' as const) : ('unavailable' as const);
			const result = {
				memberId,
				provider: dto.provider,
				executorId: dto.executorId,
				bindingVersion: binding.version,
				executionState,
			};
			await this.repository.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash,
					operation: 'member.binding.set',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
	}

	async clearBinding(
		projectId: string,
		actorId: string,
		departmentId: string,
		memberId: string,
		dto: { expectedVersion: number; requestId: string },
	) {
		const payloadHash = hashPayload({ departmentId, memberId, ...dto });
		return await this.txRunner.run({}, async (ctx) => {
			const prior = replayReceipt<{
				memberId: string;
				executionState: 'unconfigured';
				bindingVersion: number | null;
			}>(await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx), payloadHash);
			if (prior) return prior;
			const member = await this.repository.findMember(projectId, departmentId, memberId, ctx);
			if (!member) throw new NotFoundError('Member not found.');
			if (member.version !== dto.expectedVersion)
				throw new ConflictError('Member has changed. Reload and try again.');
			const current = await this.repository.findBinding(projectId, memberId, ctx);
			member.version += 1;
			await this.repository.saveMember(member, ctx);
			if (current) {
				await this.repository.saveBindingRevision(
					Object.assign(new ExecutorBindingRevision(), {
						id: randomUUID(),
						memberId,
						version: current.version + 1,
						provider: current.provider,
						executorId: current.executorId,
						changedById: actorId,
						createdAt: new Date(),
					}),
					ctx,
				);
				await this.repository.deleteBinding(projectId, memberId, ctx);
			}
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'member',
					entityId: memberId,
					action: 'binding_cleared',
					entityVersion: member.version,
					createdAt: new Date(),
				}),
				ctx,
			);
			const result = {
				memberId,
				executionState: 'unconfigured' as const,
				bindingVersion: current ? current.version + 1 : null,
			};
			await this.repository.saveReceipt(
				Object.assign(new CommandReceipt(), {
					id: randomUUID(),
					projectId,
					actorId,
					requestId: dto.requestId,
					payloadHash,
					operation: 'member.binding.clear',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
	}
}
