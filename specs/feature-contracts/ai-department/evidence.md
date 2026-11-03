# Contract Evidence and Open Gates

**Inspection date:** 2026-11-03, Asia/Ho_Chi_Minh.
**Initial method:** Read-only source/log inspection. The n8n worktree had uncommitted
changes. The initial evidence did not map test logs to the current diff.

## Paperclip reference at fea6163

Resolved HEAD: `fea61638114a041ffe60cba178f2438bbb06e57b`.
Paths below are relative to `/Users/haison/Documents/GitHub/paperclip`.

| Question | Direct source anchor | Observed behavior | Target decision |
|---|---|---|---|
| Assignment wakes | server/src/services/issue-assignment-wakeup.ts, queueIssueAssignmentWakeup | No wake for backlog/unassigned; assignment wake carries actor/context and issue ID | D1 preserves readiness boundary; adds n8n authority lanes |
| Durable/coalesced runtime | server/src/services/heartbeat.ts, coalesce-target guard and wake/run control; heartbeat/scheduling.ts | Runtime queue, terminal-run recovery and suppression are owner concerns | C2/C3 keep durable signals and reconcile; do not copy heartbeat engine |
| Claim and blockers | server/src/services/issues.ts:12150, checkout | Expected status, assignee/run conditions and unresolved-blocker checks guard checkout | C2/C3 atomic admission |
| Release | server/src/services/issues.ts:12581, release | Row lock and run ownership; unfinished release clears assignee, terminal cleanup retains it | D2 deliberately retains member assignment and uses explicit transfer |
| Reviewer identity | server/src/services/issue-review-policy.ts, assertIssueReviewVerdictActorAllowed | human_only checks user principal; not_creator resolves review requester and denies missing requester | D4/D5; n8n participants/scopes stay separate |
| Live UI | ui/src/context/LiveUpdatesProvider.tsx | Query invalidation, socket state, reconnect recovery and disconnected polling | D8 adapts outcome to n8n push; no socket/schema port |

This bounded inspection does not prove every Paperclip stage/handoff route. Serial stage,
authority lane, claim generation and capability revision choices are target proposals.
Paperclip is not evidence for a native n8n workflow bridge.

## n8n source anchors

Paths are relative to the repository root.

| Contract | Primary source | Observed / missing |
|---|---|---|
| C1 | packages/cli/src/modules/ai-department/{department,member}.service.ts; database/repositories/directory.repository.ts; work/active-department-work-guard.ts | Directory, binding revisions and guard exist; full current acceptance open |
| C2 | packages/cli/src/modules/ai-department/work/work.service.ts, deliverReadyWork/startWork; database/entities/work-wake-intent.entity.ts | Per-work durable wake, reservation, graphs/activity; no lane inbox/coalescing or destination handoff |
| C2/C3 | packages/cli/src/modules/ai-department/work/work-coordination.service.ts, executeAction | Claim/lease/report/release exist; cross-run reclaim and scoped stop proof differ from D3 |
| C3 | packages/cli/src/modules/agents/agent-department-execution.contracts.ts; agent-department-execution.adapter.ts; tools/department-work.tool.ts; agent-runtime-reconstruction.service.ts | Host context, owner queue, verifyRun/lookup/stop/snapshot; restart/resume/sequence guarantees unverified |
| C4 | packages/cli/src/modules/ai-department/work/work.service.ts, reviewWork; database/entities/work-review-decision.entity.ts | Basic result/version/terminal-owner check; no stage/round/participant policy |
| C5 | packages/cli/src/modules/agents/tools/workflow-tool-workflow-loader.service.ts; workflow-tool-factory.ts; packages/cli/src/executions/pre-execution-checks/subworkflow-policy-checker.ts | Native publication/input/wait/caller primitives; department adapter and invocation-key acceptance not found |
| C6 | packages/modules/ai-department/frontend/src/{ai-department.store.ts,ai-department.api.ts,views/AiDepartmentHomeView.vue} | Partial UI and stale-response handling; no verified authorized push or complete C6 controls |

