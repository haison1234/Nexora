# Feature Specification: AI Department Meetings

**Feature ID**: `008-ai-department-meetings`
**Feature Branch**: Not created.
**Created**: 2026-11-04
**Status**: Superseded by [Spec 009: AI Department Work Coordination](../009-ai-department-work-coordination/spec.md) on 2026-11-05. Retained as a design and implementation history record. Existing meeting data remains subject to a separate retention and migration decision.
**Input**: Let a coordinator convene department members around a topic and turn approved
  decisions into traceable work.
**Analysis**: [Feature analysis](feature-analysis.md)
**Research**: [Source research](research.md)
**Plan**: [Implementation plan](plan.md)

## Scope and actors

A project-authorized coordinator creates and manages a meeting for one active department.
Selected department members provide independent input. A coordinator designates one
participant as the AI facilitator. That member prepares draft minutes after collection.
A coordinator can write or edit draft minutes if synthesis fails. A coordinator approves decisions and
action items. Existing project access governs every read and mutation.

The meeting is asynchronous. It is a durable business record, not a live chat room.
Agent execution remains with the verified Agents owner. Work creation remains with Spec
003. A meeting member does not gain runtime or project permissions from participation.

## Clarifications

### Session 2026-11-04

- Q: Which tools may Agents use during a meeting? → A: The user delegated the choice.
  Permit verified read-only research tools selected for the meeting. Use supplied
  material only when the owner cannot enforce that restriction.

The user also delegated the remaining product choices to the reviewer. The decisions
below are reviewer-selected defaults. They are not additional user answers or runtime
evidence. See [clarification review](clarification-review.md).

## Meeting behavior and limits

- A meeting has 2–10 distinct active members from one department. One participant acts
  as facilitator and also contributes. The manager is not selected automatically.
- v1 has one contribution round followed by one synthesis. Participants receive the same
  frozen briefing and their own role. They do not read other contributions before their
  response. The facilitator receives accepted contributions during synthesis.
- Each contribution returns a structured object: `stance` (`agree`, `disagree`, or
  `neutral`), up to three key points, risks, and a proposed action. Each key point, risk,
  and action is limited to 500 Unicode characters; risks are limited to three items.
  The owner enforces an
  overall limit of 1,000 output tokens and 4,000 Unicode characters, rejects malformed
  output, and truncates text fields at valid Unicode boundaries before persistence. The
  meeting stores and synthesizes only this bounded object. Synthesis input remains within
  the owner context limit.
- Draft minutes preserve disagreement. For each disputed point, they identify the
  conflicting positions and attribute each position to its contributing members. They
  must not collapse opposing positions into an unsupported consensus. The coordinator
  decides whether a proposed decision resolves the disagreement.
- The default synthesis quorum is `ceil(2N/3)`, where N is the participant count. The
  coordinator may start synthesis once the quorum submits, or when the collection deadline
  expires if at least one contribution exists. The system then closes the contribution
  set, records every participant without an accepted contribution as absent with the
  observed outcome, and does not wait for or retry those calls automatically. A late
  contribution remains audit metadata and cannot change the frozen set. If no contribution
  exists at the deadline, the system closes an empty accepted set and synthesis cannot run;
  the coordinator may retry an eligible terminal failure or cancel.
- Before start, show an estimate of up to `N + 1` model calls: one per participant and
  one synthesis call. The estimate excludes explicit retries. Quorum may reduce the count
  only when outstanding calls are stopped before dispatch; active calls may already incur
  cost. Label this as a call-count estimate, not a monetary estimate.
- A new meeting may include selected decisions from earlier meetings only when a
  coordinator approved those decisions and the reader has current access to the source
  meeting. Include the decision text, source meeting/version, and approving actor as
  authorized frozen material. Do not include prior minutes, contributions, or private
  conversation history. Recheck access at start, invocation, synthesis, and body reads.
- At start, freeze the topic, desired outcome, participant roles, initiating user,
  executor binding revisions, tool selection, approved prior decisions, and authorized
  source versions. Editing
  this briefing or participant set requires a new meeting. Source content is read only
  through an authorized owner contract; runtime prompts stay with Agents.
- Participants may use selected research tools only when the owner can enforce read-only
  operation and current access. An annotation, name, or prompt instruction alone does
  not establish that a tool is read-only. Unknown tools are excluded. Sending messages,
  changing external records, executing workflows, hiring, and creating work are excluded
  from meeting invocations. Private conversation history is not meeting context.
  Supplied-material fallback requires the owner to disable inherited tools. If it
  cannot do that, the meeting invocation is unavailable.
