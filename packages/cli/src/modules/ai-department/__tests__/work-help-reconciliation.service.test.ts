import { mock, type MockProxy } from 'vitest-mock-extended';

import type { TransactionRunner } from '@n8n/db';
import type { DepartmentConsultationInvocationOwnerProxy } from '@/modules/agents/agent-department-consultation.contracts';
import type { WorkHelpRequest } from '../database/entities/work-help-request.entity';
import type { WorkAttempt } from '../database/entities/work-attempt.entity';
import type { WorkItem } from '../database/entities/work-item.entity';
import type { DirectoryRepository } from '../database/repositories/directory.repository';
import type { WorkRepository } from '../database/repositories/work.repository';
import type { DepartmentExecutorProxy } from '../work/executor.contracts';
import type { WorkHelpResponseGate } from '../work/work-help-response-gate';
import type { WorkHelpRoutingService } from '../work/work-help-routing.service';
import { WorkHelpService } from '../work/work-help.service';
import type { WorkReleaseService } from '../work/work-release.service';
import type { WorkService } from '../work/work.service';
import type { AiDepartmentOperationsBroadcaster } from '../operations-broadcaster.service';

describe('WorkHelpService consultation reconciliation', () => {
	let repository: MockProxy<WorkRepository>;
	let consultationOwner: MockProxy<DepartmentConsultationInvocationOwnerProxy>;
	let txRunner: MockProxy<TransactionRunner>;
	let responseGate: MockProxy<WorkHelpResponseGate>;
	let service: WorkHelpService;

	beforeEach(() => {
		repository = mock<WorkRepository>();
		consultationOwner = mock<DepartmentConsultationInvocationOwnerProxy>();
		txRunner = mock<TransactionRunner>();
		responseGate = mock<WorkHelpResponseGate>();
		responseGate.canUseAgentResponses.mockReturnValue(true);
		txRunner.run.mockImplementation(async (_context, runWork) => await runWork({}));
		service = new WorkHelpService(
			repository,
			mock<DirectoryRepository>(),
			mock<WorkHelpRoutingService>(),
			mock<WorkReleaseService>(),
			txRunner,
			mock<DepartmentExecutorProxy>(),
			consultationOwner,
			mock<WorkService>(),
			responseGate,
			mock<AiDepartmentOperationsBroadcaster>(),
		);
	});

	it.each([
		{ cause: 'the owner no longer returns an accessible result', result: null, expired: false },
		{
			cause: 'the owner result was built from stale context',
			result: {
				invocationId: 'help-1',
				helpRequestId: 'help-1',
				ownerInvocationRef: 'help-1',
				sequence: '3',
				resultHash: 'answer-hash',
				contextHash: 'stale-context-hash',
				answer: 'Use the current published workflow.',
			},
			expired: true,
		},
	])(
		'returns a queued request to the human response path when $cause',
		async ({ result, expired }) => {
			const request = mock<WorkHelpRequest>({
				id: 'help-1',
				projectId: 'project-1',
				departmentId: 'department-1',
				workId: 'work-1',
				requesterMemberId: 'requester-1',
				sourceAttemptId: 'attempt-1',
				initiatingUserId: 'user-1',
				recipientMemberId: 'responder-1',
				question: 'How do I verify the result?',
				reason: 'Need a current source.',
				attemptedStepsJson: JSON.stringify(['Checked the current run.']),
				state: 'queued',
				ownerReference: 'release-1',
				ownerInvocationHash: 'input-hash',
				deadlineAt: new Date(Date.now() + (expired ? -1_000 : 60_000)),
				version: 4,
			});
			const work = mock<WorkItem>({
				instruction: 'Prepare an execution result',
				state: 'blocked',
				currentAttemptId: 'attempt-1',
			});
			const attempt = mock<WorkAttempt>({ phase: 'terminal' });
			repository.listPendingHelpRequests.mockResolvedValue([]);
			repository.listQueuedHelpRequests.mockResolvedValue([request]);
			repository.listAnsweredHelpRequests.mockResolvedValue([]);
			repository.findHelpRequestById.mockResolvedValue(request);
			repository.findWork.mockResolvedValue(work);
			repository.findAttempt.mockResolvedValue(attempt);
			consultationOwner.lookup.mockResolvedValue({
				kind: 'accepted',
				ownerInvocationRef: 'help-1',
			});
			consultationOwner.snapshot.mockResolvedValue({
				ownerInvocationRef: 'help-1',
				sequence: '3',
				phase: 'terminal',
				outcome: 'succeeded',
			});
			consultationOwner.readResult.mockResolvedValue(result);

			await service.reconcilePending();

			expect(request.state).toBe(expired ? 'expired' : 'awaiting_answer');
			expect(request.version).toBe(5);
			expect(repository.saveHelpRequest).toHaveBeenCalledWith(request, {});
			expect(repository.saveHelpResponse).not.toHaveBeenCalled();
		},
	);
});
