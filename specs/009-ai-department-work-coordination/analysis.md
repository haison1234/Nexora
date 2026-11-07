# Cross-Artifact Analysis: AI Department Work Coordination

**Date**: 2026-11-06
**Scope**: `spec.md`, `plan.md`, `tasks.md`, and the AI Department constitution.
**Mode**: Read-only consistency review. This report records findings; it does not change requirements or acceptance gates.

## Findings

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| G1 | Coverage | High | `spec.md` FR-008, FR-010, SC-002, SC-003, SC-004; `tasks.md` T017, T018, T021, T039–T042; `specs/feature-contracts/ai-department/evidence.md` “Spec 009 G1 owner gate” | The consultation owner bridge and durable recovery records exist behind a disabled gate. Live continuation, restart recovery, binding-loss and initiating-user access-loss rejection, owner stop, lane coalescing, concurrent answer, reporting-line reassignment, and executor revision replacement have evidence. Remaining G1 acceptance criteria still need review. | Keep Agent answers and requester continuation disabled until the remaining G1 acceptance criteria pass. |
| G2 | Coverage | High | `spec.md` FR-017, SC-006; `tasks.md` T034 | Meeting table retirement has no approved retention owner, period, export, backup, or rollback decision. Current retention test proves the UI release does not mutate a row; it does not prove long-term recoverability or an approved retirement migration. | Preserve existing tables and rows. Do not write a retirement migration until data disposition and rollback are approved. |
| G3 | Task granularity | Medium | `tasks.md` T021 | T021 combines implemented human-answer behavior with the gated requester continuation. Its open checkbox is accurate, but it obscures which work is complete. | Split this task when the continuation gate is accepted. Keep the gated slice open until its tests pass. |
| G4 | Traceability | Low | `tasks.md` Requirement Coverage | FR and SC mapping is grouped into ranges. It does not show evidence status per individual requirement. | Keep this report with the task plan and update the mapping when gated tests are added. |

No duplicate or directly conflicting requirements were found. Plan architecture and task dependencies align with the constitution: execution stays with the Agents owner, access is rechecked, and source review is not treated as runtime acceptance.

## Coverage Summary

