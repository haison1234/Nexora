import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { GLOBAL_MEMBER_ROLE, UserRepository } from '@n8n/db';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { createOwner } from '@test-integration/db/users';
import {
	createAgentBindingFixture,
	registerDepartmentExecutionFixture,
	admitDepartmentRunFixture,
} from '@/modules/agents/testing/agent-binding-fixture';

import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkService } from '../../work/work.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';

describe('Department work with the Agents queue owner', () => {
	beforeAll(async () => {
		await testModules.loadModules(['ai-department', 'agents']);
		await testDb.init();
		await registerDepartmentExecutionFixture();
	});
	afterAll(async () => await testDb.terminate());

	it('uses durable queue acceptance, verifies the actual execution, and rejects access loss', async () => {
		const user = await createOwner();
		const projectId = (await createTeamProject('Department owner contract')).id;
		const department = await Container.get(DepartmentService).create(projectId, user.id, {
			name: 'Owner contract',
			requestId: randomUUID(),
		});
		const member = await Container.get(MemberService).create(projectId, user.id, department.id, {
			name: 'Researcher',
			role: 'Research',
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		await Container.get(MemberService).setBinding(projectId, user.id, department.id, member.id, {
			provider: 'n8n-agent',
			executorId: agent.id,
			expectedVersion: member.version,
			requestId: randomUUID(),
		});
		const work = Container.get(WorkService);
		const item = await work.createWork(projectId, user.id, department.id, {
			instruction: 'Prepare a research summary',
			assigneeMemberId: member.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, user.id, department.id, item.id, {
			expectedVersion: item.version,
			requestId: randomUUID(),
		});
		const command = { expectedVersion: ready.version, requestId: randomUUID() };
		const started = await work.startWork(projectId, user.id, department.id, item.id, command);
		expect(started.dispatchState).toBe('acknowledged');
		expect(await work.startWork(projectId, user.id, department.id, item.id, command)).toEqual(
			started,
		);
		const run = await admitDepartmentRunFixture(started.attemptId!);
		try {
			const context = {
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				executionId: run.executionId,
			};
			const coordinator = Container.get(WorkCoordinationService);
			const inspected = await coordinator.executeAction(context, randomUUID(), {
				action: 'inspect',
			});
			const claimed = await coordinator.executeAction(context, randomUUID(), {
				action: 'claim',
				expectedVersion: inspected.work.version,
			});
			expect(claimed.work.state).toBe('running');
			await expect(
				coordinator.executeAction({ ...context, executionId: randomUUID() }, randomUUID(), {
					action: 'progress',
					expectedVersion: claimed.work.version,
					body: 'An unbound update',
				}),
			).rejects.toThrow('cannot update');
			await Container.get(UserRepository).save({ ...user, role: GLOBAL_MEMBER_ROLE });
			await expect(
				coordinator.executeAction(context, randomUUID(), {
					action: 'progress',
					expectedVersion: claimed.work.version,
					body: 'An update after access loss',
				}),
			).rejects.toThrow('cannot update');
		} finally {
			await run.finish();
		}
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, item.id)).state).toBe('blocked');
	});
});
