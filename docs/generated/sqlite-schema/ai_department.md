# ai_department

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "name" varchar(128) NOT NULL, "normalizedName" varchar(128) NOT NULL, "description" text, "archived" boolean NOT NULL DEFAULT (false), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "projectionSequence" integer NOT NULL DEFAULT (0), CONSTRAINT "FK_00e31fe48fbfd3220de087cc1c6" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| archived | boolean | false | false |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| description | TEXT |  | true |  |  |  |
| id | varchar(36) |  | false | [ai_department_admission_fence](ai_department_admission_fence.md) [ai_department_goal](ai_department_goal.md) [ai_department_member](ai_department_member.md) [ai_department_work_item](ai_department_work_item.md) [ai_department_work_relationship](ai_department_work_relationship.md) |  |  |
| name | varchar(128) |  | false |  |  |  |
| normalizedName | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  | [project](project.md) |  |
| projectionSequence | INTEGER | 0 | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_ai_department_projectId_normalizedName | CREATE UNIQUE INDEX "IDX_ai_department_projectId_normalizedName" ON "ai_department" ("projectId", "normalizedName") WHERE "archived" = false |
| sqlite_autoindex_ai_department_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_admission_fence" |o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_goal" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_member" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_item" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_relationship" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department" }o--|| "project" : "FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"ai_department_admission_fence" {
  datetime_3_ createdAt
  varchar_36_ departmentId PK
  varchar_36_ projectId
  INTEGER sequence
  datetime_3_ updatedAt
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
"ai_department_work_relationship" {
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_16_ kind
  varchar_36_ projectId
  varchar_36_ relatedWorkId FK
  datetime_3_ updatedAt
  varchar_36_ workId FK
}
"project" {
  datetime_3_ createdAt
  varchar creatorId FK
  TEXT customTelemetryTags
  varchar_512_ description
  TEXT icon
  varchar_36_ id PK
  varchar_255_ name
  varchar_36_ type
  datetime_3_ updatedAt
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
