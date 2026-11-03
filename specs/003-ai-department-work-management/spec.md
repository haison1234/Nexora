# Feature Specification: AI Department Goals and Work

**Feature ID**: `003-ai-department-work-management`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Draft; Feature Contract v1 decisions approved on 2026-11-03. G1/G2 owner-boundary designs are closed. G2 owner implementation and runtime acceptance remain open; they gate handoff/recovery acceptance, not C2 planning/inbox tasks.
**Input**: Define goals, assign work to AI members, follow attempts, and review results.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

## Scope and Actors

A reader inspects work. A coordinator creates, assigns, starts, retries, and requests
cancellation when existing project permissions allow it. A reviewer can accept or return
results under the project's approved review policy. These capabilities do not create new
login roles. Execution requires an enabled, authorized binding. Manual work organization
and review of seeded examples must work before any runtime is enabled.

The parity target and inspected Paperclip modules are recorded in
[the Paperclip parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md). This feature
must support Agent pickup and explicit business work updates. A successful n8n execution
is not proof that the assigned work is complete.

## User Scenarios & Testing

### User Story 1 - Define and assign work (Priority: P1)

As a coordinator, I define a goal, create work, and assign a department member.

**Why this priority**: The department needs a clear instruction and accountable member.
**Independent Test**: Organize a goal and work item without starting an attempt.

**Acceptance Scenarios**:

1. **Given** an active department, **When** I create work, **Then** its instruction, owner, priority, and review policy are visible.
2. **Given** a member in another department or an archived member, **When** I assign work, **Then** the assignment is rejected.
3. **Given** a goal-parent cycle or a parent outside the department, **When** I save, **Then** no relationship changes.

### User Story 2 - Let an Agent pick up assigned work (Priority: P1)

As a coordinator, I assign ready work to an AI member and the bound Agent can receive,
claim, execute, and report that work.

**Why this priority**: Assignment must cause accountable Agent action and keep task state
separate from runtime state.
**Independent Test**: Assign work to a controlled Agent owner, deliver one wake, claim the
work, report progress, then report a result or blocker.

**Acceptance Scenarios**:

1. **Given** assigned work becomes ready, **When** its wake request is delivered more than once, **Then** the owner coalesces duplicate wakeups and preserves one current claim.
2. **Given** an Agent claims ready work, **When** another Agent or run tries to claim it, **Then** the stale or competing claim is rejected without changing the current owner.
3. **Given** a successful Agent execution with no work completion report, **When** the run ends, **Then** the work does not become done or enter review.
4. **Given** an Agent explicitly reports progress, a blocker, or a result, **When** the owner accepts the update, **Then** the department records the authorized actor, attempt, version, and safe activity summary.
5. **Given** a failed or interrupted runtime attempt, **When** recovery runs, **Then** the work remains recoverable and the attempt failure is visible separately from business work status.
6. **Given** running work, **When** a coordinator requests cancellation, **Then** cancellation stays pending until the owner confirms the run stopped.
7. **Given** an unconfigured or unauthorized member, **When** work is assigned or started, **Then** no unauthorized execution begins and the reason is visible.
8. **Given** ready work, **When** an authorized coordinator explicitly starts it, **Then** the same durable eligibility and wake path is used as readiness, with no duplicate attempt on command replay.

### User Story 3 - Review the result (Priority: P1)

As a reviewer, I accept or return a result under the work item's review policy.

**Why this priority**: A finished run is not always an accepted business result.
**Independent Test**: Review an existing result without starting another execution.

**Acceptance Scenarios**:

1. **Given** successful work requiring review, **When** the attempt completes, **Then** work enters review and stays there until an authorized decision.
2. **Given** work in review, **When** I return it with a reason, **Then** it becomes ready and preserves the rejected result.
3. **Given** a stale or unauthorized decision, **When** it is submitted, **Then** no work or tool permission changes.
4. **Given** a review policy that excludes the requester or requires a human, **When** a disallowed actor submits a decision, **Then** the decision is rejected and the current review remains unchanged.

