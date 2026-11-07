# Work Conversion and Recovery Contract

**Status**: Proposed cross-owner contract. Existing work create has actor-scoped
idempotent receipts; cross-record recovery is not implemented.

## Authority and identity

Only a coordinator with current project create/update access may convert an approved
action item. Conversion is a separate command from approving minutes. The command stores
`requestId`, payload hash, meeting/action-item IDs, acting user, and expected meeting
version before calling Work. Derive `workRequestId` deterministically from the persisted
conversion command, or persist it before the first call; never generate a new key on
retry.

## State protocol

1. In one meeting transaction, verify current access, approved minutes, unresolved action
   item, destination department/member validity, and expected version. Reserve conversion
   with state `pending` and stable work request identity.
2. Call the public Work service with the same actor, project, department, work payload,
   and stable request ID. Work creates backlog work with review required. It does not
   start the item.
3. On success, persist the returned work ID and mark the action item `created` in a
   second meeting transaction. A crash between steps leaves `pending` for recovery.
4. On timeout or unknown response, retain `pending`; query the Work command receipt using
   the same actor and request ID. Do not issue a different create command.
5. If the receipt proves success, verify its payload hash and link the returned work ID.
   If Work proves absence, replay the same create request. If Work reports conflict,
   mark `recovery_required` and require coordinator resolution. Do not guess from a title.
6. A definite validation/authorization rejection is recorded as a safe failure. After
   the coordinator fixes the input or authority, a new explicit conversion command may
   be issued; the old receipt remains.

Decline is a separate idempotent command with a reason. A created item cannot be declined.
An action item can link to at most one work item. Duplicate retries return the same link.
Meeting completion waits for every action item to be created or declined, but never for
linked work to complete.

## Required owner API confirmation

Current `WorkService.createWork(projectId, actorId, departmentId, dto)` creates a work
item under an actor-scoped command receipt and starts it in backlog. The receipt lookup
is private to Work persistence and current source does not show a cross-feature public
resolve operation. Before implementation, Work must provide a narrow use-case method to
resolve a create command by project, actor, and request ID, returning found, absent, or
conflict with the authorized created work reference when found. If lookup returns absent,
retry the same create command and request ID; Work's own payload-hash replay remains the
authority. Do not expose a generic receipt table or TypeORM access to Meetings.

The source also shows `WorkService` owns `TransactionRunner`; no contract proves one
transaction can span the meeting and work persistence. This protocol therefore uses
durable reservation plus reconciliation, not a claimed distributed transaction.

## Paperclip reference and design consequence

Reviewed Paperclip commit `fea61638114a041ffe60cba178f2438bbb06e57b` in the local
checkout. In `server/src/services/issues.ts`, issue creation checks and writes the
`issue_create_idempotency_keys` row inside the same database transaction as the issue
row. The key maps `(companyId, idempotencyKey)` to one issue ID. The mapping has a
retention window. The inspected table does not store a request payload hash, so do not
copy its replay semantics where Nexora requires same-key/different-payload conflict.

In `server/src/routes/issues.ts`, the route commits issue creation before it calls
`queueIssueAssignmentWakeup`. `server/src/services/issue-assignment-wakeup.ts` skips
unassigned and backlog issues, then submits a durable/coalescible wake request. This
separates durable business work from Agent wake-up. It informs the meeting design, but it
does not link two business records or prove delivery for a meeting conversion.

Paperclip's `server/src/services/project-tools.ts` also gives child-task creation a
stable idempotency key derived from the source task and request key. The issue service
resolves that key during the issue-create transaction. This is a useful retry pattern.
It does not provide the meeting action-item receipt lookup needed here.

**Design consequence for Nexora:** reserve the action-item conversion before calling
Work; persist the exact Work request ID and payload hash; let Work atomically commit its
item and command receipt; then resolve uncertain calls through a narrow Work-owned
command lookup and attach the existing work ID. This is a small saga with durable
reconciliation, not a distributed transaction. Keep meeting conversion independent of
Agent wake-up. Starting the resulting backlog item remains a separate Spec 003 command.

Paperclip is a behavior reference only. Do not copy its schema, route, database, key
retention policy, or assignment/wakeup runtime.

## Access and privacy

Check current project and action-item access before reserve, each replay result, and work
link delivery. Work response visibility follows the existing Work contract. Meeting
detail may show a safe work reference only to users allowed to read both records. Never
return a stored conversion result after access loss.
