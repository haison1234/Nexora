# AI Department Specs 002–008: Feature Parity Review

**Date:** 2026-11-05
**Reviewer role:** Independent parity reviewer. Review only. No implementation file was changed. Nothing was committed.
**Scope:** Specs 002–008, the approved contracts C1–C6, and the code that belongs to these specs:
`packages/cli/src/modules/ai-department/`, the department files in `packages/cli/src/modules/agents/`,
`packages/@n8n/api-types/src/ai-department/`, the AI Department migrations, and
`packages/modules/ai-department/frontend/`. The rest of the monorepo was not reviewed.
**Paperclip revision:** `fea61638114a041ffe60cba178f2438bbb06e57b` (`/Users/haison/Documents/GitHub/paperclip`).

## How to read this report

- Evidence order: approved contract, then design, then Paperclip source, then Nexora code, then tests.
- A status is PASS only when I verified it in code or in a test that I ran.
- Paperclip anchors in the contracts and in `evidence.md` were **not** re-verified, except the files listed under "Paperclip files read".
- No Paperclip code is copied here.

**Paperclip files read in this review:** `skills/paperclip/SKILL.md`,
`skills/paperclip/references/api-reference.md` (execution policy, cross-agent review),
`maps/feature-map/task-coordination.md`, `maps/feature-map/questions-and-approvals.md`.
A search of `skills/`, `maps/`, `doc/PRODUCT.md`, and `doc/SPEC.md` found no meeting feature.

## A. Feature Parity Matrix

| ID | Paperclip behavior (reference) | Nexora expected behavior | Nexora implementation | Test evidence | Status |
|---|---|---|---|---|---|
| **002 / C1 Directory** | Agent roster with `reportsTo`, lifecycle (per baseline review; not re-read) | Department, member, manager, binding, archive guard (`directory.md`) | `member.service.ts` (manager checks), directory controller/repository | Ran: directory policy 6, controller 5, repository 4 pass | UNKNOWN. Tests pass and the contract says C1 is closed. I did not trace each C1 requirement. |
| C2-R1 Goals, hierarchy, blockers | Parent/child and dependency tasks (`task-coordination.md`) | `A blocks B` stops B until A is **done**. Cancel does not resolve a blocker | `work.repository.ts:277-298` | Ran: test at `work-attempts.integration.test.ts:1602` passes. It has no cancel case | **FAIL** (see D-1) |
| C2-R2 States; claim sets running | Atomic checkout by the agent | Reserve leaves work `ready`. Only a claim sets `running` | `work-coordination.service.ts:209` sets `running` on claim. `startWork` has no `start` event | Ran: test line 1465 passes | PASS |
| C2-R3 Eligibility and wake in one transaction | Assignment wakeup, no wake for backlog | Same-transaction eligibility. Backlog never dispatches | `work.service.ts` `createEligibility`, `enqueueWorkWake` | Ran: tests lines 1228, 1465 pass | PASS (controlled) |
| C2-R4/R6 Inbox | Agent inbox, assigned tasks | Binding-scoped, `readyAt` then ID order, page 1–100 default 50 | `work-inbox.service.ts`; schema `take` 1–100 | Ran: test line 1513 passes | PASS (controlled) |
| C2-R5 Lane coalescing | Coalesced wakeups | One run per lane. A wake during drain stays pending | Wake-lane entities and services | Ran: test line 1362 passes. Restart case (C2-A2) not run | PARTIAL |
| C2-R7 Claim required for actions | Run-bound writes | Progress, block, resume, submit need a live claim | `work-coordination.service.ts:211-217` | Ran: tests lines 1729, 1685 pass | PASS (controlled) |
| C2-R8 Handoff | Reassign through explicit assignment | Pending until confirmed stop. Fence old run. Wake destination once | `work-handoff.service.ts` | Ran: tests lines 417–751 pass | PASS (controlled) |
| Release | Release with guard | Reason, fence, retain assignee, block work | `work-release.service.ts`, coordination `release` | Ran: test line 1795 passes | PASS (controlled) |
| D3 Lease and claim generation | Not mapped | 5-minute lease. Reclaim only after confirmed stop. **Larger claim generation. New attempt** | `CLAIM_LEASE_MS = 5 * 60 * 1000` (`work-coordination.service.ts:31`). `WorkClaim` has no generation field. Reclaim stays in the same attempt (lines 172-180) | Ran: test line 1962 passes | PARTIAL |
| C2-A1…A6 acceptance | n/a | Contract boxes checked | All six boxes are `[ ]` in `coordination.md`. Handoff says controlled acceptance passed | See section F | UNKNOWN (document conflict, section E) |
| **003 Work and attempts** | Heartbeat run, recovery, stop | Reserve before dispatch. Unknown ack stays reserved. Cancel needs confirmed stop | `work.service.ts`, Agents adapter | Ran: tests lines 178, 352, 843, 1084, 1116, 1268 pass | PASS (controlled). Live G2 acceptance open |
| C3 Native owner and recovery | Run lifecycle docs | Owner-confirmed stop. Restart recovery | Agents owner services | Ran: adapter 17, work tool 4 pass. Redis tests not run | PARTIAL |
| **C4 Review: basic** | Approve or request changes | `accept`/`return`, reason on return, version check | `work.service.ts:1687` `reviewWork` | Ran: test line 1133 passes | PASS |
| C4-R1…R6 Stages and policy | `executionPolicy.stages[]` with typed participants and a `returnAssignee` (`api-reference.md`) | Ordered stages, actor filters, round pinning, default `human_only` stage | No `ReviewPolicyRevision`, round, stage, `human_only`, or `not_creator` in any scoped package (search found none) | None | **MISSING** |
| **004 / C5 Workflow bridge** | Child tasks for delegated work (`SKILL.md`) | Published-only capability, pinned revision, deduplicated invocation, stop on revoke | `workflow/`, Agents invocation owner. Gate `DEPARTMENT_WORKFLOW_INVOCATIONS_ENABLED = false` | Ran: invocation 26, capability 8, owner 17, event 6 pass. Cross-process, queue, and restart tests not run | PARTIAL. Disabled by design. Contract and handoff disagree on G4/G5 |
| **005 Runtime bridge** | n/a (optional) | Isolated runner, grants, provider matrix | `packages/@n8n/ai-department-runner` does not exist. 0 of 13 tasks | None | MISSING (optional; no documented exclusion) |
| **006 / C6 2D UI** | Dashboard, task detail, org chart | Overview, Work, People, Activity in 2D | `packages/modules/ai-department/frontend/` | Ran: 116 frontend tests pass. No browser run | PARTIAL |
| C6-R4/R5 Push, revision | WebSocket live updates (not required) | Typed department invalidation, authorized subscription, revision token | No subscription route. No operations controller or revision allocation in `ai-department/` | None | MISSING (contract G6 open) |
| C6-R6 Fallback polling | Not mapped | 4 s, one read in flight, hidden pause, bounded backoff | `ai-department.constants.ts:4`; `useVisiblePolling.ts` has in-flight and visibility guards. No backoff | Ran: `useVisiblePolling.test.ts` 1 test passes | PARTIAL |
| **007 3D Office** | n/a (optional) | Lazy Three.js view over the same projection | `frontend/src/office/`, `three` dependency. 0 of 9 tasks checked | Ran: `office-model.test.ts` 23 pass. No budget measurement | UNKNOWN |
| **008 Meetings** | No meeting feature found in the files searched | Asynchronous meeting with contributions, synthesis, minutes, action items | `meeting.service.ts`, `meeting.controller.ts`, 10 tables, Agents meeting owner | Ran: meeting tests pass (section F). 17 of 33 tasks checked | PARTIAL. Provider and native acceptance open |

