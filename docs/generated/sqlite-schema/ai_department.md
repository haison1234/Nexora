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
| id | varchar(36) |  | false | [agent_department_consultation_invocation](agent_department_consultation_invocation.md) [ai_department_admission_fence](ai_department_admission_fence.md) [ai_department_goal](ai_department_goal.md) [ai_department_meeting](ai_department_meeting.md) [ai_department_meeting_context](ai_department_meeting_context.md) [ai_department_meeting_source](ai_department_meeting_source.md) [ai_department_member](ai_department_member.md) [ai_department_work_help_request](ai_department_work_help_request.md) [ai_department_work_help_response](ai_department_work_help_response.md) [ai_department_work_item](ai_department_work_item.md) [ai_department_work_relationship](ai_department_work_relationship.md) [ai_department_workflow_capability](ai_department_workflow_capability.md) |  |  |
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

"agent_department_consultation_invocation" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_admission_fence" |o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_goal" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_context" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_meeting_source" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_member" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_response" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_item" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_relationship" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_workflow_capability" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
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
"agent_department_consultation_invocation" {
  varchar actorId
  INTEGER bindingVersion
  varchar_64_ commandKey
  varchar_64_ contextHash
  varchar_255_ contextRef
  datetime_3_ createdAt
  datetime_3_ deadlineAt
  varchar_36_ departmentId FK
  varchar_36_ executorId FK
  varchar_36_ helpRequestId FK
  varchar_36_ id PK
  varchar_64_ inputHash
  TEXT inputText
  varchar_36_ invocationId
  INTEGER maxOutputChars
  INTEGER maxOutputTokens
  varchar_16_ outcome
  varchar_36_ projectId FK
  varchar_36_ recipientMemberId FK
  varchar_36_ requesterMemberId FK
  varchar_64_ resultHash
  TEXT resultText
  varchar_64_ safeErrorCode
  varchar_64_ sequence
  varchar_36_ sourceAttemptId FK
  varchar_16_ state
  varchar_36_ stopCommandId
  varchar_64_ stopPayloadHash
  datetime_3_ stopRequestedAt
  datetime_3_ terminalAt
  varchar_128_ threadId
  datetime_3_ updatedAt
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
"ai_department_meeting" {
  TEXT absenceSnapshots
  varchar_16_ collectionCloseReason
  datetime_3_ collectionClosedAt
  datetime_3_ collectionDeadlineAt
  datetime_3_ completedAt
  datetime_3_ createdAt
  varchar createdBy
  varchar_36_ departmentId FK
  TEXT desiredOutcome
  varchar executionActorId
  varchar_36_ facilitatorMemberId FK
  TEXT frozenContributionIds
  varchar_36_ goalId
  varchar_36_ id PK
  varchar_36_ projectId FK
  varchar_16_ purpose
  TEXT referencedWorkIds
  datetime_3_ startedAt
  varchar_16_ state
  varchar_256_ topic
  datetime_3_ updatedAt
  INTEGER version
}
"ai_department_meeting_context" {
  varchar_64_ briefingHash
  datetime_3_ capturedAt
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ projectId
  varchar_255_ snapshotRef
  varchar_32_ toolPolicy
  varchar_64_ toolPolicyVersion
}
"ai_department_meeting_source" {
  varchar_16_ accessState
  varchar_64_ contentHash
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ id PK
  varchar_256_ labelSnapshot
  varchar_36_ meetingId FK
  varchar_36_ projectId
  varchar_255_ snapshotRef
  varchar_36_ sourceId
  varchar_16_ sourceKind
  varchar_64_ sourceVersion
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
"ai_department_work_help_request" {
  TEXT attemptedStepsJson
  INTEGER bindingVersion
  datetime_3_ createdAt
  datetime_3_ deadlineAt
  varchar_36_ departmentId FK
  TEXT expertiseTagsJson
  varchar_36_ id PK
  varchar initiatingUserId FK
  varchar_64_ inputHash
  varchar_64_ ownerInvocationHash
  varchar_128_ ownerReference
  varchar_36_ projectId FK
  TEXT question
  TEXT reason
  varchar_36_ recipientMemberId FK
  varchar_36_ recipientUserId FK
  TEXT requestChainJson
  varchar_36_ requestId
  varchar_36_ requesterMemberId FK
  varchar_32_ routingState
  varchar_36_ sourceAttemptId FK
  varchar_24_ state
  datetime_3_ updatedAt
  INTEGER version
  varchar_36_ workId FK
}
"ai_department_work_help_response" {
  varchar_36_ activityId FK
  TEXT answer
  varchar_64_ answerHash
  datetime_3_ createdAt
  varchar_36_ departmentId FK
  varchar_36_ helpRequestId FK
  varchar_36_ id PK
  varchar_128_ ownerInvocationRef
  INTEGER ownerSequence
  varchar_36_ projectId FK
  varchar_16_ responderKind
  varchar_36_ responderMemberId FK
  varchar responderUserId FK
  varchar_36_ sourceAttemptId FK
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
