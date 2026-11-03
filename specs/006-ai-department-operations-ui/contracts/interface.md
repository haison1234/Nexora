# Operations Interface, Slices A and B: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. Owner gates and implementation remain open; department surfaces are not confirmed implemented.

## Module route contract

Proposed routes live in the n8n project shell:

- `/projects/:projectId/ai-departments/:departmentId/overview`
- `/projects/:projectId/ai-departments/:departmentId/work`
- `/projects/:projectId/ai-departments/:departmentId/work/:workId`
- `/projects/:projectId/ai-departments/:departmentId/people`
- `/projects/:projectId/ai-departments/:departmentId/people/:memberId`
- `/projects/:projectId/ai-departments/:departmentId/activity`

Use globally unique route names with the ai-department prefix and the SDK's module-availability guard. Navigation retains project and selected department. A copied link rechecks access before rendering.

## Projection API

Base: `/rest/projects/:projectId/ai-departments/:departmentId`.

| Method | Path | Access/result |
|---|---|---|
| GET | /operations | `agent:read`; safe versioned snapshot and current allowedActions |
| GET | /activity | `agent:read`; take 1–100, skip, stable occurredAt/id ordering |
| POST | /subscriptions | `agent:read`; bind the authenticated user's pushRef to this project/department |
| DELETE | /subscriptions/:subscriptionId | `agent:read` and subscription owner; remove only this subscription |

Reads check private execution references separately. A general work read does not authorize raw runtime detail. Subscription delivery rechecks current project access; loss of access sends a content-free invalidation or removes the subscription.

Invalidation envelope: schemaVersion, eventId, projectId, departmentId, resourceKind, resourceId, revision. Delivery contains no raw tool arguments or prompts. Add a typed push message and module push handler; do not claim an existing department event type.

## Command and reconnect behavior

Use each owner's mutation routes, scopes, expectedVersion, and requestId. Resolve uncertain commands through GET /rest/projects/:projectId/ai-department-commands/:requestId under the original actor and scopes. Business accept/return buttons never call tool-decision routes. Native approval routes remain with Agents; external approval follows 005.

Disable duplicate submission while pending. On transport timeout show an unknown result. Query the stored command outcome/resource before a retry. An explicit new command requires a new deliberate action. No offline mutation queue is allowed.

Reconnect refetches the current snapshot, queue, and open detail. During a visible page, poll at most every four seconds when push is absent/unhealthy; pause when hidden and refetch on visibility return. The five-second target applies only to healthy push and a visible page. Fallback polling and owner reconciliation have separate measurements.

Use readable 403/404 handling to clear protected data. 409 refreshes current state and preserves unsaved form input for deliberate reapplication. Server allowedActions guide presentation but never replace backend checks.

## Accessibility and localization

All navigation, lists, forms, business review, and enabled executor controls must support keyboard-only use, focus return, and text status. Vietnamese/English use @n8n/i18n. Narrow layouts at 360 CSS pixels use stacked forms and reduced columns without horizontal page scrolling. See design.md for screen and component rules.

## C6 Operations and live updates — Approved API amendment

### Approved C6 API amendments

Add a typed invalidation subscription bound to the authenticated session push reference. Recheck project access before each delivery. A lost-access reset contains no protected IDs. Reconnect and sequence gaps fetch a full snapshot. Keep the four-second visible poll fallback. G6 must close before live push tasks; 006A remains available against settled read/write contracts.