### G1–G2 owner-boundary review

**Review date:** 2026-11-03. These findings separate source behavior from the
proposed cross-module contract. They do not count as runtime acceptance.

| Gate | Source evidence | Finding | Gate result |
|---|---|---|---|
| G1 | `AgentMessageQueueService.enqueue()` commits the queue row in a transaction, derives a deterministic message ID, and returns accepted or duplicate. `AgentDepartmentExecutionAdapter.dispatch()` currently ignores that return value and performs lookup. `lookup()` correlates the queued message and execution to project, Agent and owner. `AgentMessageQueueConsumer.scan()` scans durable queue rows at startup and every 5 seconds; database thread claims coordinate consumers. | Agents provides durable per-message admission and lost-notification recovery. It does not provide department lane generations, lane coalescing, or one-run-per-member-lane admission. The department owns those semantics and persists per-work eligibility. The owner boundary must accept an idempotent dispatch key and expose accepted/rejected/absent/unknown lookup; it must not treat a wake as a claim. | **DESIGN CLOSED.** Source supports the ownership split. C2-A1/A2 and C3-A1 still require controlled and native-owner acceptance before runtime enablement. |
| G2 | `isRunStopped(executionId)` checks only execution status and HITL suspension. `requestStop()` rechecks user `agent:execute` access, then calls the session stop service. Snapshot correlation checks project, Agent, thread/attempt and owner, but its sequence is derived from `updatedAt` milliseconds. | Current stop proof is not attempt-scoped and cannot be used after the initiating user's access is revoked. Timestamp-derived sequence is not a durable monotonic owner sequence across restart or clock changes. `execution.md` now defines command authority, owner correlation, idempotent stop receipts, terminal proof, unknown-state reservation, and durable sequence ordering. | **DESIGN CLOSED; IMPLEMENTATION/ACCEPTANCE OPEN.** The current adapter does not meet this contract. Owner restart and revocation proof remain required before handoff/recovery runtime acceptance. |

## Progress report and logs

The IDE path `specs/AI-DEPARTMENT-PROGRESS-REPORT-2026-11-03.md` was absent during this
inspection. The report was read from the user attachment:
`/Users/haison/.codex/attachments/9de2e263-5ab9-4651-b496-5982fcdd4ea4/Pasted text.txt`.
Its Paperclip pin is historical. The log tails below were directly inspected and agree
with the report. Local temporary paths are not durable CI artifacts.

| Evidence | Directly observed result | Limit |
|---|---|---|
| /tmp/ai-department-coordination-tests.log | 33 passing tests across 6 files | Earlier SQLite run; later edits/new cases not covered |
| /tmp/ai-department-owner-tests.log | 14 passing tests across 3 files | Earlier adapter/policy run |
| /tmp/ai-department-native-owner-tests.log | 1 passing native queue-owner integration case | No model provider call |
| /tmp/ai-department-cli-typecheck.log | Failed: four TS2722 errors in department-work.tool.test.ts | Subsequent fix has no fresh passing evidence |
| /tmp/ai-department-lint.log; /tmp/ai-department-frontend-lint.log | Available tails contain pnpm warning, no errors | Not proof of exit status or latest file coverage |
| /tmp/ai-department-planning-metrics.json | 10 departments, 100 members, 1,000 work; 30 reads; p50 1.342791 ms, p95 3.503625 ms | Local SQLite planning reads; no concurrent model/browser/PostgreSQL comparison |

API/database build success is reported by the attachment. Its build logs were not checked
here. Browser, real-model, new reclaim/renew/release and complete restart/resume
acceptance remain unverified.

## Current C1 acceptance update

**Date:** 2026-11-03. **Base commit:** `679ab1e5179d376bfbf5777938c0e1fc12a98714`.
The working tree contains focused integration-test changes. The current evidence below
comes from those test runs; it does not use the historical `/tmp` logs above.