- The start action requires current execution access for the initiating user. Other
  coordinators can review and cancel under current project policy. A different user
  must explicitly take execution responsibility before a later invocation; their
  authority is recorded and does not silently replace an accepted invocation's actor.
- Each participant call has a proposed ten-minute deadline from owner acceptance,
  including queue time. Synthesis has a proposed five-minute deadline. Deadline expiry
  requests stop and marks the result pending reconciliation. It does not prove the
  invocation stopped or permit a replacement call.
- Synthesis starts once when the default quorum is met, or at the collection deadline
  with at least one accepted contribution. The accepted set is then frozen, including an
  empty set when no participant responds by the deadline. Minutes list
  every participant without an accepted contribution and their last known outcome, and
  preserve disagreements. No automatic retry is made for a missing or failed participant.
  With no accepted contribution at the deadline, the coordinator may retry an eligible
  terminal failure or cancel.
- The coordinator may request one retry per failed participant or failed synthesis.
  Retry requires confirmed terminal owner state, current access, and a valid binding.
  Unknown outcomes are reconciled first. No automatic provider/quota retries are added
  by meetings. Owner-internal retry limits must be recorded in the invocation contract.
- Contribution outcomes include pending, queued, running, submitted, failed, unavailable,
  stop_pending, unknown, and excluded. Only an accepted, attributed business contribution
  counts as submitted. A successful execution without a valid contribution does not.
- Approving minutes freezes that revision and records the approving user. Each action
  item then requires an explicit create-work or decline choice. Create-work produces
  one backlog item with review required. Starting work is a separate Spec 003 action.
- The meeting is completed when approved minutes have no unresolved action items,
  all accepted meeting invocations are confirmed terminal, and no dispatch is unknown.
  Work created by the meeting can still
  be backlog, active, or under review. Later corrections use a new linked meeting.

The participant count and time limits are proposed acceptance limits. They are not
measured provider performance or a guarantee that a provider will respond in time.

## Lifecycle

| State | Meaning and next action |
|---|---|
| draft | Editable meeting; coordinator may start or cancel. |
| collecting | Participant calls are admitted. Synthesis starts at quorum or at the collection deadline when at least one contribution exists. |
| synthesizing | One accepted contribution set is frozen. The facilitator drafts minutes. Failure permits one explicit retry or coordinator-written minutes. |
| review | Coordinator reviews or edits draft minutes. Approval freezes this revision. |
| approved | Resolve action items through create-work or decline. Recover uncertain creation using the same command identity. |
| completed | Approved minutes are frozen, action items are resolved, and meeting invocations are terminal. |
| cancelling | New dispatch, synthesis, approval, and work conversion are fenced. Stop/reconcile each outstanding invocation. |
| cancelled | All accepted meeting invocations are terminal. Retain prior contributions, decisions, and linked work. |

Cancel is permitted from draft, collecting, synthesizing, review, and approved. A completed
or cancelled meeting cannot reopen. Late outputs stay attached to their original call
for audit but cannot change the accepted contribution set, approved minutes, or state.

## User stories

### US1 — Convene a department meeting (P1)

As a coordinator, I create a meeting with a topic, desired outcome, participants, and
optional goal or work references.

**Independent test**: Create a draft meeting in one department and verify its participant
list and references are visible only to authorized project users.

**Why this priority**: A stable briefing and participant set are needed before dispatch.

**Acceptance scenarios**:

1. Given coordinator access, when I create a meeting, then the system stores its topic,
   department, participants, creator, and initial state.
2. Given a member from another department or project, when I add that member, then the
   request is rejected without changing the meeting.
3. Given reader access, when I try to create or change a meeting, then the system denies
   the mutation.

### US2 — Collect independent member input (P1)

As a coordinator, I start a meeting and can see each participant's response state.

**Independent test**: Use controlled participant outcomes to verify submitted, failed,
unavailable, and pending responses remain distinguishable.

**Why this priority**: The meeting must preserve real contributions and show failures.

**Acceptance scenarios**:

1. Given a collecting meeting, when a participant submits a contribution, then the
   contribution is attributed to that member and stored in meeting history.
2. Given an Agent invocation failure or provider quota error, when the outcome is
   recorded, then the participant is shown as failed or unavailable and no contribution
   is fabricated.
3. Given project access is revoked, when a participant or reader requests protected
   meeting data, then the request is denied and cached protected data is cleared.
4. Given an Agent has a configured write tool, when it joins a meeting, then that tool
   is unavailable in the meeting invocation. If the owner cannot enforce a research
   tool's read-only operation, the invocation uses supplied material only.
5. Given an invocation outcome is unknown or stop is pending, when a retry is requested,
   then no replacement invocation starts until the original is confirmed terminal.
