# Tasks: Goals, Work, and Attempts

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: T014 contract definition, T015 model checks, T016 controlled wake/claim/restart checks, T017 Agent work actions, T018 staged human review, and T019 2D operations UI are complete at their documented scope. T013, T020, and T021 remain open. C2 controlled tests pass at their documented scope; G1 runtime, durable sequence, and remaining C3/C4 acceptance stay open. The opt-in same-process Ollama stop test now passes; restart receipt recovery is a separate scenario. Keep the feature incomplete until each relevant acceptance gate passes.

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

- [x] T014 Define the Agents-owned work-owner contract for assignment wake, wake lookup/coalescing, Agent work listing, atomic claim/reclaim/release, attempt-scoped updates, and stop/reconciliation. Bind Agent identity to the authenticated run and expose actions only to verified department-triggered runs. (FR-011, FR-012, FR-013)
- [x] T015 Redesign the work and attempt model so work state, claim state, and runtime run state are separate. Add parent/child and blocker relations, activity/comment records, and any required migrations. Keep Agent execution/session data with Agents. (FR-013, FR-014, FR-016)
- [x] T016 Implement assignment/readiness wake delivery, deduplication, current claim ownership, leases, stale-run rejection, and restart recovery through the Agents-owned contract. Do not expose queue or execution repositories to AI Department. (FR-011, FR-012, FR-013)
- [x] T017 Add Agent-facing work actions for assigned work, claim/reclaim, progress/comment, block/unblock, result submission, review request, and release/handoff. Require current project access, binding, attempt, actor, and expected version on every mutation. (FR-012, FR-013, FR-016)
- [x] T018 Implement Paperclip-equivalent execution/review stages and reviewer rules for the selected parity scope. Keep native n8n tool approval in Agents and business review in AI Department. (FR-007, FR-015)
- [x] T019 Update the 2D operations UI to show the organization tree, Agent/member availability, goals and linked work, work hierarchy/blockers, comments/activity, current claim, runtime attempts, decisions, and recovery states. Keep all core actions available without 3D. (FR-001, FR-002, FR-003, FR-005, FR-016)
- [ ] T020 Replace the hidden-chat-only quickstart with Agent pickup acceptance. Verify duplicate wakes, competing/stale claims, progress updates, explicit result reporting, execution success without work completion, failure recovery, stop confirmation, access loss, and reviewer policies against a real n8n Agent. (FR-004, FR-005, FR-006, FR-009, FR-010, FR-011, FR-012, FR-013, FR-015)

  **Progress (2026-11-06):** A real Ollama-backed Agent pickup passed for one work item.
  The Agent claimed it, reported progress, and submitted a result. The execution succeeded
  while the work remained in human review. This covers only the provider-backed action
  path; the T020 matrix remains open. The latest recheck also confirmed terminal attempt
  reconciliation after the owner execution succeeded. A separate same-process live Ollama
  stop recheck passed 1/1 and confirmed the terminal stop receipt. See
  `specs/feature-contracts/ai-department/evidence.md`.
- [ ] T021 Complete the corresponding browser and roadmap-scale acceptance, record results, and close the release gates only when evidence passes. (SC-001, SC-002, SC-003, SC-004)

  **Progress (2026-11-06):** The SQLite planning fixture passed with 10 departments,
  100 members, 1,000 work items, and 30 reads (p50 0.50 ms, p95 0.73 ms). It does not
  measure concurrent attempts or browser flows. Browser acceptance remains open because
  the 5791 backend is stopped. See `specs/feature-contracts/ai-department/evidence.md`.

## Phase 7: Approved contract slice — C2 coordination

This slice implements C2 only. It follows the approved boundaries in
`specs/feature-contracts/ai-department/coordination.md` and the G2 owner operation
contract in `execution.md`. Same-process live stop now passes. Restart receipt recovery is a
separate scenario and does not require the model request to survive restart. Durable sequence,
G1, and remaining C3 recovery acceptance stay open. C3, C4, C5, and C6
tasks are not generated here.

