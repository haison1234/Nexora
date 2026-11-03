# Data Model: Goals, Work, and Attempts

**Feature**: `003-ai-department-work-management`
**Status**: Approved Feature Contract v1 model amendments recorded. Source includes claims, Agent reporting actions, activity, relationships, and wake intents. Lane inbox/coalescing, handoff, staged review, and claim generation remain proposed implementation work behind G1–G3.

The reviewed behavior target and source map are in [Paperclip parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md). This model specifies equivalent user-facing coordination behavior while keeping execution, credentials, sessions, and run history with n8n Agents.

## Records

All records carry `projectId`, stable string `id`, and audit timestamps. Mutable records carry an integer `version` starting at 1.

| Record | Fields | Invariants |
|---|---|---|
| Goal | departmentId, title, successCriteria, parentId?, ownerMemberId?, dueAt?, state | State is active, done, or archived. Parent and owner stay in the department. Reject cycles. |
| WorkItem | departmentId, goalId?, assigneeMemberId?, instruction, priority, dueAt?, reviewPolicy, state, currentAttemptId, version | Priority and review policy are explicit. The current implementation stores hierarchy and blocker links in WorkRelationship. |
| WorkRelationship | departmentId, workId, relatedWorkId, kind (`parent` or `blocks`) | Both work items stay in the department. A work item has at most one parent. Parent and blocker graphs reject cycles. Unresolved blockers prevent readiness. |
| WorkClaim | workId, memberId, agentId, runId, leaseUntil, claimedAt, releasedAt?, releaseReason? | One current claim per work item. Each action checks the live lease, binding, access, and run identity. |
| Attempt | workId, ordinal, initiatingUserId, bindingId, bindingVersion, provider, executorRef, reviewPolicy, dispatchKey, ownerExecutionRef?, lastOwnerSequence, cancelRequestId?, runtimeOutcome?, cancelRequestedAt? | Binding reference and review policy are fixed. One reserved or active attempt per work item. Runtime outcome never sets business work state by itself. |
| CommandReceipt | projectId, initiatingUserId, requestId, payloadHash, commandKind, status, outcomeRef, timestamps | Shared with 002. Unique project/user/request identity; current access is required to read a prior result. |
| DispatchIntent | attemptId, requestId, inputHash, state, leaseUntil?, acknowledgmentRef? | Unique attemptId and unique project/user/requestId. Reuse of a key with a different payload is rejected. |
| OwnerEventReceipt | provider, ownerEventId, attemptId, sequence, receivedAt | Unique provider/event ID. Gaps require a snapshot; duplicate events are no-ops. |
| WorkTransition | workId, attemptId?, actorId, actorKind, fromState, toState, reason?, occurredAt, workVersion | Append-only. Every accepted business transition has one entry. |
| WorkActivity | workId, attemptId?, claimId?, actorId, actorKind, kind, body?, safeMetadata, sequence, occurredAt | Append-only, ordered, project-authorized. Never store prompts, credentials, or private executor payloads. |
| ReviewDecision | workId, attemptId, actorId, decision, reason?, priorVersion, createdAt | Decisions are accept or return. Return needs a reason. No tool permission is stored here. |
| DepartmentAdmissionFence | projectId, departmentId, sequence | A transaction updates this row before archive, member changes, or work assignment. This serializes archive checks with creation and reassignment. |

## State and concurrency

