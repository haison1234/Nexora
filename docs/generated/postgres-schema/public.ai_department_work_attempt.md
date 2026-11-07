# public.ai_department_work_attempt

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| bindingVersion | integer |  | false |  |  |  |
| cancelRequestId | varchar(36) |  | true |  |  |  |
| cancelRequestedAt | timestamp(3) with time zone |  | true |  |  |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| dispatchKey | varchar(36) |  | false |  |  |  |
| executorId | varchar(36) |  | false |  |  |  |
| finishedAt | timestamp(3) with time zone |  | true |  |  |  |
| id | varchar(36) |  | false | [public.agent_department_consultation_invocation](public.agent_department_consultation_invocation.md) [public.ai_department_work_claim](public.ai_department_work_claim.md) [public.ai_department_work_dispatch_intent](public.ai_department_work_dispatch_intent.md) [public.ai_department_work_help_request](public.ai_department_work_help_request.md) [public.ai_department_work_help_response](public.ai_department_work_help_response.md) [public.ai_department_work_item](public.ai_department_work_item.md) [public.ai_department_work_owner_event_receipt](public.ai_department_work_owner_event_receipt.md) [public.ai_department_work_review_decision](public.ai_department_work_review_decision.md) [public.ai_department_work_review_round](public.ai_department_work_review_round.md) [public.ai_department_work_submitted_result](public.ai_department_work_submitted_result.md) [public.ai_department_work_transition](public.ai_department_work_transition.md) [public.ai_department_workflow_invocation](public.ai_department_workflow_invocation.md) |  |  |
| initiatingUserId | uuid |  | false |  |  |  |
| lastOwnerSequence | varchar(20) | '0'::character varying | false |  |  |  |
| memberId | varchar(36) |  | false |  | [public.ai_department_member](public.ai_department_member.md) |  |
| ordinal | integer |  | false |  |  |  |
| outcome | varchar(16) |  | true |  |  |  |
| ownerExecutionRef | varchar(255) |  | true |  |  |  |
| phase | varchar(16) | 'dispatching'::character varying | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| provider | varchar(64) |  | false |  |  |  |
| resultReference | varchar(255) |  | true |  |  |  |
| reviewPolicy | varchar(16) |  | false |  |  |  |
| reviewPolicyRevision | integer | 1 | false |  |  |  |
| reviewPolicyRevisionId | varchar(36) |  | true |  |  |  |
| reviewRoundClosedAt | timestamp(3) with time zone |  | true |  |  |  |
| reviewRoundId | varchar(36) |  | true |  |  |  |
| reviewRoundStatus | varchar(16) |  | true |  |  |  |
| reviewStagesJson | text |  | true |  |  |  |
| safeSummary | text |  | true |  |  |  |
| startedAt | timestamp(3) with time zone |  | true |  |  |  |
| submittedResultId | varchar(36) |  | true |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| workId | varchar(36) |  | false |  | [public.ai_department_work_item](public.ai_department_work_item.md) |  |
| workflowCapabilitiesJson | text | '[]'::text | false |  |  |  |
| workflowIdsJson | text | '[]'::text | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| CHK_ai_department_work_attempt_reviewRoundStatus | CHECK | CHECK ((("reviewRoundStatus")::text = ANY ((ARRAY['open'::character varying, 'accepted'::character varying, 'returned'::character varying, 'reopened'::character varying])::text[]))) |
| FK_5309258bca2a1c885c316032c0c | FOREIGN KEY | FOREIGN KEY ("workId") REFERENCES ai_department_work_item(id) ON DELETE CASCADE |
| FK_b60f947d4504eb8a209ccfde774 | FOREIGN KEY | FOREIGN KEY ("memberId") REFERENCES ai_department_member(id) ON DELETE RESTRICT |
| PK_f2f542821002f1df2bdbf3fd2af | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_work_attempt_bindingVersion_not_null | n | NOT NULL "bindingVersion" |
| ai_department_work_attempt_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_work_attempt_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_work_attempt_dispatchKey_not_null | n | NOT NULL "dispatchKey" |
| ai_department_work_attempt_executorId_not_null | n | NOT NULL "executorId" |
| ai_department_work_attempt_id_not_null | n | NOT NULL id |
| ai_department_work_attempt_initiatingUserId_not_null | n | NOT NULL "initiatingUserId" |
| ai_department_work_attempt_lastOwnerSequence_not_null | n | NOT NULL "lastOwnerSequence" |
| ai_department_work_attempt_memberId_not_null | n | NOT NULL "memberId" |
| ai_department_work_attempt_ordinal_not_null | n | NOT NULL ordinal |
| ai_department_work_attempt_phase_not_null | n | NOT NULL phase |
| ai_department_work_attempt_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_work_attempt_provider_not_null | n | NOT NULL provider |
| ai_department_work_attempt_reviewPolicyRevision_not_null | n | NOT NULL "reviewPolicyRevision" |
| ai_department_work_attempt_reviewPolicy_not_null | n | NOT NULL "reviewPolicy" |
| ai_department_work_attempt_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_work_attempt_workId_not_null | n | NOT NULL "workId" |
| ai_department_work_attempt_workflowCapabilitiesJson_not_null | n | NOT NULL "workflowCapabilitiesJson" |
| ai_department_work_attempt_workflowIdsJson_not_null | n | NOT NULL "workflowIdsJson" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_2d26d020c5e04c2feb6496e220 | CREATE INDEX "IDX_2d26d020c5e04c2feb6496e220" ON public.ai_department_work_attempt USING btree ("projectId", "ownerExecutionRef") |
| IDX_8db4b87f1e4763acda979f491e | CREATE UNIQUE INDEX "IDX_8db4b87f1e4763acda979f491e" ON public.ai_department_work_attempt USING btree ("dispatchKey") |
| IDX_ai_department_work_attempt_projectId_id | CREATE UNIQUE INDEX "IDX_ai_department_work_attempt_projectId_id" ON public.ai_department_work_attempt USING btree ("projectId", id) |
| IDX_ai_department_work_attempt_projectId_memberId_initiatingUse | CREATE INDEX "IDX_ai_department_work_attempt_projectId_memberId_initiatingUse" ON public.ai_department_work_attempt USING btree ("projectId", "memberId", "initiatingUserId", "bindingVersion", phase) |
| IDX_ai_department_work_attempt_workId | CREATE UNIQUE INDEX "IDX_ai_department_work_attempt_workId" ON public.ai_department_work_attempt USING btree ("workId") WHERE ((phase)::text = ANY ((ARRAY['dispatching'::character varying, 'active'::character varying, 'suspended'::character varying])::text[])) |
| IDX_cd463cb86ef4858e2594a516ed | CREATE UNIQUE INDEX "IDX_cd463cb86ef4858e2594a516ed" ON public.ai_department_work_attempt USING btree ("workId", ordinal) |
| PK_f2f542821002f1df2bdbf3fd2af | CREATE UNIQUE INDEX "PK_f2f542821002f1df2bdbf3fd2af" ON public.ai_department_work_attempt USING btree (id) |

