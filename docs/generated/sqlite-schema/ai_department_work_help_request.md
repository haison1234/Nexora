# ai_department_work_help_request

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_work_help_request" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "workId" varchar(36) NOT NULL, "requesterMemberId" varchar(36) NOT NULL, "sourceAttemptId" varchar(36) NOT NULL, "initiatingUserId" varchar, "requestId" varchar(36) NOT NULL, "question" text NOT NULL, "attemptedStepsJson" text NOT NULL, "reason" text NOT NULL, "expertiseTagsJson" text NOT NULL, "requestChainJson" text NOT NULL, "recipientMemberId" varchar(36), "routingState" varchar(32) NOT NULL, "bindingVersion" integer, "inputHash" varchar(64) NOT NULL, "deadlineAt" datetime(3), "state" varchar(24) NOT NULL DEFAULT ('pending_stop'), "ownerReference" varchar(128), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "recipientUserId" varchar(36), "ownerInvocationHash" varchar(64), CONSTRAINT "CHK_ai_department_work_help_request_routingState" CHECK (("routingState" IN ('specialist', 'manager_fallback', 'assignment_actor_fallback', 'unresolved'))), CONSTRAINT "CHK_ai_department_work_help_request_state" CHECK (("state" IN ('pending_stop', 'queued', 'awaiting_answer', 'answered', 'escalating', 'expired', 'failed', 'cancelled'))), CONSTRAINT "FK_4a9ec7855d9d1a848feec1cc7f6" FOREIGN KEY ("recipientMemberId") REFERENCES "ai_department_member" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_5ddfbc0ddd7cdcc59bd6c5d887c" FOREIGN KEY ("initiatingUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_d746422a09ac94b8c2129babb58" FOREIGN KEY ("sourceAttemptId") REFERENCES "ai_department_work_attempt" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_94c0e6a11cbf26dda4a6a9f58c5" FOREIGN KEY ("requesterMemberId") REFERENCES "ai_department_member" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4df918e1c6ffc1f3e35f450ec75" FOREIGN KEY ("workId") REFERENCES "ai_department_work_item" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dbacd08ca0466c626113bf49027" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_41cca1db9e76943cd6f93e9c573" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_c383a78fbfcb374db6fe50b6351" FOREIGN KEY ("recipientUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| attemptedStepsJson | TEXT |  | false |  |  |  |
| bindingVersion | INTEGER |  | true |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| deadlineAt | datetime(3) |  | true |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| expertiseTagsJson | TEXT |  | false |  |  |  |
| id | varchar(36) |  | false | [agent_department_consultation_invocation](agent_department_consultation_invocation.md) [ai_department_work_help_response](ai_department_work_help_response.md) |  |  |
| initiatingUserId | varchar |  | true |  | [user](user.md) |  |
| inputHash | varchar(64) |  | false |  |  |  |
| ownerInvocationHash | varchar(64) |  | true |  |  |  |
| ownerReference | varchar(128) |  | true |  |  |  |
| projectId | varchar(36) |  | false |  | [project](project.md) |  |
| question | TEXT |  | false |  |  |  |
| reason | TEXT |  | false |  |  |  |
| recipientMemberId | varchar(36) |  | true |  | [ai_department_member](ai_department_member.md) |  |
| recipientUserId | varchar(36) |  | true |  | [user](user.md) |  |
| requestChainJson | TEXT |  | false |  |  |  |
| requestId | varchar(36) |  | false |  |  |  |
| requesterMemberId | varchar(36) |  | false |  | [ai_department_member](ai_department_member.md) |  |
| routingState | varchar(32) |  | false |  |  |  |
| sourceAttemptId | varchar(36) |  | false |  | [ai_department_work_attempt](ai_department_work_attempt.md) |  |
| state | varchar(24) | 'pending_stop' | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |
| workId | varchar(36) |  | false |  | [ai_department_work_item](ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - | CHECK | CHECK (("routingState" IN ('specialist', 'manager_fallback', 'assignment_actor_fallback', 'unresolved'))) |
| - | CHECK | CHECK (("state" IN ('pending_stop', 'queued', 'awaiting_answer', 'answered', 'escalating', 'expired', 'failed', 'cancelled'))) |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (recipientUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 2) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 3) | FOREIGN KEY | FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 4) | FOREIGN KEY | FOREIGN KEY (requesterMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 5) | FOREIGN KEY | FOREIGN KEY (sourceAttemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 6) | FOREIGN KEY | FOREIGN KEY (initiatingUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 7) | FOREIGN KEY | FOREIGN KEY (recipientMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_work_help_request_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_63eb193a370876c6b357d5a51f | CREATE INDEX "IDX_63eb193a370876c6b357d5a51f" ON "ai_department_work_help_request" ("projectId", "departmentId", "workId", "createdAt")  |
| IDX_763f82fe1b9e605925747d52bf | CREATE UNIQUE INDEX "IDX_763f82fe1b9e605925747d52bf" ON "ai_department_work_help_request" ("projectId", "initiatingUserId", "requestId")  |
| IDX_f3a13473c2e6d7fd4b0cf63928 | CREATE INDEX "IDX_f3a13473c2e6d7fd4b0cf63928" ON "ai_department_work_help_request" ("projectId", "departmentId", "state", "deadlineAt")  |
| sqlite_autoindex_ai_department_work_help_request_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_work_help_request" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"agent_department_consultation_invocation" }o--|| "ai_department_work_help_request" : "FOREIGN KEY (helpRequestId) REFERENCES ai_department_work_help_request (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_response" }o--|| "ai_department_work_help_request" : "FOREIGN KEY (helpRequestId) REFERENCES ai_department_work_help_request (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--o| "user" : "FOREIGN KEY (initiatingUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_help_request" }o--|| "project" : "FOREIGN KEY (projectId) REFERENCES project (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--o| "ai_department_member" : "FOREIGN KEY (recipientMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_help_request" }o--o| "user" : "FOREIGN KEY (recipientUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department_member" : "FOREIGN KEY (requesterMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department_work_attempt" : "FOREIGN KEY (sourceAttemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"user" {
  datetime_3_ createdAt
  boolean disabled
  varchar_255_ email
  varchar_32_ firstName
  varchar id PK
  VARCHAR_16_ kind
  date lastActiveAt
  varchar_32_ lastName
  boolean mfaEnabled
  TEXT mfaRecoveryCodes
  TEXT mfaSecret
  varchar password
  TEXT personalizationAnswers
  varchar_128_ roleSlug FK
  TEXT settings
  datetime_3_ updatedAt
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
