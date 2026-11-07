# Tasks: Operations Interface, Slices A and B

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: Implementation work is unchecked. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.
**Parity source**: [Paperclip parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md). This maps relevant behavior; it does not claim that the current UI is equivalent.


## Phase 1: Foundation

### Current isolated 2D browser rerun — 2026-11-05

- Ran the English 2D section journey in the isolated local Playwright harness. It passed 1/1 and checked keyboard activation of all seven sections, scoped axe results, reduced-motion transition duration, and overflow at 360 CSS pixels.
- Ran the English and Vietnamese department setup journeys separately. Both passed 1/1 and created a goal, member, and assigned work through the 2D UI. The Vietnamese instance started with `N8N_DEFAULT_LOCALE=vi`.
- The harness used a throwaway SQLite folder for each run. No Agent or provider credential was configured. These checks do not prove live Agent execution, owner recovery, activity-update latency, or full access-loss behavior. T008 and T019 remain open.

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [ ] T001 Scaffold packages/modules/ai-department/frontend/ with the module SDK; register the matching backend ID, project tab, route names, module guard, and package-local checks. (FR-001, FR-008, FR-010)
- [ ] T002 Add typed operations/activity projections and authorized reads under packages/cli/src/modules/ai-department/operations/ and packages/@n8n/api-types/src/ai-department/operations.ts. (FR-002, FR-005, FR-008)

## Phase 2: Attention

US1 / P1: find the next permitted action from the overview. Validate attention ordering, empty/partial-failure states, and direct-link access.

- [ ] T003 [US1] Build overview attention, active work, ownership, and activity sections in packages/modules/ai-department/frontend/src/views/OverviewView.vue. (FR-001, FR-002, FR-005)
  Progress: The 2D overview shows attention, active work, team ownership, and recent activity in the required order. Latest work follows these sections. The activity feed uses one project-scoped request and a bounded page. A failed refresh shows an error and keeps the last loaded entries. The route requires `agent:read` and checks the active department. A work deep link fetches an item outside the current 100-item page. A failed access check clears protected detail. SQLite and Postgres schema docs include the feed index. Browser acceptance and other T003 criteria remain open.
- [ ] T004 [US1] Implement page/filter query state, paging, permission-aware empties, and partial errors under packages/modules/ai-department/frontend/src/. (FR-001, FR-002, FR-005, FR-008)
  Progress: Work search, state filters, and 100-item paging are stored in the URL. The component initializes from query values and responds to route changes. Invalid state and page values use safe defaults. Request sequence checks prevent older list responses from replacing newer filters or department data. Empty-state guidance distinguishes reader access from coordinator access and reports when filters return no matches. The overview activity section reports partial load failures and preserves its last loaded entries. Browser acceptance remains open.

## Phase 3: Organization and review

US2 / P1 / 006A: complete directory, assignment, and business review through 2D. Validate reader denial, both locales, keyboard use, and narrow layout.

- [ ] T005 [US2] Build People, Work queue, and member/work detail using the 002/003 APIs in packages/modules/ai-department/frontend/src/views/. (FR-003, FR-005, FR-008, FR-010)
- [ ] T006 [US2] Implement separate business-review and tool-permission panels, command identities, and scoped current-action rendering under packages/modules/ai-department/frontend/src/components/. (FR-003, FR-004, FR-008, FR-010)
- [ ] T007 [US2] Add Vietnamese/English product strings to the existing i18n package and reuse design-system tokens, dialogs, controls, and focus patterns. (FR-005, FR-007, FR-009)
  Progress: AI Department now merges Vietnamese translations for all 295 `aiDepartment.*` strings when the 2D or Office view loads. Other app messages keep the English fallback. The focused locale test checks key coverage and interpolation. Keyboard, focus, and responsive acceptance remains in T008.
