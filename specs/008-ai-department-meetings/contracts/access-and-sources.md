# Access, Source Snapshots, and Directory Admission

**Status**: Proposed design. Source-reader and directory-owner confirmation remain open.

## Project and meeting authorization

Use existing project scopes on project-scoped meeting routes: `agent:list` for lists,
`agent:read` for metadata and bodies, `agent:create` for creation, and `agent:update`
for edits, start, exclusion, approval, conversion, decline, takeover, and cancellation.
Starting, retrying, or taking over invocation authority also requires `agent:execute` and
Agents current execution authorization. Every read and command checks current project
access before loading command replay results. Cross-project and inaccessible IDs return
the same not-found response.

Meeting metadata and protected bodies have separate projections. Without current access
to any referenced source, readers may see safe meeting metadata only; they receive no
topic-derived briefing, source title, contribution, minutes, or source-dependent action
item text. A source access failure clears protected client cache and blocks new dispatch,
synthesis, approval, and publication until resolved. Approval rechecks access to every
source contribution.

## Source snapshot protocol

At draft creation, source references are validated through each source owner's public
reader. At start, resolve current authorization and create an immutable, versioned
snapshot containing opaque source references, versions, content hash, capture time, and
the authorized material needed for the briefing. Meeting storage does not read source
tables directly. A source owner that cannot provide a stable authorized snapshot makes
that source unavailable; the coordinator must remove it before start. Do not substitute
generated or newly fetched content silently.

Prior meeting context may include selected decisions only when each decision is approved
by a coordinator, its source meeting/version and approver are recorded, and the current
reader has access to the source meeting. Resolve it as frozen authorized material through
the same owner-mediated snapshot path. Never include prior minutes, participant
contributions, or private conversation history as implicit context.

The snapshot reference is passed to Agents, which revalidates user and project access
before enqueue and each tool use. If a source changes after start, the meeting continues
with its frozen version only while the owner confirms access to that version. Otherwise
the affected invocation is unavailable. Current access is checked again before result
delivery and every protected body read.

## Binding and responsibility changes

At start, freeze member ID, role, executor ID, and binding revision. A later binding
change prevents new calls on the stale revision. Already accepted calls remain owned by
Agents and require lookup/stop reconciliation; never switch them to the new binding.
Starting a replacement meeting is the supported way to use a new binding.

The creator is the initial execution actor. Another coordinator may inspect or cancel
under current policy. A new user who retries or resumes invocation must issue an explicit
takeover command with `expectedVersion`; record both the old and new actor and recheck
their current project and Agents authority. Never replace actor identity on an existing
owner invocation.

## Directory admission guard

Department archive and member archive must include active meetings in their admission
check. If a supported member transfer operation is added, it must use the same check.
Draft meetings do not block. Meetings in `collecting`, `synthesizing`, `review`,
`approved`, or `cancelling` block. Completed and cancelled meetings do not block. A
cancelling meeting releases its blocker only after each accepted owner invocation has
confirmed terminal state. Unknown meeting state fails closed.

The guard returns typed blockers, such as `{ kind: 'work', id }` and
`{ kind: 'meeting', id }`, plus a count. The Directory API can then show safe references
without exposing meeting content. It deduplicates blockers and scopes them by project,
department, and optional member.

### Proposed contract composition

Current source has one `ActiveDepartmentWorkGuard` proxy. `AiDepartmentModule.init()`
registers `ActiveDepartmentWorkGuardImpl`; archive services acquire the shared department
admission fence and pass `OperationContext` to the guard. There is no meeting guard.

Proposed direction: Directory owns one `ActiveDepartmentArchiveGuard` boundary. A
composite implementation in the AI Department module asks the Work guard and Meeting
guard with the same project, department/member, and transaction context, then combines
typed blockers. Directory keeps one registration point and one fail-closed archive
decision. The Meeting repository stays private to the meeting service/guard. Both guards
read within the caller's transaction after the same admission fence is acquired.

The proposed result is `{ active, blockers }`, where each blocker has `kind` and `id`.
`forDepartment(projectId, departmentId, ctx)` returns active work and meeting IDs.
`forMember(projectId, memberId, ctx)` returns active work and meetings that selected that
member. The composite requires every registered owner. Missing Work or Meeting
implementation causes archive to fail closed. Directory returns 409 with a safe blocker
count and typed references; it does not return topic or meeting content.

Meeting start also acquires the same department admission fence in its transaction before
it changes `draft` to `collecting`. It rechecks that the department and every participant
are active, then persists the frozen participant and binding snapshots. This serializes
meeting admission with archive. It commits before Agents enqueue; no database transaction
stays open during owner calls. A source or binding change between preparation and owner
acceptance causes the owner check to reject that call. Archive sees the durable active
meeting and stays blocked until the meeting becomes terminal.

The Directory and Work owners must confirm that this composite can safely replace or
adapt the work-only boundary, including test registration and fail-closed behavior. Do
not weaken the current work guard or allow archive while either guard is unavailable.
Do not hold a database transaction open while calling Agents; meeting rows must reflect
owner-confirmed terminal state before the guard releases them.

## Retention and cache

Keep meeting business history under the existing project deletion policy. Do not add a
meeting hard-delete or automatic purge action in v1. Agents controls runtime retention.
An expired owner link does not remove meeting records. Browser cache holds only bodies
currently authorized for display and clears them on access loss, project switch, or
source denial. General activity contains IDs and safe summaries, not prompts, source
bodies, credentials, or raw tool arguments.
