# Tasks: AI Department Directory

**Input**: Design documents in `specs/002-ai-department-directory/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`
**Validation**: Follow root and package AGENTS. Add focused tests for behavior and boundaries. Use pnpm with one worker. Do not run unrelated full-repository checks.

## Phase 1: Foundation

**Purpose**: Establish module ownership, schema, and cross-module contracts.

- [x] T001 Create module folders and entrypoint in `packages/cli/src/modules/ai-department/` following `packages/cli/src/modules/skills/AGENTS.md`.
- [x] T002 [P] Add request and response DTOs under `packages/@n8n/api-types/src/ai-department/` and export them from the package.
- [x] T003 Add Department, Member, ExecutorBinding, binding revision, DirectoryChange, and command receipt entities under `packages/cli/src/modules/ai-department/database/entities/`.
- [x] T004 Add private repository methods under `packages/cli/src/modules/ai-department/database/repositories/`; keep TypeORM inside the persistence layer.
- [x] T005 Add reversible schema migration under `packages/@n8n/db/src/migrations/common/` for SQLite and PostgreSQL.
- [x] T006 Register the CLI-local module and its entities; add its validated ID, activation, and loading rules.
- [x] T007 Add the project-scoped `AgentBindingResolver` to the Agents module.
- [x] T008 Update Agents module boundary checks, tests, and module guidance to allow only the new resolver.
- [x] T009 Define the `ActiveDepartmentWorkGuard` contract; archive fails closed until a provider is registered.

**Checkpoint**: Module registration, migrations, Agents boundary, and guard contract are ready. No API route can bypass project scopes.

## Phase 2: User Story 1 — Maintain a department (P1)

**Goal**: Create, rename, list, read, and archive project-owned departments while retaining history.

**Independent validation**: Use two projects and read-only/coordinator accounts. Verify isolation, atomic duplicate rejection, version conflicts, and guard behavior.

- [x] T010 [P] [US1] Add repository integration tests for project filtering and constraints in `packages/cli/src/modules/ai-department/__tests__/directory.repository.integration.test.ts`.
- [x] T011 [P] [US1] Add service tests for trimmed names, duplicate active names, and stale edits. Archive tests wait for the feature 003 guard.
- [x] T012 [US1] Implement department create, list, read, update, and guarded archive operations.
- [x] T013 [US1] Add department routes with registered agent scopes. The API contract now maps reads to `agent:list`/`agent:read` and writes to `agent:create`/`agent:update`.
- [x] T014 [US1] Project-scoped queries return the same not-found result for absent and cross-project records.
- [x] T015 [US1] Add focused controller integration coverage for project isolation and denied mutations in `packages/cli/src/modules/ai-department/__tests__/directory.controller.integration.test.ts`.

**Checkpoint**: Department CRUD passes project-isolation and authorization checks. Archive remains blocked without the 003 guard provider.

## Phase 3: User Story 2 — Organize AI members (P1)

**Goal**: Maintain stable member identities, hierarchy, and optional executor references.

**Independent validation**: Create unconfigured members, set and reject hierarchy changes, bind a same-project Agent, and reject a cross-project Agent.

- [x] T016 [P] [US2] Add repository integration tests for member project/department consistency and binding constraints in `packages/cli/src/modules/ai-department/__tests__/directory.repository.integration.test.ts`.
- [x] T017 [P] [US2] Add service tests for self-management and reporting cycles.
- [x] T018 [US2] Implement member create/update and manager graph validation.
- [x] T019 [US2] Implement binding set/replace/clear through `AgentBindingResolver`; preserve member identity and store no credentials or copied Agent configuration.
- [x] T020 [US2] Implement member archive through `ActiveDepartmentWorkGuard`; preserve identity and reject archive while work remains active. The operation fails closed until feature 003 registers a provider.
- [x] T021 [US2] Derive configured, unconfigured, and unavailable states from the binding resolver without conflating them with work status.
- [x] T022 [US2] Add member list/create/update, binding, and guarded archive routes with project scopes.
- [x] T023 [US2] Add focused integration coverage for stable member IDs, project-scoped binding, unconfigured state, and archive fail-closed behavior in `packages/cli/src/modules/ai-department/__tests__/directory.controller.integration.test.ts`.

**Checkpoint**: Member state and hierarchy work without a runtime. Binding changes affect future attempts only.

## Phase 4: Cross-feature archive integration

**Purpose**: Enable archive after feature 003 provides the active-work contract.

- [x] T024 [US1] Connect the feature 003 `ActiveDepartmentWorkGuard` provider to department archive operations.
- [x] T025 [US1] Verify department and member nonterminal work blocks archive without changing records.
- [x] T026 [US1] Verify archive preserves member identities and prior work references after terminal work completes.

## Phase 5: Final validation

- [x] T027 [P] Review API DTOs, module loading, migration registration, permissions, and scope decorators against root/package AGENTS.
- [x] T028 Run focused tests for the changed CLI, backend-common, database, and permissions packages with one worker.
- [x] T029 Run formatting and lint checks for the changed API types and AI Department module files.
- [x] T030 Run all acceptance scenarios in `specs/002-ai-department-directory/quickstart.md` and record current-revision evidence.

