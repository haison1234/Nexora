# Paperclip Feature Parity Review for AI Department

**Reviewed**: 2026-11-02
**Paperclip revision**: `8ea240218dc1d3a94afea1294b377021045dd9c9`
**Purpose**: Map the Paperclip source areas that match the AI Department product and identify the behavior the n8n implementation must provide.

This review covers the Paperclip organization, goal, issue, Agent runtime, review,
and operations UI flows. It does not claim a review of every Paperclip feature.
The inspected checkout is `/tmp/paperclip-source-light`; no source was copied.

## Product Scope Being Compared

The requested parity target is the user-visible behavior for:

- Defining departments, roles, managers, and AI member identity.
- Defining goals and assigning work to AI members.
- Letting Agents claim or receive work and run it through an executor.
- Following active work, attempts, results, blockers, and errors.
- Reviewing business results and keeping tool approval separate.
- Seeing the organization, queue, details, and operational activity in the UI.

Paperclip does not have the same department entity as this product. Its company
Agent roster and `reportsTo` hierarchy provide the closest organization model.
The n8n department remains a first-class group around that model.

“Parity” means matching the user workflows and outcomes in this scope. It does
not mean importing Paperclip's database, HTTP framework, Agent runner, company
permissions, or runtime implementation into n8n.

## Paperclip Source Map

| Capability | Paperclip source inspected | Behavior relevant to AI Department |
|---|---|---|
| Organization and Agent roster | `server/src/routes/agents.ts`, `server/src/services/agents.ts`, `packages/db/src/schema/agents.ts`, `ui/src/pages/Agents.production.tsx`, `ui/src/pages/OrgChart.production.tsx`, `ui/src/pages/AgentDetail.production.tsx` | Agent identity, role, reporting manager, availability/status, lifecycle actions, Agent list/detail, and org chart. |
| Company membership and access | `server/src/routes/access.ts`, `server/src/routes/authz.ts`, `ui/src/pages/CompanyAccess.tsx`, `ui/src/pages/JoinRequestQueue.tsx` | Human/Agent invitations, join requests, company membership, grants, and access administration. `access.ts` is not the issue execution service. |
| Goals | `server/src/routes/goals.ts`, `server/src/services/goals.ts`, `packages/db/src/schema/goals.ts`, `ui/src/pages/Goals.tsx`, `ui/src/pages/GoalDetail.tsx`, `ui/src/components/GoalTree.tsx` | Goal CRUD, ownership, parent hierarchy, linked work, and goal views. |
| Work and coordination | `server/src/routes/issues.ts`, `server/src/services/issues.ts`, `packages/db/src/schema/issues.ts`, `ui/src/pages/Issues.tsx`, `ui/src/components/IssuesList.tsx`, `ui/src/pages/IssueDetail.tsx` | Work CRUD, assignment, priority, parent/child work, blockers, status, atomic checkout/release, comments, activity, documents, and results. |
| Execution policy and review | `server/src/services/issue-execution-policy.ts`, `server/src/services/issue-review-policy.ts`, `packages/db/src/schema/approvals.ts`, issue route tests | Version-checked transitions, staged decisions, reviewer policy, comments, and separation of business review from runtime/tool approval. |
| Runtime dispatch and recovery | `server/src/services/heartbeat/`, `server/src/services/execution-control-work.ts`, `server/src/services/acknowledged-native-stop.ts`, `server/src/services/agent-lifecycle.ts`, `docs/agents-runtime.md`, `doc/AGENT-LIFECYCLE.md` | Assignment and on-demand wakeups, coalescing, heartbeat runs, cancellation, retries, durable recovery, runtime status, and live updates. |
| Operations and live UI | `ui/src/pages/Dashboard.tsx`, `ui/src/pages/DashboardLive.tsx`, `ui/src/pages/WhatNeedsMe.tsx`, `ui/src/pages/IssueDetail.tsx`, `ui/src/context/LiveUpdatesProvider.tsx`, `ui/src/pages/AgentDetail.production.tsx` | Attention queue, organization and work status, run history, activity, chat/comments, progress, and reconnect behavior. |

The repository root `DESIGN.md`, `docs/api/issues.md`, `docs/agents-runtime.md`,
and `doc/AGENT-LIFECYCLE.md` were also reviewed to cross-check code flows and
intended behavior. `server/src/routes/access.ts` is large and includes many
onboarding and administration routes; only the membership/invitation paths
relevant to the product were included here.

## Behavior Flow Observed in Paperclip

