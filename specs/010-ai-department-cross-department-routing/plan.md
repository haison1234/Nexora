# Implementation Plan: AI Department Cross-Department Routing

**Branch**: Not created | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Status**: Phase 1 complete. Draft only. Tasks are blocked by roadmap and product approval gates.

**Input**: Feature specification from `specs/010-ai-department-cross-department-routing/spec.md`

## Summary

Add deterministic department suggestions and person-driven referral of a Work item to another department. A referral creates a receiving Work item and one durable link in a single transaction. The link is the source of truth for direct status and for the unresolved chain. A chain admission protocol must serialize referrals, source mutations, archive checks, and terminal transitions. It must keep every affected department revision current. It must also cancel old source eligibility and wake records without dispatching on fence release.

The current code has department admission fences, durable eligibility generations, wake delivery records, versioned Work items, project command receipts, department projection sequences, and project-filtered invalidations. It does not have a verified Work-item referral fence or chain lock. The plan therefore treats these existing mechanisms as integration points, not as proof that referral behavior already works.

## Technical Context

**Language/Version**: TypeScript, repository-pinned Node.js runtime

**Primary Dependencies**: `@n8n/di`, `@n8n/db` transaction runner, TypeORM persistence, `@n8n/api-types`, existing AI Department module

**Storage**: SQLite and PostgreSQL through the existing AI Department persistence layer; one new project-owned routing-link table per the draft spec

**Testing**: Vitest unit, migration, service, and persistence tests in `packages/cli`; focused Playwright acceptance through `packages/quality/testing/playwright`

**Target Platform**: n8n CLI backend and AI Department frontend module

**Project Type**: Monorepo web application

**Performance Goals**: Meet Spec 006 refresh limits. No new latency target is approved.

**Constraints**: Project scopes only; person-only referral; no language model; no change to Work state when a link opens or closes; no work dispatch on fence release; follow repository transaction and persistence boundaries.

**Scale/Scope**: One project context; use the roadmap fixture of up to 10 departments, 100 members, and 1,000 Work items as the initial planning scale. Measure before changing these limits.

## Constitution Check

| Principle | Status | Evidence or resolution |
|---|---|---|
| I. Repository rules and evidence | Pass for planning | This plan separates current source evidence from proposed design. No runtime behavior is claimed. |
| II. One Department product | Pass | Routing uses Department, Work, and review language. It does not copy a reference application. |
| III. Execution through owned contracts | Pass | Referral creates Work. Existing Agent and workflow owners keep execution state and credentials. |
| IV. Project access and human control | Pass, subject to source gate | Spec uses project `agent:read` and `agent:update`; a person starts referrals. Implementation must recheck access in the write transaction. |
| V. Shared interface before integration | Pass, subject to design review | Use the existing 2D Work and department views, i18n, and Spec 006 invalidations. UI specifics belong in the interface contract. |
| VI. Durable Work and verifiable changes | Blocked for implementation | The link, chain fencing, wake invalidation, and recovery need focused persistence and restart coverage. Do not create tasks until the design and roadmap gates are approved. |

The roadmap does not include Spec 010. The roadmap says a new feature needs user approval and a roadmap entry after Spec 009 acceptance. Planning this draft does not approve product scope or change the roadmap. Do not start implementation until those gates close.

## Research and Design Phases

### Phase 0: Research

Completed in [research.md](research.md). The source review confirms the current transaction, admission, eligibility, wake, revision, receipt, and archive integration points. The proposed design uses the department admission row for the chain root as the stable chain mutex. It persists chain identity in routing links and derives item fences from those links and current Work states. This avoids a second mutable fence record.

### Phase 1: Design and contracts

Completed for the draft in [data-model.md](data-model.md), [contracts/service-api.md](contracts/service-api.md), and [quickstart.md](quickstart.md). Every chain operation first acquires the root department admission fence, then acquires its remaining department fences in sorted ID order. A Work mutation resolves its stable chain root, acquires the root fence and its local department fence, then checks the derived fence and expected version in the same transaction. A first referral uses the source Work as its root. A descendant referral uses the root stored by its existing link. Referral, archive, terminal transitions, and Work mutations re-read the link graph after acquiring the root fence.

This lock protocol is a design proposal for the draft. The implementation gate is to prove that every mutation path follows it, including Agent/owner claims, child Work, reconciliation, archive, cancellation, and result/review actions. If a path cannot use the same admission boundary, stop and revise the design before implementation.

The deterministic tokenizer and proposed English/Vietnamese stop-word sets are recorded in [research.md](research.md). Treat them as the baseline candidate. Freeze the list and the labelled SC-006 dataset with the user before measuring the baseline. Do not merge routing code before the dataset and threshold decision.

### Required gates before task generation

1. User approves D1–D23 and the proposed tokenizer.
2. Spec 009 reaches acceptance, and the user approves a roadmap entry for Spec 010.
3. Implementation research inventories every Work mutation, owner action, child-work path, recovery job, and archive path that must check the chain fence.
4. Persistence review proves the root-first, then sorted-department lock protocol for referral, mutation, cancellation, archive, and terminal-state races on SQLite and PostgreSQL. All chain participants must use the same root fence.
5. The SC-006 evaluation set has 8–10 eligible departments, 30 independently labelled requests, at least 10 ambiguous cases, and a user-approved target.
6. Spec 006 revision and invalidation behavior is confirmed against the integration base selected for implementation. The database revision is authoritative; reconnect fetches a full snapshot and the visible fallback poll runs every four seconds. Healthy push has the approved five-second target. Confirm each affected revision is committed before its invalidation is sent.

No `tasks.md` is created by this plan.

## Project Structure

### Documentation

```text
specs/010-ai-department-cross-department-routing/
├── plan.md
├── research.md
├── data-model.md
├── contracts/service-api.md
├── quickstart.md
├── checklists/requirements.md
└── spec.md
```

### Source code (proposed; confirm against the implementation base)

```text
packages/@n8n/api-types/src/ai-department/       # Referral, link, and suggestion DTOs
packages/cli/src/modules/ai-department/
├── database/entities/                           # Routing link entity
├── database/repositories/                       # Atomic link, chain, and receipt queries
├── work/                                         # Referral service/controller and fence integration
└── operations-broadcaster.service.ts             # Post-commit invalidation dispatch
packages/@n8n/db/src/migrations/common/           # SQLite/PostgreSQL migration pair
packages/modules/ai-department/frontend/src/      # Referral, suggestions, and link views
packages/frontend/@n8n/i18n/                     # English and Vietnamese messages
packages/cli/test/migration/                      # Migration coverage
packages/cli/src/modules/ai-department/**/__tests__/ # Focused domain and persistence tests
packages/quality/testing/playwright/tests/e2e/ai-department/ # User acceptance paths
```

**Structure Decision**: Extend the existing backend module and frontend module. Keep TypeORM in persistence repositories. Define shared API types in `@n8n/api-types`. Do not create a separate routing service or app.

## Complexity Tracking

No constitution exception is proposed. The chain fence adds cross-department transaction coordination. The implementation plan must show why the existing admission primitive can support it or record a revised design before tasks are generated.
