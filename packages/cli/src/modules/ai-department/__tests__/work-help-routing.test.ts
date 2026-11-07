import { routeWorkHelp, type WorkHelpRoutingMember } from '../work/work-help-routing';

const member = (id: string, expertiseTags: string[] = []): WorkHelpRoutingMember => ({
	id,
	projectId: 'project-1',
	departmentId: 'department-1',
	archived: false,
	expertiseTags,
	bindingAvailable: true,
	bindingVersion: 1,
});

const input = (overrides: Partial<Parameters<typeof routeWorkHelp>[0]> = {}) => ({
	projectId: 'project-1',
	departmentId: 'department-1',
	requesterMemberId: 'requester',
	managerMemberId: null,
	assignmentActorUserId: null,
	assignmentActorHasProjectAccess: false,
	expertiseTags: ['workflow', 'testing'],
	requestChainMemberIds: [],
	requestChainUserIds: [],
	members: [] as WorkHelpRoutingMember[],
	...overrides,
});

describe('routeWorkHelp', () => {
	it('selects the member with the most matching expertise tags', () => {
		const result = routeWorkHelp(
			input({
				members: [member('one', ['workflow']), member('two', ['workflow', 'testing'])],
			}),
		);

		expect(result).toMatchObject({
			state: 'specialist',
			recipientMemberId: 'two',
			matchedTagCount: 2,
		});
	});

	it('uses a stable member ID to break expertise ties', () => {
		const result = routeWorkHelp(
			input({ members: [member('member-b', ['workflow']), member('member-a', ['workflow'])] }),
		);

		expect(result.recipientMemberId).toBe('member-a');
	});

	it('excludes the requester, request-chain members, other departments, archived members, and unavailable bindings', () => {
		const requester = member('requester', ['workflow']);
		const chained = member('chained', ['workflow']);
		const otherDepartment = { ...member('other-department', ['workflow']), departmentId: 'other' };
		const otherProject = { ...member('other-project', ['workflow']), projectId: 'other' };
		const archived = { ...member('archived', ['workflow']), archived: true };
		const unavailable = { ...member('unavailable', ['workflow']), bindingAvailable: false };
		const result = routeWorkHelp(
			input({
				requestChainMemberIds: ['chained'],
				members: [requester, chained, otherDepartment, otherProject, archived, unavailable],
			}),
		);

		expect(result.state).toBe('unresolved');
	});

	it('uses an eligible manager when no specialist matches', () => {
		const result = routeWorkHelp(
			input({ managerMemberId: 'manager', members: [member('manager')] }),
		);

		expect(result).toMatchObject({ state: 'manager_fallback', recipientMemberId: 'manager' });
	});

	it('uses the assignment actor only when current project access is confirmed', () => {
		const routed = routeWorkHelp(
			input({ assignmentActorUserId: 'user-1', assignmentActorHasProjectAccess: true }),
		);
		const unresolved = routeWorkHelp(
			input({ assignmentActorUserId: 'user-1', assignmentActorHasProjectAccess: false }),
		);

		expect(routed).toMatchObject({
			state: 'assignment_actor_fallback',
			recipientUserId: 'user-1',
		});
		expect(unresolved.state).toBe('unresolved');
	});

	it('does not select an assignment actor already present in the request chain', () => {
		const result = routeWorkHelp(
			input({
				assignmentActorUserId: 'user-1',
				assignmentActorHasProjectAccess: true,
				requestChainUserIds: ['user-1'],
			}),
		);

		expect(result.state).toBe('unresolved');
	});
});
