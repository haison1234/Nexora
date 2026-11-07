# Feature Specification: AI Department Cross-Department Routing

**Feature ID**: `010-ai-department-cross-department-routing`
**Feature Branch**: Not created.
**Created**: 2026-11-08
**Status**: Draft v6. Not approved. Not in the roadmap. No implementation exists.
**Depends on**: Spec 002 (departments, project scopes), Spec 003 (work states, review, receipts, fencing), Spec 006 (revision and live refresh), Spec 009 (structured reports).
**Input**: A project coordinator receives a request, decides which department should do it, and refers it to that department. The receiving department owns the outcome and uses its own review and assignment rules.

## Scope and Actors

- **Project coordinator**: a person with project `agent:update`.
- **Source department**: the department that holds the original Work item.
- **Receiving department**: the department that holds the new Work item created by the referral.
- **Referral**: one operation that creates a new Work item in the receiving department, links it to the source item, and fences the source item (see "What a referral means").
- **Routing suggestion**: an ordered list of departments from fixed rules (see "Suggestion rules"). It does not call a language model.

## Permission Boundary (MVP)

The platform grants access at project level. A department role grants no n8n scope (Spec 002 contract). Therefore this spec uses project scopes only:

- Reading departments, items, suggestions, and links needs `agent:read` on the project.
- Starting a referral needs `agent:update` on the project, and the caller must be a person.
- Every reader of the project can read every department of the project. This feature adds **no department-level permission**.

A mechanism that lets a user read department A but not department B does not exist and is **out of scope**. If it is added later, the links, activity entries, and suggestions in this spec must be reviewed again, because they assume one shared reader set per project.

## What A Referral Means

A referral is a **transfer of responsibility by copy**, not a move of the same record.

- The receiving department owns the outcome from the moment the referral commits.
- The receiving item is a new Work item. The source item remains as the record of the request.
- A referral is allowed only from a source in `backlog` or `ready`, with no active attempt, pending result or review, open child Work, or other open referral. A blocked source, a source with unresolved child Work, and a source awaiting business review are rejected. The source state value does not change while the fence is open, except for the cancellation allowed below.
- While the referral link or any downstream item in its chain is unresolved, the source item has a durable **item-level or chain fence**. If the source item is an ancestor in a referral chain, its fence stays active while any downstream item in that chain is nonterminal, even after its direct link closes. This prevents an upstream item from restarting while a downstream department still works on the request. Every mutation path that can change or act on the source MUST check the applicable item or chain fence in the same atomic admission boundary as the mutation. This includes person and Agent/owner paths, Work-chain operations, and any path that updates, assigns, makes the item ready, starts it, submits a result, or creates/starts work from it. A department admission fence alone does not satisfy this rule. The coordinator may still cancel the source item as described below. The plan MUST research integration of these fences with current admission and recovery contracts; this spec does not claim that the existing handoff fence implements them.
- A link is **open** until its direct receiving item reaches `done` or `cancelled`. The link then shows that direct terminal state. An ancestor chain fence may remain active until every downstream item in the chain is terminal. When all relevant fences lift, they MUST NOT dispatch sources or revive old eligibility or wake messages. For a source in `backlog`, a coordinator must explicitly use the Spec 003 ready action; for a source in `ready`, a coordinator must explicitly start it. Each action creates new eligibility through the Spec 003 path and does not reuse an earlier generation. The coordinator closes or reuses the source item manually. The system does not change its state.
- Each link follows only its direct receiving item. In A → B → C, completion in C updates only the B → C link. B must process C's result and finish its own Work under B's review policy before the A → B link closes, unless B is cancelled. The system does not close an upstream link or copy C's result directly to A.
- The coordinator may cancel the source item while the link is open. That does not change the receiving item.
- Only one party works on the request at a time: the receiving department. The source never runs in parallel.

## Decisions In This Draft

