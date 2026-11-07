import { createTeamProject, linkUserToProject } from '@n8n/backend-test-utils';
import { randomUUID } from 'node:crypto';

import type { Project } from '@n8n/db';
import { createCustomRoleWithScopeSlugs } from '@test-integration/db/roles';
import { createMember } from '@test-integration/db/users';
import type { SuperAgentTest } from '@test-integration/types';
import { setupTestServer } from '@test-integration/utils';

import { createAgentBindingFixture } from '@/modules/agents/testing/agent-binding-fixture';

describe('AI Department directory API', () => {
	const server = setupTestServer({ endpointGroups: ['ai'], modules: ['agents', 'ai-department'] });
	let project: Project;
	let otherProject: Project;
	let editor: SuperAgentTest;
	let viewer: SuperAgentTest;
	let outsider: SuperAgentTest;

	beforeAll(async () => {
		project = await createTeamProject('AI Department API');
		otherProject = await createTeamProject('Other AI Department API');
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
		outsider = server.authAgentFor(await createMember());
	});

	it('scopes directory records and mutations to the project and granted scopes', async () => {
		const created = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Growth-${randomUUID()}`, requestId: randomUUID() });
		expect(created.status, JSON.stringify(created.body)).toBe(200);
		const departmentId = created.body.data.id as string;
		await editor
			.patch(`/projects/${project.id}/ai-departments/${departmentId}`)
			.send({ name: 'Growth updated', expectedVersion: 1, requestId: randomUUID() })
			.expect(200);

		await viewer.get(`/projects/${project.id}/ai-departments`).expect(200);
		const beforeDeniedWrite = await editor
			.get(`/projects/${project.id}/ai-departments/${departmentId}`)
			.expect(200);
		await viewer
			.patch(`/projects/${project.id}/ai-departments/${departmentId}`)
			.send({ name: 'Denied', expectedVersion: 1, requestId: randomUUID() })
			.expect(403);
		await editor
			.patch(`/projects/${project.id}/ai-departments/${departmentId}`)
			.send({ name: 'Stale update', expectedVersion: 1, requestId: randomUUID() })
			.expect(409);
		const afterDeniedWrite = await editor
			.get(`/projects/${project.id}/ai-departments/${departmentId}`)
			.expect(200);
		expect(afterDeniedWrite.body.data.version).toBe(beforeDeniedWrite.body.data.version);
		expect(afterDeniedWrite.body.data.name).toBe(beforeDeniedWrite.body.data.name);
		await outsider.get(`/projects/${project.id}/ai-departments/${departmentId}`).expect(403);
		await editor.get(`/projects/${otherProject.id}/ai-departments/${departmentId}`).expect(403);
	});

	it('keeps member hierarchy stable and rejects invalid manager changes', async () => {
		const department = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Hierarchy-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		const otherDepartment = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Other-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		const createMemberUrl = `/projects/${project.id}/ai-departments/${department.body.data.id}/members`;
		const manager = await editor
			.post(createMemberUrl)
			.send({ name: 'Manager', role: 'Lead', requestId: randomUUID() })
			.expect(200);
		const report = await editor
			.post(createMemberUrl)
			.send({ name: 'Report', role: 'Researcher', requestId: randomUUID() })
			.expect(200);
		const crossDepartmentManager = await editor
			.post(`/projects/${project.id}/ai-departments/${otherDepartment.body.data.id}/members`)
			.send({ name: 'Other manager', role: 'Lead', requestId: randomUUID() })
			.expect(200);
		const memberUrl = (memberId: string) => `${createMemberUrl}/${memberId}`;
		const updated = await editor
			.patch(memberUrl(report.body.data.id))
			.send({
				managerMemberId: manager.body.data.id,
				expectedVersion: report.body.data.version,
				requestId: randomUUID(),
			})
			.expect(200);
		expect(updated.body.data.id).toBe(report.body.data.id);
		const hierarchy = await editor.get(createMemberUrl).expect(200);
		expect(hierarchy.body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: manager.body.data.id }),
				expect.objectContaining({
					id: report.body.data.id,
					managerMemberId: manager.body.data.id,
				}),
			]),
		);

		await editor
			.patch(memberUrl(report.body.data.id))
			.send({
				managerMemberId: report.body.data.id,
				expectedVersion: updated.body.data.version,
				requestId: randomUUID(),
			})
			.expect(400);
		await editor
			.patch(memberUrl(report.body.data.id))
			.send({
				managerMemberId: crossDepartmentManager.body.data.id,
				expectedVersion: updated.body.data.version,
				requestId: randomUUID(),
			})
			.expect(400);
		await editor
			.patch(memberUrl(manager.body.data.id))
			.send({
				managerMemberId: report.body.data.id,
				expectedVersion: manager.body.data.version,
				requestId: randomUUID(),
			})
			.expect(400);
		const unchanged = await editor.get(createMemberUrl).expect(200);
		expect(unchanged.body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: report.body.data.id,
					managerMemberId: manager.body.data.id,
					version: updated.body.data.version,
				}),
				expect.objectContaining({ id: manager.body.data.id, managerMemberId: null }),
			]),
		);
	});

	it('normalizes bounded expertise tags on member create and update', async () => {
		const department = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Expertise-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		const membersUrl = `/projects/${project.id}/ai-departments/${department.body.data.id}/members`;
		const created = await editor
			.post(membersUrl)
			.send({
				name: 'Specialist',
				role: 'Engineer',
				expertiseTags: [' Data Engineering ', 'Workflow'],
				requestId: randomUUID(),
			})
			.expect(200);
		expect(created.body.data.expertiseTags).toEqual(['data engineering', 'workflow']);

		const memberUrl = `${membersUrl}/${created.body.data.id}`;
		const updated = await editor
			.patch(memberUrl)
			.send({
				expertiseTags: [' Security '],
				expectedVersion: created.body.data.version,
				requestId: randomUUID(),
			})
			.expect(200);
		expect(updated.body.data.expertiseTags).toEqual(['security']);

		await editor
			.patch(memberUrl)
			.send({
				expertiseTags: ['Data', ' data '],
				expectedVersion: updated.body.data.version,
				requestId: randomUUID(),
			})
			.expect(400);
		await editor
			.patch(memberUrl)
			.send({
				expertiseTags: Array.from({ length: 6 }, (_, index) => `tag-${index}`),
				expectedVersion: updated.body.data.version,
				requestId: randomUUID(),
			})
			.expect(400);

		const current = await editor.get(membersUrl).expect(200);
		expect(current.body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					version: updated.body.data.version,
					id: created.body.data.id,
					expertiseTags: ['security'],
				}),
			]),
		);
	});

	it('replays directory commands and rejects request ID reuse without changing records', async () => {
		const departmentRequestId = randomUUID();
		const departmentUrl = `/projects/${project.id}/ai-departments`;
		const departmentCommand = {
			name: `Idempotent-${randomUUID()}`,
			requestId: departmentRequestId,
		};
		const createdDepartment = await editor.post(departmentUrl).send(departmentCommand).expect(200);
		const replayedDepartment = await editor.post(departmentUrl).send(departmentCommand).expect(200);
		expect(replayedDepartment.body.data).toEqual(createdDepartment.body.data);
		await editor
			.post(departmentUrl)
			.send({ ...departmentCommand, name: 'Conflicting department command' })
			.expect(409);
		const currentDepartment = await editor
			.get(`${departmentUrl}/${createdDepartment.body.data.id}`)
			.expect(200);
		expect(currentDepartment.body.data).toMatchObject({
			id: createdDepartment.body.data.id,
			name: departmentCommand.name,
			version: 1,
		});

		const memberUrl = `${departmentUrl}/${createdDepartment.body.data.id}/members`;
		const memberCommand = {
			name: 'Idempotent member',
			role: 'Researcher',
			requestId: randomUUID(),
		};
		const createdMember = await editor.post(memberUrl).send(memberCommand).expect(200);
		const replayedMember = await editor.post(memberUrl).send(memberCommand).expect(200);
		expect(replayedMember.body.data).toEqual(createdMember.body.data);
		await editor
			.post(memberUrl)
			.send({ ...memberCommand, name: 'Conflicting member command' })
			.expect(409);
		const currentMembers = await editor.get(memberUrl).expect(200);
		expect(currentMembers.body.data).toEqual([
			expect.objectContaining({
				id: createdMember.body.data.id,
				name: memberCommand.name,
				version: 1,
			}),
		]);
	});

	it('creates a member unconfigured, binds only same-project Agents, and clears the binding', async () => {
		const department = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Ops-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		const departmentId = department.body.data.id as string;
		const memberResponse = await editor
			.post(`/projects/${project.id}/ai-departments/${departmentId}/members`)
			.send({ name: 'Researcher', role: 'Research', requestId: randomUUID() });
		expect(
			memberResponse.status,
			JSON.stringify({ department: department.body, response: memberResponse.body }),
		).toBe(200);
		const member = memberResponse.body.data as { id: string; version: number };
		const localAgent = await createAgentBindingFixture(project.id, true);
		const remoteAgent = await createAgentBindingFixture(otherProject.id, true);

		const beforeBinding = await editor
			.get(`/projects/${project.id}/ai-departments/${departmentId}/members`)
			.expect(200);
		expect(beforeBinding.body.data).toEqual([
			expect.objectContaining({ id: member.id, executionState: 'unconfigured' }),
		]);
		const bindingUrl = `/projects/${project.id}/ai-departments/${departmentId}/members/${member.id}/executor-binding`;
		await editor
			.put(bindingUrl)
			.send({
				provider: 'n8n-agent',
				executorId: localAgent.id,
				expectedVersion: member.version,
				requestId: randomUUID(),
			})
			.expect(200);
		await editor
			.put(bindingUrl)
			.send({
				provider: 'n8n-agent',
				executorId: remoteAgent.id,
				expectedVersion: member.version + 1,
				requestId: randomUUID(),
			})
			.expect(404);
		await editor
			.delete(bindingUrl)
			.send({
				expectedVersion: member.version + 1,
				requestId: randomUUID(),
			})
			.expect(200);
		const updated = await editor
			.get(`/projects/${project.id}/ai-departments/${departmentId}/members`)
			.expect(200);
		expect(updated.body.data).toEqual([
			expect.objectContaining({ id: member.id, executionState: 'unconfigured' }),
		]);
	});

	it('archives an empty department when the 003 work guard finds no active work', async () => {
		const department = await editor
			.post(`/projects/${project.id}/ai-departments`)
			.send({ name: `Archive-${randomUUID()}`, requestId: randomUUID() })
			.expect(200);
		await editor
			.post(`/projects/${project.id}/ai-departments/${department.body.data.id}/archive`)
			.send({ expectedVersion: 1, requestId: randomUUID() })
			.expect(200);
	});
});
