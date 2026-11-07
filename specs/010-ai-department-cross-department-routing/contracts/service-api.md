# Service Contract: AI Department Cross-Department Routing

**Status**: Proposed internal and UI-facing contract. Route names and DTO shape require confirmation against the implementation base.

## Authorization

- Reads require project `agent:read`.
- Referral requires a person with project `agent:update`.
- Agents cannot refer Work.
- Every request resolves the project and checks current access on the server. UI visibility is not authorization.

## Suggest departments

`GET /projects/:projectId/ai-departments/:sourceDepartmentId/work-routing-suggestions`

**Query**: `text` (request instruction; bounded to the Work instruction limit).

**Response**:

```json
{
  "hasMatch": true,
  "suggestions": [
    {
      "departmentId": "uuid",
      "departmentName": "Research",
      "score": 6,
      "reason": "Matches expertise: data analysis; description: research"
    }
  ]
}
```

Include every active department except the source, including departments with no matching data. Sort by score descending, then department name, then ID. Set `hasMatch` to false when all scores are zero and return the eligible list in deterministic order. Return an empty list and `hasMatch: false` when no eligible department exists. The suggestion call is deterministic and does not call a language model.

## Create referral

`POST /projects/:projectId/ai-departments/:sourceDepartmentId/work/:sourceWorkId/referrals`

**Request**:

```json
{
  "receivingDepartmentId": "uuid",
  "expectedVersion": 4,
  "requestId": "uuid"
}
```

The server obtains instruction, priority, due date, and source goal snapshot from the current source Work after validating `expectedVersion`. It creates one receiving Work item in `backlog`. The current receiver review policy applies. The server does not copy source result or activity data.

**Successful response**:

```json
{
  "link": {
    "id": "uuid",
    "sourceWorkId": "uuid",
    "receivingWorkId": "uuid",
    "sourceDepartmentId": "uuid",
    "receivingDepartmentId": "uuid",
    "chainRootWorkId": "uuid",
    "state": "open",
    "sourceTitleSnapshot": "Short source title",
    "sourceGoalTitleSnapshot": null,
    "sourceDepartmentNameSnapshot": "Research",
    "receivingDepartmentNameSnapshot": "Engineering"
  },
  "receivingWork": {
    "id": "uuid",
    "state": "backlog",
    "version": 1
  },
  "replayed": false
}
```

The first successful call writes one receipt, Work item, link, and activity entry on each side. Replay with the same project, actor, request ID, operation, and canonical payload hash returns the stored result. Reuse of the identity with another operation or payload returns conflict.

## Link reads

Authorized department Work detail exposes the direct link and its snapshots. The source view shows the receiving department, Work item, direct state, and safe summary when done. The receiving view shows source department and title. Do not expose report, comment, or help content from another item through the link. A downstream report is not copied to an ancestor.

## Errors

| Condition | Result |
|---|---|
| Missing project read/update scope | Forbidden; no write |
| Missing item or department | Not found under the existing project-scoped response policy |
| Stale `expectedVersion` | Conflict; no receiving item or link |
| Source state, active attempt, pending result/review, child Work, or open referral invalidates referral | Conflict; no write |
| Receiver is archived, same as source, or chain violates one-item-per-department rule | Conflict; no write |
| Request identity has another operation or payload hash | Conflict; no write |
| Referral transaction fails | Roll back receipt, Work, link, activity, and wake changes |

## Live updates

Each committed projection change increments the affected department revision. Send an `aiDepartmentOperationsUpdated` invalidation for each affected department after commit. A client refreshes its authorized department snapshot and applies the returned revision. Follow the timing and stale/disconnected behavior in Spec 006. Do not put instructions, reports, or credentials in the push event.
