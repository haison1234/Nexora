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
| C2/C3 | packages/cli/src/modules/ai-department/work/work-coordination.service.ts, executeAction | Claim/lease/report/release exist. D3 source behavior now requires owner-confirmed stop, terminal reconciliation, and a new attempt with a larger generation. Native stop and restart proof remains open. |
| C3 | packages/cli/src/modules/agents/agent-department-execution.contracts.ts; agent-department-execution.adapter.ts; tools/department-work.tool.ts; agent-runtime-reconstruction.service.ts | Host context, owner queue, verifyRun/lookup/stop/snapshot; restart/resume/sequence guarantees unverified |
| C4 | packages/cli/src/modules/ai-department/work/work.service.ts, reviewWork; database/entities/work-review-decision.entity.ts | Basic result/version/terminal-owner check; no stage/round/participant policy |
| C5 | packages/cli/src/modules/agents/tools/workflow-tool-workflow-loader.service.ts; workflow-tool-factory.ts; packages/cli/src/executions/pre-execution-checks/subworkflow-policy-checker.ts | Native publication/input/wait/caller primitives; department adapter and invocation-key acceptance not found |
| C6 | packages/modules/ai-department/frontend/src/{ai-department.store.ts,ai-department.api.ts,views/AiDepartmentHomeView.vue} | Partial UI and stale-response handling; no verified authorized push or complete C6 controls |

### G1–G2 owner-boundary review

**Review date:** 2026-11-03. These findings separate source behavior from the
proposed cross-module contract. They do not count as runtime acceptance.

| Gate | Source evidence | Finding | Gate result |
|---|---|---|---|
| G1 | `AgentMessageQueueService.enqueue()` commits the queue row in a transaction, derives a deterministic message ID, and returns accepted or duplicate. `AgentDepartmentExecutionAdapter.dispatch()` looks up the durable message after enqueue. `lookup()` correlates the queued message and execution to project, Agent and owner. `AgentMessageQueueConsumer.scan()` scans durable queue rows at startup and every 5 seconds; database thread claims coordinate consumers. Separate-process restart tests cover queue scan, retained lane wakes, competing queue claims, lane admission, duplicate dispatch, binding revision changes during an unacknowledged dispatch on SQLite and PostgreSQL, plus controlled stop recovery after binding removal or project-access loss. | A live isolated single-main run used real Ollama `qwen2.5:3b`: after process restart, the sweeper marked the abandoned execution interrupted and the lane dispatched two waiting work items sequentially. Both post-restart model executions reached `success`; work stayed blocked because neither submitted a business result. This proves live model execution after restart and serial wake drain for that path. | **PARTIAL.** Separate-process PostgreSQL races prove one queue claimant, one lane admission, and idempotent duplicate dispatch. Live Ollama restart/drain passes in one SQLite main. Controlled SQLite and PostgreSQL cases prove stop receipt recovery after binding removal or project-access loss; test harness finalization does not prove a live model responds to stop. Provider-backed business results, different-user/member/binding lanes, and full G1 acceptance remain open. |
| G1 | `AgentMessageQueueService.enqueue()` commits the queue row in a transaction, derives a deterministic message ID, and returns accepted or duplicate. `AgentDepartmentExecutionAdapter.dispatch()` looks up the durable message after enqueue. `lookup()` correlates the queued message and execution to project, Agent and owner. `AgentMessageQueueConsumer.scan()` scans durable queue rows at startup and every 5 seconds; database thread claims coordinate consumers. Separate-process restart tests cover queue scan, retained lane wakes, competing queue claims, lane admission, duplicate dispatch, binding revision changes during an unacknowledged dispatch on SQLite and PostgreSQL, plus controlled stop recovery after binding removal or project-access loss. | A live isolated single-main run used real Ollama `qwen2.5:3b`: after process restart, the sweeper marked the abandoned execution interrupted and the lane dispatched two waiting work items sequentially. Both post-restart model executions reached `success`; work stayed blocked because neither submitted a business result. This proves live model execution after restart and serial wake drain for that path. | **PARTIAL.** Separate-process PostgreSQL races prove one queue claimant, one lane admission, and idempotent duplicate dispatch. Live Ollama restart/drain passes in one SQLite main. Controlled SQLite and PostgreSQL cases prove stop receipt recovery after binding removal or project-access loss; the new Ollama run confirms an active execution before restart and receipt recovery afterward, but the model request did not survive the process kill. Provider-backed business results, different-user/member/binding lanes, and full G1 acceptance remain open. |
| G2 | Agents stores a durable owner-thread snapshot counter and command-keyed stop receipts. Controlled owner integration covers revoked-user stop authority, accepted stop, duplicate/conflicting commands, and receipt reconciliation. | The opt-in Ollama integration test now sends a Department cancel while the real provider request is still open. The request aborts, the owner snapshot reaches `terminal/cancelled`, the stop receipt is confirmed, the attempt and work become cancelled, and the lane is released. This is a same-process live-stop scenario. The separate restart scenario verifies persisted receipt recovery after the old process is gone and the sweeper marks its execution `interrupted`; it does not require the model request to survive restart. No browser observation verified the UI label. Historical thread-counter observations 5 and 13 are not retained. Current persisted thread counters are 68 and 70; Department attempt `lastOwnerSequence` values are 54 and 56. | **PARTIAL / OPEN.** Same-process live stop passes. Restart receipt recovery passes as a separate scenario. Durable sequence acceptance, G1, and remaining C3 acceptance stay open. |

## Progress report and logs

### Live Ollama stop after binding removal — 2026-11-06

- Started the backend on port 5793 with the test-owned SQLite database at
  `/tmp/nexora-native-owner-test`. The run used local Ollama `qwen2.5:3b`. It did not open
  the user's working database on port 5791. The isolated backend stopped after evidence
  capture.
- Work `d03927c2-3dd7-4c52-8b40-77ba87b5e389` started native execution
  `18PG386tGBQIv6vB` at 23:08:04 UTC. SQLite showed the owner execution as `running` and the
  Department attempt as `active`. A live backend-to-Ollama connection was open before the
  member binding was cleared.
- Production reconciliation created stop receipt
  `2aaaae70-44ea-4451-b583-79c76492eefe` with reason `authority-revoked`. The native
  execution became `cancelled` at 23:10:05 UTC. The receipt was confirmed. The attempt became
  terminal/cancelled at 23:10:15 UTC, work became blocked, and the lane had no active attempt.
  Lane generation and acknowledged generation both equalled 8.
- No assistant or tool response was persisted before cancellation. This proves same-process
  live stop after binding removal. It does not prove post-restart live stop, accepted business
  result delivery, or the full C3-A2 matrix. The separate restart test remains controlled:
  its test harness finalizes the owner execution.

### Ollama execution and authority-stop recovery across backend restart — 2026-11-06

- Used the existing test-owned SQLite database at
  `/tmp/nexora-native-owner-test/.n8n/database.sqlite` as the only test database. No second
  test database or copy was created. The working backend and database on ports 5791 and
  5792 were not used.
- Rebound the test member to its existing Agent, then started work
  `65b211c6-fdc8-434e-b7db-9088ec5b0b88`. Local Ollama `qwen2.5:3b` had an active connection.
  Native execution `xOxX7apYZv1Q6MKw` was `running`; attempt
  `17914027-30b3-4206-916a-4e3c397c076e` was `active`.
- Killed only the test backend and restarted it with the same user folder and SQLite file.
  Immediately after restart, SQLite still showed the execution as `running` and the attempt
  as `active`. The old model request did not survive the process kill.
- Cleared the binding after restart. Production reconciliation changed the attempt to
  `stopping` and wrote a pending stop receipt with reason `authority-revoked`. After the
  two-minute liveness grace, the sweeper marked the owner execution `interrupted`, confirmed
  receipt `17914027-30b3-4206-916a-4e3c397c076e`, and terminalized the attempt as failed.
  Work became blocked. The lane had no active attempt, and its generation and acknowledged
  generation both equalled 2.
- This proves durable authority-revocation recovery after restart for an execution that ran
  a real model request before restart. It does not prove a live model loop survives restart
  or receives a stop afterward. Post-restart live stop, provider-backed business-result
  delivery, and full G1/C3-A2 acceptance remain open. The test backend stopped after capture.

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

