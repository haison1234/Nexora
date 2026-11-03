# Tasks: Goals, Work, and Attempts

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: The first backend implementation is in place, but the Paperclip parity review found material behavior gaps. T013 remains open. T014–T021 are the earlier broad parity backlog. The approved Feature Contract now narrows work to one contract at a time. T022–T030 are the first generated slice for C2 only. Do not describe the feature as parity complete until the relevant contract acceptance passes.

## Phase 0: Source reuse research

- [x] R001 Clone and inspect Paperclip source at the pinned commit in `research.md`. Map reusable behaviors to n8n owners. Keep the source checkout outside this repository. (Evidence only; no implementation or test is claimed.)
- [x] R002 Record the MIT reuse condition and reject incompatible Drizzle, company-scope, and heartbeat-runtime imports. Preserve Paperclip license notices if a source fragment is copied. (Evidence only.)

## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [x] T001 Define lifecycle DTOs and executor/event contracts in packages/@n8n/api-types/src/ai-department/work.ts and packages/cli/src/modules/ai-department/work/executor.contracts.ts. Adapt the small Zod validation patterns from Paperclip goal/issue validators to n8n `Z.class` DTOs. (FR-003, FR-004, FR-005, FR-006, FR-009, FR-010)
- [x] T002 Reuse the 002 command receipts; add work entities, composed repositories, department projection sequence, unique dispatch identities, and database migrations in packages/cli/src/modules/ai-department/database/ and packages/@n8n/db/src/migrations/. (FR-001, FR-002, FR-005, FR-008, FR-010)

## Phase 2: Planning

US1 / P1: organize goals and work without a live executor. Validate hierarchy, same-department assignment, project access, and the archive admission fence.

- [x] T003 [US1] Implement goal and work creation, filtering, hierarchy checks, assignment, version checks, and planning routes in packages/cli/src/modules/ai-department/work/. (FR-001, FR-002, FR-009, FR-010)
- [x] T004 [US1] Implement ActiveDepartmentWorkGuard and the shared archive/assignment admission fence in packages/cli/src/modules/ai-department/database/repositories/; integrate 002 archive operations. (FR-009, FR-010)
- [x] T005 [US1] Add focused goal-cycle, archive race, read-only, and cross-project integration cases under packages/cli/src/modules/ai-department/__tests__/work/. (FR-001, FR-002, FR-009, FR-010)

## Phase 3: Attempts

US2 / P1: reserve and control one correlated attempt. Validate duplicate/crash recovery, truthful cancellation, and late-event behavior with controlled owner fixtures, then the selected real owner.

- [x] T006 [US2] Implement the spec transition table as a pure transition function, then reserve the attempt and durable dispatch intent atomically. Use Paperclip's `applyIssueExecutionPolicyTransition` as a pattern for isolated transition calculation, not as a dependency or a wholesale port. (FR-003, FR-004, FR-005, FR-008, FR-010)
- [x] T007 [US2] Add the explicit department execution adapter inside packages/cli/src/modules/agents/ and update its supported import rules; preserve native approval ownership. (FR-004, FR-005, FR-006, FR-009)
- [x] T008 [US2] Implement owner-side dispatch-key acceptance and lookup, scheduled reconciliation, sequence-checked snapshot ingestion, and restart recovery in the owner adapter and packages/cli/src/modules/ai-department/work/. This MVP polls snapshots; it does not expose a pushed owner-event endpoint. Adapt Paperclip's distinction between stop acknowledgment and confirmed termination; do not import its heartbeat runtime. (FR-004, FR-005, FR-010)
- [x] T009 [US2] Implement start, retry, pending cancellation, safe attempt/history reads, and current execution access checks in packages/cli/src/modules/ai-department/work/. (FR-003, FR-004, FR-006, FR-009)
- [x] T010 [US2] Add controlled-executor cases for unknown dispatch recovery, duplicate/concurrent starts, late snapshots, authorization denial, and confirmed/unconfirmed cancellation under packages/cli/src/modules/ai-department/__tests__/work/. (FR-003, FR-004, FR-005, FR-006, FR-009, FR-010)

## Phase 4: Review

US3 / P1: accept or return a result using current business authority. Validate stale decisions and confirm no tool grant changes.

