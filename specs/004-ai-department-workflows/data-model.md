# Data Model: Workflow Capability Bridge

**Feature**: `004-ai-department-workflows`
**Status**: Proposed schema and invariants. No database migration or client implementation has run.

## Records

| Record | Fields | Invariants |
|---|---|---|
| WorkflowCapability | id, projectId, memberId, workflowId, purpose, inputSchemaRef, enabled, version, timestamps | Same project; selection grants no execution permission. Pin published version and input-schema identity. Publication changes require revalidation before future invocations. |
| WorkflowInvocation | id, projectId, workId, attemptId, memberId, capabilityId, capabilityVersion, requestId, inputHash, ownerExecutionRef?, resolvedWorkflowVersion?, dispatchState, childState, version, timestamps | Unique attemptId/requestId. Match the current attempt and selected capability before dispatch. |
| InvocationReceipt | invocationId, ownerEventId, ownerSequence, receivedAt | Duplicate events are no-ops. Old-attempt results cannot update current work. |

## State rules

Dispatch state is pending, acknowledged, unknown, or rejected. Child state is pending, running, waiting, retrying, succeeded, failed, cancelled, or unknown. These are projections of n8n-owned state, not a new execution engine.

Store input references in owner-authorized storage, not in general activity. Persist invocation-key intent before dispatch. The owner must durably accept and locate the same key. A new request ID means a deliberate new invocation and requires current attempt access.

Keep cancellation-request time separate from child outcome. Native retries keep their native execution linkage. Workflow success does not directly mark a business work item done.

## Schema and ownership

Add capability/invocation tables under the department persistence directory and use database migrations. No copied credentials, workflow graph, prompts, or full result payloads are stored here. Execution/result retention remains with n8n; unavailable references produce an unavailable label.

## Field Conventions

Identifiers are opaque strings and are compared within their project context. Persisted timestamps use the owning database timestamp convention; JSON timestamps use RFC 3339 UTC. Versions and sequences are nonnegative integers; record versions start at 1. Nullable fields use explicit null in responses. Reject unknown command fields and invalid enum values through shared DTO validation.

## C5 Workflow bridge — Approved 2026-11-03

### Approved C5 model amendments

Capability revisions pin publication, trigger compatibility and input schema identity. Invocation records pin attempt, claim generation, capability revision, idempotency key, expected/actual workflow version and owner execution reference. Owner receipts order child state. Keep full payloads and credentials with n8n owners.

The model is approved. Exact-version acceptance and stop propagation remain open under G4–G5.
