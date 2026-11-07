# C4: Business Review

**Status:** Approved v1. G3 remains OPEN for Agent-review authority.
**Owner:** Spec 003. **Dependency:** C2 business result and C3 terminal owner proof.

## Requirements

- C4-R1: Keep required and automatic modes. Required defaults to one human_only stage.
  Automatic needs an explicit coordinator policy choice before execution. Neither mode
  grants runtime tool permission. Policy changes require backlog/ready and no active intent/run.
- C4-R2: Required policy contains a nonempty ordered list of stages with stable IDs.
  Exactly one stage is active. One authorized accept advances it; the last accept marks
  done. A return requires a reason, closes the round, sets ready and creates C2 eligibility.
  No parallel quorum, timer verdict, auto-accept or bounded automatic rework loop in v1.
- C4-R3: A stage selects authorized writers or explicit user/member IDs and one actor
  filter: anyone, not_creator, human_only. `anyone` still requires current write authority
  and participant eligibility. `not_creator` excludes the review requester principal.
  `human_only` permits authenticated users only. Reject an empty eligible policy at setup.
- C4-R4: Pin policy revision, stages, requester and submitted result to the review round.
  Unknown requester denies not_creator. Rework creates a new attempt/result/round and
  restarts at stage one. Earlier decisions stay immutable and cannot approve a new result.
- C4-R5: Every verdict checks current project scope, participant policy, active stage,
  work/result/policy version, round, and confirmed terminal owner. Current access is
  rechecked even for explicit participants. Loss of all eligible reviewers shows blocked
  review attention. It does not relax policy. A coordinator can cancel or return work
  for policy correction through an audited operation with a reason, never accept by override.
- C4-R6: An Agent reviewer uses a separate verified review context for its member/binding,
  initiating user and review assignment. The submitting executor's work tool cannot forge
  that context. If owner support is unverified, Agent verdicts remain disabled and policies
  that require them cannot be enabled. Human-only review can be delivered independently.

Execution stages in this package are reserve, claim, report and review boundaries.
A configurable executor pipeline is outside v1. Ordered business review stages satisfy
the selected staged-review scope in 003 FR-015; this narrowing needs approval with D4.

## Model deltas

Add ReviewPolicyRevision with mode and ordered stage definitions. Stage participants use
principal kind plus opaque ID, or the authorized-writers rule. Add SubmittedResult and
ReviewRound with workId, attemptId, resultId, requester kind/ID, policy revision,
activeStageId, ordinal, status and version. Add ReviewStageDecision with roundId, stageId,
resultId, actor kind/ID, decision, reason, priorVersion, command identity and timestamp.
Round status is open, accepted, returned, or reopened. Unique round/stage terminal verdict
prevents competing accepts. All transitions, receipts, activity and revision commit together.
Result references remain owner-authorized. An audited coordinator reopen records a reason
and creates new eligibility. It does not create an acceptance decision.

Compatibility: do not silently reinterpret existing required/automatic records. Existing
submitted results retain their captured policy. A new explicit revision applies to future
attempts. Migration/backfill for requesterless legacy reviews must deny not_creator and
require an attributed new round. User approval of D4 includes this future-policy default.

## API contract

Keep `/work/:workId/review`. Proposed body:
`{requestId, expectedVersion, attemptId, resultId, reviewRoundId, stageId,
expectedReviewVersion, decision, reason?}`. Response includes committed work version,
round version, current stage, decision and allowedActions. Missing stage/round is accepted
only for a legacy single-stage round with unambiguous persisted identity.

Policy configuration uses validated work create/update under agent:create/update.
Human verdict requires agent:update and current stage eligibility. Agent verdict uses
an authenticated owner-side review service with the same checks and no caller actor ID.
A proposed `POST /work/:workId/review/reopen` lets an authorized coordinator close a
stalled review with reason and return work to ready for future-policy correction, only
with terminal runtime and no active claim. It records no acceptance verdict.

## Source and spec mapping

003 FR-007/FR-015 and US3 map here. The implementation stores immutable policy revisions,
submitted results, review rounds, and stage decisions as separate records. `reviewWork()`
checks the current result, round version, active stage, requester filter, terminal attempt,
and current project write access. The attempts API returns the IDs and active stage version
needed by the UI. Controller uses `agent:update`. Agent review authority, reviewer-loss
attention, and the real-owner acceptance matrix remain open. Paperclip
`issue-review-policy.ts` resolves `not_creator` from the actor that requested review. Its
policy names do not automatically supply n8n participant authority.

## Acceptance

- [ ] C4-A1: Two sequential stages advance once each; work stays review after first
  accept and becomes done after final accept. Duplicate verdict returns the same response.
- [ ] C4-A2: Concurrent accept/return and a verdict for an old result/stage/round fail
  safely. Return keeps result history and creates one rework eligibility generation.
- [ ] C4-A3: Check human/Agent and requester/nonrequester against all three filters,
  explicit participants, current writer scopes, revocation and unknown requester.
- [ ] C4-A4: A runtime success, tool grant, review UI control or submitting Agent cannot
  bypass business policy. Live owner blocks verdict until terminal confirmation.
- [ ] C4-A5: Reviewer access loss produces attention and an audited reopen/cancel path.
  It never turns an ineligible actor into a reviewer.
