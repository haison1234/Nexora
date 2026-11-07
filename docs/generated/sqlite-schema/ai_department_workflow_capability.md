# ai_department_workflow_capability

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_workflow_capability" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "memberId" varchar(36) NOT NULL, "workflowId" varchar(36) NOT NULL, "purpose" text NOT NULL, "publishedVersionRef" varchar(36) NOT NULL, "triggerCompatibilityRef" varchar(128) NOT NULL, "inputSchemaFingerprint" varchar(128) NOT NULL, "enabled" boolean NOT NULL DEFAULT (false), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL, "updatedAt" datetime(3) NOT NULL, CONSTRAINT "FK_4cee32cdb97d4f83f56e6890757" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE, CONSTRAINT "FK_35455323f69ca028c78307b449e" FOREIGN KEY ("memberId") REFERENCES "ai_department_member" ("id") ON DELETE CASCADE)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| createdAt | datetime(3) |  | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| enabled | boolean | false | false |  |  |  |
| id | varchar(36) |  | false | [ai_department_workflow_capability_revision](ai_department_workflow_capability_revision.md) [ai_department_workflow_invocation](ai_department_workflow_invocation.md) |  |  |
| inputSchemaFingerprint | varchar(128) |  | false |  |  |  |
| memberId | varchar(36) |  | false |  | [ai_department_member](ai_department_member.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| publishedVersionRef | varchar(36) |  | false |  |  |  |
| purpose | TEXT |  | false |  |  |  |
| triggerCompatibilityRef | varchar(128) |  | false |  |  |  |
| updatedAt | datetime(3) |  | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |
| workflowId | varchar(36) |  | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_workflow_capability_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_workflow_capability_projectId_departmentId_memberId_enabled | CREATE INDEX "IDX_ai_department_workflow_capability_projectId_departmentId_memberId_enabled" ON "ai_department_workflow_capability" ("projectId", "departmentId", "memberId", "enabled")  |
| IDX_ai_department_workflow_capability_projectId_memberId_workflowId | CREATE UNIQUE INDEX "IDX_ai_department_workflow_capability_projectId_memberId_workflowId" ON "ai_department_workflow_capability" ("projectId", "memberId", "workflowId")  |
| sqlite_autoindex_ai_department_workflow_capability_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_workflow_capability" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_workflow_capability_revision" }o--|| "ai_department_workflow_capability" : "FOREIGN KEY (capabilityId) REFERENCES ai_department_workflow_capability (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_workflow_invocation" }o--|| "ai_department_workflow_capability" : "FOREIGN KEY (capabilityId) REFERENCES ai_department_workflow_capability (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_workflow_capability" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

"ai_department_workflow_capability" {
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  boolean enabled
  varchar_36_ id PK
  varchar_128_ inputSchemaFingerprint
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_36_ publishedVersionRef
  TEXT purpose
  varchar_128_ triggerCompatibilityRef
  datetime_3_ updatedAt
  INTEGER version
  varchar_36_ workflowId
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
"ai_department_workflow_capability_revision" {
  varchar_36_ capabilityId FK
  varchar_36_ changedById
  datetime_3_ createdAt
  boolean enabled
  varchar_36_ id PK
  varchar_128_ inputSchemaFingerprint
  varchar_36_ projectId
  varchar_36_ publishedVersionRef
  TEXT purpose
  varchar_128_ triggerCompatibilityRef
  INTEGER version
}
"ai_department_workflow_invocation" {
  varchar_36_ actualWorkflowVersion
  varchar_36_ attemptId FK
  datetime_3_ cancelRequestedAt
  varchar_36_ capabilityId FK
  INTEGER capabilityVersion
  varchar_16_ childState
  INTEGER claimGeneration
  datetime_3_ createdAt
  varchar_16_ dispatchState
  varchar_36_ expectedWorkflowVersion
  varchar_36_ id PK
  varchar_64_ inputHash
  varchar_255_ inputsRef
  varchar_36_ memberId
  varchar_255_ ownerExecutionRef
  varchar_64_ ownerInvocationKey
  varchar_36_ projectId
  varchar_128_ requestId
  varchar_255_ safeErrorReference
  varchar_255_ safeResultReference
  datetime_3_ updatedAt
  INTEGER version
  varchar_36_ workId FK
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
