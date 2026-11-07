# Validation Guide: AI Department Cross-Department Routing

**Status**: Planned validation scenarios. No route or implementation exists yet.

## Prerequisites

- Spec 009 is accepted and the roadmap entry for Spec 010 is approved.
- The user has approved D1–D23, the tokenizer list, the SC-006 labelled dataset, and its target.
- A dedicated test-owned SQLite database is configured. Do not use the `5791` owner database or the `5678` local database.
- Two active departments A and B exist in one project. A coordinator has project `agent:read` and `agent:update`.
- The test fixture includes source Work in `backlog` and `ready`, work with pending eligibility, an active attempt, pending review, child Work, and a multi-department referral chain.

## Focused checks

Run focused tests after implementation. Use package commands and the test files selected by the implementation tasks:

```bash
pnpm agent:test --filter n8n -- <focused-ai-department-test-file> --maxWorkers=1
```

The final package and file names must be checked against the implementation base. Do not use a full repository test run as the first validation step.

## Acceptance scenarios

1. Refer a valid backlog source from A to B. Verify one receiving backlog item, one link, two activity entries, an unchanged source state, and no receiving eligibility or wake.
2. Replay the same command. Verify the same result and no duplicate item. Reuse the request ID with another operation or payload and verify conflict.
3. Change the source version after the client reads it. Verify stale `expectedVersion` rejects the referral without a receiving item, link, or receipt result.
4. Attempt referral from a running, review, blocked, terminal, child-blocked, or already referred source. Verify rejection with no partial writes.
5. Queue source eligibility and a wake before referral. Verify referral cancels the pending eligibility, marks the wake delivered, and late delivery cannot start the source. Close the chain and verify no dispatch occurs until an explicit ready or start command creates a new generation.
6. Race two referrals into the same chain and department. Verify one commits and the other conflicts. Repeat with SQLite and PostgreSQL.
7. Build A → B → C. Complete C and verify only B → C closes. Verify A → B remains open until B completes or is cancelled.
8. Cancel B while C is active. Verify B → C remains open, A stays fenced, and neither A nor another ancestor can resume. Complete all descendants and verify ancestor fences clear.
9. Race a source mutation or archive against referral and terminal transitions. Verify there is no interval in which a fenced source mutates and no deadlock under the documented lock order.
10. Archive a department that appears only in a closed link while another link in that chain remains open. Verify conflict. After the full chain closes, verify archive follows the existing guard policy.
11. Verify each fence set and clear increments all affected department revisions and emits project-filtered invalidations within Spec 006 limits. Verify reports remain local to their direct Work item.
12. Run the tokenizer's golden cases, then measure SC-006 on the independently labelled dataset before merging routing code.

## Evidence to record

Record migration results for SQLite and PostgreSQL, focused persistence and service tests, restart/reconciliation results, race outcomes, invalidation timing, and the SC-006 top-1/top-3 baseline. Source review alone does not pass these runtime gates.
