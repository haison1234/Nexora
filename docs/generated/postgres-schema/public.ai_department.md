# public.ai_department

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| archived | boolean | false | false |  |  |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| description | text |  | true |  |  |  |
| id | varchar(36) |  | false | [public.ai_department_admission_fence](public.ai_department_admission_fence.md) [public.ai_department_goal](public.ai_department_goal.md) [public.ai_department_member](public.ai_department_member.md) [public.ai_department_work_item](public.ai_department_work_item.md) [public.ai_department_work_relationship](public.ai_department_work_relationship.md) |  |  |
| name | varchar(128) |  | false |  |  |  |
| normalizedName | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  | [public.project](public.project.md) |  |
| projectionSequence | integer | 0 | false |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| version | integer | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| FK_00e31fe48fbfd3220de087cc1c6 | FOREIGN KEY | FOREIGN KEY ("projectId") REFERENCES project(id) ON DELETE CASCADE |
| PK_e7fda9d0237799ee101a79b8b1e | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_archived_not_null | n | NOT NULL archived |
| ai_department_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_id_not_null | n | NOT NULL id |
| ai_department_name_not_null | n | NOT NULL name |
| ai_department_normalizedName_not_null | n | NOT NULL "normalizedName" |
| ai_department_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_projectionSequence_not_null | n | NOT NULL "projectionSequence" |
| ai_department_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_version_not_null | n | NOT NULL version |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_projectId_normalizedName | CREATE UNIQUE INDEX "IDX_ai_department_projectId_normalizedName" ON public.ai_department USING btree ("projectId", "normalizedName") WHERE (archived = false) |
| PK_e7fda9d0237799ee101a79b8b1e | CREATE UNIQUE INDEX "PK_e7fda9d0237799ee101a79b8b1e" ON public.ai_department USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_admission_fence" |o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_goal" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_member" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_work_item" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department_work_relationship" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.ai_department" }o--|| "public.project" : "FOREIGN KEY (#quot;projectId#quot;) REFERENCES project(id) ON DELETE CASCADE"

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
"public.ai_department_admission_fence" {
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  varchar_36_ projectId
  integer sequence
  timestamp_3__with_time_zone updatedAt
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
"public.ai_department_work_relationship" {
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  varchar_36_ id
  varchar_16_ kind
  varchar_36_ projectId
  varchar_36_ relatedWorkId FK
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
}
"public.project" {
  timestamp_3__with_time_zone createdAt
  uuid creatorId FK
  json customTelemetryTags
  varchar_512_ description
  json icon
  varchar_36_ id
  varchar_255_ name
  varchar_36_ type
  timestamp_3__with_time_zone updatedAt
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
