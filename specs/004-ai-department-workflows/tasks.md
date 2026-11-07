# Tasks: Workflow Capability Bridge

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: T001–T010 have implementation and acceptance evidence. T006/G4 passes with process-boundary recovery through production `WorkflowRunner`/`ScalingService`. G5 tests cover persisted authority revocation, native stop in regular/queue modes, and Redis stop delivery through production `JobProcessor`. The two-phase integration persists revocation intent to isolated SQLite, starts a fresh main process to reconcile through production Department and Agents owner code and real `ExecutionService`, then verifies a fresh worker process receives the Redis stop through production `ExecutionStopService` and `JobProcessor`. Both waiting and retrying child states pass. The worker runs production `ManualExecutionService` and `WorkflowExecute` with a workflow node that observes the abort signal. G5 is verified. T010 provider-backed quickstart acceptance passes as recorded below. Both runtime gates remain false pending explicit release enablement. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [x] T001 Define capability, invocation, input-reference, and safe outcome DTOs in packages/@n8n/api-types/src/ai-department/workflow.ts. Owner-pinned publication and schema values are response fields; clients cannot supply them. (FR-002, FR-003, FR-005, FR-006)
- [x] T002 Add capability/invocation entities, identity constraints, receipts, and migrations under packages/cli/src/modules/ai-department/database/ and packages/@n8n/db/src/migrations/. (FR-003, FR-004, FR-009)

## Phase 2: Configuration

US1 / P1: select a permitted compatible workflow without starting it. Validate unavailable, unselected, invalid-input, and unauthorized cases.

- [x] T003 [US1] Implement capability selection, published compatibility checks, workflow access, and revisioned configuration routes in packages/cli/src/modules/ai-department/workflow/. (FR-001, FR-002, FR-007)
- [x] T004 [US1] Add focused configuration tests for forbidden, unavailable, incompatible, and invalid-input cases under packages/cli/src/modules/ai-department/__tests__/workflow/. (FR-001, FR-002, FR-007)

## Phase 3: Invocations

US2 / P1: invoke through the native workflow owner and follow distinct child outcomes. Validate idempotency, uncertain dispatch, waits, results, and cancellation.

- [x] T005 [US2] Add the public workflow owner adapter inside packages/cli/src/modules/agents/; reuse native workflow policy, credentials, published lookup, and wait/result behavior; constrain inherited workflow tools to this member's selected capabilities for the attempt. (FR-001, FR-005, FR-006, FR-007)
- [x] T006 [US2] Implement and verify native invocation-key acceptance and lookup before enabling the adapter; register its supported owner boundary. Prove one stable invocation key maps to one exact-version native execution, the owner reports acceptance only after queue acceptance is observable, and the same native execution recovers across a real process restart without a second dispatch. Keep this task open while queue acceptance can be unknown after process loss. (FR-003, FR-004)
- [x] T007 [US2] Implement department dispatch intent, deduplication, current-attempt authorization, and uncertain-outcome reconciliation in packages/cli/src/modules/ai-department/workflow/. (FR-003, FR-004, FR-007)
- [x] T008 [US2] Implement safe outcome projection, owner cancellation, and authorized result delivery in packages/cli/src/modules/ai-department/workflow/. (FR-005, FR-006, FR-008, FR-009)
- [x] T009 [US2] Add crash, duplicate, waiting/retry, stop-race, late-result, and lost-access cases under packages/cli/src/modules/ai-department/__tests__/workflow/. (FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009)

## Phase 4: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

T010 is the live acceptance gate. Passing the controlled T009 cases does not prove runtime owner acceptance or provider execution.

- [x] T010 Run the quickstart using an enabled executor and native workflow fixtures; record traceability, no forbidden starts, one dispatch per key, and distinct outcome labels. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009)

### T010 provider-backed quickstart acceptance — 2026-11-05

- The isolated local provider (`qwen2.5:3b`) completed the Agent turn. The Agent inspected and claimed work, called the selected workflow once, received the child output, and submitted a business result. The work moved to `review` under the required review policy; the attempt ended with outcome `succeeded`.
- Traceability is present across work `bdc25ec3-43ab-42dd-beda-47205ca4640c`, attempt `c87108cb-eadb-4615-9206-8753d5acc113`, capability `e3713f23-aade-411f-bf8a-d556d5b8b2ae`, invocation `41b141e7-fdb4-46e5-9f57-a74e25738f3c`, and native child execution `3`. The invocation and execution use one stable key. SQLite contains exactly one native child row for that key. The native row has the expected workflow ID, published version `a46d86ba-c48d-4963-bdf2-2cbe50f6ac19`, and `success` status. The owner receipt and event both record the successful child state and exact version.
- The execution timeline confirms the child returned `quickstart-valid-005`. The Agent then called `department_work` `submit` with the current work version. The coordinator-facing work state is `review`, distinct from child runtime outcome `succeeded`.
- Controlled no-forbidden-start checks passed in the workflow tool and invocation service suites. These cover closed gates, unauthorized parent execution, changed input identity, and invalid or unavailable capability paths. Focused suites passed 91/91. The result-delivery regression and Agents adapter suites passed 43/43. CLI typecheck, changed-file Biome, and `git diff --check` passed.
- Two live-run defects were fixed before acceptance: the workflow authorization path supplied the accepted owner reference instead of the original dispatch key; result delivery compared the Department member ID with the Agent executor ID. A separate submit attempt confirmed that `expectedVersion` is required and must match the current work version. The successful run uses the corrected identities and current version.
- G4, G5, and T010 acceptance are verified. Both invocation gates remain false in source and compiled CLI. The isolated server was stopped, and the user database was not used.

### G5 cross-process revocation with a running workflow node — 2026-11-05

- The prepare process persists revoked executor authority, a waiting or retrying invocation, and the native execution in a test-owned SQLite folder. The recover process opens the same database in a fresh main process and runs production Department reconciliation, Agents owner stop, and `ExecutionService.stop()`.
- A separate worker process runs production `JobProcessor`, `ManualExecutionService`, and `WorkflowExecute`. Its workflow node blocks on the production execution cancel signal and records when that signal aborts. The test confirms the node observed cancellation, the worker reports `ManualExecutionCancelledError`, and processor tracking is cleared.
- Both prepare/recover pairs passed for `waiting` and `retrying`. Verification also passed: CLI typecheck and Biome on the changed integration test. This closes G5. The provider-backed quickstart remains open under T010; both invocation gates remain false pending that acceptance.

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

### G5 waiting/retrying stop and revocation checks — 2026-11-05

- The workflow invocation service suite passes 25/25 tests, including revoked-authority reconciliation followed by stop scheduling for waiting and retrying children.
- The Agents native SQLite stop integration passes 4/4 tests. It verifies persisted waiting children in regular and queue modes, a persisted retrying execution in queue mode, and recovery lookup. The lifecycle resume and owner outbox suites pass 46/46 tests.
- CLI typecheck and Biome on both changed test files pass. The owner impact report is UNKNOWN/lower-bound because caller dispatch crosses the `DepartmentWorkflowInvocationOwner` interface/DI boundary. No production symbol changed.
- These controlled tests do not prove a live workflow was revoked and stopped across process restart. T010 also remains open: the test instance and Ollama respond, but no `N8N_API_KEY` is available to configure and run the provider-backed quickstart. Both invocation gates remain false.

### Canceled row and in-flight queue proof — 2026-11-05

