# C3: Agent Execution and Recovery

**Status:** Approved v1. G1 runtime acceptance remains open. G2 controlled stop/revocation tests and same-process live stop pass; durable sequence acceptance remains open. Restart receipt recovery is separate evidence. See evidence.md.
**Owner:** Spec 003; Spec 005 implements this boundary only when separately enabled.
**Dependency:** C1 and C2 admission/identity.

## Requirements

- C3-R1: Reserve attempt, dispatch intent, current slot, receipt and revision before
  owner dispatch. Keep one reserved/active attempt per work. A lane admits one run.
  Wake acknowledgment, owner acceptance, claim, runtime outcome and result are distinct.
- C3-R2: Use Agents-owned dispatch/lookup/stop/snapshot and inbox-admission contracts.
  Department code cannot depend on private Agent repositories. The owner durably maps
  dispatchKey to acceptance. Unknown dispatch retains its slot. Redispatch uses the same
  key only after an authoritative absence under the owner's deduplication protocol.
- C3-R3: Host context binds project, department, initiating user, member, binding revision,
  work, attempt, dispatch key and execution. Persist it through approval resume and
  reconstruction. Ordinary chats, inline Agents, workflow runs and delegated Agents
  do not receive department work mutation tools.
- C3-R4: Claim atomically checks current assignment, blockers, archive fence, binding,
  owner run, access, attempt and work version. A claim has a monotonically increasing
  generation. All mutations present the current generation.
- C3-R5: Server lease lasts five minutes. A valid mutation or explicit renew extends it.
  Expiry denies mutations. The same verified current run may explicitly reacquire its
  expired lease if no cancellation/transfer/revocation exists. Another run cannot take
  the old attempt's claim. Confirm old-run stop, end the old attempt, and reserve a new
  attempt/generation. Suspended approval and disconnected owners are not stopped.
- C3-R6: Runtime success without explicit submit blocks work for recovery. Submit records
  a safe business result separately and enters review or done. Release the business
  claim but retain the active runtime slot until owner termination. Preserve a submitted
  result if a later runtime failure arrives. C4 verdicts require confirmed terminal owner.
- C3-R7: Cancel fences new actions and calls owner stop. Acknowledgment means pending.
  Confirmed cancellation changes work to cancelled. If a result committed first, preserve
  that business transition and reconcile the race; cancellation cannot reverse done work.
- C3-R8: Access/binding revocation denies further work actions/result delivery immediately
  on the next check. A narrow owner control-plane action requests stop without restoring
  the revoked user's rights. Unknown stop retains the slot and shows operator attention.

## Model and boundary deltas

Attempt pins initiating authority, member/binding, policy revision, dispatch key and owner
reference. Store runtime outcome separately from submittedResultId. Claim adds generation
and release reason. Store owner receipts and ordered snapshots. Add durable stop intent
for cancellation, transfer and authority loss. Reuse owner state and existing retention.
Do not infer terminality from timestamps, lease expiry, missing rows, or a lost connection.

Public boundary operations: `resolve(authority, binding)`, `reserveEligible(lane, workVersion)`,
`dispatch(attemptContext)`, `lookup(dispatchKey)`, `verifyRun(attemptContext, executionId)`,
`requestStop(ownerRef, commandId, reason)`, `snapshot(ownerRef)`.
Lookup returns accepted/rejected/absent/unknown. Stop returns acknowledged/confirmed
separately. Snapshot returns phase, native state, monotonic owner sequence and safe
outcome references. A new sequence epoch must not compare as an older timestamp.
A stop-proof lookup must carry project/attempt/owner correlation, not just executionId.

G2 owner operation contract:

- `requestStop(ownerRef, commandId, reason, authorityContext)` validates the project,
  Agent, attempt, dispatch key, and owner execution reference before it records a stop
  intent. `authorityContext` is either a current user action or a scoped control-plane
  command for cancellation, transfer, or access/binding revocation. The control-plane
  authority can request stop and read stop state for that owner reference. It cannot read
  department work or act as the revoked user.
- Stop request returns `accepted`, `duplicate`, `rejected`, or `unknown`. `accepted` and
  `duplicate` mean the owner durably recorded the command. They do not mean execution
  stopped. Reusing a command ID with different content is rejected. The result also
  carries the current owner snapshot; a lost response is resolved by retrying the same
  command ID or reading that snapshot.
- `snapshot(ownerRef, authorityContext)` returns `active`, `suspended`, `stopping`,
  `terminal`, or `unknown`, plus a durable owner sequence and safe outcome reference when
  terminal. Only `terminal` confirms stop. Suspended approval, missing records, timeouts,
  and lost connections are not terminal proof.
- Every request and snapshot is correlated to project, Agent, attempt, dispatch key, and
  owner execution reference. A mismatch returns `unknown` and cannot stop or release a
  different attempt.
