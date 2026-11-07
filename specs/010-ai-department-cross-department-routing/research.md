# Source Research: AI Department Cross-Department Routing

**Date**: 2026-11-08
**Status**: Phase 0 complete for the current worktree. This is source review, not runtime validation.

## Scope and evidence boundary

The feature spec is Draft v6 and is not in the roadmap. The current worktree contains broad uncommitted AI Department changes. Findings below describe the current worktree only. Recheck each contract against the implementation base after Spec 009 acceptance and before implementation.

The plan follows the AI Department constitution, roadmap, shared design, Specs 002, 003, 006, and 009, and current source under `packages/cli/src/modules/ai-department/`.

## Decisions and findings

### 1. Routing link is the durable chain relation

**Decision**: Add one project-owned routing-link entity as specified. Store the direct source and receiving Work IDs, their department IDs, the root Work ID, direct link state, snapshots, actor, and timestamps. Do not store a second independent receipt or copy reports.

**Rationale**: The spec defines the link as the only business relation and the existing command receipt as the idempotency record. `WorkItem` already has a version and department ID. `CommandReceipt` already stores project, actor, request ID, operation, payload hash, status, and response JSON.

**Verified source**:

- `packages/cli/src/modules/ai-department/database/entities/work-item.entity.ts`
- `packages/cli/src/modules/ai-department/database/entities/command-receipt.entity.ts`
- `packages/cli/src/modules/ai-department/work/work-handoff.service.ts` uses receipt operation values such as `work.handoff`; it does not implement referral links.

**Alternative considered**: Add a second receipt table. Rejected because the spec explicitly reuses the existing receipt identity and operation field.

### 2. Department admission fences are useful but insufficient alone

**Decision**: Keep the existing department admission fence as the serialization primitive only if Phase 2 proves the required lock protocol. Add repository-owned checks for item and chain fences. Do not reuse handoff intent as a referral fence.

**Rationale**: `WorkRepository.acquireAdmissionFence(projectId, departmentId, ctx)` and the department fence entity serialize mutations by department. Referral spans source and receiving departments. The spec also needs ancestor fencing after an intermediate item is cancelled. No current entity represents this referral chain.

**Verified source**:

- `packages/cli/src/modules/ai-department/database/entities/department-admission-fence.entity.ts`
- `packages/cli/src/modules/ai-department/database/repositories/work.repository.ts`
- `packages/cli/src/modules/ai-department/work/active-department-work-guard.ts`
- `packages/cli/src/modules/ai-department/work/work-handoff.service.ts`

**Required design gate**: Before task generation, inventory every coordinator, Agent/owner, parent-child, continuation, result, review, and reconciliation mutation. Each must acquire the same serialization boundary and check the source or ancestor fence in the write transaction. The source mutation inventory is not complete in this planning pass.

### 3. Referral admission and chain races

**Proposed protocol**: In the referral transaction, authenticate the person and project scope; resolve the current chain root; acquire the root department admission fence first; acquire the remaining source, receiver, and chain participant fences in sorted ID order; re-read the source and receiver; check `expectedVersion`, source state, pending result/review, active attempt, child Work, open link, active receiver, and chain department uniqueness; then write the receipt, new Work, link, activity, eligibility cancellation, and wake delivery changes atomically. Emit invalidations only after commit.

**Rationale**: Spec 003 requires expected-version checks and durable idempotency. Current work repository methods include `cancelPendingEligibility(projectId, workId, ctx)` and `markPendingWakesDelivered(workId, ctx)`. Current services acquire department admission fences for multiple operations.

**Locking rule**: The first source Work is the stable chain root. Every operation on a chain acquires the root department admission fence before any other department fence. It then acquires remaining department IDs in ascending order. Referral and archive re-read the full chain after acquiring the root fence. A new receiving Work and its link commit together, so the receiving Work cannot be acted on before its chain root is visible. A Work outside a chain uses its own department fence; if a referral races it, both operations contend on that department fence.

**Required proof before tasks**: Check every mutation and reconciliation path. Confirm that no chain operation locks a local department and then requests the root fence. Add concurrency checks for first referral, descendant referral, root mutation, descendant mutation, archive, and terminal transition on SQLite and PostgreSQL. If the persistence behavior does not support this protocol, replace it with a dedicated chain admission row before task generation.

### 4. Wake and eligibility behavior

**Decision**: Referral cancels pending eligibility and marks pending wake messages delivered in the same transaction. Fence release does not create eligibility or enqueue a wake. Only the explicit Spec 003 ready action for backlog or explicit start for ready creates a new eligibility generation.

**Verified source**:

- `packages/cli/src/modules/ai-department/database/repositories/work.repository.ts` has eligibility generation, cancellation, and wake-delivery methods.
- `packages/cli/src/modules/ai-department/work/work.service.ts` contains `startWork`, readiness, eligibility preparation, and wake-related behavior.
- Spec 003 states that explicit start of ready work uses the same durable eligibility and wake path as readiness.

**Required checks**: Confirm that a late worker, duplicate wake, restart reconciliation, or old generation cannot dispatch after referral. Confirm that explicit resume creates a generation newer than all cancelled generations and cannot be confused with command replay. On claim and execution admission, re-check the durable chain fence. After process restart, the link graph and Work state reconstruct the fence; no in-memory fence cache is authoritative.