- Source review found that queue-mode stop persists native status `canceled` before the worker handles the stop broadcast. A Bull job may still be active, so the database row alone cannot prove the child stopped.
- The Agents owner now returns unknown from lookup and snapshot, and does not append a terminal cancellation event from stop reconciliation, while the exact Bull job remains active, waiting, delayed, or paused. Queue inspection failures stay unknown.
- The owner suite passes 17/17 tests, including active-job stop/snapshot regressions. The invocation service suite passes 25/25; the native stop SQLite integration passes 4/4; WorkflowRunner queue-observer tests pass 69/69. The real-Redis queue-stop integration passes 2/2. It holds a Bull job active, then runs production `JobProcessor.processJob()` after release. The processor observes the canceled execution, returns `{ success: false }`, and Bull completes the job. A second case sends a real Redis `stop-execution` command from `Publisher` to `Subscriber` and verifies the worker `ExecutionStopService` stops a run registered by production `JobProcessor.processJob()`. The native execution row, `ManualExecutionService`, and lifecycle hooks are controlled test state; the test does not run real workflow nodes.
- CLI typecheck and Biome pass. This verifies that the worker acknowledges a queued canceled row and that the owner waits while Bull reports active. It does not prove revocation reaches a running n8n workflow across processes or survives a process restart.
- G5 remains open for live worker/restart proof. T010 remains open because the provider-backed quickstart needs an authenticated test owner and the owner gates must first pass. Both runtime gates remain false.

### Provider readiness recheck — 2026-11-05

- The isolated test instance health endpoint and local provider endpoint both return HTTP 200. The shell has no `N8N_API_KEY`. Both source gates remain false.
- The real-Redis queue-stop integration passes 2/2. While a held Bull handler keeps the job active, owner snapshot stays unknown. After release, production `JobProcessor.processJob()` reads a canceled execution and returns `{ success: false }`; Bull then completes the job and the owner reports canceled. The other case verifies a Redis command reaches the worker stop service while production `JobProcessor.processJob()` has registered a run, then checks cancellation and tracking cleanup. Persistence, `ManualExecutionService`, and lifecycle hooks are controlled test state. The native SQLite stop integration separately verifies persisted canceled state. This does not prove a live n8n workflow receives a cross-process stop or survives worker restart.
- G5 remains open for live worker stop/revocation and restart proof. T010 remains open because the provider quickstart needs authenticated setup and the owner guarantees must pass first. Do not enable either runtime gate.

### Focused G5 verification rerun — 2026-11-05

- Re-ran the invocation reconciliation suite: 25/25 passed. Re-ran the native SQLite workflow stop and real-Redis queue stop integrations: 6/6 passed (4 SQLite cases and 2 Redis cases).
- CLI typecheck passed. Biome and `git diff --check` passed for the queue-stop test and this record.
- The Redis broadcast case verifies `Publisher` to `Subscriber` delivery to the worker `ExecutionStopService` while production `JobProcessor.processJob()` owns the registered run. The test controls `ManualExecutionService`, execution persistence, and lifecycle hooks. It confirms cancellation and processor tracking cleanup, but it does not run a live workflow node or survive a worker restart.
- The isolated n8n test health endpoint and provider endpoint still return HTTP 200. `N8N_API_KEY` is absent. G5 and T010 remain open, and both runtime gates remain false.

### Persisted revocation reconciliation integration — 2026-11-05

- Added a SQLite integration for revoked `waiting` and `retrying` child invocations. It uses real AI Department repositories and persistence, removes the executor binding to represent revoked authority, and verifies reconciliation writes `cancelRequestedAt` to the invocation row.
- A newly constructed invocation service then reads the persisted stop intent and calls the owner stop contract. The owner is controlled in this integration. This proves durable department reconciliation after service reconstruction, not a full process restart.
- `pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/modules/ai-department/__tests__/workflow/workflow-invocation-revocation.integration.test.ts --maxWorkers=1` passed (2 cases). The invocation unit suite passed 25/25. Native SQLite stop and real-Redis queue stop integrations passed 6/6. CLI typecheck and Biome passed.
- G5 remains open for a live workflow node receiving the cross-process stop and for worker restart recovery. T010 remains open; `N8N_API_KEY` is absent and both invocation gates remain false.

### Provider and isolated instance readiness — 2026-11-05

- The isolated Ollama provider responds at `127.0.0.1:1337/v1` with `qwen2.5:3b`. A live chat completion returned the expected local readiness response.
- Started a test-owned n8n instance with SQLite under `/tmp/nexora-ai-department-test` on port 5789 and task broker port 5779. Created a test owner in that instance. It does not use the instance already running on ports 5678/5679.
- This verifies provider and instance availability only. The workflow invocation gate is still false, so the Spec 004 quickstart scenarios have not run. T006, T010, G4, and G5 remain open.

### Foundation progress — 2026-11-04

- T001 and T002 are implemented. The capability API derives published version and input-schema identity from server-owned validation; clients cannot submit those values.
- Added capability, invocation, and owner-event receipt persistence with scoped idempotency indexes. Added migration `1793726008336-AddAiDepartmentWorkflowCapabilities` and registered all entities in the AI Department module.
- `pnpm --filter @n8n/api-types build` — passed.
- `pnpm --filter @n8n/db build` — passed.
- `pnpm --filter n8n typecheck` — passed after adding the receipt entity timestamp base.
- `pnpm db:schema:docs` — passed. `pnpm --filter @n8n/db schema:check:sqlite` and `schema:check:postgres` — passed.
- No workflow invocation is enabled. G4–G5 remain open and block invocation/enablement. Focused behavior tests are not yet recorded.

### Capability configuration progress — 2026-11-04

- T003 adds project-scoped capability list, create, and revision-checked update routes. `agent:read` and `agent:update` guard the routes. The service checks `workflow:read`, department/member ownership, and same-project workflow access.
- The Agents-owned descriptor loads the published workflow and reuses native trigger compatibility and input-schema inference. The capability records the published version, trigger type/version, and a fingerprint of the inferred schema. Clients cannot provide these values.
- Capability changes write immutable revision rows and a command receipt. `expectedVersion` rejects stale updates. A publication change requires explicit `refreshPublication`; a coordinator can disable a capability after its workflow becomes unavailable.
- `pnpm --filter @n8n/api-types build`, `pnpm --filter @n8n/db build`, and `pnpm --filter n8n typecheck` — passed. `pnpm db:schema:docs` and both SQLite/PostgreSQL schema checks — passed after the revision table was added.
- At the T003 implementation checkpoint, focused T004 behavior tests had not yet been added or run. G4–G5 still block invocation and enablement.

### Configuration tests — 2026-11-04

- Added five focused tests for denied workflow access, unavailable workflows, incompatible triggers, invalid purpose input, and project-scoped controller permissions.
- `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow/workflow-capability.service.test.ts --maxWorkers=1` — passed (5 tests).
- `pnpm exec biome check packages/cli/src/modules/ai-department/__tests__/workflow/workflow-capability.service.test.ts` and `git diff --check` — passed.
- G4–G5 still block workflow invocation and enablement. T005–T010 remain open.

### Selected-tool and native dispatch progress — 2026-11-04

- A work attempt now snapshots the enabled workflow IDs for its member. The Agents runtime removes inherited workflow tools outside that snapshot before building the Agent. Native workflow policy, credential checks, and published-version handling still run in the existing owner path.
- A new migration adds `workflowIdsJson` to `ai_department_work_attempt`. Existing parent Agent dispatch messages store an input hash that includes the selected workflow IDs. The owner lookup can find the durable queue item and can fall back to the persisted Agent execution after the queue item is consumed.
- Added tests for selected-tool filtering, duplicate parent dispatch with identical input, changed-input conflict, and owner lookup through both the queue and persisted execution.
- `pnpm --filter n8n exec vitest run src/modules/agents/__tests__/agent-department-execution.adapter.test.ts src/modules/agents/__tests__/agent-message-queue.service.test.ts src/modules/agents/__tests__/agent-runtime-reconstruction-tool-filtering.test.ts src/modules/ai-department/__tests__/workflow/workflow-capability.service.test.ts --maxWorkers=1` — passed (4 files, 69 tests).
- The migration test passed with the migration-specific Vitest config. `pnpm --filter @n8n/db build`, `pnpm db:schema:docs`, `pnpm db:schema:check`, `pnpm --filter n8n typecheck`, Biome on changed source/test files, and `git diff --check` passed.
- This evidence covers the parent Agent dispatch key. It does not prove a distinct child workflow invocation key, per-child outcome delivery, or child cancellation after access loss. Do not mark T005/T006 complete. T007–T010 and G4–G5 remain open; no live workflow call is enabled.

