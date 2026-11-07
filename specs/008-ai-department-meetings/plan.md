# Implementation Plan: AI Department Meetings

**Feature**: `008-ai-department-meetings` | **Date**: 2026-11-04
**Status updated**: 2026-11-05
**Status**: Meeting persistence, owner invocation, lifecycle, recovery, and 2D UI
  implementation now exist in the shared worktree. T010 is complete for implementation.
  T026 and T032 have browser acceptance evidence. T011, T017–T023, T025, T027–T031, and
  T033 remain open for the listed implementation or acceptance evidence. Keep runtime
  dispatch disabled until Agents owner and provider acceptance pass.
**Spec**: [spec.md](spec.md)
**Research**: [research.md](research.md)

## Summary

The feature stores asynchronous department meetings, participant outcomes, draft minutes,
approved decisions, and action items. The implemented service uses the existing Work
service to create approved work. Agents owns participant invocation and execution state.
Runtime enablement remains gated on the acceptance evidence in `tasks.md`.

## Constitution check

| Principle | Assessment | Evidence and constraint |
|---|---|---|
| Repository rules and evidence | Pass for document review | Source findings and proposed changes are labeled separately. Existing changes and the local feature pointer are preserved. |
| One department product | Pass for proposal | Meetings are department business records. They do not replace work, directory, or n8n workflow state. |
| Owned execution | Implemented; acceptance open | The Agents-owned contract, meeting queue source, isolated bounded runtime, and recovery paths are implemented. One main-process stop/restart recovery scenario passed. Live access revocation and other execution modes remain open. |
| Project access and human control | Implemented; acceptance open | Current-access source reads, binding verification, tool isolation, cancellation, and safe result delivery have implementation evidence. Native owner acceptance remains open. |
| Durable and recoverable changes | Implemented; acceptance open | Meeting commands, stop receipts, and Work conversion use durable receipts and reconciliation. Cross-process acceptance remains open. |
| 2D completeness | Implemented; partial acceptance | Meeting comparison passes a controlled browser check at 360 CSS pixels and a wide viewport. T032 English/Vietnamese acceptance passes. T025, T027, and T028 still have open coverage. |

These checks summarize implementation state. They do not prove native runtime or
provider behavior.

## Phase 0 — Source research

See [research.md](research.md) for the pre-implementation source review. The implementation
since added a standalone Agents meeting owner and a public Work receipt lookup. The review
remains useful as a historical record. It does not prove current runtime acceptance.

## Phase 1 — Design gates

The Phase 1 artifacts in `data-model.md`, `contracts/`, `design.md`, and `quickstart.md`
guided implementation. The task order records implementation and acceptance separately.
Runtime acceptance remains an enablement gate and is not a substitute for design review.

The original design gates have since advanced as follows:

1. **Meeting invocation owner**: The Agents owner can enqueue, look up, stop, snapshot,
   and deliver a bounded contribution without work or attempt IDs. One isolated main-process
   stop/restart recovery scenario passed. Live access revocation and other execution modes
   remain open in T030. Local participant and synthesis provider runs passed; output-limit,
   deadline, quota, and provider-diversity acceptance remain open in T031.
2. **Cross-record recovery**: Work exposes an authorized receipt lookup. Conversion
   reserves a stable command before calling Work and reconciles uncertain results. See
   T014–T015 and T020.
3. **Access, tools, and directory admission**: The supplied-material fallback, current
   source access checks, binding verification, retry limits, and composite archive guard
   have implementation progress. Owner and access-loss acceptance remains open in
   T029–T030.
4. **Delivery order**: The roadmap places 008 after 006A and before 004. Its backend uses
   the 002/003 contracts and its UI extends the 006A module. T026 comparison and T032
   browser acceptance pass. T029–T031 owner/provider gates remain open.

The [requirements checklist](checklists/requirements.md) reviews product quality only.
CHK018–CHK020 confirm design completeness. They do not prove runtime acceptance. The task
list records implemented owner changes and the remaining owner, provider, and browser
gates. Keep runtime enablement gated by those acceptance results. See the
[clarification review](clarification-review.md).

## Ownership and placement

- Backend meeting domain: `packages/cli/src/modules/ai-department/meeting.service.ts` and
  `packages/cli/src/modules/ai-department/meeting.controller.ts`.
- Meeting API DTOs: `packages/@n8n/api-types/src/ai-department/meetings.ts`.
- Persistence: `packages/cli/src/modules/ai-department/database/` meeting entities and
  repositories.
- UI: `packages/modules/ai-department/frontend/`, in the 006A module.
- Agent invocation, runtime prompts, credentials, execution records, stop proof, and
  result delivery: `packages/cli/src/modules/agents/` meeting owner.
- Work item persistence and lifecycle: Spec 003 `WorkService`.

These paths reflect the current implementation. Keep the owner boundaries in the contracts
when changing source symbols or persistence contracts.

## Current implementation status

API schemas, meeting persistence, composed repositories, project-scoped routes, and the
Agents-owned meeting queue/runtime are implemented. Draft creation and editing support
active same-department participants and command receipts. The context reader checks current
access for goal/work sources and approved-decision carry-forward. Protected source bodies
remain hidden from unauthorized readers. T009 implements bounded single-turn execution and
hash-checked result reads. T010 implements durable idempotent stop receipts and terminal
confirmation from owner state. T011 implements scheduled reconciliation from the stable
queue receipt and deterministic input-message execution, with sequence checks and late-result
fences. Unknown calls do not start replacements while the prior result remains unresolved.

The meeting service implements start and participant dispatch after commit, structured
contribution validation, quorum/deadline closure, absence recording, one synthesis call,
cited draft minutes, decision/action-item review, bounded retries, takeover, cancellation,
source reauthorization, safe activity, and command receipts. The 2D module implements draft
creation/editing, purpose templates, approved-decision selection, the pre-start N+1 estimate,
participant comparison, minutes and action-item review, and recovery controls. The current
controlled test inventory and remaining evidence are recorded in `tasks.md`.

T029 remains open for the full controlled failure matrix and guided timing. T030–T031 remain
open for live access revocation, other execution modes, and remaining provider acceptance.
T026 and T032 browser acceptance pass. T029–T031 remain open for controlled failure
coverage, native owner behavior, and provider acceptance. Keep workflow/meeting runtime
dispatch gated until these gates pass. The feature pointer remains unchanged.