- [x] T022 Reconcile the existing per-work wake intent with the C2 lane model. Add durable lane identity, per-work eligibility generations, wake generations, receipts, and migration updates. Keep member, binding revision, initiating user, and project in lane identity. (C2-R3, C2-R5)
- [x] T023 Write eligibility and wake intent atomically for ready transition, ready reassignment, and review return. Write eligibility with the durable dispatch intent for authorized explicit start. Backlog assignment must not create eligibility. Make command replay reuse the prior receipt. T027 adds the destination eligibility for completed handoff. (C2-R3, C2-A6)
- [x] T024 Add the assigned-work inbox service/API with current project access, binding and member checks, lane-bound cursor, stable eligibility-time/ID ordering, and page limits. Return safe work summaries and eligibility/wake state only. T029 connects the authenticated Agent runtime tool. (C2-R4, C2-R6)
- [x] T025 Implement lane wake coalescing and drain recovery. Preserve each eligible work item, coalesce duplicate signals, retain signals that arrive during drain, and admit no more than one owner run per lane. Keep Agents responsible for per-dispatch acceptance and lookup. (C2-R5, C2-A1, C2-A2)
- [x] T026 Recheck assignment, binding revision, work version, blockers, archive fence, and active lane reservation atomically before each work reservation. A blocked or stale item must not dispatch or submit a result. (C2-R1, C2-R2, C2-R6, C2-A3)
- [x] T027 Implement durable handoff intent, immediate source-action fencing, destination validation, and authorized completion after correlated owner-confirmed stop. Commit reassignment, ready state, receipt, activity, and destination eligibility atomically. Unknown stop keeps the old slot and handoff pending. (C2-R8, C2-A4)
- [x] T028 Keep release distinct from handoff. Record a reason, fence the current run, retain the assignee, and block the work for recovery. Require confirmed old-owner termination before coordinator retry or a new attempt. (C2-R7, C2-A5)
- [x] T029 Route Agent inbox, claim, report, release, and handoff operations through authenticated owner-run context and stable command receipts. Do not accept actor, initiating user, binding, or attempt identity from tool arguments. (C2-R4, C2-R7, C2-R8, C2-A6)
- [x] T030 Add controlled-owner integration coverage for C2-A1–A6, including duplicate commands, drain restart, wake during drain, blockers, destination loss, cancel/handoff race, unknown stop, confirmed stop, stale source report, and lane isolation. Keep native model, G1, durable sequence, C3 recovery, and revocation acceptance as separate open evidence. (C2-A1–A6)
- [x] T031 Implement D3 claim generations. Persist the generation on each claim, backfill it from the attempt ordinal, reject same-attempt takeover after owner-confirmed stop, and require terminal reconciliation plus coordinator retry to create a new attempt. Keep the real-model owner matrix C3-A7 open.

### T014 evidence

- Updated `contracts/service-api.md` to assign eligibility, lane admission, and work actions
  to AI Department, and runtime identity, queue acceptance, lookup, stop receipts, and
  snapshots to Agents. The document now separates implemented ports from open runtime gates.
- The Agents contract exposes assigned-work inbox and work-action ports. The native Agent
  tool derives attempt and execution IDs from host run state. The Agents adapter checks the
  accepted department context and current project access before it reads owner state.
- The controlled owner integration test passed 1/1. It verifies durable queue acceptance,
  execution correlation, and access loss. The attempt integration suite passed 38/38 on the
  single test-owned SQLite folder. The adapter and tool suites passed 21/21.
- The first shared-database run exposed an assertion that counted dispatches from unrelated
  attempts. The test now counts only the attempt under test. Production reconciliation still
  scans all eligible attempts. The rerun passed.
- G1 runtime, C3 restart/revocation, and real-provider acceptance remain open. T014 closes
  the internal contract definition only; it does not enable runtime execution.

### T015 evidence

- `WorkItem`, `WorkClaim`, and `WorkAttempt` store business state, claim state, and runtime
  phase/outcome separately. `WorkRelationship` stores parent and blocker edges. `WorkActivity`
  stores ordered comments and progress. Agent checkpoints, prompts, and execution details stay
  in the Agents module.
- The current SQLite attempt suite passed 38/38. The work planning suite passed 40/40 after
  its blocker test was aligned with the approved rule: cancelling a blocker does not remove
  the relationship; a coordinator must remove the edge before readiness.
