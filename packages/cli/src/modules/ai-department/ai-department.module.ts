import type { EntityClass, ModuleInterface, SystemTaskClass } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

@BackendModule({ name: 'ai-department' })
export class AiDepartmentModule implements ModuleInterface {
	async init() {
		await import('./department.controller.js');
		await import('./operations.controller.js');
		await import('./member.controller.js');
		await import('./meeting.controller.js');
		await import('./workflow/workflow-capability.controller.js');
		await import('./work/work.controller.js');
		await import('./work/work-handoff.controller.js');
		const { AiDepartmentOperationsBroadcaster } = await import(
			'./operations-broadcaster.service.js'
		);
		Container.get(AiDepartmentOperationsBroadcaster);
		const {
			DepartmentWorkActionsProxy,
			DepartmentWorkInboxProxy,
			DepartmentWorkflowInvocationProxy,
		} = await import('@/modules/agents/agent-department-execution.contracts.js');
		const { WorkCoordinationService } = await import('./work/work-coordination.service.js');
		Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
		const { WorkInboxService } = await import('./work/work-inbox.service.js');
		Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
		const { WorkflowInvocationService } = await import('./workflow/workflow-invocation.service.js');
		Container.get(DepartmentWorkflowInvocationProxy).register(
			Container.get(WorkflowInvocationService),
		);
		const { ActiveDepartmentWorkGuardProxy } = await import(
			'./active-department-work-guard.contracts.js'
		);
		const { ActiveDepartmentWorkGuardImpl } = await import(
			'./work/active-department-work-guard.js'
		);
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
		);
		const { ActiveDepartmentArchiveGuardProxy } = await import(
			'./active-department-archive-guard.contracts.js'
		);
		const { ActiveDepartmentArchiveGuardImpl } = await import(
			'./active-department-archive-guard.js'
		);
		Container.get(ActiveDepartmentArchiveGuardProxy).register(
			Container.get(ActiveDepartmentArchiveGuardImpl),
		);
		const {
			DepartmentMeetingInvocationOwnerProxy,
			DepartmentMeetingBindingVerifierProxy,
			DepartmentMeetingContextReaderProxy,
		} = await import('@/modules/agents/agent-department-meeting-invocation.contracts.js');
		const { MeetingBindingVerifierService } = await import('./meeting-binding-verifier.service.js');
		const { MeetingContextReaderService } = await import('./meeting-context-reader.service.js');
		Container.get(DepartmentMeetingInvocationOwnerProxy);
		Container.get(DepartmentMeetingBindingVerifierProxy).register(
			Container.get(MeetingBindingVerifierService),
		);
		Container.get(DepartmentMeetingContextReaderProxy).register(
			Container.get(MeetingContextReaderService),
		);
		const {
			DepartmentConsultationInvocationOwnerProxy,
			DepartmentConsultationBindingVerifierProxy,
			DepartmentConsultationContextReaderProxy,
		} = await import('@/modules/agents/agent-department-consultation.contracts.js');
		const { ConsultationBindingVerifierService } = await import(
			'./consultation-binding-verifier.service.js'
		);
		const { ConsultationContextReaderService } = await import(
			'./consultation-context-reader.service.js'
		);
		Container.get(DepartmentConsultationInvocationOwnerProxy);
		Container.get(DepartmentConsultationBindingVerifierProxy).register(
			Container.get(ConsultationBindingVerifierService),
		);
		Container.get(DepartmentConsultationContextReaderProxy).register(
			Container.get(ConsultationContextReaderService),
		);
	}

	async systemTasks(): Promise<SystemTaskClass[]> {
		const { AiDepartmentWorkReconciliationTask } = await import(
			'./work/work-reconciliation.task.js'
		);
		const { AiDepartmentWorkHandoffReconciliationTask } = await import(
			'./work/work-handoff-reconciliation.task.js'
		);
		const { AiDepartmentWorkReleaseReconciliationTask } = await import(
			'./work/work-release-reconciliation.task.js'
		);
		const { AiDepartmentWorkHelpReconciliationTask } = await import(
			'./work/work-help-reconciliation.task.js'
		);
		const { WorkflowInvocationReconciliationTask } = await import(
			'./workflow/workflow-invocation-reconciliation.task.js'
		);
		const { AiDepartmentMeetingReconciliationTask } = await import(
			'./meeting-reconciliation.task.js'
		);
		return [
			AiDepartmentWorkReconciliationTask,
			AiDepartmentWorkHandoffReconciliationTask,
			AiDepartmentWorkReleaseReconciliationTask,
			AiDepartmentWorkHelpReconciliationTask,
			WorkflowInvocationReconciliationTask,
			AiDepartmentMeetingReconciliationTask,
		];
	}

	async entities(): Promise<EntityClass[]> {
		const { Department } = await import('./database/entities/department.entity.js');
		const { Member } = await import('./database/entities/member.entity.js');
		const { ExecutorBinding } = await import('./database/entities/executor-binding.entity.js');
		const { ExecutorBindingRevision } = await import(
			'./database/entities/executor-binding-revision.entity.js'
		);
		const { DirectoryChange } = await import('./database/entities/directory-change.entity.js');
		const { CommandReceipt } = await import('./database/entities/command-receipt.entity.js');
		const { DepartmentGoal } = await import('./database/entities/department-goal.entity.js');
		const { WorkItem } = await import('./database/entities/work-item.entity.js');
		const { WorkHelpRequest } = await import('./database/entities/work-help-request.entity.js');
		const { WorkHelpResponse } = await import('./database/entities/work-help-response.entity.js');
		const { WorkClaim } = await import('./database/entities/work-claim.entity.js');
		const { WorkActivity } = await import('./database/entities/work-activity.entity.js');
		const { WorkWakeIntent } = await import('./database/entities/work-wake-intent.entity.js');
		const { WorkWakeLane } = await import('./database/entities/work-wake-lane.entity.js');
		const { WorkEligibility } = await import('./database/entities/work-eligibility.entity.js');
		const { WorkAttempt } = await import('./database/entities/work-attempt.entity.js');
		const { WorkDispatchIntent } = await import(
			'./database/entities/work-dispatch-intent.entity.js'
		);
		const { WorkOwnerEventReceipt } = await import(
			'./database/entities/work-owner-event-receipt.entity.js'
		);
		const { WorkTransition } = await import('./database/entities/work-transition.entity.js');
		const { WorkReviewDecision } = await import(
			'./database/entities/work-review-decision.entity.js'
		);
		const {
			WorkReviewPolicyRevision,
			SubmittedWorkResult,
			WorkReviewRound,
			WorkReviewStageDecision,
		} = await import('./database/entities/work-review-records.entity.js');
		const { WorkHandoffIntent } = await import('./database/entities/work-handoff-intent.entity.js');
		const { WorkReleaseIntent } = await import('./database/entities/work-release-intent.entity.js');
		const { WorkflowCapability } = await import(
			'./database/entities/workflow-capability.entity.js'
		);
		const { WorkflowCapabilityRevision } = await import(
			'./database/entities/workflow-capability-revision.entity.js'
		);
		const { WorkflowInvocation } = await import(
			'./database/entities/workflow-invocation.entity.js'
		);
		const { WorkflowInvocationReceipt } = await import(
			'./database/entities/workflow-invocation-receipt.entity.js'
		);
		const { WorkRelationship } = await import('./database/entities/work-relationship.entity.js');
		const { DepartmentAdmissionFence } = await import(
			'./database/entities/department-admission-fence.entity.js'
		);
		const {
			AiDepartmentMeeting,
			AiDepartmentMeetingActionItem,
			AiDepartmentMeetingActivity,
			AiDepartmentMeetingContext,
			AiDepartmentMeetingContribution,
			AiDepartmentMeetingDecision,
			AiDepartmentMeetingInvocation,
			AiDepartmentMeetingMinutes,
			AiDepartmentMeetingParticipant,
			AiDepartmentMeetingSource,
		} = await import('./database/entities/meeting.entity.js');
		return [
			Department,
			Member,
			ExecutorBinding,
			ExecutorBindingRevision,
			DirectoryChange,
			CommandReceipt,
			DepartmentGoal,
			WorkItem,
			WorkHelpRequest,
			WorkHelpResponse,
			WorkClaim,
			WorkActivity,
			WorkWakeIntent,
			WorkWakeLane,
			WorkEligibility,
			WorkAttempt,
			WorkDispatchIntent,
			WorkOwnerEventReceipt,
			WorkTransition,
			WorkReviewDecision,
			WorkReviewPolicyRevision,
			SubmittedWorkResult,
			WorkReviewRound,
			WorkReviewStageDecision,
			WorkHandoffIntent,
			WorkReleaseIntent,
			WorkflowCapability,
			WorkflowCapabilityRevision,
			WorkflowInvocation,
			WorkflowInvocationReceipt,
			WorkRelationship,
			DepartmentAdmissionFence,
			AiDepartmentMeeting,
			AiDepartmentMeetingActionItem,
			AiDepartmentMeetingActivity,
			AiDepartmentMeetingContext,
			AiDepartmentMeetingContribution,
			AiDepartmentMeetingDecision,
			AiDepartmentMeetingInvocation,
			AiDepartmentMeetingMinutes,
			AiDepartmentMeetingParticipant,
			AiDepartmentMeetingSource,
		];
	}
}
