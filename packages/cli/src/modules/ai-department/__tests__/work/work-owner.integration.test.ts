import { createTeamProject, testDb, testModules } from '@n8n/backend-test-utils';
import { Logger } from '@n8n/backend-common';
import { GLOBAL_MEMBER_ROLE, UserRepository } from '@n8n/db';
import { Container } from '@n8n/di';
import { randomUUID } from 'node:crypto';

import { createOwner } from '@test-integration/db/users';
import { AgentBindingResolver } from '@/modules/agents/agent-binding-resolver.service';
import { AgentDepartmentExecutionAdapter } from '@/modules/agents/agent-department-execution.adapter';
import { AgentMessageQueueService } from '@/modules/agents/agent-message-queue.service';
import { AgentSessionStopService } from '@/modules/agents/agent-session-stop.service';
import { AgentExecutionService } from '@/modules/agents/agent-execution.service';
import {
	createAgentBindingFixture,
	registerDepartmentExecutionFixture,
	admitDepartmentRunFixture,
} from '@/modules/agents/testing/agent-binding-fixture';
import { AgentExecutionRepository } from '@/modules/agents/repositories/agent-execution.repository';
import { AgentExecutionThreadRepository } from '@/modules/agents/repositories/agent-execution-thread.repository';
import { AgentMessageQueueRepository } from '@/modules/agents/repositories/agent-message-queue.repository';
import { AgentDepartmentStopReceiptRepository } from '@/modules/agents/repositories/agent-department-stop-receipt.repository';