- Focused Biome checks passed for both changed integration test files. `git diff --check`
  passed. Existing migration evidence for the work tables, relationships, and claim generation
  is recorded under T002 and T031.
- T015 closes the model implementation checks. Runtime provider, reviewer policy, browser,
  and scale acceptance remain open under T013 and T018–T021.

### T016 evidence

- `WorkService`, `WorkInboxService`, and `WorkCoordinationService` use the owner ports. The
  AI Department production tree has no direct dependency on `AgentMessageQueueRepository` or
  `AgentExecutionRepository`.
- The attempt integration suite passed 38/38 on the shared test-owned SQLite folder. It covers
  durable eligibility, duplicate delivery, one active attempt per lane, claim races, lease
  expiry, stale-run rejection, and confirmed-stop retry.
- The owner restart test passed its `prepare` and `recover` phases in separate Vitest processes
  on that same SQLite folder. Recovery found the persisted queue dispatch, verified the
  owner run, claimed the attempt, and drained the next eligible item after the controlled run
  ended. The model provider was stubbed.
- The first recovery run selected an older queued test item. The test stub now waits only for
  the target attempt and lets unrelated queued items finish. The rerun passed. Biome and
  `git diff --check` passed.
- This closes controlled T016 checks. It does not close G1 real-runtime acceptance, multi-main
  races across production databases, or C3 native-owner recovery gates.

### T017 evidence

- The `department_work` tool exposes inbox, inspect, claim/reclaim, renew, progress, comment,
  block/resume, submit, release, and handoff actions. Submit records a business result and
  enters review or done under the work policy. A normal chat reply does not submit a result.
- The tool derives attempt and execution IDs from host run state and creates a stable request
  ID from the execution and tool-call IDs. Its strict schema rejects caller-supplied work or
  actor identity.
- Every mutation resolves the attempt, checks current project/member/binding authority, calls
  the Agents owner to verify the run, checks current assignment and claim, and requires the
  current work version. `department-work.tool.test.ts` passed 4/4; the attempt integration
  suite passed 38/38 on the shared test-owned SQLite folder.
- These controlled checks close T017 implementation. Real Agent pickup and the full access-loss
  matrix remain open under T020 and C3-A6/A7.

### T018 evidence

- Added immutable review policy revisions, submitted result records, review rounds, and stage
  decisions. Each verdict checks the current result ID, round ID and version, active stage,
  terminal attempt, requester filter, explicit user list, and project write access.
- An accepted stage advances to the next stage. The final accept completes work. A return
  requires a reason, closes the round, and creates a new eligibility. Reopen records a reason,
  closes the old round as reopened, and creates eligibility for a new attempt.
- The attempts API returns result and round IDs, round version, active stage, and policy
  revision. The UI sends those fields, disables duplicate submissions, shows the current stage,
  and reloads the detail after a verdict. Native tool approval remains an Agents-owned state.
- Controlled integration checks passed: `work-attempts.integration.test.ts`, 42/42. They cover
  ordered stages, requester and explicit-user rules, stale work versions, result submission,
  idempotent verdict replay, return reasons, and audited reopen. They do not cover real Agent
  review authority or the full reviewer revocation matrix.
- The review-record and timestamp migrations passed down/reapply: 1/1 each. Focused frontend tests passed: 65/65 before
  the final review payload update and 33/33 after it. API types build, CLI typecheck, frontend
  module typecheck, SQLite/Postgres schema checks, and `git diff --check` passed.
- C4 runtime acceptance remains open. Agent reviewers remain disabled until G3 review context
  is verified. Reviewer-loss attention, concurrent verdict races, live owner matrix, and browser
  acceptance remain open under T020/T021.

### T019 evidence

- The 2D home view shows the organization tree and availability, goal hierarchy and linked work,
  work relations and blocker status, comments and activity, current claim, owner attempts, review
  decisions, and stop/reopen recovery states. Core work actions remain in the 2D view.
- Added `GET /work/{workId}/review/decisions` under `agent:read`. It returns legacy and staged
  verdicts in time order. The work detail displays each stage, verdict, reviewer, reason, and time.
  A coordinator can reopen a stalled review with a required reason. The flow preserves the old
  result decision and refreshes the current attempt and stage after each action.