## B. Missing Functionality

1. **Staged business review (C4-R1…R6, D4, D5, 003 T018).** Review has only `accept`/`return`.
   Any actor with project `agent:update` can decide. The contract default is one `human_only` stage.
   Agent reviewers, requester exclusion, round pinning, and the audited reopen route are absent.
2. **Claim generation (D3).** `WorkClaim` carries no generation. A reclaim after confirmed stop reuses the same attempt.
   The contract requires a larger generation and a new attempt.
3. **Live push and operations read model (C6-R4/R5, D8).** No subscription route, typed invalidation, department revision, or `GET /operations`.
4. **Bounded polling backoff (C6-R6).** Errors are swallowed and the next tick runs at the fixed interval.
5. **Spec 005** is not started. It is optional, so it does not block the 2D product.

## C. Confirmed Code Defects

### D-1 (P1): A cancelled blocker unblocks the blocked work

- **File:** `packages/cli/src/modules/ai-department/database/repositories/work.repository.ts:294-296`
- **Evidence:** `hasUnresolvedBlockers` excludes blockers whose state is in `['done', 'cancelled']`.
  Callers: `work-coordination.service.ts:189` (claim), `:228` (resume), `:242` (submit),
  `work.service.ts:173` (start), `:1883` (ready), and `work-handoff.service.ts:94` and `:280`.
