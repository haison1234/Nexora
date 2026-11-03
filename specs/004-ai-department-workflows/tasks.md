# Tasks: Workflow Capability Bridge

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: Implementation work is unchecked. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [ ] T001 Define capability, invocation, input-reference, and safe outcome DTOs in packages/@n8n/api-types/src/ai-department/workflow.ts. (FR-002, FR-003, FR-005, FR-006)
- [ ] T002 Add capability/invocation entities, identity constraints, receipts, and migrations under packages/cli/src/modules/ai-department/database/ and packages/@n8n/db/src/migrations/. (FR-003, FR-004, FR-009)

## Phase 2: Configuration

US1 / P1: select a permitted compatible workflow without starting it. Validate unavailable, unselected, invalid-input, and unauthorized cases.

- [ ] T003 [US1] Implement capability selection, published compatibility checks, workflow access, and revisioned configuration routes in packages/cli/src/modules/ai-department/workflow/. (FR-001, FR-002, FR-007)
- [ ] T004 [US1] Add focused configuration tests for forbidden, unavailable, incompatible, and invalid-input cases under packages/cli/src/modules/ai-department/__tests__/workflow/. (FR-001, FR-002, FR-007)

## Phase 3: Invocations

US2 / P1: invoke through the native workflow owner and follow distinct child outcomes. Validate idempotency, uncertain dispatch, waits, results, and cancellation.

- [ ] T005 [US2] Add the public workflow owner adapter inside packages/cli/src/modules/agents/; reuse native workflow policy, credentials, published lookup, and wait/result behavior; constrain inherited workflow tools to this member's selected capabilities for the attempt. (FR-001, FR-005, FR-006, FR-007)
- [ ] T006 [US2] Implement native invocation-key acceptance and lookup before enabling the adapter; register its supported owner boundary. (FR-003, FR-004)
- [ ] T007 [US2] Implement department dispatch intent, deduplication, current-attempt authorization, and uncertain-outcome reconciliation in packages/cli/src/modules/ai-department/workflow/. (FR-003, FR-004, FR-007)
- [ ] T008 [US2] Implement safe outcome projection, owner cancellation, and authorized result delivery in packages/cli/src/modules/ai-department/workflow/. (FR-005, FR-006, FR-008, FR-009)
- [ ] T009 [US2] Add crash, duplicate, waiting/retry, stop-race, late-result, and lost-access cases under packages/cli/src/modules/ai-department/__tests__/workflow/. (FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009)

## Phase 4: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T010 Run the quickstart using an enabled executor and native workflow fixtures; record traceability, no forbidden starts, one dispatch per key, and distinct outcome labels. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009)

## Dependencies and Execution Order

- Complete foundation before story implementation. Resolve the existing dependency features before using their interfaces.
- Within each story, establish persistence/DTOs, services, routes/UI, then behavior checks.
- Independent documentation and separate test files may be prepared in parallel. Shared owner adapters, DTOs, migrations, and state-machine files are sequential changes.
- Enable live workflow calls only after the owner accepts and locates invocation keys durably, and current-policy, wait, result, and cancellation checks pass.
- Run checks serially with one worker. A fixture or mock is not evidence that an enabled production provider works.

## Functional Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T003, T004, T005, T010 |
| FR-002 | T001, T003, T004, T010 |
| FR-003 | T001, T002, T006, T007, T009, T010 |
| FR-004 | T002, T006, T007, T009, T010 |
| FR-005 | T001, T005, T008, T009, T010 |
| FR-006 | T001, T005, T008, T009, T010 |
| FR-007 | T003, T004, T005, T007, T009, T010 |
| FR-008 | T008, T009, T010 |
| FR-009 | T002, T008, T009, T010 |

## Success Criterion Coverage

| Criterion | Tasks |
|---|---|
| SC-001 | T009, T010 |
| SC-002 | T004, T009, T010 |
| SC-003 | T006, T009, T010 |
| SC-004 | T008, T009, T010 |

## Completion Evidence

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.
