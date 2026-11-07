# Workflow Capability Bridge: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. Capability configuration, invocation reservation, owner outcome outbox, owner-key acceptance reconciliation, encrypted input staging/resolution, retry linkage, cancellation intent, authority-revocation checks, and authorized result delivery have implementation slices. Recovery before child persistence, native stop proof, and live acceptance remain open. Owner gates remain open.

## User API

All routes also require the project-scoped `agent:*` scope for the operation. Invocation requires current `agent:execute`, `workflow:execute`, caller policy, and credential checks.

Base path: `/rest/projects/:projectId/ai-departments/:departmentId`.

| Method | Path | Required access |
|---|---|---|
| GET | /members/:memberId/capabilities | `agent:read`; safe metadata |
| POST | /members/:memberId/capabilities | `agent:update` plus `workflow:read` |
| PATCH | /members/:memberId/capabilities/:capabilityId | Same configuration scopes; expectedVersion |
| GET | /work/:workId/attempts/:attemptId/invocations | `agent:read`; private execution access checked separately |

Configuration includes workflowId, purpose, publishedVersionRef, inputSchemaFingerprint, and enabled. Require `agent:execute` plus `workflow:execute` and current owner/credential policy at invocation. A publication change requires coordinator revalidation. The input schema comes from the compatible workflow contract, not an arbitrary declaration that bypasses validation. Disabled/unpublished/archived or incompatible workflows cannot be invoked.

## Executor invocation contract, version 1

This is a proposed authenticated service contract, not an anonymous REST webhook.

`invoke({ projectId, memberId, workId, attemptId, capabilityId, capabilityVersion, requestId, inputsRef }, authority)`

Authority comes from the active 003 attempt and current initiating-user policy. External callers also require the scoped grant from 005. The server validates every correlation field against persisted records and applies workflow execution and credential policy.

Within a department attempt, every native workflow-tool dispatch must pass through this selected-capability check, including tools inherited from the saved Agent configuration. The owner adapter constrains that attempt without modifying the shared saved Agent. If it cannot enforce the boundary, department workflow execution stays disabled.

The owner adapter must expose dispatch(invocationKey), lookup(invocationKey), requestStop(ownerExecutionRef), and snapshot(ownerExecutionRef). Native execution persistence stores a deduplication key and supports lookup after duplicate-key rejection. The department reservation stores a stable owner key before dispatch. Agents stages encrypted workflow input against the reserved invocation before dispatch and resolves it only when project, invocation, reference, and input hash match. Agents records child lifecycle outcomes in a durable owner outbox and retries delivery. An owner-key reconciliation path verifies project ID, invocation ID, input hash, and pinned workflow version before acknowledging a retained native execution; it never redispatches an absent or unverifiable key. Lifecycle events preserve the native retry parent reference. AI Department accepts a new execution reference only when the retry points to its current accepted execution, and ignores late events from known superseded executions. Reconciliation polls acknowledged nonterminal child executions through the owner snapshot contract. Agents compares the verified state with the last delivered state and writes changed states to its durable outbox. Repeated polls do not append the same state while its event is pending. Reconciliation rechecks active child authority. If the attempt, claim, member binding, work state, capability, or parent Agent run is no longer valid, it persists a cancellation intent. A persisted cancellation intent must cause reconciliation to retry stop against the exact accepted owner reference. The owner must verify the same project, invocation, input hash, and pinned version before stop. A stop request is not terminal proof; only a later owner lifecycle event or snapshot can confirm the outcome. A native row marked `canceled` while its Bull job remains active, waiting, delayed, or paused is not terminal proof; lookup, stop reconciliation, and snapshots must remain unknown until that job leaves the in-flight queue states. Recovery before native execution persistence, child stop proof, and live verification remain open. Keep invocation disabled until those paths pass their gates.

The caller records acceptance only after Agents confirms the exact execution reference and pinned workflow version. The acceptance record keeps the child state that Agents verified. A queued child stays `pending` until Agents reports that a worker started it.

Return invocationId, dispatchState, childState, and an authorized execution reference. An identical key and input hash returns the original result. A reused key with different input is a 409 conflict. An unknown dispatch outcome triggers reconciliation and cannot start another execution.

## Results and cancellation

Owner outcomes include running, waiting, retrying, succeeded, failed, cancelled, and unknown. Preserve actual execution status and native retry references alongside the normalized state. A `retrying` event records the linked retry execution; a later event records its terminal or waiting state.

Each safe event contains schemaVersion, eventId, projectId, workId, attemptId, invocationId, sequence, occurredAt, and safe result/error reference. Duplicate and old events never trigger another command.

Waiting on a child is not tool approval. Cancellation acknowledgment is not confirmed cancellation. Late results remain linked to the original invocation. Results return to the original executor only if its active context and access still permit delivery. No result bypasses 003 review.

## Error and access behavior

Invalid input or incompatible workflow returns 400 before dispatch. Lack of scope returns 403. Cross-project or inaccessible references return 404. Stale revision, inactive attempt, or identity conflict returns 409. An uncertain outcome is reported as pending reconciliation rather than a confirmed failure.

## C5 Workflow bridge — Approved API amendment

### Approved C5 API amendments

Keep capability configuration and invocation paths in this contract. Invocation is an authenticated owner service call. Derive work identity from owner context. Check `agent:execute`, `workflow:execute` and owner credential policy at dispatch. Owner acceptance must bind the key to the exact approved publication.

G4–G5 block invocation work until owner signatures and recovery behavior are verified.
