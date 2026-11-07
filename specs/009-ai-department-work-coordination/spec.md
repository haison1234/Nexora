# Feature Specification: AI Department Work Coordination

**Feature ID**: `009-ai-department-work-coordination`
**Feature Branch**: Not created.
**Created**: 2026-11-05
**Status**: Implementation in progress; runtime and migration gates remain open.
**Input**: Replace manual department meetings with structured Agent reports, asynchronous requests for help, and delegated child work.

## Scope and Actors

AI Department Agents use the existing `inbox`, `claim`, and `progress` actions while
working. They can submit a structured completion report, ask another member for guidance
without changing the work assignee, or delegate a distinct part of the work to a child
Work item. A person can answer a request in the Work activity view. An eligible Agent can
answer in one bounded turn without tools. The requesting Agent continues only after the
answer is stored and a durable wake is accepted.

Routing uses department data and deterministic rules. It does not call a language model to
choose a recipient. Work, department members, and responses remain inside existing
project access. This feature supersedes coordinator-created multi-member meetings in
Spec 008. It removes meeting creation from the UI; retirement of meeting records and
tables requires a retention and migration plan.

## User Scenarios & Testing

### User Story 1 - Review a structured completion report (Priority: P1)

As a coordinator, I can read a consistent report when an Agent submits completed work.

**Why this priority**: A useful completion record is the base for oversight and avoids a
separate model call just to format the result.

**Independent Test**: Submit a valid report for one claimed Work item and inspect its
detail and activity. Verify empty results are rejected and review policy still controls
whether the Work enters review or completes.

**Acceptance Scenarios**:

1. **Given** a current claim, **When** the Agent submits a non-empty result with completed
   work, checked evidence, open issues, and next steps, **Then** the system stores those
   fields as one attributed activity and applies the existing review policy.
2. **Given** an empty result or an invalid report field, **When** the Agent submits,
   **Then** the server rejects the action and leaves the Work and claim unchanged.
3. **Given** review is required, **When** the report is accepted, **Then** the coordinator
   can review it under the existing business review flow without an automatic Agent
   manager review call.
4. **Given** the report has no open issues, **When** it is submitted, **Then** it does not
   create an extra manager Agent call. **Given** it has open issues, **Then** it appears in
   coordinator attention.

### User Story 2 - Ask for help and continue the same Work (Priority: P1)

As an Agent, I can ask a qualified member a question, end my current turn, and continue
after a durable answer arrives without changing the Work assignee.

**Why this priority**: The Agent can get expertise or a decision without convening a
meeting or transferring ownership of the task.

**Independent Test**: Start a claimed attempt, request help, verify the turn ends and the
Work becomes blocked with a durable request, answer as a person or bounded Agent turn,
then verify the original Agent receives the answer and can continue under valid authority.

**Acceptance Scenarios**:

1. **Given** an Agent with a current claim, **When** it asks with a question, what it tried,
   and why it needs help, **Then** the server records the request, keeps the assignee,
   blocks the Work, and ends the current turn only after safe stop is confirmed.
2. **Given** a requested specialist in the same department, **When** the server validates
   the recipient, **Then** it accepts only a different active, bound member who is not in
   the current request chain.
3. **Given** no valid specialist, **When** the router selects a fallback, **Then** it
   tries the configured manager and then the Work's stored assignment actor, subject to current
   access and answer capability.
4. **Given** an Agent recipient, **When** the request is dispatched, **Then** the owner
   runs one bounded turn with no tools and returns only a bounded answer or a terminal
   failure state.
5. **Given** a person recipient, **When** they answer in Work activity, **Then** the
   response is attributed to that person and no Agent invocation is created for them.
6. **Given** a valid answer, **When** it is durably recorded, **Then** the system places
   the answer in the Work activity and requests a coalesced wake for the original Agent.
   The answer does not grant tool, project, or execution permission.

### User Story 3 - Delegate a child Work item (Priority: P2)

As an Agent manager, I can assign a separate piece of work to one of my direct reports
and keep responsibility for the parent result.

**Why this priority**: Guidance and execution are different. A child item makes ownership,
progress, and dependencies visible when another member must perform work.