1. A company administrator configures Agents and their `reportsTo` relationships.
2. A coordinator creates goals and issues, sets priority and ownership, and may
   create parent/child or blocker relationships.
3. Assignment, explicit wakeup, or a timer can trigger an Agent heartbeat. The
   runtime coalesces a wakeup when an Agent already has active work.
4. An Agent claims work with a run identity. The server guards ownership and
   status transitions, records activity, and wakes the assigned Agent when work
   or feedback requires action.
5. A heartbeat runs through the selected adapter. Runtime state and run history
   remain associated with the Agent and issue. Retry and recovery reconcile the
   known run; they do not blindly create another execution.
6. The Agent can report progress, ask for a decision, or move work into review.
   The configured execution/review policy decides who can advance that stage.
7. Operators follow issue history, comments, live runs, outcomes, and errors in
   the dashboard and detail views. Reconnecting refreshes the current state.

This flow is materially different from the current n8n adapter, which starts a
hidden `n8n_chat` message after a human start command and polls Agent execution
snapshots. That adapter is an integration prototype; it is not equivalent to
Paperclip assignment wakeups, Agent claim/checkout, heartbeat ownership, or the
Paperclip execution policy.

The current adapter also maps `execution.status === 'success'` to a successful
work outcome. Paperclip separates a runner process ending successfully from an
Agent explicitly reporting task state through issue operations. The n8n work
contract must not mark business work complete from transport/runtime success
alone. An Agent must report completion with a result through an authorized
department action; otherwise the attempt can be successful while the work stays
in progress, blocked, or awaiting review.

## Parity Matrix Against Current n8n Specs and Code

| Area | Paperclip behavior | Current n8n behavior | Gap for parity |
|---|---|---|---|
| Organization | Company Agent roster and `reportsTo` hierarchy, status, lifecycle controls | Specs 002 and 006 define department/member/manager; backend has directory CRUD and optional Agent binding | Preserve department identity, then provide member roster, reporting tree, availability, and useful member detail in UI. Avoid treating an Agent binding as the member itself. |
| Goal hierarchy | Goal owner and parent relationships, goal tree/detail, links to issues | Spec 003 has goals, owner, parent, and cycle checks | Confirm goal detail, linked work, progress/status aggregation, and edit/archive behavior in UI. |
| Work model | Issues support assignment, priority, hierarchy, blockers, multiple statuses, comments/activity, and linked artifacts | Spec 003 has a smaller Work Item state machine, one assignee, attempts, and review decision | Add parity for task hierarchy/blockers, Agent-visible work queues, progress/activity, and result/comment presentation where required. |
| Assignment and claim | Assignment can wake the Agent; Agent claims work atomically with run ownership and can release/reclaim under guarded rules | Coordinator starts a work item; backend creates an attempt and sends a hidden chat | Redesign dispatch around a durable Agent/work claim contract. Define trigger, claim, lease/ownership, duplicate wakeup, and recovery semantics. |
| Runtime | Heartbeat creates identifiable runs with adapter/session config, status, logs, cancellation, and recovery | Adapter reads internal Agent chat queue/execution tables and polls timestamps | Replace private-table coupling with an Agents-owned public contract. Match user-visible run status, progress, recovery, and cancellation semantics. |
| Lifecycle and policy | Execution policy can define stages, participant/reviewer policy, decisions, and bounded review rounds | Fixed 003 lifecycle with `required` or `automatic` review and current project updater authorization | Model the relevant execution/review policies and allowed actors. Keep native n8n tool approval owned by Agents. |
| Authorization | Company membership/grants, Agent identity, issue access, action-specific policies | n8n project scopes plus `agent:execute` and executor binding checks | Translate permission behavior to project/member scopes; do not port company roles or grant tables. Check current access on actions and deliveries. |
| Observability | Dashboard/attention views, Agent status, heartbeat history, comments/activity, live updates | Backend history is durable; UI is still partial, and dispatch status is snapshot-polled | Provide overview, work queue/detail, people/org view, activity, run detail, freshness/disconnected states, and timely updates. |
| Frontend | Separate pages for Agents/org, Goals, Issues, issue detail, dashboard, and Agent runtime detail | AI Department module currently has limited directory and binding UI; 006 remains incomplete | Build the corresponding 2D surfaces and all core actions before optional 3D. |

## Functional Scope to Match

The relevant Paperclip behavior implies these parity capabilities for the n8n
product:

1. **People and organization**: add/edit/archive department members, roles,
   manager relationships, Agent binding, availability, and member detail.
2. **Goals**: create/edit/archive goals, assign owners, build a hierarchy, show
   linked work and progress.
