import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, In } from '@n8n/typeorm';

import { AgentDepartmentConsultationInvocation } from '../entities/agent-department-consultation-invocation.entity';
import { AgentDepartmentConsultationInvocationGate } from '../entities/agent-department-consultation-invocation-gate.entity';

class ConsultationInvocationTable extends BaseRepository<AgentDepartmentConsultationInvocation> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(AgentDepartmentConsultationInvocation, dataSource.manager, runner);
	}
}

class ConsultationInvocationGateTable extends BaseRepository<AgentDepartmentConsultationInvocationGate> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(AgentDepartmentConsultationInvocationGate, dataSource.manager, runner);
	}
}

export type ConsultationInvocationReservation = Omit<
	AgentDepartmentConsultationInvocation,
	| 'createdAt'
	| 'updatedAt'
	| 'outcome'
	| 'safeErrorCode'
	| 'terminalAt'
	| 'sequence'
	| 'resultText'
	| 'resultHash'
	| 'stopCommandId'
	| 'stopPayloadHash'
	| 'stopRequestedAt'
	| 'state'
	| 'setUpdateDate'
>;

export type ConsultationInvocationReservationResult =
	| { kind: 'created' | 'duplicate'; invocation: AgentDepartmentConsultationInvocation }
	| { kind: 'cancelled' }
	| { kind: 'conflict' };

