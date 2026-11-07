# public.ai_department_meeting_minutes

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| approvedAt | timestamp(3) with time zone |  | true |  |  |  |
| approvedBy | uuid |  | true |  |  |  |
| authoredBy | uuid |  | false |  |  |  |
| createdAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |
| departmentId | varchar(36) |  | false |  |  |  |
| disagreements | json |  | false |  |  | Attributed opposing positions preserved by the minutes |
| id | varchar(36) |  | false | [public.ai_department_meeting_action_item](public.ai_department_meeting_action_item.md) [public.ai_department_meeting_decision](public.ai_department_meeting_decision.md) |  |  |
| meetingId | varchar(36) |  | false |  | [public.ai_department_meeting](public.ai_department_meeting.md) |  |
| projectId | varchar(36) |  | false |  |  |  |
| revision | integer |  | false |  |  |  |
| sourceContributionIds | json |  | false |  |  | Contribution references used by the minutes |
| state | varchar(16) | 'draft'::character varying | false |  |  | Whether the minutes revision is a draft or approved |
| summary | text |  | false |  |  |  |
| updatedAt | timestamp(3) with time zone | CURRENT_TIMESTAMP(3) | false |  |  |  |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| CHK_ai_department_meeting_minutes_state | CHECK | CHECK (((state)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying])::text[]))) |
| FK_1f619caf8a4e889327368a4daf6 | FOREIGN KEY | FOREIGN KEY ("meetingId") REFERENCES ai_department_meeting(id) ON DELETE CASCADE |
| PK_04fb132f583027da3a62532b862 | PRIMARY KEY | PRIMARY KEY (id) |
| ai_department_meeting_minutes_authoredBy_not_null | n | NOT NULL "authoredBy" |
| ai_department_meeting_minutes_createdAt_not_null | n | NOT NULL "createdAt" |
| ai_department_meeting_minutes_departmentId_not_null | n | NOT NULL "departmentId" |
| ai_department_meeting_minutes_disagreements_not_null | n | NOT NULL disagreements |
| ai_department_meeting_minutes_id_not_null | n | NOT NULL id |
| ai_department_meeting_minutes_meetingId_not_null | n | NOT NULL "meetingId" |
| ai_department_meeting_minutes_projectId_not_null | n | NOT NULL "projectId" |
| ai_department_meeting_minutes_revision_not_null | n | NOT NULL revision |
| ai_department_meeting_minutes_sourceContributionIds_not_null | n | NOT NULL "sourceContributionIds" |
| ai_department_meeting_minutes_state_not_null | n | NOT NULL state |
| ai_department_meeting_minutes_summary_not_null | n | NOT NULL summary |
| ai_department_meeting_minutes_updatedAt_not_null | n | NOT NULL "updatedAt" |

## Indexes

| Name | Definition |
| ---- | ---------- |
| IDX_6bff6f4fe7ef7470c4c48dff80 | CREATE UNIQUE INDEX "IDX_6bff6f4fe7ef7470c4c48dff80" ON public.ai_department_meeting_minutes USING btree ("meetingId", revision) |
| IDX_c581979371ed89c49cbfaafd46 | CREATE INDEX "IDX_c581979371ed89c49cbfaafd46" ON public.ai_department_meeting_minutes USING btree ("projectId", "meetingId", state) |
| PK_04fb132f583027da3a62532b862 | CREATE UNIQUE INDEX "PK_04fb132f583027da3a62532b862" ON public.ai_department_meeting_minutes USING btree (id) |

## Relations

```mermaid
erDiagram

"public.ai_department_meeting_action_item" }o--|| "public.ai_department_meeting_minutes" : "FOREIGN KEY (#quot;minutesId#quot;) REFERENCES ai_department_meeting_minutes(id) ON DELETE CASCADE"
"public.ai_department_meeting_decision" }o--|| "public.ai_department_meeting_minutes" : "FOREIGN KEY (#quot;minutesId#quot;) REFERENCES ai_department_meeting_minutes(id) ON DELETE CASCADE"
"public.ai_department_meeting_minutes" }o--|| "public.ai_department_meeting" : "FOREIGN KEY (#quot;meetingId#quot;) REFERENCES ai_department_meeting(id) ON DELETE CASCADE"

"public.ai_department_meeting_minutes" {
  timestamp_3__with_time_zone approvedAt
  uuid approvedBy
  uuid authoredBy
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  json disagreements
  varchar_36_ id
  varchar_36_ meetingId FK
  varchar_36_ projectId
  integer revision
  json sourceContributionIds
  varchar_16_ state
  text summary
  timestamp_3__with_time_zone updatedAt
}
"public.ai_department_meeting_action_item" {
  timestamp_3__with_time_zone approvedAt
  uuid approvedBy
  varchar_36_ assigneeMemberId FK
  varchar_36_ conversionRequestId
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  text description
  varchar_36_ id
  varchar_36_ meetingId FK
  varchar_36_ minutesId FK
  varchar_64_ payloadHash
  varchar_36_ projectId
  text resolutionReason
  timestamp_3__with_time_zone resolvedAt
  json sourceContributionIds
  varchar_24_ state
  varchar_256_ title
  timestamp_3__with_time_zone updatedAt
  varchar_36_ workId
}
"public.ai_department_meeting_decision" {
  timestamp_3__with_time_zone approvedAt
  uuid approvedBy
  timestamp_3__with_time_zone createdAt
  varchar_36_ departmentId
  varchar_36_ id
  varchar_36_ meetingId FK
  varchar_36_ minutesId FK
  varchar_36_ projectId
  json sourceContributionIds
  varchar_16_ state
  text text
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
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
