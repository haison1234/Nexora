# public.ai_department_workflow_capability

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| createdAt | timestamp(3) with time zone |  | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [public.ai_department](public.ai_department.md) |  |
| enabled | boolean | false | false |  |  |  |
| id | varchar(36) |  | false | [public.ai_department_workflow_capability_revision](public.ai_department_workflow_capability_revision.md) [public.ai_department_workflow_invocation](public.ai_department_workflow_invocation.md) |  | Department workflow capability ID |
| inputSchemaFingerprint | varchar(128) |  | false |  |  | Fingerprint of the compatible workflow input schema |
| memberId | varchar(36) |  | false |  | [public.ai_department_member](public.ai_department_member.md) |  |
| projectId | varchar(36) |  | false |  |  | n8n project that owns the capability |
| publishedVersionRef | varchar(36) |  | false |  |  | Published workflow version selected by the coordinator |
| purpose | text |  | false |  |  |  |
| triggerCompatibilityRef | varchar(128) |  | false |  |  | Supported trigger type and version |
| updatedAt | timestamp(3) with time zone |  | false |  |  |  |
| version | integer | 1 | false |  |  |  |
| workflowId | varchar(36) |  | false |  |  | Reference to the n8n-owned workflow |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| FK_35455323f69ca028c78307b449e | FOREIGN KEY | FOREIGN KEY ("memberId") REFERENCES ai_department_member(id) ON DELETE CASCADE |
| FK_4cee32cdb97d4f83f56e6890757 | FOREIGN KEY | FOREIGN KEY ("departmentId") REFERENCES ai_department(id) ON DELETE CASCADE |
| PK_00e0034dea5cae684ec3a210fbe | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_workflow_capabil_triggerCompatibilityRef_not_null | n | NOT NULL "triggerCompatibilityRef" |
| ai_department_workflow_capabili_inputSchemaFingerprint_not_null | n | NOT NULL "inputSchemaFingerprint" |
| ai_department_workflow_capability_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_workflow_capability_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_workflow_capability_enabled_not_null | n | NOT NULL enabled |
| ai_department_workflow_capability_id_not_null | n | NOT NULL id |
| ai_department_workflow_capability_memberId_not_null | n | NOT NULL "memberId" |
| ai_department_workflow_capability_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_workflow_capability_publishedVersionRef_not_null | n | NOT NULL "publishedVersionRef" |
| ai_department_workflow_capability_purpose_not_null | n | NOT NULL purpose |
| ai_department_workflow_capability_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_workflow_capability_version_not_null | n | NOT NULL version |
| ai_department_workflow_capability_workflowId_not_null | n | NOT NULL "workflowId" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_workflow_capability_projectId_departmentId_me | CREATE INDEX "IDX_ai_department_workflow_capability_projectId_departmentId_me" ON public.ai_department_workflow_capability USING btree ("projectId", "departmentId", "memberId", enabled) |
| IDX_ai_department_workflow_capability_projectId_memberId_workfl | CREATE UNIQUE INDEX "IDX_ai_department_workflow_capability_projectId_memberId_workfl" ON public.ai_department_workflow_capability USING btree ("projectId", "memberId", "workflowId") |
| PK_00e0034dea5cae684ec3a210fbe | CREATE UNIQUE INDEX "PK_00e0034dea5cae684ec3a210fbe" ON public.ai_department_workflow_capability USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_workflow_capability" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_workflow_capability_revision" }o--|| "public.ai_department_workflow_capability" : "FOREIGN KEY (#quot;capabilityId#quot;) REFERENCES ai_department_workflow_capability(id) ON DELETE CASCADE"
"public.ai_department_workflow_invocation" }o--|| "public.ai_department_workflow_capability" : "FOREIGN KEY (#quot;capabilityId#quot;) REFERENCES ai_department_workflow_capability(id) ON DELETE RESTRICT"
"public.ai_department_workflow_capability" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"

"public.ai_department_workflow_capability" {
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  boolean enabled
  varchar_36_ id
  varchar_128_ inputSchemaFingerprint
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_36_ publishedVersionRef
  text purpose
  varchar_128_ triggerCompatibilityRef
  timestamp_3__with_time_zone updatedAt
  integer version
  varchar_36_ workflowId
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
"public.ai_department_workflow_capability_revision" {
  varchar_36_ capabilityId FK
  varchar_36_ changedById
  timestamp_3__with_time_zone createdAt
  boolean enabled
  varchar_36_ id
  varchar_128_ inputSchemaFingerprint
  varchar_36_ projectId
  varchar_36_ publishedVersionRef
  text purpose
  varchar_128_ triggerCompatibilityRef
  integer version
}
"public.ai_department_workflow_invocation" {
  varchar_36_ actualWorkflowVersion
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone cancelRequestedAt
  varchar_36_ capabilityId FK
  integer capabilityVersion
  varchar_16_ childState
  integer claimGeneration
  timestamp_3__with_time_zone createdAt
  varchar_16_ dispatchState
  varchar_36_ expectedWorkflowVersion
  varchar_36_ id
  varchar_64_ inputHash
  varchar_255_ inputsRef
  varchar_36_ memberId
  varchar_255_ ownerExecutionRef
  varchar_64_ ownerInvocationKey
  varchar_36_ projectId
  varchar_128_ requestId
  varchar_255_ safeErrorReference
  varchar_255_ safeResultReference
  timestamp_3__with_time_zone updatedAt
  integer version
  varchar_36_ workId FK
}
"public.ai_department_member" {
  boolean archived
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  json expertiseTags
  varchar_36_ id
  varchar_36_ managerMemberId FK
  varchar_128_ name
  varchar_36_ projectId
  varchar_128_ role
  timestamp_3__with_time_zone updatedAt
  integer version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