- Controller scope policy test passed: 1/1. Review and legacy decision integration coverage passed
  with `work-attempts.integration.test.ts`: 42/42. The full AI Department frontend suite passed:
  16 files, 118 tests. CLI and frontend module typechecks passed.
- Browser interaction and roadmap-scale acceptance remain open under T021. Real Agent pickup,
  live review authority, reviewer revocation, and the T020 runtime matrix also remain open.

### C2 dependency order

- T022 precedes T023–T030.
- T023 and T024 precede T025.
- T025 and T026 precede T027–T029.
- T027 and T028 use the approved G2 stop/snapshot contract. Controlled tests and the same-process live Ollama stop pass at their documented scope. Restart receipt recovery is separate and does not require a model request to survive restart. Durable sequence and broader handoff/release acceptance remain open.
- T030 runs after the C2 behavior tasks. It does not close C3 runtime acceptance or any G3–G6 gate.

### T030 evidence

- Extended controlled owner coverage for claim, resume, and result rejection while a blocker edge remains. A cancelled blocker still blocks the dependent work until its relationship is removed. Relationship deletion remains available after the blocker is cancelled.
- Added controlled checks for destination access loss before stop confirmation and for a stale source result after a confirmed handoff.
- Existing integration cases cover lane wake during drain and coordinator reconstruction from persisted lane state, duplicate command replay, old binding revision rejection, lane cursor isolation, blocker cycles and cross-department checks, handoff cancel races, unknown and confirmed stop, release recovery, and access loss in the owner run.
- `pnpm agent:test --filter n8n --script test:sqlite -- src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` — passed, 31 tests.
- `pnpm agent:test --filter n8n --script test:integration -- src/modules/ai-department/__tests__/work.service.integration.test.ts --maxWorkers=1` — passed, 11 tests.
- `pnpm agent:test --filter n8n --script test:integration -- src/modules/ai-department/__tests__/work/work-owner.integration.test.ts --maxWorkers=1` — passed, 1 test.
- `pnpm agent:test --filter n8n -- src/modules/agents/__tests__/department-work.tool.test.ts --maxWorkers=1` — passed, 4 tests.
- `pnpm --filter n8n typecheck`, focused Biome, and `git diff --check` — passed.
- These tests use controlled executors and owner fixtures. The separate `work-owner-process-restart.integration.test.ts` adds two-process SQLite evidence for persisted Agents dispatch lookup, production queue-consumer startup scan/admission, and lane wake recovery. It stubs model generation after queue claim and does not prove provider execution or restart/revocation stop guarantees. C2-A1–A6 acceptance remains open at the documented scope. Same-process live stop passes; durable sequence and remaining C3 acceptance remain open. Broader C2 acceptance remains open.
- The separate `work-owner-stop-process-restart.integration.test.ts` adds three-process SQLite evidence for a running owner row, a pending stop receipt, and terminal reconciliation across two restarts. It finalizes the execution through the production persistence service and does not prove a live runtime reacted to the stop. The real-model owner matrix C3-A7 remains open.

### T031 D3 evidence

