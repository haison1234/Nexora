# C2: Goals, Work, and Coordination

**Status:** Approved v1. G1 and G2 ownership designs are closed. C2 tasks may be generated.
Handoff/recovery runtime acceptance remains gated on the Agents owner implementation.
**Owner:** Spec 003. **Dependency:** C1; execution protocol jointly defined with C3.

## Requirements and business state

- C2-R1: Maintain goals, hierarchy, owner, due date, priority, assignment, parent work,
  blocker graph, and ordered safe comments/activity. Reject cycles and cross-department
  links. `A blocks B` prevents B readiness, claim, resume, and result submission until
  A is done. Cancellation does not resolve a blocker; remove or replace the edge.
- C2-R2: Keep states backlog, ready, running, blocked, review, done, cancelled. Reserving
  an attempt leaves ready work ready. Only a valid Agent claim changes it to running.
- C2-R3: Save inbox eligibility and wake intent in the same transaction as readiness,
  ready reassignment, review return, completed handoff, or an authorized explicit start
  of ready work. Explicit start uses the same eligibility and wake path. A repeated
  command reuses its receipt and cannot create duplicate eligibility or an active attempt.
  Backlog assignment does not dispatch. Unconfigured work stays organized and reports unavailable execution.
- C2-R4: Separate inbox discovery from action authority. List only current member/binding
  work under the initiating user's current project policy. One Agent bound to two members
  has separate member lanes. Do not merge authority across users or binding revisions.
- C2-R5: Coalesce scheduling signals by `(project, member, bindingVersion, initiatingUser)`.
  Keep every work eligibility generation durable. A duplicate signal does not create
  another attempt. A signal arriving during drain remains pending for the next drain.
  Admit one department run per lane at a time. Each run receives one reserved work item.
- C2-R6: Order eligible inbox work by readyAt then ID. Use pages of 1–100, default 50.
  Priority/due date remain visible planning fields. Do not silently introduce priority
  starvation or recurring/timer execution. Each item is rechecked before reservation.
- C2-R7: Agent progress/comment/block/resume/submit requires the C3 claim. Release requires
  a reason, fences further actions, retains assignee, and blocks work for recovery.
- C2-R8: Handoff names one active destination in the same department and a reason.
  An Agent may request it under its current claim; a coordinator must authorize the
  destination and new execution authority. A coordinator can request/authorize directly.
  Stop the old owner before committing destination assignment and wake. No autonomous
  delegation loop or copied executor state is introduced.

## Data model deltas

Keep Goal, WorkItem, WorkRelationship, Activity, Transition, and command receipts.
Add `readyAt`, `eligibilityGeneration`, and a durable lane/wake generation with pending,
accepted/coalesced, unknown, delivered, and rejected acknowledgment states. Keep
per-work eligibility separate from the lane notification; delivered is not completed work.
An old generation cannot acknowledge newer eligibility.

Add HandoffIntent: id, project/department/work, sourceMemberId, sourceAttemptId,
destinationMemberId, requestedBy principal, authorizedByUserId, reason, expectedVersion,
state, stopCommandId, createdAt, completedAt. States are requested, awaiting_stop,
completed, rejected, cancelled. Keep the old attempt slot until confirmed terminal.
During awaiting_stop, show transfer pending and deny old claim mutations. If destination
becomes invalid, block recovery without dispatch. Completion atomically records old/new
assignee, transition, receipt, next eligibility and revision. A competing cancel cancels
pending handoff and suppresses the destination wake; a late confirmation cannot revive it.

## API and service contract

Retain goal/work/relationship/activity routes and receipts. Add proposed
`POST /work/:workId/handoff` with `{requestId, expectedVersion, destinationMemberId,
reason, sourceAttemptId}`. An Agent request enters the same domain operation through
host context, not a user REST credential. Authorization of its request uses the same
handoff route with `handoffId` and current expectedVersion. Return a durable handoff
reference and 202 while owner stop is pending. Ready work without an attempt can transfer
atomically. Backlog/ready assignment still uses the ordinary PATCH when no intent is active.

Internal contracts:

- `listAssigned(inboxAuthority, {cursor?, take?})` returns safe work/version/eligibility,
  binding availability, wake state and nextCursor. The server binds the cursor to lane
  and stable readyAt/ID order. Concurrent changes may remove items; recheck at admission.
- `notifyInbox(laneRef, generation, wakeKey)` returns accepted, coalesced, rejected, or
  unknown. It does not claim work. The owner drains persisted eligibility through C3
  reservation. Do not expose arbitrary work mutation tools to an unbound discovery run.
- `handoff`, `release`, and `report` use current run/claim context, receipt identity,
  expectedVersion, and claim generation. Accepted writes append safe activity.

## Existing behavior, gaps, and spec mapping

003 FR-001–FR-003 and FR-014/FR-016 map to planning/relationships/activity already in
`work.service.ts`, `work.repository.ts`, and shared `work.ts` DTOs. FR-011/FR-012 map
to the new inbox/handoff requirements. `WorkWakeIntent` still has one row per work and
the compatibility drain calls startWork per item. T022 adds durable `WorkEligibility` and
`WorkWakeLane` persistence. T023 now writes eligibility for readiness, ready
reassignment, review return, and explicit start, while keeping the per-work wake
compatibility path. T024 adds a lane-bound assigned-work inbox service with keyset
pagination. The authenticated Agent tool is still T029. Lane coalescing and drain
recovery are not wired yet. WorkCoordinationService provides current-attempt
inspect/actions; destination handoff remains open. Release currently moves to blocked.

G1 source review confirms the ownership boundary: the department stores per-work
eligibility and lane generations, coalesces notifications, and admits at most one run
per lane. Agents stores and deduplicates each dispatch message, looks it up by stable
message ID, and recovers missed in-process notifications by scanning its durable queue.
The current Agents queue does not implement department lane coalescing or lane admission.
The acceptance criteria below still need to verify this boundary end to end.

The 003 model statement that start persists a running transition conflicts with current
source and C2-R2. The older claim/activity-unimplemented status also needs correction.
Keep old task checkboxes; use evidence.md for current limits.

## Acceptance

- [ ] C2-A1: Three eligible items for one lane plus repeated notifications retain three
  inbox entries, one lane drain, and at most one run at a time. A new item during drain
  is not lost. Different users/members/binding revisions never share authority.
- [ ] C2-A2: Restart before/after notification acceptance drains the same generation
  without losing an item or creating duplicate active attempts.
- [ ] C2-A3: A blocks B prevents all B admission/result paths. Reject graph cycles and
  cross-department links. Cancelling A does not silently unblock B.
- [ ] C2-A4: Handoff from A to B stays pending during unknown stop. After confirmation,
  assign B once, wake B once, and reject A's late report. Destination archive/access loss
  and concurrent cancel produce a recoverable outcome without B execution.
- [ ] C2-A5: Release retains assignee/history and blocks further old-run actions. A
  coordinator can resolve/retry only after C3 confirms old execution terminal.
- [ ] C2-A6: Duplicate commands return the original authorized response. Changed payload,
  stale version, invalid actor and old eligibility generation cannot change work.
