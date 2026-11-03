# Feature Specification: AI Department Operations Interface

**Feature ID**: `006-ai-department-operations-ui`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Draft; delivered as 006A and 006B in the same feature. Feature Contract v1 decisions were approved on 2026-11-03. G6 blocks live push only.
**Input**: Make the department interface the shared place to organize and follow AI work.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

The selected Paperclip-equivalent surfaces and behavior are listed in the
[parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md). The current UI implementation
is a partial shell and does not yet provide the Agent pickup and work reporting flow.

## Scope and Actors

Readers inspect allowed information. Coordinators organize work and control permitted
attempts. Reviewers decide business results. Tool approvers resolve tool requests under
the relevant executor policy. These are capabilities derived from existing project access.
006A delivers organization, queue, detail, and review using available data. 006B adds
verified execution and workflow updates. Neither slice requires external runtime 005.

## User Scenarios & Testing

### User Story 1 - Find work needing attention (Priority: P1)

As a reader, I open the department overview and identify work needing a person.

**Why this priority**: The interface must answer what needs action before showing decoration.
**Independent Test**: Use controlled department data with active, blocked, failed, and review work.

**Acceptance Scenarios**:

1. **Given** authorized project data, **When** I open the department, **Then** I see attention items before active work, ownership, and recent activity.
2. **Given** an empty department, **When** I open it, **Then** I see a clear first action matching my permissions.
3. **Given** inaccessible data, **When** I open a copied detail link, **Then** no protected content or action is exposed.

### User Story 2 - Organize and review work (Priority: P1)

As a coordinator or reviewer, I use the directory, queue, and work detail to do my permitted work.

**Why this priority**: Core department use must be possible before a live office or external runner exists.
**Independent Test**: Create members and work, assign it, and review a controlled result through the 2D interface.

**Acceptance Scenarios**:

1. **Given** coordinator access, **When** I create and assign work, **Then** its detail and history follow Specs 002 and 003.
2. **Given** a result needing business review, **When** I accept it, **Then** the work changes under its review policy and no tool request is approved.
3. **Given** only reader access, **When** I inspect the same item, **Then** I can read permitted data and cannot perform changes.

### User Story 3 - Follow live and disconnected attempts (Priority: P1)

As an operator, I follow attempt and workflow progress and safely recover after disconnect.

**Why this priority**: Operators must distinguish real completion from missing updates.
**Independent Test**: Deliver repeated and delayed updates, disconnect, then restore authoritative state.

**Acceptance Scenarios**:

1. **Given** a live attempt, **When** progress changes, **Then** its work and session views show consistent state and permitted controls.
2. **Given** lost updates, **When** I reconnect or refresh, **Then** current state is restored without repeating my prior action.
3. **Given** a stale review or start action, **When** I submit it, **Then** I see the current state and no duplicate change.
4. **Given** an Agent runtime run succeeds without reporting a business result, **When** I open work detail, **Then** the work remains active and the runtime outcome is shown separately.
5. **Given** work is assigned or blocked by another item, **When** I open its detail, **Then** I can see the current Agent claim, relationship/blocker, progress, and activity history.

### Edge Cases

- Partial failures preserve independently loaded safe sections and explain failed sections.
- Permission loss clears protected cached content and prevents later actions or events.
- Disabled executors appear unavailable; organization, assignment, and review remain usable.
- Large queues support filtering and paging without hiding the active filter.
- Keyboard, narrow-screen, and reduced-motion use provide the same core work actions.
- Lost live updates offer an explicit refresh path; offline mutations are not queued for later execution.

## Requirements

### Functional Requirements

- **FR-001**: The department MUST have consistent Overview, Work, People, and Activity navigation, with optional Office navigation.
- **FR-002**: The overview MUST prioritize required action, active work, team ownership, and recent activity in that order.
- **FR-003**: The 2D interface MUST expose permitted directory and work actions from Specs 002 and 003. Executor-specific controls MUST appear only when supported and authorized.
- **FR-004**: Business review and tool permission MUST have separate labels, explanations, and actions.
- **FR-005**: Loading, empty, failed, disconnected, stale, cancellation-pending, and unavailable states MUST be distinguishable with text.
- **FR-006**: Restoring connectivity MUST refresh current state and MUST NOT repeat a command or apply an older version over a newer one.
- **FR-007**: Core navigation, filters, details, and actions MUST support keyboard access, visible focus, reduced motion, and layouts without horizontal page scrolling at 360 CSS pixels.
- **FR-008**: The interface MUST follow project access for every read and action, including private execution details and cached data.
- **FR-009**: The interface MUST provide consistent Vietnamese and English product labels using the existing localization system.
- **FR-010**: All core actions MUST remain available without the Office view or external runtime integration.
- **FR-011**: The operations UI MUST expose the Agent/member hierarchy, role, binding availability, and runtime availability without conflating them with work status.
- **FR-012**: Work list and detail MUST show parent/child and blocker relationships, progress/comments, current claim, attempt/run state, result, and safe activity history.
- **FR-013**: Work completion MUST be based on an accepted Agent result or configured business policy, not on runtime execution success alone.
- **FR-014**: The UI MUST distinguish Agent wake, claim, runtime execution, native tool approval, business review, and final work state.

### Key Entities

- **Operations View**: Readable department state from authorized records and attempts.
- **Attention Item**: A blocker, business review, tool request, or failed attempt needing inspection.
- **Activity Entry**: Safe actor, change, target, and time information.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the roadmap fixture, an operator finds the next item needing attention in one minute or less.
- **SC-002**: Every core directory, assignment, review, and enabled-executor action in acceptance can be completed using only the keyboard and 2D views.
- **SC-003**: With healthy push and a visible page, at least 95 of 100 supplied committed updates become visible within five seconds of projection commit. Fallback polling latency and owner reconciliation latency are measured separately and have no five-second target.
- **SC-004**: Reconnect, duplicate-update, and stale-action scenarios produce no repeated command or rollback of newer visible state.

## Assumptions

- Requires 002 and 003 for 006A. 006B uses the enabled executor and 004 when workflow tools are enabled.
- The roadmap fixture and timing targets are proposed acceptance assumptions, not current measurements.
- The initial entry is in the n8n project shell. Navigation does not require the workflow canvas.

## Out of Scope

- A second workflow editor, cross-instance administration, offline mutation replay, and 3D-only controls.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/interface.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).
- [Screen and interaction design](design.md).

## C6 Operations and live updates — Approved 2026-11-03

### Approved C6 requirements

Show directory, work graph, inbox, claim owner, execution, business result/review stages and recovery in 2D. Use project-scoped `agent:*` access and clear protected cache after access loss. Push sends typed invalidations after a current-access check; clients fetch authorized snapshots ordered by department revision. Reconnect fetches a full snapshot. Visible fallback polls every four seconds.

The 95/100 within five seconds target applies only with healthy push and a visible page. Fallback polling and owner reconciliation have separate observed-latency measurements and no five-second target. G6 blocks live push only. 006A can use controlled data.
