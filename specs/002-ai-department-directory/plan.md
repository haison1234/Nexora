# Implementation Plan: Department Directory

**Feature**: `002-ai-department-directory` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Status**: C1 design and acceptance gates are closed. Contract decisions were approved on 2026-11-03. Acceptance evidence is recorded in [tasks.md](tasks.md).
**Input**: Requirements and [shared interface](../AI-DEPARTMENT-DESIGN.md).

## Summary

Add project-scoped departments and stable member identities to the n8n modular monolith. Keep executor references separate from member identity. Reuse project access. Do not require a saved Agent to create a member.

## Technical Context

**Language and dependencies**: TypeScript, n8n CLI module, DI, API types, project permissions, and the database migration system.
**Storage**: Module-owned department, member, and executor-binding entities and repositories.
**Testing**: Focused package tests for authorization, mutations, persistence, and failure behavior. Use pnpm and one worker.
**Target platform**: Current n8n fork. No runtime adapter is required for directory operations.
**Performance goals**: Proposed acceptance targets in the spec and roadmap fixture. No performance result is claimed.
**Constraints**: Constitution 2.0.0, root/package AGENTS, Agents module boundary, and TypeORM persistence rules.
**Dependencies and scope**: The Agents module must expose a project-scoped binding resolver. Feature 003 must provide the active-work archive guard before archive is enabled.

## Constitution Check

| Principle | Design status and evidence |
|---|---|
| I. Repository rules and evidence | Pass: root rules, Agents module boundary, skills module structure, project scopes, and persistence guidance were checked. |
| II. One department product | Pass: member identity is separate from executor identity. |
| III. Execution through owned contracts | Pass with implementation gate: add a public Agents resolver; do not import private runtime data. |
| IV. Project access and human control | Pass: use registered `agent:*` scopes on project routes; department membership grants no platform permissions. |
| V. Shared interface | Pass: follows the shared design and keeps 2D complete. |
| VI. Durable work and verifiable changes | Pass with integration gate: preserve records and use optimistic versions; feature 003 supplies the archive guard. |

No constitution exception is requested. Recheck this table if implementation changes the contracts.

## Phase 0 — Source Verification

| Decision | Evidence |
|---|---|
| Module ownership | The skills module documents module-owned entities and repositories under `packages/cli/src/modules/skills/`. |
| Project API authorization | AI Department routes use existing `agent:list`, `agent:read`, `agent:create`, and `agent:update` scopes. The original project read/update mapping could not represent the feature in existing permission boundaries. |
| Project route pattern | Agents and data tables use `/projects/:projectId/...` with `@ProjectScope`. |
| Agent lookup | `AgentsService.findById(agentId, projectId)` enforces project ownership through `AgentRepository`. |
| Agent import boundary | The project-scoped `AgentBindingResolver` is the only supported cross-module lookup. The boundary rule and module guidance permit only this resolver. |
| Transaction boundary | Root `AGENTS.md` requires transaction orchestration in persistence repositories through `TransactionRunner`. |
| Archive ownership | Feature 003 owns work states. Feature 002 defines a guard contract and fails closed until a provider is registered. |

Full rationale and alternatives are in [research.md](research.md).

## Phase 1 — Design and Contracts

- [Data model](data-model.md): project-owned departments, stable members, and optional executor bindings.
- [API contract](contracts/department-api.md): project-scoped routes, scopes, request shapes, error behavior, and module boundaries.
- [Quickstart](quickstart.md): acceptance scenarios and expected outcomes. It does not claim implementation exists.
- Name, membership, manager, and cycle checks run within one persistence transaction.
- Binding validation uses an Agents public contract and is repeated before a future attempt.
- Archiving calls the work-management guard. Missing guard or nonterminal work blocks archive without mutation.

## Project Structure

### Documentation

`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/department-api.md`, `quickstart.md`, `checklists/requirements.md`, and `tasks.md`.

### Proposed Source Ownership

- `packages/cli/src/modules/ai-department/`: module entrypoint, controllers, services, contracts, persistence entities/repositories, and focused tests.
- `packages/cli/src/modules/agents/`: add and test the public project-scoped binding resolver.
- `packages/@n8n/api-types/src/ai-department/`: request and response DTOs.
- `packages/@n8n/db/src/migrations/`: register schema migrations for supported database engines.
- Frontend is out of scope for this feature. Feature 006A consumes this API.

These paths are implementation targets based on current module patterns. No source files are created by this plan.

## Validation and Requirement Traceability

- US1 / FR-001, FR-002, FR-006, FR-007: project isolation, read-only denial, department changes, archive guard, and history.
- US2 / FR-003 through FR-005, FR-008, FR-009: unconfigured members, manager rules, binding replacement and loss of access, stale edits, and execution state.
- SC-001 through SC-003: guided coordinator fixture, unauthorized request set, and atomic rejection checks.
- Run the scenarios in [quickstart.md](quickstart.md) with focused owning-package validation during implementation.
- Documentation revisions use diff, link, and structure review. Do not run code tests for documentation-only changes.

## Phase 2 — Tasks and Delivery Gate

Story tasks are generated in [tasks.md](tasks.md). The complete archive behavior depends on the work guard from feature 003. Directory operations other than archive can be implemented and validated independently. Do not report archive as complete until the provider integration passes the active-work scenarios.

## C1 Gate Status

Source inspection and current tests confirm the Agents binding resolver, guard provider, admission fence, Department projection sequence, binding behavior, and archive rules. T030–T034 close current-revision acceptance. The timed UI path took 19,814 ms from first form input to both member rows appearing. This was browser-assisted timing, not a human usability study. Runtime stop and recovery after binding revocation belong to C3 and do not block directory planning work.

## Complexity Tracking

No constitution exception is accepted. The two integration dependencies are explicit tasks and release gates.

## C1 Directory — Approved 2026-11-03

### Approved C1 gate status

The source review confirms the binding resolver, guard provider registration, admission fence, and projection sequence. Current integration and schema checks pass. The C1 design and acceptance gates are closed by T030–T034. The UI timing is browser-assisted and does not claim human usability-study results. C3 stop/recovery remains outside this gate.
