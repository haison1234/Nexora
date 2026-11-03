# Feature Specification: External Coding Runtime Bridge

**Feature ID**: `005-ai-department-runtime-bridge`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Planning baseline; optional integration. Provider enablement requires the plan's contract checks.
**Input**: Connect a coding runtime to department work through an isolated runner.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

## Scope and Actors

A project coordinator connects an owner-controlled runner to a member's executor binding.
An authorized operator starts, follows, or stops a session. A tool approver has the
existing project execution permission required by the chosen action. A business reviewer
cannot grant tool permission merely because they can review a result.

## User Scenarios & Testing

### User Story 1 - Connect and revoke a runner (Priority: P1)

As a coordinator, I connect a runner with explicit project and workspace access.

**Why this priority**: Execution must have a known identity and bounded workspace.
**Independent Test**: Register and revoke a controlled runner without starting a real coding task.

**Acceptance Scenarios**:

1. **Given** a valid project grant and allowed workspace, **When** the runner connects, **Then** its identity, supported actions, and health are visible only to authorized users.
2. **Given** a revoked grant, **When** a runner requests work or reports an event, **Then** the request is denied and cannot change department state.
3. **Given** a lost connection, **When** I inspect its active session, **Then** it shows disconnected with last-known state, not confirmed stopped.

### User Story 2 - Control an assigned coding session (Priority: P1)

As an operator, I run assigned work and follow its authorized progress.

**Why this priority**: External execution must follow the work lifecycle.
**Independent Test**: Use a controlled provider to start, send a follow-up, stop, reconnect, and report a result.

**Acceptance Scenarios**:

1. **Given** ready work and a permitted binding, **When** I start, **Then** one attempt and one correlated external session are created.
2. **Given** a session in another project, **When** I try to control or inspect it, **Then** no private data or control is granted.
3. **Given** repeated or late provider events, **When** they arrive, **Then** current state remains consistent with Spec 003.

### User Story 3 - Resolve one tool request (Priority: P1)

As a tool approver, I inspect a proposed action and grant or deny it for that session.

**Why this priority**: Coding tools can change files and external systems.
**Independent Test**: Resolve valid, denied, expired, duplicate, and mismatched requests with a controlled provider.

**Acceptance Scenarios**:

1. **Given** a pending request, **When** an authorized user grants it before expiry, **Then** the decision applies to that request and active attempt only.
2. **Given** denial, expiry, or mismatched context, **When** execution is requested, **Then** the proposed action is not allowed and the attempt shows a blocked or confirmed failed outcome.
3. **Given** a consumed request, **When** a duplicate decision arrives, **Then** it cannot authorize another action.

### Edge Cases

- A runtime without supported start, stop, event, and approval behavior cannot be enabled for controlled execution.
- Revocation denies further control and events; it does not prove an already-running process has stopped.
- Reconnect must reconcile the active attempt before accepting new work. A gap in events shows stale state.
- A stop timeout shows unknown/pending cancellation. It never claims successful termination.
- A changed action description, workspace, session, or attempt invalidates its previous pending permission.
- A request expires after ten minutes by default or earlier if the provider requires it; expiry never grants permission.
- Provider output is treated as untrusted data and cannot change project permissions.

## Requirements

### Functional Requirements

- **FR-001**: A coordinator MUST bind one permitted runner and explicit workspace to an executor configuration in one project.
- **FR-002**: Operators MUST be able to start, follow, send a follow-up, and request stop only for authorized active attempts.
- **FR-003**: Each session and decision MUST be traceable to its project, member, work item, attempt, runner, and provider identity.
- **FR-004**: Revocation, expiry, reconnect, uncertain termination, and late events MUST follow Edge Cases and Spec 003.
- **FR-005**: Tool permission MUST bind to one proposed action and one active attempt. Consumed, changed, expired, or denied requests MUST NOT permit a new action.
- **FR-006**: General activity MUST contain safe summaries. Raw prompts, full transcripts, secrets, and tool arguments MUST NOT be stored in the department activity feed.
- **FR-007**: The runner MUST restrict file and process access to the configured execution boundary. Execution MUST NOT use the n8n server's unrestricted filesystem or process identity.
- **FR-008**: The first release MUST enable one provider only after its control, isolation, and approval behavior have passed the plan's contract gate.
- **FR-009**: Disabling this integration MUST leave department organization, work management, and supported other executors usable.

### Key Entities

- **Runner Grant**: Project and workspace authorization with expiry and revocation.
- **External Session**: Provider execution reference for one attempt.
- **Tool Request**: Proposed action, context, expiry, and one recorded decision.
- **Session Summary**: Authorized progress without raw transcript contents.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every session and approval decision in the acceptance set maps to exactly one authorized attempt.
- **SC-002**: Every revoked, cross-project, expired, mismatched, or replayed request in the acceptance set grants no new execution authority.
- **SC-003**: Every disconnect or unconfirmed-stop case shows last-known/unknown state rather than false completion.
- **SC-004**: Disabling the provider does not prevent any non-provider directory, planning, or review acceptance scenario.

## Assumptions

- Requires 003. One owner-controlled runner is the initial deployment assumption.
- Claude Agent SDK is the selected first implementation target. Enablement requires the pinned-provider contract and isolation checks in the plan.
- Full transcripts remain under provider storage policy. Department storage keeps references and safe decision history only.
- Tool decisions require `agent:update`, `agent:execute`, and current action-context authority. Business review alone grants no tool permission.

## Out of Scope

- Arbitrary remote shell, shared-host multi-tenant sandboxing, automatic trust of repository instructions, and guaranteed kill after network loss.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/service-api.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).

## C3 executor boundary — Approved 2026-11-03

### Approved executor boundary amendment

The optional runner must use C3 attempt reservation, claim generation, result reporting, owner stop proof and reconciliation. Lease expiry or disconnect does not permit a new process to take ownership. External grant revocation denies new actions and requests stop without claiming termination. Provider-specific isolation and approval gates remain in this feature.

G1 ownership design is closed from the native Agents queue source; its runtime acceptance remains open. G2 owner stop/recovery design remains open and blocks C3 execution task generation. This optional provider also needs its pinned-version and isolation acceptance before enablement.
