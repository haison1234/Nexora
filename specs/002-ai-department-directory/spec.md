# Feature Specification: AI Department Directory

**Feature ID**: `002-ai-department-directory`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Draft; C1 contract decisions approved and current-revision acceptance verified on 2026-11-03
**Input**: Organize AI departments and members under one shared department interface.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

## Scope and Actors

A project reader views the directory. A coordinator is a project member whose existing
permissions allow department changes. These are capability descriptions, not new login
roles. Authorization mapping belongs in the plan. A department member is an AI worker
identity. Its executor configuration is a separate reference.

## User Scenarios & Testing

### User Story 1 - Maintain a department (Priority: P1)

As a coordinator, I create, rename, and archive a department to organize work.

**Why this priority**: All later work needs a stable department context.
**Independent Test**: Maintain one department in a project without configuring an executor.

**Acceptance Scenarios**:

1. **Given** coordinator access, **When** I create a named department, **Then** it appears only in that project.
2. **Given** read-only access, **When** I request a change, **Then** it is denied and existing data remains unchanged.
3. **Given** an archived department, **When** I inspect history, **Then** prior members and work references remain readable to authorized readers.

### User Story 2 - Organize AI members (Priority: P1)

As a coordinator, I add a member, define its role and manager, and optionally bind an executor.

**Why this priority**: Responsibility must be clear before runtime integration exists.
**Independent Test**: Create two members, set a manager, and replace an executor reference without changing member identity.

**Acceptance Scenarios**:

1. **Given** no configured runtime, **When** I add a member, **Then** it appears as unconfigured and cannot start work.
2. **Given** a permitted executor, **When** I link it, **Then** the member keeps its identity and does not gain extra executor permissions.
3. **Given** a proposed reporting cycle or manager outside the department, **When** I save, **Then** the change is rejected without a partial hierarchy update.
4. **Given** a member with no nonterminal work, **When** I archive it, **Then** it remains readable in history and cannot receive new work.

### Edge Cases

- Blank names and duplicate active department names after trimming and case folding are rejected.
- A member has at most one active department membership in this release.
- Archiving is rejected while the department or member owns nonterminal work; the reason lists that work.
- An archived member remains readable, keeps its identity and binding history, and cannot receive new work.
- A manager with active reports cannot be archived until those reports are explicitly reassigned. Moving a member between departments is rejected while it owns nonterminal work or manages active reports; manager links must remain valid in the target department.
- An executor that is deleted, disabled, or no longer accessible makes the member unavailable for new starts. History remains.
- Conflicting edits reject the stale change and show the current record.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST scope all directory records and changes to one project.
- **FR-002**: Coordinators MUST be able to maintain a department name, description, and archive state.
- **FR-003**: Coordinators MUST be able to maintain member name, role, department, and optional manager.
- **FR-004**: A member MUST retain its identity when an optional executor binding changes. Binding changes MUST affect future attempts only.
- **FR-005**: The system MUST reject self-management, reporting cycles, cross-department managers, and cross-project executor links.
- **FR-006**: Readers MUST NOT gain permission to change a department or execute tools through directory membership.
- **FR-007**: Archiving MUST preserve history and MUST follow the active-work restriction in Edge Cases.
- **FR-008**: Invalid or conflicting edits MUST leave the previous complete record unchanged and explain the rejection.
- **FR-009**: The directory MUST expose each member's configured, unconfigured, or unavailable execution state separately from its work status.
- **FR-010**: Directory roles MUST NOT grant n8n permissions. Routes MUST use registered `agent:list`, `agent:read`, `agent:create`, and `agent:update` scopes.
- **FR-011**: Binding changes MUST preserve member identity and past attempt snapshots. They MUST deny further old-context actions. Runtime stop and recovery MUST follow the C3 owner contract.
- **FR-012**: Department and member archive MUST use the shared admission fence. Archive MUST fail closed when the work guard is unavailable. It MUST be denied for nonterminal business work or a dispatching, active, or suspended runtime attempt.
- **FR-013**: Due dates MUST use UTC instants and MUST NOT schedule execution or wakeups.

### Key Entities

- **Department**: Project-owned group with name, description, and archive state.
- **Member**: Stable AI worker identity with role and optional manager.
- **Executor Binding**: Authorized reference to runtime configuration; it contains no copied credentials or prompt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a guided acceptance session, a coordinator creates a department with two members in two minutes or less.
- **SC-002**: Every unauthorized or cross-project case in the acceptance set is denied without exposing protected directory content.
- **SC-003**: Every rejected hierarchy or concurrent-edit case preserves the previous complete record.

## Assumptions

- The [roadmap fixture](../AI-DEPARTMENT-ROADMAP.md) defines the initial scale. Due dates are planning metadata; they do not schedule work.
- Existing project access is reused. Exact scope mapping is verified in the plan.
- Executor integration is delivered by later slices. Unconfigured members are valid.

## Out of Scope

- Human HR management, multiple active department memberships, and automatic hiring.
- Runtime start, workflow execution, and business review.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/department-api.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).

## C1 Directory — Approved 2026-11-03

### Approved C1 requirements

- Binding changes preserve member identity and old attempt snapshots. They deny further old-context actions. Runtime stop and recovery follow C3.
- Archive and assignment share the work admission fence. Archive is denied if business work is nonterminal or the current runtime attempt is dispatching, active, or suspended. A missing guard fails closed.
- Department and member roles grant no n8n scopes. Use registered `agent:list`, `agent:read`, `agent:create`, and `agent:update` scopes.
- Due dates use UTC instants and do not schedule wakeups.

C1 decisions and current-revision acceptance are complete. T030–T034 pass. Runtime stop and recovery after binding revocation remain under C3.