| # | Question | Decision |
|---|---|---|
| D1 | Who starts a referral? | A person with project `agent:update`. Agents cannot. |
| D2 | What happens to the source? | Its state does not change. It is fenced while its link or any downstream item in its referral chain remains unresolved (see above). |
| D3 | Can an Agent suggest? | Yes, through the read-only suggestion call. A person confirms. |
| D4 | Where does routing text come from? | The existing department `description` (up to 2000 characters) and member expertise tags. |
| D5 | Goals | Not carried. The link stores the source goal title as text. |
| D6 | What is copied? | Instruction, priority, and due date. Not goal, attempts, runs, reports, comments, help requests, blockers, or review policy. |
| D7 | Which review policy applies? | The receiving department's current default policy at creation, as for any new Work item there. The source's policy is not copied. |
| D8 | Return of the outcome | Each receiving state change updates the link shown in the source. At `done` or `cancelled` the link shows the state and the safe report summary from Spec 009. |
| D9 | Who can see a department? | Anyone with project `agent:read` (see Permission Boundary). |
| D10 | Loop and race rule | Count the root and all receiving items. A chain can hold at most one nonterminal item per department (see FR-014). |
| D11 | Duplicate protection | Reuse the existing command receipt keyed by (project, user, request ID). Request IDs are shared across all operations for that user and project. On replay, operation and canonical payload hash must also match; a different operation or payload conflicts. No new receipt table. |
| D12 | Revision bumps | Defined in FR-013. |
| D13 | Snapshot for tombstones | The link row stores snapshots (see Key Entities). |
| D14 | Which source items can be referred? | Only `backlog` or `ready` items with no active attempt, pending result/review, open child Work, or open referral. |
| D15 | What happens to queued source work? | Referral cancels pending eligibility and marks pending wake messages delivered. Fence release does not dispatch; a coordinator uses ready for `backlog` or explicit start for `ready`, creating a new eligibility generation. |
| D16 | Can a department in an unresolved referral chain be archived? | No. Archive is blocked for every department in that chain until all its referrals close. |
| D17 | How does a referral chain return to a department? | Count the root item and every receiving item. A department can have only one nonterminal item in a chain. A → B → A is rejected while the root item is nonterminal; it is allowed only after that A item is `done` or `cancelled`. |
| D18 | Which departments can suggestions return? | Active departments other than the source department. Archived departments and the source are excluded. |
| D19 | How do expertise tags match? | A multi-token tag matches only when every distinct normalized tag token appears in the request. Repeated tags and tokens count once per department. |
| D20 | What if an intermediate item is cancelled while descendants are active? | Close that item's direct link, but keep ancestor chain fences active until every downstream item is terminal. |
| D21 | How does a coordinator resume a source after its fence lifts? | Use the ready action for a `backlog` source, or explicit start for a `ready` source. Both create a new Spec 003 eligibility generation. |
| D22 | How are stale source edits handled? | Referral requires the source's `expectedVersion`; a stale version conflicts under Spec 003 rules. |
| D23 | What tokenizer details gate the suggestion baseline? | The plan must freeze the exact Vietnamese/English stop-word list, ignore tags that normalize to no tokens, and define lexical ordering for reason matches before the evaluation baseline is measured. |

## User Scenarios & Testing

### User Story 1 - Refer a request to another department (Priority: P1)

As a project coordinator, I can refer a Work item to another department of the same project so that the department with the right members does it.

**Independent Test**: Create an item in department A, refer it to B, and check that B has one new backlog item with the same instruction, priority, and due date, that the source is fenced, and that the source state value is unchanged.

**Acceptance Scenarios**:

