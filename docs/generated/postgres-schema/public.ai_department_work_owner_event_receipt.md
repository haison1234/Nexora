# public.ai_department_work_owner_event_receipt

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| attemptId | varchar(36) |  | false |  | [public.ai_department_work_attempt](public.ai_department_work_attempt.md) |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| id | varchar(36) |  | false |  |  |  |
| kind | varchar(32) |  | false |  |  |  |
| occurredAt | timestamp(3) with time zone |  | false |  |  |  |
| ownerEventId | varchar(255) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| provider | varchar(64) |  | false |  |  |  |
| receivedAt | timestamp(3) with time zone |  | false |  |  |  |
| safeSummary | text |  | true |  |  |  |
| schemaVersion | integer |  | false |  |  |  |
| sequence | varchar(20) |  | false |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| workId | varchar(36) |  | false |  | [public.ai_department_work_item](public.ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| FK_154cb04a1b1b1f6a5c6cefc8c42 | FOREIGN KEY | FOREIGN KEY ("attemptId") REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE |
| FK_7e78b6903b1c94c1454f2a12510 | FOREIGN KEY | FOREIGN KEY ("workId") REFERENCES ai_department_work_item(id) ON DELETE CASCADE |
| PK_c57fa6c37de2a2807fd3ef4036f | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_work_owner_event_receipt_attemptId_not_null | n | NOT NULL "attemptId" |
| ai_department_work_owner_event_receipt_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_work_owner_event_receipt_id_not_null | n | NOT NULL id |
| ai_department_work_owner_event_receipt_kind_not_null | n | NOT NULL kind |
| ai_department_work_owner_event_receipt_occurredAt_not_null | n | NOT NULL "occurredAt" |
| ai_department_work_owner_event_receipt_ownerEventId_not_null | n | NOT NULL "ownerEventId" |
| ai_department_work_owner_event_receipt_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_work_owner_event_receipt_provider_not_null | n | NOT NULL provider |
| ai_department_work_owner_event_receipt_receivedAt_not_null | n | NOT NULL "receivedAt" |
| ai_department_work_owner_event_receipt_schemaVersion_not_null | n | NOT NULL "schemaVersion" |
| ai_department_work_owner_event_receipt_sequence_not_null | n | NOT NULL sequence |
| ai_department_work_owner_event_receipt_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_work_owner_event_receipt_workId_not_null | n | NOT NULL "workId" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_82da34d3bf25cb50f08d68f027 | CREATE UNIQUE INDEX "IDX_82da34d3bf25cb50f08d68f027" ON public.ai_department_work_owner_event_receipt USING btree ("attemptId", sequence) |
| IDX_df048bb1d2ab29f9c32edcf368 | CREATE UNIQUE INDEX "IDX_df048bb1d2ab29f9c32edcf368" ON public.ai_department_work_owner_event_receipt USING btree (provider, "ownerEventId") |
| PK_c57fa6c37de2a2807fd3ef4036f | CREATE UNIQUE INDEX "PK_c57fa6c37de2a2807fd3ef4036f" ON public.ai_department_work_owner_event_receipt USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_work_owner_event_receipt" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_owner_event_receipt" }o--|| "public.ai_department_work_item" : "FOREIGN KEY (#quot;workId#quot;) REFERENCES ai_department_work_item(id) ON DELETE CASCADE"

"public.ai_department_work_owner_event_receipt" {
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ id
  varchar_32_ kind
  timestamp_3__with_time_zone occurredAt
  varchar_255_ ownerEventId
  varchar_36_ projectId
  varchar_64_ provider
  timestamp_3__with_time_zone receivedAt
  text safeSummary
  integer schemaVersion
  varchar_20_ sequence
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
  text safeSummary
  timestamp_3__with_time_zone startedAt
  timestamp_3__with_time_zone updatedAt
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
