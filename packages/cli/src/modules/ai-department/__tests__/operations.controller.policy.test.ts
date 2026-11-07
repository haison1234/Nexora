import { ControllerRegistryMetadata } from '@n8n/decorators';
import { Container } from '@n8n/di';

import { AiDepartmentOperationsController } from '../operations.controller';

describe('AiDepartmentOperationsController route access scopes', () => {
	const { routes } = Container.get(ControllerRegistryMetadata).getControllerMetadata(
		AiDepartmentOperationsController as never,
	);

	it('requires project-scoped agent:read access for the operations snapshot', () => {
		expect(Array.from(routes.keys())).toEqual(['getSnapshot']);
		expect(routes.get('getSnapshot')?.accessScope).toEqual({
			scope: 'agent:read',
			globalOnly: false,
		});
		expect(routes.get('getSnapshot')?.skipAuth).not.toBe(true);
	});
});