| Contract/task | Current result | Evidence and limit |
|---|---|---|
| C1-A1 / T032 | PASS | Binding replacement and clear retain member ID and old attempt snapshot. A replacement binding is used by a new attempt. The old context cannot claim. The project-scoped attempt list retains the earlier attempt after clear. Three binding revisions remain stored. See `.agent-setup/checks/1793682782132-42271-test/output.log`. |
| C1-A2 / T034 | PASS | Archive races pass against assignment and attempt reservation. No dispatch starts when archive wins. See `.agent-setup/checks/1793682610919-39370-test/output.log` and `.agent-setup/checks/1793682782132-42271-test/output.log`. |
| C1-A3 / T033 | PASS | An automatic result does not unblock archive while the owner attempt remains active. Archive succeeds after terminal reconciliation. See `.agent-setup/checks/1793682782132-42271-test/output.log`. |
| C1-A4 | PASS | Cross-project access, reader mutation, invalid hierarchy, stale update, duplicate replay, and request ID/payload conflict are covered by focused API tests. See `.agent-setup/checks/1793682923300-44569-test/output.log`. |
| C1-A5 | PASS | Old-context mutation is denied. Attempt history remains readable through the project-scoped service after binding clear. The test does not claim C3 stop or restart/recovery acceptance. See `.agent-setup/checks/1793682782132-42271-test/output.log`. |
| T025–T026 | PASS | Member/department archive is blocked by nonterminal work. Member identity and terminal work references remain readable after archive. See `.agent-setup/checks/1793682610919-39370-test/output.log`. |
| T030 | PASS | Automated acceptance for scenarios 2–11 passed in focused API/service integration tests. In the local project UI, the department plus two unconfigured members appeared in 19,814 ms from first form input. This is browser-assisted timing, not a human usability study. |
| T034 schema | PASS | `pnpm db:schema:docs` regenerated both schema outputs. `pnpm --filter @n8n/db schema:check` passed for SQLite and PostgreSQL. These checks do not replace a separate production database rollout test. |

The C1 design and implementation acceptance gates are closed. The UI timing records a
browser-assisted path and does not claim human usability-study results. G1–G6 remain
open for their respective contracts.

## Contract/source gates before affected tasks

| Gate | Required resolution | Owner / affected slice | State |
|---|---|---|---|
| G1 | Department owns durable lane generations, coalescing and one-run admission; Agents owns idempotent per-dispatch queue acceptance, lookup and queue-scan recovery. Verify no lost eligibility or duplicate active run. | Agents + department; C2/C3 | DESIGN CLOSED; runtime acceptance OPEN |
| G2 | Implement the approved scoped stop proof and durable snapshot sequence across resume/restart; prove revocation stop authority. | Agents; C3/C2 handoff | DESIGN CLOSED; implementation/runtime acceptance OPEN |
| G3 | Verify authenticated independent Agent review assignment/context and initiator scope mapping; otherwise gate Agent-review policy off | Agents + department; C4 Agent-review slice | OPEN |
| G4 | Verify supported published trigger/input contract, exact-version acceptance and invocation-key lookup; constrain inherited workflow tools | Agents/workflow owner; C5 | OPEN |
| G5 | Verify native stop/revocation propagation to waiting/retrying workflow children | Workflow execution owner; C5 | OPEN |
| G6 | Verify current-access check on push send, session-owned pushRef and consistent atomic revision/snapshot | Push + persistence owners; C6 live slice | OPEN |
| G7 | Reconcile migration registration/schema docs and actual source DTO/entity fields for accepted deltas | Persistence; affected schema slice | PARTIAL: C1 schema slice verified; other deltas open |

A proposed interface is not a verified existing owner API. G1's ownership split is
resolved from current source; its runtime acceptance remains open. G2's owner operation
design is now explicit in `execution.md`; implementation and runtime proof remain a gate
for handoff/recovery behavior. Unrelated C1 planning or
C6A controlled demonstrations need not wait for optional 005 or unselected Agent review.
