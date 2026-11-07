# ai_department_meeting

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_meeting" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "createdBy" varchar NOT NULL, "executionActorId" varchar NOT NULL, "topic" varchar(256) NOT NULL, "purpose" varchar(16) NOT NULL DEFAULT ('decision'), "desiredOutcome" text NOT NULL, "state" varchar(16) NOT NULL DEFAULT ('draft'), "facilitatorMemberId" varchar(36) NOT NULL, "goalId" varchar(36), "referencedWorkIds" text NOT NULL, "version" integer NOT NULL DEFAULT (1), "startedAt" datetime(3), "collectionDeadlineAt" datetime(3), "frozenContributionIds" text, "collectionClosedAt" datetime(3), "collectionCloseReason" varchar(16), "absenceSnapshots" text, "completedAt" datetime(3), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), CONSTRAINT "CHK_ai_department_meeting_purpose" CHECK ("purpose" IN ('decision', 'risk-review', 'ideation')), CONSTRAINT "CHK_ai_department_meeting_state" CHECK ("state" IN ('draft', 'collecting', 'synthesizing', 'review', 'approved', 'completed', 'cancelling', 'cancelled')), CONSTRAINT "CHK_ai_department_meeting_collectionCloseReason" CHECK ("collectionCloseReason" IN ('quorum', 'deadline')), CONSTRAINT "FK_b28238adaf018e5cbe0d08a2906" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE, CONSTRAINT "FK_d213566e93880cba2656e4ae3a2" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE, CONSTRAINT "FK_8a447ace0cb35f0ed190362e861" FOREIGN KEY ("facilitatorMemberId") REFERENCES "ai_department_member" ("id") ON DELETE RESTRICT)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| absenceSnapshots | TEXT |  | true |  |  |  |
| collectionCloseReason | varchar(16) |  | true |  |  |  |
| collectionClosedAt | datetime(3) |  | true |  |  |  |
| collectionDeadlineAt | datetime(3) |  | true |  |  |  |
| completedAt | datetime(3) |  | true |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| createdBy | varchar |  | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| desiredOutcome | TEXT |  | false |  |  |  |
| executionActorId | varchar |  | false |  |  |  |
| facilitatorMemberId | varchar(36) |  | false |  | [ai_department_member](ai_department_member.md) |  |
| frozenContributionIds | TEXT |  | true |  |  |  |
| goalId | varchar(36) |  | true |  |  |  |
| id | varchar(36) |  | false | [ai_department_meeting_action_item](ai_department_meeting_action_item.md) [ai_department_meeting_activity](ai_department_meeting_activity.md) [ai_department_meeting_context](ai_department_meeting_context.md) [ai_department_meeting_contribution](ai_department_meeting_contribution.md) [ai_department_meeting_decision](ai_department_meeting_decision.md) [ai_department_meeting_invocation](ai_department_meeting_invocation.md) [ai_department_meeting_minutes](ai_department_meeting_minutes.md) [ai_department_meeting_participant](ai_department_meeting_participant.md) [ai_department_meeting_source](ai_department_meeting_source.md) |  |  |
| projectId | varchar(36) |  | false |  | [project](project.md) |  |
| purpose | varchar(16) | 'decision' | false |  |  |  |
| referencedWorkIds | TEXT |  | false |  |  |  |
| startedAt | datetime(3) |  | true |  |  |  |
| state | varchar(16) | 'draft' | false |  |  |  |
| topic | varchar(256) |  | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - | CHECK | CHECK ("purpose" IN ('decision', 'risk-review', 'ideation')) |
| - | CHECK | CHECK ("state" IN ('draft', 'collecting', 'synthesizing', 'review', 'approved', 'completed', 'cancelling', 'cancelled')) |
| - | CHECK | CHECK ("collectionCloseReason" IN ('quorum', 'deadline')) |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (facilitatorMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 2) | FOREIGN KEY | FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_meeting_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_b8f5cf8595888d82cd522285a3 | CREATE INDEX "IDX_b8f5cf8595888d82cd522285a3" ON "ai_department_meeting" ("projectId", "departmentId", "state", "updatedAt")  |
| sqlite_autoindex_ai_department_meeting_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_meeting" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting" }o--|| "ai_department_member" : "FOREIGN KEY (facilitatorMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_meeting_action_item" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_activity" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_context" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_contribution" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_decision" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_invocation" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_minutes" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_participant" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_source" }o--|| "ai_department_meeting" : "FOREIGN KEY (meetingId) REFERENCES ai_department_meeting (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting" }o--|| "project" : "FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"ai_department" {
  boolean archived
  datetime_3_ createdAt
  TEXT description
  varchar_36_ id PK
  varchar_128_ name
  varchar_128_ normalizedName
  varchar_36_ projectId FK
  INTEGER projectionSequence
  datetime_3_ updatedAt
  INTEGER version
}
"ai_department_member" {
  boolean archived
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  TEXT expertiseTags
  varchar_36_ id PK
  varchar_36_ managerMemberId FK
  varchar_128_ name
  varchar_36_ projectId
  varchar_128_ role
  datetime_3_ updatedAt
  INTEGER version
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
"ai_department_meeting_activity" {
  varchar_128_ action
  varchar actorId
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ meetingId FK
  INTEGER meetingVersion
  varchar_36_ projectId
  varchar_64_ state
  varchar_512_ summary
  varchar_36_ targetId
}
"ai_department_meeting_context" {
  varchar_64_ briefingHash
  datetime_3_ capturedAt
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ projectId
  varchar_255_ snapshotRef
  varchar_32_ toolPolicy
  varchar_64_ toolPolicyVersion
}
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
"ai_department_meeting_source" {
  varchar_16_ accessState
  varchar_64_ contentHash
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_256_ labelSnapshot
  varchar_36_ meetingId FK
  varchar_36_ projectId
  varchar_255_ snapshotRef
  varchar_36_ sourceId
  varchar_16_ sourceKind
  varchar_64_ sourceVersion
}
"project" {
  datetime_3_ createdAt
  varchar creatorId FK
  TEXT customTelemetryTags
  varchar_512_ description
  TEXT icon
  varchar_36_ id PK
  varchar_255_ name
  varchar_36_ type
  datetime_3_ updatedAt
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
