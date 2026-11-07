# ai_department_work_item

## Description

<details>
<summary><strong>Table Definition</strong></summary>

```sql
CREATE TABLE "ai_department_work_item" ("id" varchar(36) PRIMARY KEY NOT NULL, "projectId" varchar(36) NOT NULL, "departmentId" varchar(36) NOT NULL, "goalId" varchar(36), "assigneeMemberId" varchar(36), "instruction" text NOT NULL, "priority" varchar(16) NOT NULL DEFAULT ('normal'), "dueAt" datetime(3), "reviewPolicy" varchar(16) NOT NULL DEFAULT ('required'), "state" varchar(24) NOT NULL DEFAULT ('backlog'), "currentAttemptId" varchar(36), "version" integer NOT NULL DEFAULT (1), "createdAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "updatedAt" datetime(3) NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')), "reviewStagesJson" text, "currentReviewStageIndex" integer NOT NULL DEFAULT (0), "reviewPolicyRevision" integer NOT NULL DEFAULT (1), "reviewPolicyRevisionId" varchar(36), "assignedByUserId" varchar(36) NULL REFERENCES "user"("id") ON DELETE SET NULL, CONSTRAINT "FK_5446b8332dd1ed2c5215313cf07" FOREIGN KEY ("currentAttemptId") REFERENCES "ai_department_work_attempt" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_db8bce2588b750616a00afd904b" FOREIGN KEY ("departmentId") REFERENCES "ai_department" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_8b7a3a6a9de05459733d15b0dfe" FOREIGN KEY ("goalId") REFERENCES "ai_department_goal" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_ac5c0333adade30f4a8b620f6c1" FOREIGN KEY ("assigneeMemberId") REFERENCES "ai_department_member" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)
```

