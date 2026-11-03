# Data Model: Operations Interface, Slices A and B

**Feature**: `006-ai-department-operations-ui`
**Status**: Proposed schema and invariants. No database migration or client implementation has run.

## Read models and client state

| Model | Fields | Ownership |
|---|---|---|
| OperationsSnapshot | projectId, departmentId, revision, generatedAt, attention[], activeWork[], ownership[], recentActivity[], allowedActions | Authorized backend projection of 002/003/004 records |
| AttentionItem | id, kind, workId?, attemptId?, ownerRef?, safeTitle, reason, allowedAction | Blocked, failed, review, or tool request. Tool and business review remain distinct. |
| ActivityEntry | id, actorSummary, targetRef, changeKind, occurredAt, safeSummary | Projection of DirectoryChange, WorkTransition, review, and safe invocation/session metadata. No prompt, transcript, secret, or tool argument. |
| QueueQuery | states[], assigneeId?, goalId?, text?, take, skip, sort | URL-backed filter and paging state; keep the active filter visible |
| ResourceCache | userId, projectId, departmentId, resourceId, version, fetchedAt | Replaceable authorized memory cache |
| CommandState | requestId, expectedVersion, pending/acknowledged/unknown/rejected, resourceRef | Never replay an unknown command under a fresh ID |
| ViewFreshness | current/stale/disconnected/refreshing, lastSuccessfulReadAt | Distinct from member availability and work state |

## Invariants

- Mutations use the contracts from 002/003/004/005. Client status is never the business source of truth.
- Ignore older resource versions; reconcile sequence gaps and reconnect with fresh snapshots.
- Change of user/project, logout, access denial, or revoked subscription clears protected cache and selected detail.
- An invalidation contains safe IDs only and triggers an authorized read; it does not carry private execution payloads.
- Do not persist protected work data in localStorage. Use the existing app policy for harmless display preferences.
- The snapshot revision is the department projection sequence allocated transactionally by 003. Read a consistent snapshot or retry if its sequence changes during assembly. No new business tables are required. Only server read projections/subscription state are added; durable business history remains owned by prior features.

## Field Conventions

Identifiers are opaque strings and are compared within their project context. Persisted timestamps use the owning database timestamp convention; JSON timestamps use RFC 3339 UTC. Versions and sequences are nonnegative integers; record versions start at 1. Nullable fields use explicit null in responses. Reject unknown command fields and invalid enum values through shared DTO validation.

## C6 Operations and live updates — Approved 2026-11-03

### Approved C6 model amendments

Use Department `projectionSequence` as the snapshot revision. Allocate it transactionally for every visible C1–C5 mutation. Cache by user, project and department. Invalidation messages carry safe resource references and revision; they trigger reads and never carry commands or private payloads. No replay cursor is required in v1.
