import { createTeamProject, linkUserToProject } from '@n8n/backend-test-utils';
import { randomUUID } from 'node:crypto';

import type { Project } from '@n8n/db';
import { createCustomRoleWithScopeSlugs } from '@test-integration/db/roles';
import { createMember } from '@test-integration/db/users';
import type { SuperAgentTest } from '@test-integration/types';
import { setupTestServer } from '@test-integration/utils';

describe('AI Department work API', () => {
	const server = setupTestServer({ endpointGroups: ['ai'], modules: ['agents', 'ai-department'] });
	let project: Project;
	let otherProject: Project;
	let editor: SuperAgentTest;
	let viewer: SuperAgentTest;

	beforeAll(async () => {
		project = await createTeamProject('AI Department work API');
		otherProject = await createTeamProject('Other AI Department work API');
		const editorRole = await createCustomRoleWithScopeSlugs(
			['agent:list', 'agent:read', 'agent:create', 'agent:update'],
			{ roleType: 'project' },
		);
		const viewerRole = await createCustomRoleWithScopeSlugs(['agent:list', 'agent:read'], {
			roleType: 'project',
		});
		const editorUser = await createMember();
		const viewerUser = await createMember();
		await linkUserToProject(editorUser, project, editorRole.slug);
		await linkUserToProject(viewerUser, project, viewerRole.slug);
		editor = server.authAgentFor(editorUser);
		viewer = server.authAgentFor(viewerUser);
	});

	it('allows project viewers to inspect work but denies mutations and access to another project', async () => {
		const departmentResponse = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Planning-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		const departmentId = departmentResponse.body.data.id as string;
		const goalResponse = await editor
			.post(`/projects/${project.id}/ai-departments/${departmentId}/goals`)
			.send({ title: 'Publish the research plan', requestId: randomUUID() })
			.expect(200);
		const goalId = goalResponse.body.data.id as string;
		const workResponse = await editor
			.post(`/projects/${project.id}/ai-departments/${departmentId}/work`)
			.send({
				instruction: 'Prepare a short research summary',
				goalId,
				requestId: randomUUID(),
			});
		expect(workResponse.status, JSON.stringify(workResponse.body)).toBe(200);
		const workId = workResponse.body.data.id as string;

		await viewer.get(`/projects/${project.id}/ai-departments/${departmentId}/goals`).expect(200);
		await viewer.get(`/projects/${project.id}/ai-departments/${departmentId}/work`).expect(200);
		await viewer
			.get(`/projects/${project.id}/ai-departments/${departmentId}/work/${workId}/history`)
			.expect(200);
		await viewer
			.get(`/projects/${project.id}/ai-departments/${departmentId}/work/${workId}/attempts`)
			.expect(200);
		await viewer
			.post(`/projects/${project.id}/ai-departments/${departmentId}/work`)
			.send({ instruction: 'Not allowed', requestId: randomUUID() })
			.expect(403);
		await viewer
			.patch(`/projects/${project.id}/ai-departments/${departmentId}/work/${workId}`)
			.send({ expectedVersion: 1, requestId: randomUUID(), instruction: 'Not allowed' })
			.expect(403);
		await editor
			.post(`/projects/${project.id}/ai-departments/${departmentId}/work/${workId}/start`)
			.send({ expectedVersion: 1, requestId: randomUUID() })
			.expect(403);
		await editor
			.get(`/projects/${otherProject.id}/ai-departments/${departmentId}/work/${workId}`)
			.expect(403);
	});

	it('rejects malformed work filters before querying the repository', async () => {
		const departmentResponse = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Filters-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);

		await editor
			.get(
				`/projects/${project.id}/ai-departments/${departmentResponse.body.data.id}/work?state=unknown`,
			)
			.expect(400);
	});
});