</details>

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| assignedByUserId | varchar(36) |  | true |  | [user](user.md) |  |
| assigneeMemberId | varchar(36) |  | true |  | [ai_department_member](ai_department_member.md) |  |
| createdAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| currentAttemptId | varchar(36) |  | true |  | [ai_department_work_attempt](ai_department_work_attempt.md) |  |
| currentReviewStageIndex | INTEGER | 0 | false |  |  |  |
| departmentId | varchar(36) |  | false |  | [ai_department](ai_department.md) |  |
| dueAt | datetime(3) |  | true |  |  |  |
| goalId | varchar(36) |  | true |  | [ai_department_goal](ai_department_goal.md) |  |
| id | varchar(36) |  | false | [ai_department_work_activity](ai_department_work_activity.md) [ai_department_work_attempt](ai_department_work_attempt.md) [ai_department_work_claim](ai_department_work_claim.md) [ai_department_work_eligibility](ai_department_work_eligibility.md) [ai_department_work_handoff_intent](ai_department_work_handoff_intent.md) [ai_department_work_help_request](ai_department_work_help_request.md) [ai_department_work_help_response](ai_department_work_help_response.md) [ai_department_work_owner_event_receipt](ai_department_work_owner_event_receipt.md) [ai_department_work_relationship](ai_department_work_relationship.md) [ai_department_work_release_intent](ai_department_work_release_intent.md) [ai_department_work_review_decision](ai_department_work_review_decision.md) [ai_department_work_review_policy_revision](ai_department_work_review_policy_revision.md) [ai_department_work_review_round](ai_department_work_review_round.md) [ai_department_work_submitted_result](ai_department_work_submitted_result.md) [ai_department_work_transition](ai_department_work_transition.md) [ai_department_work_wake_intent](ai_department_work_wake_intent.md) [ai_department_workflow_invocation](ai_department_workflow_invocation.md) |  |  |
| instruction | TEXT |  | false |  |  |  |
| priority | varchar(16) | 'normal' | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| reviewPolicy | varchar(16) | 'required' | false |  |  |  |
| reviewPolicyRevision | INTEGER | 1 | false |  |  |  |
| reviewPolicyRevisionId | varchar(36) |  | true |  |  |  |
| reviewStagesJson | TEXT |  | true |  |  |  |
| state | varchar(24) | 'backlog' | false |  |  |  |
| updatedAt | datetime(3) | STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') | false |  |  |  |
| version | INTEGER | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| - (Foreign key ID: 0) | FOREIGN KEY | FOREIGN KEY (assigneeMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 1) | FOREIGN KEY | FOREIGN KEY (goalId) REFERENCES ai_department_goal (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 2) | FOREIGN KEY | FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE |
| - (Foreign key ID: 3) | FOREIGN KEY | FOREIGN KEY (currentAttemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| - (Foreign key ID: 4) | FOREIGN KEY | FOREIGN KEY (assignedByUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE |
| id | PRIMARY KEY | PRIMARY KEY (id) |
| sqlite_autoindex_ai_department_work_item_1 | PRIMARY KEY | PRIMARY KEY (id) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_0e4fcacec2474277bd92fba21a | CREATE INDEX "IDX_0e4fcacec2474277bd92fba21a" ON "ai_department_work_item" ("projectId", "departmentId", "state", "createdAt")  |
| IDX_43fdd5829ee99e93399c20d422 | CREATE INDEX "IDX_43fdd5829ee99e93399c20d422" ON "ai_department_work_item" ("departmentId", "assigneeMemberId", "state")  |
| IDX_6976a655c17e8e13951ce28388 | CREATE INDEX "IDX_6976a655c17e8e13951ce28388" ON "ai_department_work_item" ("departmentId", "goalId")  |
| IDX_ai_department_work_item_currentAttemptId | CREATE INDEX "IDX_ai_department_work_item_currentAttemptId" ON "ai_department_work_item" ("currentAttemptId")  |
| IDX_ai_department_work_item_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_work_item_projectId_id" ON "ai_department_work_item" ("projectId", "id")  |
| sqlite_autoindex_ai_department_work_item_1 | PRIMARY KEY (id) |

## Relations

```mermaid
erDiagram

"ai_department_work_item" }o--o| "user" : "FOREIGN KEY (assignedByUserId) REFERENCES user (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_member" : "FOREIGN KEY (assigneeMemberId) REFERENCES ai_department_member (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_work_attempt" : "FOREIGN KEY (currentAttemptId) REFERENCES ai_department_work_attempt (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_item" }o--|| "ai_department" : "FOREIGN KEY (departmentId) REFERENCES ai_department (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_item" }o--o| "ai_department_goal" : "FOREIGN KEY (goalId) REFERENCES ai_department_goal (id) ON UPDATE NO ACTION ON DELETE SET NULL MATCH NONE"
"ai_department_work_activity" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_attempt" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_claim" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_eligibility" |o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_handoff_intent" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_request" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_help_response" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_owner_event_receipt" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_relationship" }o--|| "ai_department_work_item" : "FOREIGN KEY (relatedWorkId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_relationship" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_release_intent" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_decision" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_policy_revision" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_review_round" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_submitted_result" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_transition" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_work_wake_intent" |o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"
"ai_department_workflow_invocation" }o--|| "ai_department_work_item" : "FOREIGN KEY (workId) REFERENCES ai_department_work_item (id) ON UPDATE NO ACTION ON DELETE CASCADE MATCH NONE"

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
"ai_department_work_activity" {
  varchar_36_ actorId
  varchar_16_ actorKind
  varchar_36_ attemptId
  TEXT body
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_32_ kind
  varchar_36_ projectId
  varchar_36_ workId FK
  INTEGER workVersion
}
"ai_department_work_claim" {
  varchar_36_ attemptId FK
  INTEGER claimGeneration
  datetime_3_ claimedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ executionId
  varchar_36_ id PK
  datetime_3_ leaseUntil
  varchar_36_ memberId
  varchar_36_ projectId
  datetime_3_ releasedAt
  varchar_36_ workId FK
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
"ai_department_work_handoff_intent" {
  varchar authorizedByUserId
  datetime_3_ completedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  INTEGER destinationBindingVersion
  varchar_36_ destinationMemberId
  INTEGER expectedWorkVersion
  varchar_36_ id PK
  varchar_36_ projectId
  TEXT reason
  varchar_36_ requestId
  varchar requestedByActorId
  varchar_36_ requestedByMemberId
  varchar_36_ sourceAttemptId
  varchar_36_ sourceMemberId
  varchar_16_ state
  varchar_36_ stopCommandId
  varchar_36_ workId FK
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
"ai_department_work_owner_event_receipt" {
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ id PK
  varchar_32_ kind
  datetime_3_ occurredAt
  varchar_255_ ownerEventId
  varchar_36_ projectId
  varchar_64_ provider
  datetime_3_ receivedAt
  TEXT safeSummary
  INTEGER schemaVersion
  varchar_20_ sequence
  datetime_3_ updatedAt
  varchar_36_ workId FK
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
"ai_department_work_release_intent" {
  datetime_3_ confirmedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ projectId
  TEXT reason
  varchar_36_ requestId
  varchar requestedByActorId
  varchar_36_ sourceAttemptId
  varchar_16_ state
  varchar_36_ stopCommandId
  boolean waitingForChildren
  varchar_36_ workId FK
}
"ai_department_work_review_decision" {
  varchar actorId
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_16_ decision
  varchar_36_ departmentId
  varchar_36_ id PK
  INTEGER priorVersion
  varchar_36_ projectId
  TEXT reason
  varchar_36_ resultId
  varchar_36_ reviewRoundId
  varchar_64_ stageId
  varchar_36_ workId FK
}
"ai_department_work_review_policy_revision" {
  datetime_3_ createdAt
  varchar createdByUserId
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_16_ mode
  varchar_36_ projectId
  INTEGER revision
  TEXT stagesJson
  varchar_36_ workId FK
}
"ai_department_work_review_round" {
  varchar_64_ activeStageId
  varchar_36_ attemptId FK
  datetime_3_ closedAt
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  INTEGER ordinal
  varchar_36_ policyRevisionId FK
  varchar_36_ projectId
  varchar requesterId
  varchar_16_ requesterKind
  varchar_36_ resultId FK
  varchar_16_ status
  INTEGER version
  varchar_36_ workId FK
}
"ai_department_work_submitted_result" {
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_36_ id PK
  varchar_36_ projectId
  varchar_255_ reference
  TEXT safeSummary
  datetime_3_ submittedAt
  varchar submittedByUserId
  datetime_3_ updatedAt
  varchar_36_ workId FK
}
"ai_department_work_transition" {
  varchar_36_ actorId
  varchar_16_ actorKind
  varchar_36_ attemptId FK
  datetime_3_ createdAt
  varchar_36_ departmentId
  varchar_24_ fromState
  varchar_36_ id PK
  varchar_36_ projectId
  TEXT reason
  varchar_24_ toState
  varchar_36_ workId FK
  INTEGER workVersion
}
"ai_department_work_wake_intent" {
  varchar actorId
  datetime_3_ createdAt
  datetime_3_ deliveredAt
  varchar_36_ departmentId
  varchar_36_ projectId
  varchar_36_ requestId
  datetime_3_ retryAt
  varchar_36_ workId PK
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
