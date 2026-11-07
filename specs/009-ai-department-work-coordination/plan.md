# Implementation Plan: AI Department Work Coordination

**Branch**: Not created | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Status**: Implementation in progress. Human help answers and requester continuation
remain split by the open G1 owner gate. Meeting data retirement remains blocked by data
disposition review.

**Input**: Product direction from the user. See [source research](research.md).

## Summary

Add structured Agent completion reports, durable asynchronous help requests, deterministic
department routing, one-turn responses, requester continuation, and delegated child work.
Extend the existing AI Department and Agents modules. Reuse Work activity, review policy,
relationships, command receipts, and coalesced wake lanes. Keep runtime calls inside the
Agents owner. Remove manual meeting creation from the UI. Retire meeting persistence only
after an explicit data disposition and migration review.

## Technical Context

**Language/Version**: TypeScript; n8n monorepo workspace versions.
**Primary Dependencies**: `@n8n/api-types`, `@n8n/db`, `@n8n/di`, Agents module, AI Department module, Vue 3, `@n8n/i18n`.
**Storage**: Existing TypeORM persistence in the AI Department module; common SQLite and PostgreSQL migrations.
**Testing**: Vitest unit and integration tests in owning packages; controlled Agents owner acceptance; browser checks for the AI Department module.
**Target Platform**: n8n server and 2D AI Department UI.
**Project Type**: Backend and frontend monorepo feature.
**Performance Goals**: A report adds no separate synthesis call. An Agent help answer uses one bounded owner turn. Requester continuation uses one coalesced wake after a durable answer.
**Constraints**: No model-based routing. No effective tools in Agent answer turns. Current project, department, binding, attempt, and access checks apply. Do not trust stop requests without terminal proof.
**Scale/Scope**: One project and department per operation, existing roadmap fixture, no new multi-tenant or budget system.

## Constitution Check

| Principle | Status | Plan result |
|---|---|---|
| I. Repository Rules and Evidence | Pass | Preserve user changes and data. Record source observations separately from runtime acceptance. |
| II. One Department Product | Pass | Work coordination belongs to the department. Member identity stays separate from executor binding. |
| III. Execution Through Owned Contracts | Blocked for Agent replies | Agents must own model invocation, prompts, tool removal, deadlines, stop, result, and recovery. Do not enable until its contract and G1 acceptance pass. |
| IV. Project Access and Human Control | Pass with gates | Recheck access for every read, answer, owner dispatch, and wake. Advice grants no permissions. Keep human business review separate. |
| V. Shared Interface Before Integration | Pass | Keep all core help and report actions in the 2D Work UI. Use existing UI tokens and i18n. |
| VI. Durable Work and Verifiable Changes | Pass with gates | Persist requests and answers before wake. Use idempotent commands, sequence fencing, and current Work versions. Keep uncertain owner state blocked until reconciled. |

The blocked Agent reply gate is limited to Agent-to-Agent answering and requester
continuation. Structured reporting, expertise metadata, human replies, and child Work
contracts can be implemented and tested without claiming that gate passed. The separate
meeting-table retirement task remains blocked until the data disposition is approved.

## Architecture and Ownership

### Hierarchical delegation and workflow access (design amendment, 2026-11-07)

- An Agent delegates one explicit child item during its current claimed turn. It may
  select only an active, bound direct report in the same project and department.
- Delegation creates a ready child, parent and blocker links, activity, receipt,
  eligibility, lane generation, and wake intent atomically. The existing lane owns
  reservation and rechecks current authority. It admits no duplicate active attempt.
- Each child Agent can delegate later, during its own claimed turn, to its own direct
  report. The validated org tree bounds the chain. There is no automatic recursive fan-out
  and no copied claim, executor, or workflow authority.
- Goal identity flows to child Work. Child result review remains separate from manager
  reporting. Human business review remains the default until the C4 Agent review gate is
  accepted.
- A child result report must be visible from the authorized parent Work tree. Wake the
  parent only after the final child blocker is accepted, the parent attempt is terminal,
  and current parent assignment and binding checks pass. Recheck after stop confirmation
  when the child finishes first. Do not clear a cancelled child blocker.
