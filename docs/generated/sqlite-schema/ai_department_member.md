# ai_department_member

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_member" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "name" varchar(128) NOT NULL, "role" varchar(128) NOT NULL, "managerMemberId" varchar(36), "archived" boolean NOT NULL DEFAULT (false), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), CONSTRAINT "FK_84eb0c6d25f8fe9c0c162709aa9" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE, CONSTRAINT "FK_fa0f5c02be840bec0749cbd91fc" FOREIGN KEY ("managerMemberId") REFERENCES "ai_department_member" ("id") ON DELETE SET NULL)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| archived | boolean | false | false |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| id | varchar(36) |  | false | [ai_department_executor_binding](ai_department_executor_binding.md) [ai_department_executor_binding_revision](ai_department_executor_binding_revision.md) [ai_department_goal](ai_department_goal.md) [ai_department_member](ai_department_member.md) [ai_department_work_attempt](ai_department_work_attempt.md) [ai_department_work_eligibility](ai_department_work_eligibility.md) [ai_department_work_item](ai_department_work_item.md) [ai_department_work_wake_lane](ai_department_work_wake_lane.md) |  |  |
| managerMemberId | varchar(36) |  | true |  | [ai_department_member](ai_department_member.md) |  |
| name | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| role | varchar(128) |  | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (managerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_member_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_98883d6605d592793363a319f4 | CREATE INDEX "IDX_98883d6605d592793363a319f4" ON "ai_department_member" ("projectId", "departmentId")  |
| IDX_ai_department_member_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_member_projectId_id" ON "ai_department_member" ("projectId", "id")  |
| sqlite_autoindex_ai_department_member_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_member" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_executor_binding" |o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_executor_binding_revision" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_goal" }o--o| "ai_department_member" : "FOREIGN KEY (ownerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_member" }o--o| "ai_department_member" : "FOREIGN KEY (managerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_attempt" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_work_eligibility" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_member" : "FOREIGN KEY (assigneeMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_wake_lane" |o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"ai_department_executor_binding" {
  datetime_3_ createdAt
  varchar_36_ executorId
  varchar_36_ memberId PK
  varchar_36_ projectId
  varchar_64_ provider
  datetime_3_ updatedAt
  INTEGER version
}
"ai_department_executor_binding_revision" {
  varchar changedById
  datetime_3_ createdAt
  varchar_36_ executorId
  varchar_36_ id PK
  varchar_36_ memberId FK
  varchar_64_ provider
  INTEGER version
}
"ai_department_goal" {
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  datetime_3_ dueAt
  varchar_36_ id PK
  varchar_36_ ownerMemberId FK
  varchar_36_ parentId FK
  varchar_36_ projectId
  varchar_16_ state
  TEXT successCriteria
  varchar_256_ title
  datetime_3_ updatedAt
  INTEGER version
}
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
"ai_department_work_eligibility" {
  varchar actorId
  INTEGER bindingVersion
  datetime_3_ consumedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  datetime_3_ eligibleAt
  INTEGER generation PK
  INTEGER laneGeneration
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_36_ requestId
  varchar_16_ state
  varchar_36_ workId PK
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
"ai_department_work_wake_lane" {
  INTEGER acknowledgedGeneration
  varchar actorId PK
  INTEGER bindingVersion PK
  datetime_3_ createdAt
  INTEGER generation
  varchar_36_ memberId PK
  varchar_36_ projectId PK
  varchar_16_ state
  datetime_3_ updatedAt
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
