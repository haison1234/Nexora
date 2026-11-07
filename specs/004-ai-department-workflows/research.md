# Research: Workflow Capability Bridge

**Feature**: `004-ai-department-workflows`
**Reviewed**: 2026-11-02
**Evidence boundary**: Source and documentation review. No provider, migration, browser, or runtime test result is claimed.

## Source Evidence

| Concern | Source | Observed behavior |
|---|---|---|
| Workflow compatibility and waits | `packages/cli/src/modules/agents/tools/workflow-tool-factory.ts` | The native tool uses shared compatibility types, native runner/persistence, wait states, and background results. |
| Published workflow lookup | `packages/cli/src/modules/agents/tools/workflow-tool-workflow-loader.service.ts` | The loader rejects archived workflows, can select published content, and clears pinData. |
| Caller policy | `packages/cli/src/executions/pre-execution-checks/subworkflow-policy-checker.ts` | checkForProject applies policy to a project-scoped caller. |
| Workflow and execution scopes | `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts` | workflow:read, workflow:execute, and execution:read are existing scopes. |
| Owner boundary | `packages/cli/src/modules/agents/AGENTS.md` | Workflow tool internals are not a public department API. |

## Decisions and Alternatives

### Native owner adapter

- **Decision**: Add a narrow owner-side workflow capability adapter next to the native workflow tool. Reuse its compatibility, publication, caller, credential, wait, and result policy.
- **Rationale**: The current loader/factory are private implementation details. A public department adapter is a required addition, not an existing API.
- **Alternative rejected**: Generic webhook calls, copying workflow JSON, or invoking a private factory directly.

### Durable invocation

- **Decision**: Store capability version and invocation identity before calling the owner. Require owner-side invocation-key acceptance and lookup. Unknown acknowledgment blocks a new dispatch.
- **Rationale**: A duplicate delivery must return one department invocation while n8n remains the execution owner.
- **Alternative rejected**: Assume HTTP timeout means the workflow did not start.

### Version and result policy

- **Decision**: The first production integration uses the published workflow selected by the native owner policy. Resolve and record the actual version at dispatch. Return authorized execution references and safe summaries.
- **Rationale**: The existing loader has explicit published-content handling. A capability does not freeze credentials or authorize private execution data.
- **Alternative rejected**: Run an unreviewed draft or store full execution payloads in department history.

### Permissions

Configuration requires `agent:update` and `workflow:read`. Invocation requires current project access, agent:execute, workflow:execute, owner caller policy, and credential checks. Private results require execution:read plus existing owner access. Recheck at dispatch and result delivery.

## Ownership and Implementation Gate

Enable live workflow calls only after the owner accepts and locates invocation keys durably, and current-policy, wait, result, and cancellation checks pass.

## Current owner-gate check — 2026-11-04

The native workflow loader can resolve published content, and the native workflow tool applies project caller policy and supports waiting workflows. Attempt-scoped filtering removes inherited workflow tools outside the selected workflow ID snapshot before the Agent runtime is built. The parent Agent dispatch also uses a deterministic queue message ID, persists an input hash, and can look up the accepted queue item or its persisted execution. The child workflow tool derives a stable native key for department calls and persists project, invocation, input-hash, and pinned-version metadata with the execution. The department now persists acceptance, an Agents-owned outcome outbox, cancellation intent, and authorized result delivery. Owner snapshot reconciliation records changed child states. These paths have focused controlled tests, but do not close G4 or G5.

Further source inspection found that `IWorkflowExecutionDataProcess.deduplicationKey` is persisted to the unique `execution_entity.deduplicationKey` index by `ActiveExecutions.add()` and `ExecutionPersistence.create()`. Its duplicate-key recovery looks up the retained execution and compares the saved input hash before reusing it. The department tool now checks the owner before reusing a duplicate reservation and fails closed if the child is absent or unverifiable. A SQLite integration test verifies that concurrent reservation inserts yield one persisted row and one reported winner. These checks do not recover a reservation after a crash before native execution persistence, or resolve the queued `new` execution race. G4 remains open until the owner can durably fence and recover that boundary. Agents verifies project, invocation, input hash, pinned version, and exact execution reference before snapshot or stop. It records changed states in its outbox and retries stop for persisted cancellation intent. Controlled tests do not yet prove stop across every execution mode or a live provider run; G5 remains open.

