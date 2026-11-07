# ai_department_meeting_contribution

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_meeting_contribution" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "meetingId" varchar(36) NOT NULL, "participantId" varchar(36) NOT NULL, "invocationId" varchar(36) NOT NULL, "contribution" text NOT NULL, "sourceContributionIds" text NOT NULL, "acceptedAt" datetime(3) NOT NULL, "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), CONSTRAINT "FK_582c9d2b071d59a3c2323c533ad" FOREIGN KEY ("meetingId") REFERENCES "ai_department_meeting" ("id") ON DELETE CASCADE, CONSTRAINT "FK_e28a2d62fbbaf976bbaab52bcaf" FOREIGN KEY ("participantId") REFERENCES "ai_department_meeting_participant" ("id") ON DELETE CASCADE, CONSTRAINT "FK_c6784c2453dbe66c77d9dd8123e" FOREIGN KEY ("invocationId") REFERENCES "ai_department_meeting_invocation" ("id") ON DELETE CASCADE)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| acceptedAt | datetime(3) |  | false |  |  |  |
| contribution | TEXT |  | false |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| id | varchar(36) |  | false |  |  |  |
| invocationId | varchar(36) |  | false |  | [ai_department_meeting_invocation](ai_department_meeting_invocation.md) |  |
| meetingId | varchar(36) |  | false |  | [ai_department_meeting](ai_department_meeting.md) |  |
| participantId | varchar(36) |  | false |  | [ai_department_meeting_participant](ai_department_meeting_participant.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| sourceContributionIds | TEXT |  | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (invocationId) REFERENCES ai_department_meeting_invocation (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (participantId) REFERENCES ai_department_meeting_participant (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 2) | FOREIGN KEY | FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_meeting_contribution_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_a9e22fdc440fb1fd00dd9f3d9d | CREATE INDEX "IDX_a9e22fdc440fb1fd00dd9f3d9d" ON "ai_department_meeting_contribution" ("projectId", "meetingId")  |
| IDX_c6784c2453dbe66c77d9dd8123 | CREATE UNIQUE INDEX "IDX_c6784c2453dbe66c77d9dd8123" ON "ai_department_meeting_contribution" ("invocationId")  |
| IDX_e28a2d62fbbaf976bbaab52bca | CREATE UNIQUE INDEX "IDX_e28a2d62fbbaf976bbaab52bca" ON "ai_department_meeting_contribution" ("participantId")  |
| sqlite_autoindex_ai_department_meeting_contribution_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_meeting_contribution" }o--|| "ai_department_meeting_invocation" : "FOREIGN KEY (invocationId) REFERENCES ai_department_meeting_invocation (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_contribution" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_contribution" }o--|| "ai_department_meeting_participant" : "FOREIGN KEY (participantId) REFERENCES ai_department_meeting_participant (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

"ai_department_meeting_contribution" {
  datetime_3_ acceptedAt
  TEXT contribution
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ invocationId FK
  varchar_36_ meetingId FK
  varchar_36_ participantId FK
  varchar_36_ projectId
  TEXT sourceContributionIds
}
"ai_department_meeting_invocation" {
  varchar actorId
  INTEGER bindingVersion
  varchar_255_ contextRef
  datetime_3_ createdAt
  datetime_3_ deadlineAt
  varchar_36_ departmentId
  varchar_36_ executorId
  varchar_36_ id PK
  varchar_64_ inputHash
  varchar_16_ kind
  varchar_36_ meetingId FK
  varchar_36_ memberId FK
  varchar_255_ ownerInvocationRef
  varchar_64_ ownerSequence
  varchar_36_ participantId FK
  varchar_36_ projectId
  varchar_64_ requestKey
  varchar_36_ retryOfInvocationId FK
  varchar_64_ safeFailureCode
  varchar_512_ safeFailureSummary
  varchar_16_ state
  varchar_36_ stopCommandId
  datetime_3_ terminalAt
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
"ai_department_meeting_participant" {
  INTEGER bindingVersion
  datetime_3_ createdAt
  varchar_36_ departmentId
  TEXT exclusionReason
  varchar_36_ executorId
  boolean facilitator
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ memberId FK
  varchar_128_ memberNameSnapshot
  varchar_36_ projectId
  varchar_16_ responseState
  varchar_128_ roleSnapshot
  datetime_3_ updatedAt
  INTEGER version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
