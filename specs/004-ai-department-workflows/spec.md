# Feature Specification: Department Workflow Capabilities

**Feature ID**: `004-ai-department-workflows`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Draft; Feature Contract v1 decisions approved on 2026-11-03. G4, G5, and T010 acceptance are verified. Runtime invocation gates remain false pending explicit release enablement.
**Input**: Let department members call selected n8n workflows as tools for assigned work.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

## Scope and Actors

A coordinator selects workflow capabilities. An authorized executor invokes them for an
active attempt. A reader sees outcomes allowed by existing execution access. n8n remains
the workflow authoring and execution system; the department is the place to manage work.

## User Scenarios & Testing

### User Story 1 - Configure a capability (Priority: P1)

As a coordinator, I select a compatible workflow that a member can call for its work.

**Why this priority**: Workflow access must be explicit before execution.
**Independent Test**: Select a compatible workflow and reject a forbidden one without starting work.

**Acceptance Scenarios**:

1. **Given** access to a compatible workflow, **When** I enable it for a member, **Then** its purpose and expected inputs are available to that member's authorized executor.
2. **Given** no selection or insufficient workflow access, **When** execution is requested, **Then** the workflow does not start.

### User Story 2 - Follow workflow results (Priority: P1)

As an operator, I see how workflow calls contribute to an attempt.

**Why this priority**: Waiting or failure must not be shown as successful business work.
**Independent Test**: Use a controlled executor to invoke success, wait, failure, and cancellation scenarios.

**Acceptance Scenarios**:

1. **Given** an active attempt, **When** it calls a selected workflow, **Then** the call is traceable to that attempt and its work item.
2. **Given** a waiting workflow, **When** I inspect work, **Then** I see waiting as a child execution state and no false completion.
3. **Given** the same invocation is delivered twice, **When** the department processes it, **Then** it returns the existing invocation outcome instead of creating a second department invocation.

### Edge Cases

- Deleted, disabled, incompatible, or no-longer-authorized workflows cannot start new calls.
- Missing or invalid inputs are rejected before execution, with a safe correction message.
- A dispatch with unknown outcome is reconciled before another dispatch is attempted.
- n8n-owned retries remain visible as such; department retries do not silently repeat side effects.
- A cancellation request stays pending until n8n confirms its outcome. Work cancellation follows Spec 003.
- Late results remain linked to their original attempt and cannot complete a later attempt.
- When execution details are restricted, show only an authorized safe summary or an unavailable label.

## Requirements

### Functional Requirements

- **FR-001**: Members MUST invoke workflows through n8n's existing execution and credential policy.
- **FR-002**: Coordinators MUST select permitted workflow capabilities and define their use for a member. Selection MUST NOT grant extra workflow permissions.
- **FR-003**: Every invocation MUST identify its project, member, work item, active attempt, and selected capability.
- **FR-004**: Repeated delivery of one invocation request MUST NOT create duplicate department dispatch. Unknown dispatch outcomes MUST require reconciliation.
- **FR-005**: The system MUST preserve workflow waiting, retry, failure, cancellation, and successful completion as distinct child outcomes.
- **FR-006**: Authorized results MUST return to the calling executor and remain traceable from work history. Sensitive results MUST follow existing execution access rules.
- **FR-007**: The system MUST reject invalid input, unavailable workflows, and lost permissions before a new execution starts.
- **FR-008**: Workflow completion MUST NOT bypass the work item's business review policy.
- **FR-009**: Cancellation and late results MUST follow Edge Cases and the work lifecycle in 003.

### Key Entities

- **Workflow Capability**: Allowed workflow reference, purpose, and input expectations.
- **Invocation**: One request and its link to n8n-owned execution and outcome.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every authorized call in the acceptance set is traceable from work item to attempt to workflow outcome.
- **SC-002**: Every unselected, unauthorized, unavailable, or invalid-input acceptance case starts no new workflow execution.
- **SC-003**: Duplicate-delivery cases create one department dispatch per request; uncertain cases show pending reconciliation.
- **SC-004**: Waiting, retrying, cancelled, failed, and successful calls have distinct visible labels in all acceptance cases.

## Assumptions

- Requires 003 and one verified executor binding. 005 is needed only for an external executor.
- The first release uses workflows in the same n8n instance and project context.
- Existing workflow policy owns version selection and credentials. Use the published compatible version. Pin its publication and input-schema identity. A publication change requires capability revalidation before a new call.

## Out of Scope

- A department workflow editor, a second workflow engine, copied credentials, remote n8n instances, or guaranteed exactly-once external side effects.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/service-api.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).

## C5 Workflow bridge — Approved 2026-11-03

### Approved C5 requirements

Use published compatible workflow content and pin its publication and input-schema identity. Require current `agent:execute`, `workflow:execute`, caller policy, and credential checks at dispatch. A publication change requires capability revalidation. Owner invocation keys must resolve uncertain acceptance. Workflow waiting, retries and terminal outcomes remain child states. Revoke new calls and request stop on active children after access loss.

G4 acceptance is verified for published workflow identity, invocation lookup, inherited-tool enforcement, production queue acceptance, and owner recovery across separate processes. G5 is verified for persisted revocation of waiting/retrying children: a fresh main process reloads the SQLite intent, runs production Department reconciliation and Agents owner stop, and a fresh worker receives the Redis stop through production `ExecutionStopService` and `JobProcessor`. The production `ManualExecutionService` and workflow engine run a test workflow node; the node observes the abort signal. T010 provider-backed quickstart acceptance is verified with one exact-version child execution, a successful owner receipt, and a submitted business result. Keep the runtime invocation gates false until release enablement. These gates do not block unrelated department planning.