### C2-A1–A6 and D3 implementation recheck — 2026-11-06

- Controlled status for each C2 acceptance item is recorded in `coordination.md`. C2-A2
  remains partial because the coordinator reconstruction test does not restart a separate
  process. The full C2-A1–A6 checkboxes remain open for native owner, restart, and revocation
  proof.
- D-1 now has a regression through the Agent claim action: after blocker A is cancelled,
  dependent work B still rejects claim. The relationship can still be removed explicitly.
- D3 now stores `claimGeneration` on `WorkClaim`, derived from the attempt ordinal. A
  different execution cannot take over within the same attempt. After owner stop and
  terminal reconciliation, coordinator retry creates a new attempt with a larger generation.
- `work-attempts.integration.test.ts` and
  `workflow-invocation-revocation.integration.test.ts` passed together: 38/38. The
  workflow invocation service unit suite passed 26/26, and the API work schema suite passed
  2/2.
- The claim-generation migration test passed 1/1. It checks backfill from an existing
  attempt ordinal and rollback. `pnpm --filter n8n typecheck`, `pnpm db:schema:docs`,
  `pnpm db:schema:check`, focused Biome, and `git diff --check` passed.
- Focused Oxlint passed for the changed API-types schema, DB migration, and CLI files. The
  separate-process stop suite skipped all three cases under its environment guard. C3-A2
  native owner proof and G1 runtime acceptance remain open.

### Native Agents queue and lane restart recheck — 2026-11-06

- Added `work-owner-process-restart.integration.test.ts`. Its prepare and recover phases run
  in separate Vitest processes and share a test-owned SQLite folder and state file.
- The first process creates one acknowledged Agents queue dispatch, then makes two more work
  items eligible in the same lane. After restart, the second process finds the same owner
  dispatch reference, retains both waiting items in the inbox, and sees only one queued run.
- The recovery process starts the production `AgentMessageQueueConsumer`, which scans the
  durable queue and claims the persisted turn. The model orchestrator is held at its call
  boundary, so the test can verify the native execution with `AgentDepartmentExecutionAdapter`
  and claim the work without calling a provider. After releasing the stub, reconciliation
  dispatches the next item and keeps the third item waiting. Both phases passed: one test passed
  and one phase-specific test was skipped in each process.
- This proves persisted queue lookup, startup scan/admission, and lane wake recovery across
  separate test processes. Real Agent/model execution, active-run stop after restart, and full
  G1/C3-A2 runtime acceptance remain open.
- CLI typecheck and Biome passed for the new integration test. Workflow invocation gates remain
  false and `.specify/feature.json` remains on Spec 004.

### Native Agent lane wake coalescing after restart — 2026-11-06

- Extended the separate-process owner recovery test to inspect the persisted wake lane while
  the recovered owner run is draining and after it ends.
- During the recovered run, the lane kept the first attempt active while its generation was
  ahead of its acknowledged generation. After that run ended, the lane acknowledged the
  retained wake and pointed to the next attempt. The queue held that attempt's single message.
- Re-ran `prepare` and `recover` in separate test processes against a fresh test-owned SQLite
  folder. Each phase passed one case and skipped its other phase-specific case. Biome passed.
- This verifies same-lane wake coalescing and serial drain across process restart for one main
  and one SQLite database. It does not verify competing mains, real model execution, or the
  full G1/C3-A2 acceptance matrix. Keep both invocation gates false and `.specify/feature.json`
  on Spec 004.

### Competing owner queue claims in separate processes — 2026-11-06

- Added race phases to `work-owner-process-restart.integration.test.ts`. Two separate Vitest
  processes open the same test-owned SQLite database, wait at a file barrier, and call the
  production `AgentMessageQueueService.claimNext()` for the same persisted owner dispatch.
- One process received execution `yAsCHc2ebHovxJTp`; the other received `null`. A third
  process verified that the queue row for the dispatch links to that single execution and
  remains on the expected owner thread. The prepare phase, both claim processes, and verify
  phase passed.
- The first harness attempt hit Vitest's default 10-second test timeout while the second
  process initialized the database. The race test now has a 45-second timeout. The passing
  rerun used a fresh folder at `/tmp/nexora-g1-multi-main-claim-retry-20261106`.
- This verifies competing queue claims across two processes with SQLite. It does not verify
  PostgreSQL multi-main behavior, competing lane admission, duplicate dispatch acceptance,
  access-loss recovery, or the full G1/C3-A2 matrix. Keep both invocation gates false and
  `.specify/feature.json` on Spec 004.

### Concurrent owner queue claims on PostgreSQL — 2026-11-06

- Added a PostgreSQL integration phase that creates a test-owned owner dispatch and calls the
  production `AgentMessageQueueService.claimNext()` twice concurrently through the PostgreSQL
  connection pool.
- Exactly one call returned an execution. The other returned `null`. The persisted queue row
  pointed to the single winning execution. The prepare and PostgreSQL race cases passed; three
  unrelated phases were skipped by the phase selector.
- Ran the phase against a dedicated PostgreSQL 16 container and database. The container was
  stopped after the test. Biome and `git diff --check` passed.
- This verifies PostgreSQL row-lock behavior for concurrent database transactions in one
  application process. Later separate-process tests also cover PostgreSQL queue claims.
  G1 remains partial; keep both invocation gates false and `.specify/feature.json` on Spec 004.

### Controlled owner stop across two process restarts — 2026-11-06

- Added `work-owner-stop-process-restart.integration.test.ts`. Three separate Vitest processes
  share a dedicated SQLite folder. The first reserves an Agents execution and exits with its
  native execution row still `running`. The second claims the work and requests cancellation;
  the owner records a correlated stop receipt and reports `stopping`. The third reads that
  pending receipt after restart, finalizes the owner execution as cancelled, and runs both
  Agents stop reconciliation and Department attempt reconciliation.
- All three phases passed. The final phase confirms the receipt, owner snapshot outcome,
  terminal attempt, and cancelled work state. The stop receipt and active execution therefore
  survive the two process boundaries in the harness.
- This test uses production persistence, adapter, stop, and reconciliation services. It creates
  the terminal cancellation record through `AgentExecutionService.finalizeExecution`; it does
  not run a model, a live execution loop, or prove that a native runtime reacts to a stop signal.
  C3-A2 native stop and G2 live stop acceptance remain open.
- Focused Biome, CLI typecheck, and `git diff --check` passed. Oxlint could not load
  `@stylistic/eslint-plugin` from the checkout.
- Runtime availability check on 2026-11-06 found Ollama on port 1337 with `qwen2.5:3b`.
  No AI Department instance ports (5687, 5791, 8292, or 5789) were listening, and
  `N8N_API_KEY` was not set. Port 5678 belongs to the separate older instance and was not
  used. No live model or HTTP acceptance ran.

### Isolated native Agent restart and cancel recovery — 2026-11-06

- Started a fresh n8n instance with `N8N_USER_FOLDER=/tmp/nexora-native-owner-test`.
  The instance used a dedicated SQLite database. The working database on port 5791 was not
  opened. The n8n Chat Agent used local Ollama `qwen2.5:3b`.
- A live Department run reached the model and produced Agent output. A separate live run
  was cancelled through the Department API while the model was active; its execution ended
  as `cancelled`, and its correlated stop receipt was confirmed. This verifies same-process
  model execution and cancellation. It does not test cancellation across process restart.
- In a third run, the model produced output while execution `TuAy3LaLUnc6bPfP` was active.
  The backend process was then killed. SQLite retained the owner execution as `running` and
  the Department attempt as `active`. After the same isolated backend restarted, a cancel
  request persisted a pending receipt and moved the attempt to `stopping`.
- The production interrupted-execution sweeper later changed the abandoned owner execution
  to `interrupted`. Production stop and Department reconciliation then confirmed the
  correlated receipts, ended attempt `fbc85cc3-29d2-490d-ba37-8dedd0c05cff` as
  `terminal/cancelled`, and set work `c73f04fd-8278-46fb-a354-26bfce44c578` to
  `cancelled`. SQLite records two confirmed receipts for this thread; the second is the
  reconciler's stable command. The process restart and terminal recovery were directly
  observed in the isolated database.