- Sequence order is durable across resume and process restart. Use `(epoch, counter)` or
  an equivalent persisted order. A new epoch must compare after the prior epoch. Wall
  clock timestamps are display metadata and cannot decide event order.
- Repeated stop commands are idempotent. A new retry or transfer attempt cannot reserve
  the old slot until a correlated snapshot confirms terminal state. Unknown state keeps
  the slot reserved and visible for recovery.

Controlled owner tests cover revoked-user stop authority, idempotent replay, and snapshot ordering. The opt-in live Ollama integration test starts model generation, sends a Department cancel while the provider request remains open, and confirms that the request aborts, the owner snapshot becomes terminal/cancelled, the receipt is confirmed, the attempt and work are cancelled, and the lane is released. This proves same-process live stop. A separate Ollama run verifies receipt persistence and terminal recovery across a process restart: the old process was already gone, the sweeper marked its execution `interrupted`, and reconciliation confirmed the receipt and cancelled the work. No model request must survive restart. Durable sequence acceptance, G1, and the remaining C3 acceptance cases remain open.

Agent action body exposes action, expectedVersion, claimGeneration and bounded body or
result reference. Host supplies identity and stable tool-call command ID. Inspect is
read-only. Claim, renew, release, progress, comment, block, resume and submit use C2/C3.
A repeated accepted submit can return its prior response after claim release under
current authorization; it cannot execute another effect.

## Source and spec comparison

003 FR-004–FR-006, FR-008–FR-013 and 005 FR-002–FR-005 map here. Current
`DepartmentExecutor`, native adapter, queue integration, WorkService reconciliation,
WorkCoordinationService, and department_work tool implement substantial parts.
The adapter may use owner-private repositories inside Agents; the supported department
boundary is the exported contract, whose complete recovery guarantees remain unverified.

`isRunStopped(executionId)` still checks execution status/HITL suspension and is not the
scoped stop-proof API. The owner adapter records stop receipts by command ID, verifies
owner correlation, and accepts an explicit user or department control-plane authority
context. Department cancellation, handoff, and release send their persisted command IDs.
Snapshot sequence increments durably on the owner thread, and pending receipts report
`stopping`. A main-instance reconciler retries pending receipts and marks them confirmed
only after a terminal owner snapshot. Controlled tests cover revoked-user stop, receipt
replay, and active-to-terminal snapshot ordering. Live notes recorded thread counter values
5 before shutdown, 13 after restart, and 68 at terminal confirmation, but only final values
remain in DB history. Across the two runs, persisted thread counters are 68 and 70, while
department attempt `lastOwnerSequence` values are 54 and 56. The attempt field records the
last sequence processed by the department and must not be reported as the thread counter.

In an earlier isolated instance 5687, enabling the Agent's n8n Chat channel let Department work reach
the configured OpenRouter model. The Agent claimed work and reported progress through
`department_work`. Three runs ended after the tool returned `Work item has changed`; the
latest attempt reported terminal success while work moved to `blocked`. On a later run,
the authenticated UI issued Cancel while the attempt was active. The user reports that the
pending receipt survived restart in run 2. The current process started after run 1 had
already ended, so run 1's restart is not independently verifiable. A later isolated test
instance now reproduces the process boundary directly: after a live model run produced
output, the backend was killed; a post-restart cancel persisted a pending receipt; the
production sweeper marked the abandoned execution `interrupted`; and stop reconciliation
confirmed the receipt and cancelled the attempt and work. No browser observation verified a
Cancelled UI label. This verifies persisted cancellation intent and terminal recovery after
the old model process ended. A separate same-process Ollama test now confirms that Department
cancel stops a live request. Durable sequence, G1, and the remaining C3 matrix remain open.
The D3 implementation now stores the claim generation on `WorkClaim`, derived from the
attempt ordinal. A different execution cannot take over the claim inside the same attempt,
even after the owner reports stop. Reconciliation must first make the old attempt terminal;
coordinator retry then creates a new attempt and a larger generation. Controlled SQLite
tests cover this path. A two-process SQLite test now verifies that the same accepted Agent
queue dispatch is found and claimed after restart, then that a waiting lane item is dispatched
after the active test run finishes. A separate three-process test persists a running owner
execution, writes a pending stop receipt after restart, then reconciles the receipt after a
second restart when the owner execution becomes terminal. The test finalizes the execution
through the production persistence service; it does not run a model or a live execution loop.
Controlled C3-A2 checks now cover two concurrent claims and expired-claim retention when the
owner stop proof is false. The Agents adapter maps running, suspended, and missing executions
to false; terminal owner state maps to true. After terminal reconciliation, coordinator retry
creates a new claim generation and the old claimant cannot report progress. The recover phase
also retries progress with the old execution ID; the owner rejects it because the execution
is no longer running. All three separate-process phases pass against one test-owned SQLite
folder. The real-model owner matrix remains open under C3-A7.

