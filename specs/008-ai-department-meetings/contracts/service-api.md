# Meeting Service and HTTP Contract

**Status**: Proposed interface. Confirm scope registration and source-owner APIs before
implementation. Base path: `/rest/projects/:projectId/ai-departments/:departmentId/meetings`.

## Routes

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/` | `agent:list` | Paged meeting summaries; no protected bodies. |
| POST | `/` | `agent:create` | Create a draft and select active same-department participants. |
| GET | `/:meetingId` | `agent:read` | Read safe metadata and only bodies allowed by current source access. |
| PATCH | `/:meetingId` | `agent:update` | Edit a draft with `expectedVersion`. |
| POST | `/:meetingId/start` | `agent:update`, `agent:execute` | Freeze briefing and participants, reserve calls, return 202. |
| POST | `/:meetingId/takeover` | `agent:update`, `agent:execute` | Explicitly change actor for future calls only. |
| POST | `/:meetingId/participants/:participantId/exclude` | `agent:update` | Record a coordinator exclusion reason before the collection deadline. After quorum/deadline closes the set, absences and last known outcomes are recorded automatically. |
| POST | `/:meetingId/participants/:participantId/retry` | `agent:update`, `agent:execute` | One explicit retry after prior terminal proof. |
| POST | `/:meetingId/synthesis/retry` | `agent:update`, `agent:execute` | One explicit synthesis retry after terminal proof. |
| POST | `/:meetingId/minutes` | `agent:update` | Save coordinator minutes or edit draft with source refs and version. |
| POST | `/:meetingId/minutes/approve` | `agent:update` | Freeze current minutes and approve proposed decisions. |
| POST | `/:meetingId/action-items/:itemId/convert` | `agent:create`, `agent:update` | Idempotently request backlog work creation. |
| POST | `/:meetingId/action-items/:itemId/decline` | `agent:update` | Resolve item with a reason. |
| POST | `/:meetingId/cancel` | `agent:update` | Fence new calls and request owner stop; return pending until terminal. |
| GET | `/:meetingId/activity` | `agent:read` | Safe ordered activity. |

## Commands and responses

Every command includes `requestId`; existing-resource commands include `expectedVersion`.
Same actor/project/key and same payload returns the stored authorized outcome. Reuse with
a different payload returns 409. Start and stop return 202 with meeting version and
per-invocation states; they do not promise owner completion. Conversion returns 202 while
pending and provides the same request key for reconciliation. Command lookup reuses the
shared 003 path and its original-actor/current-scope rules; lookup never repeats work.

List pagination uses stable `(updatedAt, id)` ordering and a bounded page size. Summary
fields include ID, topic only when authorized, department, state, participant outcome
counts, creator, and update time. Protected title/body/source text must be omitted if
source access is denied. Activity entries contain actor, time, action, target IDs, and
safe summary only.

## Service boundaries

Meeting service owns meeting transitions and command receipts. It calls:

- An Agents-owned meeting invocation interface from `agents-invocation.md`.
- Public source readers that create and resolve authorized versioned snapshots.
- A public Work use-case interface for create and receipt resolution from
  `work-conversion.md`.
- A directory-owned meeting admission guard under the shared admission fence.

No meeting service imports Agent or Work entities/repositories, queue tables, runtime
prompts, or TypeORM. Services pass `OperationContext` through use-case repository methods.
Agent result events and project push invalidations expose IDs and safe states only; every
event recipient is reauthorized before detail retrieval.

## Error semantics

`400` invalid transition or input; `403` current authority denied; `404` absent or
inaccessible record; `409` stale version, active archive guard, or command-key conflict;
`202` accepted/pending owner or cross-record operation; `503` owner/source service
unavailable before durable acceptance. A post-reservation network failure remains
`unknown` and is resolved through lookup, not converted to a fresh call.

Directory archive conflict responses use `409` and include safe typed blockers with
`kind: 'work' | 'meeting'` and opaque record IDs. They do not include meeting topics,
briefings, contributions, or minutes. The composite guard fails closed if Work or Meeting
guard registration is missing.