### Child workflow native-key lookup progress — 2026-11-04

- The selected workflow ID snapshot now reaches the native workflow-tool context for department attempts. The native child execution receives a stable hashed key derived from project, attempt thread, Agent run, tool-call ID, and workflow ID. Ordinary Agent workflow-tool calls do not receive this key.
- The Agents owner now looks up a retained native execution after a duplicate-key rejection. It checks the persisted input hash before replaying the existing execution. A different input returns a conflict. A nonterminal execution that is no longer active locally returns an accepted, nonterminal response instead of starting another child.
- `ExecutionPersistence` delegates the lookup to `ExecutionRepository`. The repository includes soft-deleted executions so a retained key cannot be accepted again after deletion from normal views.
- At this checkpoint, focused checks passed for workflow-factory and selected-tool filtering, the repository deduplication-key lookup, CLI typecheck, `@n8n/db` build, Biome, and `git diff --check`.
- Re-audit found that configuration and runtime still exposed calls while G4–G5 were open. A follow-up change now rejects enabling capabilities, returns no enabled workflow IDs, filters department workflow tools at runtime, and rejects direct child invocation in department context. The guard is `false` in the Agents owner. Existing enabled rows remain stored but cannot expose tools.
- Current gate checks passed: 89 focused tests across workflow-tool construction, capability configuration, and the owner runtime filter; the focused work-attempt integration test that verifies a legacy enabled row is not included in a new attempt; CLI typecheck; Biome on ten changed files; and `git diff --check`.
- The complete work-attempt integration file had one pre-existing order-sensitive failure in “keeps an uncertain dispatch reserved and never starts it again during reconciliation” (`reconcileAttempts()` returned 1). The test passed when rerun alone. The new legacy-capability integration test passed in the full file. Treat the isolated pass as focused evidence; the full file is not fully green.
- These checks do not prove department-owned invocation rows, durable acceptance ordering, uncertain-outcome reconciliation, child completion receipts, wait/resume recovery, stop propagation, or access-loss behavior. T005–T010 and G4–G5 remain open. Runtime remains disabled.
- The attempt's selected workflow IDs now also flow into delegated child reconstruction, detached background sub-agent runs, and background approval resumes. The closed gate removes workflow tools from those runtimes too; the shared saved Agent remains unchanged.
- `pnpm exec biome check packages/cli/src/modules/agents/background/sub-agent-background-runner.ts` and Biome checks for the reconstruction changes passed. Focused reconstruction, workflow-tool, and capability tests passed (3 files, 90 tests). `pnpm --filter n8n typecheck` and `git diff --check` passed.
- Added a focused detached-run test: `pnpm --filter n8n exec vitest run src/modules/agents/background/__tests__/sub-agent-background-runner.test.ts --maxWorkers=1` passed (20 tests); it verifies the workflow allowlist reaches a background child. Biome passed for the runner and test.
- This closes another selected-tool propagation path only. It does not supply department-owned invocation identity or child outcome receipts. T005–T010 and G4–G5 remain open; runtime remains disabled.

### Attempt-pinned capability revision progress — 2026-11-04

- Work attempts now persist the selected capability revision fields alongside the workflow ID snapshot. The revision snapshot travels through the department dispatch queue, runtime reconstruction, delegated children, and detached background children. Recovery resends the persisted snapshot instead of reading newer capability settings.
- The department input hash includes capability revision identity. Reusing a dispatch key with a changed capability revision returns a conflict.
- The native workflow tool checks the selected capability revision against the loaded publication version, trigger compatibility reference, and input-schema fingerprint before dispatch. The workflow invocation gate remains closed, so this path cannot start a department child workflow yet.
- `pnpm --filter @n8n/api-types build`, `pnpm --filter @n8n/db build`, and `pnpm --filter n8n typecheck` passed. Biome passed on the touched source and test files.
- Focused unit tests passed: 144 tests across the workflow tool, runtime filter, department queue, adapter, and background runner. The migration test passed. `pnpm db:schema:docs` and `pnpm db:schema:check` passed for SQLite and PostgreSQL.
- The work-attempt integration file passed 31 of 32 tests. Its known order-sensitive reconciliation case still returns 1 instead of 0; the new capability snapshot case passed. Do not report the full file as green.
- This progress does not add the department-owned invocation service, invocation receipt reconciliation, safe result projection, or child stop propagation. T005–T010 and G4–G5 remain open; runtime remains disabled.

### Department child invocation reservation progress — 2026-11-04

- Added a department-owned invocation service and repository. The service persists a pending invocation and stable owner key before the native workflow runner starts a child execution. It checks the active attempt, current work claim, member binding, selected capability revision, input hash, and published workflow version.
- The native workflow tool uses the owner key as the execution deduplication key. It resolves a prior execution after a duplicate-key rejection, checks the stored input hash, and records owner acceptance only when the child execution and pinned publication match. Unknown dispatch outcomes remain unknown and do not trigger a second key.
- Parent authority uses `WorkClaim.executionId` from persistence. `ctx.runId` is an SDK run identifier and does not equal the AgentExecution ID. The native Agents adapter verifies the execution from the claim against the attempt, project, Agent, initiating user, live status, and dispatch key.
- `claimGeneration` maps to `WorkAttempt.ordinal`; `WorkClaim` has a unique `attemptId`, so the current schema allows one claim per attempt.
- Focused checks passed: `pnpm --filter n8n typecheck`; workflow-tool and invocation-service tests (2 files, 64 tests); the SQLite migration test for capability, revision, invocation, and receipt tables; `pnpm --filter @n8n/db build`; `pnpm db:schema:docs`; `pnpm db:schema:check:sqlite`; `pnpm db:schema:check`; Biome on the touched invocation source and focused tests.
- The first migration-test run used a stale `@n8n/db` build and failed because the generated migration index did not include `ownerInvocationKey`. Rebuilding `@n8n/db` regenerated the index; the same migration test then passed. `pnpm db:schema:check:postgres` is not a root command; `pnpm db:schema:check` checked both SQLite and PostgreSQL and passed.
- The OpenRouter free model rejected the live Agent run after three attempts because its daily quota was exhausted. This does not validate child workflow execution. Child terminal outcomes, wait/retry updates, cancellation and late-result handling, durable input-reference resolution, uncertain-dispatch reconciliation, and live owner acceptance remain unverified. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Child outcome owner outbox progress — 2026-11-04

- Department workflow executions now stamp their invocation ID into the native execution metadata. The Agents lifecycle hook reads that owner-persisted metadata when the child waits or finishes.
- Agents appends a compact outcome event to its own outbox. The generated database identity supplies the owner sequence. The event stores no workflow output or error payload.
- A scheduled Agents task retries pending outcome delivery. This covers a lifecycle event that arrives before the department records native acceptance, and delivery failure after a process restart.
- The lifecycle projection currently records `running`, `waiting`, `succeeded`, `failed`, and `cancelled`. It does not yet identify native retries as `retrying`. Child cancellation proof, late-result policy, focused tests, migration checks, and live provider acceptance remain open. No test or runtime pass is claimed for this slice.
- T005–T008 remain partial. T009–T010 and G4–G5 remain open; both invocation gates stay false.

### Outcome ordering and lifecycle test progress — 2026-11-04