- This does not prove a stop signal ended the old live model loop. The process was already
  gone when cancellation was requested after restart; the sweeper marked its execution
  `interrupted`. G2 live stop acceptance and the broader C3-A2 matrix remain open.
- G1 remains partial. The separate-process queue/lane test uses a model stub after queue
  admission. The live model run did not test queue recovery or duplicate admission across
  process restart. Invocation gates remain false and `.specify/feature.json` remains on
  Spec 004.

### Late owner action after stop recovery — 2026-11-06

- Extended the three-process stop-recovery integration. After the third process reconciles
  the persisted receipt and terminalizes the attempt, it retries `department_work` progress
  with the old execution ID.
- Prepare, request-stop, and recover phases each passed in separate Vitest processes against
  one test-owned SQLite folder. The late action was rejected because the native execution
  was no longer running. Each phase reported one passing case and two cases skipped by the
  phase selector.
- Biome and `git diff --check` passed for the changed integration test. This proves stale
  action rejection after terminal recovery in the controlled process-restart harness. It
  does not prove that a live model receives a stop signal across restart.

### Native model queue and lane recovery after process restart — 2026-11-06

- Started an isolated backend on the prior test-owned SQLite folder and sent one long-running
  Department item to the published n8n Chat Agent backed by Ollama `qwen2.5:3b`. While its
  Agent execution was `running`, two more items became ready for the same Department member
  and binding lane. SQLite showed one active attempt and two eligible waiting items.
- Killed only the isolated backend process. Before restart, SQLite still showed the owner
  execution as `running`, its queue row linked to that execution, and the Department attempt
  as `active`. The two waiting items had no attempt.
- Restarted the backend against the same test folder. The production interrupted-execution
  sweeper marked the old execution `HmJ995TeVQ9QKiuc` as `interrupted`. Department
  reconciliation made the old attempt terminal/failed and blocked its work. The durable
  lane then dispatched the first waiting item. Its production Agents queue run
  `CH8oOHsjqREwETcN` completed with `model=openai/qwen2.5:3b` and `status=success`. After
  that run settled, reconciliation dispatched the second waiting item; run
  `nKdgkiSDHkklatoo` also completed with that model and `status=success`.
- Final SQLite state showed three sequential attempts, no remaining queue rows for these
  attempts, and a lane with `generation=6`, `acknowledgedGeneration=6`, and no active
  attempt. At no observed point did the lane have two active attempts. Both model runs
  ended without an explicit Department business-result submission, so their work entered
  `blocked` under the current contract. This test does not claim accepted business results.
- This is live G1 evidence for one main instance, SQLite, production queue consumer,
  production Department reconciliation, and a real model. Later sections add separate-process
  PostgreSQL queue, lane, and duplicate-dispatch races. Binding loss during pending dispatch,
  accepted business results, and the full G1/C3-A2 matrices remain open.
  G2 live stop remains open because the model loop was already gone before the later cancel
  request in the separate stop-recovery run.

### G1 and C3-A2 focused verification rerun — 2026-11-06

- Re-ran the queue/lane process-restart integration in a fresh test-owned SQLite folder.
  The `prepare` process passed 1 case and skipped 1 phase-specific case. The separate
  `recover` process also passed 1 case and skipped 1 phase-specific case.
- Re-ran `work-attempts.integration.test.ts` with the C3-A2 retry/claim case selected.
  The case passed; 35 unrelated cases were skipped by the test-name filter.
- Biome and `git diff --check` passed for the changed integration test and evidence files.
- A separate experiment with two consumer instances in one process timed out before the
  model stub ran. That test change was reverted and provides no multi-main evidence. Later
  sections record the supported separate-process PostgreSQL race tests.

### C3-A2 expired-claim takeover check — 2026-11-06

- Added a controlled integration case that claims work, expires the lease, and then tries a
  competing claim while the first owner snapshot remains active.
- The competing claim was rejected. The persisted claim kept the first execution ID and
  generation `1`. The test then reconciled a terminal owner snapshot.
- The focused test passed: 1 case passed and 36 unrelated cases were skipped by the name
  filter. Biome and `git diff --check` passed for the changed test.
- This closes the controlled lease-expiry takeover case. It does not prove competing native
  Agents across processes or the full C3-A2 stop/restart matrix.

### C3-A2 release, terminal recovery, and retry across process restarts — 2026-11-06

- Added a release path to `work-owner-stop-process-restart.integration.test.ts`. Three Vitest
  processes share one test-owned SQLite database. The first persists a running owner
  execution. After restart, the second process releases the work claim and stores a pending
  owner stop receipt. The third process finalizes the old owner execution, confirms the stop
  receipt and release intent, and reconciles the old attempt to terminal.
- The third process retries the now-blocked work. The new attempt has ordinal `2` and its
  Agent claim has generation `2`. A progress action using the old attempt and execution is
  rejected. SQLite ended with the release confirmed, both attempts terminal, and the new
  attempt as current.
- All three phases passed: one case passed and two phase-specific cases were skipped in each
  process. Biome passed for the test. This controlled case uses production owner, release,
  persistence, and reconciliation services; it finalizes the execution through the test
  harness and does not prove that a live model loop responds to a stop signal.
- Re-ran the existing cancel path in three separate processes against a second test-owned
  SQLite folder. Active, request-stop, and recover-stop each passed one case with two
  phase-specific skips. The prior cancellation recovery path remains green.
- This closes the controlled C3-A2 confirmed-stop/new-attempt/stale-token path across restart.
  Native live stop, suspended/unknown lease expiry, and the full C3-A2 matrix remain open.

### Competing department lane admissions across processes — 2026-11-06

- Added `lane-race-prepare`, `lane-race-start`, and `lane-race-verify` phases to
  `work-owner-process-restart.integration.test.ts`. Two Vitest processes wait at a file
  barrier, then call production `WorkService.startWork()` for two ready items assigned to
  the same member and binding.
- Both processes used one test-owned SQLite folder. One start was acknowledged. The other
  was rejected by `WorkRepository.claimWakeLaneForAttempt()` because the lane already had
  an active attempt. The verifier confirmed that the winning attempt owns the lane and one
  queue thread, while the losing item remains ready without a current attempt. All three
  phases passed; each process ran one case and skipped seven phase-specific cases.
- An initial run used separate default test folders by mistake and both workers reported a
  foreign-key error. The corrected run set `N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER` to a
  shared test-owned folder. No product change followed from the initial harness error.
- This verifies competing lane admission across two processes on SQLite. Later PostgreSQL
  process tests verify lane admission and duplicate dispatch as well. Binding loss during
  pending dispatch, live model execution in the race path, and full G1/C3-A2 acceptance
  remain open. Both invocation gates stay false and `.specify/feature.json` remains on Spec 004.

## Contract/source gates before affected tasks

| Gate | Required resolution | Owner / affected slice | State |
|---|---|---|---|
| G1 | Department owns durable lane generations, coalescing and one-run admission; Agents owns idempotent per-dispatch queue acceptance, lookup and queue-scan recovery. Verify no lost eligibility or duplicate active run. | Agents + department; C2/C3 | DESIGN CLOSED; runtime acceptance OPEN |
| G2 | Implement the approved scoped stop proof and durable snapshot sequence across resume/restart; prove revocation stop authority. | Agents; C3/C2 handoff | PARTIAL: controlled revoked-user stop/snapshot tests and the same-process live Ollama cancel test pass. A separate run proves pending receipt recovery after restart, when the old owner process is gone and its execution becomes interrupted. The model request is not required to survive restart. Durable sequence acceptance remains open. |
| G3 | Verify authenticated independent Agent review assignment/context and initiator scope mapping; otherwise gate Agent-review policy off | Agents + department; C4 Agent-review slice | OPEN |
| G4 | Verify supported published trigger/input contract, exact-version acceptance and invocation-key lookup; constrain inherited workflow tools | Agents/workflow owner; C5 | OPEN |
| G5 | Verify native stop/revocation propagation to waiting/retrying workflow children | Workflow execution owner; C5 | OPEN |
| G6 | Verify current-access check on push send, session-owned pushRef and consistent atomic revision/snapshot | Push + persistence owners; C6 live slice | OPEN |
| G7 | Reconcile migration registration/schema docs and actual source DTO/entity fields for accepted deltas | Persistence; affected schema slice | PARTIAL: C1 schema slice verified; other deltas open |