- [x] T008 [US2] Validate the 006A flows, keyboard-only actions, 360-pixel layout, both locales, and provider/Office-disabled operation using package-local component and focused Playwright cases. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-009, FR-010)
  Progress: The OrgCanvas component test verifies arrow-key focus movement and Vietnamese accessible labels. The layout test verifies fitting the organization inside a 360-pixel viewport. Three focused tests verify that reduced motion, a hidden scene, and idle statuses stop the Office animation loop. The frontend module suite passes 77/77 tests. These checks do not cover browser flows, all 2D actions, both-locale behavior across the full product, or operation with provider and Office disabled. At this checkpoint, T008 remained open pending focused browser acceptance.
  Browser smoke acceptance (2026-11-05): The isolated English Playwright test creates a department, activates all seven sections with the keyboard, checks each section heading, and checks for horizontal overflow at 360 CSS pixels. It also verifies that the Meetings list request returns HTTP 200. The isolated Vietnamese test checks all seven localized section labels and headings with the keyboard, and verifies the same Meetings request. Both tests pass against rebuilt editor-ui and CLI output. The reduced-motion preference is set in the English test, but this browser test does not verify animation behavior. These checks do not cover all 2D actions, visible focus, provider-disabled operation, access loss, live updates, or the full locale flows. They did not close T008.
  Current 2D styling check: Home, OrgCanvas, GoalNode, and MemberPanel spacing now uses design-system spacing tokens. The frontend module suite passes 80/80 tests. Module typecheck, Stylelint, Prettier for the three component files, and `git diff --check` pass. Prettier reports unrelated formatting differences in `AiDepartmentHomeView.vue`; this update leaves those lines unchanged. The Chrome tab could not be attached at this checkpoint, so browser acceptance remained open.
  Browser acceptance update (2026-11-05): Both locale journeys now use keyboard navigation across all seven sections and run scoped axe scans on each section. English and Vietnamese action journeys create a goal, add a member, assign work to that member and goal, and open work detail. Each journey passes 1/1 with zero scoped axe violations. The AI Department home view limits descendant transitions and animations under reduced motion; browser checks verify the navigation transition is at or below 0.001 seconds. The meeting paths also cover mobile layout, loading, access loss, transient errors, offline stale data, and recovery. At this checkpoint, provider-disabled work operations and live Agent execution remained unverified. T019 remained open.
  Latest isolated acceptance (2026-11-05):
  - The English Playwright suite passed 4/4. The Vietnamese suite passed 4/4. Each run used one worker and a reset SQLite database.
  - The suites checked keyboard navigation, visible focus, reduced motion, narrow viewports, and scoped axe scans. They also created goals, members, work, and meeting drafts. They checked meeting templates, the N+1 estimate, and retry with the same request ID after a lost response.
  - The flows used unbound members. They did not call an Agent or provider. They did not open the optional Office view.
  - T008 is complete. T019 remains open for real Agent execution and owner acceptance.

## Phase 4: Live operations

US3 / P1 / 006B: follow verified owner state and reconcile after lost updates. Validate no repeated command, no stale rollback, and current execution-detail access.

- [ ] T009 [US3] Add project-authorized subscription delivery and safe invalidations in packages/cli/src/modules/ai-department/operations/ and the shared push types. (FR-005, FR-006, FR-008)
- [ ] T010 [US3] Implement versioned stores, push invalidation handling, four-second visible fallback refresh, access-loss clearing, and reconnect reconciliation in packages/modules/ai-department/frontend/src/. (FR-005, FR-006, FR-008)
- [ ] T011 [US3] Connect verified 003/004 controls and optional 005 capability panels; preserve pending cancellation, unavailable state, and owner-specific detail access. (FR-003, FR-004, FR-005, FR-008, FR-010)
  Progress: Work detail exposes authorized start for ready work and retry for blocked work through the existing project-scoped routes. The UI reports accepted, pending, unavailable, unknown, and rejected dispatch states. The store reuses the command ID after an uncertain response, and a test covers that replay. This does not verify a live executor or owner-specific execution detail.
- [ ] T012 [US3] Add stale-command, access-revocation, duplicate/out-of-order update, disconnect, and 100-update timing cases to the owning frontend/backend validation. (FR-005, FR-006, FR-008)

## Phase 5: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T013 Run the quickstart and focused package formatting/lint/behavior checks; record attention timing, keyboard parity, update latency, and no command replay. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010)

## Phase 6: Coordination parity

Run this phase after Spec 003 exposes the Agents-owned wake/claim/report contract.
Keep all core work complete in 2D; optional office rendering cannot own business state.

