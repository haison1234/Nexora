# Research: AI Department Work Coordination

**Date**: 2026-11-05
**Status**: Source contracts reviewed. Runtime acceptance remains open.

This review uses the current Nexora working tree. The worktree contains unrelated and
feature-related user changes. The paths below describe observed code, not proof of a live
owner or production behavior.

## Current work actions

**Decision**: Extend the existing `department_work` tool and retain its authenticated
attempt context, command identity, claim checks, and activity history.

**Evidence**:

- `packages/cli/src/modules/agents/tools/department-work.tool.ts` exposes inspect, claim,
  report, ask, delegate, and handoff actions. It ends the Agent turn when a claim is
  released or a help request or child Work result is returned.
- `packages/@n8n/api-types/src/ai-department/work.ts` defines bounded structured reports,
  help requests, human answers, and delegated child work. Schema tests cover the fields
  and limits.
- `packages/cli/src/modules/ai-department/work/work-coordination.service.ts` validates
  the current project, attempt, binding, executor, assignee, claim, and recipient binding.
  It stores reports and help requests, and creates child Work with parent and blocker
  relationships in one transaction. Focused SQLite tests cover report, help, and child
  Work paths.
- `packages/cli/src/modules/ai-department/work/work-release.service.ts` waits for a
  correlated terminal owner snapshot before it confirms release and closes the wake lane.
- `packages/cli/src/modules/ai-department/database/entities/work-activity.entity.ts`
  stores append-only activity with actor, Work, attempt, kind, body, version, and time.

**Implication**: A help request can reuse claim validation, receipts, Work activity, and
the safe-stop pattern. It must add a distinct durable request and a continuation contract.
The current release path ends the claim and attempt. It does not prove that a blocked Work
item can resume the same attempt after an asynchronous answer.

## Work assignment actor

`WorkItem` has no `assignedByUserId` field. Work create and update activity stores the
command actor, but it does not store an assignment snapshot. `WorkAttempt.initiatingUserId`
is the user who starts an attempt. It is not necessarily the person who assigned the Work.

Add a stable assignment actor reference to Work and update it when a user assigns or
reassigns the current member. Use it for the final human fallback. Historical records
without a reliable assignment actor must skip this fallback and show an unresolved route.

## Work hierarchy and blockers

**Decision**: Reuse Work creation and relationship operations for child work. Do not add a
parallel parent or blocker graph.

**Evidence**:

- `packages/cli/src/modules/ai-department/work/work.service.ts` has `createRelationship`
  for `parent` and `blocks`. It checks same-department records, duplicate edges, parent
  count, and cycles.
- `packages/cli/src/modules/ai-department/database/entities/work-item.entity.ts` stores
  the stable assignee, state, review policy, current attempt, and version.
- `specs/003-ai-department-work-management/data-model.md` states that unresolved blockers
  prevent readiness and completion.

**Implication**: `delegate` needs one idempotent operation that creates the child and both
relationships safely. A partial success must be reconciled before retry.

## Member routing data

**Decision**: Add normalized, coordinator-maintained expertise tags. Do not infer skills
from role text or call a model to choose a recipient.

**Evidence**:

- `packages/cli/src/modules/ai-department/database/entities/member.entity.ts` currently
  stores `departmentId`, `role`, `managerMemberId`, and `archived`; it has no expertise
  field.
- Executor binding is a separate record. `MemberService` validates and changes the
  binding in `packages/cli/src/modules/ai-department/member.service.ts`.
- The existing directory and work services enforce project and department boundaries.

**Implemented routing**: Match normalized expertise tags supplied by the `ask` action against
the maintained tags. Require same project and department, non-archived member, a current
usable binding, non-self recipient, and no recipient already present in the request chain.
Use a stable member ID as the final tie-breaker. If no specialist matches, try the
requester member's manager and then the Work's stored assignment actor. Recheck the human's
current project access before offering the response action.

**Current boundary**: The current Agent provider is checked through the executor owner for
availability and authorization. A persisted binding reference alone does not prove
current runtime availability. Other executor providers need their own verified capability
contract before routing to them.

## Agent one-turn invocation and recovery