A proposed interface is not a verified existing owner API. G1's ownership split is
resolved from current source; its runtime acceptance remains open. G2's owner operation
design is explicit in `execution.md`, and controlled owner tests cover revoked-user stop,
receipt replay, and snapshot ordering. User-reported live evidence for run 2 shows a pending
receipt survived restart. The Agents sweeper later marked the abandoned execution
`interrupted`, and reconciliation confirmed the receipt. This proves receipt persistence
and recovery observation, not that the stop request ended a live run. Run 1 restart is not
independently verified. The browser UI label was not checked. Historical sequence values
5 and 13 are not retained in the database. Current persisted thread counters are 68 and 70;
the corresponding department attempt `lastOwnerSequence` values are 54 and 56. These
fields differ because the department records only the sequence it last processed.
G2 live stop and sequence acceptance remain open. G1 and the remaining C3 acceptance
matrix remain open. Unrelated C1 planning or C6A controlled demonstrations need not wait
for optional 005 or unselected Agent review.

### C3-A2 authority revocation and stop recovery across process restarts — 2026-11-06

- Added `revoked-active`, `revoked-request-stop`, and `revoked-recover-stop` phases to
  `work-owner-stop-process-restart.integration.test.ts`. All three processes use one
  test-owned SQLite folder. The first starts and claims an Agents queue execution. The
  second removes the actor's project access, verifies that a progress action is rejected,
  and requests stop with the `authority-revoked` control-plane reason. The adapter stores
  a pending stop receipt and reports the execution as stopping.
- After another process restart, the third phase reads the pending receipt, finalizes the
  controlled owner execution as cancelled, runs stop and work reconciliation, and verifies
  a confirmed receipt, terminal attempt, blocked work, and rejection of a late progress
  action. Each phase passed one case and skipped two phase-specific cases.
- An initial fixture linked the actor directly as project admin, so changing the global
  role did not revoke project access. The corrected fixture creates the project without
  that direct relation; no production code change was needed.
- This verifies C3-A2 authority-revocation fencing and receipt recovery across separate
  processes. The test finalizes the owner through `AgentExecutionService`; it does not run
  a model loop or prove that a live runtime reacts to the stop signal. Native live stop and
  full C3-A2 acceptance remain open. G1 PostgreSQL multi-main and live-provider acceptance
  also remain open. Both invocation gates stay false and `.specify/feature.json` stays on
  Spec 004.

### Duplicate native dispatch calls across processes — 2026-11-06

- Added `dispatch-race` and `dispatch-race-verify` phases to
  `work-owner-process-restart.integration.test.ts`. The prepare process creates and
  acknowledges one native Agent dispatch, then exits. Two later processes use the same
  test-owned SQLite folder and call `AgentDepartmentExecutionAdapter.dispatch()` with the
  same persisted attempt and dispatch key at a file barrier.
- Both callers returned `accepted` with owner reference
  `b458d5b8-dea5-57bf-bb3f-d0ddcffdc6ba`. The third process verified that the durable
  queue resolves that reference to the original attempt and contains one thread. Prepare,
  both dispatch workers, and verify passed; each ran one case and skipped nine
  phase-specific cases.
- This verifies duplicate native dispatch recovery across processes on SQLite. It does not
  verify provider execution, binding access loss during a pending dispatch, or the full
  G1/C3-A2 matrix. PostgreSQL duplicate dispatch is covered below. Keep both workflow
  invocation gates false and `.specify/feature.json` on Spec 004.

### G1 PostgreSQL process races and C3-A2 revocation recovery — 2026-11-06

- Added an opt-in shared-PostgreSQL mode to the two process-restart integration harnesses.
  A dedicated PostgreSQL 16 container and database were used. Independent Vitest processes
  each initialized their own application container and database connection against that
  database. No existing Postgres or application container was used. The dedicated container
  was stopped and removed after verification.
- Queue claim race: prepare, two separate `race-claim` processes, and a third verifier
  passed. One process received execution `Lbs8LZhNLdGxcTGF`; the other received `null`.
  The verifier confirmed that the persisted queue row links the dispatch to the winning
  execution and owner thread.
- Lane admission race: one process was acknowledged with attempt
  `3f22fea2-fd03-48e4-bd7d-f5ce94a6e901`; the competing process received
  `Another work item is already running in this lane.` The verifier confirmed one active
  lane attempt, the winning dispatch row, and a ready losing work item with no attempt.
- Duplicate dispatch race: both processes returned `accepted` with reference
  `c1f29494-f148-5bcc-a165-3813b2d69f20`. A separate verifier confirmed that the queue row
  maps to the original attempt. Prepare, both dispatch processes, and verify passed.
- Restart recovery: separate `race-prepare` and `recover` processes passed. The second
  process found the persisted dispatch, started the production queue consumer, admitted the
  owner run, retained lane wakes during the run, then dispatched the next eligible item
  after the controlled model stub ended. The model provider was stubbed.
- PostgreSQL exposed two missing timestamp values. `WorkCoordinationService.executeAction()`
  now sets `WorkClaim.createdAt` when it creates a claim and preserves it on updates.
  `AgentDepartmentStopReceiptRepository.record()` now supplies `createdAt` and `updatedAt`
  to its direct insert. Before these fixes, PostgreSQL rejected the claim and receipt rows
  because those columns are `NOT NULL`.
- C3-A2 revocation phases all passed on PostgreSQL, one case per process. After restart, the
  verifier confirmed a pending `authority-revoked` receipt, then reconciled it after the
  controlled owner execution became terminal. The final work state was blocked and a late
  progress action was rejected. The test harness finalizes the execution; it does not prove
  a live model loop responds to stop.
- SQLite regression checks passed: `work-owner.integration.test.ts` and
  `work-attempts.integration.test.ts`, 38/38 total. The three SQLite revoked-stop phases also
  passed one case each after the timestamp fixes. Biome passed for all changed source and
  test files; `git diff --check` passed. Provider-backed business results, live stop response,
  and full G1/C3-A2 acceptance remain open. Keep both invocation gates false and
  `.specify/feature.json` on Spec 004.

### G1 binding change during an accepted but unacknowledged dispatch — 2026-11-06

- Added `binding-loss-prepare` and `binding-loss-recover` phases to
  `work-owner-process-restart.integration.test.ts`. Two separate Vitest processes use one
  test-owned SQLite database or one shared PostgreSQL database.
- The prepare process uses the production Agents adapter to enqueue the dispatch, then makes
  the adapter return `unknown` to simulate a lost response. It changes the member binding
  before the process exits.
- The recovery process uses production lookup, snapshot, reconciliation, and queue recovery.
  It recovers the original attempt under its recorded binding revision and does not dispatch
  that attempt again. Pending work under the new binding uses its own lane revision. The test
  confirms active attempts in both revision-specific lanes, as required by the coordination
  contract.
- Both phases passed one case each, with ten phase-specific skips. Biome passed for the test.
  The SQLite phases passed first. The PostgreSQL phases then passed against a dedicated
  PostgreSQL 16 container on port 55432; the container was stopped and removed. This verifies
  durable binding-revision recovery with the queue owner in both databases. It does not run
  model generation or prove a provider-backed business result. Native live stop response,
  binding removal/access-loss recovery, and full G1/C3-A2 acceptance remain open. Both
  workflow gates remain false and `.specify/feature.json` stays on Spec 004.

### Same-process live Agent stop and separate restart recovery — 2026-11-06

- Added the opt-in integration test `work-live-stop.integration.test.ts`. It uses the existing
  test-owned SQLite database at `/tmp/nexora-native-owner-test/.n8n/database.sqlite` and local
  Ollama `qwen2.5:3b`. It does not use the 5791/5792 working instance or create a second test
  database.
- The test starts real model generation, confirms the HTTP response body is still open, then
  calls the production Department cancel service. It confirms that the Ollama request signal
  aborts, the owner snapshot is terminal/cancelled, the stop receipt is confirmed, the attempt
  and work are cancelled, and the lane has no active attempt. The focused test passed 1/1.
- This live-stop scenario runs in one process. The separate restart scenario above proves
  receipt persistence and terminal recovery after restart. No model request must survive a
  backend restart for either scenario to pass.
