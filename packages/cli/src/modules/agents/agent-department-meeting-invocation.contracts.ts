import { Service } from '@n8n/di';
import type { AiDepartmentMeetingStructuredContribution } from '@n8n/api-types';
import {
	AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS,
	aiDepartmentMeetingStructuredContributionSchema,
} from '@n8n/api-types';
import { createHash } from 'node:crypto';

export type DepartmentMeetingToolPolicy =
	| { mode: 'supplied-material-only' }
	| { mode: 'verified-read-only'; toolIds: string[]; policyVersion: string };

export type DepartmentMeetingResolvedContext = {
	contextHash: string;
	inputText: string;
};

/** AI Department resolves a frozen, currently authorized meeting context. */
export abstract class DepartmentMeetingContextReader {
	abstract resolve(input: {
		projectId: string;
		departmentId: string;
		meetingId: string;
		participantId: string;
		actorId: string;
		contextRef: string;
		round: 'contribution' | 'synthesis';
	}): Promise<DepartmentMeetingResolvedContext | null>;
}

@Service()
export class DepartmentMeetingContextReaderProxy extends DepartmentMeetingContextReader {
	private implementation?: DepartmentMeetingContextReader;

	register(implementation: DepartmentMeetingContextReader) {
		this.implementation = implementation;
	}

	async resolve(
		input: Parameters<DepartmentMeetingContextReader['resolve']>[0],
	): Promise<DepartmentMeetingResolvedContext | null> {
		return (await this.implementation?.resolve(input)) ?? null;
	}
}

/** One isolated Agent call for a meeting participant or synthesis round. */
export type DepartmentMeetingInvocationRequest = {
	schemaVersion: 1;
	projectId: string;
	departmentId: string;
	meetingId: string;
	participantId: string;
	invocationId: string;
	round: 'contribution' | 'synthesis';
	actorId: string;
	memberId: string;
	executorId: string;
	bindingVersion: number;
	requestKey: string;
	expectedInputHash: string;
	contextRef: string;
	/** Bounded, owner-resolved input material for this one model turn. */
	inputText: string;
	maxOutputChars: number;
	maxOutputTokens: number;
	toolPolicy: DepartmentMeetingToolPolicy;
	deadlineAt: string;
};

/** Hash every field that changes the Agent call, with tool IDs in stable order. */
export function hashDepartmentMeetingInvocationRequest(
	request: Omit<DepartmentMeetingInvocationRequest, 'expectedInputHash'>,
) {
	const toolPolicy =
		request.toolPolicy.mode === 'verified-read-only'
			? {
					mode: request.toolPolicy.mode,
					toolIds: [...request.toolPolicy.toolIds].sort(),
					policyVersion: request.toolPolicy.policyVersion,
				}
			: { mode: request.toolPolicy.mode };
	return createHash('sha256')
		.update(
			JSON.stringify([
				request.schemaVersion,
				request.projectId,
				request.departmentId,
				request.meetingId,
				request.participantId,
				request.invocationId,
				request.round,
				request.actorId,
				request.memberId,
				request.executorId,
				request.bindingVersion,
				request.requestKey,
				request.contextRef,
				// The owner resolves inputText from contextRef. Caller text is never identity.
				request.maxOutputChars,
				request.maxOutputTokens,
				toolPolicy,
				request.deadlineAt,
			]),
		)
		.digest('hex');
}

export type DepartmentMeetingInvocationResolution = {
	available: boolean;
	canStart: boolean;
	canStop: boolean;
};