A separate isolated live run now covers G1 queue and lane recovery with Ollama
`qwen2.5:3b`. The backend was killed while one Department model run was active and two items
were eligible in the same lane. After restart, the production sweeper marked the old
execution `interrupted`; Department reconciliation blocked that work and dispatched the two
waiting items one at a time. Both post-restart model executions reached native `success`,
and the final lane had no active attempt or queued message. The model did not submit a
business result, so both work items became `blocked`. This verifies same-lane serial wake
drain in one isolated main/SQLite setup. Multi-main races, duplicate admission, access-loss
recovery, and the full G1 matrix remain open. The separate same-process Ollama cancel test now
proves live stop; durable sequence and the remaining C3 recovery scenarios stay open.

Current work reconciliation runs every 30 seconds. That is not evidence for C6's five-second
visible-update target. Native approval process-restart and the remaining C3 recovery scenarios
stay open; same-process live stop passes, while durable sequence acceptance remains open.

005 runner isolation, pinned provider versions and approval checks stay additional
requirements. No provider can skip this contract because it uses the same DTOs.

### C3-A2 lease-stop predicate check — 2026-11-06

- `AgentDepartmentExecutionAdapter.isRunStopped()` returns false for a running owner,
  a suspended owner, and a missing execution record. It returns true after the owner leaves
  suspension in a terminal state. The adapter suite passed 17/17.
- `work-attempts.integration.test.ts` also confirms that an expired claim stays with its
  active execution and rejects a competing claim. A concurrent two-execution claim test
  confirms that only one claimant wins. The terminal-retry case creates a larger generation
  and rejects progress from the previous claimant. The SQLite integration suite passed 38/38
  twice against the same test-owned database. These checks close controlled C3-A2 acceptance;
  the real-model owner matrix remains open under C3-A7.

### C3-A1 dispatch recovery check — 2026-11-06

- The attempt integration suite covers duplicate start replay, concurrent starts, and an
  unknown dispatch acknowledgment without a second dispatch. It passed 38/38.
- The restart `prepare` and `recover` phases passed in separate Vitest processes on the same
  test-owned SQLite folder. Recovery found the same accepted owner dispatch and drained the
  two retained lane items in order. These phases do not run a model.
- The `race-prepare`, two `race-claim` worker processes, and `race-verify` phases also passed
  on that SQLite folder. One worker claimed the dispatch; the other received no claim. The
  verification process found one execution linked to the persisted queue row.
- Controlled C3-A1 acceptance passes. The real-model owner matrix remains open under C3-A7.

### C3-A3 approval resume source check — 2026-11-06

- A new orchestrator test resumes a checkpoint marked `aiDepartmentWork`. It verifies that
  the resumed call keeps its run and tool-call IDs, rebuilds the `ai-department` runtime for
  the same owner thread, and records the next execution with source `ai-department`.
- The test exposed a source-selection bug. n8n Chat channel setup overrode the persisted
  Department source. Resume now gives the checkpoint's host-owned Department marker priority.
- The orchestrator suite passed 171/171 before the final tool-call assertion. The focused
  resume test passed after that assertion. CLI typecheck, focused Biome, and `git diff --check`
  passed. Adapter tests also reject ordinary chat and delegated executions.
- Process restart with a suspended native approval and Department tool-call context remains
  unverified. Keep C3-A3 open until that path passes.

### C3-A4 controlled result and archive check — 2026-11-06

- The SQLite attempt integration suite passed 38/38 on the existing test-owned database.
- The suite confirms that runtime success without a submitted result blocks work and that a
  repeated snapshot has no second effect. It also confirms that a submitted automatic result
  stays done after a later runtime failure, while department and member archive stay blocked
  until the owner run stops.
- A release test rejects retry and late submit while the current run is stopping, then allows
  a new attempt after terminal confirmation. Provider-backed result generation and the full
  C3-A4 runtime matrix remain open. Keep C3-A4 unchecked until those checks pass.

## Acceptance

- [x] C3-A1: Duplicate start, two workers and unknown acknowledgment create at most one
  active owner execution per work. Restart recovers the same attempt/key.
- [x] C3-A2: Two claims race. Only one wins. Expiry cannot transfer ownership while old
  run is active, suspended or unknown. Confirmed stop permits a new attempt; old tokens fail.
- [ ] C3-A3: Native approval resume and process restart retain work/tool-call context.
  An unrelated chat or delegated Agent cannot claim or report.
- [ ] C3-A4: Success without submit does not enter review/done. Submit plus later failure
  preserves the result. Active-runtime archive and new-start guards remain effective.
- [ ] C3-A5: Queued/running cancel and handoff survive restart. Late results and reversed
  owner events do not rewrite terminal work or a later attempt.
- [ ] C3-A6: Revoke user/binding access before claim, renewal, submit and result delivery.
  Each denies new action, requests owner stop and preserves unknown termination truthfully.
- [ ] C3-A7: Run the native-owner matrix with a real model after controlled-owner checks.
  Real queue admission without a model is partial evidence only.
