# Implementation Plan: Goals, Work, and Attempts

**Feature**: `003-ai-department-work-management` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Status**: The first backend pass is implemented, but it does not meet the expanded Paperclip coordination parity target. The hidden-chat adapter and attempt-to-work status mapping must be replaced or revised. See [the parity review](../AI-DEPARTMENT-PAPERCLIP-PARITY-REVIEW.md) and new tasks in [tasks.md](tasks.md).
**Design**: [Shared interface](../AI-DEPARTMENT-DESIGN.md).

## Summary

Implement the lifecycle in spec.md, Agent pickup and work reporting, durable wake/claim/recovery, business review, and an archive guard for 002. The parity review changes the integration design: assignment/readiness must wake the bound Agent through an Agents-owned contract; Agent identity and attempts must be authenticated and claimed; an Agent must explicitly report business progress and results. A successful chat or execution status is not a work result. Use Paperclip behavior as the feature contract while keeping n8n ownership boundaries. Do not transplant Paperclip's Drizzle schema, company model, Express services, or heartbeat runtime.

## Technical Context

- **Stack**: TypeScript, n8n DI/controllers, API types, project authorization, and module-owned persistence.
- **Dependencies**: 002. Planning and business review can work without a runtime. Live execution requires the new native Agent adapter and its recovery acceptance checks.
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

### Parity redesign gate

The earlier manual coordinator start and hidden `n8n_chat` dispatch do not match
Paperclip's assignment wake, Agent claim, explicit work update, and run/work separation.
Replace those semantics through an Agents-owned contract. Do not expose private Agent
queues or execution tables as the department's long-term contract. Keep runtime
credentials, sessions, execution logs, and run status owned by Agents.

## Phase 0 — Source Research and Decisions

[research.md](research.md) records the inspected sources, observed behavior, selected design, alternatives, and implementation gate. Existing internal code is not treated as a public department API.

Paperclip source reuse is deliberate and bounded. Its repository is MIT licensed. If implementation copies a source fragment, retain the copyright/license notice and record its source path and pinned commit. Prefer porting the behavior when the code depends on Paperclip-specific persistence or runtime types. The first implementation slice should reuse patterns and test cases; it should not vendor the Paperclip application.

## Phase 1 — Model and Contracts

- [data-model.md](data-model.md) defines records, relationships, state, concurrency, and storage ownership.
- [Contract](contracts/service-api.md) defines routes/service boundaries, authorization, payloads, and recovery behavior.
- [quickstart.md](quickstart.md) defines acceptance scenarios and expected evidence.

## Project Structure

- Backend services/controllers: `packages/cli/src/modules/ai-department/work/`.
- Module-owned entities/repositories: `packages/cli/src/modules/ai-department/database/`.
- Shared DTOs: `packages/@n8n/api-types/src/ai-department/`.
- Migrations: `packages/@n8n/db/src/migrations/` with supported-engine registration.
- Native execution adapters remain inside `packages/cli/src/modules/agents/`; register only supported public contracts.

These are planned source targets, not files created by this documentation work. Keep the backend module ID and frontend descriptor ID equal to `ai-department`. CLI-local module activation uses `@n8n/backend-common` module-name configuration and registry, not the packaged-module import manifest.

## Phase 2 — Story Tasks and Traceability

[tasks.md](tasks.md) groups foundation, user stories, integration, and validation work. Every FR and SC has explicit task coverage. Prerequisites and validation precede enablement; unchecked tasks are not completed work.

## Delivery and Enablement Gate

Live execution remains gated until the revised Agents-owned contract provides durable
wake acceptance, claims, explicit business result reporting, lookup, stop, and
reconciliation. The existing polling adapter is not feature parity. Validate the
quickstart, access-loss, duplicate wake/claim, and result-versus-run cases against a
local Agent before enabling the flow.

## Validation and Limits

Use [quickstart.md](quickstart.md), the owning package rules, and the spec's acceptance
cases. Earlier focused checks and package builds cover only the first implementation.
They do not validate Agent claims, explicit result reporting, or feature parity. The
real-Agent quickstart, access-loss, duplicate wake/claim, result-versus-run, timing, and
roadmap-scale performance cases remain open. Browser validation belongs to 006A/006B.

## Complexity Tracking

No constitution exception. The source owner boundaries, optional integrations, and proposed enablement checks are explicit in this plan. Feature numbers identify documents; delivery follows the roadmap dependencies.

## C2 coordination, C3 execution, and C4 review — Approved 2026-11-03

### Approved Feature Contract v1 gate status

D1–D5 and the C2–C4 behaviors are accepted. G1 ownership design is closed from source review: AI Department owns lane eligibility/coalescing/admission, while Agents owns durable idempotent dispatch and queue-scan recovery. G1 runtime acceptance remains open. G2 owner stop proof, revocation authority, durable snapshot ordering, and restart recovery design are specified in `specs/feature-contracts/ai-department/execution.md`. Controlled revocation and stop tests pass. Live evidence does not prove a stop request ended a live run, and persisted thread counters differ from department attempt sequence values. G1 and remaining C3 recovery cases remain open. G3 applies only to Agent reviewer context; human-only review work can proceed after its result-fencing dependency is specified.
