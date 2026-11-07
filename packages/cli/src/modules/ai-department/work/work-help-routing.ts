export type WorkHelpRoutingMember = {
	id: string;
	projectId: string;
	departmentId: string;
	archived: boolean;
	expertiseTags: readonly string[];
	bindingAvailable: boolean;
	bindingVersion: number;
};

export type WorkHelpRoutingInput = {
	projectId: string;
	departmentId: string;
	requesterMemberId: string;
	managerMemberId: string | null;
	assignmentActorUserId: string | null;
	assignmentActorHasProjectAccess: boolean;
	expertiseTags: readonly string[];
	requestChainMemberIds: readonly string[];
	requestChainUserIds: readonly string[];
	members: readonly WorkHelpRoutingMember[];
};

export type WorkHelpRoutingResult = {
	state: 'specialist' | 'manager_fallback' | 'assignment_actor_fallback' | 'unresolved';
	recipientMemberId: string | null;
	recipientUserId: string | null;
	matchedTagCount: number;
	bindingVersion: number | null;
};

function isEligibleMember(member: WorkHelpRoutingMember, input: WorkHelpRoutingInput) {
	return (
		member.projectId === input.projectId &&
		member.departmentId === input.departmentId &&
		!member.archived &&
		member.bindingAvailable &&
		member.id !== input.requesterMemberId &&
		!input.requestChainMemberIds.includes(member.id)
	);
}

export function routeWorkHelp(input: WorkHelpRoutingInput): WorkHelpRoutingResult {
	const requestedTags = new Set(input.expertiseTags.map((tag) => tag.trim().toLowerCase()));
	const specialists = input.members
		.filter((member) => isEligibleMember(member, input))
		.map((member) => ({
			member,
			matchedTagCount: member.expertiseTags.filter((tag) =>
				requestedTags.has(tag.trim().toLowerCase()),
			).length,
		}))
		.filter(({ matchedTagCount }) => matchedTagCount > 0)
		.sort((a, b) => {
			if (a.matchedTagCount !== b.matchedTagCount) return b.matchedTagCount - a.matchedTagCount;
			return a.member.id < b.member.id ? -1 : a.member.id > b.member.id ? 1 : 0;
		});
	const specialist = specialists[0];
	if (specialist) {
		return {
			state: 'specialist',
			recipientMemberId: specialist.member.id,
			recipientUserId: null,
			matchedTagCount: specialist.matchedTagCount,
			bindingVersion: specialist.member.bindingVersion,
		};
	}

	const manager = input.managerMemberId
		? input.members.find(
				(member) => member.id === input.managerMemberId && isEligibleMember(member, input),
			)
		: null;
	if (manager) {
		return {
			state: 'manager_fallback',
			recipientMemberId: manager.id,
			recipientUserId: null,
			matchedTagCount: 0,
			bindingVersion: manager.bindingVersion,
		};
	}

	if (
		input.assignmentActorUserId &&
		input.assignmentActorHasProjectAccess &&
		!input.requestChainUserIds.includes(input.assignmentActorUserId)
	) {
		return {
			state: 'assignment_actor_fallback',
			recipientMemberId: null,
			recipientUserId: input.assignmentActorUserId,
			matchedTagCount: 0,
			bindingVersion: null,
		};
	}

	return {
		state: 'unresolved',
		recipientMemberId: null,
		recipientUserId: null,
		matchedTagCount: 0,
		bindingVersion: null,
	};
}
