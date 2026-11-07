# Goals, Work, and Attempts: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. The internal Agents-owned work boundary is implemented. G1 runtime, C3 recovery, and provider acceptance remain open. See the feature contract evidence before enabling a runtime.

## HTTP contract

Base path: `/rest/projects/:projectId/ai-departments/:departmentId`.

| Method | Path | Scope and behavior |
|---|---|---|
| GET | /goals; /work | `agent:list`; page within the department |
| GET | /goals/:goalId; /work/:workId | `agent:read`; detail within the department |
| POST | /goals; /work | `agent:create`; create validated records |
| PATCH | /goals/:goalId; /work/:workId | `agent:update`; expectedVersion required |
| POST | /work/:workId/ready | `agent:update`; validate assignment |
| POST | /work/:workId/start | `agent:update` plus `agent:execute` and owner access |
| POST | /work/:workId/retry | Same start permissions; blocked work with no current claim |
| POST | /work/:workId/cancel | `agent:update`; active attempts additionally require `agent:execute` and owner access |
| POST | /work/:workId/review | `agent:update`; accept or return one current result |
| POST | /work/:workId/review/reopen | `agent:update`; return a stalled review to ready with an audit reason; never accepts the result |
| GET | /work/:workId/history; /work/:workId/attempts | `agent:read`; safe metadata only |
| GET | /work/:workId/activity | `agent:read`; ordered safe activity entries |
| GET | /work/:workId/relationships | `agent:list`; parent, children, and blockers |
| POST | /work/:workId/relationships; DELETE | `agent:update`; add/remove a validated parent or blocker link |

List requests accept `take` (1–100, default 50), `skip`, and named filters for state, goal, assignee, and text. Use stable ordering by createdAt/id. Return `{ data, count }`.

Command lookup uses GET /rest/projects/:projectId/ai-department-commands/:requestId, outside the department path so an uncertain department-create command can also be resolved. Require `agent:read`, the original action scopes, and the original initiating user. This lookup is shared with 002 and later features. Unknown keys return 404; pending commands return their current acknowledgment state. It never restarts work.

Commands contain `requestId`; changes to existing records also contain `expectedVersion`. Creation has no prior version. A repeat with the same identity and payload returns its stored result even if the original expected version is now old. Check current access before returning that result. A changed payload with a reused key returns 409.

Assignment to ready work, readiness, review return or reopen, completed handoff, or explicit start of ready work returns an acknowledgment for durable eligibility and a wake intent. It does not claim the work or start a run. The Agent owner lists eligible work and atomically claims it. Start returns 202 with work version, attemptId, and dispatch state. It never promises that the owner process already runs. A successful run alone does not complete work; an Agent must submit a result under its current claim. Cancellation without an active attempt returns the committed cancelled work. Cancellation with an active attempt returns 202 with a pending flag until owner confirmation. A staged review body is `{ requestId, expectedVersion, attemptId, resultId, reviewRoundId, stageId, expectedReviewVersion, decision, reason? }`. The server checks stage, result, round version, requester filter, participant eligibility, terminal attempt, and current `agent:update` access. The attempts response exposes result and round IDs, active stage ID, and round version for the current review. Legacy single-stage rounds may omit stage identity only when the persisted result identifies one unambiguous stage. The response returns the next stage, round status, round version, and allowed actions. Reopen body is `{ requestId, expectedVersion, reason }`; it requires a terminal attempt and no active claim.

`GET /work/{workId}/review/decisions` returns the append-only decision history for the work item under `agent:read`. It includes stage, result, reviewer, decision, reason, prior review version, and timestamp. It includes both migrated legacy decisions and staged decisions.

A committed help response may also make blocked Work ready after the prior attempt is terminal and all blockers are resolved. Preserve the assignee and use the same durable eligibility generation and coalesced wake contract as other ready transitions. Do not wake while stop state is unknown or a blocker remains.

400 means invalid input or transition. 403 means insufficient current authority. 404 hides inaccessible cross-project records. 409 means stale version, conflicting command identity, or active-attempt conflict. An unavailable executor returns a safe blocked reason and creates no new owner execution.

## Agents-owned work owner contract

This is an internal contract, not a public n8n API. Agents owns runtime identity, queue acceptance, execution lookup, stop receipts, and runtime snapshots. AI Department owns work eligibility, lane admission, claims, work actions, and business transitions. The Agents module exposes owner ports for these operations and verifies each runtime context before it calls a work action.