1. **Given** a coordinator with `agent:update` and an item in A that has no active attempt, **When** they refer it to B, **Then** B gets one new backlog item with no assignee, no attempt, no wake, and no eligibility. The source link is open and the source is fenced.
2. **Given** the same user, request ID, and payload, **When** the request is replayed, **Then** the server returns the original result and creates nothing.
3. **Given** the same user and request ID with a different payload, **When** it is sent, **Then** the server rejects it with a conflict and creates nothing.
4. **Given** the same user and request ID already used by another operation in the project, **When** `work.refer` is sent, **Then** the server rejects it with a conflict and creates nothing. A replay of `work.refer` uses the same project, user, and request ID and must match both operation and canonical payload hash.
5. **Given** a caller without `agent:update` on the project, **When** they refer, **Then** the server rejects it and nothing is written.
6. **Given** B is archived or missing, **When** the referral is attempted, **Then** the server rejects it and A is unchanged.
7. **Given** the source is not in `backlog` or `ready`, has an active attempt, pending result/review, open child Work, or open referral, **When** referral is attempted, **Then** the server rejects it without changing either item.
8. **Given** the source item is `done` or `cancelled`, **When** the referral is attempted, **Then** the server rejects it.
9. **Given** a ready source has pending eligibility or wake messages, **When** referral commits and later closes, **Then** old messages cannot start it and fence release does not dispatch it.
10. **Given** the receiving item is created, **When** its review policy is read, **Then** it is B's current default policy, not A's.
11. **Given** B is cancelled while C is still working, **When** B → C remains open, **Then** A stays fenced until C and every other downstream item is terminal.
12. **Given** all downstream items are terminal, **When** a chain fence lifts, **Then** a backlog source requires the ready action and a ready source requires explicit start; either creates a new eligibility generation.
13. **Given** a coordinator refers an item with its `expectedVersion`, **When** a source field changed after the coordinator read it, **Then** referral conflicts and creates no receiving item.
14. **Given** C completes the item received from B, **When** the B → C link closes, **Then** the A → B link stays open until B completes its own Work, unless B is cancelled.
15. **Given** a department appears in a closed link of a chain that still has another open link, **When** a coordinator archives it, **Then** archive is rejected until every link in that chain closes.

### User Story 2 - Suggest the right department (Priority: P2)

As a coordinator, I see which departments fit a request, so that I choose with the purpose and expertise in front of me.

**Acceptance Scenarios**:

1. **Given** a request text, **When** suggestions are requested, **Then** the server lists active departments except the source in score order, each with a short reason.
2. **Given** the same text and the same data, **When** suggestions are requested again, **Then** the order and reasons are identical.
3. **Given** equal scores, **When** the list is built, **Then** ties break by department name, then ID.
4. **Given** no eligible department scores above zero, **When** suggestions are requested, **Then** the response says there is no match and lists every eligible department by name. If no eligible department exists, it returns an empty list.
5. **Given** a suggestion the coordinator does not take, **When** they refer to another department, **Then** the referral uses the chosen department.

### User Story 3 - Follow the request across departments (Priority: P2)

As a reviewer, I can follow a request from the source to the receiving department.

**Acceptance Scenarios**:

1. **Given** a referred item, **When** a project reader opens the source, **Then** the link shows the receiving department, the receiving item, its state, and the safe report summary when it is `done`.
2. **Given** a project reader opens the receiving item, **When** the source still exists, **Then** the link shows the source department name and source title.
3. **Given** the source department is archived or the source item is cancelled, **When** the receiving item is opened, **Then** the link shows the stored snapshot (D13) and states that the source department is archived or the source item is cancelled.
4. **Given** the receiving item changes state, **When** either department view is open, **Then** that view receives a live refresh within the Spec 006 limits.

## Suggestion Rules

All of these are fixed in code and versioned. A change to them needs a spec update.

- **Normalization.** Apply Unicode NFKC, lower-case, and fold diacritics. Split on any character that is not a letter or a digit. Drop tokens shorter than 2 characters and tokens in the fixed Vietnamese and English stop-word lists that the plan records before baseline measurement. Folding makes accented and unaccented forms use the same normalized token.
- **Inputs per department.** Its normalized `description` tokens, and the union of the normalized expertise tags of its active members.
- **Eligible departments.** Exclude the source department and archived departments before scoring. Include every other active department, including those with no description or tags.
- **Score.** `3 x` the number of distinct normalized expertise tags whose distinct tokens all appear in the request `+ 1 x` the number of distinct request tokens found in the description tokens. A multi-token tag contributes three points once only when all its tokens appear.
- **Tag count.** Deduplicate normalized tags and tokens. Repeated tags, repeated tag tokens, and repeated request tokens do not add extra points.
- **Empty tags.** Ignore a tag if normalization leaves no tokens.
- **Reason.** A fixed template that lists up to 3 matched tags and up to 5 matched description words. Sort matched tags and words by normalized lexical order before taking these limits. No generated text.
- **Order.** Score descending, then department name, then ID.
- **No data.** A department with no tags and no description scores 0 and appears last.
- **Language.** Matching is exact on normalized tokens. The rules do not stem words or translate between languages. A request in a different language from the descriptions can score 0. This limit is accepted.

