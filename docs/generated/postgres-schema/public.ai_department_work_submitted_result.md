# public.ai_department_work_submitted_result

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| attemptId | varchar(36) |  | false |  | [public.ai_department_work_attempt](public.ai_department_work_attempt.md) |  |
| createdAt | timestamp(3) with time zone |  | true |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| id | varchar(36) |  | false | [public.ai_department_work_review_round](public.ai_department_work_review_round.md) [public.ai_department_work_review_stage_decision](public.ai_department_work_review_stage_decision.md) |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| reference | varchar(255) |  | true |  |  |  |
| safeSummary | text |  | true |  |  |  |
| submittedAt | timestamp(3) with time zone |  | false |  |  |  |
| submittedByUserId | uuid |  | false |  |  |  |
| updatedAt | timestamp(3) with time zone |  | true |  |  |  |
| workId | varchar(36) |  | false |  | [public.ai_department_work_item](public.ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| FK_138e1010f7611413e5c1ea414b9 | FOREIGN KEY | FOREIGN KEY ("attemptId") REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE |
| FK_abf7dec02d5d6bc0c0f3d522c7a | FOREIGN KEY | FOREIGN KEY ("workId") REFERENCES ai_department_work_item(id) ON DELETE CASCADE |
| PK_7324a9d7863544e0a0040f41ed9 | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_work_submitted_result_attemptId_not_null | n | NOT NULL "attemptId" |
| ai_department_work_submitted_result_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_work_submitted_result_id_not_null | n | NOT NULL id |
| ai_department_work_submitted_result_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_work_submitted_result_submittedAt_not_null | n | NOT NULL "submittedAt" |
| ai_department_work_submitted_result_submittedByUserId_not_null | n | NOT NULL "submittedByUserId" |
| ai_department_work_submitted_result_workId_not_null | n | NOT NULL "workId" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_work_submitted_result_attemptId | CREATE UNIQUE INDEX "IDX_ai_department_work_submitted_result_attemptId" ON public.ai_department_work_submitted_result USING btree ("attemptId") |
| IDX_ai_department_work_submitted_result_projectId_workId_submit | CREATE INDEX "IDX_ai_department_work_submitted_result_projectId_workId_submit" ON public.ai_department_work_submitted_result USING btree ("projectId", "workId", "submittedAt") |
| PK_7324a9d7863544e0a0040f41ed9 | CREATE UNIQUE INDEX "PK_7324a9d7863544e0a0040f41ed9" ON public.ai_department_work_submitted_result USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_work_submitted_result" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_review_round" }o--|| "public.ai_department_work_submitted_result" : "FOREIGN KEY (#quot;resultId#quot;) REFERENCES ai_department_work_submitted_result(id) ON DELETE CASCADE"
"public.ai_department_work_review_stage_decision" }o--|| "public.ai_department_work_submitted_result" : "FOREIGN KEY (#quot;resultId#quot;) REFERENCES ai_department_work_submitted_result(id) ON DELETE CASCADE"
"public.ai_department_work_submitted_result" }o--|| "public.ai_department_work_item" : "FOREIGN KEY (#quot;workId#quot;) REFERENCES ai_department_work_item(id) ON DELETE CASCADE"

"public.ai_department_work_submitted_result" {
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  varchar_36_ projectId
  varchar_255_ reference
  text safeSummary
  timestamp_3__with_time_zone submittedAt
  uuid submittedByUserId
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
}
"public.ai_department_work_attempt" {
  integer bindingVersion
  varchar_36_ cancelRequestId
  timestamp_3__with_time_zone cancelRequestedAt
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ dispatchKey
  varchar_36_ executorId
  timestamp_3__with_time_zone finishedAt
  varchar_36_ id
  uuid initiatingUserId
  varchar_20_ lastOwnerSequence
  varchar_36_ memberId FK
  integer ordinal
  varchar_16_ outcome
  varchar_255_ ownerExecutionRef
  varchar_16_ phase
  varchar_36_ projectId
  varchar_64_ provider
  varchar_255_ resultReference
  varchar_16_ reviewPolicy
  integer reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  timestamp_3__with_time_zone reviewRoundClosedAt
  varchar_36_ reviewRoundId
  varchar_16_ reviewRoundStatus
  text reviewStagesJson
  text safeSummary
  timestamp_3__with_time_zone startedAt
  varchar_36_ submittedResultId
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
  text workflowCapabilitiesJson
  text workflowIdsJson
}
"public.ai_department_work_review_round" {
  varchar_64_ activeStageId
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone closedAt
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  integer ordinal
  varchar_36_ policyRevisionId FK
  varchar_36_ projectId
  uuid requesterId
  varchar_16_ requesterKind
  varchar_36_ resultId FK
  varchar_16_ status
  integer version
  varchar_36_ workId FK
}
"public.ai_department_work_review_stage_decision" {
  uuid actorId
  varchar_16_ actorKind
  varchar_36_ commandId
  timestamp_3__with_time_zone createdAt
  varchar_16_ decision
  varchar_36_ departmentId
  varchar_36_ id
  integer priorVersion
  varchar_36_ projectId
  text reason
  varchar_36_ resultId FK
  varchar_36_ roundId FK
  varchar_64_ stageId
  varchar_36_ workId
}
"public.ai_department_work_item" {
  uuid assignedByUserId FK
  varchar_36_ assigneeMemberId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ currentAttemptId FK
  integer currentReviewStageIndex
  varchar_36_ departmentId FK
  timestamp_3__with_time_zone dueAt
  varchar_36_ goalId FK
  varchar_36_ id
  text instruction
  varchar_16_ priority
  varchar_36_ projectId
  varchar_16_ reviewPolicy
  integer reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  text reviewStagesJson
  varchar_24_ state
  timestamp_3__with_time_zone updatedAt
  integer version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