**Decision**: Keep model execution, prompts, tool registry, stop proof, and owner execution
history inside the Agents owner. Generalize the meeting invocation mechanics; do not reuse
meeting identifiers or tables as the consultation domain.

**Evidence**:

- `specs/008-ai-department-meetings/contracts/agents-invocation.md` defines an Agents-owned
  bounded no-tools invocation, durable idempotency, result lookup, stop, and recovery. Its
  request identity is tied to `meetingId`, `participantId`, and `round`.
- `specs/008-ai-department-meetings/tasks.md` records incomplete live provider/native and
  restart acceptance for that owner path.
- `specs/feature-contracts/ai-department/README.md` and
  `specs/feature-contracts/ai-department/evidence.md` record that G1 wake/coalescing
  acceptance remains open. The plan must not treat the wake lane as runtime-verified.

**Implication**: Define a consultation owner contract keyed by help request, requester
attempt, recipient member, binding revision, request key, and input hash. Require durable
acceptance, bounded output, no effective tools, stop confirmation, result lookup, and
late-result fencing. Gate Agent-to-Agent replies and requester continuation on G1 and
owner acceptance. Human responses can proceed without an Agent invocation.

## Meetings and UI retirement

**Decision**: Supersede the manual meeting workflow in Spec 008. Remove meeting creation
from navigation when the replacement UI ships. Preserve existing meeting data until a
retention and migration decision is approved.

**Evidence**:

- `specs/008-ai-department-meetings/spec.md` defines coordinator-created, multi-member
  asynchronous meetings, synthesis, minutes, approval, and action-item conversion.
- Meeting persistence and owner invocation are separate from Work and Agent work
  attempts. The current meeting owner contract is not a generic consultation contract.

**Rejected alternative**: Drop meeting tables as part of the first UI change. This could
remove existing meeting records and couples navigation removal to an irreversible data
operation. Use a separate, explicit retirement migration after access, retention, backup,
and rollback needs are reviewed.

## Decisions and remaining gates

| Decision or gate | Result | Evidence status |
|---|---|---|
| Structured report in the existing Agent turn | Use typed fields in `submit` | SQLite integration and component tests pass |
| Coordinator business review | Keep current work review policy | Existing domain contract; coordinator runtime acceptance remains separate |
| Agent manager reviews every completion | Off by default | Product choice confirmed in this session |
| Recipient selection | Deterministic expertise tags and fixed fallbacks | Selector and routing-service tests pass; runtime Agent answer stays gated |
| Human answer | Work detail action with current project authorization | SQLite service and frontend component tests pass; requester continuation stays gated |
| Agent answer | Generic Agents-owned one-turn invocation | Blocked until owner contract and current G1 acceptance are verified |
| Requester continuation | Durable answer before coalesced wake | Blocked until owner wake/coalescing and restart acceptance pass |
| Child work | Create one child and both relationships atomically | SQLite integration covers replay, conflicting payload, and parent submit blocking |
| Meeting table retirement | Separate migration after data disposition | Blocked until data review and rollback strategy are defined |

## Meeting data disposition proposal (not approved)

This proposal records the review needed before any table retirement. The active UI can
stop creating meetings while existing rows and authorized read APIs remain available.
No table or row deletion is included in Spec 009.

| Area | Proposal for review | Approval state |
|---|---|---|
| Retention | Keep meeting, participant, contribution, synthesis, minutes, and action-item records until an owner and retention period are named. | Open |
| Export | Define a project-authorized export that preserves source identifiers, attribution, revisions, and timestamps before retirement. | Open |
| Backup | Take and verify a database backup before any migration that changes meeting tables. | Open |
| Rollback | Use a staged migration that preserves rows and supports restore from the verified backup; do not drop tables in the same release as UI removal. | Open |
| Access | Keep existing project access checks for reads and exports. Confirm any administrative retention path and audit it. | Open |
| Data owner | Name the accountable owner and approve the disposition before writing a retirement migration. | Open |

This proposal records the required review and completes T034. It is not approval. Meeting
table retirement remains blocked until the data owner approves retention, export, backup,
rollback, and access requirements.