- `WorkClaim.claimGeneration` stores the owning attempt ordinal. The retry path already allocates a larger attempt ordinal after the prior attempt reaches terminal state.
- A different execution cannot replace the current claimant inside the same attempt. If the owner confirms stop before department reconciliation, the claim remains reserved and the Agent must wait for terminal reconciliation, then coordinator retry.
- Workflow invocation reservations read the generation from the verified claim. The response schema exposes that generation to the authenticated Agent work action.
- Migration `1793901027958-AddAiDepartmentWorkClaimGeneration` backfills existing claims from their attempt ordinal. The isolated SQLite migration test checks the backfill and column rollback.
- `pnpm --filter n8n test:integration work-attempts.integration.test.ts workflow-invocation-revocation.integration.test.ts --maxWorkers=1` — passed, 38 tests (36 work-attempt cases and 2 revocation cases).
- `pnpm --filter n8n test workflow-invocation.service.test.ts` — passed, 26 tests. `pnpm --filter @n8n/api-types test src/ai-department/work.test.ts` — passed, 2 tests.
- `pnpm --filter n8n test:sqlite:migrations 1793901027958-add-ai-department-work-claim-generation.test.ts --maxWorkers=1` — passed, 1 test. It checks the ordinal backfill and rollback.
- `pnpm --filter n8n typecheck`, `pnpm db:schema:docs`, and `pnpm db:schema:check` — passed. Biome passed for all changed TypeScript files; `git diff --check` passed.
- Oxlint could not load `@stylistic/eslint-plugin` from `@n8n/oxlint-config`; the dependency is declared in that package but is not available in this checkout. The native cross-process stop integration suite skipped all 3 cases under its environment guard. Neither result is native owner acceptance.
- C3-A1 `prepare`/`recover` restart phases and `race-prepare`/two-worker `race-claim`/`race-verify` phases passed against the same test-owned SQLite folder. Recovery found the accepted dispatch and drained retained lane items. Exactly one competing worker claimed the dispatch. The model was stubbed. C3-A7 remains open.
- The C3-A2 claim-race and stale-claimant SQLite suite passed 38/38 twice. The 17-test adapter suite covers running, suspended, missing, and terminal owner stop states. C3-A7 real-model acceptance remains open.

### G2 runtime acceptance evidence — 2026-11-03

- The native Agent dispatched through OpenRouter, claimed the work, and reported progress through `department_work`.
- The user reports the authenticated UI issued Cancel while the owner attempt was active. In run 2, the pending receipt reportedly persisted across restart of isolated instance `localhost:5687`. Run 1 restart is not independently verified because the current process started after that run ended.
- After the two-minute liveness grace, the Agents interrupted-execution sweeper marked the abandoned owner execution `interrupted`. Stop reconciliation confirmed the matching receipt. The attempt and work became `cancelled`. No browser observation verified the UI label. Historical sequence observations 5 and 13 are not persisted; current thread counters are 68 and 70, while attempt `lastOwnerSequence` values are 54 and 56.
- Controlled owner tests cover revoked-user stop authority and active-to-terminal snapshot ordering. A separate same-process Ollama test now confirms that Department cancel aborts a live model request, records a terminal owner snapshot, confirms the receipt, cancels the work, and releases the lane. Separate restart evidence verifies receipt recovery after the old model process ends. Durable sequence, G1, and the remaining C3 acceptance matrix remain open.

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

- Added typed inbox request/response schemas and the Agents-owned `DepartmentWorkInbox` boundary. AI Department registers the implementation through the boundary proxy; T029 connects it to the Agent tool.
- Inbox reads validate the active project department/member, current Agent binding and binding revision, and current actor authorization. A cursor binds project, department, actor, member and binding revision.
- Pages use keyset order `(eligibleAt, workId)` with a `take + 1` probe. Results include only ready work with pending eligibility for that exact lane. They omit attempt and actor references.
- Controlled integration coverage verifies stable pagination, lane cursor isolation, stale binding rejection, unavailable binding reporting, and authorization denial. The T029 Agent tool connection has separate native runtime acceptance gates.

### T026 evidence

- Work reservation uses the department admission fence, checks current assignment/member, work version/state, unresolved blockers, current binding revision, and active lane reservation in one transaction. `reserveAttempt` applies a version/state compare-and-set before it writes the attempt and dispatch intent.
- Member binding set/clear now acquire the same department admission fence. Binding changes cannot race the reservation checks.
- A pending wake whose member, actor, or binding revision no longer matches current authority is cancelled and receives a rejected receipt. It creates no attempt and does not change ready work state. This lets wake delivery finish without retrying stale work.
- Existing coordination actions recheck blockers and current attempt under the same fence before claim, resume, or result submission. Blocked work cannot submit a business result.
- Added an integration test for stale binding revision during wake delivery. It asserts no dispatch, no attempt, and cancelled eligibility.
- `pnpm agent:test --filter n8n --script test:integration -- src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` — passed, 24 tests.
- `pnpm exec biome check --write packages/cli/src/modules/ai-department/member.service.ts packages/cli/src/modules/ai-department/work/work.service.ts packages/cli/src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts` — passed.
- `git diff --check` — passed. C2-A3 runtime acceptance remains open; T030 controlled-owner coverage does not prove production Agent behavior.