- [x] T011 [US3] Implement accept/return decisions and append-only transition history in packages/cli/src/modules/ai-department/work/. (FR-003, FR-007, FR-008)
- [x] T012 [US3] Verify stale review rejection, route scope policy, required return reasons, and separation from native tool approval ownership under packages/cli/src/modules/ai-department/__tests__/work/. (FR-007, FR-008, FR-009)

## Phase 5: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T013 Run the backend quickstart with a real n8n Agent; verify current access during execution, dispatch recovery, cancellation, and complete lifecycle/history evidence. Record the two-minute organization timing and roadmap-scale measurements when the acceptance fixture is available. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010)

## Phase 6: Paperclip coordination parity redesign

The source review identified a material mismatch: the current implementation sends a
hidden chat and treats its execution snapshot as work outcome. Paperclip wakes an Agent,
lets it claim work, and accepts explicit work actions. The tasks below replace that
behavior through n8n-owned contracts.

- [ ] T014 Define the Agents-owned work-owner contract for assignment wake, wake lookup/coalescing, Agent work listing, atomic claim/reclaim/release, attempt-scoped updates, and stop/reconciliation. Bind Agent identity to the authenticated run and expose actions only to verified department-triggered runs. (FR-011, FR-012, FR-013)
- [ ] T015 Redesign the work and attempt model so work state, claim state, and runtime run state are separate. Add parent/child and blocker relations, activity/comment records, and any required migrations. Keep Agent execution/session data with Agents. (FR-013, FR-014, FR-016)
- [ ] T016 Implement assignment/readiness wake delivery, deduplication, current claim ownership, leases, stale-run rejection, and restart recovery through the Agents-owned contract. Do not expose queue or execution repositories to AI Department. (FR-011, FR-012, FR-013)
- [ ] T017 Add Agent-facing work actions for assigned work, claim/reclaim, progress/comment, block/unblock, result submission, review request, and release/handoff. Require current project access, binding, attempt, actor, and expected version on every mutation. (FR-012, FR-013, FR-016)
- [ ] T018 Implement Paperclip-equivalent execution/review stages and reviewer rules for the selected parity scope. Keep native n8n tool approval in Agents and business review in AI Department. (FR-007, FR-015)
- [ ] T019 Update the 2D operations UI to show the organization tree, Agent/member availability, goals and linked work, work hierarchy/blockers, comments/activity, current claim, runtime attempts, decisions, and recovery states. Keep all core actions available without 3D. (FR-001, FR-002, FR-003, FR-005, FR-016)
- [ ] T020 Replace the hidden-chat-only quickstart with Agent pickup acceptance. Verify duplicate wakes, competing/stale claims, progress updates, explicit result reporting, execution success without work completion, failure recovery, stop confirmation, access loss, and reviewer policies against a real n8n Agent. (FR-004, FR-005, FR-006, FR-009, FR-010, FR-011, FR-012, FR-013, FR-015)
- [ ] T021 Complete the corresponding browser and roadmap-scale acceptance, record results, and close the release gates only when evidence passes. (SC-001, SC-002, SC-003, SC-004)

## Phase 7: Approved contract slice — C2 coordination

This slice implements C2 only. It follows the approved boundaries in
`specs/feature-contracts/ai-department/coordination.md` and the G2 owner operation
contract in `execution.md`. Keep G2 runtime acceptance open until the Agents owner
implementation proves scoped stop and durable sequence behavior. C3, C4, C5, and C6
tasks are not generated here.