- Added focused tests for the Agents owner outbox, lifecycle state projection, terminal-state protection from a later nonterminal event, and old-attempt outcome scoping.
- `pnpm --filter n8n exec vitest run src/modules/agents/__tests__/agent-workflow-tool-resume.service.test.ts src/modules/agents/__tests__/agent-department-workflow-event.service.test.ts --maxWorkers=1` — passed (2 files, 42 tests).
- `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts --maxWorkers=1` — passed (1 file, 7 tests).
- `pnpm --filter n8n exec vitest run --config vitest.config.integration.ts test/integration/agents/agent-workflow-tool-resume.test.ts --maxWorkers=1` — passed (1 file, 2 tests).
- `pnpm --filter n8n typecheck` — passed after fixing the persisted child-state type and updating the lifecycle test constructor.
- `pnpm --filter @n8n/db build`, `pnpm db:schema:docs`, and `pnpm db:schema:check` — passed. The generated SQLite and PostgreSQL schema documentation includes the Agents outcome outbox.
- Biome checks for the seven changed TypeScript files and `git diff --check` — passed.
- These checks do not cover durable input-reference resolution, dispatch reconciliation after process loss, native retry classification, child stop proof, or live provider execution. T005–T010 remain open and G4–G5 still block enablement. Both invocation gates stay false.

### Duplicate child recovery progress — 2026-11-04

- A replay that finds a retained, inactive, nonterminal native child now records owner acceptance before returning the child as nonterminal. The replay verifies both the persisted input hash and department invocation ID before accepting the execution.
- `pnpm --filter n8n exec vitest run src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts --maxWorkers=1` — passed (60 tests).
- Biome checks for the workflow factory and its focused test, and `git diff --check` — passed.
- This covers retry-based recovery when the native child row is retained. It does not reconcile a pending department reservation without a tool replay, resolve `inputsRef`, prove retry/wait semantics or stop propagation, or validate live provider execution. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Owner-key acceptance reconciliation progress — 2026-11-04

- Added an Agents-owned lookup boundary for child invocation keys. It checks the retained native execution's invocation ID, input hash, and pinned workflow version before it reports acceptance.
- Added an AI Department reconciliation task for `pending` and `unknown` reservations. A verified owner lookup records acceptance. An absent or unverifiable execution does not trigger dispatch. A verified child state is appended to the Agents outcome outbox before lookup returns.
- The native execution metadata now persists the pinned workflow version for later owner verification.
- `pnpm --filter n8n exec vitest run src/modules/agents/__tests__/agent-department-workflow-invocation-owner.service.test.ts src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts --maxWorkers=1` — passed (3 files, 72 tests). The cases include absent-key handling without redispatch.
- `pnpm --filter n8n typecheck` — passed.
- This improves accepted-child recovery after department process loss. It does not prove `inputsRef` resolution, recovery of a child that was never persisted, retry/wait continuation, stop propagation, or live provider execution. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Durable invocation input progress — 2026-11-04

- AI Department now assigns a stable input reference from the reserved invocation ID. Agents stages the matching input before native child dispatch and encrypts the payload with `Cipher.encryptV2()`.
- Agents can resolve the stored input only when project, invocation, reference, and input hash match. A replay with the same reservation does not replace the stored payload.
- Agents removes staged input after the durable outcome reaches AI Department. The outcome outbox remains pending if input cleanup or delivery fails, so reconciliation can retry safely.
- Added migration `1793735236994-AddAgentDepartmentWorkflowInputs` and schema docs for SQLite and PostgreSQL.
- Focused checks passed: 5 test files, 78 unit tests; the new SQLite migration test (1 test); `pnpm --filter n8n typecheck`; `pnpm --filter @n8n/db build`; `pnpm --filter @n8n/db schema:check`; and Biome on changed TypeScript files.
- This adds durable staging/resolution. It does not yet use the resolver to reconstruct a child before native persistence, and does not prove retry/cancellation, result delivery, or live provider behavior. T005–T010 remain open; both invocation gates stay false.

### Durable input execution progress — 2026-11-04

- The Agents workflow adapter now resolves the staged payload by project, invocation, reference, and hash before it builds native execution data. The resolved payload is the payload sent to the child workflow.
- The workflow factory test verifies that resolution completes before native dispatch. `pnpm --filter n8n exec vitest run src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-input.service.test.ts --maxWorkers=1` passed (2 files, 63 tests).
- `pnpm --filter n8n typecheck`, Biome on both changed TypeScript files, and `git diff --check` passed.
- This uses the encrypted input reference in the dispatch path. It does not autonomously restart a reserved invocation after a crash before native execution persistence. Retry, cancellation proof, authorized result delivery, and live provider validation remain open. T005–T010 remain open; both invocation gates stay false.

### Child cancellation intent progress — 2026-11-04

- When a department tool call receives an abort, Agents records `cancelRequestedAt` against the accepted invocation and exact child execution before it calls the native stop service.
- The department rejects a cancellation request for a different execution reference. The request does not change `childState`; the existing lifecycle event must prove the terminal result.
- `pnpm --filter n8n exec vitest run src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts --maxWorkers=1` passed (2 files, 71 tests). `pnpm --filter n8n typecheck`, Biome on the five changed TypeScript files, and `git diff --check` passed.
- This covers cancellation ordering for an active tool call. It does not retry a stop request after process loss, cover a lost-access race, or prove live native cancellation. Retry linkage, authorized result delivery, live provider validation, and the full T009/T010 acceptance matrix remain open. Both invocation gates stay false.

### Result delivery authorization progress — 2026-11-04

- Before an invocation result returns to the Agent, AI Department rechecks the accepted child reference, current attempt, member binding, live claim, work state, and parent execution authorization. Agents also rechecks the native workflow caller policy before it returns the result.
- A focused test verifies that loss of parent run authority denies result delivery. The workflow factory test covers delivery for the active tool path. Both tests are in the 72-test run recorded for this slice.
- `pnpm --filter n8n typecheck`, Biome on the five changed TypeScript files, the focused invocation service test (11 tests), and `git diff --check` passed.
- The rejection path is covered. Successful delivery after current authorization, access revocation during execution, retries, and live provider behavior still need acceptance evidence. T005–T010 remain open and both invocation gates stay false.

### Native retry linkage progress — 2026-11-04

- Agents now persists the native `retryOf` reference on each child outcome event. A retry emits an ordered `retrying` event followed by the retry execution's current lifecycle state.
- AI Department accepts a new execution reference only when its retry parent matches the currently accepted execution. It records the retry lineage and ignores late events from known superseded executions.
- Added a reversible SQLite/PostgreSQL migration and refreshed generated schema docs for both database types.
- Focused lifecycle, owner outbox, and invocation tests passed (3 files, 57 tests). The migration registry test passed (3 tests). `pnpm --filter n8n typecheck`, `pnpm --filter @n8n/db build`, `pnpm --filter @n8n/db schema:check`, Biome, and `git diff --check` passed.
- This validates retry projection and stale-event handling in controlled tests. It does not prove live retry behavior, restart recovery before native child persistence, successful production provider execution, or child stop proof. T005–T010 remain open; both invocation gates stay false.

### Crash-before-persistence recovery audit — 2026-11-04

- Rechecked the current worktree after the native retry slice. AI Department reconciliation only looks up the owner key. If lookup says `absent`, it changes a `pending` reservation to `unknown` and does not dispatch again. This preserves the rule that an uncertain invocation cannot start a second child.
- The native execution deduplication key is unique. However, `ExecutionPersistence.create()` reclaims an existing execution row while its status is `new`. Its source comment documents that this can race a queued worker and cause a second dispatch. Therefore, an `absent` lookup plus replay of the same key is not yet a sufficient owner guarantee for automatic recovery.
- Do not change reconciliation to redispatch on `absent` until the native owner can fence the initial dispatch against recovery, including the queued `new` window. The current owner contract has lookup but no reservation/fencing operation for that gap.
- GitNexus impact was attempted for the invocation reconciliation method. The indexed repository does not contain that method. The workflow-tool index returned an incomplete lower-bound impact result with no callers resolved, so it is not evidence that changing the native dispatch path is isolated. No dispatch source was changed in this audit.
- This audit does not complete T009 crash recovery, T005–T008 owner behavior, or G4–G5. Both invocation gates stay false. A future implementation slice must add the owner-side fence and controlled crash/race coverage before any gate change.

