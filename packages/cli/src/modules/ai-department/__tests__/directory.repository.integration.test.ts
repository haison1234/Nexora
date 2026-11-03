import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { DirectoryRepository } from '../database/repositories/directory.repository';
import { DepartmentService } from '../department.service';
import { MemberService } from '../member.service';
import { AgentBindingResolver } from '@/modules/agents/agent-binding-resolver.service';

describe('AI Department directory persistence', () => {
	let repository: DirectoryRepository;
	let departments: DepartmentService;
	let members: MemberService;
	let projectId: string;
	let otherProjectId: string;
	const actorId = randomUUID();

	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		repository = Container.get(DirectoryRepository);
		departments = Container.get(DepartmentService);
		members = Container.get(MemberService);
		projectId = (await createTeamProject('Department integration')).id;
		otherProjectId = (await createTeamProject('Other department integration')).id;
	});

	afterAll(async () => await testDb.terminate());

	it('isolates lists and identifiers by project', async () => {
		const created = await departments.create(projectId, actorId, {
			name: `Research-${randomUUID()}`,
			requestId: randomUUID(),
		});
		expect(await repository.findDepartment(otherProjectId, created.id)).toBeNull();
		expect(await repository.listDepartments(otherProjectId, false)).toEqual([]);
	});

	it('enforces normalized active names and optimistic department versions', async () => {
		const name = `Design-${randomUUID()}`;
		await departments.create(projectId, actorId, { name, requestId: randomUUID() });
		await expect(
			departments.create(projectId, actorId, {
				name: name.toLocaleUpperCase('en-US'),
				requestId: randomUUID(),
			}),
		).rejects.toThrow('active department with this name');
		const row = (await repository.listDepartments(projectId, false)).find(
			(item) => item.name === name,
		);
		if (!row) throw new Error('Department was not persisted.');
		await expect(
			departments.update(projectId, actorId, row.id, {
				name: 'Changed',
				expectedVersion: row.version - 1,
				requestId: randomUUID(),
			}),
		).rejects.toThrow('has changed');
		expect((await repository.findDepartment(projectId, row.id))?.version).toBe(row.version);
	});

	it('keeps member, binding revisions, and command receipts scoped to their project', async () => {
		const department = await departments.create(projectId, actorId, {
			name: `Binding-${randomUUID()}`,
			requestId: randomUUID(),
		});
		const member = await members.create(projectId, actorId, department.id, {
			name: 'Coordinator',
			role: 'Research',
			requestId: randomUUID(),
		});
		const entries = await repository.listMembersByProject(projectId);
		expect(entries.some((row) => row.id === member.id && row.departmentId === department.id)).toBe(
			true,
		);
		expect(await repository.listBindingsForProject(otherProjectId)).toEqual([]);
	});

	it('resolves Agent availability without exposing Agent storage to the directory', async () => {
		const resolver = Container.get(AgentBindingResolver);
		expect(await resolver.isAvailableInProject(randomUUID(), projectId)).toBe('unavailable');
	});
});