- This evidence closes the same-process live-stop check only. It does not close durable
  sequence acceptance or the full G1/C3-A2 matrix. Both workflow gates remain false and
  `.specify/feature.json` remains on Spec 004.
- Reran the live-stop test on 2026-11-06 against the same test-owned database and Ollama
  endpoint. It passed 1/1. The focused attempt and owner regression suites passed 43/43.
  The isolated backend on port 5789 was not available, so real Agent pickup acceptance
  remains open under T020.
- A later restart-phase rerun is not valid acceptance evidence. The backend on port 5791
  had the same SQLite test file open and could consume the queued Agent turn during the
  test. `prepare` passed; `recover` failed after the queue row was no longer present. I
  stopped that test attempt and reverted the test-setup change. This run is discarded.

### Real Agent work pickup with explicit result — 2026-11-06

- Added the opt-in integration test `work-live-agent-pickup.integration.test.ts`. It uses
  the existing test-owned SQLite database at
  `/tmp/nexora-native-owner-test/.n8n/database.sqlite` and local Ollama `qwen2.5:3b`.
  Port 5791 was stopped before the test. The test did not use the working database or create
  another test database.
- The first provider run reached `inspect` and `claim`, but the model then sent an invalid
  nested tool input and remained active. That run failed and is not acceptance evidence.
  The test now gives the model the exact action fields and requires one tool call per turn;
  on timeout, it requests stop and reconciles the run before failing.
- The corrected run passed 1/1 in 167 seconds. A real published Agent claimed the work,
  reported progress, and submitted an explicit result. The owner execution reached
  `success`; the work reached `review`, not `done`; the submitted result reference was
  persisted; and activity records identify the bound member as the Agent actor for claim,
  progress, and submit.
- This closes real Agent pickup and result submission for one SQLite-backed local Ollama
  run. It does not cover duplicate wakes, competing or stale claims, execution success
  without a work result, failure recovery, cancellation/access loss, reviewer policy
  variants, different bindings, browser use, roadmap-scale timing, or full T020/T021.
  The separate owner `prepare` and `recover` phases were also rerun with 5791 stopped and
  passed one case each; this is the valid restart evidence. Keep the workflow invocation
  gates false and `.specify/feature.json` on Spec 004.
- After the live Agent test, the live-stop test and `work-attempts.integration.test.ts`
  passed together: 43/43. `pnpm --filter n8n typecheck`, focused Biome, and
  `git diff --check` also passed.
- The controlled Agents owner contract integration passed 1/1 after the live run. It
  verifies current access loss rejects later work updates and that stop receipt
  reconciliation blocks the work after confirmed owner termination. This is controlled
  owner evidence, not a provider-backed access-loss run.

### Planning scale recheck — 2026-11-06

- `work-scale.integration.test.ts` passed 1/1 on the same test-owned SQLite database.
  It created 10 departments, 100 members, and 1,000 work items, then ran 30 paged and
  department-filtered reads. Measured p50 was 0.50 ms and p95 was 0.73 ms. The test also
  verified the assignee filter returned 10 rows.
- This fixture measures local SQLite planning reads only. It does not measure 20 concurrent
  attempts, provider throughput, PostgreSQL, browser interaction, or the organization setup
  time. Browser acceptance remains open while the 5791 backend is stopped; do not use the
  separate 5678 instance as a substitute. Keep T021 and all release gates open.

### Manual browser read verification — 2026-11-06

- The user opened the existing `/tmp/nexora-ai-dept-g2` database through the approved
  frontend address `http://localhost:8292` and selected project `6JLPWOBk1nOq11eK`.
- The `G2 native verification` Overview showed 1 member, 0 active work, 4 items needing
  attention, and 0 completed items. Its work queue showed 6 items: 4 blocked and 2 cancelled.
  The dashboard count is correct: attention includes `review` and `blocked`, while cancelled
  items remain in the queue but do not count as attention.
- The same department's Goals view showed no goals. The database confirms its single goal,
  `tạo bài viết marketing`, belongs to the separate `marketing` department. After selecting
  `marketing`, the Goals view showed that goal as active and its two linked work items as
  cancelled and blocked. The screenshots confirm these read views and their state labels.
- This is manual screenshot evidence for reading seeded departments, work, and goals. It does
  not verify create/update actions, reload persistence, the full quickstart, browser keyboard
  acceptance, or roadmap-scale criteria. T021 remains open; do not close release gates based
  on these screenshots.

### Live Agent pickup and terminal reconciliation recheck — 2026-11-06

- Re-ran `work-live-agent-pickup.integration.test.ts` against the same test-owned SQLite
  database and Ollama `qwen2.5:3b`. The final run passed 1/1 in 17 seconds after transform.
- Earlier retries exposed two fixture/input issues. Ollama sent `expectedVersion: null` for
  `inspect`, then omitted the numeric version on later mutations. The schema now accepts null
  for this optional field and normalizes it to an absent value. Service checks still reject a
  missing or stale version on every mutating action. The fixture gives the Agent the exact
  version sequence generated by setup and reconciles the terminal owner snapshot after submit.
- The passing run confirms `inspect`, `claim`, `progress`, and `submit`; the owner execution
  reached `success`; the attempt reconciled to `terminal/succeeded`; the work entered `review`;
  and a submitted result reference was persisted. This confirms execution success does not
  complete business work.
- The earlier failed retries are not acceptance evidence. Their attempts were reconciled
  through the production work service to terminal `succeeded` with work `blocked`; no active
  test attempt remains. The passing run covers only one provider-backed action sequence. The
  remaining duplicate-wake, claim contention/staleness, failure recovery, stop/access-loss,
  reviewer-policy, browser-mutation, and roadmap-scale acceptance remains open. T013/T020/T021
  stay open; workflow invocation gates remain false and `.specify/feature.json` stays on Spec 004.
- Verification after the code change: `@n8n/api-types` build passed; `department-work.tool.test.ts`
  passed 4/4; `n8n` typecheck passed; focused Biome and `git diff --check` passed.

### Live Ollama cancellation recheck — 2026-11-06

- Re-ran `work-live-stop.integration.test.ts` against the same test-owned SQLite database and
  Ollama `qwen2.5:3b`. It passed 1/1. The test stopped the live provider request before its
  response body ended, confirmed the owner stop receipt, reconciled the attempt to
  `terminal/cancelled`, set work to `cancelled`, and released the lane.
- This confirms the same-process cancellation path only. Restart stop, provider-backed access
  revocation, duplicate wakes, competing/stale claims, failure recovery, reviewer policies,
  and the remaining T020 matrix stay open. T013/T020/T021 remain open; keep workflow gates false
  and `.specify/feature.json` on Spec 004.

### Spec 009 G1 owner gate — 2026-11-06

- Current owner revision evidence includes separate-process SQLite and PostgreSQL queue claim,
  lane admission, duplicate dispatch, wake recovery, and binding-revision recovery. Controlled
  access-loss and binding-removal stop receipt recovery also pass across process restarts.
- A live Ollama run proves same-process stop. A separate restart run proves receipt recovery
  after the old execution is marked interrupted. Neither run proves Agent consultation or
  requester continuation.
- Provider-backed business-result delivery, different-user/member/binding lane coverage, and
  full G1 acceptance remain open. Keep Agent answers and automatic requester continuation
  disabled until those owner and G1 gates pass on the current revision.

### Live Agent pickup recheck — 2026-11-07

- The integration harness overrides `N8N_USER_FOLDER` and created a fresh temporary SQLite
  database under its test directory. The run used local Ollama `qwen2.5:3b`; it did not use
  `/tmp/nexora-native-owner-test` or the owner's working database.
- Two runs failed because the live test prompt used the old free-form `body` field for
  `submit`. The current contract requires a structured `report`. In both traces, inspect,
  claim, and progress succeeded; submit was rejected by input validation; the Agent execution
  then ended successfully while Work remained running.
- Updated the fixture to send `report` with result, completed work, checked evidence, open
  issues, and next steps. The corrected live test passed 1/1 in 16 seconds. A published Agent
  inspected, claimed, reported progress, and submitted a result. The owner execution reached
  `success`, the attempt reached `terminal/succeeded`, and Work entered `review`.
- This proves one provider-backed pickup and structured result path on SQLite. It does not
  prove consultation answers, requester continuation, duplicate-wake recovery, multiple
  bindings or users, or the full G1 matrix. Keep those gates open.