6. Given the quorum is met or the collection deadline expires with at least one response,
   when synthesis starts, then it uses the frozen bounded accepted set and lists all
   participants without an accepted response and their last known outcomes in draft minutes.

### US3 — Review minutes and create work (P1)

As a coordinator, I review a draft summary, decisions, and proposed action items before
they affect department work.

**Independent test**: Approve one proposed action item and verify it creates one linked
backlog work item with an idempotent command receipt.

**Why this priority**: Recorded discussion must lead to explicit, traceable decisions.

**Acceptance scenarios**:

1. Given participant contributions, when the facilitator prepares draft minutes, then
   the draft cites its source contributions and remains unapproved.
2. Given a draft decision, when an Agent proposes it, then it does not become an
   approved department decision without coordinator approval.
3. Given an approved action item, when work creation succeeds, then the meeting links to
   the created work item and replay does not create a duplicate.
4. Given a work creation failure, when the coordinator retries the same command, then
   the system reconciles the original command instead of creating another work item.
5. Given facilitator failure, when a coordinator writes minutes, then the draft follows
   the same source-reference, current-version, and approval rules.
6. Given approved minutes, when every action item is created or declined and all accepted
   meeting invocations are terminal with no unknown dispatch, then the meeting completes
   without waiting for the linked work to finish.

## Edge cases

- A meeting can synthesize with missing participants after quorum or the collection
  deadline. The minutes show each absent participant and last known outcome.
- Duplicate dispatches or command retries cannot create duplicate contributions,
  decisions, or work items.
- Late contributions cannot silently rewrite approved minutes or decisions.
- A facilitator can draft but cannot approve decisions unless separately authorized as a
  coordinator.
- A failed model call, quota limit, timeout, or uncertain owner acknowledgment remains
  visible as such; it is not reported as an empty successful contribution.
- Cancelling a meeting prevents new dispatch and approval actions. It does not cancel
  linked work unless the coordinator separately cancels that work through Spec 003.
- Cancellation remains pending until accepted invocations are confirmed terminal.
- Concurrent edits and approvals require the current meeting version. A stale command
  cannot overwrite a later version. Reusing an ID with different content is rejected.
- Active meetings prevent department archive and participant archive or transfer. Draft
  meetings with stale references cannot start. Binding changes invalidate new dispatch
  under that snapshot; accepted calls require owner reconciliation. Create a new meeting
  to use the replacement binding. These are new directory integration requirements.
- Meetings retain their history until project deletion under the existing product
  policy. v1 has no separate hard-delete or automatic purge action. Runtime retention
  remains with Agents; an expired execution link does not remove the meeting record.
- Reference access is checked at start, invocation, synthesis, approval, and body reads.
  A reader lacking source access receives no briefing, contribution, or minutes body.
  Safe list metadata must not reveal protected source titles or contents. Project access
  loss clears the cached body and prevents further dispatch and result publication.
- A changed or deleted source does not silently refresh a running meeting's briefing.
  Missing authorized snapshots block the affected invocation. No automatic substitute
  context or model-generated replacement is used.
- An empty meeting list offers creation only to permitted users. Detail views distinguish
  loading, failed read, disconnected, stale, partial participant failure, and pending stop.
  Refresh restores authoritative state without replaying commands.

## Functional requirements

- **FR-001**: The system MUST create and start meetings under one project and one active
  department. Terminal meeting history MUST remain readable after department archive.
- **FR-002**: Coordinators MUST be able to create a meeting with a topic, desired outcome,
  participants, and optional authorized goal or work references.
- **FR-003**: The system MUST validate that each participant is an active member of the
  meeting department.
- **FR-004**: The system MUST store one accepted contribution per participant in the single
  round. It MUST retain separate invocation identities and outcomes for retries.
- **FR-005**: The system MUST distinguish each participant outcome defined in Meeting
  behavior and limits. Unknown or stopping calls MUST NOT appear submitted or terminal.
- **FR-006**: The system MUST persist draft minutes, proposed decisions, and proposed
  action items with references to their source contributions.
- **FR-007**: A generated or Agent-proposed decision MUST remain a draft until a
  coordinator approves it.
- **FR-008**: The system MUST create work only through the Spec 003 work contract after
  explicit coordinator approval of that action item. New work MUST start in backlog with
  review required. Starting it requires a separate authorized Spec 003 action.
- **FR-009**: Meeting and work creation commands MUST be idempotent and recoverable after
  an uncertain response.
- **FR-010**: The system MUST enforce current project access on meeting reads, participant
  dispatch, contribution reads, approval, and work creation.
- **FR-011**: Meeting activity MUST exclude credentials, private prompts, raw tool
  arguments, and execution payloads.
