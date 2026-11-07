import type {
	AiDepartmentWorkflowCapabilitySnapshot,
	AiDepartmentAgentWorkAction,
	AiDepartmentAgentWorkResult,
	AiDepartmentAgentWorkToolResult,
	AiDepartmentAssignedWorkInbox,
	AiDepartmentAssignedWorkInboxQueryDto,
} from '@n8n/api-types';
import { Service } from '@n8n/di';
import type { RelatedAgentRun, WorkflowExecuteMode } from 'n8n-workflow';

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
	workflowIds: string[];
	workflowCapabilities: AiDepartmentWorkflowCapabilitySnapshot[];
	instruction: string;
	reviewPolicy: 'required' | 'automatic';
};

export type DepartmentDispatchResult =
	| { kind: 'accepted'; ownerExecutionRef: string }
	| { kind: 'rejected'; reason: string }
	| { kind: 'unknown' };

export type DepartmentDispatchLookup = DepartmentDispatchResult | { kind: 'absent' };

export type DepartmentExecutionSnapshot = {
	phase: 'active' | 'suspended' | 'stopping' | 'terminal' | 'unknown';
	sequence: string;
	result?: {
		outcome: 'succeeded' | 'failed' | 'cancelled';
		reference?: string;
		safeSummary?: string;
	};
};

