# Research: Operations Interface, Slices A and B

**Feature**: `006-ai-department-operations-ui`
**Reviewed**: 2026-11-02
**Evidence boundary**: Source and documentation review. No provider, migration, browser, or runtime test result is claimed.

## Source Evidence

| Concern | Source | Observed behavior |
|---|---|---|
| Frontend module layout | `packages/frontend/AGENTS.md` | Feature modules belong under packages/modules/<name>/frontend; private editor aliases and sibling frontend module imports are forbidden. |
| Module SDK contributions | `packages/@n8n/module-cli/frontend-module-guide.md` | Supported surfaces include routes, projectTabs, modals, and pushHandlers; frontend/backend IDs must match. |
| Descriptor types | `packages/frontend/@n8n/frontend-module-sdk/src/types/descriptor.ts` | The shell consumes typed contribution surfaces. |
| Existing push | `packages/cli/src/push/index.ts` | User-targeted push exists. Project authorization must still be checked for department subscriptions/delivery. |
| Design system policy | `.agents/skills/ui-design/SKILL.md` | Reuse current components and CSS tokens; use existing motion mixins. |
| Shared UX baseline | `specs/AI-DEPARTMENT-DESIGN.md` | Overview prioritizes required action; 2D remains complete. |

## Decisions and Alternatives

### Module and navigation

- **Decision**: Use one `@n8n/frontend-module-ai-department` package and the backend module ID `ai-department`. Register a project tab and lazy routes through the module SDK.
- **Rationale**: Current frontend guidance explicitly requires this layout and source-only module packaging.
- **Alternative rejected**: Add an editor-ui private feature tree or embed another reference application's UI.

### Server projections and events

- **Decision**: Add authorized operations read endpoints to the existing department backend. Use user-targeted push invalidations with project-filtered subscriptions and a maximum four-second visible-page refresh interval as fallback.
- **Rationale**: A shared push transport is not proof that each recipient may see a project. Authoritative reads make reconnect deterministic.
- **Alternative rejected**: Broadcast full work payloads to every logged-in client.

### Cache and commands

- **Decision**: Key cache by user/project/department and record version. Use one command identity per intentional action. After uncertainty, query the command result and authoritative resource instead of creating another command.
- **Rationale**: Reconnect and UI retry must not repeat a start or review.
- **Alternative rejected**: Queue offline writes or optimistically finalize business status.

### Design and rollout

- **Decision**: Keep 006A and 006B in one module. Use the local design.md and the shared design. Apply n8n components, tokens, i18n, and reduced-motion behavior.
- **Rationale**: Organization/review can be useful before live execution. External runtime controls appear only when their capabilities exist.
- **Alternative rejected**: Make 005 or 3D a prerequisite for the main work interface.

## Ownership and Implementation Gate

006A can proceed after 002/003 planning/review APIs exist. 006B requires a verified executor; seeded examples do not satisfy live-execution acceptance.

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.
