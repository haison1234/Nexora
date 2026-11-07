import type {
	AiDepartmentWorkflowCapabilityDto,
	CreateAiDepartmentWorkflowCapabilityDto,
	UpdateAiDepartmentWorkflowCapabilityDto,
} from '@n8n/api-types';
import { TransactionRunner } from '@n8n/db';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import { ConflictError, NotFoundError, UserError } from '@n8n/errors';
import { createHash, randomUUID } from 'node:crypto';

import { AgentWorkflowCapabilityDescriptorService } from '@/modules/agents/agent-workflow-capability-descriptor.service';
import { WorkflowFinderService } from '@/workflows/workflow-finder.service';
import { WorkflowToolUnavailableError } from '@/modules/agents/tools/workflow-tool-unavailable-error';

import { CommandReceipt } from '../database/entities/command-receipt.entity';
import { DirectoryChange } from '../database/entities/directory-change.entity';
import { WorkflowCapability } from '../database/entities/workflow-capability.entity';
import { WorkflowCapabilityRevision } from '../database/entities/workflow-capability-revision.entity';
import { WorkflowCapabilityRepository } from '../database/repositories/workflow-capability.repository';
import { AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED } from './workflow-invocation-gate';

function hash(value: unknown) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toDto(row: WorkflowCapability): AiDepartmentWorkflowCapabilityDto {
	return {
		id: row.id,
		projectId: row.projectId,
		departmentId: row.departmentId,
		memberId: row.memberId,
		workflowId: row.workflowId,
		purpose: row.purpose,
		publishedVersionRef: row.publishedVersionRef,
		triggerCompatibilityRef: row.triggerCompatibilityRef,
		inputSchemaFingerprint: row.inputSchemaFingerprint,
		enabled: row.enabled,
		version: row.version,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

@Service()
export class WorkflowCapabilityService {
	constructor(
		private readonly repository: WorkflowCapabilityRepository,
		private readonly txRunner: TransactionRunner,
		private readonly workflowFinder: WorkflowFinderService,
		private readonly capabilityDescriptor: AgentWorkflowCapabilityDescriptorService,
	) {}

	async list(projectId: string, departmentId: string, memberId: string) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		const member = await this.repository.findMember(projectId, departmentId, memberId);
		if (!member) throw new NotFoundError('Member not found.');
		return { data: (await this.repository.list(projectId, departmentId, memberId)).map(toDto) };
	}

	async listEnabledWorkflowIds(projectId: string, departmentId: string, memberId: string) {
		const department = await this.repository.findDepartment(projectId, departmentId);
		if (!department || department.archived) throw new NotFoundError('Department not found.');
		const member = await this.repository.findMember(projectId, departmentId, memberId);
		if (!member) throw new NotFoundError('Member not found.');
		if (!AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED) return [];
		return await this.repository.listEnabledWorkflowIds(projectId, departmentId, memberId);
	}

	async create(
		projectId: string,
		actorId: string,
		user: User,
		departmentId: string,
		memberId: string,
		dto: CreateAiDepartmentWorkflowCapabilityDto,
	) {
		if (dto.enabled && !AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED) {
			throw new ConflictError(
				'Workflow capabilities cannot be enabled until execution ownership is verified.',
			);
		}
		const purpose = dto.purpose.trim();
		if (!purpose || purpose.length > 2000)
			throw new UserError('Purpose must contain 1 to 2000 characters.');
		const payloadHash = hash({
			departmentId,
			memberId,
			workflowId: dto.workflowId,
			purpose,
			enabled: dto.enabled,
		});

		return await this.txRunner.run({}, async (ctx) => {
			const prior = await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx);
			if (prior) {
				if (prior.payloadHash !== payloadHash || prior.operation !== 'workflow-capability.create') {
					throw new ConflictError('Request ID was already used for a different command.');
				}
				if (!prior.responseJson) throw new ConflictError('This command is still being processed.');
				return JSON.parse(prior.responseJson) as AiDepartmentWorkflowCapabilityDto;
			}

			const department = await this.repository.findDepartment(projectId, departmentId, ctx);
			if (!department || department.archived) throw new NotFoundError('Department not found.');
			const member = await this.repository.findMember(projectId, departmentId, memberId, ctx);
			if (!member) throw new NotFoundError('Member not found.');
			if (await this.repository.findForWorkflow(projectId, memberId, dto.workflowId, ctx)) {
				throw new ConflictError('This workflow is already selected for the member.');
			}
			const published = await this.describePublishedWorkflow(projectId, user, dto.workflowId);

			const now = new Date();
			const row = Object.assign(new WorkflowCapability(), {
				id: randomUUID(),
				projectId,
				departmentId,
				memberId,
				workflowId: dto.workflowId,
				purpose,
				publishedVersionRef: published.versionId,
				triggerCompatibilityRef: published.triggerCompatibilityRef,
				inputSchemaFingerprint: published.inputSchemaFingerprint,
				enabled: dto.enabled,
				version: 1,
				createdAt: now,
				updatedAt: now,
			});
			const saved = await this.repository.save(row, ctx);
			await this.recordRevision(saved, actorId, ctx);
			const result = toDto(saved);
			await this.recordCommand(
				projectId,
				actorId,
				dto.requestId,
				payloadHash,
				'workflow-capability.create',
				result,
				ctx,
			);
			await this.recordChange(projectId, actorId, saved, 'created', ctx);
			return result;
		});
	}

	async update(
		projectId: string,
		actorId: string,
		user: User,
		departmentId: string,
		memberId: string,
		capabilityId: string,
		dto: UpdateAiDepartmentWorkflowCapabilityDto,
	) {
		const current = await this.repository.find(projectId, capabilityId);
		if (!current || current.departmentId !== departmentId || current.memberId !== memberId) {
			throw new NotFoundError('Workflow capability not found.');
		}
		if (
			(dto.enabled === true || (current.enabled && dto.enabled !== false)) &&
			!AI_DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED
		) {
			throw new ConflictError(
				'Workflow capabilities cannot be enabled until execution ownership is verified.',
			);
		}
		const payloadHash = hash({
			capabilityId,
			expectedVersion: dto.expectedVersion,
			purpose: dto.purpose,
			enabled: dto.enabled,
			refreshPublication: dto.refreshPublication,
		});

		return await this.txRunner.run({}, async (ctx) => {
			const prior = await this.repository.findReceipt(projectId, actorId, dto.requestId, ctx);
			if (prior) {
				if (prior.payloadHash !== payloadHash || prior.operation !== 'workflow-capability.update') {
					throw new ConflictError('Request ID was already used for a different command.');
				}
				if (!prior.responseJson) throw new ConflictError('This command is still being processed.');
				return JSON.parse(prior.responseJson) as AiDepartmentWorkflowCapabilityDto;
			}
			const published =
				dto.enabled === false
					? null
					: await this.describePublishedWorkflow(projectId, user, current.workflowId);
			if (
				published &&
				(published.versionId !== current.publishedVersionRef ||
					published.triggerCompatibilityRef !== current.triggerCompatibilityRef ||
					published.inputSchemaFingerprint !== current.inputSchemaFingerprint) &&
				!dto.refreshPublication
			) {
				throw new ConflictError('Published workflow changed. Review and refresh this capability.');
			}
			if (current.version !== dto.expectedVersion) {
				throw new ConflictError('Workflow capability has changed. Reload and try again.');
			}
			const patch: Partial<WorkflowCapability> = {
				purpose: dto.purpose?.trim() ?? current.purpose,
				enabled: dto.enabled ?? current.enabled,
				...(published && {
					publishedVersionRef: published.versionId,
					triggerCompatibilityRef: published.triggerCompatibilityRef,
					inputSchemaFingerprint: published.inputSchemaFingerprint,
				}),
				version: current.version + 1,
				updatedAt: new Date(),
			};
			if (!patch.purpose || patch.purpose.length > 2000) {
				throw new UserError('Purpose must contain 1 to 2000 characters.');
			}
			const saved = await this.repository.updateAtVersion(
				projectId,
				capabilityId,
				dto.expectedVersion,
				patch,
				ctx,
			);
			if (!saved) throw new ConflictError('Workflow capability has changed. Reload and try again.');
			await this.recordRevision(saved, actorId, ctx);
			const result = toDto(saved);
			await this.recordCommand(
				projectId,
				actorId,
				dto.requestId,
				payloadHash,
				'workflow-capability.update',
				result,
				ctx,
			);
			await this.recordChange(projectId, actorId, saved, 'updated', ctx);
			return result;
		});
	}

	private async describePublishedWorkflow(projectId: string, user: User, workflowId: string) {
		const accessible = await this.workflowFinder.findWorkflowForUser(workflowId, user, [
			'workflow:read',
		]);
		if (!accessible) throw new NotFoundError('Workflow not found.');
		try {
			return await this.capabilityDescriptor.describePublished(
				projectId,
				workflowId,
				accessible.name,
			);
		} catch (error) {
			if (error instanceof WorkflowToolUnavailableError) {
				if (error.reason === 'not_found') throw new NotFoundError('Workflow not found.');
				throw new UserError(
					'Select a published workflow that uses the standard engine and a supported workflow trigger.',
				);
			}
			throw error;
		}
	}

	private async recordCommand(
		projectId: string,
		actorId: string,
		requestId: string,
		payloadHash: string,
		operation: string,
		result: AiDepartmentWorkflowCapabilityDto,
		ctx: Parameters<WorkflowCapabilityRepository['saveReceipt']>[1],
	) {
		await this.repository.saveReceipt(
			Object.assign(new CommandReceipt(), {
				id: randomUUID(),
				projectId,
				actorId,
				requestId,
				payloadHash,
				operation,
				status: 'completed',
				responseJson: JSON.stringify(result),
				createdAt: new Date(),
			}),
			ctx,
		);
	}

	private async recordRevision(
		row: WorkflowCapability,
		actorId: string,
		ctx: Parameters<WorkflowCapabilityRepository['saveRevision']>[1],
	) {
		await this.repository.saveRevision(
			Object.assign(new WorkflowCapabilityRevision(), {
				id: randomUUID(),
				projectId: row.projectId,
				capabilityId: row.id,
				version: row.version,
				purpose: row.purpose,
				publishedVersionRef: row.publishedVersionRef,
				triggerCompatibilityRef: row.triggerCompatibilityRef,
				inputSchemaFingerprint: row.inputSchemaFingerprint,
				enabled: row.enabled,
				changedById: actorId,
				createdAt: new Date(),
			}),
			ctx,
		);
	}

	private async recordChange(
		projectId: string,
		actorId: string,
		row: WorkflowCapability,
		action: string,
		ctx: Parameters<WorkflowCapabilityRepository['saveChange']>[1],
	) {
		await this.repository.saveChange(
			Object.assign(new DirectoryChange(), {
				id: randomUUID(),
				projectId,
				actorId,
				entityType: 'workflow-capability',
				entityId: row.id,
				action,
				entityVersion: row.version,
				createdAt: new Date(),
			}),
			ctx,
		);
	}
}