| Operation | Owner and behavior |
|---|---|
| Eligibility and wake | AI Department records an eligibility generation and lane wake. Agents accepts or coalesces the durable queue message. A wake does not claim work or start a run. |
| `DepartmentWorkInbox.listAssigned(authority, query)` | AI Department returns ready work for the verified project, member, executor, and binding revision. The cursor is lane-bound. |
| `DepartmentWorkActions.executeToolAction(context, requestId, action)` | Agents builds context from the host execution and stable tool-call ID. AI Department checks the attempt, binding, access, version, blockers, and current claim before it applies a work action. |
| Claim, renew, reclaim, release | AI Department owns atomic claim changes and five-minute leases. A different execution cannot take over the same attempt. A retry after confirmed stop uses a new attempt and claim generation. |
| `dispatch(context)` / `lookup(context)` | Agents returns accepted, rejected, absent, or unknown for the stable dispatch key. Unknown acceptance keeps the attempt reserved. |
| `requestStop(ownerRef, commandId, reason, authorityContext)` | Agents records an idempotent, correlated stop receipt. An acknowledgment does not confirm termination. A scoped control-plane authority can request stop after access revocation. |
| `snapshot(ownerRef, authorityContext)` | Agents returns the correlated runtime phase, durable sequence, and safe outcome reference. Only a terminal snapshot confirms stop. |
| Reconciliation | AI Department consumes ordered snapshots and owner receipts. Duplicate snapshots have no second effect. An older attempt cannot change current work. |

The dispatch key stays stable across transport retries. An unknown acknowledgment keeps the lane reserved. Reconciliation may retry dispatch only after owner lookup returns authoritative absence. Lease expiry denies work actions. It does not authorize a second runtime.

The work tool does not accept actor, member, binding, attempt, or execution identity from model input. Agents derives execution and attempt context from the host run. AI Department resolves the attempt and current binding, then checks project access and expected work version for each mutation. It records the actor, time, and safe summary. Prompts, credentials, and Agent checkpoints stay with their owners.

The Agents adapter rejects ordinary chats, inline Agents, delegated runs, and unaccepted dispatches. It checks current project access and publication on each action. Access loss revokes work actions before the next mutation. Native tool approval and business review remain separate.

These interfaces and controlled-owner checks establish the contract boundary. They do not close G1 runtime, C3 restart/revocation, or real-provider acceptance. Keep the workflow invocation gate disabled until its owner criteria pass.

## Archive guard shared with 002

`ActiveDepartmentWorkGuard.check({ projectId, departmentId, memberId? }, ctx)` returns blocking work IDs and a count. The context is the sanctioned persistence transaction context. Archive and assignment must acquire the same admission fence. An unavailable guard denies archive. This contract is owned by the directory; work persistence supplies the implementation.

## Business review and tool approval

Review uses the work endpoint. Native tool approval uses the existing Agents-owned permission contract and current owner access. The work API exposes only a safe pending-request reference and never fabricates an approval result.

## C2 coordination, C3 execution, and C4 review — Approved API amendment

### Approved Feature Contract v1 API amendments

The shared scopes are `agent:list/read/create/update`; execution also requires `agent:execute` and current owner access. Explicit start creates the same eligibility as the ready path. Add the C2 inbox and handoff service operations in the Feature Contract. Owner dispatch, lookup, stop proof, sequence and review authority must use the Agents-owned contract.

T024 implements the internal `DepartmentWorkInbox.listAssigned(authority, query)` boundary. Authority binds project, actor, member, Agent and binding revision. The cursor binds that same lane and uses `(eligibleAt, workId)` keyset order. The response contains safe ready-work summaries, eligibility generation, binding availability, wake state and a next cursor. It does not expose attempt references. T029 connects this boundary to authenticated department-run context; T024 does not add a standalone public REST route.

G1 and G2 owner-boundary designs are closed. G2 live stop and durable sequence acceptance remain open; current live evidence only verifies receipt persistence and sweeper-driven recovery. G1 runtime acceptance and broader C2 handoff/release recovery acceptance remain open. G2 owner implementation does not block the C2 inbox and coordination task slice. G3 blocks Agent-review authority only.