## Edge Cases

- A referral to the source's own department is rejected.
- A referral while the source has an open link is rejected.
- Only source items in `backlog` or `ready` with no active attempt, pending result/review, open child Work, or open referral can be referred. Reject `review`, `blocked`, and terminal source items.
- Every source mutation path checks the applicable item or chain fence at its atomic admission boundary. This includes person actions, Agent/owner actions, and operations in a Work chain. Cancellation of the source item remains allowed; other mutations and work creation/start from that item are rejected while fenced.
- Referral cancels pending source eligibility and marks pending wake messages delivered in the referral transaction. Releasing the fence does not restore those records or dispatch the source. A coordinator must explicitly make the source eligible again.
- Blockers and parent links in the source stay in the source. The receiving item has none.
- A department appearing in any link, open or closed, of a chain with at least one open link cannot be archived. Archive keeps its items after all links in that chain close. New referrals into an archived department are rejected.
- In a chain, count the root item and every receiving item. At most one nonterminal item per department is allowed. For A → B → A, the return to A is rejected while the root item in A is nonterminal and allowed only after it reaches `done` or `cancelled`.
- Each link follows only its direct receiving item. Downstream completion does not close upstream links or pass its report upstream automatically.
- A department with members who have no expertise tags still receives referrals.
- A receiving item that is cancelled closes its direct link. It lifts ancestor fences only when all downstream items in the chain are terminal. The coordinator may refer or resume a source only after all its applicable fences lift.
- The receipt is written in the same transaction as the Work item and the link. If any write fails, none of them remains.

## Requirements

### Functional Requirements

