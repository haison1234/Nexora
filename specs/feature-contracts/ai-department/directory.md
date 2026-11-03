# C1: Directory

**Status:** Approved v1. C1 design and current-revision acceptance gates are closed.
**Owner:** Spec 002. **Dependency:** Existing project access.

## Requirements

- C1-R1: Keep stable project-owned department/member IDs. A member may be unconfigured.
  Role and manager are organization data. They grant no n8n permissions.
- C1-R2: Reject reporting cycles, self-management, cross-department managers, inactive
  assignees, and duplicate active department names without partial writes.
- C1-R3: Preserve binding revisions and historical identity. A binding change denies
  further old-context actions. It does not rewrite an attempt's binding snapshot.
  Runtime stop and reconciliation follow the C3 owner contract.
- C1-R4: Archive shares an admission fence with assignment, attempt reservation, and
  claim. Nonterminal business work or an unconfirmed active runtime prevents archive.
  A submitted automatic result does not remove an active-runtime archive blocker.
- C1-R5: Reject manager archive while active reports reference it. Transfer requires
  the existing 002 no-work/no-reports rules. An unavailable work guard denies archive.

## Data model and API

Retain Department, Member, ExecutorBinding, BindingRevision, DirectoryChange,
CommandReceipt, and DepartmentAdmissionFence. Use actual source DTO fields when the
accepted model is synchronized; older model labels such as archivedAt are conceptual.
Department already stores `projectionSequence`. Directory and work writes increment it
inside their persistence transaction. Existing per-resource versions remain update guards.

Keep the routes in 002/contracts/department-api.md. The common scope and receipt rules
in README.md apply. Binding validation calls the Agents-owned AgentBindingResolver.
Do not import Agents tables into directory services. Archive returns 409 with authorized
blocking references/count. Changes return the new member/resource and binding versions.

## Source and spec comparison

| Surface | Present | Missing or unverified | Mapping |
|---|---|---|---|
| Directory CRUD/hierarchy | Controllers, services, composed repository | Current-revision full quickstart | 002 FR-001–FR-009; model and department-api |
| Binding | Resolver and revision records | Approval-resume/access-loss consequences for active runs | 002 binding rules; C3 |
| Archive | ActiveDepartmentWorkGuard registered by work module | UI timing and duplicate directory-request acceptance remain open | 002 T024–T026; T030 |
| Projection | Department `projectionSequence` and transactional directory/work increments | Consistent C6 snapshot assembly remains unverified | 003 model; 006 snapshot contract |

Evidence paths: `department.service.ts`, `member.service.ts`,
`database/repositories/directory.repository.ts`, `work/active-department-work-guard.ts`
under `packages/cli/src/modules/ai-department/`; Agents `agent-binding-resolver.service.ts`.

## Acceptance

- [x] C1-A1: Create a member without binding, then bind/replace/clear it. Member ID and
  past attempt references remain stable. The unconfigured member cannot execute work.
- [x] C1-A2: Race archive against assignment/start. Exactly one valid admission wins.
  No assignment or runtime starts in an archived department.
- [x] C1-A3: Automatic-result work with a live owner still blocks archive. Confirmed
  terminal owner plus terminal business work removes that blocker.
- [x] C1-A4: Cross-project, reader mutation, reporting cycle, stale edit, and duplicate
  request cases preserve existing records and expose no protected references.
- [x] C1-A5: Binding change prevents further mutation from the old context. Runtime stop and recovery follow C3 and remain outside C1 acceptance. History stays readable under current project policy.

These checkboxes record current-revision test evidence, not source inspection alone.
T030 passed in the local project UI. Creating one department and two unconfigured
members took 19,814 ms from first form input until both member rows appeared. This is
browser-assisted UI timing, not a human usability study. SQLite integration tests and
SQLite/PostgreSQL schema checks pass.
