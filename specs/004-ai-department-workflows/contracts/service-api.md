# Workflow Capability Bridge: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. Owner gates and implementation remain open; department surfaces are not confirmed implemented.

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

The owner adapter must expose dispatch(invocationKey), lookup(invocationKey), requestStop(ownerExecutionRef), and snapshot(ownerExecutionRef). Native acceptance must persist the invocation key with execution acceptance. Until that mapping exists, invocation stays disabled.

Return invocationId, dispatchState, childState, and an authorized execution reference. An identical key and input hash returns the original result. A reused key with different input is a 409 conflict. An unknown dispatch outcome triggers reconciliation and cannot start another execution.

## Results and cancellation

Owner outcomes include running, waiting, retrying, succeeded, failed, cancelled, and unknown. Preserve actual execution status and native retry references alongside the normalized state.

Each safe event contains schemaVersion, eventId, projectId, workId, attemptId, invocationId, sequence, occurredAt, and safe result/error reference. Duplicate and old events never trigger another command.

Waiting on a child is not tool approval. Cancellation acknowledgment is not confirmed cancellation. Late results remain linked to the original invocation. Results return to the original executor only if its active context and access still permit delivery. No result bypasses 003 review.

## Error and access behavior

Invalid input or incompatible workflow returns 400 before dispatch. Lack of scope returns 403. Cross-project or inaccessible references return 404. Stale revision, inactive attempt, or identity conflict returns 409. An uncertain outcome is reported as pending reconciliation rather than a confirmed failure.

## C5 Workflow bridge — Approved API amendment

### Approved C5 API amendments

Keep capability configuration and invocation paths in this contract. Invocation is an authenticated owner service call. Derive work identity from owner context. Check `agent:execute`, `workflow:execute` and owner credential policy at dispatch. Owner acceptance must bind the key to the exact approved publication.

G4–G5 block invocation work until owner signatures and recovery behavior are verified.
