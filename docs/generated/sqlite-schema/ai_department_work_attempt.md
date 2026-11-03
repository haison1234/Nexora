# ai_department_work_attempt

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_work_attempt" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "workId" varchar(36) NOT NULL, "ordinal" integer NOT NULL, "initiatingUserId" varchar NOT NULL, "memberId" varchar(36) NOT NULL, "bindingVersion" integer NOT NULL, "provider" varchar(64) NOT NULL, "executorId" varchar(36) NOT NULL, "reviewPolicy" varchar(16) NOT NULL, "dispatchKey" varchar(36) NOT NULL, "ownerExecutionRef" varchar(255), "phase" varchar(16) NOT NULL DEFAULT ('dispatching'), "outcome" varchar(16), "resultReference" varchar(255), "safeSummary" text, "startedAt" datetime(3), "finishedAt" datetime(3), "cancelRequestedAt" datetime(3), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "lastOwnerSequence" varchar(20) NOT NULL DEFAULT ('0'), "cancelRequestId" varchar(36), CONSTRAINT "FK_b60f947d4504eb8a209ccfde774" FOREIGN KEY ("memberId") REFERENCES "ai_department_member" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_5309258bca2a1c885c316032c0c" FOREIGN KEY ("workId") REFERENCES "ai_department_work_item" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| bindingVersion | INTEGER |  | false |  |  |  |
| cancelRequestId | varchar(36) |  | true |  |  |  |
| cancelRequestedAt | datetime(3) |  | true |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| dispatchKey | varchar(36) |  | false |  |  |  |
| executorId | varchar(36) |  | false |  |  |  |
| finishedAt | datetime(3) |  | true |  |  |  |
| id | varchar(36) |  | false | [ai_department_work_claim](ai_department_work_claim.md) [ai_department_work_dispatch_intent](ai_department_work_dispatch_intent.md) [ai_department_work_item](ai_department_work_item.md) [ai_department_work_owner_event_receipt](ai_department_work_owner_event_receipt.md) [ai_department_work_review_decision](ai_department_work_review_decision.md) [ai_department_work_transition](ai_department_work_transition.md) |  |  |
| initiatingUserId | varchar |  | false |  |  |  |
| lastOwnerSequence | varchar(20) | '0' | false |  |  |  |
| memberId | varchar(36) |  | false |  | [ai_department_member](ai_department_member.md) |  |
| ordinal | INTEGER |  | false |  |  |  |
| outcome | varchar(16) |  | true |  |  |  |
| ownerExecutionRef | varchar(255) |  | true |  |  |  |
| phase | varchar(16) | 'dispatching' | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| provider | varchar(64) |  | false |  |  |  |
| resultReference | varchar(255) |  | true |  |  |  |
| reviewPolicy | varchar(16) |  | false |  |  |  |
| safeSummary | TEXT |  | true |  |  |  |
| startedAt | datetime(3) |  | true |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| workId | varchar(36) |  | false |  | [ai_department_work_item](ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_work_attempt_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_2d26d020c5e04c2feb6496e220 | CREATE INDEX "IDX_2d26d020c5e04c2feb6496e220" ON "ai_department_work_attempt" ("projectId", "ownerExecutionRef")  |
| IDX_8db4b87f1e4763acda979f491e | CREATE UNIQUE INDEX "IDX_8db4b87f1e4763acda979f491e" ON "ai_department_work_attempt" ("dispatchKey")  |
| IDX_ai_department_work_attempt_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_work_attempt_projectId_id" ON "ai_department_work_attempt" ("projectId", "id")  |
| IDX_ai_department_work_attempt_workId | CREATE UNIQUE INDEX "IDX_ai_department_work_attempt_workId" ON "ai_department_work_attempt" ("workId") WHERE "phase" IN ('dispatching', 'active', 'suspended') |
| IDX_cd463cb86ef4858e2594a516ed | CREATE UNIQUE INDEX "IDX_cd463cb86ef4858e2594a516ed" ON "ai_department_work_attempt" ("workId", "ordinal")  |
| sqlite_autoindex_ai_department_work_attempt_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_work_claim" }o--|| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_dispatch_intent" |o--|| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_work_attempt" : "FOREIGN KEY (currentAttemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_owner_event_receipt" }o--|| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_decision" }o--|| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_work_transition" }o--o| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_attempt" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_work_attempt" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

"ai_department_work_attempt" {
  INTEGER bindingVersion
  varchar_36_ cancelRequestId
  datetime_3_ cancelRequestedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ dispatchKey
  varchar_36_ executorId
  datetime_3_ finishedAt
  varchar_36_ id PK
  varchar initiatingUserId
  varchar_20_ lastOwnerSequence
  varchar_36_ memberId FK
  INTEGER ordinal
  varchar_16_ outcome
  varchar_255_ ownerExecutionRef
  varchar_16_ phase
  varchar_36_ projectId
  varchar_64_ provider
  varchar_255_ resultReference
  varchar_16_ reviewPolicy
  TEXT safeSummary
  datetime_3_ startedAt
  datetime_3_ updatedAt
  varchar_36_ workId FK
}
"ai_department_work_claim" {
  varchar_36_ attemptId FK
  datetime_3_ claimedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ executionId
  varchar_36_ id PK
  datetime_3_ leaseUntil
  varchar_36_ memberId
  varchar_36_ projectId
  datetime_3_ releasedAt
  varchar_36_ workId FK
}
"ai_department_work_dispatch_intent" {
  varchar_255_ acknowledgmentReference
  varchar_36_ attemptId PK
  datetime_3_ createdAt
  varchar_64_ inputHash
  datetime_3_ leaseUntil
  varchar_36_ projectId
  varchar_36_ requestId
  varchar_16_ state
  datetime_3_ updatedAt
}
"ai_department_work_item" {
  varchar_36_ assigneeMemberId FK
  datetime_3_ createdAt
  varchar_36_ currentAttemptId FK
  varchar_36_ departmentId FK
  datetime_3_ dueAt
  varchar_36_ goalId FK
  varchar_36_ id PK
  TEXT instruction
  varchar_16_ priority
  varchar_36_ projectId
  varchar_16_ reviewPolicy
  varchar_24_ state
  datetime_3_ updatedAt
  INTEGER version
}
"ai_department_work_owner_event_receipt" {
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ id PK
  varchar_32_ kind
  datetime_3_ occurredAt
  varchar_255_ ownerEventId
  varchar_36_ projectId
  varchar_64_ provider
  datetime_3_ receivedAt
  TEXT safeSummary
  INTEGER schemaVersion
  varchar_20_ sequence
  datetime_3_ updatedAt
  varchar_36_ workId FK
}
"ai_department_work_review_decision" {
  varchar actorId
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_16_ decision
  varchar_36_ departmentId
  varchar_36_ id PK
  INTEGER priorVersion
  varchar_36_ projectId
  TEXT reason
  varchar_36_ workId FK
}
"ai_department_work_transition" {
  varchar_36_ actorId
  varchar_16_ actorKind
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_24_ fromState
  varchar_36_ id PK
  varchar_36_ projectId
  TEXT reason
  varchar_24_ toState
  varchar_36_ workId FK
  INTEGER workVersion
}
"ai_department_member" {
  boolean archived
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_36_ managerMemberId FK
  varchar_128_ name
  varchar_36_ projectId
  varchar_128_ role
  datetime_3_ updatedAt
  INTEGER version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
