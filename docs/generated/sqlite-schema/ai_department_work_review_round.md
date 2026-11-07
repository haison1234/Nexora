# ai_department_work_review_round

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_work_review_round" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "workId" varchar(36) NOT NULL, "attemptId" varchar(36) NOT NULL, "resultId" varchar(36) NOT NULL, "requesterKind" varchar(16) NOT NULL, "requesterId" varchar NOT NULL, "policyRevisionId" varchar(36), "activeStageId" varchar(64), "ordinal" integer NOT NULL, "status" varchar(16) NOT NULL, "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL, "closedAt" datetime(3), CONSTRAINT "CHK_ai_department_work_review_round_requesterKind" CHECK ("requesterKind" IN ('user')), CONSTRAINT "CHK_ai_department_work_review_round_status" CHECK ("status" IN ('open', 'accepted', 'returned', 'reopened')), CONSTRAINT "FK_eb0b4abfb12cf4ee87c399974fa" FOREIGN KEY ("workId") REFERENCES "ai_department_work_item" ("id") ON DELETE CASCADE, CONSTRAINT "FK_379061c674004637ddba7597a76" FOREIGN KEY ("attemptId") REFERENCES "ai_department_work_attempt" ("id") ON DELETE CASCADE, CONSTRAINT "FK_638c2ddcd7999f652940a56ab18" FOREIGN KEY ("resultId") REFERENCES "ai_department_work_submitted_result" ("id") ON DELETE CASCADE, CONSTRAINT "FK_0807d77e959e57e48ddccca88dc" FOREIGN KEY ("policyRevisionId") REFERENCES "ai_department_work_review_policy_revision" ("id") ON DELETE SET NULL)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| activeStageId | varchar(64) |  | true |  |  |  |
| attemptId | varchar(36) |  | false |  | [ai_department_work_attempt](ai_department_work_attempt.md) |  |
| closedAt | datetime(3) |  | true |  |  |  |
| createdAt | datetime(3) |  | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| id | varchar(36) |  | false | [ai_department_work_review_stage_decision](ai_department_work_review_stage_decision.md) |  |  |
| ordinal | INTEGER |  | false |  |  |  |
| policyRevisionId | varchar(36) |  | true |  | [ai_department_work_review_policy_revision](ai_department_work_review_policy_revision.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| requesterId | varchar |  | false |  |  |  |
| requesterKind | varchar(16) |  | false |  |  |  |
| resultId | varchar(36) |  | false |  | [ai_department_work_submitted_result](ai_department_work_submitted_result.md) |  |
| status | varchar(16) |  | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |
| workId | varchar(36) |  | false |  | [ai_department_work_item](ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - | CHECK | CHECK ("requesterKind" IN ('user')) |
| - | CHECK | CHECK ("status" IN ('open', 'accepted', 'returned', 'reopened')) |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (policyRevisionId) REFERENCES ai_department_work_review_policy_revision (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (resultId) REFERENCES ai_department_work_submitted_result (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 2) | FOREIGN KEY | FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 3) | FOREIGN KEY | FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_work_review_round_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_work_review_round_attemptId | CREATE UNIQUE INDEX "IDX_ai_department_work_review_round_attemptId" ON "ai_department_work_review_round" ("attemptId")  |
| IDX_ai_department_work_review_round_workId_ordinal | CREATE UNIQUE INDEX "IDX_ai_department_work_review_round_workId_ordinal" ON "ai_department_work_review_round" ("workId", "ordinal")  |
| sqlite_autoindex_ai_department_work_review_round_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_work_review_round" }o--|| "ai_department_work_attempt" : "FOREIGN KEY (attemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_stage_decision" }o--|| "ai_department_work_review_round" : "FOREIGN KEY (roundId) REFERENCES ai_department_work_review_round (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_round" }o--o| "ai_department_work_review_policy_revision" : "FOREIGN KEY (policyRevisionId) REFERENCES ai_department_work_review_policy_revision (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_review_round" }o--|| "ai_department_work_submitted_result" : "FOREIGN KEY (resultId) REFERENCES ai_department_work_submitted_result (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_round" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

"ai_department_work_review_round" {
  varchar_64_ activeStageId
  varchar_36_ attemptId FK
  datetime_3_ closedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  INTEGER ordinal
  varchar_36_ policyRevisionId FK
  varchar_36_ projectId
  varchar requesterId
  varchar_16_ requesterKind
  varchar_36_ resultId FK
  varchar_16_ status
  INTEGER version
  varchar_36_ workId FK
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
  INTEGER reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  datetime_3_ reviewRoundClosedAt
  varchar_36_ reviewRoundId
  varchar_16_ reviewRoundStatus
  TEXT reviewStagesJson
  TEXT safeSummary
  datetime_3_ startedAt
  varchar_36_ submittedResultId
  datetime_3_ updatedAt
  varchar_36_ workId FK
  TEXT workflowCapabilitiesJson
  TEXT workflowIdsJson
}
"ai_department_work_review_stage_decision" {
  varchar actorId
  varchar_16_ actorKind
  varchar_36_ commandId
  datetime_3_ createdAt
  varchar_16_ decision
  varchar_36_ departmentId
  varchar_36_ id PK
  INTEGER priorVersion
  varchar_36_ projectId
  TEXT reason
  varchar_36_ resultId FK
  varchar_36_ roundId FK
  varchar_64_ stageId
  varchar_36_ workId
}
"ai_department_work_review_policy_revision" {
  datetime_3_ createdAt
  varchar createdByUserId
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_16_ mode
  varchar_36_ projectId
  INTEGER revision
  TEXT stagesJson
  varchar_36_ workId FK
}
"ai_department_work_submitted_result" {
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ projectId
  varchar_255_ reference
  TEXT safeSummary
  datetime_3_ submittedAt
  varchar submittedByUserId
  datetime_3_ updatedAt
  varchar_36_ workId FK
}
"ai_department_work_item" {
  varchar_36_ assignedByUserId FK
  varchar_36_ assigneeMemberId FK
  datetime_3_ createdAt
  varchar_36_ currentAttemptId FK
  INTEGER currentReviewStageIndex
  varchar_36_ departmentId FK
  datetime_3_ dueAt
  varchar_36_ goalId FK
  varchar_36_ id PK
  TEXT instruction
  varchar_16_ priority
  varchar_36_ projectId
  varchar_16_ reviewPolicy
  INTEGER reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  TEXT reviewStagesJson
  varchar_24_ state
  datetime_3_ updatedAt
  INTEGER version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
