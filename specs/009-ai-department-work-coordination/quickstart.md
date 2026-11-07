# Quickstart: AI Department Work Coordination

**Status**: Validation scenarios only. G1 consultation and C5 workflow owner acceptance are not complete.

## Preconditions

- Use a dedicated test-owned database. Do not use the owner's working SQLite database.
- Create one project and department with a coordinator, a CEO Agent member, a department
  manager Agent member who reports to the CEO, a staff Agent member who reports to that
  manager, and one human user with project access.
- Bind Agent members to test-owned Agents configurations. Use controlled owner responses.
- Keep meeting fixtures separate. Do not delete existing Spec 008 data during validation.

## Scenarios

1. **Structured report**: Claim Work and submit all report fields. Verify the result is
   non-empty, evidence references are scoped, activity is attributed, and the existing
   coordinator review policy is applied.
2. **Rejected report**: Submit an empty result and an oversized field. Verify rejection
   leaves the Work version, claim, and activity unchanged.
3. **Deterministic routing**: Add expertise tags, ask for one tag, and verify the selected
   member is active, bound, same-department, non-self, and absent from the request chain.
4. **Fallbacks**: Make no eligible expertise match. Verify manager routing, then assigning
   person routing after access recheck. Remove all eligible responders and verify a visible
   unresolved state.
5. **Human answer**: Ask, confirm the requester turn has stopped, answer as the assigned
   person, and verify the response is stored before continuation. Work moves to ready and
   receives a new eligibility generation only when no other blocker remains.
6. **Agent answer**: Run on a test-owned database with the response gate overridden only by
   the opt-in test. Verify current access stores a bounded answer and continues the same Work.
   Remove the responder member binding while generation is held; verify no answer persists
   and the requester does not wake. Also revoke the initiating user's project access while
   generation is held and verify the owner rejects the answer. Replace the responder's
   executor binding revision during generation and verify that the old result is rejected.
   Change only the responder's reporting line and verify that valid execution authority
   remains. The responder user is not a separate authorization actor for this flow. These
   test results do not enable the production G1 gate.
7. **Recovery**: Restart between request commit, owner acceptance, answer commit, and wake
   delivery. Reconcile concurrently and verify one requester continuation and one lane
   admission by the same idempotency identity. Run the live concurrent-answer case and verify
   one stored response, one answer activity, and one continuation attempt.
8. **Hierarchical campaign work**: Create a campaign goal and parent Work for the CEO.
   Have the CEO delegate a bounded research brief to its direct-report manager. Verify the
   child inherits the goal, stores eligibility and wake intent atomically, and starts
   through the manager's existing inbox lane. Have the manager delegate a separate
   competitor scan to its direct-report staff Agent during a later claimed turn. Verify
   peer, manager, indirect-report, and archived-member assignments fail without creating
   child Work. Verify the parent remains blocked until every child is done, and that a
   duplicate command reuses the same child and wake intent. Accept each child result under
   its human review policy. Confirm the authorized parent view shows each structured
   report. After the manager's prior attempt is confirmed terminal and the last child is
   accepted, verify the manager receives one new durable wake.
9. **Review and workflow use**: Keep each child's result in its configured business
   review stage. Verify an Agent report does not accept the business result. Keep workflow
   invocation disabled until its owner test runs a separately enabled capability through a
   real workflow execution, approval wait and resume, revocation during the wait, and
   side-effect approval. Verify the member can call only the exact published revision.
10. **Meeting transition**: Verify meeting creation is absent in the UI. Verify existing
   meeting rows remain readable to authorized users and unchanged by this release.

## Expected outcomes

- No duplicate request, response, wake, or child Work item appears after replay.
- A help request does not change the Work assignee.
- An answer does not grant permission or approve the result.
- Unknown owner state remains visible and blocked until reconciliation.
- No live Agent answer or requester continuation is reported as accepted before its owner
  and G1 gates pass.
- The live normal-answer, binding-loss, requester-access-loss, and concurrent-answer cases
  pass in the opt-in test suite. Reporting-line reassignment preserves current executor
  authority, while executor revision replacement invalidates the held result. The production
  G1 gate remains closed while the remaining acceptance cases stay open.