### Edge Cases

- An archived goal cannot receive new child goals or new work links. Existing work remains readable and does not complete automatically.
- Concurrent assignment, start, cancellation, and review requests use the current work version; stale changes are rejected.
- Restart or uncertain dispatch does not justify a second start until the existing attempt is reconciled.
- A late event for a terminal or older attempt is retained as permitted history but cannot change current work.
- An Agent execution success, failure, or cancellation does not directly set business work state without an accepted work action or owner reconciliation rule.
- An assignment wake can be delivered more than once. The Agent owner coalesces duplicate lane signals while preserving each work eligibility generation.
- An explicit start of ready work creates eligibility through the same wake path. Replaying the command does not create a second eligibility generation or attempt.
- Handoff fences the prior run, waits for owner-confirmed stop, and only then assigns and wakes the destination. Lease expiry alone does not transfer a claim.
- A claim has one current owner and a recoverable lease. Lease expiry denies actions but does not transfer ownership. A different run requires owner-confirmed stop, a terminal prior attempt, and a new attempt. A stale run cannot update work after a later run claims it.
- Parent/child and blocker relationships stay within the department. Unresolved blockers prevent the work from becoming ready unless a coordinator removes or resolves them.
- Comments and progress updates are attached to the work and attributed to their user or Agent actor. They do not grant execution permission.
- Tool denial or expiry blocks the proposed action; it never counts as business acceptance.
- Reassignment and review-policy changes are allowed only in backlog or ready state with no active attempt.
- Removing access after assignment prevents new actions and new event delivery under the old access.

## Requirements

### Functional Requirements

- **FR-001**: Coordinators MUST be able to maintain department goals with title, success criteria, optional parent, owner, due date, and active, done, or archived state.
- **FR-002**: Work MUST have an instruction, department, optional goal, optional assignee, priority, optional due date, and explicit review-required or automatic-completion policy. Review-required is the default and creates one `human_only` stage. Automatic completion must be selected explicitly.
- **FR-003**: The system MUST enforce the lifecycle table below and preserve a reason for returned, blocked, and cancelled work. Runtime failure belongs to the attempt record.
- **FR-004**: Start MUST require ready work, an active assigned member, an available binding, and execution permission. A repeated request MUST NOT create another active attempt.
- **FR-005**: Attempts MUST preserve their own executor binding, history, outcome, and authorized result references. Retry MUST create a new attempt.
- **FR-006**: Cancellation MUST preserve history. An unconfirmed stop MUST remain visible as pending or unknown, never as confirmed cancelled.
- **FR-007**: Only authorized reviewers MUST be able to accept or return a result. A business review MUST NOT authorize a tool action.
- **FR-008**: All accepted state changes MUST record actor, time, prior state, new state, and the relevant attempt or review.
- **FR-009**: Goal, assignee, attempt, and result access MUST stay within project and department boundaries. Execution ownership and credentials MUST remain with their existing owners.
- **FR-010**: The system MUST handle duplicate, stale, late, and concurrent changes as defined in Edge Cases.
- **FR-011**: Readiness and authorized explicit start of ready work MUST create idempotent eligibility through the same Agents-owned wake contract. Ready reassignment, review return, and completed handoff also create eligibility. Backlog assignment does not dispatch. Wake acceptance MUST be distinct from claim, runtime start, and business completion.
- **FR-012**: An authorized Agent MUST be able to list its assigned work, atomically claim or reclaim eligible work, add progress/comments, report a blocker, request review, report a result, and release or hand off a claim. Every action MUST validate current project access, member binding, attempt identity, and expected work version.
- **FR-013**: Work status MUST be separate from attempt/run status. A run finishing successfully MUST NOT complete work unless the Agent reports an accepted result or an explicit policy says how to advance it.
- **FR-014**: Work MUST support parent/child and blocker relationships, with same-department checks and blocker-aware readiness.
- **FR-015**: Execution and review policy MUST support staged review/approval participants and the relevant reviewer rules (`anyone`, `not_creator`, `human_only`) while keeping business review separate from native Agent tool approval. A required policy defaults to one `human_only` stage.
- **FR-016**: Work comments, progress, decisions, and status changes MUST be available as safe, ordered activity history for authorized readers.

