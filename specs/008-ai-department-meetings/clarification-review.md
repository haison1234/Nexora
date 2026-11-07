# Spec Kit Clarification Review: AI Department Meetings

**Date**: 2026-11-04
**Method**: Repository `speckit.clarify` taxonomy; manual cross-document consistency review.
**Scope**: spec.md, feature-analysis.md, research.md, plan.md, and constitution 2.0.0.
**Result**: Product defaults clarified. Phase 1 design artifacts drafted. Owner/source contracts and implementation readiness remain open.

## Procedure and authority

The paths-only prerequisite check used `SPECIFY_FEATURE_DIRECTORY` to select Spec 008.
It did not persist a feature pointer or create a branch. The pointer still selects 004.
No `.specify/extensions.yml` hook file was present.

One question was presented about meeting tool permissions. The user delegated the answer
and subsequent product choices to the reviewer. The review selected verified read-only
research tools with supplied-material fallback. No further user questions were asked.
The spec clarification log records that single question and its delegated answer.

The task list now exists as a draft. The full `speckit.analyze` task-coverage review has
not yet run. No task coverage or implementation readiness is claimed.

## Findings and disposition

| ID | Severity | Original ambiguity | Resolution |
|---|---|---|---|
| C01 | High | Meeting invocations could inherit write tools from a saved Agent. | Permit only selected tools whose read-only operation the owner can enforce. Otherwise use supplied material. Technical enforcement gate remains open. |
| C02 | High | Facilitator was optional and synthesis failure had no fallback. | Require one participant facilitator. Allow coordinator-written draft minutes after failure, with normal source and approval rules. |
| C03 | High | Participant entities mentioned rounds while scope promised one round. | Define 2–10 distinct participants, one independent contribution round, and one synthesis. Store retries separately. |
| C04 | High | Candidate lifecycle omitted synthesis, pending stop, and completion criteria. | Add explicit lifecycle table. Completion resolves action items and meeting invocations; it does not depend on work completion. |
| C05 | High | Unknown dispatch, deadlines, and quota failure could cause duplicate or endless execution. | Define proposed deadlines, one explicit retry per failed call, no meeting-level automatic retries, and terminal proof before replacement. Owner retry limits remain a contract requirement. |
| C06 | High | Missing participation and all-failed meetings had no synthesis rule. | Use a default `ceil(2N/3)` quorum. At deadline, synthesize from any non-empty accepted set and record absent members. Preserve attributed disagreements. |
| C07 | High | Approving minutes could imply automatic work execution. | Freeze approved minutes; require individual convert/decline actions. Created work is backlog with review required; start is a separate command. |
| C08 | High | Source context, binding changes, and actor replacement had no stable authority rule. | Freeze briefing and binding revisions. Recheck source access. Require explicit responsibility for later dispatch by another user. Verify owner APIs in design. |
| C09 | Medium | Archive, retention, late outputs, and concurrent edits were delegated to contracts that did not mention meetings. | Define product requirements explicitly. Mark the directory guard integration as new work. Keep runtime retention with Agents. |
| C10 | Medium | UI requirements omitted disconnected, stale, partial-failure and pending-stop behavior. | Add observable view states, authoritative refresh, keyboard/locale/reduced-motion and 360 CSS pixel acceptance. |
| C11 | High | Plan claimed Phase 0 complete while owner-contract research remained open. It also required gates to close before the design needed to close them. | Correct Phase 0 status. Permit design work now; keep task generation gated by unresolved contract choices and runtime enablement gated by acceptance. |
| C12 | Medium | Plan constitution table omitted repository evidence as an explicit principle. | Add principle I and mark current access/tool enforcement blocked for implementation. |
| C13 | High | Free-form contributions could be long and hard to compare. | Require a bounded structured response and reject malformed output. Compare members side by side. |
| C14 | High | Smooth synthesis could hide conflicting positions. | Attribute opposing positions in draft minutes. Do not imply consensus without coordinator approval. |
| C15 | Medium | New meetings could not carry approved decisions forward without broad history. | Allow selected, currently authorized coordinator-approved decisions only; exclude minutes and contributions. |
| C16 | Medium | Repeated meeting setup could exceed the two-minute target. | Provide editable purpose templates with prefilled questions and output guidance. |
| C17 | Medium | A follow-up round could expand v1 or trigger unbounded discussion. | Keep v1 to one round. Record one bounded coordinator-triggered round for a later release after v1 runtime acceptance. |

## Coverage summary

| Clarification category | Status | Evidence or remaining work |
|---|---|---|
| Functional scope and behavior | Resolved | Single round, facilitator, exclusions, approval, conversion, completion. |
| Domain and data model | Drafted; owner review open | Proposed identity, limits, snapshots, states, retention, and transaction boundaries are in `data-model.md`. |
| Interaction and UX flow | Drafted; design review open | Primary actions and view states are in `design.md`; source-access visibility and owner result states need review. |
| Non-functional quality | Partial; design deferred | Bounded participants, calls, deadlines and recovery requirements defined. Provider limits, context size, observability details and measured performance remain design/acceptance work. |
| Integration and dependencies | Proposed contracts drafted; owner review open | Standalone invocation, result publication, tool enforcement, composite directory guard, and work conversion recovery need owner acceptance. |
| Edge cases and failures | Resolved for product | Missing input, unknown calls, timeout, retry, stop, quota, binding/access changes, stale commands and late output. |
| Constraints and tradeoffs | Clear | One project/department, owned runtimes, full 2D, one round, no autonomous management. |
| Terminology and consistency | Resolved | Canonical lifecycle and separation of business, participant, invocation, and work state. |
| Completion signals | Resolved for product | Meeting completion and six measurable acceptance criteria specified. Runtime evidence remains required later. |
| Placeholders and unresolved decisions | Owner decisions remain | Agents, Work, and Directory must accept the proposed contracts and transaction details. The roadmap owner must approve the proposed 006A → 008 placement. |

## Next step and readiness

Continue the Spec Kit planning workflow for 008. The meeting-compatible Agents contract,
work-conversion recovery protocol, data model, current-access/source contract, directory
guard design, API contract, UI design, quickstart, and proposed roadmap placement are now
drafted. A 33-item task list records proposed work; T001 API types, T002 persistence, and
T003 composed repositories are implemented, while the remaining tasks are not an accepted
execution plan. These designs do not match an implemented standalone Agents API yet. The
Work and Directory owners have not accepted their new use-case boundaries. Resolve those
owner decisions and transaction details before implementing the affected slices.

The [requirements checklist](checklists/requirements.md) records 25/25 passing review
criteria. The Agents contract maps current source and names the required queue/runtime
changes. Implementation and real-owner acceptance remain open. The roadmap placement is
proposed after 006A, pending approval. Run `speckit.analyze` against the draft task list
before treating requirement coverage as complete.
