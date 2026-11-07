import { ControllerRegistryMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';

import { MeetingController } from '../meeting.controller';

describe('MeetingController route access scopes', () => {
	const { routes } = Container.get(ControllerRegistryMetadata).getControllerMetadata(
		MeetingController as never,
	);

	it('gates every route with a project-scoped agent permission', () => {
		const expectedScopes = {
			list: 'agent:list',
			create: 'agent:create',
			commandStatus: 'agent:read',
			get: 'agent:read',
			update: 'agent:update',
			start: 'agent:execute',
			cancel: 'agent:update',
			retryParticipant: 'agent:update',
			retrySynthesis: 'agent:update',
			excludeParticipant: 'agent:update',
			takeover: 'agent:execute',
			convertActionItem: 'agent:create',
			saveMinutes: 'agent:update',
			approveMinutes: 'agent:update',
			approveActionItem: 'agent:update',
			declineActionItem: 'agent:update',
		} as const;

		expect(Array.from(routes.keys()).sort()).toEqual(Object.keys(expectedScopes).sort());
		for (const [handler, scope] of Object.entries(expectedScopes)) {
			expect(routes.get(handler)?.accessScope).toEqual({ scope, globalOnly: false });
			expect(routes.get(handler)?.skipAuth).not.toBe(true);
		}
	});
});
