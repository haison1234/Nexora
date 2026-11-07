import { Service } from '@n8n/di';
import { createHash } from 'node:crypto';

export type DepartmentConsultationToolPolicy = {
	mode: 'none';
	policyVersion: string;
};

export type DepartmentConsultationResolvedContext = {
	contextHash: string;
	inputText: string;
};

/** AI Department resolves the current, authorized help request context. */
export abstract class DepartmentConsultationContextReader {
	abstract resolve(input: {
		projectId: string;
		departmentId: string;
		helpRequestId: string;
		requesterMemberId: string;
		recipientMemberId: string;
		actorId: string;
		contextRef: string;
	}): Promise<DepartmentConsultationResolvedContext | null>;
}

@Service()
export class DepartmentConsultationContextReaderProxy extends DepartmentConsultationContextReader {
	private implementation?: DepartmentConsultationContextReader;

	register(implementation: DepartmentConsultationContextReader) {
		this.implementation = implementation;
	}

	async resolve(
		input: Parameters<DepartmentConsultationContextReader['resolve']>[0],
	): Promise<DepartmentConsultationResolvedContext | null> {
		return (await this.implementation?.resolve(input)) ?? null;
	}
}

export type DepartmentConsultationInvocationRequest = {
	schemaVersion: 1;
	projectId: string;
	departmentId: string;
	helpRequestId: string;
	invocationId: string;
	sourceAttemptId: string;
	requesterMemberId: string;
	recipientMemberId: string;
	actorId: string;
	executorId: string;
	bindingVersion: number;
	commandKey: string;
	expectedInputHash: string;
	contextRef: string;
	contextHash: string;
	/** Set by the owner after resolving contextRef. Callers must not supply it. */
	inputText?: string;
	deadlineAt: string;
	maxOutputChars: number;
	maxOutputTokens: number;
	toolPolicy: DepartmentConsultationToolPolicy;
};

export function hashDepartmentConsultationRequest(
	request: Omit<DepartmentConsultationInvocationRequest, 'expectedInputHash'>,
) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				request.schemaVersion,
				request.projectId,
				request.departmentId,
				request.helpRequestId,
				request.invocationId,
				request.sourceAttemptId,
				request.requesterMemberId,
				request.recipientMemberId,
				request.actorId,
				request.executorId,
				request.bindingVersion,
				request.commandKey,
				request.contextRef,
				request.contextHash,
				request.deadlineAt,
				request.maxOutputChars,
				request.maxOutputTokens,
				request.toolPolicy,
			]),
		)
		.digest('hex');
}

export type DepartmentConsultationResolution = {
	available: boolean;
	canStart: boolean;
};

/** AI Department confirms the recipient's current member binding. */
export abstract class DepartmentConsultationBindingVerifier {
	abstract isCurrentBinding(input: {
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<boolean>;
}

@Service()
export class DepartmentConsultationBindingVerifierProxy extends DepartmentConsultationBindingVerifier {
	private implementation?: DepartmentConsultationBindingVerifier;

	register(implementation: DepartmentConsultationBindingVerifier) {
		this.implementation = implementation;
	}

	async isCurrentBinding(
		input: Parameters<DepartmentConsultationBindingVerifier['isCurrentBinding']>[0],
	): Promise<boolean> {
		return (await this.implementation?.isCurrentBinding(input)) ?? false;
	}
}

export type DepartmentConsultationDispatchResult =
	| { kind: 'accepted'; ownerInvocationRef: string }
	| { kind: 'rejected'; code: 'access' | 'binding' | 'tools' | 'unavailable' | 'cancelled' }
	| { kind: 'unknown' };

export type DepartmentConsultationLookupResult =
	| { kind: 'accepted'; ownerInvocationRef: string }
	| { kind: 'absent' }
	| { kind: 'conflict' }
	| { kind: 'unknown' };

export type DepartmentConsultationOwnerSnapshot = {
	ownerInvocationRef: string;
	sequence: string;
	phase: 'queued' | 'running' | 'stopping' | 'terminal' | 'unknown';
	outcome?: 'succeeded' | 'failed' | 'cancelled';
	safeErrorCode?: string;
	terminalAt?: string;
};

export type DepartmentConsultationResult = {
	invocationId: string;
	helpRequestId: string;
	ownerInvocationRef: string;
	sequence: string;
	resultHash: string;
	contextHash: string;
	answer: string;
};

export function parseDepartmentConsultationAnswer(text: string): string | null {
	const answer = text.trim();
	if (!answer || Array.from(answer).length > 4_000) return null;
	return answer;
}

/** Agents owns consultation authorization, execution, stop, result, and recovery. */
export abstract class DepartmentConsultationInvocationOwner {
	abstract resolve(input: {
		actorId: string;
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentConsultationResolution>;

	abstract invoke(
		request: DepartmentConsultationInvocationRequest,
	): Promise<DepartmentConsultationDispatchResult>;

	abstract lookup(input: {
		projectId: string;
		invocationId: string;
		commandKey: string;
		expectedInputHash: string;
	}): Promise<DepartmentConsultationLookupResult>;

	abstract snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
	}): Promise<DepartmentConsultationOwnerSnapshot>;

	abstract readResult(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
		expectedInputHash: string;
	}): Promise<DepartmentConsultationResult | null>;

	abstract requestStop(input: {
		projectId: string;
		invocationId: string;
		actorId: string;
		commandKey: string;
		expectedInputHash: string;
		ownerInvocationRef?: string;
		commandId: string;
	}): Promise<{ acknowledged: boolean; confirmedTerminal: boolean }>;
}

@Service()
export class DepartmentConsultationInvocationOwnerProxy extends DepartmentConsultationInvocationOwner {
	private implementation?: DepartmentConsultationInvocationOwner;

	register(implementation: DepartmentConsultationInvocationOwner) {
		this.implementation = implementation;
	}

	async resolve(
		input: Parameters<DepartmentConsultationInvocationOwner['resolve']>[0],
	): Promise<DepartmentConsultationResolution> {
		return (await this.implementation?.resolve(input)) ?? { available: false, canStart: false };
	}

	async invoke(request: DepartmentConsultationInvocationRequest) {
		return (await this.implementation?.invoke(request)) ?? { kind: 'unknown' as const };
	}

	async lookup(input: Parameters<DepartmentConsultationInvocationOwner['lookup']>[0]) {
		return (await this.implementation?.lookup(input)) ?? { kind: 'unknown' as const };
	}

	async snapshot(input: Parameters<DepartmentConsultationInvocationOwner['snapshot']>[0]) {
		return (
			(await this.implementation?.snapshot(input)) ?? {
				ownerInvocationRef: input.ownerInvocationRef,
				sequence: '0',
				phase: 'unknown' as const,
			}
		);
	}

	async readResult(input: Parameters<DepartmentConsultationInvocationOwner['readResult']>[0]) {
		return (await this.implementation?.readResult(input)) ?? null;
	}

	async requestStop(input: Parameters<DepartmentConsultationInvocationOwner['requestStop']>[0]) {
		return (
			(await this.implementation?.requestStop(input)) ?? {
				acknowledged: false,
				confirmedTerminal: false,
			}
		);
	}
}