### Focused regression rerun — 2026-11-04

- On the current worktree, the workflow invocation service suite passed (13 tests).
- The Agents workflow factory, owner lookup, outcome outbox, and encrypted-input suites passed (4 files, 71 tests).
- These runs confirm the implemented slices only. They do not cover crash-before-child-persistence recovery or persistent stop/revocation for waiting or retrying children.

### Child stop recovery audit — 2026-11-04

- `WorkflowInvocationService.cancellationRequested()` persists `cancelRequestedAt` before the active tool path calls native stop. This orders the live abort path safely.
- `WorkflowInvocationRepository.findNeedingOwnerReconciliation()` selects only `pending` and `unknown` dispatches. It does not return an acknowledged, nonterminal invocation with `cancelRequestedAt` set. A process loss after the timestamp is saved can therefore leave the child running without a later stop attempt.
- `DepartmentWorkflowInvocationOwner` currently exposes `lookup()` only. The approved contract also requires owner stop and snapshot operations. Reconciliation must retry stop by accepted child reference and require terminal owner evidence before it reports cancellation confirmed.
- This audit confirms G5 remains open for waiting/retrying child stop and revocation. It does not authorize a stop request without current persisted invocation identity and an owner-verified execution reference. Both invocation gates stay false.

### Durable child stop retry progress — 2026-11-04

- The AI Department reconciliation task rechecks authority for acknowledged, nonterminal child invocations. If the active attempt, claim, member binding, work, capability, or parent Agent run is no longer authorized, it persists a cancellation timestamp. The task scans these invocations and retries stop after process recovery.
- Agents exposes a verified child snapshot and verifies project ID, invocation ID, input hash, pinned workflow version, and exact owner execution reference before requesting native stop. It records an owner outcome when the native execution is already terminal; a stop request itself does not mark the department invocation cancelled.
- New child execution metadata includes the project ID. Existing in-flight child executions created before this change do not have that value and are treated as unverifiable by owner lookup/stop.
- Focused workflow-tool, owner, and invocation service tests passed: 3 files, 82 tests. `pnpm --filter n8n typecheck` and Biome on changed TypeScript files passed. `git diff --check` passed.
- GitNexus impact lookups could not resolve the new owner and service symbols in its indexed repositories; both returned `UNKNOWN`. Manual call-site search found one owner implementation registered in `AgentsModule`, one proxy consumer in the workflow invocation service, and the existing reconciliation task registration in `AiDepartmentModule`. This is not a complete graph blast-radius proof.
- This does not yet prove that terminal outbox delivery clears every stop intent or that native stop succeeds for all execution modes. Crash-before-persistence recovery and live provider acceptance are also open. T005–T010 and G4–G5 remain open. Both workflow invocation gates stay false.

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.

### Duplicate reservation replay guard — 2026-11-04

- A replayed Agent tool call now asks the Agents owner to verify the reserved invocation key before it can continue.
- If the owner verifies an existing child execution, the tool reuses that execution reference and skips `workflowRunner.run()`.
- If the owner cannot verify a child, the tool fails closed and does not dispatch another child. This prevents a duplicate reservation from entering native tombstone reclamation.
- `pnpm --filter n8n exec vitest run src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts --maxWorkers=1` passed (2 files, 77 tests).
- This closes the duplicate tool replay path only when the owner can verify a retained child. It does not recover a reservation with no child row, prove the queue `new` race, validate stop propagation, or pass live provider acceptance. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Workflow bridge regression audit — 2026-11-04

- The full 004 workflow service folder passed: `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow --maxWorkers=1` (2 files, 23 tests).
- The focused owner-to-department suites passed: `pnpm --filter n8n exec vitest run src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-owner.service.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-input.service.test.ts src/modules/agents/__tests__/agent-department-workflow-event.service.test.ts src/modules/ai-department/__tests__/workflow/workflow-capability.service.test.ts src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts --maxWorkers=1` (6 files, 98 tests).
- These are controlled unit tests. They do not prove restart recovery when no child row exists, live native execution, OpenRouter provider acceptance, or the quickstart. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Concurrent reservation regression — 2026-11-04

- Added a service test that races two identical reservation requests. The simulated atomic `insertIfAbsent` lets one request create the invocation; both requests receive the same invocation ID and owner key.
- `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts --maxWorkers=1` passed (1 file, 16 tests).
- The test covers service handling of an insert race. It does not exercise the repository against SQLite or PostgreSQL and does not prove recovery before native child persistence. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### SQLite invocation reservation race — 2026-11-04

- Added a database integration case that creates a real project, department, member, work item, attempt, and workflow capability. It sends concurrent inserts with the same `(attemptId, requestId)` key and checks that SQLite stores one row.
- The first run found that TypeORM SQLite returns identifiers for both `INSERT OR IGNORE` calls. The repository therefore reported both requests as winners even though the unique index stored one row. `insertIfAbsent()` now reads the row for the scoped key and returns true only for the caller whose invocation ID was persisted.
- The integration suite passed: `pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` (33 tests). `pnpm --filter n8n typecheck`, Biome on the repository and integration test, and `git diff --check` passed.
- This verifies concurrent reservation winner reporting on SQLite. A PostgreSQL run later passed this selected reservation case, but the full PostgreSQL integration file has fixture failures. Crash recovery before native execution persistence, stop proof across execution modes, and live provider acceptance remain unverified. T005–T010 and G4–G5 stay open; both invocation gates stay false.

### Durable child snapshot reconciliation — 2026-11-04

- The 30-second AI Department reconciliation task now asks the Agents owner for a verified snapshot of each acknowledged, nonterminal child execution.
- Agents writes a changed child state to its durable outcome outbox. It checks the latest event first, so a repeated poll does not append the same state while that event is pending or already delivered.
- Added focused tests for owner identity checks, changed-state outbox writes, duplicate poll suppression, and department reconciliation calls.
- `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow/workflow-invocation.service.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-owner.service.test.ts src/modules/agents/__tests__/agent-department-workflow-event.service.test.ts --maxWorkers=1` passed (3 files, 30 tests). `pnpm --filter n8n typecheck`, Biome on nine changed TypeScript files, and `git diff --check` passed.
- The snapshot path now records state changes and terminal proof when the owner row remains available. It does not prove execution stop across every queue mode, recovery before native child persistence, PostgreSQL reservation contention, or live provider behavior. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### PostgreSQL reservation check — 2026-11-04

- PostgreSQL metadata validation found four AI Department `Date` columns declared as `datetime`. The corresponding common migrations create timezone-aware timestamp columns. The entities now use the shared `DateTimeColumn` helper to map SQLite `datetime` and PostgreSQL `timestamptz`.
- The PostgreSQL integration test for concurrent invocation inserts passed after the `DateTimeColumn` correction (1 selected test, 32 skipped). It confirms one reservation winner on PostgreSQL.
- The SQLite work-attempt integration suite passed after the same correction (33 tests).
- The full work-attempt integration file started on PostgreSQL: 24 tests passed and 9 failed. The failures share a fixture issue: PostgreSQL rejects a null `createdAt` on `ai_department_work_claim`. This run is not a clean full-suite pass.
- Five focused capability, invocation, encrypted-input, owner, and outbox test files passed (41 tests). The workflow factory, execution adapter, and selected-tool filter tests passed (3 files, 101 tests). `pnpm --filter n8n typecheck` and Biome on the four entity files passed.
- PostgreSQL runtime integration remains partial. The reservation survives this check; crash-before-native-persistence recovery, complete stop proof, and live provider acceptance remain open. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Engine v2 owner boundary — 2026-11-04

