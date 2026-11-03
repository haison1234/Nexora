# Data Model: External Coding Runtime Bridge

**Feature**: `005-ai-department-runtime-bridge`
**Status**: Proposed schema and invariants. No database migration or client implementation has run.

## Records

| Record | Fields | Invariants |
|---|---|---|
| RunnerGrant | id, projectId, runnerId, issuedByUserId, workspaceId, tokenHash, capabilities, expiresAt, revokedAt?, version | Secret is returned once. No token in URLs, logs, prompts, or command-line arguments. Grant authority is bounded by current issuer access. |
| ExternalBindingConfig | id, projectId, runnerId, workspaceId, providerId, providerVersion, enabled, version | Used by the stable binding in 002. Contains references only; provider credentials stay on the runner. |
| ExternalSession | id, projectId, memberId, workId, attemptId, grantId, providerSessionRef?, dispatchKey, phase, lastSequence, lastSeenAt, stopRequestedAt?, version | One session per attempt. Reconnect cannot reserve a fresh attempt. |
| ToolRequest | id, sessionId, attemptId, runnerId, actionHash, safeDescription, protectedActionRef, expiresAt, decision?, decidedBy?, consumedAt?, version | Immutable action context. Expiry is the earlier of ten minutes or provider deadline. One consumed decision per action. |
| RunnerCommand | commandId, sessionId, kind, payloadRef, state, acknowledgedAt? | Command identity survives retries. Follow-up text is protected input, not general activity. |
| RunnerEventReceipt | runnerId, eventId, sessionId, sequence, receivedAt | Dedupe; gaps require snapshots and do not replay controls. |

## State and isolation

Session phase is starting, running, waiting_approval, disconnected, stopping, succeeded, failed, cancelled, or unknown. Disconnected/unknown describe knowledge, not a confirmed process outcome. 003 remains authoritative for business work.

ToolRequest progresses pending -> granted/denied/expired -> consumed when applicable. Revocation, changed action context, workspace mismatch, and old attempts invalidate use. Granting a request is not evidence the runner executed it.

Workspace IDs map to an operator-configured allowlist on the runner. A user cannot supply an arbitrary host path. Grants require explicit expiry with a maximum initial lifetime of one hour; renewal is a new authorized grant.

Runner-side metadata stores local process/container identity, workspace mapping, command receipts, and provider session references. n8n stores only safe references and decision history. General activity never stores full arguments, transcripts, raw prompts, or provider secrets.

## Migration and retention

Department tables use the n8n migration system. Runner-local state uses a separately versioned local store. The control protocol carries its own schema version. Retention follows owner policy, with transcript access remaining on the provider/runner. Revoked grants remain auditable until the existing retention policy permits cleanup.

## Field Conventions

Identifiers are opaque strings and are compared within their project context. Persisted timestamps use the owning database timestamp convention; JSON timestamps use RFC 3339 UTC. Versions and sequences are nonnegative integers; record versions start at 1. Nullable fields use explicit null in responses. Reject unknown command fields and invalid enum values through shared DTO validation.

## C3 executor boundary — Approved 2026-11-03

### Approved executor model amendment

Bind each external session to the C3 attempt and claim generation. Store stop command and owner receipts with monotonic sequence. A disconnected session is unknown. Do not create a new attempt until the prior owner is confirmed stopped. Keep provider transcript and credentials with the runner/provider.
