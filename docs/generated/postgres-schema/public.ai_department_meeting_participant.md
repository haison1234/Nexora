# public.ai_department_meeting_participant

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| bindingVersion | integer |  | true |  |  |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| exclusionReason | text |  | true |  |  |  |
| executorId | varchar(36) |  | true |  |  |  |
| facilitator | boolean | false | false |  |  |  |
| id | varchar(36) |  | false | [public.ai_department_meeting_contribution](public.ai_department_meeting_contribution.md) [public.ai_department_meeting_invocation](public.ai_department_meeting_invocation.md) |  |  |
| meetingId | varchar(36) |  | false |  | [public.ai_department_meeting](public.ai_department_meeting.md) |  |
| memberId | varchar(36) |  | false |  | [public.ai_department_member](public.ai_department_member.md) |  |
| memberNameSnapshot | varchar(128) |  | false |  |  |  |
| projectId | varchar(36) |  | false |  |  |  |
| responseState | varchar(16) | 'pending'::character varying | false |  |  | The department-owned response state of the participant |
| roleSnapshot | varchar(128) |  | false |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| version | integer | 1 | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| CHK_ai_department_meeting_participant_responseState | CHECK | CHECK ((("responseState")::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying, 'running'::character varying, 'submitted'::character varying, 'failed'::character varying, 'unavailable'::character varying, 'stop_pending'::character varying, 'unknown'::character varying, 'excluded'::character varying])::text[]))) |
| FK_0b535f07f412fb11017e4d54e7c | FOREIGN KEY | FOREIGN KEY ("meetingId") REFERENCES ai_department_meeting(id) ON DELETE CASCADE |
| FK_cc4509fb12beb11004df7348379 | FOREIGN KEY | FOREIGN KEY ("memberId") REFERENCES ai_department_member(id) ON DELETE RESTRICT |
| PK_7d0845a600946694e70a2e255e9 | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_meeting_participant_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_meeting_participant_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_meeting_participant_facilitator_not_null | n | NOT NULL facilitator |
| ai_department_meeting_participant_id_not_null | n | NOT NULL id |
| ai_department_meeting_participant_meetingId_not_null | n | NOT NULL "meetingId" |
| ai_department_meeting_participant_memberId_not_null | n | NOT NULL "memberId" |
| ai_department_meeting_participant_memberNameSnapshot_not_null | n | NOT NULL "memberNameSnapshot" |
| ai_department_meeting_participant_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_meeting_participant_responseState_not_null | n | NOT NULL "responseState" |
| ai_department_meeting_participant_roleSnapshot_not_null | n | NOT NULL "roleSnapshot" |
| ai_department_meeting_participant_updatedAt_not_null | n | NOT NULL "updatedAt" |
| ai_department_meeting_participant_version_not_null | n | NOT NULL version |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_b86090d9b77ded810ab05237e8 | CREATE INDEX "IDX_b86090d9b77ded810ab05237e8" ON public.ai_department_meeting_participant USING btree ("projectId", "departmentId", "memberId", "meetingId") |
| IDX_c72bbf9f44830ab23ef2007eb2 | CREATE UNIQUE INDEX "IDX_c72bbf9f44830ab23ef2007eb2" ON public.ai_department_meeting_participant USING btree ("meetingId", "memberId") |
| PK_7d0845a600946694e70a2e255e9 | CREATE UNIQUE INDEX "PK_7d0845a600946694e70a2e255e9" ON public.ai_department_meeting_participant USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_meeting_contribution" }o--|| "public.ai_department_meeting_participant" : "FOREIGN KEY (#quot;participantId#quot;) REFERENCES ai_department_meeting_participant(id) ON DELETE CASCADE"
"public.ai_department_meeting_invocation" }o--|| "public.ai_department_meeting_participant" : "FOREIGN KEY (#quot;participantId#quot;) REFERENCES ai_department_meeting_participant(id) ON DELETE CASCADE"
"public.ai_department_meeting_participant" }o--|| "public.ai_department_meeting" : "FOREIGN KEY (#quot;meetingId#quot;) REFERENCES ai_department_meeting(id) ON DELETE CASCADE"
"public.ai_department_meeting_participant" }o--|| "public.ai_department_member" : "FOREIGN KEY (#quot;memberId#quot;) REFERENCES ai_department_member(id) ON DELETE RESTRICT"

"public.ai_department_meeting_participant" {
  integer bindingVersion
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  text exclusionReason
  varchar_36_ executorId
  boolean facilitator
  varchar_36_ id
  varchar_36_ meetingId FK
  varchar_36_ memberId FK
  varchar_128_ memberNameSnapshot
  varchar_36_ projectId
  varchar_16_ responseState
  varchar_128_ roleSnapshot
  timestamp_3__with_time_zone updatedAt
  integer version
}
"public.ai_department_meeting_contribution" {
  timestamp_3__with_time_zone acceptedAt
  json contribution
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  varchar_36_ invocationId FK
  varchar_36_ meetingId FK
  varchar_36_ participantId FK
  varchar_36_ projectId
  json sourceContributionIds
}
"public.ai_department_meeting_invocation" {
  uuid actorId
  integer bindingVersion
  varchar_255_ contextRef
  timestamp_3__with_time_zone createdAt
  timestamp_3__with_time_zone deadlineAt
  varchar_36_ departmentId
  varchar_36_ executorId
  varchar_36_ id
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
  timestamp_3__with_time_zone terminalAt
  timestamp_3__with_time_zone updatedAt
}
"public.ai_department_meeting" {
  json absenceSnapshots
  varchar_16_ collectionCloseReason
  timestamp_3__with_time_zone collectionClosedAt
  timestamp_3__with_time_zone collectionDeadlineAt
  timestamp_3__with_time_zone completedAt
  timestamp_3__with_time_zone createdAt
  uuid createdBy
  varchar_36_ departmentId FK
  text desiredOutcome
  uuid executionActorId
  varchar_36_ facilitatorMemberId FK
  json frozenContributionIds
  varchar_36_ goalId
  varchar_36_ id
  varchar_36_ projectId FK
  varchar_16_ purpose
  json referencedWorkIds
  timestamp_3__with_time_zone startedAt
  varchar_16_ state
  varchar_256_ topic
  timestamp_3__with_time_zone updatedAt
  integer version
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
