# Research: External Coding Runtime Bridge

**Feature**: `005-ai-department-runtime-bridge`
**Reviewed**: 2026-11-02
**Evidence boundary**: Source and documentation review. No provider, migration, browser, or runtime test result is claimed.

## Source Evidence

| Concern | Source | Observed behavior |
|---|---|---|
| Native permission boundary | `packages/cli/src/modules/agents/AGENTS.md` | Native Agent approvals and runtime storage remain with Agents. |
| Project execution scope | `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts` | agent:execute is available; pair it with `agent:update` for external session controls. |
| SDK reference | [Official documentation](https://code.claude.com/docs/en/agent-sdk/typescript) | query supports streaming input, session references, interruption, and permission hooks. Interruption alone is not process-exit evidence. |
| Permission evaluation | [Official documentation](https://code.claude.com/docs/en/agent-sdk/permissions) | Pre-approved actions can bypass canUseTool; that callback alone is insufficient for all-action mediation. |
| Runner hosting | [Official documentation](https://code.claude.com/docs/en/agent-sdk/hosting) | The SDK supervises a subprocess with local session state. |

## Decisions and Alternatives

### Provider and execution boundary

- **Decision**: Use the Claude Agent SDK as the first adapter design target. Pin the exact SDK, CLI, image digest, and applicable dependency notices during the adapter contract check.
- **Rationale**: Its documented control surface fits the required session interactions. No provider runtime was exercised during this document work.
- **Alternative rejected**: Treat Claude hooks from an office application as a complete control API.

### Runner deployment

- **Decision**: Run one job per non-root container on an owner-controlled runner host. Mount only a dedicated workspace volume and isolated session storage. Do not mount host home, the Docker socket, or n8n storage. Use resource limits, dropped capabilities, a read-only base filesystem, and an explicit network policy.
- **Rationale**: A working directory or Git worktree alone does not restrict process access.
- **Alternative rejected**: Start the coding process inside the n8n server.

### Transport and authority

- **Decision**: Use an outbound TLS WebSocket from the runner to a dedicated authenticated ingress. Issue short-lived, random project/workspace grants; store only their hashes. Intersect each command with the issuer's current project permissions.
- **Rationale**: A runner grant is not a general user session or n8n API key. Revocation must deny further events and commands without claiming process termination.
- **Alternative rejected**: Open a generic remote shell or reuse the UI push socket for runner authority.

### Tool mediation

- **Decision**: The first adapter disables built-in tools and exposes only typed runner-hosted read/search/mutation/check tools. Disable generic Bash, plugins, arbitrary MCP servers, subagents, and repository-controlled hooks. Validate every custom tool inside its implementation. Run repository checks in a separate execution container with no provider credentials; the host supervisor starts it without exposing a container socket to the SDK container.
- **Rationale**: Approval must bind to an immutable action and be consumed once. SDK permission callbacks do not replace the container boundary.
- **Alternative rejected**: Assume canUseTool sees every tool call or permit session-wide automatic write grants.

### Enablement gate

The selected design is concrete; installed-version behavior remains an implementation gate. Start/follow-up/stop, workspace escape denial, permission expiry/replay, and process-exit reconciliation must pass with the pinned versions. Failure keeps the provider disabled; it does not block 002, planning/review in 003, or the native executor.

## Ownership and Implementation Gate

The adapter and protocol design is selected. Provider enablement requires the pinned version matrix and isolated-runner checks. No actual coding provider has passed these checks in this documentation turn.

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.