import { DepartmentService } from '../../department.service';
import { MemberService } from '../../member.service';
import { WorkService } from '../../work/work.service';
import { WorkCoordinationService } from '../../work/work-coordination.service';
import { WorkReleaseService } from '../../work/work-release.service';
import { WorkRepository } from '../../database/repositories/work.repository';

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
		const stopCommandId = randomUUID();
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
			const attempt = await Container.get(WorkRepository).findAttempt(
				projectId,
				started.attemptId!,
			);
			expect(attempt?.ownerExecutionRef).toBeTruthy();
			const stopReceipt = await Container.get(AgentDepartmentExecutionAdapter).requestStop({
				actorId: user.id,
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				ownerExecutionRef: attempt!.ownerExecutionRef!,
				commandId: stopCommandId,
				reason: 'authority-revoked',
				authorityContext: {
					kind: 'department-control-plane',
					commandId: stopCommandId,
					reason: 'authority-revoked',
				},
			});
			expect(stopReceipt).toMatchObject({
				status: 'accepted',
				acknowledged: true,
				confirmed: false,
			});
			const adapter = Container.get(AgentDepartmentExecutionAdapter);
			const stopInput = {
				actorId: user.id,
				projectId,
				executorId: agent.id,
				attemptId: started.attemptId!,
				ownerExecutionRef: attempt!.ownerExecutionRef!,
				commandId: stopCommandId,
				reason: 'authority-revoked' as const,
				authorityContext: {
					kind: 'department-control-plane' as const,
					commandId: stopCommandId,
					reason: 'authority-revoked' as const,
				},
			};
			expect((await adapter.requestStop(stopInput)).status).toBe('duplicate');
			expect(
				(
					await adapter.requestStop({
						...stopInput,
						reason: 'cancel',
						authorityContext: {
							kind: 'department-control-plane',
							commandId: stopCommandId,
							reason: 'cancel',
						},
					})
				).status,
			).toBe('rejected');
		} finally {
			await run.finish();
		}
		const recoveredAdapter = new AgentDepartmentExecutionAdapter(
			Container.get(AgentBindingResolver),
			Container.get(UserRepository),
			Container.get(AgentMessageQueueService),
			Container.get(AgentExecutionRepository),
			Container.get(AgentExecutionThreadRepository),
			Container.get(AgentMessageQueueRepository),
			Container.get(AgentDepartmentStopReceiptRepository),
			Container.get(AgentSessionStopService),
			Container.get(AgentExecutionService),
			Container.get(Logger),
		);
		await recoveredAdapter.reconcilePendingStops();
		expect(
			await Container.get(AgentDepartmentStopReceiptRepository).findByCommandId(stopCommandId),
		).toMatchObject({ status: 'confirmed' });
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, item.id)).state).toBe('blocked');
	});

	it('runs a three-level campaign through controlled Agent owner turns and human review', async () => {
		const user = await createOwner();
		const projectId = (await createTeamProject('Department hierarchy owner test')).id;
		const departments = Container.get(DepartmentService);
		const members = Container.get(MemberService);
		const department = await departments.create(projectId, user.id, {
			name: 'Campaign hierarchy',
			requestId: randomUUID(),
		});
		const ceo = await members.create(projectId, user.id, department.id, {
			name: 'CEO',
			role: 'Coordinator',
			requestId: randomUUID(),
		});
		const manager = await members.create(projectId, user.id, department.id, {
			name: 'Marketing manager',
			role: 'Manager',
			managerMemberId: ceo.id,
			requestId: randomUUID(),
		});
		const staff = await members.create(projectId, user.id, department.id, {
			name: 'Campaign staff',
			role: 'Researcher',
			managerMemberId: manager.id,
			requestId: randomUUID(),
		});
		const agent = await createAgentBindingFixture(projectId, true);
		for (const member of [ceo, manager, staff]) {
			await members.setBinding(projectId, user.id, department.id, member.id, {
				provider: 'n8n-agent',
				executorId: agent.id,
				expectedVersion: member.version,
				requestId: randomUUID(),
			});
		}
		const work = Container.get(WorkService);
		const root = await work.createWork(projectId, user.id, department.id, {
			instruction: 'Plan a marketing campaign for a local cafe.',
			assigneeMemberId: ceo.id,
			priority: 'normal',
			reviewPolicy: 'required',
			requestId: randomUUID(),
		});
		const ready = await work.markReady(projectId, user.id, department.id, root.id, {
			expectedVersion: root.version,
			requestId: randomUUID(),
		});
		const started = await work.startWork(projectId, user.id, department.id, root.id, {
			expectedVersion: ready.version,
			requestId: randomUUID(),
		});
		const coordination = Container.get(WorkCoordinationService);
		const admit = async (attemptId: string, executorId: string) => {
			const owner = await admitDepartmentRunFixture(attemptId);
			return {
				...owner,
				context: { projectId, executorId, attemptId, executionId: owner.executionId },
			};
		};
		const act = async (
			context: { projectId: string; executorId: string; attemptId: string; executionId: string },
			input: Parameters<WorkCoordinationService['executeToolAction']>[2],
		) => await coordination.executeToolAction(context, randomUUID(), input);
		const actWithWork = async (
			context: { projectId: string; executorId: string; attemptId: string; executionId: string },
			input: Parameters<WorkCoordinationService['executeToolAction']>[2],
		) => {
			const result = await act(context, input);
			if (!('work' in result)) throw new Error('Expected a work action result.');
			return result;
		};
		const accept = async (workId: string) => {
			const current = await work.getWork(projectId, department.id, workId);
			const attempt = current.currentAttemptId
				? await Container.get(WorkRepository).findAttempt(projectId, current.currentAttemptId)
				: null;
			if (!attempt?.submittedResultId || !attempt.reviewRoundId)
				throw new Error('Expected a submitted report for review.');
			await work.reviewWork(projectId, user.id, department.id, workId, {
				expectedVersion: current.version,
				attemptId: attempt.id,
				resultId: attempt.submittedResultId,
				reviewRoundId: attempt.reviewRoundId,
				stageId: current.reviewStages[current.currentReviewStageIndex]?.id ?? '',
				expectedReviewVersion: 1,
				decision: 'accept',
				requestId: randomUUID(),
			});
		};
		const submitReport = async (
			context: { projectId: string; executorId: string; attemptId: string; executionId: string },
			version: number,
			result: string,
		) => {
			const claimed = await actWithWork(context, { action: 'claim', expectedVersion: version });
			await act(context, {
				action: 'submit',
				expectedVersion: claimed.work.version,
				report: {
					result,
					completedWork: [result],
					checkedEvidence: [],
					openIssues: [],
					nextSteps: [],
				},
			});
		};
		const completeCurrentWork = async (workId: string, result: string) => {
			await work.reconcileAttempts();
			const current = await work.getWork(projectId, department.id, workId);
			if (!current.currentAttemptId) throw new Error('Expected a dispatched Agent attempt.');
			const attempt = await Container.get(WorkRepository).findAttempt(
				projectId,
				current.currentAttemptId,
			);
			if (!attempt) throw new Error('Expected the current Agent work attempt.');
			const owner = await admit(attempt.id, attempt.executorId);
			const inspected = await actWithWork(owner.context, { action: 'inspect' });
			await submitReport(owner.context, inspected.work.version, result);
			await owner.finish();
			await work.reconcileAttempts();
		};

		const rootRun = await admit(started.attemptId!, agent.id);
		const rootInspect = await actWithWork(rootRun.context, { action: 'inspect' });
		const rootClaim = await actWithWork(rootRun.context, {
			action: 'claim',
			expectedVersion: rootInspect.work.version,
		});
		const managerChild = await act(rootRun.context, {
			action: 'delegate',
			expectedVersion: rootClaim.work.version,
			recipientMemberId: manager.id,
			title: 'Research cafe competitors',
			instruction: 'Compare nearby cafes and submit a structured research report.',
		});
		if (!('child' in managerChild)) throw new Error('Expected CEO to delegate manager work.');
		await rootRun.finish();
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, root.id)).state).toBe('blocked');

		const managerCurrent = await work.getWork(projectId, department.id, managerChild.child.id);
		if (!managerCurrent.currentAttemptId) throw new Error('Expected the manager Agent wake.');
		const managerRun = await admit(managerCurrent.currentAttemptId, agent.id);
		const managerInspect = await actWithWork(managerRun.context, { action: 'inspect' });
		const managerClaim = await actWithWork(managerRun.context, {
			action: 'claim',
			expectedVersion: managerInspect.work.version,
		});
		const staffChild = await act(managerRun.context, {
			action: 'delegate',
			expectedVersion: managerClaim.work.version,
			recipientMemberId: staff.id,
			title: 'Draft cafe social post',
			instruction: 'Draft one cafe social post and submit a structured result.',
		});
		if (!('child' in staffChild)) throw new Error('Expected manager to delegate staff work.');
		await managerRun.finish();
		await work.reconcileAttempts();
		expect((await work.getWork(projectId, department.id, managerChild.child.id)).state).toBe(
			'blocked',
		);

		await completeCurrentWork(
			staffChild.child.id,
			'Nearby cafe research and one draft social post are ready for review.',
		);
		await accept(staffChild.child.id);
		await work.reconcileAttempts();
		await Container.get(WorkReleaseService).reconcilePending();
		await work.reconcileAttempts();
		const resumedManager = await work.getWork(projectId, department.id, managerChild.child.id);
		expect(
			resumedManager.state,
			JSON.stringify({
				manager: resumedManager,
				staff: await work.getWork(projectId, department.id, staffChild.child.id),
				managerAttempts: await Container.get(WorkRepository).listAttempts(
					projectId,
					managerChild.child.id,
				),
			}),
		).toBe('ready');
		const resumedManagerAttempt = await Container.get(WorkRepository).findAttempt(
			projectId,
			resumedManager.currentAttemptId!,
		);
		if (!resumedManagerAttempt) throw new Error('Expected one manager wake after staff review.');
		const resumedManagerRun = await admit(resumedManagerAttempt.id, agent.id);
		const resumedManagerInspect = await actWithWork(resumedManagerRun.context, {
			action: 'inspect',
		});
		expect(resumedManagerInspect.work.childReports).toEqual([
			expect.objectContaining({
				workId: staffChild.child.id,
				state: 'done',
				report: expect.any(Object),
			}),
		]);
		await submitReport(
			resumedManagerRun.context,
			resumedManagerInspect.work.version,
			'Staff completed the cafe research and drafted a social post.',
		);
		await resumedManagerRun.finish();
		await work.reconcileAttempts();
		await accept(managerChild.child.id);
		await work.reconcileAttempts();
		await Container.get(WorkReleaseService).reconcilePending();
		await work.reconcileAttempts();
		const resumedRoot = await work.getWork(projectId, department.id, root.id);
		expect(resumedRoot.state).toBe('ready');
		const resumedRootAttempt = await Container.get(WorkRepository).findAttempt(
			projectId,
			resumedRoot.currentAttemptId!,
		);
		if (!resumedRootAttempt) throw new Error('Expected one CEO wake after manager review.');
		const resumedRootRun = await admit(resumedRootAttempt.id, agent.id);
		const resumedRootInspect = await actWithWork(resumedRootRun.context, {
			action: 'inspect',
		});
		expect(resumedRootInspect.work.childReports).toEqual([
			expect.objectContaining({
				workId: managerChild.child.id,
				state: 'done',
				report: expect.objectContaining({
					result: 'Staff completed the cafe research and drafted a social post.',
				}),
			}),
		]);
		await submitReport(
			resumedRootRun.context,
			resumedRootInspect.work.version,
			'The campaign research and draft are ready for publication review.',
		);
		await resumedRootRun.finish();
		await work.reconcileAttempts();
		await accept(root.id);
		expect((await work.getWork(projectId, department.id, root.id)).state).toBe('done');
		expect(await Container.get(WorkRepository).listAttempts(projectId, root.id)).toHaveLength(2);
		expect(
			await Container.get(WorkRepository).listAttempts(projectId, managerChild.child.id),
		).toHaveLength(2);
	}, 120_000);
});
