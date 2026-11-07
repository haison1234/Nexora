import { BaseRepository, TransactionRunner, type OperationContext } from '@n8n/db';
import { Service } from '@n8n/di';
import { DataSource, In, IsNull } from '@n8n/typeorm';

import { AgentDepartmentMeetingInvocation } from '../entities/agent-department-meeting-invocation.entity';
import { AgentDepartmentMeetingInvocationGate } from '../entities/agent-department-meeting-invocation-gate.entity';

class AgentDepartmentMeetingInvocationTable extends BaseRepository<AgentDepartmentMeetingInvocation> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(AgentDepartmentMeetingInvocation, dataSource.manager, runner);
	}
}

class AgentDepartmentMeetingInvocationGateTable extends BaseRepository<AgentDepartmentMeetingInvocationGate> {
	constructor(dataSource: DataSource, runner: TransactionRunner) {
		super(AgentDepartmentMeetingInvocationGate, dataSource.manager, runner);
	}
}

export type MeetingInvocationReservation = Omit<
	AgentDepartmentMeetingInvocation,
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

export type MeetingInvocationReservationResult =
	| { kind: 'created' | 'duplicate'; invocation: AgentDepartmentMeetingInvocation }
	| { kind: 'cancelled' }
	| { kind: 'conflict' };

@Service()
export class AgentDepartmentMeetingInvocationRepository {
	private readonly table: AgentDepartmentMeetingInvocationTable;
	private readonly gateTable: AgentDepartmentMeetingInvocationGateTable;

	constructor(dataSource: DataSource, runner: TransactionRunner) {
		this.table = new AgentDepartmentMeetingInvocationTable(dataSource, runner);
		this.gateTable = new AgentDepartmentMeetingInvocationGateTable(dataSource, runner);
	}