### Parent Agent child-report inspection — 2026-11-07

- Source review found that authorized Work detail included accepted child reports, but the
  `department_work` inspect result returned only the parent Work DTO. A resumed parent Agent
  therefore could not read its staff report through its owner tool.
- Updated inspect to include child states and the latest accepted structured report for each
  completed child. Reports remain null until the child reaches `done` after business review.
- The focused SQLite `work-attempts.integration.test.ts` suite passed 56/56. The new case
  delegates a child, confirms the owner stop, completes and accepts the child report, starts
  the parent again, and checks that parent Agent inspect exposes the accepted report.
  Biome passed on both changed TypeScript files; `git diff --check` passed.
- This is controlled integration coverage, not a live multi-level Agents owner campaign. It
  does not prove parent wake delivery through the owner, restart recovery, or duplicate-wake
  behavior. A separate controlled-owner test now proves an unknown stop and snapshot keep the
  parent blocked without a pending eligibility. Keep T046 and T049 open until live owner wake,
  restart recovery, and duplicate-wake behavior pass on a dedicated test database.

### Live Department tool turn and input validation — 2026-11-07

- A live three-level Ollama attempt exposed two owner-tool issues. A claim-less `inspect`
  result made the tool's end-turn predicate true because `undefined !== null`. Provider output
  also included `recipientMemberId: null` on `claim`, which the action schema rejected.
- The tool now ends the turn only after a claim is released, a help request is created, or a
  child delegation succeeds. Optional action fields normalize `null` to absent values while
  unknown fields remain rejected.
- Regression tests cover claim-less inspect, active and released claims, and null optional
  fields. `department-work.tool.test.ts` passed 6/6. The corrected live single-Agent pickup
  passed 1/1 with local Ollama `qwen2.5:3b`; the Agent claimed work, reported progress, and
  submitted a structured result.
- The live campaign attempt remains unaccepted. The 3B model did not follow the nested manager
  delegation script and emitted an incorrect version and an unrelated `delegate_subagent` call.
  No campaign child was created. Do not count this as multi-level owner acceptance. Controlled
  unknown-outcome blocking passes; live owner wake, restart recovery, and duplicate-wake proof
  remain open under T046/T049.

### Current-owner live pickup and stop — 2026-11-07

- Re-ran `work-live-agent-pickup.integration.test.ts` with
  `N8N_TEST_LIVE_DEPARTMENT_PICKUP=1`, the test folder `/tmp/nexora-native-owner-test`, and
  local Ollama `qwen2.5:3b`. The published Agent claimed one Work item, reported progress, and
  submitted a structured result. The focused live test passed 1/1.
- Re-ran `work-live-stop.integration.test.ts` with `N8N_TEST_LIVE_DEPARTMENT_STOP=1` and the
  same isolated test folder and model. The live model request stopped before its response body
  ended. The owner snapshot confirmed terminal cancellation. The focused live test passed 1/1.
- These tests prove live pickup, result submission, and same-process stop for those paths.
  They do not prove a live help consultation answer, a help answer followed by one coalesced
  requester wake across restart, or the complete project/member/binding access-loss matrix.
  G1 remains open. Keep Agent answers and requester continuation disabled.

### Live help consultation answer — 2026-11-07

- Added `work-live-consultation.integration.test.ts`, an opt-in test that uses the Vitest
  test-owned SQLite folder and local Ollama `qwen2.5:3b`. The test setup creates its own
  temporary user folder. It does not use the 5791 working database.
- The first runs exposed a runtime wiring defect: isolated consultation runtimes still
  received `get_environment` and other Agent tools. The consultation owner correctly rejected
  those runtimes under the no-tools policy. Runtime reconstruction now returns before adding
  tools for both consultation and meeting profiles. A regression test verifies both profiles
  have an empty injected-tool list.
- The corrected live test passed 1/1. The published specialist Agent produced a bounded
  answer. The Work response records the specialist member, owner invocation reference, and
  sequence. The answer is stored before the controlled requester executor accepts one wake;
  the original assignee stays unchanged and a second attempt is reserved.
- This proves one live no-tools Agent answer and one accepted wake. The requester executor is
  controlled, not a real model turn. The test does not prove requester model continuation,
  coalescing or recovery across restart, or the full project/member/binding access-loss matrix.
  T042/G1 remains open. Keep Agent answers and requester continuation disabled until the full
  acceptance matrix passes.

### Resumed requester answer context — 2026-11-07

- The SQLite Work integration test now continues through the resumed attempt's `inspect`
  action and verifies that it receives the persisted question and answer, responder kind,
  and answer time. The projection filters out answers addressed to another member.
- The focused Work attempts suite passed 62/62. Typecheck, API-types build, Biome, and
  `git diff --check` passed.
- This verifies stored answer delivery through the Work tool for the resumed member. It is
  not live requester-model acceptance and does not prove coalescing and recovery together
  across restart or the full access-loss matrix. T042/G1 remains open; production Agent
  answers and requester continuation stay disabled.

### Live requester continuation after Agent help — 2026-11-07

- The opt-in `work-live-consultation.integration.test.ts` ran with a test-owned SQLite
  folder and Ollama `qwen2.5:3b`. The responder Agent returned the bounded token
  `CAFE-ANSWER-42`. The Work service stored the answer before it queued one continuation
  for the original assignee.
- The live requester execution inspected its assigned Work. The recorded `inspect` output
  included the stored answer. The requester then claimed the same Work and submitted a
  structured report whose result was the exact token. Work entered `review`, and the
  assignee remained unchanged. The focused live test passed 1/1.
- This proves one live answer-to-requester continuation on a single process and SQLite. It
  does not prove one coalesced wake across process restart or the full project, member, and
  binding access-loss matrix. T042/G1 remains open; production Agent answers and requester
  continuation stay disabled.

### C5 publication refresh guard — 2026-11-07

- Added regression coverage for a disabled workflow capability whose published workflow
  version and input fingerprint have changed. Update rejects the stale capability before
  writing unless the coordinator requests an explicit refresh. The focused capability
  service suite passed 9/9.
- The workflow invocation service suite passed 34/34, including exact-version acceptance
  and revoked authority. The revocation integration suite passed 2/2. The workflow process
  restart integration file was skipped by its phase guard, so it does not provide restart
  evidence in this run.
- C5 G4–G5 remain open: native wait/approval resume, side-effect approval, and child stop
  behavior need owner acceptance. Both workflow invocation gates remain false.

### C5 child recovery across process restart — 2026-11-07

- Ran the `prepare` and `recover` phases of
  `agent-department-workflow-process-restart.integration.test.ts` in separate Vitest
  processes. Both phases passed one test and skipped the other phase-specific test.
- The phases shared a test-owned SQLite folder and a dedicated local Redis container.
  Recovery found the same reserved child invocation, replay returned the same accepted
  child, and Redis held one Bull job. The workflow body did not execute.
- The Redis container was stopped after the run. The isolated SQLite test folder remains at
  `/tmp/nexora-009-c5-workflow-restart-20261107` for review; it is not the owner's database.
  C5 restart recovery is partial. Native approval/wait-resume, child stop on revocation, and
  side-effect approval still need owner acceptance. Keep both workflow gates false.

### C5 native child stop and resume lifecycle checks — 2026-11-07

- Re-ran `agent-department-workflow-stop.integration.test.ts`. All four tests passed. They
  verify native stop requests for waiting children in regular and queue modes, retrying child
  stop, and terminal proof without a redundant stop.
- Re-ran `agent-workflow-tool-resume.service.test.ts`. All 40 tests passed. The lifecycle
  hook records `waiting`, `succeeded`, `failed`, and `cancelled` child outcomes and resumes
  the parent Agent after a sub-workflow finishes.
- These tests do not run a real workflow through side-effect approval and resume, or revoke
  authority during that resume. C5 G4–G5 and T045 remain open. Keep both workflow gates false.
- A focused run also passed the test that keeps Department workflow tools disabled while
  owner verification is pending and the test that rejects approval-gated Agent tools in
  workflow execution. These checks cover runtime filtering and the existing owner policy;
  they do not prove approval resume for a native Department child.

### Live hierarchy Agent recheck — 2026-11-07

