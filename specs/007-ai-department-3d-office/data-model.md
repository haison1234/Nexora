# Data Model: Optional Department Office

**Feature**: `007-ai-department-3d-office`
**Status**: Proposed schema and invariants. No database migration or client implementation has run.

## Display-only models

| Model | Fields | Rules |
|---|---|---|
| OfficeLayout | schemaVersion, departmentId, roomSlots[], memberSlots[] | In-memory display preference in the first release. Positions never change membership or assignment. |
| MemberDisplayState | memberId, departmentId, displayName, roleLabel, availability, workState?, workId?, sourceVersion, updatedAt | Derived only from the authorized 006 snapshot. No transcript or prompt. |
| SceneHealth | renderMode, freshness, reason?, lastSuccessfulReadAt, lastRenderedVersion | Render mode is loading/3d/2d/failed. Freshness is current/stale/disconnected/refreshing and stays independent of rendering. |
| SceneSelection | memberId, workId?, origin | Maps to an existing authorized 006 detail route. Revalidate after snapshots. |
| RendererResources | geometry/material handles, animation callbacks, event listeners | Dispose on teardown, project change, permission loss, and failed initialization. |

## State rules

A visible live character must map to one authorized member. A member may have multiple work references, but the display links to the same current-assignment rules as 006. Do not duplicate or aggregate work into an invented business state.

Remove inaccessible/deleted members after an authoritative refresh. Archived members are omitted from the active scene and remain in authorized history through 2D. A stale source displays last-known data and timestamp; it does not generate activity.

Keep the text roster's update path independent of GPU rendering. Older projection versions cannot replace newer ones. Selected private IDs and renderer labels are cleared on project/access changes.

## Storage

No new database schema, work record, or runtime store is needed. Initial layout preferences are session-local. Durable/shared office customization is outside this feature. No independent renderer state is a source of execution authority.

## Field Conventions

Identifiers are opaque strings and are compared within their project context. Persisted timestamps use the owning database timestamp convention; JSON timestamps use RFC 3339 UTC. Versions and sequences are nonnegative integers; record versions start at 1. Nullable fields use explicit null in responses. Reject unknown command fields and invalid enum values through shared DTO validation.