- Work uses the business lifecycle in spec.md. The Paperclip `todo` state maps to n8n `ready`. Runtime outcomes and business states are separate; a successful run without a result report leaves work open.
- Readiness and authorized explicit start create the same durable eligibility through an Agents-owned API. Ready reassignment, review return, and completed handoff also create eligibility; backlog assignment does not dispatch. Duplicate delivery is coalesced by stable wake identity. A wake is not a claim or an execution.
- Claim, reclaim, release, and handoff are atomic. Lease expiry denies mutations but does not transfer ownership. A different run can act only after the owner confirms the prior run stopped; recovery then reserves a new attempt and claim generation. Every mutation checks current project access, binding, claim, run, and work version.
- Agent actions record progress, comments, blockers, result submission, and review requests as ordered activity. A result enters review or completes work according to the selected policy; review remains a separate decision.
- Parent/child and blocker relations are same-department, cycle-safe, and versioned. A work item with unresolved blockers cannot become ready or done.
- Review policy supports `anyone`, `not_creator`, and `human_only`; staged reviewers remain explicit. Native tool approval remains owned by Agents and never counts as business review.
- A failed, stopped, or unknown runtime attempt remains attempt metadata. The coordinator decides whether to resume, block, or retry work using the current claim and access state.
- DispatchIntent state is pending, acknowledged, unknown, or rejected. An unknown dispatch is not a fresh start opportunity.
- Attempt phase is dispatching, active, suspended, or terminal. Cancellation is a separate pending request until confirmed.
- Resolve binding availability and actor access before reserving an attempt. Missing/unavailable configuration blocks ready work without a new owner start. A definite owner rejection after reservation terminates that attempt and moves running work to blocked with the rejection reason. An unknown acknowledgment retains the reserved slot for reconciliation.
- Start locks the work version and reserves the only active-attempt slot. Persist dispatch intent and the running transition before dispatch.
- The owner records the dispatch-key mapping atomically with its acceptance. If this cannot be established, live start remains disabled.
- Owner snapshots must match the current attempt and its correlation. Sequence receipts make repeated snapshots idempotent. Late snapshots cannot rewrite current work.
- Reassignment and review-policy changes require backlog/ready and no active attempt.
- Result references stay with the owner. The department stores an authorized reference and a bounded safe summary only after an explicit Agent report.
- The archive guard counts all work except done/cancelled. It shares the archive/assignment admission fence with 002 inside the persistence transaction.

## Shared Projection Revision

Persist a department-wide projection sequence with the department. Accepted directory, work, and workflow metadata changes increment it in their persistence transaction. Feature 006 reads a consistent snapshot and uses this sequence for invalidations. Per-resource versions remain the authority for record updates. This requires a schema addition in this feature, not a new business table in 006.

## Migration and retention

Add module-owned entities and reversible migrations through the existing database migration system. Do not duplicate Agent checkpoints, prompts, or cost records. Apply the existing project deletion and retention policy; do not introduce independent retention jobs in this slice.

## Field Conventions

Identifiers are opaque strings and are compared within their project context. Persisted timestamps use the owning database timestamp convention; JSON timestamps use RFC 3339 UTC. Versions and sequences are nonnegative integers; record versions start at 1. Nullable fields use explicit null in responses. Reject unknown command fields and invalid enum values through shared DTO validation.

## C2 coordination, C3 execution, and C4 review — Approved 2026-11-03

### Approved Feature Contract v1 model amendments

Use durable per-work eligibility generations and coalesced authority lanes. Keep work eligibility distinct from lane wake state. The initial persistence model adds `WorkEligibility`, keyed by `(workId, generation)`, with project, department, member, initiating user, binding version, lane generation, request ID, lifecycle state, and eligibility/consumption times. It adds `WorkWakeLane`, keyed by `(projectId, memberId, actorId, bindingVersion)`, with current wake generation, acknowledged generation, acknowledgment state, and update time. `bindingVersion` is nullable on eligibility for unconfigured work; such work remains visible but cannot enter a bound execution lane.

The existing per-work `WorkWakeIntent` remains during this schema slice. New eligibility writes and generation advancement are introduced in the next task so the current delivery path keeps working during rollout. Existing pending rows are not discarded by this migration; the compatibility path must drain or reconcile them before it is removed. Reuse `CommandReceipt` for request idempotency; eligibility `requestId` links the durable generation to its originating command.

Add a handoff intent with source/destination, authority, reason, expected version, stop command, and terminal disposition. A different run requires owner-confirmed stop and a new attempt. Review policy revisions, rounds, stages, requester identity, submitted results, and immutable stage decisions follow C4.

These model changes are approved design. G1/G2 design gates are closed. Generate tasks one contract slice at a time. G1 runtime acceptance and G2 owner implementation/runtime proof remain open. Review-specific runtime checks remain open.
