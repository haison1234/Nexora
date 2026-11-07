# Data Model: AI Department Work Coordination

**Status**: Proposed design. Owner acceptance and migration checks remain open.

All department records use the current project and department scope. Use stable IDs,
version checks, and audit timestamps. Store safe business content only. Agent prompts,
credentials, checkpoints, raw provider output, and cost records remain with their owners.

## Completion report

The report belongs to the current Work attempt and is written as one immutable activity
record when `submit` succeeds.

| Field | Type | Rule |
|---|---|---|
| `result` | text | Required, non-empty, maximum 4,000 characters. |
| `completedWork` | list of text | Up to 10 items, 500 characters per item. |
| `checkedEvidence` | list of safe references and summaries | Up to 10 items. Each reference must resolve within the authorized Work or attempt scope. |
| `openIssues` | list of text | Up to 10 items, 500 characters per item. |
| `nextSteps` | list of text | Up to 10 items, 500 characters per item. |

The server stores the validated report in Work activity and a safe bounded summary on the
attempt for existing review projections. Do not store unverified claims as evidence
references.

## Work assignment actor

Store `assignedByUserId` on Work. Set it when a user assigns or reassigns the current
member. Keep it separate from the attempt's `initiatingUserId`, which records who starts
an execution. Historical records with no reliable assignment actor keep null and cannot
use the assigning-person fallback.

## Member expertise

Add a list of normalized expertise tags to the stable department member record. Tags are
maintained by an authorized coordinator. Normalize case and whitespace. Reject duplicate
tags, empty tags, and values beyond documented count and length limits. Role text remains
display metadata and is not used as a routing signal.

## Help request

Unique request ID. Link the request to its project, department, Work, requester member,
source attempt, initiating user, and idempotent command. Store question, attempted steps,
reason, requested expertise tags, request-chain IDs, selected recipient, fallback stage,
binding revision, input hash, deadline, response state, owner reference, version, and audit
times. Bound the question at 2,000 characters, reason at 1,000 characters, attempted steps
to 10 items of 500 characters, and expertise tags to five values of 64 characters each.
Use a proposed 10-minute deadline per recipient stage. Never change the Work assignee as
a side effect of asking.

Request states are `pending_stop`, `queued`, `awaiting_answer`, `answered`, `escalating`,
`expired`, `failed`, and `cancelled`. Only a durably stored answer or a fully resolved
terminal escalation can release the requester continuation. A stop request alone does not
advance state past `pending_stop`.

Enforce one accepted answer per request. Keep retries as invocation attempts under the
same help request identity. Keep the request chain immutable after dispatch. Limit two
help requests per Work completion cycle, including resumed attempts.

## Help response

Link one response to one help request and its Work activity. Store responder kind (`agent`
or `user`), responder member or user ID, bounded answer text, answer hash, source attempt
or owner invocation reference, terminal owner sequence when applicable, and creation time.
Do not store the Agent prompt or full runtime transcript.

An Agent response can be accepted only after the Agents owner confirms terminal success
and the response passes the proposed 1,000-token and 4,000-character limits. A human response requires current
project authorization at write time. A response is information only.

## Delegated child Work

Use an existing Work item plus `parent` and `blocks` relationships. The child belongs to
the same project and department. Set `workId` to the child and `relatedWorkId` to the
parent for both edges. The `blocks` edge makes the child an unresolved blocker for the
parent. Store its creator and stable command receipt through the existing Work contracts.
Parent Work cannot resume or submit while the child remains unresolved. A single
transaction or recoverable command must prevent an orphaned child or duplicate
relationship on retry.

The recipient must be an active, bound direct report of the current Agent member. Copy
the parent's `goalId`; do not copy its claim, executor binding, capability list, or
runtime state. A ready child creates one `WorkEligibility` row and advances its
`WorkWakeLane` in the same project transaction. It also creates one undelivered
`WorkWakeIntent`. The lane identity uses the child's member, current binding revision, and
initiating user. The existing dispatcher rechecks authorization and blockers before it
reserves the child. The org tree is acyclic and each subsequent delegation must move to a
direct report, which bounds the chain without recursive system fan-out.

Workflow access is not stored on the child Work. The child member's enabled
`WorkflowCapability` remains the only grant. Invocation follows C5 and stays disabled
until its owner gates pass.

## Parent report and continuation

The parent Work projection includes each authorized child's state and structured report.
Do not copy child prompts, runtime traces, or private execution data into the parent.
Resolve a parent blocker only when its child reaches `done`; cancellation remains blocking.
The parent Agent explicitly releases its attempt with the `waiting_for_children` reason.
Persist this reason in the release intent and use it as the continuation marker. Other
release reasons do not enable automatic parent resume.
When the final blocker resolves, wake the parent only if its current attempt is terminal.
In one transaction, move the blocked parent to ready, write its next eligibility and wake
intent, and use its current assignee, binding revision, and stored assignment actor. If the
parent attempt is active or unknown, keep the parent blocked and run the same check after
terminal confirmation. Use stable child completion identity so duplicate events do not
advance the lane twice.

## State and concurrency

- A help request and its Work transition are committed atomically before any Agents owner
  call. The external call occurs after commit.
- The requester stays the Work assignee. The current owner turn must be confirmed terminal
  before the request waits for a response.
- A response is committed before continuation. After the old attempt is terminal, move
  the Work from blocked to ready and create a new eligibility generation only when no
  other blocker remains. If a blocker remains, keep the Work blocked and do not wake it.
- Wake delivery is coalesced and idempotent by stable request and response identity.
- The next continuation uses a new eligibility generation. It checks current project
  access, member state, binding revision, and Work version before dispatch.
- Unknown owner state remains unresolved. Do not retry with a new invocation key or start
  a second continuation until the original invocation is reconciled.
- Late or duplicate replies cannot replace an accepted response or rewrite a newer Work
  state.
- Timeout escalation is bounded to the manager and then the assignment actor. Deduplicate
  each fallback stage.
- Work activity, transition, and response records carry actor and time. No protected
  content is sent over a project-unscoped event.

## Meeting retirement

Spec 008 meeting tables remain readable under current authorization during UI removal.
Do not include a destructive migration in the initial coordination release. Add a later
retirement migration only after retention, export, backup, and rollback requirements are
approved. Preserve records or migrate them to an archive before dropping tables.
