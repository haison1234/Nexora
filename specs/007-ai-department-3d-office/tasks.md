# Tasks: Optional Department Office

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: T001–T008 and T010–T015 are complete. T009 and T011 remain open. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [x] T001 Add office display-state and renderer interfaces under packages/modules/ai-department/frontend/src/office/ without new business persistence. (FR-001, FR-002, FR-007) Implemented in `office-model.ts` and `office-renderer.ts`; Office state stays in the existing department store.
- [x] T002 Pin Three.js, document dependency notices and procedural-asset provenance, and add a lazy Office route in the existing department module. (FR-001, FR-005, FR-007) Three.js resolves to workspace catalog version 0.187.0. The route lazy-loads `AiDepartmentOfficeView.vue`; `docs/design/org-office/PROVENANCE.md` records Hub revision, file mappings, and license notices.

## Phase 2: Spatial inspection

US1 / P1: project authorized identities into Office and open the same 2D details. Validate exact member mapping, freshness, and no invented work.

- [x] T003 [US1] Implement authorized snapshot-to-character mapping, labels, source versions, and stale/disconnected timestamps under packages/modules/ai-department/frontend/src/office/. (FR-001, FR-002, FR-004, FR-007) `buildOfficeModel` projects store members, Work, and help attention. It records source versions and the view reports live, stale, or disconnected sync state.
- [x] T004 [US1] Implement Three.js procedural rooms/characters, demand-driven rendering, instancing, and the proposed scene limits under packages/modules/ai-department/frontend/src/office/renderer/. (FR-001, FR-002) Implemented in `office-renderer.ts` and `scene/`; rendering stops when idle or hidden, scene limits cap characters at 60, and environment, workstations, and robot parts use instancing.
- [x] T005 [US1] Route selection to the same 006 member/work details and clear removed or inaccessible selections. (FR-001, FR-003, FR-007) Selection opens the existing People and Work detail routes. The view clears selection when its member leaves the authorized model; the access-loss E2E verifies that selection and roster data disappear after a 403.

## Phase 3: Fallback

US2 / P1: retain all information and core actions when rendering fails or motion is reduced. Validate keyboard use and complete scene cleanup.

- [x] T006 [US2] Build the independent DOM roster, visible 2D switch, static reduced-motion states, keyboard selection, and localized error reasons under packages/modules/ai-department/frontend/src/office/. (FR-003, FR-005, FR-006) The DOM roster remains available independently of WebGL. Mode switching, keyboard selection, reduced motion, and localized fallback states are implemented.
- [x] T007 [US2] Implement asset/context failure fallback, renderer disposal, project-change cleanup, and permission-loss clearing in the office lifecycle. (FR-004, FR-005, FR-006, FR-007) WebGL setup and context failures switch to the roster. Disposal removes listeners, animation frames, geometry, materials, and context. Layout changes dispose and rebuild the scene. Store access loss clears department data.

## Phase 4: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [x] T008 Add focused mapping, stale-version, access-loss, failure, keyboard, and reduced-motion cases in the owning frontend module. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007) `office-model.test.ts` covers mapping, source versions, stale state, and reduced motion; store tests cover access loss. Playwright covers 360 px keyboard/reduced-motion behavior and fallback for unsupported WebGL, setup failure, context loss, and access loss. The new access-loss E2E passed 1/1 on an isolated database.
- [ ] T009 Measure 100 text updates, action parity, repeated mount/dispose, and declared device budgets; record evidence before enabling the optional route. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007) Diagnostic only, 2026-11-07: isolated Playwright used 20 members, WebGL 2, and SwiftShader software rendering. During 4.5 seconds of camera presets it recorded 11 unique frame intervals at 1280×800 (p95 983 ms, 3,230 draw calls, 1.8 ms p95 JS submission) and 15 at 360×780 (p95 650 ms, 7,012 draw calls, 1.4 ms p95 JS submission). `performance.memory` reported 304 MB JS heap; it does not report GPU memory. A controlled Office UI test now passed 100 status updates on simulated 4-second polling (p95 4,097 ms; max 4,139 ms), five 2D/3D mount/dispose cycles, and matching member/work actions in both modes. It mocked member and work reads. It is UI evidence, not backend or device evidence. Physical-device frame and memory budgets remain open. Separate isolated E2E cases verify fallback after unsupported WebGL, renderer setup failure, and context loss; none establishes device budgets. See `specs/feature-contracts/ai-department/evidence.md`.