- `EngineV2Dispatcher` confirms that manual runs configured for Engine v2 start in the data plane without a control-plane execution row.
- AI Department owner lookup, snapshot, and stop require the native execution row and its verified metadata. The capability descriptor now rejects a published Engine v2 workflow before it can be selected.
- The capability API error now tells the user to select a workflow that uses the standard engine and a supported trigger.
- Focused descriptor test passed: `pnpm --filter n8n exec vitest run src/modules/agents/__tests__/agent-workflow-capability-descriptor.service.test.ts --maxWorkers=1` (1 test). `pnpm --filter n8n typecheck`, Biome on the changed TypeScript files, and `git diff --check` passed.
- This closes the known Engine v2 configuration gap only. It does not resolve native `new` queue ownership, recovery before child persistence, complete stop proof, or live provider acceptance. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Native execution acceptance boundary — 2026-11-04

- Native `new` rows are now treated as unverified in owner lookup and snapshot. Persistence creates the row before dispatch and queue workers may claim it later, so the row alone does not prove that execution started.
- Owner stop still accepts a matching `new` row and asks the native execution service to stop it. Lookup and snapshot do not report it as running or append a running event.
- The owner service suite passed after adding lookup and snapshot cases: 1 file, 9 tests. Biome, CLI typecheck, and `git diff --check` passed.
- GitNexus could not resolve the owner service symbol in its indexed repository and returned `UNKNOWN`. Manual search found this service is consumed through the Agents owner proxy by workflow invocation code. The graph result does not establish a complete blast radius.
- This is fail-closed verification, not automatic recovery. A valid queued `new` child may report unknown until a worker updates the native row. Recovery before child persistence, stop proof across all execution modes, and live provider acceptance remain open. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Owner boundary and post-stop reconciliation — 2026-11-04

- The department tool now rejects Engine v2 at the dispatch boundary as well as at capability configuration. This protects older capability rows if the invocation gate is enabled in the future.
- Owner snapshot reconciliation now includes acknowledged invocations with a persisted stop request. A missed terminal event can be recovered from the native owner snapshot; cancellation remains pending until the owner reports a terminal state.
- The PostgreSQL/SQLite integration fixture verifies that a waiting invocation with `cancelRequestedAt` is selected for child snapshot reconciliation. SQLite integration passed (33 tests). Workflow factory and invocation service suites passed (2 files, 81 tests). CLI typecheck, Biome, and `git diff --check` passed.
- GitNexus could not resolve the touched service/repository symbols in its feature indexes (UNKNOWN). Manual search found `reconcileChildSnapshots()` is called by the registered workflow reconciliation task, and both repository query methods are used only by their respective reconciliation paths. The graph does not establish a complete blast radius.
- This closes local coverage for the post-stop snapshot path. It does not prove live queue cancellation across execution modes, recover a reservation before native child persistence, or validate a live model provider. T005–T010 and G4–G5 remain open; both invocation gates stay false.

### Current worktree regression rerun — 2026-11-04

- The focused workflow bridge suites passed on the current worktree: `pnpm --filter n8n exec vitest run src/modules/ai-department/__tests__/workflow src/modules/agents/tools/__tests__/workflow-tool-factory.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-owner.service.test.ts src/modules/agents/__tests__/agent-department-workflow-invocation-input.service.test.ts src/modules/agents/__tests__/agent-department-workflow-event.service.test.ts --maxWorkers=1` (6 files, 107 tests).
- Native execution persistence tests passed: `pnpm --filter n8n exec vitest run src/executions/__tests__/execution-persistence.test.ts --maxWorkers=1` (1 file, 129 tests).
- SQLite work-attempt integration passed: `pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/modules/ai-department/__tests__/work/work-attempts.integration.test.ts --maxWorkers=1` (1 file, 33 tests).
- `pnpm --filter n8n typecheck` passed. `git diff --check` passed.
- The run covers controlled service and owner cases only. The OpenRouter account shown in the n8n UI rejected a live Agent run after three attempts because its free-model daily quota was exhausted. This does not validate live child workflow execution.
- Crash recovery before native execution persistence, the native queued `new` race, live stop proof across execution modes, and provider-backed quickstart acceptance remain open. T006 and T010 remain open; G4–G5 keep both invocation gates false.

### Department child tombstone safety — 2026-11-04

- Native execution persistence now skips tombstone reclamation when execution metadata carries an AI Department workflow invocation ID. A duplicate department child key can no longer delete a `new` row while queue acceptance is unknown. Other execution keys keep the existing reclaim behavior.
- The focused execution persistence suite passes 130 tests. CLI typecheck, Biome for the changed files, and `git diff --check` pass.
- This does not recover a child after a crash before native persistence or queue acceptance. Queue lookup, same-row re-enqueue, native stop proof, and provider acceptance remain open. T006/T010 remain open. Both invocation gates stay false.

### Department child queue-recovery preservation — 2026-11-04

- Queue recovery now checks dangling `new` rows for AI Department workflow invocation metadata. It leaves those child rows in `new` and logs their IDs because queue acceptance is unknown. Other dangling executions keep the existing crash behavior.
- The focused ScalingService suite passes 72 tests. Biome and `git diff --check` pass for the changed files. CLI typecheck was started but its terminal process ended before a result could be collected.
- This preserves the same native execution row; it does not re-enqueue it or prove that a queue job was accepted. Same-row dispatch and atomic queue acceptance remain open. T006/T010 remain open; both invocation gates stay false.

### Department child queue identity and retry visibility — 2026-11-04

- Queue mode now uses the native execution ID as the Bull job ID only when the persisted run data identifies an AI Department workflow invocation. Re-adding the same native execution therefore uses the same Bull job key. Other execution jobs keep generated IDs.
- Queue recovery now checks `delayed` jobs with `active` and `waiting` jobs. A child retry waiting in Bull is not classified as a missing execution.
- The metadata probe in native execution creation now tolerates absent run data, which is valid for queued execution creation paths.
- Verification passed: WorkflowRunner and ScalingService suites, 2 files and 140 tests; CLI typecheck; Biome on five changed files; and `git diff --check`.
- A stable job key and delayed-job visibility reduce duplicate enqueue risk. They do not yet restart a retained `new` row after a process crash or prove queue acceptance atomically with native persistence. Original caller identity, native stop proof, and live provider acceptance remain open. T006/T010 remain open; both invocation gates stay false.


### Same-row department child queue recovery — 2026-11-04

- Recovery now holds a department child native row in `new` until Bull accepts or claims its stable native execution ID. `ActiveExecutions.add()` no longer changes that row to `running` before enqueue.
- Agents owner lookup verifies the stable job in the expected project pool. It accepts only `active`, `waiting`, `delayed`, or `paused`. A replay may re-enqueue the same retained row with its stored caller identity. An unverified replay fails closed.
- Verification passed: five focused suites, 273 tests; CLI typecheck; Biome on ten changed TypeScript files; and `git diff --check`.
- Generic reconciliation still does not replay a pending reservation without a tool replay. Recovery before native row creation, complete native stop proof, live provider execution, and provider-backed quickstart acceptance remain open. T006/T010 and G4–G5 stay open; both invocation gates remain false. `.specify/feature.json` still points to Spec 004.

### G4 focused recovery recheck — 2026-11-05

- Re-ran the owner recovery, WorkflowRunner queue acceptance, ScalingService recovery, and execution persistence suites. All four passed: 284 tests.
- Owner lookup accepts a native `new` row only when the stable Bull job is observable. Owner recovery replays the same retained execution ID. Queue recovery preserves a department child row when acceptance is unknown.
- This still does not recover a reservation when the process stops before native execution persistence. Generic reconciliation does not create or enqueue a child from that reservation. Keep G4 open and both invocation gates false.

### Encrypted pre-persistence dispatch recovery — 2026-11-05