### T027 evidence

- Added durable `WorkHandoffIntent` state and reversible migration. Added a coordinator API to request a handoff and read its status.
- A pending handoff fences source Agent mutations under the department admission fence. Read-only inspect remains available. A competing cancellation marks the handoff cancelled in its transaction.
- Stop uses the source attempt, dispatch lookup, and a stable stop command ID. The reconciler retries pending intents. It completes a handoff only after a correlated owner snapshot reports `terminal`; acknowledgment alone leaves the source lane reserved and the handoff pending.
- Completion rechecks the source attempt and destination member, binding revision, and current execution authority. It atomically records the terminal attempt, reassignment, ready state, transition, activity, receipt, destination eligibility, and wake. An invalid destination leaves the source assignment in blocked work and creates no destination eligibility. A late stop cannot revive a cancelled handoff.
- Controlled integration coverage passed: `work-attempts.integration.test.ts`, 28 tests. It covers ready handoff replay, pending/confirmed stop, source-action fencing, cancellation race, and destination archive.
- `pnpm agent:test --filter n8n --script test:sqlite:migrations -- test/migration/1793698314000-add-ai-department-work-handoff-intent.test.ts --maxWorkers=1` — passed.
- `pnpm --filter @n8n/db build` and `pnpm --filter @n8n/api-types build` — passed.
- `pnpm --filter n8n typecheck` — passed.
- `pnpm --filter @n8n/db schema:docs` and `pnpm --filter @n8n/db schema:check` — passed for SQLite and Postgres.
- `pnpm exec biome ci packages/@n8n/api-types/src/ai-department/work.ts packages/cli/src/modules/ai-department/ai-department.module.ts packages/cli/src/modules/ai-department/database/entities/work-handoff-intent.entity.ts packages/cli/src/modules/ai-department/database/repositories/work.repository.ts packages/cli/src/modules/ai-department/work/work-coordination.service.ts packages/cli/src/modules/ai-department/work/work-handoff.controller.ts packages/cli/src/modules/ai-department/work/work-handoff-reconciliation.task.ts packages/cli/src/modules/ai-department/work/work-handoff.service.ts packages/cli/src/modules/ai-department/work/work.service.ts packages/cli/src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts packages/@n8n/db/src/migrations/common/1793698314000-AddAiDepartmentWorkHandoffIntent.ts packages/@n8n/db/src/migrations/sqlite/index.ts packages/@n8n/db/src/migrations/postgresdb/index.ts packages/cli/test/migration/1793698314000-add-ai-department-work-handoff-intent.test.ts` — passed.
- `git diff --check` — passed. C2-A4 handoff acceptance remains open. Controlled stop tests and same-process live stop pass at their documented scope; durable sequence remains open. See `specs/feature-contracts/ai-department/evidence.md`.

### T028 evidence

- Added a separate durable `WorkReleaseIntent` and reversible migration. Release requires a reason, records it in the intent and activity history, fences old-run mutations, keeps the assignee, and blocks work immediately.
- The release reconciler retries the same stop command. It marks the release confirmed and frees the lane only after a correlated terminal owner snapshot with an outcome. An acknowledgment or unknown snapshot leaves the release pending and the lane reserved.
- Coordinator retry checks both the pending release and the prior attempt phase. It cannot create another attempt until release confirmation and terminal attempt state are persisted.
- Controlled integration coverage passed: `work-attempts.integration.test.ts`, 28 tests. It covers the release reason, immediate mutation fence, pending retry rejection, confirmed terminal stop, lane recovery, and retry with the original assignee.
- `pnpm agent:test --filter n8n --script test:sqlite:migrations -- test/migration/1793699314000-add-ai-department-work-release-intent.test.ts --maxWorkers=1` — passed.
- `pnpm --filter @n8n/db build`, `pnpm --filter @n8n/api-types build`, and `pnpm --filter n8n typecheck` — passed.
- `pnpm --filter @n8n/db schema:docs` and `pnpm --filter @n8n/db schema:check` — passed for SQLite and Postgres.
- Targeted `pnpm exec biome ci` on changed TypeScript and migration files — passed.
- `git diff --check` — passed. C2-A5 release acceptance remains open. Controlled stop tests and same-process live stop pass at their documented scope; durable sequence remains open. See `specs/feature-contracts/ai-department/evidence.md`.