| Requirement | Has task mapping? | Task IDs | Evidence status |
|---|---|---|---|
| FR-001 | Yes | T010–T016 | Implemented; focused integration/UI evidence recorded. |
| FR-002 | Yes | T010–T015 | Implemented; validation and authorized projection evidence recorded. |
| FR-003 | Yes | T011–T016 | Implemented; review-policy and no-extra-dispatch coverage recorded. |
| FR-004 | Yes | T001–T003, T016–T024 | Human ask path implemented; focused lifecycle coverage recorded. |
| FR-005 | Yes | T001–T002, T017–T021 | Safe stop is implemented; terminal owner acceptance for consultation remains gated. |
| FR-006 | Yes | T016–T019 | Deterministic routing implemented; Agent dispatch remains gated. |
| FR-007 | Yes | T016, T019 | Fallback selection and access checks implemented. |
| FR-008 | Yes | T001–T002, T018, T039–T040, T042 | Owner bridge and no-tools profile exist; integration and runtime acceptance remain gated. |
| FR-009 | Yes | T017, T020–T023 | Human answer is implemented and integration-tested. |
| FR-010 | Yes | T001–T003, T017–T021, T041–T042 | Answer persistence is implemented; continuation exists behind the disabled gate and still needs race and runtime evidence. |
| FR-011 | Yes | T017, T021–T023 | Human answer is information-only; Agent answer path is gated. |
| FR-012 | Yes | T017, T020 | Request cap and expiry checks are covered; Agent-stage escalation/recovery remains gated. |
| FR-013 | Yes | T024–T027 | Child creation, replay, conflict, and recipient checks are covered. |
| FR-014 | Yes | T024, T026, T028 | Parent/child blocker and relationship coverage is recorded. |
| FR-015 | Yes | T013–T016, T022–T024, T029 | Work views and localized help/report UI have focused and browser coverage. |
| FR-016 | Yes | T029, T031–T033, T036 | Meeting creation/navigation removal is verified in English and Vietnamese browser runs. |
| FR-017 | Yes | T030, T034 | Current rows remain queryable and unchanged; approved retirement disposition remains open. |
| FR-018 | Yes | T001–T003, T009–T029, T036, T039–T042 | Command replay, version, scope, and current-access checks have focused coverage; gated owner outcomes remain unverified. |
| FR-019 | Yes | T043, T046 | Direct-report authorization and service integration coverage pass on SQLite; controlled runtime acceptance remains open. |
| FR-020 | Yes | T044, T046 | Child, relationships, eligibility, lane, wake, and receipt roll back atomically on SQLite; controlled owner dispatch acceptance remains open. |
| FR-021 | Yes | T045 | C5 invocation gate remains disabled; publication, revocation, and approval acceptance remain open. |
| FR-022 | Yes | T047–T049 | Authorized child report projection and parent wake are implemented. SQLite and PostgreSQL integration cover both completion orders, sequential child assignments, parent reassignment, binding restoration, repeated reconciliation, release pagination beyond 100 rows, and recovery through a reconstructed service. Controlled Agents owner acceptance remains open. |
| SC-001 | Yes | T011–T016 | Report flow is covered; no separate synthesis dispatch is tested. |
| SC-002 | Yes | T001–T003, T016–T024, T039–T042 | Human request path is durable; full restart-to-answer/escalation lifecycle is not yet accepted. |
| SC-003 | Yes | T017–T024, T040–T042 | Delegate and answer deduplication have focused coverage; help wake deduplication remains gated. |
| SC-004 | Yes | T001–T003, T018, T039–T042 | The consultation profile limits one response turn; requester continuation lacks owner runtime evidence. |
| SC-005 | Yes | T016–T024 | Deterministic same-department/project routing and rejection paths have focused coverage. |
| SC-006 | Yes | T030–T035 | Current release preserves rows; long-term recoverability through approved disposition is still open. |
| SC-007 | Yes | T043, T044, T046 | Two-level direct-report service flow and atomic persistence are covered on SQLite and PostgreSQL; controlled Agents owner acceptance remains open. |
| SC-008 | Yes | T045 | Workflow calls remain disabled until C5 owner acceptance. |
| SC-009 | Yes | T047–T049 | Parent wake after final child review is implemented and covered on SQLite and PostgreSQL. Recovery through a reconstructed service is verified; controlled Agents owner runtime acceptance remains open. |

## Historical Inventory and Metrics — 2026-11-06

- Functional requirements: 22.
- Success criteria: 9.
- Tasks at this review: 49 total; 40 checked; 9 open (T017, T018, T021, T040–T042, T045, T046, T049).
- Requirements with a task mapping: 31/31 (100%). Mapping does not mean runtime acceptance.
- High-severity findings: 5; medium: 2; low: 1; critical: 0.
- Constitution conflicts: 0.
- Unmapped tasks: none identified. T038 is the analysis/reporting task.

## Next Actions

1. Keep Agent responses and requester continuation disabled until the current Agents owner contract and G1 acceptance pass.
2. Complete T017/T018/T021 and T040–T042 with help-specific answer race, blocker, restart, wake coalescing, and access-loss coverage.
3. Keep meeting tables intact until retention, export, backup, rollback, access, and data-owner decisions are approved.
4. Re-run focused tests and update this report when either gate changes.

## Design amendment review — 2026-11-07