export type DepartmentExecutionIdentity = {
	actorId: string;
	projectId: string;
	executorId: string;
	attemptId: string;
	ownerExecutionRef: string;
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
		reason: 'cancel' | 'handoff' | 'release' | 'authority-revoked';
		authorityContext:
			| { kind: 'user'; userId: string }
			| {
					kind: 'department-control-plane';
					commandId: string;
					reason: 'cancel' | 'handoff' | 'release' | 'authority-revoked';
			  };
	}): Promise<{
		status: 'accepted' | 'duplicate' | 'rejected' | 'unknown';
		acknowledged: boolean;
		confirmed: boolean;
	}>;
	abstract snapshot(input: {
		actorId: string;
		projectId: string;
		executorId: string;
		attemptId: string;
		ownerExecutionRef: string;
	}): Promise<DepartmentExecutionSnapshot>;
	abstract nativeToolApproval(
		input: DepartmentExecutionIdentity,
	): Promise<'pending' | 'not_pending' | 'unknown'>;
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

	async nativeToolApproval(input: DepartmentExecutionIdentity) {
		return await this.requireImplementation().nativeToolApproval(input);
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
	abstract executeToolAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		input: AiDepartmentAgentWorkAction,
	): Promise<AiDepartmentAgentWorkToolResult>;
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
	): Promise<AiDepartmentAgentWorkResult> {
		if (!this.implementation) throw new Error('Department work actions are unavailable.');
		return await this.implementation.executeAction(context, requestId, input);
	}
	async executeToolAction(
		context: DepartmentWorkRunContext,
		requestId: string,
		input: AiDepartmentAgentWorkAction,
	) {
		if (!this.implementation) throw new Error('Department work actions are unavailable.');
		return await this.implementation.executeToolAction(context, requestId, input);
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

export type DepartmentWorkflowInvocationAuthority = {
	projectId: string;
	executorId: string;
	attemptId: string;
};

export type DepartmentWorkflowInvocationRequest = {
	capabilityId: string;
	capabilityVersion: number;
	workflowId: string;
	requestId: string;
	inputHash: string;
	expectedWorkflowVersion: string;
};

export type DepartmentWorkflowInvocationReservation = {
	invocationId: string;
	ownerInvocationKey: string;
	inputsRef: string;
	duplicate: boolean;
};

export type DepartmentWorkflowDispatchRequest = {
	projectId: string;
	invocationId: string;
	ownerInvocationKey: string;
	inputsRef: string;
	inputHash: string;
	expectedWorkflowVersion: string;
	workflowId: string;
	executionMode: Extract<WorkflowExecuteMode, 'manual' | 'integrated'>;
	userId?: string;
	agentRun: RelatedAgentRun;
};

export abstract class DepartmentWorkflowInvocationInputs {
	abstract stage(input: {
		projectId: string;
		invocationId: string;
		inputsRef: string;
		inputHash: string;
		inputs: unknown;
	}): Promise<void>;
	abstract stageDispatch(input: {
		dispatchData: DepartmentWorkflowDispatchRequest;
	}): Promise<void>;
	abstract resolveDispatch(input: {
		projectId: string;
		invocationId: string;
		inputsRef?: string;
		inputHash: string;
	}): Promise<DepartmentWorkflowDispatchRequest>;
	abstract resolve(input: {
		projectId: string;
		invocationId: string;
		inputsRef: string;
		inputHash: string;
	}): Promise<unknown>;
}

@Service()
export class DepartmentWorkflowInvocationInputsProxy extends DepartmentWorkflowInvocationInputs {
	private implementation?: DepartmentWorkflowInvocationInputs;
	register(implementation: DepartmentWorkflowInvocationInputs) {
		this.implementation = implementation;
	}
	async stage(input: Parameters<DepartmentWorkflowInvocationInputs['stage']>[0]) {
		if (!this.implementation) throw new Error('Department workflow inputs are unavailable.');
		return await this.implementation.stage(input);
	}
	async resolve(input: Parameters<DepartmentWorkflowInvocationInputs['resolve']>[0]) {
		if (!this.implementation) throw new Error('Department workflow inputs are unavailable.');
		return await this.implementation.resolve(input);
	}
	async stageDispatch(input: Parameters<DepartmentWorkflowInvocationInputs['stageDispatch']>[0]) {
		if (!this.implementation) throw new Error('Department workflow inputs are unavailable.');
		return await this.implementation.stageDispatch(input);
	}
	async resolveDispatch(
		input: Parameters<DepartmentWorkflowInvocationInputs['resolveDispatch']>[0],
	) {
		if (!this.implementation) throw new Error('Department workflow inputs are unavailable.');
		return await this.implementation.resolveDispatch(input);
	}
}

export type DepartmentWorkflowChildState =
	| 'pending'
	| 'running'
	| 'waiting'
	| 'retrying'
	| 'succeeded'
	| 'failed'
	| 'cancelled'
	| 'unknown';

export type DepartmentWorkflowInvocationOwnerLookup =
	| {
			kind: 'accepted';
			ownerExecutionRef: string;
			actualWorkflowVersion: string;
			childState: Exclude<DepartmentWorkflowChildState, 'unknown'>;
	  }
	| { kind: 'absent' | 'unknown' };

export type DepartmentWorkflowInvocationOwnerSnapshot =
	| {
			kind: 'verified';
			ownerExecutionRef: string;
			actualWorkflowVersion: string;
			childState: Exclude<DepartmentWorkflowChildState, 'unknown'>;
	  }
	| { kind: 'unknown' };

export abstract class DepartmentWorkflowInvocationOwner {
	abstract lookup(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationKey: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<DepartmentWorkflowInvocationOwnerLookup>;
	async recover(_input: {
		projectId: string;
		invocationId: string;
		ownerInvocationKey: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<DepartmentWorkflowInvocationOwnerLookup> {
		return { kind: 'unknown' };
	}
	abstract snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<DepartmentWorkflowInvocationOwnerSnapshot>;
	abstract reconcileSnapshot(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
		knownChildState: DepartmentWorkflowChildState;
	}): Promise<void>;
	abstract requestStop(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		inputHash: string;
		expectedWorkflowVersion: string;
	}): Promise<void>;
}

@Service()
export class DepartmentWorkflowInvocationOwnerProxy extends DepartmentWorkflowInvocationOwner {
	private implementation?: DepartmentWorkflowInvocationOwner;

	register(implementation: DepartmentWorkflowInvocationOwner) {
		this.implementation = implementation;
	}

	async lookup(input: Parameters<DepartmentWorkflowInvocationOwner['lookup']>[0]) {
		if (!this.implementation) return { kind: 'unknown' } as const;
		return await this.implementation.lookup(input);
	}

	async recover(input: Parameters<DepartmentWorkflowInvocationOwner['recover']>[0]) {
		if (!this.implementation) return { kind: 'unknown' } as const;
		return await this.implementation.recover(input);
	}

	async requestStop(input: Parameters<DepartmentWorkflowInvocationOwner['requestStop']>[0]) {
		if (!this.implementation) throw new Error('Department workflow owner is unavailable.');
		return await this.implementation.requestStop(input);
	}

	async snapshot(input: Parameters<DepartmentWorkflowInvocationOwner['snapshot']>[0]) {
		if (!this.implementation) return { kind: 'unknown' } as const;
		return await this.implementation.snapshot(input);
	}

	async reconcileSnapshot(
		input: Parameters<DepartmentWorkflowInvocationOwner['reconcileSnapshot']>[0],
	) {
		if (!this.implementation) throw new Error('Department workflow owner is unavailable.');
		return await this.implementation.reconcileSnapshot(input);
	}
}

/** AI Department authorizes and records calls; Agents remains the workflow owner. */
export abstract class DepartmentWorkflowInvocation {
	abstract reserve(
		authority: DepartmentWorkflowInvocationAuthority,
		request: DepartmentWorkflowInvocationRequest,
	): Promise<DepartmentWorkflowInvocationReservation>;
	abstract accepted(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
		actualWorkflowVersion: string;
		childState: Exclude<DepartmentWorkflowChildState, 'unknown'>;
	}): Promise<void>;
	abstract unknown(input: { projectId: string; invocationId: string }): Promise<void>;
	abstract cancellationRequested(input: {
		projectId: string;
		invocationId: string;
		ownerExecutionRef: string;
	}): Promise<void>;
	abstract authorizeResultDelivery(input: {
		projectId: string;
		executorId: string;
		attemptId: string;
		invocationId: string;
		ownerExecutionRef: string;
	}): Promise<void>;
	abstract outcome(input: {
		projectId: string;
		invocationId: string;
		eventId: string;
		ownerSequence: string;
		occurredAt: string;
		retryOfExecutionRef?: string;
		childState:
			| 'pending'
			| 'running'
			| 'waiting'
			| 'retrying'
			| 'succeeded'
			| 'failed'
			| 'cancelled'
			| 'unknown';
		ownerExecutionRef: string;
		actualWorkflowVersion: string;
		safeResultReference?: string;
		safeErrorReference?: string;
	}): Promise<void>;
}

@Service()
export class DepartmentWorkflowInvocationProxy extends DepartmentWorkflowInvocation {
	private implementation?: DepartmentWorkflowInvocation;
	register(implementation: DepartmentWorkflowInvocation) {
		this.implementation = implementation;
	}
	private requireImplementation() {
		if (!this.implementation) throw new Error('Department workflow invocations are unavailable.');
		return this.implementation;
	}
	async reserve(
		authority: DepartmentWorkflowInvocationAuthority,
		request: DepartmentWorkflowInvocationRequest,
	) {
		return await this.requireImplementation().reserve(authority, request);
	}
	async accepted(input: Parameters<DepartmentWorkflowInvocation['accepted']>[0]) {
		return await this.requireImplementation().accepted(input);
	}
	async unknown(input: Parameters<DepartmentWorkflowInvocation['unknown']>[0]) {
		return await this.requireImplementation().unknown(input);
	}
	async cancellationRequested(
		input: Parameters<DepartmentWorkflowInvocation['cancellationRequested']>[0],
	) {
		return await this.requireImplementation().cancellationRequested(input);
	}
	async authorizeResultDelivery(
		input: Parameters<DepartmentWorkflowInvocation['authorizeResultDelivery']>[0],
	) {
		return await this.requireImplementation().authorizeResultDelivery(input);
	}
	async outcome(input: Parameters<DepartmentWorkflowInvocation['outcome']>[0]) {
		return await this.requireImplementation().outcome(input);
	}
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