- Agents now stages an encrypted immutable dispatch descriptor beside the encrypted invocation inputs before `WorkflowRunner.run()`. It records the owner key, published workflow version, caller identity, execution mode, and Agent run context. A new reversible migration adds the nullable descriptor column.
- When native execution persistence has no row, owner reconciliation can load the descriptor, resolve the encrypted inputs, recheck the published workflow and subworkflow policy, and retry with the same owner key. AI Department rechecks the active attempt, claim, binding, capability snapshot, and parent Agent run before it calls recovery. Missing or invalid data stays absent or unknown; it does not count as acceptance.
- Verification passed: four focused unit suites, 101/101 tests; migration up/down test, 1/1; CLI typecheck; Biome on 11 changed TypeScript files; SQLite/Postgres schema docs and checks; and `git diff --check`.
- This does not prove atomic queue acceptance, stop propagation across execution modes, process-crash behavior on a live queue, or provider-backed execution. T006/T010 and G4–G5 stay open. Both invocation gates remain false. Keep `.specify/feature.json` at Spec 004.

### Read-only owner lookup and queue acceptance boundary — 2026-11-05

- Owner `lookup()` now only reads native state. It returns absent when no native row exists. Only `recover()` may reconstruct a dispatch. The reconciliation task calls `recover()` only after it rechecks the active attempt, claim, work ownership, binding, capability revision, and parent Agent run.
- Added a regression test that gives the owner the encrypted descriptor and proves `lookup()` does not resolve or dispatch it. The four focused invocation, input, owner, and tool suites pass 102/102 tests. The real Redis idle-worker queue integration passes 7/7 tests. CLI typecheck, Biome, and `git diff --check` pass.
- Source inspection confirms `WorkflowRunner.run()` awaits queue enqueue, `ScalingService.addJob()` uses the stable native execution ID, and owner lookup accepts a `new` child only when Bull reports an active, waiting, delayed, or paused job. The Redis tests exercise Bull queue behavior but not an AI Department child across a process crash. Keep atomic owner acceptance and live crash recovery unproven; T006/T010 and G4–G5 stay open. Both invocation gates remain false.

### Current G4 recovery recheck — 2026-11-05

- The owner test now covers recovery from an encrypted dispatch descriptor when native execution persistence has no matching row. Recovery rebuilds the call from the pinned published workflow and staged inputs, then requires the native owner lookup to confirm acceptance.
- Re-ran the owner, encrypted-input, WorkflowRunner, ScalingService, and native execution-persistence suites: 5 files, 291 tests passed. The suite covers controlled recovery and queue behavior. It does not prove atomic acceptance or a live child recovering across process restart.
- G4 and T006 remain open for atomic queue acceptance and live owner recovery evidence. G5/T010 remain open for stop propagation across execution modes and provider-backed quickstart acceptance. Both workflow gates stay false. The feature pointer remains Spec 004.

### Invocation permission contract recheck — 2026-11-05

- A separate queue-mode provider probe reached a real Agent execution and persisted a work claim. Its workflow tool call failed before any invocation reservation or child execution row existed. The claim execution ID matched the Agent execution record. The run did not expose which owner authorization predicate failed.
- Source inspection found that `verifyRun()` required `agent:execute` plus `agent:update`, while dispatch and user stop require `agent:execute` and the Spec 004 permission contract assigns `agent:update` to configuration only. Updated `verifyRun()` to recheck only `agent:execute` and added a test that asserts that contract.
- Adapter and invocation unit tests pass 36/36. The work attempts integration suite passes 35/35 with `vitest.config.integration.ts`. Biome and `git diff --check` pass.
- This closes the source permission mismatch only. The provider probe did not prove that this mismatch caused its rejection. It did not create a child execution. Atomic owner acceptance, queued `new` recovery, restart recovery, native stop propagation, and provider-backed quickstart acceptance remain unproven. Keep T006/T010 and G4/G5 open and keep both runtime gates false.

### Stored caller identity recovery check — 2026-11-05

- Added a regression case for a retained `new` execution that has matching invocation metadata but no stored caller identity. Recovery returns `unknown`, does not call the workflow runner, and does not record owner acceptance.
- The owner suite passes 14/14 tests. Biome and `git diff --check` pass for the test file.
- This verifies fail-closed behavior for a missing identity. It does not prove atomic queue acceptance, live process recovery, native stop propagation, or provider-backed quickstart behavior. T006/T010 and G4/G5 remain open. Both workflow invocation gates stay false.

### Queue visibility after retained-row recovery — 2026-11-05

- Added a recovery test for a retained `new` execution. The owner reuses its execution ID and stored caller identity. If the queue observer still cannot see the stable job, recovery returns `unknown` and does not record acceptance.
- The focused owner suite passes 15/15 tests. Biome and `git diff --check` pass for the test file.
- This verifies the fail-closed handoff contract with controlled doubles. It does not prove Redis queue visibility after a process restart, atomic acceptance, stop propagation, or provider-backed quickstart behavior. Keep T006/T010 and G4/G5 open. Both workflow invocation gates stay false.

### Current owner and real-Redis recheck — 2026-11-05

- The owner, encrypted-input, invocation, WorkflowRunner, ActiveExecutions, ScalingService, and native execution-persistence suites passed: 9 files, 440 tests. The real-Redis idle-worker queue integration passed 7/7 tests using the test Redis container.
- The tests cover controlled recovery, queue claims, and stable execution IDs. They do not prove atomic acceptance across native persistence and Bull, AI Department child recovery after a live process restart, or stop propagation across every execution mode.
- The n8n health endpoint returned HTTP 200. `127.0.0.1:1337`, the configured local provider endpoint, refused the connection. Provider-backed quickstart acceptance remains unrun. T006/T010 and G4/G5 remain open; both invocation gates stay false. `.specify/feature.json` remains on Spec 004.

### Current invocation owner recheck — 2026-11-05

- Re-ran the invocation owner and service reconciliation suites: 35/35 tests passed. This confirms controlled lookup, recovery, and reconciliation behavior in the current worktree; it does not prove live process recovery or queue acceptance across native persistence and Bull.
- The configured provider base URL is `127.0.0.1:1337`, but the endpoint refuses connections. Ollama, LM Studio, and llama.cpp endpoints were also not running. T006/T010 and G4/G5 remain open. Both workflow invocation gates stay false. `.specify/feature.json` remains on Spec 004.

### Native stop owner recheck — 2026-11-05

- The isolated n8n instance returned HTTP 200. Local Ollama served `qwen2.5:3b` at `127.0.0.1:1337`.
- The workflow invocation owner and reconciliation suites passed 35/35 tests. The native `ExecutionService` suite passed 62/62 tests, including regular, scaling, running, waiting, and pre-run stop paths.
- Source inspection confirms that the workflow owner checks the persisted child identity before it requests stop. The native service selects regular or scaling stop behavior from the configured execution mode. These tests do not prove a Spec 004 child stopped on a live instance, during access revocation, or across process restart.
- The invocation gate remains closed. Do not mark T006 or T010 complete. G4/G5 and provider-backed quickstart acceptance remain open. `.specify/feature.json` remains on Spec 004.

### Runtime capability gate check — 2026-11-05

- Used the test-owned session on the isolated instance at `127.0.0.1:5789` and project `dYyQWSNn04Ep9vTD`.
- The capability list returned no enabled workflows. A request to enable a test capability returned HTTP 409 with the owner-verification message. The request used a nonexistent workflow ID and failed at the gate before workflow lookup.
- This confirms the runtime gate fails closed. It does not test native owner acceptance, child recovery, stop propagation, or provider-backed workflow execution. Keep T006/T010 and G4/G5 open. `.specify/feature.json` remains on Spec 004.

### Current provider readiness recheck — 2026-11-05