## Phase 5: Org and Office redesign (amendment 2026-11-06)

These tasks follow `docs/design/org-office/implementation-handoff.md`. They add to T001–T009 and do not replace them.

- [x] T010 Add the Org manager change from the tree: a member panel selector and a drag onto another card. Both send `PATCH` with `expectedVersion`. Show the server message for a cycle or a stale version. Done 2026-11-07: selector and drag, with tests; browser check by the user is pending.
- [x] T011 Add `GET .../operations` with a department revision and one typed push message through the existing n8n `Push` service. Check project `agent:read` access at send time. The endpoint policy, stable-revision snapshot, send-time and relay-time reader checks, and frontend push store passed focused tests (backend 9/9; frontend store and office 76/76).
- [x] T012 Add the Office label overlay, status ring, help-request link, and camera presets, with the same selection as the Org view. Progress 2026-11-07: the renderer uses the `scene/` modules (night city, desks, robots that walk to review, blocked and lounge areas), camera presets, localized zone labels, a glass panel, a `waiting` status, and dashed help-request arcs. Team rooms have glass walls and signs. Each lead has a private office. Members without a team use an open area. A test checks that walks cross walls only through a door. Office labels show names and status text. Overlapping labels move into separate rows. The selected member receives priority. Hidden labels show a count, and the roster keeps every member available. Isolated Playwright with 20 members verified no label overlap, keyboard selection, correct member detail, and no axe violations at desktop width. The 360 px E2E verified Office 2D and Org with reduced motion, keyboard use, no horizontal overflow, and no axe violations. Separate WebGL-disabled, renderer-setup-failure, and context-loss runs verified the fallback message, complete roster, and member selection. Device and 100-update checks remain open under T009.
- [x] T013 Save Org card positions in browser IndexedDB, keyed by user, project, department, and member. A separate “Arrange cards” mode moves cards without changing manager relationships. Keyboard arrows also move the focused card; Shift moves it in larger steps. Reset clears this department's saved positions, and member removal prunes stale records. Focused layout, storage, and component tests passed 32/32.
- [x] T015 Org view redesign: shared status map with icons, member card with work count, search, focus on the selected chain, nested list below 640 px, and expertise tags in the member panel. Done 2026-11-07, with tests. Follow-up for Spec 009: expertise tag editor and manager effect note. The Office model already receives the open-help waiting set and maps blocked Work to `waiting`; model tests cover this behavior.
- [x] T014 Record provenance for every adapted file in `docs/design/org-office/PROVENANCE.md`. Reviewed Hub files at the pinned MIT revision and recorded the adapted modules, source analogues, and copyright headers. Recorded the user's `ui` repository revision and the Org patterns used without copying its source.

- [x] T016 Org-driven floor, step 1 (2026-11-08): the 3D floor follows the reporting tree. Every member with direct reports leads one room and sits in its office. Everyone else sits in the room of their direct manager. Rooms follow the order of the tree. Members with no manager and no reports share one open area, and the whole floor is open when nobody is placed. Covered by tests for nested managers, order, loops, and the open floor. Rendered once in headless Chromium with a three-level organization.
- [x] T017 Org-driven floor, step 2: place rooms in rows by depth, with hallways between rows, so a large tree wraps into several rows instead of one very wide row. Doors, routes, and camera presets need to follow. Done 2026-11-08: rooms pack into rows up to MAX_ROOM_ROW_WIDTH (26). Each row is followed by a 0.9 m hallway. A free column at the left edge (sideCorridorX) joins the hallways, and every room door opens onto the hallway below it. Routes never cross a glass wall, checked by tests for every desk pair and every shared area. Checked in headless Chromium with three rows and no errors. Open: a check of the full view in the app, and a measured frame budget with many rows.

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