- [x] T022 Reconcile the existing per-work wake intent with the C2 lane model. Add durable lane identity, per-work eligibility generations, wake generations, receipts, and migration updates. Keep member, binding revision, initiating user, and project in lane identity. (C2-R3, C2-R5)
- [x] T023 Write eligibility and wake intent atomically for ready transition, ready reassignment, and review return. Write eligibility with the durable dispatch intent for authorized explicit start. Backlog assignment must not create eligibility. Make command replay reuse the prior receipt. T027 adds the destination eligibility for completed handoff. (C2-R3, C2-A6)
- [x] T024 Add the assigned-work inbox service/API with current project access, binding and member checks, lane-bound cursor, stable eligibility-time/ID ordering, and page limits. Return safe work summaries and eligibility/wake state only. T029 connects the authenticated Agent runtime tool. (C2-R4, C2-R6)
- [ ] T025 Implement lane wake coalescing and drain recovery. Preserve each eligible work item, coalesce duplicate signals, retain signals that arrive during drain, and admit no more than one owner run per lane. Keep Agents responsible for per-dispatch acceptance and lookup. (C2-R5, C2-A1, C2-A2)
- [ ] T026 Recheck assignment, binding revision, work version, blockers, archive fence, and active lane reservation atomically before each work reservation. A blocked or stale item must not dispatch or submit a result. (C2-R1, C2-R2, C2-R6, C2-A3)
- [ ] T027 Implement durable handoff intent, immediate source-action fencing, destination validation, and authorized completion after correlated owner-confirmed stop. Commit reassignment, ready state, receipt, activity, and destination eligibility atomically. Unknown stop keeps the old slot and handoff pending. (C2-R8, C2-A4)
- [ ] T028 Keep release distinct from handoff. Record a reason, fence the current run, retain the assignee, and block the work for recovery. Require confirmed old-owner termination before coordinator retry or a new attempt. (C2-R7, C2-A5)
- [ ] T029 Route Agent inbox, claim, report, release, and handoff operations through authenticated owner-run context and stable command receipts. Do not accept actor, initiating user, binding, or attempt identity from tool arguments. (C2-R4, C2-R7, C2-R8, C2-A6)
- [ ] T030 Add controlled-owner integration coverage for C2-A1–A6, including duplicate commands, drain restart, wake during drain, blockers, destination loss, cancel/handoff race, unknown stop, confirmed stop, stale source report, and lane isolation. Keep native model and restart/revocation owner acceptance as separate open evidence. (C2-A1–A6)

### C2 dependency order

- T022 precedes T023–T030.
- T023 and T024 precede T025.
- T025 and T026 precede T027–T029.
- T027 and T028 use the approved G2 stop/snapshot contract. Controlled tests may use a fixture; production acceptance still requires the Agents implementation and restart/revocation proof.
- T030 runs after the C2 behavior tasks. It does not close C3 runtime acceptance or any G3–G6 gate.

### T022 evidence

- Added `WorkEligibility` and `WorkWakeLane` entities and registered them with the AI Department data source.
- Added reversible migration `1793686603665-AddAiDepartmentWorkEligibilityLanes`; kept the current `WorkWakeIntent` table for per-work delivery during the T023/T025 rollout.
- Added use-case repository methods for lane reads/writes, per-work generation allocation, eligibility writes, and pending eligibility reads.
- Added both entities to the project ownership-transfer manifest as source-project data that is not transferred.
- Shortened the three relationship index names in `1793617323000-CreateAiDepartmentWorkRelationships.ts` after PostgreSQL's 63-byte name limit exposed a collision with the test table prefix.
- `pnpm db:schema:docs` generated SQLite and Postgres schema docs. `pnpm db:schema:check` passed for both databases.
- SQLite and Postgres migration tests passed, including down and reapply: 1 test each. Postgres used the migration Testcontainers config.
- Ownership-transfer manifest test passed: 1 file, 6 tests. Focused Oxlint and Biome checks passed.
- T023 writes eligibility in the same transaction as readiness, ready reassignment, and review return wake intents. An explicit start cancels stale pending eligibility/wakes and reserves a new eligibility with the dispatch intent. Replaying the start reuses its command receipt.
- Dispatch reuses the pending readiness eligibility, then marks it reserved. T023 does not implement lane coalescing/drain recovery or destination handoff eligibility; T025 and T027 own those behaviors. C2 acceptance remains open.
- `work-attempts.integration.test.ts` passed: 21 tests. It covers readiness dispatch reuse, explicit-start replay, review return, and ready reassignment. This is controlled-executor evidence only.

### T024 evidence