### 5. Revision and invalidation

**Decision**: Use the existing per-department `projectionSequence` and `AiDepartmentOperationsBroadcaster`. Bump every department whose Work projection or derived fence changes. Publish after commit. Do not copy reports upstream.

**Verified source**:

- `packages/cli/src/modules/ai-department/database/entities/department.entity.ts` defines `projectionSequence`.
- `packages/cli/src/modules/ai-department/operations.service.ts` reads snapshots and retries if the sequence changes during assembly.
- `packages/cli/src/modules/ai-department/operations-broadcaster.service.ts` sends project-reader invalidations with the current department revision.
- Existing services call `notifyCurrent` after operations.

**Required checks**: Build an event matrix for referral creation, direct receiving state changes, intermediate cancellation, ancestor fence set/clear, and receiving comments/help. Ensure each affected department revision increments in the same transaction as the state change. `projectionSequence` remains authoritative if push delivery fails. Spec 006 reconnect loads a full snapshot; a visible page polls every four seconds when push is absent or unhealthy. The approved five-second target applies only to healthy push. Verify the invalidation carries no report content and does not relay a descendant report upstream.

### 6. Department archive

**Decision**: Extend the existing archive guard contract and work guard so archive checks every participant department in every still-open chain, including departments that appear only in closed links of that chain.

**Verified source**:

- `packages/cli/src/modules/ai-department/active-department-archive-guard.ts`
- `packages/cli/src/modules/ai-department/work/active-department-work-guard.ts`
- The current work guard checks active Work in a department. It does not query cross-department chain links.

**Required checks**: Archive and referral must share the serialization boundary. Acquire all affected chain root fences in ascending order, then the target department fence. A chain that has any open link blocks archive for every department appearing anywhere in its links. Verify this with concurrent archive/referral and cancellation cases.

### 7. Suggestion tokenizer and SC-006 baseline

**Decision for the draft baseline**: Use NFKC, lowercase with locale-independent Unicode case conversion, fold combining diacritics after NFD, map Vietnamese `đ` to `d`, split on characters outside Unicode letters and numbers, drop tokens shorter than two code points, then remove the following stop words. Compare and sort normalized tokens by Unicode code-point order. Ignore expertise tags that normalize to an empty token set. Deduplicate tags and tokens before scoring.

**English stop words**:

```text
a, an, and, are, as, at, be, been, being, by, for, from, had, has, have,
he, her, hers, him, his, i, in, into, is, it, its, me, my, of, on, or,
our, ours, she, that, the, their, theirs, them, they, this, to, was, we,
were, what, when, where, which, who, will, with, you, your
```

**Vietnamese stop words after diacritic folding**:

```text
anh, bao, ben, bi, boi, ca, cac, cai, can, chi, chinh, cho, chua,
cung, da, dang, de, den, dieu, do, duoc, gi, hay, khi, khong, la, lai,
ma, moi, mot, muc, neu, nhu, o, qua, ra, rang, se, sau, tai, theo, thi,
thua, tu, tren, trong, truoc, va, vao, voi, xin
```

**Rationale**: Fixed normalization and stop words make the rule deterministic and keep common function words from dominating a small vocabulary. Keep `ai` because AI is a meaningful product term in this feature. Lexical selection makes reason text reproducible. This list is a proposed freeze for the draft evaluation. The user must approve it before SC-006 measurement.

**Alternatives considered**: stemming, transliteration libraries with language-specific stemming, or model-generated suggestions. Rejected for this release because the spec requires exact token matching without stemming or model calls.

**Required baseline gate**: Build the labelled 8–10 department, 30 request set before routing code is merged. At least 10 requests must be ambiguous. A person who did not write the scoring rules must label one or two acceptable active departments per request after excluding the source. Measure top-1 and top-3 first. The 80% top-1 figure remains a proposal until the user sets the target.

## Source and contract references

- `specs/002-ai-department-directory/spec.md`: project access and department lifecycle.
- `specs/003-ai-department-work-management/spec.md`: Work lifecycle, expected versions, receipts, eligibility, explicit start, and handoff.
- `specs/006-ai-department-operations-ui/spec.md`: operations projection, revision, refresh, and UI contract.
- `specs/009-ai-department-work-coordination/spec.md`: reports, help, child Work, and mutation paths that affect Work state.
- `specs/AI-DEPARTMENT-ROADMAP.md`: Spec 010 is not currently in delivery order; Spec 009 acceptance precedes further routing work.

## Open implementation questions

1. Does the department fence `increment` serialize transactions for the required duration on both supported databases when called through the sanctioned transaction runner?
2. Which Work, Agent/owner, child-work, recovery, and review paths do not currently acquire an admission fence before mutation?
3. Can all chain operations, including archive across several chains, follow the root-first lock order without a path acquiring a local department fence first?
4. Does every required Work state transition increment the owning department `projectionSequence` in the same transaction? Which source/ancestor sequence bumps must this feature add?
5. What migration ordering, schema documentation command, and ownership-transfer manifest format does the selected implementation base require?

Push delivery is best-effort in the current broadcaster. Spec 006 uses the committed department revision as the authority, full snapshot on reconnect, a four-second visible fallback poll, and a five-second target only for healthy push. The feature does not need a second invalidation outbox unless implementation review finds that the current reconnect and polling contract cannot recover a missed update.
