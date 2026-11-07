# public.ai_department_work_help_request

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| attemptedStepsJson | text |  | false |  |  | Bounded help request steps |
| bindingVersion | integer |  | true |  |  | Executor binding revision used for routing |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| deadlineAt | timestamp(3) with time zone |  | true |  |  |  |
| departmentId | varchar(36) |  | false |  | [public.ai_department](public.ai_department.md) |  |
| expertiseTagsJson | text |  | false |  |  | Normalized routing tags |
| id | varchar(36) |  | false | [public.agent_department_consultation_invocation](public.agent_department_consultation_invocation.md) [public.ai_department_work_help_response](public.ai_department_work_help_response.md) |  |  |
| initiatingUserId | uuid |  | true |  | [public.user](public.user.md) | User who initiated the help request |
| inputHash | varchar(64) |  | false |  |  |  |
| ownerInvocationHash | varchar(64) |  | true |  |  |  |
| ownerReference | varchar(128) |  | true |  |  |  |
| projectId | varchar(36) |  | false |  | [public.project](public.project.md) |  |
| question | text |  | false |  |  |  |
| reason | text |  | false |  |  |  |
| recipientMemberId | varchar(36) |  | true |  | [public.ai_department_member](public.ai_department_member.md) |  |
| recipientUserId | uuid |  | true |  | [public.user](public.user.md) |  |
| requestChainJson | text |  | false |  |  | Recipient and request chain state |
| requestId | varchar(36) |  | false |  |  |  |
| requesterMemberId | varchar(36) |  | false |  | [public.ai_department_member](public.ai_department_member.md) |  |
| routingState | varchar(32) |  | false |  |  | Selected deterministic routing stage |
| sourceAttemptId | varchar(36) |  | false |  | [public.ai_department_work_attempt](public.ai_department_work_attempt.md) |  |
| state | varchar(24) | 'pending_stop'::character varying | false |  |  | Help request lifecycle state |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| version | integer | 1 | false |  |  |  |
| workId | varchar(36) |  | false |  | [public.ai_department_work_item](public.ai_department_work_item.md) |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| CHK_ai_department_work_help_request_routingState | CHECK | CHECK ((("routingState")::text = ANY ((ARRAY['specialist'::character varying, 'manager_fallback'::character varying, 'assignment_actor_fallback'::character varying, 'unresolved'::character varying])::text[]))) |
| CHK_ai_department_work_help_request_state | CHECK | CHECK (((state)::text = ANY ((ARRAY['pending_stop'::character varying, 'queued'::character varying, 'awaiting_answer'::character varying, 'answered'::character varying, 'escalating'::character varying, 'expired'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[]))) |
| FK_41cca1db9e76943cd6f93e9c573 | FOREIGN KEY | FOREIGN KEY ("projectId") REFERENCES project(id) ON DELETE CASCADE |
| FK_4a9ec7855d9d1a848feec1cc7f6 | FOREIGN KEY | FOREIGN KEY ("recipientMemberId") REFERENCES ai_department_member(id) ON DELETE SET NULL |
| FK_4df918e1c6ffc1f3e35f450ec75 | FOREIGN KEY | FOREIGN KEY ("workId") REFERENCES ai_department_work_item(id) ON DELETE CASCADE |
| FK_5ddfbc0ddd7cdcc59bd6c5d887c | FOREIGN KEY | FOREIGN KEY ("initiatingUserId") REFERENCES "user"(id) ON DELETE SET NULL |
| FK_94c0e6a11cbf26dda4a6a9f58c5 | FOREIGN KEY | FOREIGN KEY ("requesterMemberId") REFERENCES ai_department_member(id) ON DELETE CASCADE |
| FK_d746422a09ac94b8c2129babb58 | FOREIGN KEY | FOREIGN KEY ("sourceAttemptId") REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE |
| FK_dbacd08ca0466c626113bf49027 | FOREIGN KEY | FOREIGN KEY ("departmentId") REFERENCES ai_department(id) ON DELETE CASCADE |
| PK_dd81dee2c11df7d3a46c6b34e08 | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_work_help_request_attemptedStepsJson_not_null | n | NOT NULL "attemptedStepsJson" |
| ai_department_work_help_request_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_work_help_request_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_work_help_request_expertiseTagsJson_not_null | n | NOT NULL "expertiseTagsJson" |
| ai_department_work_help_request_id_not_null | n | NOT NULL id |
| ai_department_work_help_request_inputHash_not_null | n | NOT NULL "inputHash" |
| ai_department_work_help_request_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_work_help_request_question_not_null | n | NOT NULL question |
| ai_department_work_help_request_reason_not_null | n | NOT NULL reason |
| ai_department_work_help_request_recipientUserId_fkey | FOREIGN KEY | FOREIGN KEY ("recipientUserId") REFERENCES "user"(id) ON DELETE SET NULL |
| ai_department_work_help_request_requestChainJson_not_null | n | NOT NULL "requestChainJson" |
| ai_department_work_help_request_requestId_not_null | n | NOT NULL "requestId" |
| ai_department_work_help_request_requesterMemberId_not_null | n | NOT NULL "requesterMemberId" |
| ai_department_work_help_request_routingState_not_null | n | NOT NULL "routingState" |
| ai_department_work_help_request_sourceAttemptId_not_null | n | NOT NULL "sourceAttemptId" |
| ai_department_work_help_request_state_not_null | n | NOT NULL state |
| ai_department_work_help_request_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_work_help_request_version_not_null | n | NOT NULL version |
| ai_department_work_help_request_workId_not_null | n | NOT NULL "workId" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_63eb193a370876c6b357d5a51f | CREATE INDEX "IDX_63eb193a370876c6b357d5a51f" ON public.ai_department_work_help_request USING btree ("projectId", "departmentId", "workId", "createdAt") |
| IDX_763f82fe1b9e605925747d52bf | CREATE UNIQUE INDEX "IDX_763f82fe1b9e605925747d52bf" ON public.ai_department_work_help_request USING btree ("projectId", "initiatingUserId", "requestId") |
| IDX_f3a13473c2e6d7fd4b0cf63928 | CREATE INDEX "IDX_f3a13473c2e6d7fd4b0cf63928" ON public.ai_department_work_help_request USING btree ("projectId", "departmentId", state, "deadlineAt") |
| PK_dd81dee2c11df7d3a46c6b34e08 | CREATE UNIQUE INDEX "PK_dd81dee2c11df7d3a46c6b34e08" ON public.ai_department_work_help_request USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_work_help_request" }o--|| "public.ai_department" : "FOREIGN KEY (#quot;departmentId#quot;) REFERENCES ai_department(id) ON DELETE CASCADE"
"public.agent_department_consultation_invocation" }o--|| "public.ai_department_work_help_request" : "FOREIGN KEY (#quot;helpRequestId#quot;) REFERENCES ai_department_work_help_request(id) ON DELETE CASCADE"
"public.ai_department_work_help_response" }o--|| "public.ai_department_work_help_request" : "FOREIGN KEY (#quot;helpRequestId#quot;) REFERENCES ai_department_work_help_request(id) ON DELETE CASCADE"
"public.ai_department_work_help_request" }o--o| "public.user" : "FOREIGN KEY (#quot;initiatingUserId#quot;) REFERENCES #quot;user#quot;(id) ON DELETE SET NULL"
"public.ai_department_work_help_request" }o--|| "public.project" : "FOREIGN KEY (#quot;projectId#quot;) REFERENCES project(id) ON DELETE CASCADE"
"public.ai_department_work_help_request" }o--o| "public.ai_department_member" : "FOREIGN KEY (#quot;recipientMemberId#quot;) REFERENCES ai_department_member(id) ON DELETE SET NULL"
"public.ai_department_work_help_request" }o--o| "public.user" : "FOREIGN KEY (#quot;recipientUserId#quot;) REFERENCES #quot;user#quot;(id) ON DELETE SET NULL"
"public.ai_department_work_help_request" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;requesterMemberId#quot;) REFERENCES ai_department_member(id) ON DELETE CASCADE"
"public.ai_department_work_help_request" }o--|| "public.ai_department_work_attempt" : "FOREIGN KEY (#quot;sourceAttemptId#quot;) REFERENCES ai_department_work_attempt(id) ON DELETE CASCADE"
"public.ai_department_work_help_request" }o--|| "public.ai_department_work_item" : "FOREIGN KEY (#quot;workId#quot;) REFERENCES ai_department_work_item(id) ON DELETE CASCADE"

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
"public.user" {
  timestamp_3__with_time_zone createdAt
  boolean disabled
  varchar_255_ email
  varchar_32_ firstName
  uuid id
  varchar_16_ kind
  date lastActiveAt
  varchar_32_ lastName
  boolean mfaEnabled
  text mfaRecoveryCodes
  text mfaSecret
  varchar_255_ password
  json personalizationAnswers
  varchar_128_ roleSlug FK
  json settings
  timestamp_3__with_time_zone updatedAt
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
