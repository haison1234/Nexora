import { ControllerRegistryMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';

import { WorkController } from '../work/work.controller';

describe('WorkController route access scopes', () => {
	const { routes } = Container.get(ControllerRegistryMetadata).getControllerMetadata(
		WorkController as never,
	);

	it('gates every route with the matching project-scoped agent permission', () => {
		const expectedScopes = {
			listGoals: 'agent:list',
			getGoal: 'agent:read',
			createGoal: 'agent:create',
			updateGoal: 'agent:update',
			listWork: 'agent:list',
			listDepartmentActivity: 'agent:read',
			createWork: 'agent:create',
			getWork: 'agent:read',
			getCurrentClaim: 'agent:read',
			getWakeStatus: 'agent:read',
			listActivity: 'agent:read',
			addWorkActivity: 'agent:update',
			listRelationships: 'agent:list',
			createRelationship: 'agent:update',
			deleteRelationship: 'agent:update',
			updateWork: 'agent:update',
			markReady: 'agent:update',
			startWork: 'agent:update',
			retryWork: 'agent:update',
			cancelWork: 'agent:update',
			reviewWork: 'agent:update',
			reopenReview: 'agent:update',
			getWorkHistory: 'agent:read',
			listReviewDecisions: 'agent:read',
			listAttempts: 'agent:read',
			listToolApprovalAttention: 'agent:read',
			listHelpRequestsAttention: 'agent:read',
			listHelpRequests: 'agent:read',
			answerHelpRequest: 'agent:update',
		} as const;

		expect(Array.from(routes.keys()).sort()).toEqual(Object.keys(expectedScopes).sort());
		for (const [handler, scope] of Object.entries(expectedScopes)) {
			expect(routes.get(handler)?.accessScope).toEqual({ scope, globalOnly: false });
			expect(routes.get(handler)?.skipAuth).not.toBe(true);
		}
	});
});
