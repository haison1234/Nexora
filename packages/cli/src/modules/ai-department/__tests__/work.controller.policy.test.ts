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
			createWork: 'agent:create',
			getWork: 'agent:read',
			listActivity: 'agent:read',
			listRelationships: 'agent:list',
			createRelationship: 'agent:update',
			deleteRelationship: 'agent:update',
			updateWork: 'agent:update',
			markReady: 'agent:update',
			startWork: 'agent:update',
			retryWork: 'agent:update',
			cancelWork: 'agent:update',
			reviewWork: 'agent:update',
			getWorkHistory: 'agent:read',
			listAttempts: 'agent:read',
		} as const;

		expect(Array.from(routes.keys()).sort()).toEqual(Object.keys(expectedScopes).sort());
		for (const [handler, scope] of Object.entries(expectedScopes)) {
			expect(routes.get(handler)?.accessScope).toEqual({ scope, globalOnly: false });
			expect(routes.get(handler)?.skipAuth).not.toBe(true);
		}
	});
});
