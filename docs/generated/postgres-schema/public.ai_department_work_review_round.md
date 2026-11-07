# public.ai_department_work_review_round

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| activeStageId | varchar(64) |  | true |  |  |  |
| attemptId | varchar(36) |  | false |  | [public.ai_department_work_attempt](public.ai_department_work_attempt.md) |  |
| closedAt | timestamp(3) with time zone |  | true |  |  |  |
| createdAt | timestamp(3) with time zone |  | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| id | varchar(36) |  | false | [public.ai_department_work_review_stage_decision](public.ai_department_work_review_stage_decision.md) |  |  |
| ordinal | integer |  | false |  |  |  |
| policyRevisionId | varchar(36) |  | true |  | [public.ai_department_work_review_policy_revision](public.ai_department_work_review_policy_revision.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| requesterId | uuid |  | false |  |  |  |
| requesterKind | varchar(16) |  | false |  |  |  |
| resultId | varchar(36) |  | false |  | [public.ai_department_work_submitted_result](public.ai_department_work_submitted_result.md) |  |
| status | varchar(16) |  | false |  |  |  |
| version | integer | 1 | false |  |  |  |
| workId | varchar(36) |  | false |  | [public.ai_department_work_item](public.ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| CHK_ai_department_work_review_round_requesterKind | CHECK | CHECK ((("requesterKind")::text = 'user'::text)) |
| CHK_ai_department_work_review_round_status | CHECK | CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'accepted'::character varying, 'returned'::character varying, 'reopened'::character varying])::text[]))) |
| FK_0807d77e959e57e48ddccca88dc | FOREIGN KEY | FOREIGN KEY ("policyRevisionId") REFERENCES ai_department_work_review_policy_revision(id) ON DELETE SET NULL |
| FK_379061c674004637ddba7597a76 | FOREIGN KEY | FOREIGN KEY ("attemptId") REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE |
| FK_638c2ddcd7999f652940a56ab18 | FOREIGN KEY | FOREIGN KEY ("resultId") REFERENCES ai_department_work_submitted_result(id) ON DELETE CASCADE |
| FK_eb0b4abfb12cf4ee87c399974fa | FOREIGN KEY | FOREIGN KEY ("workId") REFERENCES ai_department_work_item(id) ON DELETE CASCADE |
| PK_832d0e7f9d473c2a302837654dd | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_work_review_round_attemptId_not_null | n | NOT NULL "attemptId" |
| ai_department_work_review_round_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_work_review_round_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_work_review_round_id_not_null | n | NOT NULL id |
| ai_department_work_review_round_ordinal_not_null | n | NOT NULL ordinal |
| ai_department_work_review_round_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_work_review_round_requesterId_not_null | n | NOT NULL "requesterId" |
| ai_department_work_review_round_requesterKind_not_null | n | NOT NULL "requesterKind" |
| ai_department_work_review_round_resultId_not_null | n | NOT NULL "resultId" |
| ai_department_work_review_round_status_not_null | n | NOT NULL status |
| ai_department_work_review_round_version_not_null | n | NOT NULL version |
| ai_department_work_review_round_workId_not_null | n | NOT NULL "workId" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_work_review_round_attemptId | CREATE UNIQUE INDEX "IDX_ai_department_work_review_round_attemptId" ON public.ai_department_work_review_round USING btree ("attemptId") |
| IDX_ai_department_work_review_round_workId_ordinal | CREATE UNIQUE INDEX "IDX_ai_department_work_review_round_workId_ordinal" ON public.ai_department_work_review_round USING btree ("workId", ordinal) |
| PK_832d0e7f9d473c2a302837654dd | CREATE UNIQUE INDEX "PK_832d0e7f9d473c2a302837654dd" ON public.ai_department_work_review_round USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_work_review_round" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_review_stage_decision" }o--|| "public.ai_department_work_review_round" : "FOREIGN KEY (#quot;roundId#quot;) REFERENCES ai_department_work_review_round(id) ON DELETE CASCADE"
"public.ai_department_work_review_round" }o--o| "public.ai_department_work_review_policy_revision" : "FOREIGN KEY (#quot;policyRevisionId#quot;) REFERENCES ai_department_work_review_policy_revision(id) ON DELETE SET NULL"
"public.ai_department_work_review_round" }o--|| "public.ai_department_work_submitted_result" : "FOREIGN KEY (#quot;resultId#quot;) REFERENCES ai_department_work_submitted_result(id) ON DELETE CASCADE"
"public.ai_department_work_review_round" }o--|| "public.ai_department_work_item" : "FOREIGN KEY (#quot;workId#quot;) REFERENCES ai_department_work_item(id) ON DELETE CASCADE"

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
"public.ai_department_work_review_policy_revision" {
  timestamp_3__with_time_zone createdAt
  uuid createdByUserId
  varchar_36_ departmentId
  varchar_36_ id
  varchar_16_ mode
  varchar_36_ projectId
  integer revision
  text stagesJson
  varchar_36_ workId FK
}
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
