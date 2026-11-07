# Feature Analysis: AI Department Meetings

**Feature ID**: `008-ai-department-meetings`
**Date**: 2026-11-04
**Status**: Product defaults clarified on 2026-11-04 under user-delegated judgment.
  Source-owner contracts and delivery order need review.
**Reference review**: Paperclip source checkout `/tmp/paperclip-source-light`, HEAD `8ea240218dc1d3a94afea1294b377021045dd9c9`.

## User need

A coordinator wants to give a department one topic and receive distinct member input,
a clear summary, recorded decisions, and proposed work. The coordinator must see which
members responded and approve decisions before they become executable work.

## Paperclip behavior observed

- Agent records belong to a company and include a role, title, runtime settings, and an
  optional `reportsTo` Agent reference.
- The org service groups Agents by `reportsTo` and returns a hierarchy. The org route
  checks company access before returning it.
- Paperclip uses issues, assignment, heartbeat wakeups, Agent pickup, comments, child
  issues, and review to coordinate work asynchronously.
- The inspected core schemas and services do not define a shared, live multi-Agent
  meeting room. Meeting-related integrations and routines are not the same as Agents
  holding a live conversation with each other.

These findings describe the inspected checkout. They do not claim that every Paperclip
release has the same behavior.

For work conversion recovery, the pinned Paperclip checkout commits an issue and its
idempotency-key mapping in one transaction, then requests an Agent wake after creation.
Its task tool uses a stable key derived from the source task. This informs the Nexora
design, but Paperclip does not model a meeting action item that must link to a separately
created work record. See [Work conversion contract](contracts/work-conversion.md).

## Current AI Department baseline

- Spec 002 defines department members, roles, and one optional manager within a
  department. Spec 006 requires the UI to show that hierarchy, but its organization
  tasks remain unchecked.
- Spec 003 defines goals, work relationships, activity, member inboxes, claims, reports,
  and coordinator-authorized handoff. Its coordination contract excludes autonomous
  delegation loops and recurring execution.
- Current evidence leaves real Agent wake, stop, restart, and provider acceptance gates
  open. The user's recent Agent run failed after the provider's free-model daily quota.
- No inspected AI Department contract or UI defines meetings, participant contributions,
  minutes, meeting decisions, or meeting-created action items.

## Proposed product direction

Build a persisted, asynchronous department meeting. A coordinator creates a meeting with
a topic, goal, selected members, and optional references to existing goals or work.
Each participant submits an independent contribution under its own verified executor
binding using a bounded structured response. A designated facilitator prepares a draft
summary that attributes disagreements and does not average conflicting positions. The
coordinator reviews the record and explicitly approves decisions or action items. Only
approved action items create ordinary department work.

New meetings may carry forward selected coordinator-approved decisions from earlier
meetings. They do not inherit prior minutes, contributions, or private conversation
history. Purpose templates reduce setup work. v1 remains one contribution round; a second
bounded round is a later option only after v1 runtime acceptance.

The first release should not implement free-form Agent-to-Agent chat, automatic CEO
behavior, unsupervised delegation, or a live shared room. Store contributions and
decisions as meeting records. Do not treat a generated summary as a decision until a
coordinator approves it.

## Candidate lifecycle

`draft → collecting → synthesizing → review → approved → completed`

Cancellation uses `cancelling → cancelled` until accepted invocations are terminal.
The [spec](spec.md) defines lifecycle transitions, partial participation, retry limits,
facilitator failure, contribution acceptance, and meeting completion.

## Proposed ownership boundaries

- AI Department owns meeting, participant, contribution, draft minutes, and decision
  records, plus project authorization and audit history.
- Agents owns Agent invocation, execution identity, runtime prompts, credentials,
  checkpoints, and stop/recovery proof.
- Work management owns work items and their business lifecycle. Meeting approval may
  request work creation through its public contract; it must not write work tables.
- The operations UI presents and edits authorized meeting records. It does not own
  meeting state.

These are proposed boundaries. Verify current owner APIs before designing implementation
tasks. Do not enable model dispatch while the relevant owner and provider gates are open.

## Remaining design work

1. Does the current Agents owner support an idempotent invocation that is not a work
   attempt? If not, define a narrow owner contract or use an explicitly supported
   workflow capability. Do not bypass the owner.
2. Define owner-enforced read-only tool selection. Until that restriction is verified,
   use supplied material only. Do not trust tool names, annotations, or prompt guidance.
3. Define durable action-item conversion and reconciliation through the work contract.
   Approval creates backlog work with review required; start remains a separate action.
4. Define the authorized briefing snapshot and derived-content read contract. Apply the
   visibility and retention rules in the spec without copying runtime prompts.
5. Extend directory admission/archival checks to include active meetings. Verify the
   transaction boundary before generating those implementation tasks.

The [clarification review](clarification-review.md) records selected product defaults and
the remaining technical gates. They are distinct from runtime acceptance.

## Related specifications

- [Directory](../002-ai-department-directory/spec.md)
- [Work management](../003-ai-department-work-management/spec.md)
- [Operations UI](../006-ai-department-operations-ui/spec.md)
- [Shared product design](../AI-DEPARTMENT-DESIGN.md)
- [Paperclip parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md)