- **Contract:** C2-R1: "Cancellation does not resolve a blocker; remove or replace the edge." C2-A3: "Cancelling A does not silently unblock B."
- **Reproduction (by source reading; not executed):** Create work A and B. Add `A blocks B`. Make B ready and assign it. Cancel A. Claim B.
- **Expected:** The claim fails with "Resolve blocking work".
- **Actual:** `hasUnresolvedBlockers` returns false. The claim, resume, submit, start, ready, and handoff paths proceed.
- **Test gap:** The only blocker test (`work-attempts.integration.test.ts:1602`) does not cancel a blocker.
- **Minimal fix:** Use `terminalStates: ['done']`. Add a cancel case to the test. Do not change the archive guard.
  `003/research.md` says `done` and `cancelled` are terminal for **archive**. That rule is separate.

No other defect was confirmed. The items in section D are unverified risks, not defects.

## D. Dependency Gaps

| Dependency | State |
|---|---|
| Review round and policy persistence (C4) | Missing. Blocks C4 and C6 stage display |
| Claim generation column and migration (D3) | Missing. `invoke()` in C5 also names `claimGeneration` |
| Department revision allocation (C6) | Missing. Blocks ordered invalidation |
| Push subscription handler (C6) | Missing |
| Redis-backed process tests | Not run here. Needed for C2-A2, C5-A3, C5-A5 |
| G1 live wake and coalescing acceptance | Open per contract. Not verifiable here |
| G2 live stop proof | Partial per `evidence.md`. Not re-verified |
| Browser acceptance (C6-A1…A5) | Not run here |

## E. Intentional Differences and Document Conflicts

**Adapted without approval conflict**

- Paperclip uses WebSocket live updates. Nexora uses typed push plus snapshot. The contract approves this (D8). It is not implemented.
- Paperclip routes a review through the issue's `executionPolicy`. Nexora selects ordered business review stages (C4). The contract approves this narrowing together with D4. D4 approval is recorded in the README.

**Document conflicts (not silently resolved)**

1. `coordination.md`, `review.md`, `operations.md`, `workflow.md`: all acceptance boxes are `[ ]`. The handoff reports controlled passes for C2-A1…A6.
2. `workflow.md` says "G4–G5 remain OPEN". The handoff says G4, G5, and T010 passed on 2026-11-05. Both say the invocation gate stays false.
3. `tasks.md` for 006 shows 3 of 19 checked. The frontend module, Overview, Work, People, and Activity views exist and have passing tests.
4. `tasks.md` for 007 shows 0 of 9 checked. Office code and a `three` dependency exist.
5. 003 `tasks.md` leaves T014–T017 unchecked. The Agent inbox, claim, report, and release tool exists and its tests pass.
6. `coordination.md` itself states that the 003 data model conflicts with C2-R2 on the start transition. Code follows C2-R2.

## F. Test Results

All runs used one worker and a temporary `N8N_USER_FOLDER`. No user database was opened.

| Suite | Result |
|---|---|
| CLI integration (sqlite): `ai-department/__tests__` (7 files; revocation integration excluded) | **88 passed** |
| CLI unit: directory and work policy, meeting policy, takeover, context reader, binding verifier, workflow invocation and capability, Agents adapter, work tool, meeting and workflow owners, workflow event, meeting repository (14 files) | **114 passed** |
| `@n8n/api-types` `src/ai-department` (2 files) | **7 passed** |
| Frontend module (16 files) | **116 passed** |

**Not run:**

- `workflow-invocation-revocation.integration.test.ts` (excluded by mistake of scope, not because it fails).
- Redis-backed Agents tests: queue stop, cross-process stop, process restart, workflow stop integration.
- Migration tests, `schema:check`, typecheck, lint.
- Playwright and any browser check.
- Any live Agent, provider, or runtime run.
- The defect D-1 reproduction. It is by source reading only.

A passing suite shows controlled behavior. It does not show native Agent behavior or process restart recovery.

## G. Final Verdict

**CHANGES REQUIRED**

| Spec | Verdict | Reason |
|---|---|---|
| 002 | Not decided | Tests pass. Requirement trace incomplete |
| 003 / C2 | CHANGES REQUIRED | D-1 blocker defect. D3 generation missing. C2-A1…A6 unchecked |
| 003 / C4 | CHANGES REQUIRED | Staged review missing |
| 004 / C5 | BLOCKED | Gate false. Owner acceptance evidence conflicts across documents. Redis tests not run |
| 005 | Not started | Optional |
| 006 / C6 | CHANGES REQUIRED | Push, revision, and backoff missing. Browser acceptance not run |
| 007 | Not decided | No tasks checked. Code exists. No budget evidence |
| 008 | CHANGES REQUIRED | No Paperclip reference. Provider and native acceptance open. Product direction is under review |

No spec passes. Fix D-1 first. It is small and the contract already approves the behavior.