- **FR-001**: A person with project `agent:update` MUST be able to refer a Work item to another active department of the same project.
- **FR-002**: A referral MUST create one receiving Work item in backlog with no assignee, no attempt, no wake, and no eligibility.
- **FR-003**: A referral MUST copy only the fields in D6. It MUST apply the receiving department's current default review policy (D7).
- **FR-004**: A referral MUST be idempotent on the existing command receipt keyed by (project, user, request ID). Request IDs MUST be unique across all operations for that user and project. Replay MUST match operation `work.refer` and the canonical payload hash. Reusing the same identity with a different operation or payload MUST return a conflict and MUST NOT write anything.
- **FR-005**: A referral MUST check, in the transaction that writes, the caller's scope, the source's `expectedVersion`, that the source is in `backlog` or `ready` with no active attempt, pending result/review, open child Work, or open referral, and that the receiving department is active. A stale version MUST return a conflict and MUST create nothing. It MUST acquire both department admission fences in fixed department-ID order. The plan MUST determine the atomic admission and recovery integration needed for the item-level and chain fences; the existing department fence alone is insufficient.
- **FR-006**: A referral MUST NOT change the source state value. It MUST persist an item-level fence tied to the referral chain. Every source mutation path MUST check the applicable item or ancestor-chain fence atomically, including person, Agent/owner, and Work-chain paths. While fenced, updates, assignment, ready, start, result submission, and work creation/start from the source MUST be rejected. Source cancellation remains allowed. Referral MUST cancel pending source eligibility and mark pending wake messages delivered. Releasing all applicable fences MUST NOT dispatch the source or reuse an old generation. For a `backlog` source, a coordinator MUST explicitly use the ready action. For a `ready` source, a coordinator MUST explicitly start it. Each action MUST create a new eligibility generation through Spec 003.
- **FR-007**: Suggestions MUST follow the Suggestion Rules and MUST NOT use a language model.
- **FR-008**: Suggestion, link, and referral reads and writes MUST require the project scopes in the Permission Boundary.
- **FR-009**: The receiving department MUST apply its own review policy, assignment, and member authority. A referral MUST NOT give any member rights over the other department's items.
- **FR-010**: A referral MUST write one activity entry on each side (see Activity Entries).
- **FR-011**: A referral MUST NOT be reachable from an Agent tool.
- **FR-012**: When the direct receiving item reaches `done` or `cancelled`, its link MUST show that direct state and safe report summary. The source item fence MUST lift only when no downstream item in the referral chain is nonterminal. The source state MUST NOT change. A downstream link MUST NOT close an upstream link or copy its result upstream.
- **FR-013**: Revisions. The referral commit MUST bump the revision of both departments in its transaction. Every state transition of the receiving item MUST bump the revision of the receiving department (as for any item) and of the source department, because the source link shows that state. Any change that sets or clears a fence on an ancestor item MUST also bump the revision and send an invalidation for each affected ancestor department within the Spec 006 refresh limits. These invalidations MUST NOT copy a descendant report to an ancestor. Comments, progress notes, and help requests on the receiving item bump only the receiving department.
- **FR-014**: **Chain rule.** Every referral belongs to a chain whose root is the first source item. Count the root and every receiving item. A chain MUST have at most one nonterminal Work item per department. A referral that would break this rule MUST be rejected. For A → B → A, the return is rejected while the root item in A is nonterminal and allowed only after it is `done` or `cancelled`. The check runs inside the transaction of FR-005, so conflicting concurrent referrals cannot both commit.
- **FR-015**: A department MUST NOT be archived if it appears as source or receiver in any link, open or closed, in a chain that still has at least one open link. Archive MUST fail with a conflict until every link in that chain is closed.
- **FR-016**: A link MUST track only its direct receiving item. In A → B → C, C's state and report update only B → C. B must process and complete its own Work before A → B closes, unless B is cancelled. If B is cancelled while C is nonterminal, A → B closes and shows B's direct cancelled state, but A remains fenced until C and every other downstream item is terminal.
- **FR-017**: Referral MUST require an `expectedVersion` for the source Work item. If it does not match the current version, the server MUST reject the referral without creating a receiving item or link.
- **FR-018**: After all applicable chain fences lift, a coordinator MUST use the ready action for a `backlog` source or explicit start for a `ready` source. Each action MUST create a new eligibility generation under Spec 003. No old eligibility or wake generation may be reused.
- **FR-019**: Before measuring SC-006, the plan MUST freeze and record the exact Vietnamese and English stop-word lists, ignore expertise tags that normalize to no tokens, and define deterministic lexical order for selecting tags and description words shown in reasons.

### Activity Entries

- **Source entry**: kind `referred`, actor the user, body "Referred to {receiving department name}", and the receiving item ID. It does not copy the receiving instruction.
- **Receiving entry**: kind `created_by_referral`, actor the user, body "Referred from {source department name}", and the source item ID.
- Neither entry carries reports, comments, or help requests of the other side. Both sides share one reader set (the project readers), so this does not leak data. If department-level permissions are added, these entries must be reviewed again.

### Key Entities

- **Routing link** (domain relation): id, project ID, source department ID, source Work ID, receiving department ID, receiving Work ID, chain root Work ID, direct link state (open until the direct receiving item is `done` or `cancelled`), snapshot of source title (first 120 characters of the instruction), snapshot of source goal title, snapshot of source department name, snapshot of receiving department name, created by, created at, closed at. Unique on receiving Work ID. The command receipt is the only idempotency record. Each link observes only its direct receiving Work item. An ancestor source fence remains active while any descendant item in the chain is nonterminal, even if that source's direct link is closed.
- **Command receipt**: the existing table keyed by project, actor, and request ID. Request IDs are shared across operations. A replay must match the stored operation and payload hash. A new operation value `work.refer` is used.
- **Department description**: the existing field.

Snapshots exist so a link still reads correctly after a department or item is archived or cancelled. Work items are not deleted in this product version (the module has no delete). Only departments archive. Snapshots are stored text and carry no more than the title and names. They have the same retention as the Work records and command receipts of the project.

## Success Criteria

