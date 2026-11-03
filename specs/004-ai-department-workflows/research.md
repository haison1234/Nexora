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

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.
