# Research: AI Department Meetings

**Feature**: `008-ai-department-meetings`
**Reviewed**: 2026-11-04
**Evidence boundary**: Current worktree source and existing feature contracts. No meeting
service, migration, API, browser, or provider behavior was implemented or tested here.

## Source findings

| Concern | Source | Observed behavior | Meeting implication |
|---|---|---|---|
| Member hierarchy | `specs/002-ai-department-directory/spec.md`; `packages/cli/src/modules/ai-department/member.service.ts` | A member has a department role and optional manager. Identity is separate from executor binding. | Meetings should select existing member IDs. A manager or facilitator role does not grant approval authority. |
| Agent invocation | `packages/cli/src/modules/agents/agent-department-execution.contracts.ts`; `agent-department-execution.adapter.ts` | `DepartmentExecutor.dispatch` accepts `DepartmentAttemptContext`. That context requires workId, attemptId, member/executor binding, dispatch key, and work instruction. The adapter queues a hidden `n8n_chat` message instructing the Agent to use `department_work`. | The verified department owner contract is specific to work attempts. It does not define a meeting-only invocation. Do not manufacture work attempts or call the queue directly to simulate meeting participation. |
| Work creation | `packages/cli/src/modules/ai-department/work/work.controller.ts`; `work.service.ts` `createWork` | Project `agent:create` protects the route. `requestId` and a payload hash provide replay and conflict handling. New work starts in backlog. | Approved meeting actions can use the existing work command, but meeting-to-work linking and atomic/recoverable coordination need a contract. |
| Workflow invocation | `specs/004-ai-department-workflows/contracts/service-api.md` | Workflow invocation is bound to an active work attempt. G4–G5 remain open and block invocation. | Spec 004 does not currently provide a verified escape hatch for standalone meeting calls. Do not route meeting prompts through its proposed API. |
| Work coordination limits | `specs/feature-contracts/ai-department/coordination.md` | C2-R8 requires coordinator-authorized handoff. The contract excludes autonomous delegation. | A meeting facilitator may draft a synthesis, but cannot silently assign or approve work. |
| Operations UI | `specs/006-ai-department-operations-ui/spec.md`; `tasks.md` | FR-011 requires a member hierarchy surface. Organization and live-operation tasks remain unchecked. | Meeting navigation can be planned as an operations surface after its backend read/write contract is defined. Do not mark current 006 UI as complete. |
| Archive admission | `packages/cli/src/modules/ai-department/active-department-work-guard.contracts.ts`; `ai-department.module.ts`; `department.service.ts`; `member.service.ts` | One work-only guard is registered. Archive acquires the department admission fence and passes `OperationContext` to the guard. | Proposed composite guard returns typed work/meeting blockers under the same fence. Directory/Work owners must confirm the boundary and error contract. |
| Work receipt recovery | `packages/cli/src/modules/ai-department/work/work.service.ts` (`createWork`) | Work creation uses shared project/actor/request ID receipts and payload hashes. Receipt reads are internal to Work persistence; no meeting-facing receipt resolver is defined. | The proposed recovery protocol needs a narrow public Work use case. Do not expose receipt entities or assume a cross-module transaction. |
| Paperclip comparison | Pinned checkout at commit `fea61638114a041ffe60cba178f2438bbb06e57b`; details below | Issue and idempotency key commit together; assignment wake follows issue creation; task tools use a stable source-task key. | Use durable intent, stable keys, and wake separation as patterns. Paperclip does not solve meeting-to-work linking or prove a meeting room. |

## Contract gap

The current department execution contract cannot dispatch a meeting participant without
a work item and attempt. Source review shows that the adapter queues a hidden message
which instructs the Agent to use `department_work`; its lookup and stop operations also
correlate through the work attempt. Existing owner patterns can inform a separate
contract, but they do not establish context isolation, meeting result delivery, or an
authorized standalone call. This is a source-contract gap, not proof that n8n has no
general Agent execution mechanism. See the detailed source mapping in
[`contracts/agents-invocation.md`](contracts/agents-invocation.md).

Before implementation tasks can be generated, the Agents owner must define or confirm a
meeting-compatible operation with:

- project, member, executor binding revision, actor, meeting, participant, and round
  correlation;
- stable idempotency key and lookup after an unknown enqueue result;
- access and binding revalidation before enqueue and result delivery;
- safe contribution/result delivery and clear pending, failed, unavailable, and unknown
  outcomes;