@Service()
export class AgentDepartmentConsultationInvocationRepository {
	private readonly table: ConsultationInvocationTable;
	private readonly gateTable: ConsultationInvocationGateTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.table = new ConsultationInvocationTable(dataSource, runner);
		this.gateTable = new ConsultationInvocationGateTable(dataSource, runner);
	}

	async reserve(
		input: ConsultationInvocationReservation,
		ctx: OperationContext = {},
	): Promise<ConsultationInvocationReservationResult> {
		const manager = this.table.managerFor(ctx);
		const now = new Date();
		const gate = await this.ensureOpenGate(input, ctx);
		if (gate === 'cancelled') return { kind: 'cancelled' };
		if (gate === 'conflict') return { kind: 'conflict' };

		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentConsultationInvocation)
			.values({
				...input,
				createdAt: now,
				updatedAt: now,
				state: 'reserved',
				outcome: null,
				safeErrorCode: null,
				sequence: '0',
				resultText: null,
				resultHash: null,
				stopCommandId: null,
				stopPayloadHash: null,
				stopRequestedAt: null,
				terminalAt: null,
			})
			.orIgnore()
			.execute();

		const byId = await manager.findOneBy(AgentDepartmentConsultationInvocation, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		const byKey = await manager.findOneBy(AgentDepartmentConsultationInvocation, {
			projectId: input.projectId,
			commandKey: input.commandKey,
		});
		const byHelpRequest = await manager.findOneBy(AgentDepartmentConsultationInvocation, {
			projectId: input.projectId,
			helpRequestId: input.helpRequestId,
		});
		if (
			!byId ||
			!byKey ||
			!byHelpRequest ||
			byId.id !== byKey.id ||
			byId.id !== byHelpRequest.id ||
			byId.inputHash !== input.inputHash
		) {
			return { kind: 'conflict' };
		}
		const currentGate = await this.ensureOpenGate(input, ctx);
		if (currentGate === 'cancelled') return { kind: 'cancelled' };
		if (currentGate === 'conflict') return { kind: 'conflict' };
		return { kind: byId.id === input.id ? 'created' : 'duplicate', invocation: byId };
	}

	private async ensureOpenGate(
		input: Pick<
			ConsultationInvocationReservation,
			'projectId' | 'invocationId' | 'commandKey' | 'inputHash'
		>,
		ctx: OperationContext,
	): Promise<'open' | 'cancelled' | 'conflict'> {
		const manager = this.gateTable.managerFor(ctx);
		const now = new Date();
		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentConsultationInvocationGate)
			.values({
				...input,
				state: 'open',
				cancelCommandId: null,
				cancelPayloadHash: null,
				createdAt: now,
				updatedAt: now,
			})
			.orIgnore()
			.execute();
		const byId = await manager.findOneBy(AgentDepartmentConsultationInvocationGate, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		const byKey = await manager.findOneBy(AgentDepartmentConsultationInvocationGate, {
			projectId: input.projectId,
			commandKey: input.commandKey,
		});
		if (
			!byId ||
			!byKey ||
			byId.invocationId !== byKey.invocationId ||
			byId.commandKey !== input.commandKey ||
			byId.inputHash !== input.inputHash
		) {
			return 'conflict';
		}
		return byId.state;
	}

	async cancelGate(input: {
		projectId: string;
		invocationId: string;
		commandKey: string;
		inputHash: string;
		commandId: string;
		payloadHash: string;
	}) {
		const manager = this.gateTable.managerFor({});
		const now = new Date();
		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentConsultationInvocationGate)
			.values({
				projectId: input.projectId,
				invocationId: input.invocationId,
				commandKey: input.commandKey,
				inputHash: input.inputHash,
				state: 'cancelled',
				cancelCommandId: input.commandId,
				cancelPayloadHash: input.payloadHash,
				createdAt: now,
				updatedAt: now,
			})
			.orIgnore()
			.execute();
		await manager.update(
			AgentDepartmentConsultationInvocationGate,
			{ projectId: input.projectId, invocationId: input.invocationId, state: 'open' },
			{
				state: 'cancelled',
				cancelCommandId: input.commandId,
				cancelPayloadHash: input.payloadHash,
			},
		);
		const current = await manager.findOneBy(AgentDepartmentConsultationInvocationGate, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		if (
			!current ||
			current.commandKey !== input.commandKey ||
			current.inputHash !== input.inputHash ||
			current.cancelCommandId !== input.commandId ||
			current.cancelPayloadHash !== input.payloadHash
		) {
			return { kind: 'conflict' as const };
		}
		return { kind: 'cancelled' as const };
	}

	async isCancelled(input: {
		projectId: string;
		invocationId: string;
		commandKey: string;
		inputHash: string;
	}) {
		const gate = await this.gateTable
			.managerFor({})
			.findOneBy(AgentDepartmentConsultationInvocationGate, {
				projectId: input.projectId,
				invocationId: input.invocationId,
			});
		return (
			!gate ||
			gate.commandKey !== input.commandKey ||
			gate.inputHash !== input.inputHash ||
			gate.state === 'cancelled'
		);
	}

	async findByInvocationId(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		return await this.table.managerFor(ctx).findOneBy(AgentDepartmentConsultationInvocation, {
			projectId,
			invocationId,
		});
	}

	async findByCommandKey(projectId: string, commandKey: string, ctx: OperationContext = {}) {
		return await this.table.managerFor(ctx).findOneBy(AgentDepartmentConsultationInvocation, {
			projectId,
			commandKey,
		});
	}

	async findUnresolvedEnqueues(take: number) {
		return await this.table.managerFor({}).find(AgentDepartmentConsultationInvocation, {
			where: [{ state: 'reserved' }, { state: 'unknown' }, { state: 'stopping' }],
			order: { createdAt: 'ASC' },
			take,
		});
	}

	async findPendingStops(take: number) {
		return await this.table.managerFor({}).find(AgentDepartmentConsultationInvocation, {
			where: { state: 'stopping' },
			order: { stopRequestedAt: 'ASC' },
			take,
		});
	}

	async markStopping(input: {
		projectId: string;
		invocationId: string;
		commandId: string;
		payloadHash: string;
	}) {
		const manager = this.table.managerFor({});
		const current = await this.findByInvocationId(input.projectId, input.invocationId);
		if (!current) return { kind: 'absent' as const };
		if (current.state === 'terminal') return { kind: 'terminal' as const, invocation: current };
		if (
			current.stopCommandId &&
			(current.stopCommandId !== input.commandId || current.stopPayloadHash !== input.payloadHash)
		) {
			return { kind: 'conflict' as const };
		}
		await manager.update(
			AgentDepartmentConsultationInvocation,
			{
				projectId: input.projectId,
				invocationId: input.invocationId,
				sequence: current.sequence,
				state: In(['reserved', 'accepted', 'running', 'unknown']),
			},
			{
				state: 'stopping',
				stopCommandId: input.commandId,
				stopPayloadHash: input.payloadHash,
				stopRequestedAt: new Date(),
				sequence: String(Number(current.sequence) + 1),
			},
		);
		const updated = await this.findByInvocationId(input.projectId, input.invocationId);
		return updated?.state === 'stopping'
			? { kind: 'accepted' as const, invocation: updated }
			: { kind: 'conflict' as const };
	}

	async markAccepted(projectId: string, invocationId: string) {
		return await this.table
			.managerFor({})
			.update(
				AgentDepartmentConsultationInvocation,
				{ projectId, invocationId, state: In(['reserved', 'unknown']) },
				{ state: 'accepted' },
			);
	}

	async markUnknown(projectId: string, invocationId: string) {
		return await this.table
			.managerFor({})
			.update(
				AgentDepartmentConsultationInvocation,
				{ projectId, invocationId, state: 'reserved' },
				{ state: 'unknown', safeErrorCode: 'enqueue_unknown' },
			);
	}

	async markRunning(projectId: string, invocationId: string) {
		const invocation = await this.findByInvocationId(projectId, invocationId);
		if (!invocation || invocation.state === 'stopping' || invocation.state === 'terminal') {
			return { affected: 0 };
		}
		return await this.table
			.managerFor({})
			.update(
				AgentDepartmentConsultationInvocation,
				{ projectId, invocationId, state: In(['accepted', 'unknown']) },
				{ state: 'running' },
			);
	}

	async markTerminal(input: {
		projectId: string;
		invocationId: string;
		outcome: 'succeeded' | 'failed' | 'cancelled';
		safeErrorCode?: string;
		resultText?: string;
		resultHash?: string;
	}) {
		for (let attempt = 0; attempt < 3; attempt++) {
			const invocation = await this.findByInvocationId(input.projectId, input.invocationId);
			if (!invocation || invocation.state === 'terminal') return { affected: 0 };
			const sequence = String(Number(invocation.sequence) + 1);
			const outcome = invocation.state === 'stopping' ? 'cancelled' : input.outcome;
			const safeErrorCode =
				invocation.state === 'stopping' ? 'stopped' : (input.safeErrorCode ?? null);
			const result = await this.table.managerFor({}).update(
				AgentDepartmentConsultationInvocation,
				{
					projectId: input.projectId,
					invocationId: input.invocationId,
					sequence: invocation.sequence,
					state: invocation.state,
				},
				{
					state: 'terminal',
					outcome,
					safeErrorCode,
					resultText: outcome === 'succeeded' ? (input.resultText ?? null) : null,
					resultHash: outcome === 'succeeded' ? (input.resultHash ?? null) : null,
					terminalAt: new Date(),
					sequence,
				},
			);
			if (result.affected) return result;
		}
		return { affected: 0 };
	}
}
