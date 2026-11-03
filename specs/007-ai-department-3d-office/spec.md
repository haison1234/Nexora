# Feature Specification: Optional AI Department Office

**Feature ID**: `007-ai-department-3d-office`
**Feature Branch**: Not created. The feature ID is not a branch claim.
**Created**: 2026-11-02
**Status**: Draft; optional view after 006B.
**Input**: Show actual department members and work in an accessible office view.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md)

## Scope and Actors

A reader sees rooms and members allowed by project access. Any permitted action uses the
same work or member detail as the 2D interface. Office position and animation are display
preferences. They do not grant authority or change business state.

## User Scenarios & Testing

### User Story 1 - Inspect the department spatially (Priority: P1)

As a reader, I recognize teams and member status in a live office view.

**Why this priority**: Spatial presentation adds value after core operations work in 2D.
**Independent Test**: Supply authorized member and attempt data without an external provider.

**Acceptance Scenarios**:

1. **Given** live department data, **When** a member's work changes, **Then** its character and text status match the 2D detail.
2. **Given** a selected character, **When** I open its detail, **Then** I reach the same authorized member or work view used in 2D.
3. **Given** a disconnected source, **When** I inspect the scene, **Then** it shows last-known state and age rather than simulated live work.

### User Story 2 - Use the fallback (Priority: P1)

As a user with reduced motion or limited rendering support, I retain all information and actions.

**Why this priority**: An optional view must not make the product unusable.
**Independent Test**: Disable 3D rendering and use keyboard and reduced-motion preferences.

**Acceptance Scenarios**:

1. **Given** unavailable or failed 3D rendering, **When** I open Office, **Then** I get a usable 2D member/work view and a reason.
2. **Given** reduced motion, **When** work changes, **Then** static status labels communicate the change without required camera or character animation.

### Edge Cases

- An empty department has no invented workers and offers the directory path.
- A removed or archived member remains represented only where authorized history requires it; no active execution is invented.
- Access loss removes private scene content and disables protected selection.
- Missing assets, slow rendering, or a failed scene offer a manual 2D fallback.
- Stale events cannot overwrite newer state. Reconnect uses current department state.

## Requirements

### Functional Requirements

- **FR-001**: Live Office MUST show only authorized department members and attempt state.
- **FR-002**: Character identity and text status MUST agree with the shared 2D views. Spatial layout MUST NOT own business state.
- **FR-003**: Character selection MUST link to the same authorized member or work detail and its permitted actions.
- **FR-004**: A lost connection MUST show stale or disconnected state with last update time. The release MUST NOT substitute simulated workers or progress for missing data.
- **FR-005**: 3D failure MUST provide the complete 2D alternative. A user MUST be able to choose 2D at any time.
- **FR-006**: Reduced motion, keyboard access, text alternatives, and permission changes MUST follow the shared design.
- **FR-007**: The scene MUST avoid default disclosure of prompts, transcripts, credentials, and tool arguments.

### Key Entities

- **Office Layout**: Display preferences for authorized departments and members.
- **Member Display State**: Read-only projection of member identity, availability, and work status.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every visible character in live acceptance maps to one authorized department member.
- **SC-002**: In a healthy local acceptance environment, at least 95% of 100 supplied changes appear in text status within five seconds.
- **SC-003**: Every core action available from Office remains available through 2D when 3D fails or is disabled.
- **SC-004**: All disconnect and access-loss acceptance cases show stale or removed data without invented progress or unauthorized content.

## Assumptions

- Requires 006B. External runtime 005 is not required.
- Three.js with new procedural primitives is the selected renderer design. Dependency notices, asset provenance, and measured device budgets remain enablement checks.
- Timing uses the roadmap fixture and is a proposed target.

## Out of Scope

- Simulation/demo mode, avatar asset generation, a game economy, mandatory camera navigation, and scene-owned execution controls.

## Planning Artifacts

- [Implementation plan](plan.md) and [source research](research.md).
- [Data model](data-model.md) and [interface contract](contracts/interface.md).
- [Story tasks](tasks.md), [quickstart](quickstart.md), and [requirements review](checklists/requirements.md).
- [Screen and interaction design](design.md).