The original read-only review above remains unchanged. This amendment records the follow-up
source comparison and proposed hierarchical workflow.

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| G5 | Authorization and dispatch | High | `spec.md` FR-013–FR-021; `work-coordination.service.ts`; C2-R3/R8 | The existing delegate path accepted an eligible same-department recipient, created ready child work, and committed its relationships and receipt without creating a durable eligibility row or wake intent. That does not complete the manager-to-report flow. | Restrict Agent delegation to a bound direct report. Commit child work, relationships, eligibility, lane generation, wake intent, activity, and receipt together. Verify dispatch before marking the tasks complete. |
| G6 | Workflow authority | High | `spec.md` FR-021; C5-R1–R7 | Workflow calls are a separate capability and remain behind open C5 G4–G5 owner gates. A department role or parent assignment cannot grant workflow permission. | Keep the invocation gate disabled. Verify exact published revision, current project scopes, claim, binding, revocation, owner policy, and side-effect approval before enabling. |
| G7 | Business review | Medium | `spec.md` FR-003, FR-021; C4 review contract | Child report completion does not itself make a manager Agent an authorized business reviewer. C4 Agent review authority remains gated. | Keep human review policy by default. Do not conflate manager reporting, business acceptance, and workflow approval. |
| G8 | Parent continuation | High | `spec.md` FR-022; `work.service.ts`; `work-release.service.ts`; C2-R1/R3 | Implemented a durable `waiting_for_children` marker, an authorized child report projection, and parent eligibility/wake after child acceptance and confirmed parent stop. SQLite and PostgreSQL coverage passes for both completion orders, sequential child assignments across two parent attempts, cancellation remaining blocking, binding loss and restoration, parent reassignment, release pagination, and recovery through a reconstructed service. A second wake previously selected an older confirmed release; lookup now binds to the current parent attempt. Controlled owner acceptance remains open. | Complete T049 controlled Agents owner validation. Keep runtime acceptance separate from persistence tests. |

Paperclip source review at pinned revision `fea61638114a041ffe60cba178f2438bbb06e57b`
confirmed the reference behavior: assignment wake ignores backlog items and enters a durable
queue with an issue identity; tool access is checked against current grants. The direct-report
authorization rule is a Nexora design choice, not a Paperclip requirement. Its hierarchy and
workflow implementation are not copied. Nexora uses its own Work, org, capability, Agents
owner, and wake-lane contracts.

Follow-up SQLite coverage now verifies direct-report, archived, unbound, stale-manager,
cross-project rejection; goal inheritance; unchanged parent ownership; atomic rollback after
wake-intent persistence fails; sequential child completion; cancellation remaining a blocker;
delayed wake recovery after a parent binding is restored; parent reassignment before the
attempt; service reconstruction with persisted recovery state; repeated reconciliation
without a second wake; and cursor pagination beyond 100 confirmed parent releases. The
focused work-attempts integration suite passed 55/55 on both SQLite and PostgreSQL. The
second-parent-wake test exposed and fixed release selection across retries: continuation now
uses the release for the parent's current attempt. A successfully queued continuation retires
its release marker so reconciliation does not scan it forever. T043, T044, T047, and T048
are complete. T049 still requires controlled Agents owner acceptance, and T046 still requires
the campaign quickstart on a dedicated database with controlled owner execution and runtime
restart. FR-019–FR-022 remain subject to C2, C4, and C5 acceptance gates.

## Coordination verification update — 2026-11-07

The earlier inventory and amendment above are historical snapshots. Current worktree
verification completed T017, T018, T040, and T041:

- The consultation owner test proves that a queued consultation reaches terminal cancellation
  before the owner confirms stop.
- SQLite Work integration runs two reconstructed help services against one successful owner
  result. It stores one attributed response, creates one ready retry for the unchanged
  assignee, and delivers one durable wake. A paired case preserves blocked Work and creates
  no new attempt while an unresolved blocker remains.
- The same SQLite suite covers terminal owner failure, unavailable results, expired requests,
  and persisted wake recovery after an unaccepted dispatch. Consultation owner tests reject
  results after project access or recipient binding changes.
- Current focused verification passed: consultation owner unit tests 9/9 and Work attempts
  integration tests 62/62. CLI typecheck, Biome, and `git diff --check` passed. Targeted ESLint
  reported no errors and existing warnings in the two test files.
- Opt-in live Ollama tests passed 1/1 for published Agent pickup with a structured result and
  1/1 for stopping a live request before its response ended, with terminal cancellation
  confirmed. Both used `qwen2.5:3b` and `/tmp/nexora-native-owner-test`.
