import type {
	AiDepartmentAgentWorkAction,
	AiDepartmentAgentWorkResult,
	AiDepartmentAssignedWorkInbox,
	AiDepartmentAssignedWorkInboxQueryDto,
} from '@n8n/api-types';
import { Service } from '@n8n/di';

export type DepartmentExecutorStatus = 'available' | 'unavailable';

export type DepartmentExecutorResolution = {
	status: DepartmentExecutorStatus;
	provider: string;
	executorId: string;
	bindingVersion: number;
	canStart: boolean;
	canStop: boolean;
	authorized: boolean;
};

export type DepartmentAttemptContext = {
	actorId: string;
	projectId: string;
	departmentId: string;
	workId: string;
	attemptId: string;
	memberId: string;
	executorId: string;
	bindingVersion: number;
	dispatchKey: string;
	instruction: string;
	reviewPolicy: 'required' | 'automatic';
};

export type DepartmentDispatchResult =
	| { kind: 'accepted'; ownerExecutionRef: string }
	| { kind: 'rejected'; reason: string }
	| { kind: 'unknown' };

export type DepartmentDispatchLookup = DepartmentDispatchResult | { kind: 'absent' };

export type DepartmentExecutionSnapshot = {
	phase: 'active' | 'suspended' | 'terminal' | 'unknown';
	sequence: string;
	result?: {
		outcome: 'succeeded' | 'failed' | 'cancelled';
		reference?: string;
		safeSummary?: string;
	};
};

/** Agents owns execution access, queue acceptance, and cancellation. */
export abstract class DepartmentExecutor {
	abstract resolve(input: {
		actorId: string;
		projectId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentExecutorResolution>;
	abstract verifyRun(input: {
		projectId: string;
		actorId: string;
		executorId: string;
		attemptId: string;
		dispatchKey: string;
		executionId: string;
	}): Promise<boolean>;
	abstract isRunStopped(executionId: string): Promise<boolean>;
	abstract dispatch(context: DepartmentAttemptContext): Promise<DepartmentDispatchResult>;
	abstract lookup(
		context: Pick<
			DepartmentAttemptContext,
			'actorId' | 'projectId' | 'executorId' | 'attemptId' | 'dispatchKey'
		>,
	): Promise<DepartmentDispatchLookup>;
	abstract requestStop(input: {
		actorId: string;
		projectId: string;
		executorId: string;
		attemptId: string;
		ownerExecutionRef: string;
		commandId: string;
	}): Promise<{ acknowledged: boolean; confirmed: boolean }>;
	abstract snapshot(input: {
		actorId: string;
		projectId: string;
		executorId: string;
		attemptId: string;
		ownerExecutionRef: string;
	}): Promise<DepartmentExecutionSnapshot>;
}

@Service()
export class DepartmentExecutorProxy extends DepartmentExecutor {
	private implementation?: DepartmentExecutor;

	register(implementation: DepartmentExecutor) {
		this.implementation = implementation;
	}

	isRegistered() {
		return this.implementation !== undefined;
	}

	private requireImplementation() {
		if (!this.implementation) throw new Error('Department executor is unavailable.');
		return this.implementation;
	}

	async resolve(input: Parameters<DepartmentExecutor['resolve']>[0]) {
		return await this.requireImplementation().resolve(input);
	}

	async verifyRun(input: Parameters<DepartmentExecutor['verifyRun']>[0]) {
		return await this.requireImplementation().verifyRun(input);
	}
	async isRunStopped(executionId: string) {
		return await this.requireImplementation().isRunStopped(executionId);
	}
	async dispatch(context: DepartmentAttemptContext) {
		return await this.requireImplementation().dispatch(context);
	}

	async lookup(context: Parameters<DepartmentExecutor['lookup']>[0]) {
		return await this.requireImplementation().lookup(context);
	}

	async requestStop(input: Parameters<DepartmentExecutor['requestStop']>[0]) {
		return await this.requireImplementation().requestStop(input);
	}

	async snapshot(input: Parameters<DepartmentExecutor['snapshot']>[0]) {
		return await this.requireImplementation().snapshot(input);
	}
}

export type DepartmentWorkRunContext = {
	projectId: string;
	executorId: string;
	attemptId: string;
	executionId: string;
};

export abstract class DepartmentWorkActions {
	abstract executeAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		input: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkResult>;
}

@Service()
export class DepartmentWorkActionsProxy extends DepartmentWorkActions {
	private implementation?: DepartmentWorkActions;
	register(implementation: DepartmentWorkActions) {
		this.implementation = implementation;
	}
	async executeAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		input: AiDepartmentAgentWorkAction,
	) {
		if (!this.implementation) throw new Error('Department work actions are unavailable.');
		return await this.implementation.executeAction(context, requestId, input);
	}
}

export type DepartmentInboxAuthority = {
	projectId: string;
	actorId: string;
	memberId: string;
	executorId: string;
	bindingVersion: number;
};

/** AI Department owns eligible work. Agents supplies verified lane authority. */
export abstract class DepartmentWorkInbox {
	abstract listAssigned(
		authority: DepartmentInboxAuthority,
		query: AiDepartmentAssignedWorkInboxQueryDto,
	): Promise<AiDepartmentAssignedWorkInbox>;
}

@Service()
export class DepartmentWorkInboxProxy extends DepartmentWorkInbox {
	private implementation?: DepartmentWorkInbox;
	register(implementation: DepartmentWorkInbox) {
		this.implementation = implementation;
	}
	async listAssigned(
		authority: DepartmentInboxAuthority,
		query: AiDepartmentAssignedWorkInboxQueryDto,
	) {
		if (!this.implementation) throw new Error('Department work inbox is unavailable.');
		return await this.implementation.listAssigned(authority, query);
	}
}
