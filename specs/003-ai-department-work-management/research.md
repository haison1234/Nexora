# Research: Goals, Work, and Attempts

**Feature**: `003-ai-department-work-management`
**Reviewed**: 2026-11-02
**Evidence boundary**: n8n source review and direct Paperclip source review. No provider, migration, browser, or runtime test result is claimed.

## Direct Paperclip Source Review

Paperclip source was cloned to `/tmp/paperclip-source-light` and inspected at commit [`8ea240218dc1d3a94afea1294b377021045dd9c9`](https://github.com/paperclipai/paperclip/tree/8ea240218dc1d3a94afea1294b377021045dd9c9). Its repository license is MIT. This review used source files, not only the README or product documentation.

| Source | Observed implementation | Use for this feature |
|---|---|---|
| [`packages/db/src/schema/goals.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/packages/db/src/schema/goals.ts) and [`server/src/services/goals.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/goals.ts) | Goal records use parent and owner references. The service provides simple CRUD. The visible service methods do not enforce a project-scoped parent/owner invariant or reject cycles. | Reuse the goal vocabulary and parent/owner shape as a design reference. Implement n8n project/department-scoped repository methods and cycle checks. Do not copy the unscoped service. |
| [`packages/db/src/schema/issues.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/packages/db/src/schema/issues.ts) | Issue records include goal, parent, assignee, priority, status version, review policy, execution references, and timestamps. The record also contains company, workspace, conversation, and Paperclip-specific governance fields. | Reuse the separation of goal, assignment, status/version, and execution reference as a modeling cue. Keep our smaller `WorkItem` and separate `Attempt` records. Do not import Paperclip's schema or its fields wholesale. |
| [`server/src/services/issue-execution-policy.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/issue-execution-policy.ts) | A pure transition calculation returns a patch and optional decision. It checks the current stage and actor before accepting status changes. | Keep the pure transition-function pattern. The parity scope now includes relevant staged execution/review transitions and participant checks, translated into the n8n work/attempt model. |
| [`server/src/routes/issues.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/routes/issues.ts) and [`server/src/services/issues.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/issues.ts) | Status changes require an expected status version. The service reads the current row under a transaction lock before validating and writing; updates increment the version. | Port the expected-version and same-transaction read/validate/write behavior through n8n's `TransactionRunner` and private composed repositories. Do not port Drizzle transactions or queries. |
| [`packages/db/src/schema/approvals.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/packages/db/src/schema/approvals.ts), [`server/src/services/issue-review-policy.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/issue-review-policy.ts) | Approval rows retain requester, decision actor, time, and note. Review policy checks business decision authority separately from tool authorization. | Keep the append-only typed `ReviewDecision` and reviewer checks in 003. Preserve the separation between business acceptance and native tool approval. Do not reuse a generic JSON approval row as an execution permission. |
| [`server/src/services/acknowledged-native-stop.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/acknowledged-native-stop.ts) and [`server/src/services/execution-control-work.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/execution-control-work.ts) | A stop request has an explicit acknowledgment receipt; acknowledgment alone does not prove the process or remote execution stopped. Reconciliation runs as durable scheduled work. | Use the distinction between requested, acknowledged, and terminal cancellation in the Agents adapter contract. Use reconciliation for uncertain dispatch. Implement n8n-owned workers and persistence. |
| [`server/src/services/issue-change-receipt.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/services/issue-change-receipt.ts), [`server/src/__tests__/issue-status-version-route-service.test.ts`](https://github.com/paperclipai/paperclip/blob/8ea240218dc1d3a94afea1294b377021045dd9c9/server/src/__tests__/issue-status-version-route-service.test.ts) | Change summaries normalize relation IDs and avoid storing full long-text diffs. Status tests cover valid promotion, stale versions, and unchanged records after rejection. | Use these test cases and bounded audit-summary principles when implementing work transitions. Keep the existing 002 command receipt model and n8n audit records. |

### Reuse boundary

Paperclip is MIT licensed, so a small source fragment may be adapted when it materially reduces work. Preserve its copyright and license notice in the copied file and record the source path and commit in the code comment or adjacent documentation. Prefer a behavioral port when the original depends on Drizzle, Express, company IDs, Paperclip agents, heartbeat runs, or internal helpers. Do not vendor the Paperclip server or connect its database to n8n. No Paperclip code has been copied into this repository during this research phase.

The source review confirms implementation patterns, not compatibility with n8n. Direct reuse of Paperclip's issue service, schema, route, or runtime would cross the n8n persistence and Agents ownership boundaries.

## Source Evidence

| Concern | Source | Observed behavior |
|---|---|---|
| Project scopes | `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts` | the `agent:list/read/create/update` scopes and `agent:execute` exist for department routes. |
| Execution and stop | `packages/cli/src/modules/agents/agent-chat.controller.ts` | Agent controls use agent:execute. These routes are source examples, not a department API. |
| Cancellation acknowledgment | `packages/cli/src/modules/agents/agent-session-stop.service.ts` | stopSession returns cancelRequested; it does not prove terminal cancellation. |
| Approval ownership | `packages/cli/src/modules/agents/agent-tool-approval.service.ts` | Native tool grants belong to Agents. Business review must not write these grants. |
| Module boundary | `packages/cli/src/modules/agents/AGENTS.md` | Runtime repositories and reconstruction remain private; add an explicit owner contract. |
| Transaction rules | `AGENTS.md` | New persistence repositories compose a private table and use TransactionRunner. |

## Decisions and Alternatives

### Work and execution ownership

- **Decision**: Keep business work under `ai-department/work/`. Expose a narrow Agents-owned work-owner contract for wake, list, claim, release, report, dispatch, stop, and recovery. Keep the native adapter and private execution/run stores inside Agents.
- **Rationale**: The directory does not require an Agent. Agents owns Agent identity/bindings, execution, stop, native tool approval, and private run storage; AI Department owns business work, claims as product coordination records, and business review.
- **Alternative rejected**: Import internal execution repositories into the department. This would bypass the owner boundary.

### Authorization and review

- **Decision**: Reads require current project read access; planning and assignment require current project update access; runtime actions also require current execution authority. Agent-originated changes require a currently bound Agent identity and authorized project context. Business reviewers follow the work's explicit policy; policy rules include `anyone`, `not_creator`, and `human_only` where supported.
- **Rationale**: Translate the behavior to n8n project scopes and Agent ownership. Do not copy Paperclip company roles. Review authorization never writes native tool grants.
- **Alternative rejected**: Treat business acceptance as tool approval or allow read scope to mutate work.

### Dispatch and recovery

- **Decision**: Reserve the attempt, state transition, and dispatch intent in one database transaction. The owner accepts a durable dispatch key and can find the accepted execution by that key. An uncertain request stays unresolved until the owner answers.
- **Rationale**: A network retry cannot prove whether the owner started work. Source inspection did not establish an existing department dispatch-key API; extending the owner API is an implementation prerequisite.
- **Alternative rejected**: Retry an unknown start blindly or claim exactly-once effects.

### Archive consistency

- **Decision**: Implement the 002 archive guard in the work persistence layer of the same backend module. Archive and new assignment use the same department/member admission fence in one transaction.
- **Rationale**: Checking work before a separate archive transaction leaves a race. Only done and cancelled work are terminal in Spec 003; failed work still blocks archive.
- **Alternative rejected**: Return an empty work list from an absent guard.

### Initial Agent owner gate

The native Agent owner contract is the selected initial implementation target. It must support durable wake/coalescing, eligible-work listing, atomic claims, attempt-scoped work actions, dispatch lookup, stop, and reconciliation before the parity flow is enabled. Existing internal methods are evidence of capability, not proof that the proposed contract already exists.

## Ownership and Implementation Gate

Live execution is gated by the new owner adapter's durable acceptance, lookup, cancellation, and event tests. A controlled test executor is not a production executor.

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.
