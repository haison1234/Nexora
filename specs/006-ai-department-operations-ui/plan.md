# Implementation Plan: Operations Interface, Slices A and B

**Feature**: `006-ai-department-operations-ui` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Status**: Planning artifacts complete. Implementation and enablement checks remain open in tasks.md.
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md) and [feature design](design.md).

## Summary

Build one Vue frontend module for Overview, Work, People, and Activity. Deliver 006A against directory/planning/review contracts, then 006B against verified executor and workflow contracts.

## Technical Context

- **Stack**: Vue 3, TypeScript, Pinia, frontend module SDK, n8n design system, and i18n.
- **Dependencies**: 006A requires 002/003. 006B requires the enabled 003 executor and 004 when workflows are enabled. Neither requires 005 or 007.
- **Storage**: [Data model](data-model.md). Retain owner references and safe summaries; runtime credentials and execution payloads stay with their owners.
- **Platform**: Current n8n fork and the single-project context.
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
- [Contract](contracts/interface.md) defines routes/service boundaries, authorization, payloads, and recovery behavior.
- [quickstart.md](quickstart.md) defines acceptance scenarios and expected evidence.
- [design.md](design.md) specifies screens, layout, tokens, components, states, and accessibility.

## Project Structure

- Frontend: `packages/modules/ai-department/frontend/src/operations/` and existing module views/components.
- Backend projections, where required: `packages/cli/src/modules/ai-department/operations/`.
- Shared DTOs: `packages/@n8n/api-types/src/ai-department/`.
- No duplicate business tables. Work state stays in 002/003/004.

These are planned source targets, not files created by this documentation work. Keep the backend module ID and frontend descriptor ID equal to `ai-department`. CLI-local module activation uses `@n8n/backend-common` module-name configuration and registry, not the packaged-module import manifest.

## Phase 2 — Story Tasks and Traceability

[tasks.md](tasks.md) groups foundation, user stories, integration, and validation work. Every FR and SC has explicit task coverage. Prerequisites and validation precede enablement; unchecked tasks are not completed work.

## Delivery and Enablement Gate

006A can proceed after 002/003 planning/review APIs exist. 006B requires a verified executor; seeded examples do not satisfy live-execution acceptance.

## Validation and Limits

Use [quickstart.md](quickstart.md), the owning package rules, and the spec's acceptance cases. Run required targeted formatting/lint/behavior checks during implementation. Current changes are documentation-only; document/link/coverage review and whitespace checks apply. No runtime, provider, browser, or performance result is claimed.

## Complexity Tracking

No constitution exception. The source owner boundaries, optional integrations, and proposed enablement checks are explicit in this plan. Feature numbers identify documents; delivery follows the roadmap dependencies.

## C6 Operations and live updates — Approved 2026-11-03

### Approved C6 gate status

D8 and the healthy-push-only timing target are accepted. C6A can proceed with C1 and the planning/review API contracts. G6 blocks live subscription delivery only. C6B also requires verified C3 and enabled C5. Browser, locale, keyboard and timing acceptance remain open.
