import type { EntityClass, ModuleInterface, SystemTaskClass } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

@BackendModule({ name: 'ai-department' })
export class AiDepartmentModule implements ModuleInterface {
	async init() {
		await import('./department.controller.js');
		await import('./member.controller.js');
		await import('./work/work.controller.js');
		const { DepartmentWorkActionsProxy, DepartmentWorkInboxProxy } = await import(
			'@/modules/agents/agent-department-execution.contracts.js'
		);
		const { WorkCoordinationService } = await import('./work/work-coordination.service.js');
		Container.get(DepartmentWorkActionsProxy).register(Container.get(WorkCoordinationService));
		const { WorkInboxService } = await import('./work/work-inbox.service.js');
		Container.get(DepartmentWorkInboxProxy).register(Container.get(WorkInboxService));
		const { ActiveDepartmentWorkGuardProxy } = await import(
			'./active-department-work-guard.contracts.js'
		);
		const { ActiveDepartmentWorkGuardImpl } = await import(
			'./work/active-department-work-guard.js'
		);
		Container.get(ActiveDepartmentWorkGuardProxy).register(
			Container.get(ActiveDepartmentWorkGuardImpl),
		);
	}

	async systemTasks(): Promise<SystemTaskClass[]> {
		const { AiDepartmentWorkReconciliationTask } = await import(
			'./work/work-reconciliation.task.js'
		);
		return [AiDepartmentWorkReconciliationTask];
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
		const { WorkRelationship } = await import('./database/entities/work-relationship.entity.js');
		const { DepartmentAdmissionFence } = await import(
			'./database/entities/department-admission-fence.entity.js'
		);
		return [
			Department,
			Member,
			ExecutorBinding,
			ExecutorBindingRevision,
			DirectoryChange,
			CommandReceipt,
			DepartmentGoal,
			WorkItem,
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
			WorkRelationship,
			DepartmentAdmissionFence,
		];
	}
}
