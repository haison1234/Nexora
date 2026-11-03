# Implementation Plan: External Coding Runtime Bridge

**Feature**: `005-ai-department-runtime-bridge` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Status**: Planning artifacts complete. Implementation and enablement checks remain open in tasks.md.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md).

## Summary

Connect one owner-controlled coding runner through the 003 executor contract. Select Claude Agent SDK as the first adapter design target. Keep it disabled until the pinned SDK and container pass isolation, control, and approval checks.

## Technical Context

- **Stack**: TypeScript, n8n DI/controllers, API types, project authorization, and module-owned persistence.
- **Dependencies**: 003 executor contract and project access. The rest of the department product works with this integration disabled. Provider-specific UI is an optional 006B contribution.
- **Storage**: [Data model](data-model.md). Retain owner references and safe summaries; runtime credentials and execution payloads stay with their owners.
- **Platform**: Current n8n fork and the single-project context. The coding runner is deployed separately from the server.
- **Validation**: Focused owning-package checks, one worker, root/package AGENTS. Proposed timing targets use the roadmap fixture and are not measurements.

## Constitution Check

| Principle | Planning assessment | Evidence/design constraint |
|---|---|---|
| I. Repository rules and evidence | Pass | Research distinguishes observed source from new contracts and unrun checks. |
| II. One department product | Pass | Stable member identity and shared vocabulary remain authoritative. |
| III. Execution through owned contracts | Pass for this design | Runtime and workflow payloads remain with their owners. New owner contracts are explicit implementation tasks. |
| IV. Project access and human control | Pass for this design | Current project scopes and owner access are enforced; business review and tool permission remain separate. |
| V. Shared interface | Pass for this design | Use the shared design, full 2D actions, localization, and truthful disconnected states. |
| VI. Durable work and verifiable changes | Pass for this design | Versioned records/projections, command identities, recovery, and focused validation are specified. |

These are design checks, not implementation passes. No constitutional exception is requested. A changed security, ownership, or contract decision requires this check to be repeated before affected tasks proceed.

## Phase 0 — Source Research and Decisions

[research.md](research.md) records the inspected sources, observed behavior, selected design, alternatives, and implementation gate. Existing internal code is not treated as a public department API.

## Phase 1 — Model and Contracts

- [data-model.md](data-model.md) defines records, relationships, state, concurrency, and storage ownership.
- [Contract](contracts/service-api.md) defines routes/service boundaries, authorization, payloads, and recovery behavior.
- [quickstart.md](quickstart.md) defines acceptance scenarios and expected evidence.

## Project Structure

- Backend services/controllers: `packages/cli/src/modules/ai-department/runtime/`.
- Module-owned entities/repositories: `packages/cli/src/modules/ai-department/database/`.
- Shared DTOs: `packages/@n8n/api-types/src/ai-department/`.
- Migrations: `packages/@n8n/db/src/migrations/` with supported-engine registration.
- Runner: `packages/@n8n/ai-department-runner/`; provider processes run only there.

These are planned source targets, not files created by this documentation work. Keep the backend module ID and frontend descriptor ID equal to `ai-department`. CLI-local module activation uses `@n8n/backend-common` module-name configuration and registry, not the packaged-module import manifest.

## Phase 2 — Story Tasks and Traceability

[tasks.md](tasks.md) groups foundation, user stories, integration, and validation work. Every FR and SC has explicit task coverage. Prerequisites and validation precede enablement; unchecked tasks are not completed work.

## Delivery and Enablement Gate

The adapter and protocol design is selected. Provider enablement requires the pinned version matrix and isolated-runner checks. No actual coding provider has passed these checks in this documentation turn.

## Validation and Limits

Use [quickstart.md](quickstart.md), the owning package rules, and the spec's acceptance cases. Run required targeted formatting/lint/behavior checks during implementation. Current changes are documentation-only; document/link/coverage review and whitespace checks apply. No runtime, provider, browser, or performance result is claimed.

## Complexity Tracking

No constitution exception. The source owner boundaries, optional integrations, and proposed enablement checks are explicit in this plan. Feature numbers identify documents; delivery follows the roadmap dependencies.

## C3 executor boundary — Approved 2026-11-03

### Approved executor gate status

The provider remains optional. Implement it only against the accepted C3 contract after G1–G2 close. Provider pinning, isolation, action approval and stop acceptance remain additional gates.
