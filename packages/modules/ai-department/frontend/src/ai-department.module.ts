import { capabilities, capabilityRegistry, defineFrontendModule } from '@n8n/frontend-module-sdk';
import { VIEWS } from '@n8n/frontend-constants/views';
import { getResourcePermissions } from '@n8n/permissions';
import { AI_DEPARTMENT_HOME_VIEW } from './ai-department.constants';

const AiDepartmentHomeView = async () => await import('./views/AiDepartmentHomeView.vue');

function canReadDepartment(projectId: string | undefined): boolean {
	if (!projectId) return false;
	const permissions = capabilityRegistry.use(capabilities.projectPermissions);
	const agent = getResourcePermissions(permissions.scopesFor(projectId)).agent;
	return Boolean(agent?.list);
}

/**
 * Keep this file import-light: types and the SDK only. Views load lazily
 * (`const View = async () => await import('./views/X.vue')`), and stores are
 * referenced inside route guards or handlers, never at module scope — a
 * top-level store import pulls the whole module in even when it is disabled.
 */
export const AiDepartmentModule = defineFrontendModule({
	// Must match the backend module id: both gate off `/rest/module-settings`.
	id: 'ai-department',
	name: 'AI Department',
	description: 'Organize department members and work in this project',
	icon: 'users',
	routes: [
		{
			name: AI_DEPARTMENT_HOME_VIEW,
			path: 'ai-department',
			component: AiDepartmentHomeView,
			meta: { projectRoute: true, middleware: ['authenticated', 'custom'] },
			beforeEnter: (to) =>
				canReadDepartment(
					typeof to.params.projectId === 'string' ? to.params.projectId : undefined,
				) || {
					name: VIEWS.PROJECTS_WORKFLOWS,
					params: { projectId: to.params.projectId },
				},
		},
	],
	projectTabs: {
		project: [
			{
				label: 'AI Department',
				value: AI_DEPARTMENT_HOME_VIEW,
				insertAfter: VIEWS.PROJECTS_WORKFLOWS,
				dynamicRoute: { name: AI_DEPARTMENT_HOME_VIEW, includeProjectId: true },
				available: canReadDepartment,
			},
		],
	},

	// The shell reads the fields below. Uncomment what this module contributes.
	//
	// routes: [ /* RouteRecordRaw[]; components must be lazy */ ],
	// projectTabs: { overview: [], project: [], shared: [] },
	// resources: [ /* ResourceMetadata[]; feeds ResourcesListLayout */ ],
	// modals: [ /* ModalDefinition[]; rendered by DynamicModalLoader */ ],
	// adHocModalKeyPrefixes: [ /* prefixes for modal keys minted at runtime */ ],
	// settingsPages: [ /* IMenuItem[]; feeds SettingsSidebar */ ],
	// pushHandlers: { /* keyed by push message type */ },
	// commands: [ /* CommandBarEntry[] */ ],

	// The SDK types the fields below, but no host in the shell reads them yet.
	// A value here does nothing at runtime: locales, shortcuts, banners, setup.
});
