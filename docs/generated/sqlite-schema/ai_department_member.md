# ai_department_member

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_member" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "name" varchar(128) NOT NULL, "role" varchar(128) NOT NULL, "managerMemberId" varchar(36), "archived" boolean NOT NULL DEFAULT (false), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "expertiseTags" text NOT NULL DEFAULT '[]', CONSTRAINT "FK_84eb0c6d25f8fe9c0c162709aa9" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE, CONSTRAINT "FK_fa0f5c02be840bec0749cbd91fc" FOREIGN KEY ("managerMemberId") REFERENCES "ai_department_member" ("id") ON DELETE SET NULL)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| archived | boolean | false | false |  |  |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| expertiseTags | TEXT | '[]' | false |  |  |  |
| id | varchar(36) |  | false | [agent_department_consultation_invocation](agent_department_consultation_invocation.md) [ai_department_executor_binding](ai_department_executor_binding.md) [ai_department_executor_binding_revision](ai_department_executor_binding_revision.md) [ai_department_goal](ai_department_goal.md) [ai_department_meeting](ai_department_meeting.md) [ai_department_meeting_action_item](ai_department_meeting_action_item.md) [ai_department_meeting_invocation](ai_department_meeting_invocation.md) [ai_department_meeting_participant](ai_department_meeting_participant.md) [ai_department_member](ai_department_member.md) [ai_department_work_attempt](ai_department_work_attempt.md) [ai_department_work_eligibility](ai_department_work_eligibility.md) [ai_department_work_help_request](ai_department_work_help_request.md) [ai_department_work_help_response](ai_department_work_help_response.md) [ai_department_work_item](ai_department_work_item.md) [ai_department_work_wake_lane](ai_department_work_wake_lane.md) [ai_department_workflow_capability](ai_department_workflow_capability.md) |  |  |
| managerMemberId | varchar(36) |  | true |  | [ai_department_member](ai_department_member.md) |  |
| name | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| role | varchar(128) |  | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (managerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_member_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_98883d6605d592793363a319f4 | CREATE INDEX "IDX_98883d6605d592793363a319f4" ON "ai_department_member" ("projectId", "departmentId")  |
| IDX_ai_department_member_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_member_projectId_id" ON "ai_department_member" ("projectId", "id")  |
| sqlite_autoindex_ai_department_member_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_member" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"agent_department_consultation_invocation" }o--|| "ai_department_member" : "FOREIGN KEY (recipientMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"agent_department_consultation_invocation" }o--|| "ai_department_member" : "FOREIGN KEY (requesterMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_executor_binding" |o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_executor_binding_revision" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_goal" }o--o| "ai_department_member" : "FOREIGN KEY (ownerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_meeting" }o--|| "ai_department_member" : "FOREIGN KEY (facilitatorMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_meeting_action_item" }o--o| "ai_department_member" : "FOREIGN KEY (assigneeMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_meeting_invocation" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_meeting_participant" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_member" }o--o| "ai_department_member" : "FOREIGN KEY (managerMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_attempt" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE RESTRICT MATCH NONE"
"ai_department_work_eligibility" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department_member" : "FOREIGN KEY (requesterMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--o| "ai_department_member" : "FOREIGN KEY (recipientMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_help_response" }o--o| "ai_department_member" : "FOREIGN KEY (responderMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_member" : "FOREIGN KEY (assigneeMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_wake_lane" |o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_workflow_capability" }o--|| "ai_department_member" : "FOREIGN KEY (memberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"ai_department_executor_binding" {
  datetime_3_ createdAt
  varchar_36_ executorId
  varchar_36_ memberId PK
  varchar_36_ projectId
  varchar_64_ provider
  datetime_3_ updatedAt
  INTEGER version
}
"ai_department_executor_binding_revision" {
  varchar changedById
  datetime_3_ createdAt
  varchar_36_ executorId
  varchar_36_ id PK
  varchar_36_ memberId FK
  varchar_64_ provider
  INTEGER version
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
"ai_department_meeting_action_item" {
  datetime_3_ approvedAt
  varchar approvedBy
  varchar_36_ assigneeMemberId FK
  varchar_36_ conversionRequestId
  datetime_3_ createdAt
  varchar_36_ departmentId
  TEXT description
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ minutesId FK
  varchar_64_ payloadHash
  varchar_36_ projectId
  TEXT resolutionReason
  datetime_3_ resolvedAt
  TEXT sourceContributionIds
  varchar_24_ state
  varchar_256_ title
  datetime_3_ updatedAt
  varchar_36_ workId
}
"ai_department_meeting_invocation" {
  varchar actorId
  INTEGER bindingVersion
  varchar_255_ contextRef
  datetime_3_ createdAt
  datetime_3_ deadlineAt
  varchar_36_ departmentId
  varchar_36_ executorId
  varchar_36_ id PK
  varchar_64_ inputHash
  varchar_16_ kind
  varchar_36_ meetingId FK
  varchar_36_ memberId FK
  varchar_255_ ownerInvocationRef
  varchar_64_ ownerSequence
  varchar_36_ participantId FK
  varchar_36_ projectId
  varchar_64_ requestKey
  varchar_36_ retryOfInvocationId FK
  varchar_64_ safeFailureCode
  varchar_512_ safeFailureSummary
  varchar_16_ state
  varchar_36_ stopCommandId
  datetime_3_ terminalAt
  datetime_3_ updatedAt
}
"ai_department_meeting_participant" {
  INTEGER bindingVersion
  datetime_3_ createdAt
  varchar_36_ departmentId
  TEXT exclusionReason
  varchar_36_ executorId
  boolean facilitator
  varchar_36_ id PK
  varchar_36_ meetingId FK
  varchar_36_ memberId FK
  varchar_128_ memberNameSnapshot
  varchar_36_ projectId
  varchar_16_ responseState
  varchar_128_ roleSnapshot
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
"ai_department_work_eligibility" {
  varchar actorId
  INTEGER bindingVersion
  datetime_3_ consumedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  datetime_3_ eligibleAt
  INTEGER generation PK
  INTEGER laneGeneration
  varchar_36_ memberId FK
  varchar_36_ projectId
  varchar_36_ requestId
  varchar_16_ state
  varchar_36_ workId PK
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
"ai_department_work_wake_lane" {
  INTEGER acknowledgedGeneration
  varchar_36_ activeAttemptId
  varchar actorId PK
  INTEGER bindingVersion PK
  datetime_3_ createdAt
  INTEGER generation
  varchar_36_ memberId PK
  varchar_36_ projectId PK
  varchar_16_ state
  datetime_3_ updatedAt
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
