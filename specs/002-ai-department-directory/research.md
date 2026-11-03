# Research: AI Department Directory

**Feature**: `002-ai-department-directory`
**Reviewed**: 2026-11-02

## Decisions

### Backend and persistence ownership

- **Decision**: Put the feature in `packages/cli/src/modules/ai-department/`. Keep its entities and repositories inside its persistence subdirectory, expose DTOs through `packages/@n8n/api-types`, and register schema changes through the `@n8n/db` migration system.
- **Rationale**: The directory is an n8n server feature. The skills module documents this modular-monolith layout and hides its entities and repositories. The root guidance keeps TypeORM access inside persistence layers.
- **Evidence**: `packages/cli/src/modules/skills/AGENTS.md`, `packages/cli/src/modules/agents/AGENTS.md`, `packages/@n8n/db/src/migrations/`, and the root `AGENTS.md` persistence boundary.
- **Alternatives considered**: Put domain entities in the shared `@n8n/db` entity index. That makes a module-owned domain global before a cross-module consumer needs its entity types.

### Project access and API scope

- **Decision**: Scope every route below `/projects/:projectId/ai-departments`. Use registered `agent:list`, `agent:read`, `agent:create`, and `agent:update` scopes on project-scoped routes. Do not add a new role or permission scope in this feature.
- **Rationale**: These scopes already represent access to project data and project changes. The project's membership role remains the authorization source. Department membership grants no n8n scope.
- **Evidence**: `packages/cli/src/controllers/project.controller.ts` uses `project:read` and `project:update`; `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts` defines them. Agent routes use project-scoped URLs and `@ProjectScope` in `packages/cli/src/modules/agents/agents.controller.ts`.
- **Alternatives considered**: New `department:*` scopes. The current role and scope registry does not define them, and adding them would expand role configuration and compatibility work.

### Agent binding validation

- **Decision**: Store only the Agent ID as an optional executor reference. Add a supported project-scoped resolver to the Agents module public API. Require the Agent to belong to the same project and revalidate it before a future execution attempt. Never read the Agent table or its private repository from the directory service.
- **Rationale**: Agent data and project authorization belong to the Agents module. Its internal service already supports project-scoped lookup, but the module guide limits external imports to a small explicit API and does not currently list that service.
- **Evidence**: `packages/cli/src/modules/agents/agents.service.ts` has `findById(agentId, projectId)`, backed by `AgentRepository.findByIdAndProjectId`; `packages/cli/src/modules/agents/AGENTS.md` defines the public boundary and supported imports.
- **Alternatives considered**: Import `AgentsService` directly or query the repository. Both violate the module boundary.

### Archive guard boundary

- **Decision**: Keep the directory service independent of the work-management module. Define an `ActiveDepartmentWorkGuard` service contract. The work-management module supplies its implementation. Archive operations fail closed if the guard is unavailable.
- **Rationale**: Feature 003 owns work status and terminal-state rules. Feature 002 must not query future work tables or duplicate those rules.
- **Evidence**: Roadmap order in `specs/AI-DEPARTMENT-ROADMAP.md`; the directory spec requires archive rejection while nonterminal work exists.
- **Alternatives considered**: Let the directory query work tables directly. The work schema does not exist yet and this would invert feature ownership.

### Record concurrency and history

- **Decision**: Use versioned records and a transaction for each hierarchy mutation. Archive records in place; do not cascade-delete members or bindings. Keep work references on stable member IDs.
- **Rationale**: The feature requires stale-edit rejection and retained history. n8n's persistence guidance assigns transaction orchestration to persistence repositories.
- **Evidence**: Root `AGENTS.md` persistence and `TransactionRunner` rules; feature requirements FR-007 and FR-008.
- **Alternatives considered**: Hard delete or separate copied history snapshots. Hard delete breaks references. Snapshots duplicate state and create consistency risks.

## Source findings

| Concern | Finding | Source |
|---|---|---|
| Project identity | Project has stable string ID, name, type, description, and timestamps. | `packages/@n8n/db/src/entities/project.ts` |
| Project authorization | Project routes use `@ProjectScope`; read and update scopes exist. | `packages/cli/src/controllers/project.controller.ts`; `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts` |
| Agent access | Saved Agent lookup accepts both Agent ID and project ID. | `packages/cli/src/modules/agents/agents.service.ts`; `packages/cli/src/modules/agents/repositories/agent.repository.ts` |
| Agent module boundary | Other modules use the Agents-owned binding resolver and do not import Agents tables into directory services. | `packages/cli/src/modules/agents/agent-binding-resolver.service.ts`; `packages/cli/src/modules/agents/AGENTS.md` |
| Transactions | Database transaction work belongs in persistence repositories and uses `TransactionRunner`. | Root `AGENTS.md` |

## Remaining integration condition

The Agents binding resolver is present and used. Feature 003 implements `ActiveDepartmentWorkGuard`; its provider is registered. Current-revision C1 acceptance passes. The guard reports nonterminal work and attempts in dispatching, active, or suspended phases by department and member, and the directory API returns a conflict without changing records. Runtime stop and recovery after binding revocation remain C3 conditions, not directory dependencies.

The CLI-local module ID must be added to `packages/@n8n/backend-common/src/modules/modules.config.ts` and activated through `module-registry.ts`. Module entities register through the module's `entities()` hook. `packages/cli/src/modules/modules.manifest.ts` is for packaged module imports and is not the registration target for this CLI-local module.

The archive guard and work assignment share a persistence transaction and admission fence. A check followed by a separate archive write is insufficient. Feature 003 defines the provider in the same backend module; only done and cancelled work are terminal.
