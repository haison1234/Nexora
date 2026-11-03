# Tasks: Optional Department Office

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: Implementation work is unchecked. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [ ] T001 Add office display-state and renderer interfaces under packages/modules/ai-department/frontend/src/office/ without new business persistence. (FR-001, FR-002, FR-007)
- [ ] T002 Pin Three.js, document dependency notices and procedural-asset provenance, and add a lazy Office route in the existing department module. (FR-001, FR-005, FR-007)

## Phase 2: Spatial inspection

US1 / P1: project authorized identities into Office and open the same 2D details. Validate exact member mapping, freshness, and no invented work.

- [ ] T003 [US1] Implement authorized snapshot-to-character mapping, labels, source versions, and stale/disconnected timestamps under packages/modules/ai-department/frontend/src/office/. (FR-001, FR-002, FR-004, FR-007)
- [ ] T004 [US1] Implement Three.js procedural rooms/characters, demand-driven rendering, instancing, and the proposed scene limits under packages/modules/ai-department/frontend/src/office/renderer/. (FR-001, FR-002)
- [ ] T005 [US1] Route selection to the same 006 member/work details and clear removed or inaccessible selections. (FR-001, FR-003, FR-007)

## Phase 3: Fallback

US2 / P1: retain all information and core actions when rendering fails or motion is reduced. Validate keyboard use and complete scene cleanup.

- [ ] T006 [US2] Build the independent DOM roster, visible 2D switch, static reduced-motion states, keyboard selection, and localized error reasons under packages/modules/ai-department/frontend/src/office/. (FR-003, FR-005, FR-006)
- [ ] T007 [US2] Implement asset/context failure fallback, renderer disposal, project-change cleanup, and permission-loss clearing in the office lifecycle. (FR-004, FR-005, FR-006, FR-007)

## Phase 4: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T008 Add focused mapping, stale-version, access-loss, failure, keyboard, and reduced-motion cases in the owning frontend module. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007)
- [ ] T009 Measure 100 text updates, action parity, repeated mount/dispose, and declared device budgets; record evidence before enabling the optional route. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007)

## Dependencies and Execution Order

- Complete foundation before story implementation. Resolve the existing dependency features before using their interfaces.
- Within each story, establish persistence/DTOs, services, routes/UI, then behavior checks.
- Independent documentation and separate test files may be prepared in parallel. Shared owner adapters, DTOs, migrations, and state-machine files are sequential changes.
- The renderer and procedural asset strategy are selected. 3D enablement still requires measured device budgets and cleanup/fallback checks; 2D remains available throughout.
- Run checks serially with one worker. A fixture or mock is not evidence that an enabled production provider works.

## Functional Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T001, T002, T003, T004, T005, T008, T009 |
| FR-002 | T001, T003, T004, T008, T009 |
| FR-003 | T005, T006, T008, T009 |
| FR-004 | T003, T007, T008, T009 |
| FR-005 | T002, T006, T007, T008, T009 |
| FR-006 | T006, T007, T008, T009 |
| FR-007 | T001, T002, T003, T005, T007, T008, T009 |

## Success Criterion Coverage

| Criterion | Tasks |
|---|---|
| SC-001 | T008, T009 |
| SC-002 | T009 |
| SC-003 | T006, T008, T009 |
| SC-004 | T007, T008, T009 |

## Completion Evidence

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.
