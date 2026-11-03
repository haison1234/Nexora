# C3: Agent Execution and Recovery

**Status:** Approved v1. G1 and G2 designs are closed. G2 owner implementation and runtime acceptance remain OPEN.
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

This closes the G2 design question. It does not claim the current Agents adapter meets
the contract or that restart/revocation acceptance has passed.

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

Current `isRunStopped(executionId)` checks execution status/HITL suspension. It does not
provide the scoped stop-proof contract above. Current `requestStop()` requires current
user `agent:execute` scope, so it cannot provide the approved narrow stop path after
revocation. Current snapshot sequence derives from `updatedAt` and is not durable across
clock changes or restart. Current claim code can change execution inside one attempt
after this check. D3 requires a new attempt for a different run. G2 design is closed by
the owner operation contract above; implementation and restart/revocation acceptance
remain open and block handoff/recovery runtime acceptance.
Current work reconciliation runs every 30 seconds. That is not evidence for C6's five-second
visible-update target. Owner sequence/resume/restart semantics remain a source gate.

005 runner isolation, pinned provider versions and approval checks stay additional
requirements. No provider can skip this contract because it uses the same DTOs.

## Acceptance

- [ ] C3-A1: Duplicate start, two workers and unknown acknowledgment create at most one
  active owner execution per work. Restart recovers the same attempt/key.
- [ ] C3-A2: Two claims race. Only one wins. Expiry cannot transfer ownership while old
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