## Relations

```mermaid
erDiagram

"public.agent_department_consultation_invocation" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;sourceAttemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_claim" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_dispatch_intent" |o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_help_request" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;sourceAttemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_help_response" }o--o| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;sourceAttemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE SET NULL"
"public.ai_department_work_item" }o--o| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;currentAttemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE SET NULL"
"public.ai_department_work_owner_event_receipt" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_review_decision" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE RESTRICT"
"public.ai_department_work_review_round" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_submitted_result" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_transition" }o--o| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE SET NULL"
"public.ai_department_workflow_invocation" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;attemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_attempt" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE RESTRICT"
"public.ai_department_work_attempt" }o--|| "public.ai_department_work_item" : "FOREIGN KEY (#quot;workId#quot;) REFERENCES ai_department_work_item(id) ON DELETE CASCADE"

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
  integer reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  timestamp_3__with_time_zone reviewRoundClosedAt
  varchar_36_ reviewRoundId
  varchar_16_ reviewRoundStatus
  text reviewStagesJson
  text safeSummary
  timestamp_3__with_time_zone startedAt
  varchar_36_ submittedResultId
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
  text workflowCapabilitiesJson
  text workflowIdsJson
}
"public.agent_department_consultation_invocation" {
  uuid actorId
  integer bindingVersion
  varchar_64_ commandKey
  varchar_64_ contextHash
  varchar_255_ contextRef
  timestamp_3__with_time_zone createdAt
  timestamp_3__with_time_zone deadlineAt
  varchar_36_ departmentId FK
  varchar_36_ executorId FK
  varchar_36_ helpRequestId FK
  varchar_36_ id
  varchar_64_ inputHash
  text inputText
  varchar_36_ invocationId
  integer maxOutputChars
  integer maxOutputTokens
  varchar_16_ outcome
  varchar_36_ projectId FK
  varchar_36_ recipientMemberId FK
  varchar_36_ requesterMemberId FK
  varchar_64_ resultHash
  text resultText
  varchar_64_ safeErrorCode
  varchar_64_ sequence
  varchar_36_ sourceAttemptId FK
  varchar_16_ state
  varchar_36_ stopCommandId
  varchar_64_ stopPayloadHash
  timestamp_3__with_time_zone stopRequestedAt
  timestamp_3__with_time_zone terminalAt
  varchar_128_ threadId
  timestamp_3__with_time_zone updatedAt
}
"public.ai_department_work_claim" {
  varchar_36_ attemptId FK
  integer claimGeneration
  timestamp_3__with_time_zone claimedAt
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ executionId
  varchar_36_ id
  timestamp_3__with_time_zone leaseUntil
  varchar_36_ memberId
  varchar_36_ projectId
  timestamp_3__with_time_zone releasedAt
  varchar_36_ workId FK
}
"public.ai_department_work_dispatch_intent" {
  varchar_255_ acknowledgmentReference
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_64_ inputHash
  timestamp_3__with_time_zone leaseUntil
  varchar_36_ projectId
  varchar_36_ requestId
  varchar_16_ state
  timestamp_3__with_time_zone updatedAt
}
"public.ai_department_work_help_request" {
  text attemptedStepsJson
  integer bindingVersion
  timestamp_3__with_time_zone createdAt
  timestamp_3__with_time_zone deadlineAt
  varchar_36_ departmentId FK
  text expertiseTagsJson
  varchar_36_ id
  uuid initiatingUserId FK
  varchar_64_ inputHash
  varchar_64_ ownerInvocationHash
  varchar_128_ ownerReference
  varchar_36_ projectId FK
  text question
  text reason
  varchar_36_ recipientMemberId FK
  uuid recipientUserId FK
  text requestChainJson
  varchar_36_ requestId
  varchar_36_ requesterMemberId FK
  varchar_32_ routingState
  varchar_36_ sourceAttemptId FK
  varchar_24_ state
  timestamp_3__with_time_zone updatedAt
  integer version
  varchar_36_ workId FK
}
"public.ai_department_work_help_response" {
  varchar_36_ activityId FK
  text answer
  varchar_64_ answerHash
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId FK
  varchar_36_ helpRequestId FK
  varchar_36_ id
  varchar_128_ ownerInvocationRef
  integer ownerSequence
  varchar_36_ projectId FK
  varchar_16_ responderKind
  varchar_36_ responderMemberId FK
  uuid responderUserId FK
  varchar_36_ sourceAttemptId FK
  varchar_36_ workId FK
}
"public.ai_department_work_item" {
  uuid assignedByUserId FK
  varchar_36_ assigneeMemberId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ currentAttemptId FK
  integer currentReviewStageIndex
  varchar_36_ departmentId FK
  timestamp_3__with_time_zone dueAt
  varchar_36_ goalId FK
  varchar_36_ id
  text instruction
  varchar_16_ priority
  varchar_36_ projectId
  varchar_16_ reviewPolicy
  integer reviewPolicyRevision
  varchar_36_ reviewPolicyRevisionId
  text reviewStagesJson
  varchar_24_ state
  timestamp_3__with_time_zone updatedAt
  integer version
}
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
"public.ai_department_work_review_decision" {
  uuid actorId
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_16_ decision
  varchar_36_ departmentId
  varchar_36_ id
  integer priorVersion
  varchar_36_ projectId
  text reason
  varchar_36_ resultId
  varchar_36_ reviewRoundId
  varchar_64_ stageId
  varchar_36_ workId FK
}
"public.ai_department_work_review_round" {
  varchar_64_ activeStageId
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone closedAt
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  integer ordinal
  varchar_36_ policyRevisionId FK
  varchar_36_ projectId
  uuid requesterId
  varchar_16_ requesterKind
  varchar_36_ resultId FK
  varchar_16_ status
  integer version
  varchar_36_ workId FK
}
"public.ai_department_work_submitted_result" {
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  varchar_36_ projectId
  varchar_255_ reference
  text safeSummary
  timestamp_3__with_time_zone submittedAt
  uuid submittedByUserId
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId FK
}
"public.ai_department_work_transition" {
  varchar_36_ actorId
  varchar_16_ actorKind
  varchar_36_ attemptId FK
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_24_ fromState
  varchar_36_ id
  varchar_36_ projectId
  text reason
  varchar_24_ toState
  varchar_36_ workId FK
  integer workVersion
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