- Ran `work-live-agent-pickup.integration.test.ts` with the opt-in hierarchy scenario,
  test-owned folders under `/tmp/nexora-009-live-hierarchy-*`, and local Ollama
  `qwen2.5:3b`. The basic pickup case passed. The CEO campaign case failed because no child
  Work was created.
- The first CEO run sent `action: claim` with delegate fields. The action schema accepted the
  extra fields and the work service completed only the claim. Updated the schema to reject
  delegate fields unless `action: delegate`. Added a regression case. The focused schema suite
  passed 6/6; API-types build and typechecks passed.
- Re-ran the CEO case after the validation change. The Agent inspected and claimed the root
  Work, then ended successfully without delegating. This confirms the schema no longer treats
  the combined request as a delegation, but the live model still did not complete the
  hierarchy. Do not count this run as live manager-to-staff acceptance. The controlled
  three-level integration remains separate. Keep G1 and C5 gates closed.
- Re-ran the CEO case with the campaign instructions shortened and explicit recipient member
  IDs. The test waited 90 seconds and failed because no child Work appeared. Its trace shows
  successful `inspect` and `claim` calls only, followed by a successful owner turn. The local
  Ollama endpoint exposes only `qwen2.5:3b`; this run does not establish whether a stronger
  configured runtime can complete the hierarchy. Keep G1 and C5 gates closed.
- After adding dedicated claim, delegate, and submit tools with server-owned version checks,
  re-ran the CEO-to-manager-to-staff scenario on the isolated Ollama test database. The CEO
  created manager Work and the manager created staff Work. The staff Agent inspected and
  claimed its Work, then ended its owner turn without submitting a structured report. The test
  was stopped after the database showed a terminal owner run, blocked Work, and no submitted
  result. The coordinator now records this case as a failed attempt with a clear summary instead
  of reporting a successful attempt. Focused integration tests pass for that state transition.
  Live hierarchy acceptance remains open because staff did not report. Keep G1 and C5 gates
  closed.

### Live CEO-to-staff hierarchy with structured reports — 2026-11-07

- Ran the opt-in `qwen2.5:7b` hierarchy case with a fresh test-owned SQLite folder at
  `/tmp/nexora-009-live-qwen7-final-20261107`. The user working database on port 5791 was
  not used.
- CEO delegated a child Work to the manager. The manager delegated a child Work to staff.
  Staff submitted a structured result, and the test accepted it through business review.
  The manager inspected the accepted child report, submitted its own structured result, and
  was accepted. The CEO then inspected the accepted manager report, submitted the root result,
  and the test accepted it. All three Work items reached `done`; the owner executions and
  attempts ended successfully, and parent wakes occurred after child review acceptance.
- The model first omitted the required checked-evidence field in its staff report. The tool
  returned schema validation feedback, and the model corrected the submission. This confirms
  the validation path in this run.
- Command: `N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER=/tmp/nexora-009-live-qwen7-final-20261107 N8N_TEST_LIVE_DEPARTMENT_PICKUP=1 N8N_TEST_LIVE_DEPARTMENT_HIERARCHY=1 N8N_TEST_LIVE_OLLAMA_MODEL=qwen2.5:7b pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/modules/ai-department/__tests__/work/work-live-agent-pickup.integration.test.ts -t 'wakes a manager and CEO after live staff reports pass business review' --maxWorkers=1`
- Result: 1 passed, 1 skipped by the test-name filter. This closes the live hierarchy subcase.
  It does not close G1: coalesced continuation across restart and the complete access-loss
  matrix still need evidence. Keep Agent answers and requester continuation disabled.

### Human help answer persistence without requester wake — 2026-11-07

- Ran the focused SQLite integration case `stores one authorized human answer after
  terminal stop proof without waking the requester` with a fresh test-owned folder at
  `/tmp/nexora-009-t021-human-answer-20261107`.
- Result: 1 passed, 63 skipped by the test-name filter. The case verifies answer persistence
  after terminal-stop proof and confirms that a human answer does not itself wake the
  requester while G1 remains closed. It does not close the combined T021 task because the
  production blocked-to-ready transition remains gated.

### Consultation result access and binding recheck — 2026-11-07

- Ran `agent-department-consultation-invocation-owner.service.test.ts` against the current
  source. All 9 tests passed.
- The suite withholds a completed result when the initiating user's project access is revoked
  or the recipient Agent binding changes. It also accepts a result only after current access
  and binding checks pass.
- This is controlled owner-level evidence. The live G1 access-loss cases and requester-wake
  recovery across process restart remain open.

### C5 capability, invocation, and revocation recheck — 2026-11-07

- Re-ran `workflow-capability.service.test.ts` and `workflow-invocation.service.test.ts`.
  All 36 tests passed. The suites cover closed-gate behavior, published-version pinning,
  explicit capability refresh, duplicate invocation identity, owner reconciliation, current
  authority checks, separate member and executor identities, and result-delivery fencing.
- Re-ran `workflow-invocation-revocation.integration.test.ts` with a fresh test-owned SQLite
  folder at `/tmp/nexora-009-t045-revocation-20261107`. Both tests passed.
- These checks support capability and revocation subcases. They do not prove a real workflow
  execution through approval wait/resume, publication change during that resume, or
  side-effect approval end to end. T045 and C5 G4–G5 remain open. Keep workflow invocation
  disabled.

### C5 inherited workflow tool gate recheck — 2026-11-07

- Ran the focused workflow tool and runtime reconstruction checks. All 3 selected tests
  passed. They verify that the closed owner gate prevents workflow execution, filters
  inherited workflow tools from a primary Department Agent runtime, and filters them from a
  delegated Department runtime.
- Source review confirms the work attempt stores an empty workflow allowlist while the gate is
  closed. The tool boundary also rejects Department invocation while the owner gate is closed.
- This confirms the closed-gate and inherited-tool subcases. It does not prove workflow
  approval wait/resume, side-effect approval, or execution with an enabled capability. Keep
  workflow invocation disabled until C5 acceptance passes.

### Current Agents queue and lane recovery across process restart — 2026-11-07

- Ran the `prepare` and `recover` phases of
  `work-owner-process-restart.integration.test.ts` in separate Vitest processes. Both phases
  passed against the same test-owned SQLite folder at
  `/tmp/nexora-009-g1-process-restart-20261107` and state file
  `/tmp/nexora-009-g1-process-restart-20261107.json`.
- The first process persisted one accepted owner dispatch and two eligible waiting Work items.
  After process exit, the recovery phase found the same dispatch, retained both waiting items,
  and let the production queue consumer claim the original message. During drain, one lane
  attempt remained active while a newer generation stayed pending. After that controlled run
  ended, reconciliation admitted the next item and acknowledged the retained generation.
- This proves current Agents queue lookup, startup scan, same-lane coalescing, and serial drain
  across process restart. It does not connect the persisted wake to a help answer or run a real
  model in the recovery process. G1 help-continuation acceptance remains open.

### Live help-answer continuation across process restart — 2026-11-07

- Ran the `prepare` and `recover` phases of
  `work-help-continuation-process-restart.integration.test.ts` in separate Vitest processes
  with Ollama `qwen2.5:7b`. Both phases passed against the same test-owned SQLite folder at
  `/tmp/nexora-009-g1-help-restart-finalpass-20261107` and state file
  `/tmp/nexora-009-g1-help-restart-finalpass-20261107.json`.
- The prepare process created the requester Agent and Work, stopped its first attempt, and
  persisted an answered help request. It then exited. The recovery process reopened the same
  database, reconciled the answered request twice concurrently, and ran one requester attempt.
- The live Agent read the persisted answer, claimed the same Work, and submitted the exact
  answer token. The test observed one resumed attempt, successful owner execution, terminal
  attempt outcome `succeeded`, and Work state `review`.
- This closes the live help-answer continuation across process restart subcase. It does not
  prove the full project, member, and executor-binding access-loss matrix or the remaining
  coalesced answer races. T042/G1 remains open; keep Agent answers and requester continuation
  disabled until all required cases pass.

### Live consultation continuation and access loss — 2026-11-07

- Ran the normal, responder-binding-change, initiating-user-project-access-loss, and
  concurrent-answer cases in `work-live-consultation.integration.test.ts` with Ollama
  `qwen2.5:7b`. All four passed in `/tmp/nexora-009-g1-live-matrix-final-20261107`, using a
  test-owned SQLite folder and distinct requester and responder users.