## Dependencies and execution order

- T001–T009 establish persistence, module registration, and required cross-module contracts.
- US1 and US2 depend on the foundation. They can proceed in parallel after T009 if file ownership is coordinated.
- T024–T026 and T030–T034 are complete. C1 acceptance is closed. G1–G2 still block C2/C3 execution-task generation.
- Final validation depends on the implementation tasks selected for release.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T004, T012–T015, T018–T022 |
| FR-002 | T010–T015 |
| FR-003 | T016–T018, T021–T022 |
| FR-004 | T007–T008, T019, T022 |
| FR-005 | T017–T019, T022 |
| FR-006 | T013, T022, T027 |
| FR-007 | T009, T012–T015, T020, T024–T026 |
| FR-008 | T010–T011, T017, T022 |
| FR-009 | T019–T021, T023 |
| FR-010–FR-013 | T031–T034 |

| Success criterion | Validation tasks |
|---|---|
| SC-001 | T030 |
| SC-002 | T015, T023 |
| SC-003 | T010, T017, T023, T032, T034 |

## Notes

- `[P]` tasks touch separate files or test areas and may run in parallel after their dependencies.
- T024 is source-confirmed. T025–T026 now have current integration evidence.
- Directory CRUD, hierarchy, executor bindings, and authorization are implemented. The 003 guard provider is registered. C1 acceptance has current test and UI evidence.

## Phase 6: Approved C1 contract reconciliation and acceptance

**Purpose**: Align the directory artifacts with the approved C1 contract and close its acceptance gate.

**Prerequisite**: C1 design gate is closed. C3 stop and recovery behavior remains owned by the gated C3 slice.

- [x] T031 [US1] Reconcile the data model and API documentation with source fields, `agent:*` scopes, the projection sequence, and the registered active-work guard.
- [x] T032 [US2] Verify binding replacement/clear preserves identity and attempt snapshots, prevents old-context mutation, and preserves authorized history. Record the tested source revision.
- [x] T033 [US1] Verify member and department archive against nonterminal work and an automatic result with an active runtime attempt. Verify archive succeeds after owner terminal state is reconciled.
- [x] T034 [US1] Verify archive and work admission serialize through the shared fence. Regenerate or check directory schema documentation for supported databases and run final changed-file formatting/lint checks.

**Checkpoint**: C1 acceptance is closed. T030 and T032–T034 have current-revision evidence. A source review or historical log alone does not close these tasks.

**Current evidence (2026-11-03, base commit `679ab1e5179d376bfbf5777938c0e1fc12a98714` plus the working-tree test changes)**:

- T025–T026 passed in `work.service.integration.test.ts`. Member and department archive checks cover nonterminal work, readable member identity, and readable terminal work references after department archive.
- T032 passed in `work/work-attempts.integration.test.ts`. Binding replacement and clear keep the member ID and prior attempt snapshot. The old context cannot claim work. The new attempt uses the replacement Agent. Project-scoped attempt reads retain the old attempt, and three binding revisions remain stored after clear.
- T033 passed in `work.service.integration.test.ts` and `work/work-attempts.integration.test.ts`. The tests cover automatic result submission while its runtime attempt is active, archive rejection for both the member and department, and member archive after terminal reconciliation.
- T034 passed in `work.service.integration.test.ts` and `work/work-attempts.integration.test.ts`. Assignment/archive and attempt-reservation/archive races passed. `pnpm db:schema:docs` regenerated SQLite and PostgreSQL docs. `pnpm --filter @n8n/db schema:check` passed for both databases.
- Directory API, repository, policy, work service, attempts, and owner integration tests passed. The API suite also verifies directory request replay and conflicting request-ID rejection. Recent focused logs are under `.agent-setup/checks/1793682923300-44569-test/`, `.agent-setup/checks/1793682610919-39370-test/`, and `.agent-setup/checks/1793682782132-42271-test/`.
- T030 passed. In the local project UI, creation of one department and two unconfigured members took 19,814 ms from first form input until both member rows appeared. The selected project was `c6SGHYQYYy6LKX49`. This is browser-assisted UI timing, not a human usability study. Automated cases cover quickstart scenarios 2–11.
- Direct-create UI acceptance also passed on 2026-11-03: created `Department Acceptance 20261103` from the Overview form in project `c6SGHYQYYy6LKX49`. The new department became selected immediately. After a page reload, it remained in the department selector; selecting it showed the department overview with `No members yet`. The directory controller integration file passed all 5 tests in `.agent-setup/checks/1793683787007-59206-test/output.log`.

### C1 requirement coverage

| Contract requirement | Tasks |
|---|---|
| C1-R1–C1-R3 | T031–T032 |
| C1-R4 | T033–T034 |
| C1-R5 | T032 |
| C1-A1, C1-A4, C1-A5 | T032 |
| C1-A2 | T034 |
| C1-A3 | T033 |