- The test instance on `127.0.0.1:5789` returns HTTP 200 from `/healthz`. The local Ollama endpoint on `127.0.0.1:1337` returns a successful chat completion from `qwen2.5:3b`.
- The earlier queue-mode clone on port 5790 is not running. `N8N_API_KEY` is not set in this shell.
- This confirms provider and instance availability only. No workflow capability or invocation was created in this recheck. Both source gates remain `false`. T006/T010, G4/G5, and provider-backed quickstart acceptance remain open. `.specify/feature.json` remains on Spec 004.

### Native workflow child stop path recheck — 2026-11-05

- Reviewed the current owner path. It checks the stored project, invocation, input hash, pinned workflow version, and owner execution reference before it requests stop.
- `ExecutionService` uses the regular-mode active execution or wait tracker path, or the scaling-mode persisted cancellation plus worker stop broadcast. The native stop implementation allows `new`, `unknown`, `waiting`, and `running` executions; terminal owner states are recorded without a redundant stop.
- Focused checks passed: native `ExecutionService` (62 tests), workflow invocation owner (15 tests), and department invocation reconciliation (20 tests), 97 tests total.
- Added an isolated SQLite integration test that sends a verified waiting child through the real invocation owner, execution persistence, and `ExecutionService` in regular and queue modes. Both cases passed; queue mode also reached the native stop broadcast.
- This does not prove a live queue worker stopped the child after revocation or across process restart. Keep G5/T010 open. G4/T006 and provider-backed quickstart also remain open. Both runtime gates stay false; `.specify/feature.json` remains on Spec 004.

### Owner reconciliation fairness — 2026-11-05

- Repeated unresolved owner lookups now advance the invocation `updatedAt` and version through the optimistic repository update. The bounded owner-reconciliation batch sorts by `updatedAt`, so old unknown reservations move behind rows that have not been retried yet.
- The workflow-invocation service suite passes 21/21. The isolated SQLite work-attempt suite passes 35/35, including a repository case that confirms the next unknown row is selected after the first row is retried. Biome and CLI typecheck pass.
- This prevents an unresolved backlog from repeatedly occupying the same first batch. It does not prove queue acceptance ordering or recovery across a live process restart. Keep T006/T010 and G4/G5 open. Both workflow gates stay false; `.specify/feature.json` remains on Spec 004.
- Follow-up edge audit: reservation rejects an empty pinned workflow version before database reads. Reconciliation marks an existing row without a pinned version as unknown and advances its version and `updatedAt`, so it cannot stay at the head of every bounded batch. The invocation service suite passes 23/23, the isolated SQLite work-attempt suite passes 35/35, and CLI typecheck passes. GitNexus reports UNKNOWN/lower-bound impact for both changed methods because the index did not record scope-extraction completeness; text search found the periodic reconciliation task as the direct caller. This does not prove live queue acceptance or process-restart recovery; T006/T010 and G4/G5 remain open, and both gates remain false.
- Owner queue-state audit: a retained native row with status `new` is now reported as child `pending` after the stable Bull job becomes observable. The owner event and replay contracts carry `pending` through to the existing API status. This records queue acceptance without claiming that a worker started the workflow. The owner and workflow-tool suites pass 79/79. CLI typecheck, Biome, and `git diff --check` pass. Real Redis Bull claim and shutdown-return integration suites pass 17/17; they cover generic Bull recovery, not the full AI Department path. T006/T010 and G4/G5 remain open; both gates remain false.

### Verified child state on workflow acceptance — 2026-11-05

- The workflow tool now records acceptance only after the Agents owner confirms the exact execution reference and pinned version. The department stores the child state returned by the owner, so a queued child stays `pending` until a worker starts it. Reconciliation uses the same state.
- The workflow tool and invocation service suites pass 88/88 tests. CLI typecheck and Biome pass. `git diff --check` passes. Oxlint could not load its configured `@stylistic/eslint-plugin` dependency, so that lint check did not run.
- This fixes a false `running` projection. It does not prove atomic queue acceptance or recovery across a live process restart. T006/T010 and G4/G5 remain open. Both gates remain false. The feature pointer remains on Spec 004.

### Queue routing across owner recovery — 2026-11-05

- Queue-mode Department child executions now persist their selected Bull queue name in native execution metadata before row persistence. Owner lookup and same-row recovery reuse that queue after project pool settings change. Other workflow executions keep their existing routing path.
- WorkflowRunner and owner suites pass 84/84. The native SQLite owner integration passes 3/3, including lookup of the same `new` child after owner service reconstruction. Real Redis Bull idle-claim integration passes 7/7. Package typecheck and changed-file Biome pass.
- The SQLite integration uses a controlled queue-visibility result. The Redis suite covers generic Bull claims. Neither proves an AI Department child recovering after a live n8n process restart or atomic acceptance across DB and Redis. T006/G4 and T010/G5 remain open; both runtime gates remain false.

### Stable Bull job fence under concurrent recovery — 2026-11-05

- Extended the real-Redis integration test with two independent Bull clients concurrently adding the same department execution ID as `jobId`, then a newly constructed client replaying that execution. Redis retained one waiting job with the same ID and execution payload.
- `N8N_TEST_REDIS_HOST=127.0.0.1 N8N_TEST_REDIS_PORT=55021 pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/scaling/__tests__/bull-idle-claim.integration.test.ts --maxWorkers=1` passed (8 tests).
- Re-ran the native SQLite owner integration: `pnpm --filter n8n exec vitest run --config vitest.config.integration.ts src/modules/agents/__tests__/agent-department-workflow-stop.integration.test.ts --maxWorkers=1` passed (3 tests), including same-key lookup after owner-service reconstruction.
- This proves Bull's job-ID fence for concurrent and replayed adds to one queue. It does not prove the full AI Department owner, execution database, and application process restart together. T006/G4 and T010/G5 stay open; both runtime gates remain false.

### Owner recovery across separate processes — 2026-11-05

- Added a two-phase integration harness. Phase one writes a native `new` execution with a durable invocation key to a dedicated SQLite file and exits before queue dispatch. Phase two runs in a fresh Vitest process, reads the same database, confirms lookup is unknown before dispatch, calls the real owner `recover()`, and verifies the same native execution ID is accepted as one pending Bull job in isolated Redis.
- The first harness version used a `WorkflowRunner` test double. It has now been replaced by the production `WorkflowRunner` and `ScalingService`; the second process also loads the real Execute Workflow Trigger node type.
- Both separate-process phases passed on a fresh temporary SQLite file and the test Redis container. The retry process used production `WorkflowRunner.run()` to enqueue the persisted child through `ScalingService`; owner lookup found the same execution as pending. A second `recover()` replay returned the same owner result and left exactly one waiting job. CLI typecheck, Biome, and `git diff --check` pass.
- The harness now accepts `N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER` in the earliest CLI test setup, before `InstanceSettings` reads the folder. It also points production `ScalingService` to the same isolated Redis endpoint and Bull prefix as the test queue. Separate `prepare` and `recover` Vitest invocations pass against that shared temporary SQLite folder (one test passed in each process).
- This proves service-level child recovery across a real process boundary and stable native ID reuse. It does not start the full n8n CLI HTTP server or prove provider behavior. T006/G4 pass; G5 stop/revocation proof and T010 live acceptance remain open. Both runtime gates remain false.

### Live AI Department Agent work smoke check — 2026-11-05

- Used the isolated SQLite instance at `127.0.0.1:5791`, department `test`, member `son`, and a published Agent. Enabled the local `125_agents_n8n_chat` flag override, saved the n8n Chat channel, and published the Agent.
- The first three Agent runs failed because the channel was unavailable in the published Agent. A later retry claimed the work and submitted a marketing draft. The UI showed `Result submitted`.
- The activity showed three `Work claimed` events. This confirms a successful Agent-backed work result, but does not prove one claim per request.
- This does not execute a child workflow or prove owner acceptance, queue recovery, stop propagation, access revocation, or process-restart recovery. T006/T010 and G4/G5 remain open. Both workflow invocation gates remain false. `.specify/feature.json` remains on Spec 004.