- **SC-001**: A coordinator refers one item to another department in one action, and the receiving item appears in that department's backlog within the Spec 006 refresh limits.
- **SC-002**: Replaying a referral creates no second item and no second link.
- **SC-003**: A user without `agent:read` on the project cannot read any link, suggestion, or department.
- **SC-004**: Suggestions for the same request and the same data are identical on every call.
- **SC-005**: A referral does not change the source state value. While the link is open, the source cannot be made ready, started, assigned, or submitted. Closing the link does not revive old eligibility or wake messages.
- **SC-006**: Suggestion quality is measured on an evaluation set built **before** any routing code is merged:
  - It uses 8 to 10 departments, the size of the roadmap planning fixture, with real descriptions and expertise tags.
  - It holds 30 requests. Each has a labelled set of acceptable departments (one or two), written by a person who did not write the scoring rules.
  - At least 10 of the 30 requests are deliberately ambiguous or use words that appear in no description.
  - Each label names acceptable departments from the active set after excluding the source department. Archived departments are never valid labels.
  - The result is the share of requests whose first suggestion is in the acceptable set, and the share whose acceptable department is in the first three.
  - The 80 percent target for the first suggestion is a **proposed** value. The baseline is measured on the set first, and the user then fixes the threshold. No code merges before that decision.
- **SC-007**: After the direct receiving item is `done` or `cancelled`, its source link shows the state and safe summary within the Spec 006 refresh limits. The source fence stays active while any downstream item in the chain is nonterminal. Downstream completion does not close an upstream link or copy a report upstream.
- **SC-008**: Two concurrent referrals of one chain to the same department leave exactly one open receiving item.
- **SC-009**: Referral rejects source items outside `backlog` and `ready`, with pending review/result, active attempt, open child Work, or an existing open referral.
- **SC-010**: No department appearing in any link, open or closed, in a chain with at least one open link can be archived.
- **SC-011**: A → B → A is rejected while the root item in A is nonterminal and allowed only after the root item is `done` or `cancelled`.
- **SC-012**: A ready source with pending eligibility or wake messages does not start from those messages after referral or fence release.
- **SC-013**: If an intermediate item is cancelled while any descendant remains nonterminal, every nonterminal ancestor source remains fenced until the descendant items are terminal.
- **SC-014**: A stale source `expectedVersion` causes a conflict and leaves no receiving item, link, or receipt result.
- **SC-015**: After fence release, backlog sources use an explicit ready action and ready sources use explicit start; both create a new eligibility generation.
- **SC-016**: Suggestion reason ordering, exact stop words, and behavior for tags with no normalized tokens are frozen before SC-006 baseline measurement.
- **SC-017**: Every ancestor fence set or clear bumps the affected department revision and sends an invalidation within Spec 006 limits, without copying descendant reports upstream.

## Assumptions

- Project access decides what a user can read and write. This feature does not change it.
- Departments have `description` and members have expertise tags, but many may be empty or short. Suggestions are help, not a decision.
- The receiving department starts its item only through its own explicit action (Spec 003).
- The existing command receipt lookup uses (project, actor, request ID) as its unique identity and treats operation and payload hash as replay-match fields. Request IDs are not scoped per operation.

## Out of Scope

- Department-level permissions.
- Automatic routing without a coordinator decision.
- Agent-initiated referrals.
- Nested departments, department hierarchy, and moving members between departments.
- Splitting one item across several departments.
- Cross-project routing.
- Goal transfer, and copying review policy, reports, comments, or help requests.
- Stemming or translation in suggestions.

## Data And Migration

- One new table: the routing link. It needs a SQLite and a PostgreSQL migration and regenerated schema docs.
- The ownership-transfer manifest MUST list the routing link as project-owned, so it is excluded from cross-project transfer, as the Spec 003 entities are.
- A new command receipt operation value needs no schema change.
- No existing table changes shape.

## Relationship To Other Specs

- Builds on Spec 002, Spec 003, Spec 006, and Spec 009.
- Does not change Spec 004 workflow invocation or Spec 005 runtime.
- Does not replace the delegation inside one department in Spec 009.

## Roadmap And Gates

- Not in the roadmap. Adding it needs the user's approval and a roadmap entry after Spec 009 acceptance.
- No task list is generated until the user approves D1 to D23, the suggestion tokenizer rules are frozen, and the SC-006 evaluation set and threshold exist.