- stop and recovery behavior if meetings can be cancelled while an invocation is active.
- enforceable tool selection, execution limits, context isolation, and the finite
  owner-internal retry policy;
- directory archive/admission coordination and versioned source-snapshot authorization.

The meeting feature must not call internal queue or execution tables directly. It must
not use `DepartmentAttemptContext` with fabricated work or attempt IDs.

## Work creation finding

The existing `createWork` operation is suitable for a separately approved action item:
it accepts an idempotent `requestId`, compares payload hashes on replay, and starts work
in backlog. Its current receipt is scoped to the initiating actor. Source review confirms
that receipt lookup is internal to Work persistence and that no public cross-record
resolver exists. The proposed durable action-item-to-work protocol is in
[`contracts/work-conversion.md`](contracts/work-conversion.md). No current contract proves
that both records can be committed in one transaction.

## Paperclip source comparison

Reviewed local Paperclip commit `fea61638114a041ffe60cba178f2438bbb06e57b`:

- `server/src/services/issues.ts` writes the new issue and its idempotency-key mapping
  in one database transaction. The mapping is unique by company and key and has a
  retention window. The inspected table has no payload hash, so this replay rule is not
  a substitute for Nexora's same-key/different-payload conflict rule.
- `server/src/routes/issues.ts` calls `queueIssueAssignmentWakeup` after issue creation.
  `server/src/services/issue-assignment-wakeup.ts` skips backlog or unassigned issues
  and submits a coalescible durable wake request. This keeps Agent wake separate from
  creating the business record.
- `server/src/services/project-tools.ts` derives child-task idempotency keys from the
  source task and request key. The issue service resolves that key during creation.

This source does not implement a meeting-to-work cross-record link or its receipt
recovery. For Nexora, keep the persisted conversion intent and a stable Work request ID,
then add a narrow Work-owned receipt lookup. Do not infer success from a matching title.
See [`contracts/work-conversion.md`](contracts/work-conversion.md). These observations
describe the pinned checkout only.

## Decisions and unresolved questions

| Topic | Current position | State |
|---|---|---|
| Meeting mode | One independent contribution round for 2–10 members, then synthesis; coordinator can write minutes after synthesis failure | Reviewer-selected product default under delegated judgment |
| Decision authority | Coordinator freezes minutes; each action item is explicitly converted or declined | Reviewer-selected product default under delegated judgment |
| Work creation | Use Spec 003 create contract after approval; backlog and review required; separate start action | Product clarified; cross-record recovery contract open |
| Research tools | Selected, verified read-only tools; supplied-material fallback until owner enforcement is proven | Product clarified; tool enforcement contract open |
| Contribution/synthesis | Structured stance, key points, risks, and proposed action; attributed disagreement; approved prior decisions only | Proposed product defaults; runtime implementation unverified |
| Missing input and cancellation | Quorum or deadline synthesis from a non-empty accepted set; record absences; bounded manual retry; owner-confirmed stop | Proposed product defaults; stop/recovery implementation unverified |
| Access and retention | Current source access on body reads; frozen briefing; no separate v1 purge; active meetings guard archive | Product clarified; owner and persistence contracts open |
| Invocation owner | Agents owns invocation and execution state | Proposed interface drafted in `contracts/agents-invocation.md`; current APIs remain work-attempt scoped and owner review is open |
| Delivery order | Place after 006A; backend follows 002/003 contracts and UI extends the 006A module | Proposed in roadmap; roadmap owner approval remains open |
| Persistence/API | Add meeting-owned records and routes | Proposed model and service API drafted; transaction composition and owner boundaries remain open before tasks |

The Spec Kit [clarification review](clarification-review.md) identifies selected product
defaults, drafted design artifacts, and remaining source-owner gates. Product choices do
not prove owner API support.

## References

- [Feature analysis](feature-analysis.md)
- [Product specification](spec.md)
- [Department execution contract](../../packages/cli/src/modules/agents/agent-department-execution.contracts.ts)
- [Department execution adapter](../../packages/cli/src/modules/agents/agent-department-execution.adapter.ts)
- [Work create endpoint](../../packages/cli/src/modules/ai-department/work/work.controller.ts)
- [Work service](../../packages/cli/src/modules/ai-department/work/work.service.ts)
- [Workflow service contract](../004-ai-department-workflows/contracts/service-api.md)
- [Coordination contract](../feature-contracts/ai-department/coordination.md)