### Business Work Lifecycle

| Current state | Event and actor | Next state |
|---|---|---|
| backlog | Coordinator marks valid assigned work ready | ready |
| ready | Agent owner atomically claims work | running |
| ready | Missing or unavailable executor is detected | blocked |
| running | Agent reports a blocker or cannot continue | blocked |
| running | Agent reports a result requiring review | review |
| running | Agent reports a result under automatic completion policy | done |
| running | Runtime attempt fails or stops without a business result | blocked |
| blocked | Coordinator resolves the reason and no claim is active | ready |
| blocked | Existing valid claim resumes after resolution | running |
| review | Reviewer accepts result | done |
| review | Reviewer returns result with reason | ready |
| backlog, ready, or blocked without an active claim | Coordinator cancels | cancelled |
| running or blocked with a current claim | Stop request | Same business state; cancellation pending |
| Any nonterminal state with a current claim | Owner confirms cancellation | cancelled |

A work state is `backlog`, `ready`, `running`, `review`, `blocked`, `done`, or
`cancelled`; these correspond to Paperclip's backlog, todo, in_progress, in_review,
blocked, done, and cancelled behavior. Attempt state is separate and includes queued,
running, waiting for native approval, succeeded, failed, cancelled, and unknown. Native
approval is not a business work state. Done and cancelled are terminal in this release.
New work can reference prior work. A workflow waiting inside an attempt does not imply
tool approval. Child workflow failure
does not automatically fail the whole work item. A result that completes before
cancellation is confirmed follows the work policy and records the cancellation race.

### Key Entities

- **Goal**: Department outcome and optional parent relationship.
- **Work Item**: Business instruction, assignment, review policy, and lifecycle state.
- **Attempt**: One execution with fixed binding and terminal outcome.
- **Work Relationship**: Parent/child or blocker link between work items.
- **Work Activity**: Safe comment, progress, assignment, claim, decision, or state event.
- **Review Decision**: Result acceptance or return with actor and reason.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A coordinator creates and assigns one work item in two minutes or less in the acceptance session.
- **SC-002**: All lifecycle cases, including rejected changes, match the table without losing prior attempts or review decisions.
- **SC-003**: The duplicate-start and restart scenarios each produce at most one active attempt per work item.
- **SC-004**: Every accepted transition in the acceptance set has a complete actor and state history.

## Assumptions

- Requires 002. Exact executor and reviewer permission contracts remain plan research gates.
- Priority is low, normal, or high; normal is the default. Due dates do not schedule work.
- A work item has one assignee and at most one active attempt. Goals do not start work automatically.

## Out of Scope

- Autonomous delegation loops, recurring schedules, automatic retries of side effects, and organization budget enforcement.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/service-api.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).

## C2 coordination, C3 execution, and C4 review — Approved 2026-11-03

### Approved Feature Contract v1 decisions

Assignment/readiness, review return, completed handoff, and authorized explicit start of ready work create durable eligibility. Backlog assignment does not dispatch. Explicit start uses the same wake path. A wake does not create a claim or duplicate attempt. Each run handles one work item.

Handoff names a destination and reason. Fence the old run, confirm its stop, then transfer and wake the destination. Lease expiry alone never permits another run to take over. Ordered business review stages use the approved C4 participant and actor filters.

G1 ownership design is closed: AI Department owns lane generations, coalescing, and one-run admission; Agents owns durable idempotent per-dispatch queue acceptance, lookup, and missed-wake recovery. G1 runtime acceptance remains open. G2 owner stop/recovery design is closed in `specs/feature-contracts/ai-department/execution.md`; Agents implementation and restart/revocation proof remain open and gate handoff/recovery runtime acceptance. Review and real execution acceptance stay open.