3. **Work coordination**: create/edit/filter work; assign members; set priority,
   due date and review policy; relate parent/child work and blockers; keep a
   safe activity trail.
4. **Agent pickup and execution**: assignment or explicit action can wake the
   selected Agent through an owner contract; one current attempt owns the work;
   claim/release/recovery are idempotent and version-checked.
5. **Run operations**: expose active/suspended/terminal progress, result
   references, retry, stop request and confirmed stop, failure explanation, and
   recovery after lost response or restart.
6. **Review and approvals**: support reviewer policy and durable decisions.
   Business review never grants tool permission. Native Agent approvals remain
   in the Agent owner.
7. **Operations UI**: provide Overview/attention, Work, People, Activity, and
   authorized work/attempt detail. Show stale, loading, disconnected, blocked,
   review, and cancellation-pending states. Keep all core actions in 2D.

These capabilities extend the original 002/003/006 draft scope. The reviewed
contract and acceptance cases are now captured in the 003 and 006 specs. In
particular, autonomous timer heartbeats, external
coding runners, budgets, credentials, and cross-project administration are not
automatically included just because Paperclip has them.

## n8n Ownership Mapping

| Paperclip concept | n8n product owner |
|---|---|
| Company and company-scoped permissions | n8n project and existing project RBAC |
| Paperclip Agent identity and reporting line | AI Department member, role, and manager relationship |
| Paperclip issue/goal | AI Department work item/goal |
| Paperclip adapter and heartbeat execution | Existing n8n Agent or later verified runtime adapter |
| Paperclip tools/connectors | Authorized n8n workflow/Agent capabilities and existing credentials |
| Paperclip run/checkpoint/log | Agent/execution owner; department keeps attempt identity, safe status, and authorized references |
| Paperclip review stage | AI Department business review policy and append-only decision |
| Paperclip activity/live updates | Department-safe events, checked against current project access |

The adapter must stop reaching into private Agent repositories as its public
contract. The owner boundary remains in force while user-visible behavior reaches
parity.

## Readiness and Limits

- The earlier Spec 003 implementation copied selected patterns: version checks,
  a pure transition function, durable attempt/dispatch intent, acknowledged-stop
  handling, reconciliation, and a separate review record.
- Those patterns do not make the resulting end-to-end flow functionally equal to
  Paperclip. The hidden-chat dispatch and the absence of Agent claim/heartbeat
  coordination are the largest architecture gaps.
- Spec 003 is still marked Draft and its T013 real-Agent acceptance is open.
- Spec 006 is still Draft and the operations UI is incomplete.
- This review is source analysis, not implementation, browser validation, or
  proof that the current Agent adapter works with a real Agent.

## Current n8n Source Cross-Check

The current feature path was inspected in:

- `packages/cli/src/modules/ai-department/work/work.service.ts`
- `packages/cli/src/modules/ai-department/work/work-lifecycle.ts`
- `packages/cli/src/modules/ai-department/work/work.controller.ts`
- `packages/cli/src/modules/agents/agent-department-execution.adapter.ts`
- `packages/cli/src/modules/agents/agent-department-execution.contracts.ts`
- `packages/modules/ai-department/frontend/src/views/AiDepartmentHomeView.vue`
- `packages/cli/src/modules/agents/BUILT_IN_TOOLS.md`

`WorkService.startWork()` currently requires a coordinator start/retry command,
reserves an attempt, then dispatches outside the transaction. The native adapter
enqueues an `n8n_chat` payload and discovers the corresponding execution through
Agents-owned internals. `reconcileAttempt()` converts an execution snapshot into
the work lifecycle. The controller checks project scopes and `agent:execute`.
The UI provides an initial overview, work list/detail, people, and activity
sections, but it does not yet expose a Paperclip-equivalent Agent inbox/claim
flow, issue hierarchy/blockers, or full run conversation/decision history.

The core rewrite therefore needs an Agents-owned work contract with, at minimum:

- Assignment/wakeup delivery with stable event identity and duplicate coalescing.
- Agent-readable assigned work and an atomic claim/lease operation.
- Attempt-scoped actions for progress, comments, block/unblock, completion with
  a result, review request, and release/handoff.
- Current project/member/binding authorization for every action and event.
- Explicit separation of wake/run status from business work status.
- Reconciliation and cancellation that retain owner confirmation semantics.

This is a design requirement, not an assertion that the current Agents module
already exports this contract. The implementation plan must specify the exact
Agent identity/auth context and the runtime's tool/endpoint integration before
the old private-table adapter is replaced.