- Workflow execution stays behind the member's explicit C5 `WorkflowCapability`. It must
  pass current access, claim, binding, publication, and owner checks. C5 G4–G5 remain open,
  so this amendment does not enable workflow calls.

Paperclip is a behavioral reference, not a runtime dependency. Its assignment wake path
ignores backlog work, carries a stable issue identity, and hands execution to its durable
queue. Nexora already has work eligibility, wake lanes, and durable wake intents, so
delegated children use those contracts rather than a parallel scheduler.

### AI Department module

- Define and validate structured report, help request, help response, and delegation DTOs
  in `packages/@n8n/api-types/src/ai-department/`.
- Extend `WorkCoordinationService` for the `submit`, `ask`, and `delegate` actions. Reuse
  the existing attempt, claim, version, command-receipt, activity, and transition checks.
- Add persistence for normalized member expertise and durable help-request lifecycle in
  `packages/cli/src/modules/ai-department/database/`. Keep records project- and
  department-scoped.
- Add use-case repository methods. Keep TypeORM in persistence. Use transaction context
  for operations that create a response, child Work, or relationships.
- Extend Work detail and attention projections. Use existing UI module, i18n, and design
  system. Remove Spec 008 meeting creation and navigation from the active product flow.

### Agents owner

- Add a generic bounded consultation invocation contract in
  `packages/cli/src/modules/agents/`. It must not accept fabricated meeting, participant,
  work, or attempt identifiers as substitutes for a consultation identity.
- Bind each invocation to project, department, requester member and attempt, recipient
  member, executor and binding revision, request ID, input hash, deadline, and result cap.
- Verify the effective tool set is empty. Enforce a single response turn, terminal stop,
  durable result lookup, idempotency, current access, and late-result fencing.
- Return only an opaque owner reference, bounded answer, safe state, and owner sequence to
  the department. Keep prompts, credentials, execution records, and cost data with Agents.

### Wake and recovery

- Persist the answer and its activity before continuation. Once the old attempt is
  terminal, move blocked Work to ready and create a new eligibility generation if no
  other blocker remains. Otherwise keep Work blocked and defer wake until its blockers
  resolve.
- Use the existing wake lane and stable identity. Bind the wake to the original Work,
  request, answer, member, actor, and binding revision.
- Coalesce duplicate answers and wake deliveries. Reconcile unknown delivery after
  restart. Do not start a second continuation while the first is unknown or active.
- Keep the Work blocked and the request open until the old turn is confirmed terminal and
  the answer or escalation is durably recorded.
- G1 wake/coalescing runtime acceptance is open. Do not enable Agent replies or automatic
  continuation before it passes on the current source revision.

### Safe ask lifecycle

The ask action keeps `assigneeMemberId` unchanged. It records the request, changes Work to
blocked, and asks the owner to end the current turn. The owner stop acknowledgment is not
terminal proof. Once stopped, the old attempt is terminal while the Work remains blocked
under the same member assignment. An answer moves the Work to ready and creates a new
eligible continuation generation if no other blocker remains. This is a conditional
extension to the Spec 003 lifecycle. Update its state transition contract before
implementation. Verify that the existing owner run and attempt contracts support this
path. If they do not, revise the contract before adding implementation tasks.

Limit two requests per Work completion cycle, including continuation attempts. This avoids
resetting the limit when a response starts a later attempt. Each request has a deadline.
On expiry, route once to the manager, then once to the assignment actor. Store the full
request chain so retries cannot loop.

### Deterministic routing

1. Normalize the requested expertise tags and match them against maintained member tags.
2. Exclude the requester, archived members, members in another project or department,
   members without a current usable binding, and members already in the request chain.
3. Select the matching member by greatest number of matched tags, then stable member ID.
4. If no specialist is eligible, use `managerMemberId`, subject to the same department,
   activity, binding, and chain checks.