- Added typed inbox request/response schemas and the Agents-owned `DepartmentWorkInbox` boundary. AI Department registers the implementation through the boundary proxy; the Agent runtime tool remains T029.
- Inbox reads validate the active project department/member, current Agent binding and binding revision, and current actor authorization. A cursor binds project, department, actor, member and binding revision.
- Pages use keyset order `(eligibleAt, workId)` with a `take + 1` probe. Results include only ready work with pending eligibility for that exact lane. They omit attempt and actor references.
- Controlled integration coverage verifies stable pagination, lane cursor isolation, stale binding rejection, unavailable binding reporting, and authorization denial. Runtime Agent invocation remains unverified until T029/C3 owner acceptance.

## Dependencies and Execution Order

- Complete foundation before story implementation. Resolve the existing dependency features before using their interfaces.
- Within each story, establish persistence/DTOs, services, routes/UI, then behavior checks.
- Independent documentation and separate test files may be prepared in parallel. Shared owner adapters, DTOs, migrations, and state-machine files are sequential changes.
- Live execution is gated by the new owner adapter's durable acceptance, lookup, cancellation, and event tests. A controlled test executor is not a production executor.
- Run checks serially with one worker. A fixture or mock is not evidence that an enabled production provider works.

## Functional Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T002, T003, T005, T013 |
| FR-002 | T002, T003, T005, T013 |
| FR-003 | T001, T006, T009, T010, T011, T013 |
| FR-004 | T001, T006, T007, T008, T009, T010, T013 |
| FR-005 | T001, T002, T006, T007, T008, T010, T013 |
| FR-006 | T001, T007, T009, T010, T013 |
| FR-007 | T011, T012, T013 |
| FR-008 | T002, T006, T011, T012, T013 |
| FR-009 | T001, T003, T004, T005, T007, T009, T010, T012, T013 |
| FR-010 | T001, T002, T003, T004, T005, T006, T008, T010, T013, T020 |
| FR-011 | T014, T016, T020 |
| FR-012 | T014, T016, T017, T020 |
| FR-013 | T014, T015, T016, T017, T020 |
| FR-014 | T015, T019 |
| FR-015 | T018, T020 |
| FR-016 | T015, T017, T019 |
| C2-R1–R8 | T022–T030 |

## Success Criterion Coverage

| Criterion | Tasks |
|---|---|
| SC-001 | T013 |
| SC-002 | T010, T013 |
| SC-003 | T010, T013 |
| SC-004 | T012, T013 |

## Completion Evidence

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.

### Phase 2 Evidence

- `work.service.integration.test.ts`: goal-cycle rejection, same-department goal/member checks, archived assignee rejection, stale-version rejection, command replay, project isolation, member-archive assignment race, and nonterminal-work archive guard.
- `work.controller.integration.test.ts`: viewer reads, denied mutations, cross-project access denial, and invalid filter rejection.
- `directory.controller.integration.test.ts` and `directory.repository.integration.test.ts`: existing directory and archive behavior remains valid with the registered work guard.
- Focused SQLite integration run passed: 4 files, 16 tests. The controller scope policy test passed: 1 test. These checks do not validate attempts, owner dispatch recovery, cancellation, review, or the production executor.

### Phase 3–4 Evidence

- `work-attempts.integration.test.ts`: 10 controlled-executor scenarios cover reservation/replay, unknown dispatch, recovery after accepted dispatch with a lost response, sequence-based snapshot processing, older-attempt rejection after retry, cancellation pending/confirmation, required review, and concurrent starts.
- `work.controller.integration.test.ts`, `work.service.integration.test.ts`, `directory.controller.integration.test.ts`, and `directory.repository.integration.test.ts`: 16 integration tests passed for planning, authorization, project boundaries, and archive/assignment guards.
- `work.controller.policy.test.ts` and `directory.policy.test.ts`: 6 policy tests passed.
- `pnpm --filter @n8n/api-types build`, `pnpm --filter @n8n/db typecheck`, `pnpm --filter @n8n/db build`, `pnpm --filter n8n typecheck`, and targeted Oxlint passed.
- SQLite/PostgreSQL generated schema docs were refreshed for the department tables. SQLite schema docs were generated from all registered migrations.
- These tests use a controlled executor. Real Agent provider recovery, loss of access during a live run, the full manual quickstart, the two-minute organization target, and roadmap-scale performance remain unverified. Browser UI validation belongs to 006A/006B and is not a prerequisite for completing backend T013.