### T029 evidence

- Connected the existing `department_work` Agent tool to assigned-work inbox reads, existing claim/report/release actions, and Agent handoff requests. The tool derives project, executor, attempt, execution, and retry identity from runtime configuration and host persistence. Its input schema rejects supplied actor, binding, attempt, and work identifiers.
- Inbox reads verify the current owner run and derive actor/member/binding authority from the persisted attempt. Mutations keep their existing command receipt and expected-version checks.
- Agent handoff requests require a live claim and current owner run. They create a durable `requested` intent and fence source mutations without changing assignment. A project-scoped coordinator endpoint validates both execution authorities and destination binding before it records authorization and asks the source owner to stop.
- Added Agent tool tests for host-derived identity and stable retry IDs. Added controlled integration coverage for handoff request replay, source-action fencing, coordinator authorization replay, and stop request idempotency.
- `pnpm agent:test --filter n8n -- src/modules/agents/__tests__/department-work.tool.test.ts --maxWorkers=1` — passed.
- `pnpm agent:test --filter n8n --script test:sqlite -- src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` — passed, 29 tests.
- `pnpm agent:test --filter n8n --script test:sqlite:migrations -- test/migration/1793698314000-add-ai-department-work-handoff-intent.test.ts --maxWorkers=1` — passed.
- `pnpm --filter @n8n/db build`, `pnpm --filter @n8n/api-types build`, and `pnpm --filter n8n typecheck` — passed.
- `pnpm db:schema:docs` regenerated SQLite and Postgres schema docs. `pnpm --filter @n8n/db schema:check:sqlite` and `schema:check:postgres` passed.
- Focused Biome checks and `git diff --check` — passed.
- T030 controlled-owner coverage is complete. C2-A6 remains open. Controlled stop tests and same-process live stop pass at their documented scope; durable sequence remains open. See `specs/feature-contracts/ai-department/evidence.md`.

### T025 evidence

- Added a durable active-attempt reference to each wake lane. The start transaction claims the lane before it reserves an attempt. It rejects a second active attempt in the same lane.
- Added an attempt index for project, member, initiating user, binding revision, and phase. Lane admission uses this index to detect active attempts that predate the lane lock.
- Lane claim records the generation it observed. A newer eligibility generation stays pending while the attempt is active. A confirmed terminal snapshot or rejected dispatch releases the lane.
- The controlled-owner integration test checks one active attempt per lane, inbox availability for other work, and a new eligibility generation during an active attempt. The test drains all work created by its fixture.
- The existing start replay case confirms that a repeated command keeps one dispatch and does not create another attempt.
- `pnpm --filter @n8n/db build` passed.
- `pnpm agent:test --filter n8n --script test:integration -- src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` passed: 23 tests.
- `pnpm agent:test --filter n8n --script test:sqlite:migrations -- test/migration/1793694522771-add-ai-department-work-wake-lane-drain.test.ts --maxWorkers=1` passed: 1 test.
- `pnpm --filter @n8n/db schema:docs` generated SQLite and Postgres docs. `pnpm --filter @n8n/db schema:check` passed for both databases.
- Biome format and check passed for all seven changed source and test files. Oxlint could not run because `@stylistic/eslint-plugin` is missing from the local install.
- A new coordinator instance reuses the persisted lane lock and drains later work after the active attempt becomes terminal. This is controlled recovery evidence, not a real Agent runtime test. C2-A1/A2 acceptance remains open for the broader controlled-owner matrix and owner-runtime proof.

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

### Isolated planning-path smoke check — 2026-11-05

- On the test-owned SQLite instance at `127.0.0.1:5789`, created an active goal, created work linked to that goal, assigned it to a current member, marked it ready, and read the scoped work detail.
- The API path completed in 78 ms. The detail confirmed the goal link, member assignment, and `ready` state. No Agent dispatch started.
- This is an API smoke check, not the manual two-minute usability study. It does not cover real Agent pickup, claim contention, cancellation, review, browser interaction, or roadmap-scale performance. T013 remains open.
