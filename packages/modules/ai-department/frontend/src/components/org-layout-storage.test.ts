import 'fake-indexeddb/auto';
import {
	loadOrgPositions,
	removeOrgPositions,
	saveOrgPosition,
	type OrgLayoutScope,
} from './org-layout-storage';

const scope: OrgLayoutScope = {
	userId: 'user-1',
	projectId: 'project-1',
	departmentId: 'department-1',
};

async function deleteDatabase() {
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase('n8n-ai-department-org-layout');
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('Could not delete test database.'));
	});
}

describe('Org layout storage', () => {
	beforeEach(async () => await deleteDatabase());

	it('loads positions only for the current user, project, and department', async () => {
		await saveOrgPosition(scope, 'member-1', { x: 300, y: 220 });
		await saveOrgPosition({ ...scope, userId: 'user-2' }, 'member-1', { x: 600, y: 440 });
		await saveOrgPosition({ ...scope, departmentId: 'department-2' }, 'member-1', {
			x: 900,
			y: 660,
		});

		expect(await loadOrgPositions(scope)).toEqual({ 'member-1': { x: 300, y: 220 } });
	});

	it('removes positions for archived members and resets the selected department layout', async () => {
		await saveOrgPosition(scope, 'member-1', { x: 300, y: 220 });
		await saveOrgPosition(scope, 'member-2', { x: 500, y: 220 });
		await removeOrgPositions(scope, new Set(['member-1']));
		expect(await loadOrgPositions(scope)).toEqual({ 'member-1': { x: 300, y: 220 } });

		await removeOrgPositions(scope);
		expect(await loadOrgPositions(scope)).toEqual({});
	});
});
