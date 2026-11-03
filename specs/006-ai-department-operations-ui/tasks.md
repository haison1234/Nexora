# Tasks: Operations Interface, Slices A and B

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: Implementation work is unchecked. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.
**Parity source**: [Paperclip parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md). This maps relevant behavior; it does not claim that the current UI is equivalent.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [ ] T001 Scaffold packages/modules/ai-department/frontend/ with the module SDK; register the matching backend ID, project tab, route names, module guard, and package-local checks. (FR-001, FR-008, FR-010)
- [ ] T002 Add typed operations/activity projections and authorized reads under packages/cli/src/modules/ai-department/operations/ and packages/@n8n/api-types/src/ai-department/operations.ts. (FR-002, FR-005, FR-008)

## Phase 2: Attention

US1 / P1: find the next permitted action from the overview. Validate attention ordering, empty/partial-failure states, and direct-link access.

- [ ] T003 [US1] Build overview attention, active work, ownership, and activity sections in packages/modules/ai-department/frontend/src/views/OverviewView.vue. (FR-001, FR-002, FR-005)
- [ ] T004 [US1] Implement page/filter query state, paging, permission-aware empties, and partial errors under packages/modules/ai-department/frontend/src/. (FR-001, FR-002, FR-005, FR-008)

## Phase 3: Organization and review

US2 / P1 / 006A: complete directory, assignment, and business review through 2D. Validate reader denial, both locales, keyboard use, and narrow layout.

- [ ] T005 [US2] Build People, Work queue, and member/work detail using the 002/003 APIs in packages/modules/ai-department/frontend/src/views/. (FR-003, FR-005, FR-008, FR-010)
- [ ] T006 [US2] Implement separate business-review and tool-permission panels, command identities, and scoped current-action rendering under packages/modules/ai-department/frontend/src/components/. (FR-003, FR-004, FR-008, FR-010)
- [ ] T007 [US2] Add Vietnamese/English product strings to the existing i18n package and reuse design-system tokens, dialogs, controls, and focus patterns. (FR-005, FR-007, FR-009)
- [ ] T008 [US2] Validate the 006A flows, keyboard-only actions, 360-pixel layout, both locales, and provider/Office-disabled operation using package-local component and focused Playwright cases. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-009, FR-010)

## Phase 4: Live operations

US3 / P1 / 006B: follow verified owner state and reconcile after lost updates. Validate no repeated command, no stale rollback, and current execution-detail access.

- [ ] T009 [US3] Add project-authorized subscription delivery and safe invalidations in packages/cli/src/modules/ai-department/operations/ and the shared push types. (FR-005, FR-006, FR-008)
- [ ] T010 [US3] Implement versioned stores, push invalidation handling, four-second visible fallback refresh, access-loss clearing, and reconnect reconciliation in packages/modules/ai-department/frontend/src/. (FR-005, FR-006, FR-008)
- [ ] T011 [US3] Connect verified 003/004 controls and optional 005 capability panels; preserve pending cancellation, unavailable state, and owner-specific detail access. (FR-003, FR-004, FR-005, FR-008, FR-010)
- [ ] T012 [US3] Add stale-command, access-revocation, duplicate/out-of-order update, disconnect, and 100-update timing cases to the owning frontend/backend validation. (FR-005, FR-006, FR-008)

## Phase 5: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T013 Run the quickstart and focused package formatting/lint/behavior checks; record attention timing, keyboard parity, update latency, and no command replay. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010)

## Phase 6: Coordination parity

Run this phase after Spec 003 exposes the Agents-owned wake/claim/report contract.
Keep all core work complete in 2D; optional office rendering cannot own business state.

- [ ] T014 Render the Agent/member reporting hierarchy, role, availability, and binding status with authorized member detail. (FR-011)
- [ ] T015 Add goal tree/detail with owners, linked work, and progress derived from authorized work state. (FR-011, FR-012)
- [ ] T016 Add parent/child and blocker navigation, blocker-aware readiness, claim owner, and safe comments/progress/activity to work list and detail. (FR-012, FR-014)
- [ ] T017 Separate wake, claim, runtime run/outcome, native tool approval, business review, and final work state in overview attention and detail views. (FR-013, FR-014)
- [ ] T018 Add live run and recovery details with access-checked refresh, reconnect reconciliation, and visible stale state. (FR-005, FR-006, FR-008, FR-012)
- [ ] T019 Validate the parity flows in the browser against a real n8n Agent and record accessibility, locale, update latency, and recovery evidence. (SC-001, SC-002, SC-003, SC-004)

## Dependencies and Execution Order

- Complete foundation before story implementation. Resolve the existing dependency features before using their interfaces.
- Within each story, establish persistence/DTOs, services, routes/UI, then behavior checks.
- Independent documentation and separate test files may be prepared in parallel. Shared owner adapters, DTOs, migrations, and state-machine files are sequential changes.
- 006A can proceed after 002/003 planning/review APIs exist. 006B requires a verified executor; seeded examples do not satisfy live-execution acceptance.
- Run checks serially with one worker. A fixture or mock is not evidence that an enabled production provider works.

## Functional Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T001, T003, T004, T008, T013 |
| FR-002 | T002, T003, T004, T008, T013 |
| FR-003 | T005, T006, T008, T011, T013 |
| FR-004 | T006, T008, T011, T013 |
| FR-005 | T002, T003, T004, T005, T007, T008, T009, T010, T011, T012, T013 |
| FR-006 | T009, T010, T012, T013 |
| FR-007 | T007, T008, T013 |
| FR-008 | T001, T002, T004, T005, T006, T008, T009, T010, T011, T012, T013 |
| FR-009 | T007, T008, T013 |
| FR-010 | T001, T005, T006, T008, T011, T013 |
| FR-011 | T014, T015, T019 |
| FR-012 | T015, T016, T018, T019 |
| FR-013 | T017, T018, T019 |
| FR-014 | T016, T017, T019 |

## Success Criterion Coverage

| Criterion | Tasks |
|---|---|
| SC-001 | T003, T013 |
| SC-002 | T008, T013 |
| SC-003 | T012, T013 |
| SC-004 | T012, T013 |

## Completion Evidence

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.