- A third opt-in Ollama test passed 1/1 for a no-tools help consultation. It confirmed the
  specialist's bounded answer was attributed and stored before one accepted wake, with the
  requester assignment unchanged. Vitest created an isolated temporary SQLite folder. The
  requester execution was controlled, not a live model continuation. Runtime reconstruction
  now skips tool injection for consultation and meeting profiles; a focused regression test
  covers the empty tool list for both. See the current evidence entry in
  `specs/feature-contracts/ai-department/evidence.md`.

T021 remains open because requester continuation is disabled in normal runtime until G1
passes. T042 remains open until all current-owner G1 acceptance cases pass. T045 remains open
until C5 G4–G5 acceptance passes. Keep
Agent responses, requester continuation, and workflow invocation disabled. The local AI Department page at
`http://localhost:8292/home/agents` responded with HTTP 200 during this verification.

## Verification addendum — 2026-11-07

The 2026-11-07 task inventory has 49 tasks. Forty-six are checked and T021, T042, and T045
remain open. New live continuation evidence below does not close T021 or T042 because the
remaining G1 acceptance criteria are still open.

The unchecked implementation gates are T021, T042, and T045. T017/T018, T040/T041, T046,
and T049 are checked in the 2026-11-07 task file.

- T021's human-answer persistence case passed in a test-owned SQLite folder. It verifies
  terminal-stop proof and confirms that the human answer does not wake the requester.
  The production continuation remains gated.
- T042's live hierarchy subcase passed with Ollama `qwen2.5:7b`. The consultation
  owner suite passed 10/10. It rejects completed answers after project-access or recipient
  binding changes. Separate-process queue recovery also passed prepare/recover: it retained
  waiting work, claimed the persisted owner message, coalesced a wake during drain, and
  dispatched the next item after restart. A new two-process Ollama `qwen2.5:7b` test also
  passed help-answer continuation after restart. It persisted an answered request in process
  one, recovered it in process two, and verified one requester attempt reached review and
  terminal success after reading and submitting the stored answer. The live consultation
  matrix passed 4/4 with `qwen2.5:7b`: normal access completed continuation to business
  review; responder binding removal and initiating-user project access loss during generation
  both withheld the result and left Work blocked; concurrent reconcilers stored one response
  and created one requester attempt. Agent-routed requests use the initiating user as the
  authorization actor and recheck the responder's member binding; the responder user is not a
  separate authorization actor. The responder reporting-line reassignment case passed and
  confirmed that it does not revoke execution authority. Replacing the responder's executor
  revision during generation withheld the result. Remaining G1 acceptance criteria stay open.
- T045's capability and invocation suites passed 36/36. Revocation integration passed 2/2
  in a test-owned SQLite folder. Workflow approval wait/resume and side-effect approval remain
  unverified. Three focused Agent runtime tests also passed. They verify the closed owner gate
  blocks execution and filters inherited workflow tools from primary and delegated Department
  runtimes. Workflow invocation stays disabled.
- The 8292 AI Department page returned HTTP 200, and the 8292 `/rest/settings` proxy returned
  HTTP 200 from the backend on 5791. The local owner database on backend 5791 was not used by
  these focused test runs.

No runtime gate changed. Preserve meeting records until their retention and migration
decision is approved.

### Resumed requester answer context — 2026-11-07

The resumed attempt previously received the original Work instruction, while `inspect`
returned only child reports. The stored help answer was therefore not available to the
requester Agent through its normal tool flow. The inspect projection now includes answered
help requests for the current assigned member, with the question, bounded answer, responder
kind, and answer time. The tool description says that answers provide information and do not
grant permission. The SQLite Work integration suite passed 62/62 with a new assertion that
the resumed attempt receives the stored answer. Typecheck, API types build, Biome, and
`git diff --check` passed. This closes the answer-context gap in T041; it does not satisfy
  T042's reporting-line reassignment and executor revision replacement runtime acceptance.