- With current access, the responder's answer was attributed and stored. The requester then
  read the answer, claimed the same Work, submitted the exact proof token, and reached business
  review.
- When the responder binding was removed while the model response was held, the owner rejected
  the result. The help request returned to `awaiting_answer`, no response was persisted, no
  requester attempt was added, and Work stayed blocked with the same assignee. When a normal
  member requester lost project access while the model response was held, the owner also
  rejected the result and preserved the same blocked Work state.
- The live answer race held both owner result reads until both reconcilers reached the same
  terminal result. It stored one help response and one `help_answered` activity, and it
  created exactly one continuation attempt for the same Work. The competing continuation
  treats a conflict as complete only when the current request is answered and a newer attempt
  or ready Work state proves that another continuation won. The focused SQLite restart
  reconciler test passed both blocker variants after this change.
- A separate disabled-responder-user probe was removed from acceptance: Agent-routed help
  stores no responder user ID. The owner authorizes the initiating user with current
  `agent:execute` scope and rechecks the responder member binding. The disabled-actor owner
  unit case passed as part of the 10/10 suite.

### Live consultation reporting-line and executor revision changes — 2026-11-07

- Ran two focused Ollama cases against separate test-owned SQLite folders with `qwen2.5:7b`.
  A reporting-line change for the responder during generation passed: it does not change the
  member's executor binding or execution permission, so the answer remained valid and the
  requester continued. Replacing the responder's executor binding revision while generation
  was held passed the rejection case: no answer persisted and Work remained blocked.
- The member reassignment probe first treated a reporting-line update as revocation. That
  expectation failed because reporting hierarchy is not an execution grant. The corrected
  case records the intended positive behavior. No production authorization change was needed.
- The full six-case matrix then passed in one run at
  `/tmp/nexora-009-g1-live-matrix-6-20261107`: normal answer and continuation; responder
  binding removal; responder reporting-line reassignment; executor revision replacement;
  initiating-user project access loss; and concurrent answer reconciliation. The first,
  third, and concurrent cases continued to the requester. The other access-loss cases stored
  no response and left Work blocked. G1's remaining acceptance criteria still need review.
  Keep the production response gate closed.

### Accepted help wake recovered by a fresh Agent owner process — 2026-11-07

- Ran `work-help-continuation-process-restart.integration.test.ts` in two separate Vitest
  processes with the shared test folder `/tmp/nexora-009-g1-help-restart-coalesced-d-20261107`
  and local Ollama `qwen2.5:7b`. The test used its own SQLite database; it did not open the
  owner database on port 5791.
- In process one, two help reconcilers processed the same persisted human answer concurrently.
  They created one requester attempt, one accepted wake lane generation, and one durable
  Agents queue message. The queue consumer was stopped before this continuation was created.
  The lane generation matched its acknowledged generation, and no duplicate attempt appeared.
- Process two started the production queue consumer, recovered that accepted message, and ran
  the live model. The requester inspected the stored answer, claimed the same Work, submitted
  the exact proof token, reached review, and finished with one successful terminal attempt.
  The recovery phase passed in 123.7 seconds; the prepare phase passed in 3.0 seconds.
- This joins concurrent answer reconciliation, durable wake acceptance before restart, queue
  recovery after restart, and one live requester continuation. It does not prove three queued
  items plus a signal arriving during a live drain, or authority separation across competing
  users, members, and binding revisions in this same live scenario. G1/T042 therefore remains
  open, as do the broader C2/C3 owner gates. Keep production Agent answers disabled.

### Live same-lane drain with a new eligibility during execution — 2026-11-07

- Ran `work-owner-process-restart.integration.test.ts` in separate `prepare` and `recover`
  Vitest processes with the shared test-owned folder
  `/tmp/nexora-009-g1-lane-live-f-20261107` and local Ollama `qwen2.5:7b`. The run did not
  use the owner database on port 5791.
- Process one accepted the first owner message, made two more Work items eligible in the same
  lane, and exited. Process two recovered the message through the production queue consumer.
  After the first model run started and claimed its Work, the test made a fourth item ready in
  that lane while the run was active.
- The live Agent completed all four items in sequence. Each owner execution reached success,
  each Work reached review, and each attempt reached terminal/succeeded. The polling check saw
  no more than one active/dispatching attempt at a time. The lane ended with no active attempt,
  generation 5, and acknowledged generation 5. Both phases passed; recovery took 229.4 seconds.
- This proves same-lane live drain, process restart recovery, and retention of an eligibility
  created during a live run on one SQLite main. It does not prove that different users,
  members, or binding revisions remain isolated during competing live owner runs, or that
  PostgreSQL owner execution drains the same workload. T042/G1 and the broader C2/C3 owner
  gates stay open. Keep the production response gate closed.
- The acceptance pass also exposed TypeScript errors in the Department work tool's claim
  result narrowing for the handoff result variant and in the live test fixtures. The handlers
  now require an inspection result with both work and claim data; the test fixtures no longer
  access a private proxy field. `pnpm --filter n8n typecheck` passed, the Department tool unit
  suite passed 13/13, Biome passed on all five changed TypeScript files, and `git diff --check`
  passed.

### PostgreSQL live consultation persistence check — 2026-11-07

- A focused live consultation run against a test-owned PostgreSQL database exposed missing
  timestamps in raw inserts for the consultation invocation and its gate. PostgreSQL
  migrations require both timestamp columns. The SQLite live path did not expose this defect.
- The repository now supplies `createdAt` and `updatedAt` for invocation reservations,
  open gates, and cancellation tombstones. Two repository tests cover these insert values;
  the focused repository suite passed 4/4, Biome passed, and ESLint reported no errors.
- The normal live consultation case passed on PostgreSQL with Ollama `qwen2.5:3b` and an
  isolated pool-size-4 diagnostic configuration. This confirms the PostgreSQL persistence
  path for one normal consultation and continuation.
- The full six-case matrix did not pass with the available local models. Runs ended with
  invalid Agent actions, missing expected answer text, or a consultation timeout. A pool-size-1
  diagnostic run also timed out waiting for a connection. These runs do not establish live
  PostgreSQL lane drain or full authority-separation acceptance. G1/T042 remains open; keep
  Agent responses and requester continuation disabled.

### PostgreSQL live owner drain attempt — 2026-11-08

- Ran the `prepare` and `recover` phases of `work-owner-process-restart.integration.test.ts`
  against a temporary PostgreSQL 18.4 database and a temporary Redis container. The run used
  `N8N_TEST_SHARED_POSTGRES_DB=1`, a dedicated test database, and a test-owned state file. It
  did not use the owner database on port 5791. The temporary containers and state files were
  removed after the runs.
- The schema bootstrap and the live `prepare` phase passed. With Ollama `qwen2.5:7b`, the
  recovery phase failed after six minutes. The first Work reached review. The next owner run
  remained active, so the remaining Work did not drain.
- A second recovery run used `qwen2.5:3b`. Three Work items reached review. The first owner
  attempt ended without a submitted result and left its Work blocked. The run was stopped after
  the test database confirmed that state.
- These runs do not pass PostgreSQL live drain acceptance. They show that the available local
  model runs did not complete the required sequence. G1/T042 remains open. Keep Agent answers
  and requester continuation disabled.

### Controlled Office text update and lifecycle acceptance — 2026-11-08

- Ran the focused `renders 100 controlled work text updates in Office` Playwright test
  through `test:local:isolated`. The test used a test-owned temporary user folder and
  database. It did not use the owner database on port 5791.
- The browser rendered the real Office 3D view and read controlled member and work
  responses. It applied 100 status changes through the 4-second polling timer. All 100
  appeared in the text status label. The recorded virtual latency was p95 4,097 ms and
  maximum 4,139 ms. This is controlled frontend polling evidence; the member and work
  reads were mocked, and the timing used Playwright's clock.
- Five repeated 2D/3D mode cycles removed the canvas in 2D and restored exactly one canvas
  in 3D. The selected member exposed the same `Open member` and `Open work` actions in both
  modes. The focused test passed 1/1.
- This run does not establish backend event delivery, frame pacing, GPU or device memory,
  or physical-device budgets. T009 remains open until device measurements pass.