/** AI Department verifies its member-to-executor binding for the Agents owner. */
export abstract class DepartmentMeetingBindingVerifier {
	abstract isCurrentBinding(input: {
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<boolean>;
}

@Service()
export class DepartmentMeetingBindingVerifierProxy extends DepartmentMeetingBindingVerifier {
	private implementation?: DepartmentMeetingBindingVerifier;

	register(implementation: DepartmentMeetingBindingVerifier) {
		this.implementation = implementation;
	}

	async isCurrentBinding(
		input: Parameters<DepartmentMeetingBindingVerifier['isCurrentBinding']>[0],
	): Promise<boolean> {
		return (await this.implementation?.isCurrentBinding(input)) ?? false;
	}
}

export type DepartmentMeetingDispatchResult =
	| { kind: 'accepted'; ownerInvocationRef: string }
	| { kind: 'rejected'; code: 'access' | 'binding' | 'tools' | 'unavailable' | 'cancelled' }
	| { kind: 'unknown' };

export type DepartmentMeetingLookupResult =
	| { kind: 'accepted'; ownerInvocationRef: string }
	| { kind: 'absent' }
	| { kind: 'conflict' }
	| { kind: 'unknown' };

export type DepartmentMeetingOwnerSnapshot = {
	ownerInvocationRef: string;
	sequence: string;
	phase: 'queued' | 'running' | 'stopping' | 'terminal' | 'unknown';
	outcome?: 'succeeded' | 'failed' | 'cancelled';
	safeErrorCode?: string;
	terminalAt?: string;
};

export type DepartmentMeetingContributionResult = {
	invocationId: string;
	participantId: string;
	ownerInvocationRef: string;
	sequence: string;
	resultHash: string;
} & (
	| { round: 'contribution'; contribution: AiDepartmentMeetingStructuredContribution }
	| { round: 'synthesis'; text: string }
);

export function parseDepartmentMeetingResult(
	round: DepartmentMeetingInvocationRequest['round'],
	text: string,
):
	| { round: 'contribution'; contribution: AiDepartmentMeetingStructuredContribution }
	| { round: 'synthesis'; text: string }
	| null {
	if (Array.from(text).length > AI_DEPARTMENT_MEETING_MAX_CONTRIBUTION_CHARS) return null;
	if (round === 'synthesis') return { round, text };
	try {
		const parsed: unknown = JSON.parse(text);
		const contribution = aiDepartmentMeetingStructuredContributionSchema.safeParse(parsed);
		return contribution.success ? { round, contribution: contribution.data } : null;
	} catch {
		return null;
	}
}

/** Agents owns authorization, dispatch, runtime isolation, result delivery, and stop proof. */
export abstract class DepartmentMeetingInvocationOwner {
	abstract resolve(input: {
		actorId: string;
		projectId: string;
		departmentId: string;
		memberId: string;
		executorId: string;
		bindingVersion: number;
	}): Promise<DepartmentMeetingInvocationResolution>;

	abstract dispatch(
		request: DepartmentMeetingInvocationRequest,
	): Promise<DepartmentMeetingDispatchResult>;

	abstract lookup(input: {
		projectId: string;
		invocationId: string;
		requestKey: string;
		expectedInputHash: string;
	}): Promise<DepartmentMeetingLookupResult>;

	abstract snapshot(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
	}): Promise<DepartmentMeetingOwnerSnapshot>;

	abstract readResult(input: {
		projectId: string;
		invocationId: string;
		ownerInvocationRef: string;
		expectedInputHash: string;
	}): Promise<DepartmentMeetingContributionResult | null>;

	abstract requestStop(input: {
		projectId: string;
		invocationId: string;
		actorId: string;
		requestKey: string;
		expectedInputHash: string;
		ownerInvocationRef?: string;
		commandId: string;
	}): Promise<{ acknowledged: boolean; confirmedTerminal: boolean }>;
}

/** Keeps the AI Department dependent on the Agents contract, not its runtime tables. */
@Service()
export class DepartmentMeetingInvocationOwnerProxy extends DepartmentMeetingInvocationOwner {
	private implementation?: DepartmentMeetingInvocationOwner;

	register(implementation: DepartmentMeetingInvocationOwner) {
		this.implementation = implementation;
	}

	private getImplementation() {
		return this.implementation;
	}

	isRegistered() {
		return this.implementation !== undefined;
	}

	async resolve(
		input: Parameters<DepartmentMeetingInvocationOwner['resolve']>[0],
	): Promise<DepartmentMeetingInvocationResolution> {
		return (
			(await this.getImplementation()?.resolve(input)) ?? {
				available: false,
				canStart: false,
				canStop: false,
			}
		);
	}

	async dispatch(
		request: DepartmentMeetingInvocationRequest,
	): Promise<DepartmentMeetingDispatchResult> {
		return (
			(await this.getImplementation()?.dispatch(request)) ?? {
				kind: 'rejected',
				code: 'unavailable',
			}
		);
	}

	async lookup(
		input: Parameters<DepartmentMeetingInvocationOwner['lookup']>[0],
	): Promise<DepartmentMeetingLookupResult> {
		return (await this.getImplementation()?.lookup(input)) ?? { kind: 'unknown' };
	}

	async snapshot(
		input: Parameters<DepartmentMeetingInvocationOwner['snapshot']>[0],
	): Promise<DepartmentMeetingOwnerSnapshot> {
		return (
			(await this.getImplementation()?.snapshot(input)) ?? {
				ownerInvocationRef: input.ownerInvocationRef,
				sequence: '0',
				phase: 'unknown',
			}
		);
	}

	async readResult(
		input: Parameters<DepartmentMeetingInvocationOwner['readResult']>[0],
	): Promise<DepartmentMeetingContributionResult | null> {
		return (await this.getImplementation()?.readResult(input)) ?? null;
	}

	async requestStop(
		input: Parameters<DepartmentMeetingInvocationOwner['requestStop']>[0],
	): Promise<{ acknowledged: boolean; confirmedTerminal: boolean }> {
		return (
			(await this.getImplementation()?.requestStop(input)) ?? {
				acknowledged: false,
				confirmedTerminal: false,
			}
		);
	}
}