**Independent Test**: Delegate one child item, inspect its assignment and parent/blocker
relationships, then complete the child and verify the parent can resume.

**Acceptance Scenarios**:

1. **Given** a current claim and an eligible same-department recipient, **When** the Agent
   delegates a bounded instruction, **Then** the server creates one child Work item and
   links it to the parent with cycle-safe `parent` and `blocks` relationships.
2. **Given** a duplicate delegate command, **When** it is replayed with the same identity
   and payload, **Then** it returns the original child Work and creates no duplicate.
3. **Given** the child remains unresolved, **When** the parent is resumed or submitted,
   **Then** the server rejects the transition until the blocker is resolved.
4. **Given** the child is assigned to a bound direct report, **When** the delegate
   transaction commits, **Then** the server stores its eligibility and wake intent in the
   same transaction and the existing lane starts the assigned Agent once.
5. **Given** the proposed recipient is a peer, manager, or indirect report, **When** the
   Agent delegates, **Then** the server rejects the command without creating a child.
6. **Given** a child Agent can delegate its own scoped part, **When** it does so during a
   separate claimed turn, **Then** it can assign only to its own direct report. The org
   tree remains the bound on delegation depth; the system does not create work recursively.
7. **Given** a child submits a result, **When** its configured review stages finish, **Then**
   authorized users can read that report from the parent work tree. When every child
   blocker is resolved and the parent Agent attempt is terminal, the parent becomes
   eligible and receives one durable wake.

### User Story 4 - Replace meeting creation with work support (Priority: P2)

As a coordinator, I see reports, help requests, and delegated work in the existing Work
and attention views instead of a manual meeting creation flow.

**Why this priority**: The department should expose the everyday coordination flow the
team needs without asking users to assemble a meeting first.

**Independent Test**: Open the department UI and verify meeting creation is absent while
existing records remain readable until their approved retention and migration path is
complete.

**Acceptance Scenarios**:

1. **Given** the new UI release, **When** a coordinator opens the department navigation,
   **Then** there is no action to create a Spec 008 meeting.
2. **Given** existing meeting records, **When** the new feature is enabled, **Then** they
   are not silently deleted and their disposition follows the approved retention plan.
3. **Given** a help request or answer, **When** a coordinator opens Work detail or the
   attention view, **Then** the request, answer, recipient, and status are visible to
   authorized project users.

## Edge Cases

- The requested specialist is self, archived, unbound, unavailable, in another department,
  or already present in the request chain.
- The manager is unavailable, the reporting hierarchy has a cycle, or the assignment actor
  no longer has access.
- An Agent answer times out, fails, is duplicated, arrives late, or cannot be confirmed
  stopped. The requester stays blocked until a safe terminal outcome and response exist.
- The original Agent binding changes while a request is open. Do not resume with stale
  authority; require current binding validation and retain the old attempt history.
- Two answers race, or an answer and a timeout escalation race. Accept one terminal
  resolution for each request and fence late outcomes.
- A Work item reaches its ask limit, or a help request reaches its deadline. Escalate at
  most once to the configured manager and then to the stored assignment actor.
- A child Work item cannot be created or has an uncertain command result. Reconcile the
  same idempotent command before retrying.
- A meeting row exists during retirement. Preserve it until an explicit migration or
  retention decision permits deletion.

## Requirements

### Functional Requirements

- **FR-001**: The Agent Work tool MUST support one structured `submit` action with a
  required non-empty result (maximum 4,000 characters), up to 10 completed-work entries,
  up to 10 checked-evidence entries, up to 10 open issues, and up to 10 next steps. Each
  list entry is limited to 500 characters. The action MUST use the current claim and attempt.
- **FR-002**: The server MUST validate report lengths and field counts, persist the report
  in Work activity, and expose the same structured fields in authorized Work detail.
- **FR-003**: Report submission MUST apply the existing `reviewPolicy`. Agent manager
  review MUST be off by default. A clean completion MUST NOT create an extra manager Agent
  call. Open issues MUST appear in coordinator attention. Coordinator business review MUST
  remain separate from any Agent advice and tool approval.
- **FR-004**: The Agent Work tool MUST support `ask` with a question (maximum 2,000
  characters), up to 10 attempted steps (500 characters each), a reason (maximum 1,000
  characters), and up to five expertise tags (64 characters each). An ask MUST retain the
  Work assignee and create a durable request linked to the current Work and attempt.
