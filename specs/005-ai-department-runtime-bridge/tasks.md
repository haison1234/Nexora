# Tasks: External Coding Runtime Bridge

**Input**: spec.md, plan.md, research.md, data-model.md, and contracts/.
**Status**: Implementation work is unchecked. Follow root/package AGENTS and the validation order in the accepted plan. No mandatory test-first rule is introduced.


## Phase 1: Foundation

Establish the feature contracts, source ownership, DTOs, and required persistence before story behavior. This phase does not enable an unverified adapter.

- [ ] T001 Define runner and tool-action schemas in packages/@n8n/api-types/src/ai-department/runtime.ts and versioned executor integration in packages/cli/src/modules/ai-department/runtime/. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006)
- [ ] T002 Implement hashed grants, scoped user grant routes, revocation, session correlation, receipts, and migrations under packages/cli/src/modules/ai-department/runtime/ and database/. (FR-001, FR-003, FR-004, FR-009)

## Phase 2: Runner access

US1 / P1: connect and revoke a bounded runner grant. Validate project/workspace isolation, expiry, and disconnected state without a real coding job.

- [ ] T003 [US1] Implement the dedicated TLS runner ingress, grant authenticator, issuer access recheck, message limits, heartbeat, and reconnect snapshots in packages/cli/src/modules/ai-department/runtime/. (FR-001, FR-003, FR-004, FR-006)
- [ ] T004 [US1] Add controlled-runner cases for revoked/expired grants, foreign context, disconnected state, and no authority escalation under packages/cli/src/modules/ai-department/__tests__/runtime/. (FR-001, FR-003, FR-004, FR-009)

## Phase 3: Sessions

US2 / P1: correlate start, follow-up, stop, and reconnect with one attempt. Keep provider enablement off until its complete control/isolation matrix passes.

- [ ] T005 [US2] Create the isolated runner workspace package at packages/@n8n/ai-department-runner/ with a versioned local command/session store and outbound protocol client. (FR-002, FR-003, FR-004, FR-007)
- [ ] T006 [US2] Add a non-root per-job container profile, canonical workspace checks, protected credentials, resource limits, restricted mounts, and network policy under packages/@n8n/ai-department-runner/deploy/. (FR-007, FR-008)
- [ ] T007 [US2] Pin the Claude Agent SDK/CLI/image and record dependency terms and exact start/follow-up/stop/permission behavior in packages/@n8n/ai-department-runner/providers/claude/README.md. (FR-008)
- [ ] T008 [US2] Implement the pinned provider adapter and 003 dispatch-key lookup, follow-up dedupe, stop acknowledgment, and reconnect reconciliation under packages/@n8n/ai-department-runner/providers/claude/. (FR-002, FR-003, FR-004, FR-008)

## Phase 4: Tool decisions

US3 / P1: inspect and resolve one immutable action. Validate denial, expiry, replay, changed context, and protected detail before permitting side effects.

- [ ] T009 [US3] Implement typed read/search/mutation/check tools and the optional 004 capability channel and immutable action mediation inside packages/@n8n/ai-department-runner/tools/; disable all built-in tools and run repository checks in a separate container without provider credentials. (FR-005, FR-007, FR-008)
- [ ] T010 [US3] Implement context-bound, expiring one-time decisions and protected action retrieval under packages/cli/src/modules/ai-department/runtime/. (FR-003, FR-004, FR-005, FR-006)
- [ ] T011 [US3] Add deny, expiry, replay, changed-action, output-safety, and runner-boundary contract cases under packages/@n8n/ai-department-runner/__tests__/ and the owning backend tests. (FR-004, FR-005, FR-006, FR-007, FR-008)

## Phase 5: Validation

Record focused checks and measurable acceptance evidence. Unchecked enablement criteria remain release gates; a document or fixture is not a runtime result.

- [ ] T012 Run the provider contract matrix against the pinned isolated image; keep enablement off if any required control or boundary case fails. (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008)
- [ ] T013 Run the provider-disabled acceptance set with 002/003/006 and record results in the implementation report. (FR-009)

## Dependencies and Execution Order

- Complete foundation before story implementation. Resolve the existing dependency features before using their interfaces.
- Within each story, establish persistence/DTOs, services, routes/UI, then behavior checks.
- Independent documentation and separate test files may be prepared in parallel. Shared owner adapters, DTOs, migrations, and state-machine files are sequential changes.
- The adapter and protocol design is selected. Provider enablement requires the pinned version matrix and isolated-runner checks. No actual coding provider has passed these checks in this documentation turn.
- Run checks serially with one worker. A fixture or mock is not evidence that an enabled production provider works.

## Functional Requirement Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T001, T002, T003, T004, T012 |
| FR-002 | T001, T005, T008, T012 |
| FR-003 | T001, T002, T003, T004, T005, T008, T010, T012 |
| FR-004 | T001, T002, T003, T004, T005, T008, T010, T011, T012 |
| FR-005 | T001, T009, T010, T011, T012 |
| FR-006 | T001, T003, T010, T011, T012 |
| FR-007 | T005, T006, T009, T011, T012 |
| FR-008 | T006, T007, T008, T009, T011, T012 |
| FR-009 | T002, T004, T013 |

## Success Criterion Coverage

| Criterion | Tasks |
|---|---|
| SC-001 | T004, T011, T012 |
| SC-002 | T004, T011, T012 |
| SC-003 | T004, T008, T012 |
| SC-004 | T013 |

## Completion Evidence

Record changed paths, focused checks, acceptance results, and remaining release gates in the implementation report. Do not tick off tasks because the document exists. Keep code and specs synchronized when implementation changes a contract.
