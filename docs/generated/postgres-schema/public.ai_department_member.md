# public.ai_department_member

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| archived | boolean | false | false |  |  |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [public.ai_department](public.ai_department.md) |  |
| id | varchar(36) |  | false | [public.ai_department_executor_binding](public.ai_department_executor_binding.md) [public.ai_department_executor_binding_revision](public.ai_department_executor_binding_revision.md) [public.ai_department_goal](public.ai_department_goal.md) [public.ai_department_member](public.ai_department_member.md) [public.ai_department_work_attempt](public.ai_department_work_attempt.md) [public.ai_department_work_eligibility](public.ai_department_work_eligibility.md) [public.ai_department_work_item](public.ai_department_work_item.md) [public.ai_department_work_wake_lane](public.ai_department_work_wake_lane.md) |  |  |
| managerMemberId | varchar(36) |  | true |  | [public.ai_department_member](public.ai_department_member.md) |  |
| name | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| role | varchar(128) |  | false |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| version | integer | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| FK_84eb0c6d25f8fe9c0c162709aa9 | FOREIGN KEY | FOREIGN KEY ("departmentId") REFERENCES ai_department(id) ON DELETE CASCADE |
| FK_fa0f5c02be840bec0749cbd91fc | FOREIGN KEY | FOREIGN KEY ("managerMemberId") REFERENCES ai_department_member(id) ON DELETE SET NULL |
| PK_7ca6178c90aa4b0de14573c891e | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_member_archived_not_null | n | NOT NULL archived |
| ai_department_member_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_member_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_member_id_not_null | n | NOT NULL id |
| ai_department_member_name_not_null | n | NOT NULL name |
| ai_department_member_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_member_role_not_null | n | NOT NULL role |
| ai_department_member_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_member_version_not_null | n | NOT NULL version |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_98883d6605d592793363a319f4 | CREATE INDEX "IDX_98883d6605d592793363a319f4" ON public.ai_department_member USING btree ("projectId", "departmentId") |
| IDX_ai_department_member_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_member_projectId_id" ON public.ai_department_member USING btree ("projectId", id) |
| PK_7ca6178c90aa4b0de14573c891e | CREATE UNIQUE INDEX "PK_7ca6178c90aa4b0de14573c891e" ON public.ai_department_member USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_member" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_executor_binding" |o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"
"public.ai_department_executor_binding_revision" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"
"public.ai_department_goal" }o--o| "public.ai_department_member" : "FOREIGN KEY (#quot;ownerMemberId#quot;) REFERENCES ai_department_member(id) ON DELETE SET NULL"
"public.ai_department_member" }o--o| "public.ai_department_member" : "FOREIGN KEY (#quot;managerMemberId#quot;) REFERENCES ai_department_member(id) ON DELETE SET NULL"
"public.ai_department_work_attempt" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE RESTRICT"
"public.ai_department_work_eligibility" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"
"public.ai_department_work_item" }o--o| "public.ai_department_member" : "FOREIGN KEY (#quot;assigneeMemberId#quot;) REFERENCES ai_department_member(id) ON DELETE SET NULL"
"public.ai_department_work_wake_lane" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"

"public.ai_department_member" {
  boolean archived
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  varchar_36_ id
  varchar_36_ managerMemberId FK
  varchar_128_ name
  varchar_36_ projectId
  varchar_128_ role
  timestamp_3__with_time_zone updatedAt
  integer version
}
"public.ai_department" {
  boolean archived
  timestamp_3__with_time_zone createdAt
  text description
  varchar_36_ id
  varchar_128_ name
  varchar_128_ normalizedName
  varchar_36_ projectId FK
  integer projectionSequence
  timestamp_3__with_time_zone updatedAt
  integer version
}
"public.ai_department_executor_binding" {
  timestamp_3__with_time_zone createdAt
  varchar_36_ executorId
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_64_ provider
  timestamp_3__with_time_zone updatedAt
  integer version
}
"public.ai_department_executor_binding_revision" {
  uuid changedById
  timestamp_3__with_time_zone createdAt
  varchar_36_ executorId
  varchar_36_ id
  varchar_36_ memberId FK
  varchar_64_ provider
  integer version
}
"public.ai_department_goal" {
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  timestamp_3__with_time_zone dueAt
  varchar_36_ id
  varchar_36_ ownerMemberId FK
  varchar_36_ parentId FK
  varchar_36_ projectId
  varchar_16_ state
  text successCriteria
  varchar_256_ title
  timestamp_3__with_time_zone updatedAt
  integer version
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
  text safeSummary
  timestamp_3__with_time_zone startedAt
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
}
"public.ai_department_work_eligibility" {
  uuid actorId
  integer bindingVersion
  timestamp_3__with_time_zone consumedAt
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  timestamp_3__with_time_zone eligibleAt
  integer generation
  integer laneGeneration
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_36_ requestId
  varchar_16_ state
  varchar_36_ workId FK
}
"public.ai_department_work_item" {
  varchar_36_ assigneeMemberId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ currentAttemptId FK
  varchar_36_ departmentId FK
  timestamp_3__with_time_zone dueAt
  varchar_36_ goalId FK
  varchar_36_ id
  text instruction
  varchar_16_ priority
  varchar_36_ projectId
  varchar_16_ reviewPolicy
  varchar_24_ state
  timestamp_3__with_time_zone updatedAt
  integer version
}
"public.ai_department_work_wake_lane" {
  integer acknowledgedGeneration
  uuid actorId
  integer bindingVersion
  timestamp_3__with_time_zone createdAt
  integer generation
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_16_ state
  timestamp_3__with_time_zone updatedAt
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
