import type { AiDepartmentDto, CreateAiDepartmentDto, UpdateAiDepartmentDto } from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import { ActiveDepartmentArchiveGuardProxy } from './active-department-archive-guard.contracts';
import { Department } from './database/entities/department.entity';
import { DirectoryRepository } from './database/repositories/directory.repository';
import { CommandReceipt } from './database/entities/command-receipt.entity';
import { DirectoryChange } from './database/entities/directory-change.entity';
import { AiDepartmentOperationsBroadcaster } from './operations-broadcaster.service';

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

function normalizeName(value: string): { name: string; key: string } {
	const name = value.trim();
	if (!name || name.length > 128) throw new UserError('Name must contain 1 to 128 characters.');
	return { name, key: name.toLocaleLowerCase('en-US') };
}

function toDto(row: Department): AiDepartmentDto {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name,
		description: row.description,
		archived: row.archived,
		version: row.version,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

@Service()
export class DepartmentService {
	constructor(
		private readonly repository: DirectoryRepository,
		private readonly txRunner: TransactionRunner,
		private readonly archiveGuard: ActiveDepartmentArchiveGuardProxy,
		private readonly operationsBroadcaster: AiDepartmentOperationsBroadcaster,
	) {}

	private async runAndNotify<T>(
		projectId: string,
		departmentId: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const result = await operation();
		await this.operationsBroadcaster.notifyCurrent(projectId, departmentId);
		return result;
	}

	async list(projectId: string, includeArchived = false) {
		return (await this.repository.listDepartments(projectId, includeArchived)).map(toDto);
	}

	async get(projectId: string, departmentId: string) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department) throw new NotFoundError('Department not found.');
		return {
			...toDto(department),
			members: await this.repository.listMembers(projectId, departmentId, true),
		};
	}

	async create(projectId: string, actorId: string, dto: CreateAiDepartmentDto) {
		const { name, key } = normalizeName(dto.name);
		const payloadHash = hashPayload({ name, description: dto.description?.trim() || null });
		const result = await this.txRunner.run({}, async (ctx) => {
			const prior = replayReceipt<AiDepartmentDto>(
				await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
				payloadHash,
			);
			if (prior) return prior;
			if (await this.repository.findActiveDepartmentByName(projectId, key, ctx)) {
				throw new ConflictError('An active department with this name already exists.');
			}
			const row = Object.assign(new Department(), {
				id: randomUUID(),
				projectId,
				name,
				normalizedName: key,
				description: dto.description?.trim() || null,
				archived: false,
				version: 1,
			});
			const saved = await this.repository.saveDepartment(row, ctx);
			await this.repository.saveChange(
				Object.assign(new DirectoryChange(), {
					id: randomUUID(),
					projectId,
					actorId,
					entityType: 'department',
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
					operation: 'department.create',
					status: 'completed',
					responseJson: JSON.stringify(result),
					createdAt: new Date(),
				}),
				ctx,
			);
			return result;
		});
		await this.operationsBroadcaster.notifyCurrent(projectId, result.id);
		return result;
	}

	async update(
		projectId: string,
		actorId: string,
		departmentId: string,
		dto: UpdateAiDepartmentDto,
	) {
		const payloadHash = hashPayload({
			departmentId,
			name: dto.name,
			description: dto.description,
			expectedVersion: dto.expectedVersion,
		});
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					const prior = replayReceipt<AiDepartmentDto>(
						await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
						payloadHash,
					);
					if (prior) return prior;
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const row = await this.repository.findDepartment(projectId, departmentId, ctx);
					if (!row) throw new NotFoundError('Department not found.');
					if (row.version !== dto.expectedVersion)
						throw new ConflictError('Department has changed. Reload and try again.');
					if (dto.name !== undefined) {
						const { name, key } = normalizeName(dto.name);
						const duplicate = await this.repository.findActiveDepartmentByName(projectId, key, ctx);
						if (duplicate && duplicate.id !== row.id)
							throw new ConflictError('An active department with this name already exists.');
						row.name = name;
						row.normalizedName = key;
					}
					if (dto.description !== undefined) row.description = dto.description?.trim() || null;
					row.version += 1;
					const saved = await this.repository.saveDepartment(row, ctx);
					await this.repository.saveChange(
						Object.assign(new DirectoryChange(), {
							id: randomUUID(),
							projectId,
							actorId,
							entityType: 'department',
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
							operation: 'department.update',
							status: 'completed',
							responseJson: JSON.stringify(result),
							createdAt: new Date(),
						}),
						ctx,
					);
					return result;
				}),
		);
	}

	async archive(
		projectId: string,
		actorId: string,
		departmentId: string,
		dto: { expectedVersion: number; requestId: string },
	) {
		if (!this.archiveGuard.isRegistered())
			throw new ConflictError(
				'Department archive is unavailable until archive checks are connected.',
			);
		const payloadHash = hashPayload({ departmentId, expectedVersion: dto.expectedVersion });
		return await this.runAndNotify(
			projectId,
			departmentId,
			async () =>
				await this.txRunner.run({}, async (ctx) => {
					const prior = replayReceipt<AiDepartmentDto>(
						await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx),
						payloadHash,
					);
					if (prior) return prior;
					await this.repository.acquireAdmissionFence(projectId, departmentId, ctx);
					const row = await this.repository.findDepartment(projectId, departmentId, ctx);
					if (!row) throw new NotFoundError('Department not found.');
					if (row.version !== dto.expectedVersion)
						throw new ConflictError('Department has changed. Reload and try again.');
					const active = await this.archiveGuard.forDepartment(projectId, departmentId, ctx);
					if (active.active)
						throw new ConflictError(
							`Active department records prevent archive: ${active.blockers.map(({ id }) => id).join(', ')}.`,
							undefined,
							{ blockers: active.blockers },
						);
					row.archived = true;
					row.version += 1;
					const saved = await this.repository.saveDepartment(row, ctx);
					await this.repository.saveChange(
						Object.assign(new DirectoryChange(), {
							id: randomUUID(),
							projectId,
							actorId,
							entityType: 'department',
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
							operation: 'department.archive',
							status: 'completed',
							responseJson: JSON.stringify(result),
							createdAt: new Date(),
						}),
						ctx,
					);
					return result;
				}),
		);
	}
}