Implementation re-audit found that the earlier capability service and attempt path still exposed enabled workflow IDs while G4–G5 were open. They now fail closed: enable requests conflict, saved enabled rows do not enter a new attempt snapshot, runtime construction removes department workflow tools, and the child tool rejects direct department invocation. Both owner-side gates remain false until the owner evidence is complete.

Capability configuration now uses an Agents-owned descriptor service. It resolves published workflow content, checks the native compatibility rule, and derives the input-schema fingerprint from the same inference function used by the native workflow tool. This descriptor does not dispatch an execution and does not close G4 or G5.

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.

### Department invocation reservation re-check — 2026-11-04

The department now persists a pending invocation and a stable owner key before calling the native workflow runner. Duplicate-key recovery loads the retained execution and checks its saved input hash. The department records acceptance only when the execution reference and pinned publication match. `WorkflowInvocationService` validates the current attempt, claim, binding, capability revision, and workflow publication. It verifies the parent `AgentExecution` using `WorkClaim.executionId`; the SDK `ctx.runId` is not an execution database ID.

At this checkpoint, `inputsRef` was not resolved to durable owner-held input storage. There was no background reconciliation for a crash between reservation and owner acceptance, and the native workflow owner did not send child outcome receipts. The implementation has since added an Agents-owned outcome outbox for waiting, running, success, failure, and cancellation projections. Focused tests, typecheck, and SQLite/PostgreSQL schema checks now cover this outbox. Durable input resolution, uncertain dispatch reconciliation, native retry classification, child stop proof, late-result acceptance, and live provider behavior remain open. G4 and G5 remain open. Both runtime gates remain false.

### Duplicate reservation replay guard — 2026-11-04

Agents now checks a duplicate reservation with the workflow owner before it calls the native runner. A verified child reference is reused. An absent or unknown owner result fails closed. This avoids replaying the same key through `ExecutionPersistence.create()`, which can reclaim a `new` row. The guard prevents this tool replay path from causing another dispatch, but it does not recover a reservation when the owner has no retained child row. The native `new` queue window remains unresolved. Keep G4–G5 open and keep both runtime gates false.

### Native queue acceptance boundary — 2026-11-04

`ActiveExecutions.add()` persists the execution row before `WorkflowRunner.run()` calls `enqueueExecution()`. The queue job uses a generated queue ID and stores the native execution ID in its job data. The native execution row does not store that queue job ID. In queue mode, the row can therefore remain `new` both before enqueue and while a queued job waits for a worker. An owner lookup by deduplication key cannot tell those states apart.

`ExecutionPersistence.reclaimTombstone()` handles `new` rows for shared at-least-once execution callers, including scheduled work. A change to this shared path affects non-department executions. The current Department tool replay guard avoids calling the native runner for an unverified duplicate, but it cannot recover an accepted row after a crash between row persistence and queue insertion. Do not add Department-specific recovery or change shared tombstone behavior until an owner fence can distinguish an in-flight enqueue from an abandoned pre-enqueue row. Keep T006 open and both invocation gates false.

### Queue routing across restart — 2026-11-05

Project pool settings can change after a job enters Bull. Bull job IDs are unique within one queue. Recovery that resolves the current project pool can miss an accepted job in the old queue and add the same execution ID to a different queue.

For Department child executions in queue mode, `WorkflowRunner` now stores the selected queue name in native execution metadata before it persists the row. Owner lookup and same-row recovery use this saved queue name. A recovery with no accepted job re-enqueues the same execution ID into the original queue. Other executions keep the current project-pool routing path.

Focused WorkflowRunner tests cover the queue pin, stable queue ID, and lookup after a project-pool change. The owner unit test confirms that lookup forwards the stored metadata. These tests do not prove recovery across a real process restart or atomic acceptance across the database and Redis. Keep T006/G4 open and both runtime gates false until the live owner scenario passes.

### Cancellation state versus Bull worker state — 2026-11-05

In queue mode, `ExecutionService.stop()` writes native status `canceled` before it broadcasts the stop command. `JobProcessor` skips a queued job after reading that status, and the Bull job can remain active or waiting until a worker handles it. The persisted status alone therefore does not prove that an active worker finished cancellation. Owner lookup, stop retry, and snapshot now return unknown while the exact stable Bull job remains active, waiting, delayed, or paused. A job lookup failure also stays unknown. A real-Redis integration confirms that a test Bull processor can hold the job active while the owner remains unknown, then expose the canceled snapshot after the job leaves the active set. The processor is not n8n's JobProcessor. Live n8n worker acknowledgement and process-restart acceptance remain open under G5.