- **FR-012**: The system MUST distinguish business meeting state from Agent invocation
  state and work state.
- **FR-013**: The meeting interface MUST provide 2D keyboard-accessible controls and
  localized English and Vietnamese text, visible focus, reduced motion, and a layout
  without horizontal page scrolling at 360 CSS pixels.
- **FR-014**: The system MUST enforce the frozen briefing, participant limits, one-round
  policy, facilitator role, and tool restrictions defined above.
- **FR-015**: The system MUST apply the lifecycle, exclusion, deadlines, retry, cancellation,
  and late-output rules defined above. Stop acknowledgment MUST NOT prove termination.
- **FR-016**: The system MUST retain meeting history, enforce the active-meeting directory
  restrictions, and reject conflicting edits as defined in Edge cases.
- **FR-017**: The UI MUST expose the read/reconnect states defined in Edge cases. Reconnect
  MUST fetch current records and MUST NOT repeat an uncertain command.
- **FR-018**: The Agents owner MUST limit each participant response to 1,000 output tokens
  and 4,000 Unicode characters. The meeting MUST store and pass only bounded contribution
  text to synthesis.
- **FR-019**: The system MUST apply a default quorum of `ceil(2N/3)` and start synthesis
  when the quorum is met or the collection deadline expires with at least one accepted
  contribution. It MUST freeze the accepted set and record absent participants and their
  last known outcomes.
- **FR-020**: Before start, the UI MUST show an estimate of up to `N + 1` model calls,
  excluding explicit retries, and label it as a call-count estimate.
- **FR-021**: Each participant response MUST use the structured contribution schema and
  bounded fields defined above. Malformed responses MUST NOT count toward quorum.
- **FR-022**: Draft minutes MUST identify each material disagreement, attribute each
  conflicting position to its contributors, and avoid stating unsupported consensus.
- **FR-023**: Coordinators MUST be able to include current-access decisions approved in
  earlier meetings as frozen briefing material. The system MUST exclude prior minutes,
  contributions, and private conversation history from this feature.
- **FR-024**: The UI MUST present contribution fields in a side-by-side member comparison
  and provide meeting-purpose templates with prefilled questions and output guidance.

## Key entities

- **Meeting**: Topic, goal, project and department references, state, creator, facilitator,
  version, and timestamps.
- **Participant**: Stable member ID, role snapshot, binding revision, response state,
  exclusion reason, and separate invocation references for initial call and retry.
- **Contribution**: Safe member-authored input and source metadata.
- **Minutes draft**: Summary and proposed decisions/action items with source references.
- **Decision**: Proposed or coordinator-approved outcome with actor and timestamp.
- **Action item**: Approved task description, owner, and linked Spec 003 work item.

## Success criteria

- **SC-001**: A coordinator can create and start a meeting with four members in two
  minutes or less in a guided acceptance session.
- **SC-002**: Every participant outcome is visible and attributable; the system reports
  no failed or missing response as a successful contribution. Draft minutes identify and
  attribute material disagreements without implying unsupported consensus.
- **SC-003**: Replaying meeting approval or work creation commands creates no duplicate
  decision or work item.
- **SC-004**: Every meeting decision and work item can be traced to its approving actor
  and source meeting records.
- **SC-005**: The acceptance set includes full participation, partial participation,
  facilitator failure, provider quota failure, timeout, restart after unknown dispatch,
  cancel with pending stop, duplicate work creation, binding change, and access loss.
  Each case preserves the lifecycle, authority, and replay rules above.
- **SC-006**: All create, start, inspect, exclude, retry, edit, approve, convert, decline,
  and cancel actions in the acceptance set work with the keyboard in both locales at
  360 CSS pixels, with reduced motion and the Office view disabled.

## Assumptions and limits

- v1 uses asynchronous independent contributions and one draft synthesis.
- v1 does not provide a live room, free-form peer-to-peer chat, automatic CEO behavior,
  unsupervised delegation, or recurring meetings.
- v1 has no second contribution round. A later version may offer exactly one bounded
  second round only after the coordinator reviews unresolved disagreements, and only to
  participants whose positions are involved. This remains out of scope until v1 has
  passed runtime acceptance.
- Runtime dispatch stays disabled until the Agents owner invocation and recovery contract
  is verified. Provider quota errors remain ordinary visible failures.
- Feature placement and delivery order remain proposed until the cross-feature plan is
  reviewed. Feature number does not define delivery order.

## Out of scope

- Live voice/video, synchronous multi-Agent turn-taking, automatic hiring, HR management,
  and autonomous budget or strategy authority.
- Direct writes to the 003 work tables or copied credentials/runtime state.
- A second contribution round in v1.
