# Goals, Work, and Attempts: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. Owner gates and implementation remain open. Existing routes implement planning, direct start, snapshot reconciliation, cancellation, and review. The Paperclip parity review requires an Agents-owned wake/claim/action contract before those routes can be called parity complete.

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
| GET | /work/:workId/history; /work/:workId/attempts | `agent:read`; safe metadata only |
| GET | /work/:workId/activity | `agent:read`; ordered safe activity entries |
| GET | /work/:workId/relationships | `agent:list`; parent, children, and blockers |
| POST | /work/:workId/relationships; DELETE | `agent:update`; add/remove a validated parent or blocker link |

List requests accept `take` (1–100, default 50), `skip`, and named filters for state, goal, assignee, and text. Use stable ordering by createdAt/id. Return `{ data, count }`.

Command lookup uses GET /rest/projects/:projectId/ai-department-commands/:requestId, outside the department path so an uncertain department-create command can also be resolved. Require `agent:read`, the original action scopes, and the original initiating user. This lookup is shared with 002 and later features. Unknown keys return 404; pending commands return their current acknowledgment state. It never restarts work.

Commands contain `requestId`; changes to existing records also contain `expectedVersion`. Creation has no prior version. A repeat with the same identity and payload returns its stored result even if the original expected version is now old. Check current access before returning that result. A changed payload with a reused key returns 409.

Assignment to ready work, readiness, review return, completed handoff, or explicit start of ready work returns an acknowledgment for durable eligibility and a wake intent. It does not claim the work or start a run. The Agent owner lists eligible work and atomically claims it. Start returns 202 with work version, attemptId, and dispatch state. It never promises that the owner process already runs. A successful run alone does not complete work; an Agent must submit a result under its current claim. Cancellation without an active attempt returns the committed cancelled work. Cancellation with an active attempt returns 202 with a pending flag until owner confirmation. Review body is `{ requestId, expectedVersion, attemptId, decision, reason? }`.

400 means invalid input or transition. 403 means insufficient current authority. 404 hides inaccessible cross-project records. 409 means stale version, conflicting command identity, or active-attempt conflict. An unavailable executor returns a safe blocked reason and creates no new owner execution.

## Agents-owned work owner contract, proposed version 2

This internal contract must be implemented by the Agents module; it is not an existing public n8n API. The current adapter only queues hidden chat and polls snapshots, so it does not satisfy this contract.

| Operation | Required result |
|---|---|
| wake(wakeKey, memberRef, workRef, reason) | durable accepted/coalesced wake; no implicit execution |
| listAssigned(agentContext, cursor) | only work visible to the currently authorized Agent/member binding |
| claim(workRef, runRef, expectedVersion, lease) | atomic claim or current claim conflict; stale run cannot take over |
| renew/reclaim/release(claimRef, runRef) | lease-aware renewal/recovery/handoff with current access checks |
| report(claimRef, runRef, expectedVersion, action) | append progress/comment/block/result/review-request activity and a business transition where allowed |
| dispatch(dispatchKey, attemptContext) / lookup(dispatchKey) | accepted owner execution, definite rejection, confirmed absence, or unknown |
| requestStop(ownerExecutionRef, commandId) | request acknowledgment, not terminal cancellation |
| snapshot(ownerExecutionRef) | authorized current runtime phase/outcome and last sequence; never a business result by itself |
| Snapshot ingestion | Sequence-checked, idempotent attempt receipts; older attempts cannot change current work. Native approval references remain with Agents. |

The persisted key is stable across transport retries. The owner must not treat an expired worker lease as permission to start a second execution. Department reconciliation may redispatch only after the owner confirms absence under its deduplication protocol.

Every owner action carries schemaVersion, projectId, departmentId, workId, binding version, claimRef/runRef where relevant, stable command identity, and expected work version. Derive Agent/member identity from the authenticated runtime context; never trust a caller-supplied actor ID. Validate project access and the current binding at mutation time. Record actor, time, and safe summary. Do not pass prompts, credentials, or Agent checkpoints into the department store.

Department actions are available only to a run started from a verified department wake and its current attempt context. Do not attach claim/report tools to ordinary Agent chats, unrelated workflow runs, inline Agents, or delegated sub-agents. Tool schemas expose only the current work and permitted actions for that run. Owner access loss revokes the action context before the next mutation.

## Archive guard shared with 002

`ActiveDepartmentWorkGuard.check({ projectId, departmentId, memberId? }, ctx)` returns blocking work IDs and a count. The context is the sanctioned persistence transaction context. Archive and assignment must acquire the same admission fence. An unavailable guard denies archive. This contract is owned by the directory; work persistence supplies the implementation.

## Business review and tool approval

Review uses the work endpoint. Native tool approval uses the existing Agents-owned permission contract and current owner access. The work API exposes only a safe pending-request reference and never fabricates an approval result.

## C2 coordination, C3 execution, and C4 review — Approved API amendment

### Approved Feature Contract v1 API amendments

The shared scopes are `agent:list/read/create/update`; execution also requires `agent:execute` and current owner access. Explicit start creates the same eligibility as the ready path. Add the C2 inbox and handoff service operations in the Feature Contract. Owner dispatch, lookup, stop proof, sequence and review authority must use the Agents-owned contract.

T024 implements the internal `DepartmentWorkInbox.listAssigned(authority, query)` boundary. Authority binds project, actor, member, Agent and binding revision. The cursor binds that same lane and uses `(eligibleAt, workId)` keyset order. The response contains safe ready-work summaries, eligibility generation, binding availability, wake state and a next cursor. It does not expose attempt references. T029 connects this boundary to authenticated department-run context; T024 does not add a standalone public REST route.

G1 and G2 owner-boundary designs are closed. Their runtime acceptance remains open. G2 owner implementation is required for handoff/recovery acceptance, but does not block the C2 inbox and coordination task slice. G3 blocks Agent-review authority only.