- **FR-005**: An accepted ask MUST block the Work and end the current execution turn only
  after the executor owner confirms the turn is terminal. It MUST NOT wait for a response
  inside the current tool call or model session.
- **FR-006**: The deterministic router MUST validate project, department, active member,
  current executor binding, non-self recipient, and request-chain exclusion before it
  dispatches an Agent answer turn. It MUST use declared member expertise tags to select a
  specialist and MUST NOT use a model to select the recipient.
- **FR-007**: If no eligible specialist matches, the router MUST try the requester’s
  `managerMemberId`, then the Work’s stored assignment actor. Every fallback MUST pass current
  project authorization and answer-capability checks. A missing or unavailable route MUST
  remain visible and must not claim the question was answered.
- **FR-008**: An Agent recipient MUST receive one bounded, no-tools turn. The owner MUST
  enforce the request binding, source access, a proposed 10-minute recipient deadline,
  a 1,000-token and 4,000-character output limit, stop, idempotency,
  and terminal recovery. Department persistence MUST store only the bounded answer,
  safe status, and opaque owner reference.
- **FR-009**: A person recipient MUST be able to answer through a project-authorized Work
  interface. The system MUST attribute the answer and record it in Work activity.
- **FR-010**: A valid answer MUST be durably recorded before requester continuation. After
  the prior attempt is confirmed terminal, the server MUST move the Work from `blocked` to
  `ready` and create a new eligibility generation only when no other blocker remains. It
  MUST then request a wake through the existing coalesced lane. The wake MUST bind the
  requester, current binding revision, Work, request, and response identity, and remain
  safe across restart and duplicate delivery. If another blocker remains, keep the Work
  blocked and do not wake it.
- **FR-011**: An answer MUST provide information only. It MUST NOT grant permissions or
  authorize a tool action, project access, or business result acceptance.
- **FR-012**: The system MUST limit a Work completion cycle to two ask requests, including
  resumed attempts. Each recipient stage MUST have a proposed 10-minute deadline and an
  immutable request-chain record. A timeout MAY escalate once to the
  manager and then once to the assignment actor; it MUST NOT create a loop or duplicate
  escalation.
- **FR-013**: The Agent Work tool MUST support `delegate` to create one child Work item
  with an explicit recipient, a title of at most 200 characters, an instruction of 1–4,000
  characters, an idempotent command identity, and current claim checks. The child MUST
  belong to the same project and department.
- **FR-014**: The server MUST link delegated child work to its parent and block the parent
  until the child is resolved. Existing cycle, scope, version, and unresolved-blocker
  checks MUST apply.
- **FR-015**: The Work UI MUST display the structured completion report, help request,
  response, request status, recipient, and delegated child relationship in the authorized
  Work activity and detail views.
- **FR-016**: The department UI MUST remove manual meeting creation and navigation as an
  available user action when the replacement experience is released.
- **FR-017**: Existing meeting records MUST NOT be dropped or hidden from authorized
  administrative retention before their data disposition and migration are approved.
  Any schema retirement MUST have an explicit data-preserving migration strategy and
  current access checks.
- **FR-018**: Every command MUST be idempotent, version-checked where the target is mutable,
  and authorized under current project and executor access. Uncertain owner outcomes MUST
  be reconciled before retry or replacement dispatch.
- **FR-019**: An Agent MUST delegate only to an active, bound direct report in the same
  project and department. The server MUST recheck the manager link, project access,
  binding revision, current claim, and unresolved blockers in the delegate transaction.
  Delegation MUST NOT change the parent assignee or copy the parent's executor authority.
- **FR-020**: A ready child Work and its eligibility generation, wake-lane generation, and
  durable wake intent MUST commit atomically. The existing lane MUST recheck current
  assignment, access, blockers, and binding before reserving the child. Duplicate delivery
  MUST NOT create a second attempt.
- **FR-021**: A member may call a workflow only through its separately enabled
  `WorkflowCapability` and the current C5 authorization checks. Delegation MUST NOT grant
  workflow access. Invocation stays disabled while the C5 owner gates are open. Workflow
  execution results MUST remain separate from business result submission and review.
