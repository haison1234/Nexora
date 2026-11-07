# ai_department_meeting_minutes

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_meeting_minutes" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "meetingId" varchar(36) NOT NULL, "revision" integer NOT NULL, "state" varchar(16) NOT NULL DEFAULT ('draft'), "summary" text NOT NULL, "sourceContributionIds" text NOT NULL, "disagreements" text NOT NULL, "authoredBy" varchar NOT NULL, "approvedBy" varchar, "approvedAt" datetime(3), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), CONSTRAINT "CHK_ai_department_meeting_minutes_state" CHECK ("state" IN ('draft', 'approved')), CONSTRAINT "FK_1f619caf8a4e889327368a4daf6" FOREIGN KEY ("meetingId") REFERENCES "ai_department_meeting" ("id") ON DELETE CASCADE)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| approvedAt | datetime(3) |  | true |  |  |  |
| approvedBy | varchar |  | true |  |  |  |
| authoredBy | varchar |  | false |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| disagreements | TEXT |  | false |  |  |  |
| id | varchar(36) |  | false | [ai_department_meeting_action_item](ai_department_meeting_action_item.md) [ai_department_meeting_decision](ai_department_meeting_decision.md) |  |  |
| meetingId | varchar(36) |  | false |  | [ai_department_meeting](ai_department_meeting.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| revision | INTEGER |  | false |  |  |  |
| sourceContributionIds | TEXT |  | false |  |  |  |
| state | varchar(16) | 'draft' | false |  |  |  |
| summary | TEXT |  | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - | CHECK | CHECK ("state" IN ('draft', 'approved')) |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_meeting_minutes_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_6bff6f4fe7ef7470c4c48dff80 | CREATE UNIQUE INDEX "IDX_6bff6f4fe7ef7470c4c48dff80" ON "ai_department_meeting_minutes" ("meetingId", "revision")  |
| IDX_c581979371ed89c49cbfaafd46 | CREATE INDEX "IDX_c581979371ed89c49cbfaafd46" ON "ai_department_meeting_minutes" ("projectId", "meetingId", "state")  |
| sqlite_autoindex_ai_department_meeting_minutes_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_meeting_action_item" }o--|| "ai_department_meeting_minutes" : "FOREIGN KEY (minutesId) REFERENCES ai_department_meeting_minutes (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_decision" }o--|| "ai_department_meeting_minutes" : "FOREIGN KEY (minutesId) REFERENCES ai_department_meeting_minutes (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_minutes" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

"ai_department_meeting_minutes" {
  datetime_3_ approvedAt
  varchar approvedBy
  varchar authoredBy
  datetime_3_ createdAt
  varchar_36_ departmentId
  TEXT disagreements
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ projectId
  INTEGER revision
  TEXT sourceContributionIds
  varchar_16_ state
  TEXT summary
  datetime_3_ updatedAt
}
"ai_department_meeting_action_item" {
  datetime_3_ approvedAt
  varchar approvedBy
  varchar_36_ assigneeMemberId FK
  varchar_36_ conversionRequestId
  datetime_3_ createdAt
  varchar_36_ departmentId
  TEXT description
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ minutesId FK
  varchar_64_ payloadHash
  varchar_36_ projectId
  TEXT resolutionReason
  datetime_3_ resolvedAt
  TEXT sourceContributionIds
  varchar_24_ state
  varchar_256_ title
  datetime_3_ updatedAt
  varchar_36_ workId
}
"ai_department_meeting_decision" {
  datetime_3_ approvedAt
  varchar approvedBy
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ minutesId FK
  varchar_36_ projectId
  TEXT sourceContributionIds
  varchar_16_ state
  TEXT text
  datetime_3_ updatedAt
}
"ai_department_meeting" {
  TEXT absenceSnapshots
  varchar_16_ collectionCloseReason
  datetime_3_ collectionClosedAt
  datetime_3_ collectionDeadlineAt
  datetime_3_ completedAt
  datetime_3_ createdAt
  varchar createdBy
  varchar_36_ departmentId FK
  TEXT desiredOutcome
  varchar executionActorId
  varchar_36_ facilitatorMemberId FK
  TEXT frozenContributionIds
  varchar_36_ goalId
  varchar_36_ id PK
  varchar_36_ projectId FK
  varchar_16_ purpose
  TEXT referencedWorkIds
  datetime_3_ startedAt
  varchar_16_ state
  varchar_256_ topic
  datetime_3_ updatedAt
  INTEGER version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
