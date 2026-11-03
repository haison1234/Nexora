# C6: Operations UI and Live Updates

**Status:** Approved v1. G6 blocks live push only. Browser acceptance remains OPEN.
**Owner:** Spec 006. **Dependencies:** C6A: C1/C2/C4; C6B: verified C3 and enabled C5.

## Requirements

- C6-R1: Provide Overview, Work, People and Activity in the n8n project shell. Show
  hierarchy, goal/work detail, relationships, inbox eligibility, claim owner, progress,
  result/review stages, attempt history, transfer/recovery and safe activity in 2D.
- C6-R2: Separate business work, wake/claim, runtime, child workflow, native tool approval,
  business review, member availability and view freshness. Pending cancellation/transfer
  and unavailable runtime have text reasons. All core permitted actions work without 3D.
- C6-R3: Use server allowedActions for presentation and backend scopes for enforcement.
  Preserve form input on stale edit; require deliberate reapplication. On unknown command,
  resolve its original receipt. Reconnect never repeats a mutation with a new identity.
- C6-R4: Use existing n8n push infrastructure with a new typed department invalidation
  and subscription handler. Subscribe under current project agent:read access. Recheck
  that access immediately before every delivery. On loss, revoke the subscription and
  send only a content-free reset when supported. Never deliver protected IDs after loss.
- C6-R5: An invalidation triggers an authorized read. Use department revision as ordering
  token and per-resource versions for edits. Ignore old/duplicate invalidations. On gaps,
  reconnect or visibility return, read a full snapshot. v1 has no event replay endpoint.
- C6-R6: Visible fallback polls every four seconds with one read in flight and bounded
  retry backoff after failures. Pause while hidden. Show stale/disconnected status after
  failed reads; retain only last-known authorized state. Clear protected cache on 403,
  protected-resource 404, user/project change, logout or subscription revocation.
- C6-R7: Meet Spec 006 keyboard, focus return, reduced motion, Vietnamese/English, token,
  component and 360 CSS pixel layout requirements. Background updates do not steal focus.
- C6-R8: With healthy push and a visible page, target 95 of 100 supplied committed
  updates visible within five seconds in the roadmap fixture. Measure from projection
  commit to rendered state. Measure owner-to-projection delay separately. A 30-second
  owner poll cannot satisfy owner-progress freshness by itself. During push failure,
  fallback polling has no five-second target; measure its observed latency separately.
  Leave timing acceptance open until measured under native execution and browser load.

## Read model and transport contract

OperationsSnapshot: projectId, departmentId, revision, generatedAt, attention, activeWork,
ownership, recentActivity and allowedActions. Extend work detail with eligibility/wake,
claim generation/lease, transfer, current result/round/stage and child outcomes. Return
safe references only. Private owner details require separate owner authorization.

Allocate revision transactionally in owning persistence for every accepted visible
change across C1–C5. Snapshot assembly reads a consistent revision or retries. No second
business store in the UI. Cache key includes user/project/department; cancel or invalidate
old in-flight reads with a request generation so another selection cannot overwrite it.

Retain proposed GET /operations and /activity. Add proposed POST /subscriptions with
`{pushRef}` and DELETE /subscriptions/:id scoped to the authenticated subscription owner.
The push reference must belong to that session. Return subscriptionId and currentRevision.
Normal invalidation: `{schemaVersion:1, eventId, projectId, departmentId, resourceKind,
resourceId, revision}`. Access-reset contains no protected resource identifiers.
Subscription is not authorization for later reads or delivery. A sequence gap requests
snapshot; clients do not replay events as business commands.

## Source and spec mapping

006 FR-001–FR-014 and SC-001–SC-004 map here. The home view, REST client and Pinia
store already provide a partial directory/work/goals/history/activity/basic-review UI.
Source inspection found no department subscription channel or complete inbox, hierarchy,
relationship editor or stage-review surface. Existing request-generation logic is partial
source evidence for stale-response protection. Locale/browser acceptance remains open.

006 data-model revision and proposed interface routes are retained. Its generic
project:read mapping changes to registered agent scopes. Transport selection adds typed
push plus snapshot recovery, not Paperclip's WebSocket implementation. External runtime
005 contributes controls only after its own contract gate. 007 reads this same projection.

## Acceptance

- [ ] C6-A1: Complete permitted directory, planning, graph, assignment, review and recovery
  actions with keyboard only, both languages and a 360 CSS pixel viewport. Check loading,
  empty, partial failure, unavailable, transfer pending and cancellation pending states.
- [ ] C6-A2: Duplicate/reversed/missed invalidations, disconnect/reconnect and rapid route
  changes cause no state rollback, stale-detail overwrite or repeated command.
- [ ] C6-A3: Revoke project access while connected and with reads in flight. No later
  protected event arrives; cache, selected detail and late responses are cleared/ignored.
- [ ] C6-A4: With healthy push and a visible page, at least 95 of 100 supplied updates
  render within five seconds of projection commit. During push failure, verify four-second
  polling, fresh snapshot recovery and hidden-view pause. Report fallback latency and
  owner reconciliation latency separately; neither has this five-second acceptance target.
- [ ] C6-A5: UI distinguishes a successful run without result, submitted result with active
  owner, business review and native tool request. None implies another's permission/outcome.
- [ ] C6-A6: Seeded C6A examples are labeled demonstration evidence. C6B passes with a
  real Agent and workflow child before live operations is reported complete.