- **FR-022**: The authorized parent Work view MUST expose each child status and its
  structured result report. After a child reaches `done`, the server MUST recheck the
  parent blocker graph. If no blocker remains and the parent attempt is terminal, it MUST
  atomically move blocked parent work to ready and persist one eligibility and wake intent
  under the current parent member, binding, and assignment actor. If the parent attempt is
  active or unknown, keep the parent blocked and re-evaluate after terminal confirmation.
  The parent MUST explicitly release its turn with the `waiting_for_children` reason before
  the server can resume it. A release with another reason MUST NOT trigger automatic resume.
  A cancelled child MUST NOT resolve its blocker. Child report acceptance MUST remain
  governed by its own business review policy.

### Key Entities

- **Completion report**: Structured business result attached to one Work attempt and
  attributed to its member.
- **Help request**: Durable question, attempted steps, reason, routing chain, deadline,
  recipient, answer state, and requester attempt.
- **Help response**: One bounded answer from an authorized person or Agent, linked to the
  request and Work activity.
- **Member expertise**: Maintained normalized tags that support deterministic routing.
- **Delegated child Work**: A separate Work item assigned to a member and linked to its
  parent by existing Work relationships.
- **Delegation authority**: The current Agent member may create child Work only for an
  active direct report. Each Agent decides whether to delegate during its own claimed
  turn. The system does not recursively generate child Work.
- **Assignment actor**: The authorized person who last assigned the Work's current member.
  Store this separately from the user who starts a later attempt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A valid completion report appears in Work detail after one existing Agent
  submission turn, with no additional synthesis call.
- **SC-002**: A help request survives service restart and reaches either a recorded answer
  or an explicit terminal escalation state without changing Work ownership.
- **SC-003**: Duplicate answer, wake, and delegate deliveries create no duplicate
  response, continuation, or child Work item.
- **SC-004**: An Agent answer uses at most one no-tools owner turn per request; a resolved
  Agent consultation uses at most one answer turn and one requester continuation turn,
  excluding retries and recovery calls.
- **SC-005**: No request is routed to a member outside the same department or project, to
  the requester, or to a member in the same request chain.
- **SC-006**: Existing meeting records remain recoverable until an approved data
  disposition is completed.
- **SC-007**: A goal-linked parent can create a manager child and a staff child through
  two explicit claimed Agent turns. Each child gets one durable eligibility and wake
  intent, starts at most once, and keeps the parent blocked until its completion policy
  passes.
- **SC-008**: After C5 owner acceptance, an Agent can invoke only its enabled published
  workflow revision. Revocation or publication change blocks the next call, and workflow
  completion does not accept the Work result.
- **SC-009**: After the last child Work is accepted and the parent Agent attempt is
  confirmed terminal, the parent appears in its member's eligible inbox with one durable
  wake. Multiple children, duplicate completion events, and restart do not create another
  parent attempt.

## Assumptions

- The current Work action and attempt context remain the entry point for Agent reports,
  help, and delegation.
- Member expertise is controlled, normalized metadata edited by an authorized coordinator;
  free-form role text alone does not establish expertise.
- Work currently does not store a stable assignment actor. Spec 009 adds it and updates it
  on assignment changes. Historical records without that value skip the human fallback.
- A human answer is an information response and does not create a new Agent run.
- The existing coalesced wake lane is the intended requester continuation mechanism, but
  real-owner wake/recovery acceptance remains a release gate.
- The coordinator's current review policy continues to control completion. Agent manager
  review is disabled by default.
- Removing meeting creation can ship before table retirement. Meeting data is preserved
  until the retention and migration decision is implemented.

## Out of Scope

- Manual multi-member meetings, meeting minutes, group consensus, and group decision
  approval. Spec 008 is retained as a superseded design/history record.
- Agent manager review of every completion by default.
- Model-based recipient selection or automatic generation of expertise tags.
- Transferring parent Work ownership as a side effect of asking or delegating.
- Granting tools, credentials, project access, or review authority through an answer.
- Unbounded conversations, multiple answer rounds, or open-ended Agent-to-Agent chat.
- Deleting historical meeting data without a separately reviewed retention and migration
  path.