5. If no manager is eligible, offer the request to the stored Work assignment actor only
   after current project access is confirmed. Do not use the attempt initiator as a proxy.
6. If no recipient is valid, store a visible unresolved state. Do not claim an answer or
   wake the requester.

The exact definition of active binding must use the current executor availability contract.
Do not infer runtime readiness from the existence of a binding row.

## Research and Design Phases

Phase 0 source review is recorded in [research.md](research.md). Phase 1 contracts are in
[data-model.md](data-model.md), [contracts/](contracts/), and [quickstart.md](quickstart.md).
These artifacts document a proposed design. They do not close runtime gates.

The 2026-11-07 amendment is a proposed extension to the approved C2 boundary. Its direct
report authorization and atomic child wake are implemented in the coordination service,
but remain unverified until the focused persistence and owner acceptance tasks below
pass. Do not treat the design update as runtime acceptance.

## Project Structure

### Documentation

```text
specs/009-ai-department-work-coordination/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── service-api.md
│   └── agents-consultation.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
packages/@n8n/api-types/src/ai-department/
packages/cli/src/modules/ai-department/
packages/cli/src/modules/agents/
packages/@n8n/db/src/migrations/common/
packages/modules/ai-department/frontend/src/
packages/frontend/@n8n/i18n/src/locales/
specs/AI-DEPARTMENT-ROADMAP.md
specs/008-ai-department-meetings/spec.md
```

**Structure Decision**: Extend the existing AI Department domain and frontend module.
Keep Agent invocation and recovery with the Agents owner. Use existing Work relationships
for child items. Add a new consultation entity rather than overloading meeting records.

## Validation and Enablement Gates

1. Run focused API schema, persistence, service, owner, UI, and migration tests from their
   owning packages. Use dedicated test-owned databases for automated tests.
2. Verify report submission, ask admission, routing, human response, delegation, access
   loss, duplicate commands, race conditions, and late owner results.
3. Verify a full Agent response and requester continuation across service restart on the
   current Agents owner. Include the G1 lost-wake and coalescing cases.
4. Verify the no-tools owner turn with the effective tool registry, not only the requested
   tool-policy field.
5. Verify the 2D UI at narrow and wide viewports, keyboard access, reduced motion, and
   English/Vietnamese copy.
6. Do not drop meeting tables until existing data has an approved disposition, migration
   and rollback plan, and an acceptance check that preserves required records.

## Risks and Open Questions

- **G1 wake/coalescing**: Open runtime acceptance blocks Agent responses and continuation.
- **Attempt continuation**: Existing release ends the current claim and attempt. Prove the
  proposed blocked-to-new-continuation path with the Agents owner before implementation.
- **Active binding**: Define current answer capability for each supported executor type.
- **Assignment actor**: Add `assignedByUserId`; the current attempt initiator is not a
  reliable substitute for the person who assigned Work.
- **Expertise quality**: Coordinators must maintain normalized tags. Unknown or empty tags
  route to manager and the stored assignment actor; no model guesses the recipient.
- **Meeting history**: UI removal is separate from data deletion. Retention, export, and
  rollback need explicit review before schema retirement.
- **Review policy**: Agent manager review stays off. Existing coordinator `reviewPolicy`
  continues to control business completion.

## Requirement Traceability

| Requirement | Design artifact |
|---|---|
| FR-001–FR-003 | [data-model.md](data-model.md), [contracts/service-api.md](contracts/service-api.md) |
| FR-004–FR-012 | [data-model.md](data-model.md), [contracts/service-api.md](contracts/service-api.md), [contracts/agents-consultation.md](contracts/agents-consultation.md) |
| FR-013–FR-014 | [data-model.md](data-model.md), [contracts/service-api.md](contracts/service-api.md) |
| FR-015–FR-017 | [contracts/service-api.md](contracts/service-api.md), [quickstart.md](quickstart.md) |
| FR-018 | All command contracts and recovery scenarios |

## Complexity Tracking

No constitution exception is proposed. The separate consultation owner exists because
Agents owns execution and recovery. It must not become a second runtime or permission
system.