	async ensureOpenGate(
		input: {
			projectId: string;
			invocationId: string;
			requestKey: string;
			inputHash: string;
		},
		ctx: OperationContext = {},
	) {
		const manager = this.gateTable.managerFor(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentMeetingInvocationGate)
			.values({ ...input, state: 'open', cancelCommandId: null, cancelPayloadHash: null })
			.orIgnore()
			.execute();
		const byId = await manager.findOneBy(AgentDepartmentMeetingInvocationGate, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		const byKey = await manager.findOneBy(AgentDepartmentMeetingInvocationGate, {
			projectId: input.projectId,
			requestKey: input.requestKey,
		});
		if (
			!byId ||
			!byKey ||
			byId.invocationId !== byKey.invocationId ||
			byId.requestKey !== input.requestKey ||
			byId.inputHash !== input.inputHash
		) {
			return { kind: 'conflict' as const };
		}
		return byId.state === 'cancelled' ? { kind: 'cancelled' as const } : { kind: 'open' as const };
	}

	async cancelGate(
		input: {
			projectId: string;
			invocationId: string;
			requestKey: string;
			inputHash: string;
			commandId: string;
			payloadHash: string;
		},
		ctx: OperationContext = {},
	) {
		const manager = this.gateTable.managerFor(ctx);
		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentMeetingInvocationGate)
			.values({
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				inputHash: input.inputHash,
				state: 'cancelled',
				cancelCommandId: input.commandId,
				cancelPayloadHash: input.payloadHash,
			})
			.orIgnore()
			.execute();
		await manager.update(
			AgentDepartmentMeetingInvocationGate,
			{ projectId: input.projectId, invocationId: input.invocationId, state: 'open' },
			{
				state: 'cancelled',
				cancelCommandId: input.commandId,
				cancelPayloadHash: input.payloadHash,
			},
		);
		const current = await manager.findOneBy(AgentDepartmentMeetingInvocationGate, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		if (
			!current ||
			current.requestKey !== input.requestKey ||
			current.inputHash !== input.inputHash ||
			current.cancelCommandId !== input.commandId ||
			current.cancelPayloadHash !== input.payloadHash
		) {
			return { kind: 'conflict' as const };
		}
		return { kind: 'cancelled' as const };
	}

	async isCancelled(
		input: {
			projectId: string;
			invocationId: string;
			requestKey: string;
			inputHash: string;
		},
		ctx: OperationContext = {},
	) {
		const gate = await this.gateTable
			.managerFor(ctx)
			.findOneBy(AgentDepartmentMeetingInvocationGate, {
				projectId: input.projectId,
				invocationId: input.invocationId,
			});
		return (
			!gate ||
			gate.requestKey !== input.requestKey ||
			gate.inputHash !== input.inputHash ||
			gate.state === 'cancelled'
		);
	}

	async reserve(
		input: MeetingInvocationReservation,
		ctx: OperationContext = {},
	): Promise<MeetingInvocationReservationResult> {
		const manager = this.table.managerFor(ctx);
		const gate = await this.ensureOpenGate(
			{
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				inputHash: input.inputHash,
			},
			ctx,
		);
		if (gate.kind === 'cancelled') return { kind: 'cancelled' };
		if (gate.kind === 'conflict') return { kind: 'conflict' };
		await manager
			.createQueryBuilder()
			.insert()
			.into(AgentDepartmentMeetingInvocation)
			.values({
				...input,
				state: 'reserved',
				outcome: null,
				safeErrorCode: null,
				sequence: '0',
				resultText: null,
				resultHash: null,
			})
			.orIgnore()
			.execute();
		const existing = await manager.findOne(AgentDepartmentMeetingInvocation, {
			where: [
				{ projectId: input.projectId, requestKey: input.requestKey },
				{ projectId: input.projectId, invocationId: input.invocationId },
			],
		});
		const currentGate = await this.ensureOpenGate(
			{
				projectId: input.projectId,
				invocationId: input.invocationId,
				requestKey: input.requestKey,
				inputHash: input.inputHash,
			},
			ctx,
		);
		if (currentGate.kind === 'cancelled') return { kind: 'cancelled' };
		if (currentGate.kind === 'conflict') return { kind: 'conflict' };
		if (!existing) return { kind: 'conflict' };
		if (
			existing.projectId !== input.projectId ||
			existing.requestKey !== input.requestKey ||
			existing.invocationId !== input.invocationId ||
			existing.inputHash !== input.inputHash
		) {
			return { kind: 'conflict' };
		}
		return {
			kind: existing.id === input.id ? 'created' : 'duplicate',
			invocation: existing,
		};
	}

	async lookup(
		input: {
			projectId: string;
			invocationId: string;
			requestKey: string;
			inputHash: string;
		},
		ctx: OperationContext = {},
	) {
		const manager = this.table.managerFor(ctx);
		const byKey = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
			projectId: input.projectId,
			requestKey: input.requestKey,
		});
		const byId = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		if (!byKey && !byId) return { kind: 'absent' as const };
		const invocation = byKey ?? byId;
		if (
			!invocation ||
			byKey?.id !== byId?.id ||
			invocation.requestKey !== input.requestKey ||
			invocation.invocationId !== input.invocationId ||
			invocation.inputHash !== input.inputHash
		) {
			return { kind: 'conflict' as const };
		}
		if (
			invocation.state === 'reserved' ||
			invocation.state === 'unknown' ||
			(invocation.state === 'stopping' && invocation.safeErrorCode === 'enqueue_unknown')
		) {
			return { kind: 'unknown' as const };
		}
		return { kind: 'accepted' as const, ownerInvocationRef: invocation.id };
	}

	async findByRequestKey(projectId: string, requestKey: string, ctx: OperationContext = {}) {
		return await this.table.managerFor(ctx).findOneBy(AgentDepartmentMeetingInvocation, {
			projectId,
			requestKey,
		});
	}

	async findByInvocationId(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		return await this.table.managerFor(ctx).findOneBy(AgentDepartmentMeetingInvocation, {
			projectId,
			invocationId,
		});
	}

	async markAccepted(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		const manager = this.table.managerFor(ctx);
		const accepted = await manager.update(
			AgentDepartmentMeetingInvocation,
			{ projectId, invocationId, state: 'reserved' },
			{ state: 'accepted', sequence: '1', safeErrorCode: null },
		);
		if (accepted.affected === 1) return accepted;
		return await manager.update(
			AgentDepartmentMeetingInvocation,
			{ projectId, invocationId, state: 'unknown' },
			{ state: 'accepted', sequence: '2', safeErrorCode: null },
		);
	}

	async markUnknown(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		return await this.table
			.managerFor(ctx)
			.update(
				AgentDepartmentMeetingInvocation,
				{ projectId, invocationId, state: 'reserved' },
				{ state: 'unknown', sequence: '1', safeErrorCode: 'enqueue_unknown' },
			);
	}

	async markRunning(projectId: string, invocationId: string, ctx: OperationContext = {}) {
		return await this.table
			.managerFor(ctx)
			.update(
				AgentDepartmentMeetingInvocation,
				{ projectId, invocationId, state: 'accepted' },
				{ state: 'running', sequence: '3' },
			);
	}

	async requestStop(
		input: {
			projectId: string;
			invocationId: string;
			ownerInvocationRef: string;
			commandId: string;
			payloadHash: string;
		},
		ctx: OperationContext = {},
	) {
		const manager = this.table.managerFor(ctx);
		const invocation = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		if (!invocation || invocation.id !== input.ownerInvocationRef)
			return { kind: 'absent' as const };
		if (invocation.state === 'terminal') return { kind: 'terminal' as const, invocation };
		if (invocation.stopCommandId) {
			return invocation.stopCommandId === input.commandId &&
				invocation.stopPayloadHash === input.payloadHash
				? { kind: 'duplicate' as const, invocation }
				: { kind: 'conflict' as const };
		}
		if (invocation.state === 'reserved') {
			const updated = await manager.update(
				AgentDepartmentMeetingInvocation,
				{
					projectId: input.projectId,
					invocationId: input.invocationId,
					id: input.ownerInvocationRef,
					state: 'reserved',
				},
				{
					state: 'terminal',
					outcome: 'cancelled',
					sequence: '5',
					terminalAt: new Date(),
					safeErrorCode: 'cancelled_before_acceptance',
					stopCommandId: input.commandId,
					stopPayloadHash: input.payloadHash,
					stopRequestedAt: new Date(),
				},
			);
			if (updated.affected === 1) {
				const saved = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
					projectId: input.projectId,
					invocationId: input.invocationId,
				});
				return saved
					? { kind: 'terminal' as const, invocation: saved }
					: { kind: 'absent' as const };
			}
			const current = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
				projectId: input.projectId,
				invocationId: input.invocationId,
			});
			if (current?.state === 'terminal') return { kind: 'terminal' as const, invocation: current };
		}
		if (
			invocation.state !== 'accepted' &&
			invocation.state !== 'running' &&
			invocation.state !== 'unknown'
		) {
			return { kind: 'unavailable' as const };
		}
		const updated = await manager.update(
			AgentDepartmentMeetingInvocation,
			{
				projectId: input.projectId,
				invocationId: input.invocationId,
				id: input.ownerInvocationRef,
				state: invocation.state,
				stopCommandId: IsNull(),
			},
			{
				state: 'stopping',
				sequence: '4',
				stopCommandId: input.commandId,
				stopPayloadHash: input.payloadHash,
				stopRequestedAt: new Date(),
			},
		);
		if (updated.affected === 1) {
			const saved = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
				projectId: input.projectId,
				invocationId: input.invocationId,
			});
			return saved ? { kind: 'accepted' as const, invocation: saved } : { kind: 'absent' as const };
		}
		const current = await manager.findOneBy(AgentDepartmentMeetingInvocation, {
			projectId: input.projectId,
			invocationId: input.invocationId,
		});
		if (current?.state === 'terminal') return { kind: 'terminal' as const, invocation: current };
		return current?.stopCommandId === input.commandId &&
			current.stopPayloadHash === input.payloadHash
			? { kind: 'duplicate' as const, invocation: current }
			: { kind: 'conflict' as const };
	}

	async markTerminal(
		input: {
			projectId: string;
			invocationId: string;
			outcome: 'succeeded' | 'failed' | 'cancelled';
			resultText?: string;
			resultHash?: string;
			safeErrorCode?: string;
		},
		ctx: OperationContext = {},
	) {
		return await this.table.managerFor(ctx).update(
			AgentDepartmentMeetingInvocation,
			{
				projectId: input.projectId,
				invocationId: input.invocationId,
				state: In(['reserved', 'accepted', 'running', 'stopping', 'unknown']),
			},
			{
				state: 'terminal',
				outcome: input.outcome,
				sequence: '5',
				terminalAt: new Date(),
				resultText: input.resultText ?? null,
				resultHash: input.resultHash ?? null,
				safeErrorCode: input.safeErrorCode ?? null,
			},
		);
	}

	async findPendingStops(take: number) {
		return await this.table.find({
			where: { state: 'stopping' },
			order: { stopRequestedAt: 'ASC', invocationId: 'ASC' },
			take,
		});
	}

	async findUnresolvedEnqueues(take: number) {
		return await this.table.find({
			where: [
				{ state: 'reserved' },
				{ state: 'unknown' },
				{ state: 'stopping', safeErrorCode: 'enqueue_unknown' },
			],
			order: { createdAt: 'ASC', invocationId: 'ASC' },
			take,
		});
	}
}