- [ ] T014 Render the Agent/member reporting hierarchy, role, availability, and binding status with authorized member detail. (FR-011) Implementation now reads binding status through the project-authorized `agent:read` endpoint and shows loading, error, unconfigured, available, and unavailable states in English and Vietnamese. Four focused component tests and package typecheck/lint checks pass. Browser acceptance remains open.
- [x] T015 Add goal tree/detail with owners, linked work, and progress derived from authorized work state. (FR-011, FR-012)
  Progress: Goal titles open a detail panel with owner, parent, due date, success criteria, state, linked work, and progress rolled up from authorized non-cancelled work across child goals. Linked work opens its existing detail view. The focused goal-tree/detail suite passes 9/9 tests. Module typecheck, ESLint, Stylelint, Biome, and `git diff --check` pass. Browser acceptance remains open in T019.
- [x] T016 Add parent/child and blocker navigation, blocker-aware readiness, claim owner, and safe comments/progress/activity to work list and detail. (FR-012, FR-014)
  Progress: Work detail loads the authorized relationship list and shows parent, child, blocks, and blocked-by links. It reads blocker states through project/department-scoped routes and disables start/retry until all blockers are done or cancelled; unknown blocker status keeps the action disabled. It also loads a project-authorized summary of the current claim and shows its member, lease, and active/expired/released state. The summary excludes native execution IDs. Coordinators can add comments and progress notes through a project-scoped route. The service checks the current work version and stores each activity with a user actor and an idempotent receipt. The 2D detail view shows the update form and refreshes the activity list after a successful save. Verification passed: frontend module tests 110/110, module typecheck, work service and lifecycle integration tests 72/72, route policy 1/1, and `git diff --check`. Browser acceptance and stale-access acceptance remain open in T019.
- [ ] T017 Separate wake, claim, runtime run/outcome, native tool approval, business review, and final work state in overview attention and detail views. (FR-013, FR-014)
  Progress: Work detail now renders Agent wake delivery separately from Agent runs, claim owner, business review, work activity, and final work state. A project-scoped `agent:read` route returns only pending/delivered wake status and timestamps after a scoped work lookup. Runtime detail shows member, provider, phase, outcome, timestamps, and pending stop state. Overview attention now reads up to 100 suspended attempts through one project-scoped endpoint. The response reports when more suspended attempts exist. The Agents owner classifies each attempt as pending, not pending, or unknown. The response contains no tool payload. Owner reads run in batches of ten. The frontend clears approval details on access loss and keeps last-known details after a transient failure. Focused service, route-policy, and store tests pass; module and CLI typechecks, Stylelint, Biome, API types build, and `git diff --check` pass. Browser and native owner acceptance remain open.
- [ ] T018 Add live run and recovery details with access-checked refresh, reconnect reconciliation, and visible stale state. (FR-005, FR-006, FR-008, FR-012)
  Progress: The visible four-second refresh now re-reads an open work item, attempts, history, activity, relationships, claim, and wake state. Returning to the tab triggers the same owner refresh. Transient errors keep the last known detail and show a stale status; 403/404 clears protected detail and reports access loss. Blocker states refresh with the relationships. The visibility-polling test verifies hidden ticks are skipped and a visibility return triggers refresh. Frontend module tests pass 90/90; typecheck, ESLint, Biome, and `git diff --check` pass. Owner-specific stop/recovery browser acceptance remains open.
- [ ] T019 Validate the parity flows in the browser against a real n8n Agent and record accessibility, locale, update latency, and recovery evidence. (SC-001, SC-002, SC-003, SC-004)

### T017 progress

- Added a permission-aware Cancel work action for backlog, ready, running, and blocked items. It confirms the action and sends the current work version. Active attempts show a pending stop message until the owner confirms cancellation. T017 remains open for the other runtime, approval, review, and final-state distinctions.
- Runtime attempt detail reports native tool approval separately from the Agent run phase and business outcome. The owner read checks the accepted execution identity and reads the suspension timeline without changing snapshot sequence state. It returns only pending, not pending, or unknown; it does not expose approval payloads. Adapter tests pass 16/16, work-attempt integration tests pass 34/34, CLI typecheck passes, and `git diff --check` passes. Browser and native owner acceptance remain open.
- Overview attention now includes pending and unknown tool approvals from a bounded, project-scoped owner read. `agent:read` protects the route. The response contains only work, attempt, member, ordinal, and approval state. It reports when the 100-row limit hides older suspended runs. Store tests pass 23/23; locale tests pass 1/1; work route policy passes 1/1; work-attempt integration passes 34/34; API schema tests pass 2/2. CLI and frontend typechecks, API-types build, Stylelint, Biome, and `git diff --check` pass. Browser and native owner acceptance remain open.

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
