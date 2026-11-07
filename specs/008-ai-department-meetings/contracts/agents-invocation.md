# Agents Owner Contract: Meeting Invocation

**Status**: Proposed boundary with partial Agents implementation in the shared worktree.
T005–T010 now have contract, durable invocation, isolated execution, bounded result, and
accepted/running stop code. The owner asks an AI Department verifier to confirm the current
member binding and frozen revision. The owner resolves supplied-material context through
the registered reader before reservation and queue delivery. Meeting start persists
participant reservations before it calls the owner after commit. The periodic task recovers
reserved and unknown calls. Provider/native acceptance and T011 stop recovery remain open. The
observed `DepartmentExecutor` still accepts only
`DepartmentAttemptContext` and cannot serve this contract without fake work or attempt IDs.

## Ownership

Agents owns executor authorization, model call, context assembly, tool enforcement,
runtime limits, queue acceptance, invocation lookup, stop proof, execution sequence, and
result delivery. AI Department owns meeting lifecycle, participant attribution,
accepted contributions, minutes, and business approval. The meeting service must not
read or write Agent queue, execution, thread, prompt, or credential tables.

## Proposed owner operations

Agents should expose a narrow meeting boundary, independent of work attempts. These
signatures are the target internal contract. The current queue and runtime must gain a
meeting dispatch mode to implement them. The AI Department module receives only the
Agents-owned proxy; it does not receive queue or execution repositories.

```ts
type MeetingInvocationRequest = {
  schemaVersion: 1;
  projectId: string;
  departmentId: string;
  meetingId: string;
  participantId: string;
  invocationId: string;
  round: 'contribution' | 'synthesis';
  actorId: string;
  memberId: string;
  executorId: string;
  bindingVersion: number;
  requestKey: string;
  expectedInputHash: string;
  contextRef: string;
  /** Current implementation field; must be replaced by owner-resolved context before dispatch is enabled. */
  inputText: string;
  maxOutputChars: number;
  maxOutputTokens: number;
  toolPolicy: MeetingToolPolicy;
  deadlineAt: string;
};

type MeetingToolPolicy =
  | { mode: 'supplied-material-only' }
  | { mode: 'verified-read-only'; toolIds: string[]; policyVersion: string };

type MeetingDispatchResult =
  | { kind: 'accepted'; ownerInvocationRef: string }
  | { kind: 'rejected'; code: 'access' | 'binding' | 'tools' | 'unavailable' }
  | { kind: 'unknown' };

type MeetingLookupResult =
  | { kind: 'accepted'; ownerInvocationRef: string }
  | { kind: 'absent' }
  | { kind: 'unknown' };

type MeetingOwnerSnapshot = {
  ownerInvocationRef: string;
  sequence: string;
  phase: 'queued' | 'running' | 'stopping' | 'terminal' | 'unknown';
  outcome?: 'succeeded' | 'failed' | 'cancelled';
  safeErrorCode?: string;
  terminalAt?: string;
};

type MeetingContribution = {
  stance: 'agree' | 'disagree' | 'neutral';
  keyPoints: string[]; // zero to three items, 500 Unicode characters each
  risks: string[]; // zero to three items, 500 Unicode characters each
  proposedAction: string;
};

Each text field has a 500 Unicode character limit. The serialized contribution has a
4,000 Unicode character limit. The owner rejects malformed output before it can count
toward quorum.

type MeetingContributionResult = {
  ownerInvocationRef: string;
  sequence: string;
  resultHash: string;
  contribution: MeetingContribution;
};

abstract class DepartmentMeetingInvocationOwner {
  abstract resolve(input: {
    actorId: string;
    projectId: string;
    memberId: string;
    executorId: string;
    bindingVersion: number;
  }): Promise<{ available: boolean; canStart: boolean; canStop: boolean }>;
  abstract dispatch(request: MeetingInvocationRequest): Promise<MeetingDispatchResult>;
  abstract lookup(input: Pick<MeetingInvocationRequest, 'projectId' | 'invocationId' | 'requestKey' | 'expectedInputHash'>): Promise<MeetingLookupResult>;
  abstract snapshot(input: { projectId: string; invocationId: string; ownerInvocationRef: string }): Promise<MeetingOwnerSnapshot>;
  abstract readResult(input: { projectId: string; invocationId: string; ownerInvocationRef: string; expectedInputHash: string }): Promise<MeetingContributionResult | null>;
  abstract requestStop(input: { projectId: string; invocationId: string; ownerInvocationRef: string; commandId: string }): Promise<{ acknowledged: boolean; confirmedTerminal: boolean }>;
}
```

The authenticated caller context supplies current user authority. Agents derives the
actor ID from that context. It does not trust a request field for actor identity. Agents
resolves the current binding and project access itself. It must not trust the executor ID
or tool list as proof of authorization. The owner returns `accepted(ownerInvocationRef)`,
definite rejection, confirmed absence, or `unknown`. Repeating `(projectId, requestKey)`
with the same hash returns the same invocation. A different hash conflicts. Unknown
enqueue results are looked up by stable key before any retry or replacement.
The lookup checks both the pending/claimed queue row and the execution linked to the
deterministic input message ID. A consumed queue row is not evidence of absence. If neither
receipt is visible yet, return `unknown` and retry lookup later; do not report `absent` or
dispatch a replacement from that observation alone. A terminal execution snapshot remains
the source of terminal outcome.

The owner validates that the member and executor belong to the same project and that the
binding revision is current. `round`, `contextRef`, selected tool IDs, and deadline are
bound into the input hash. Caller text is excluded because the owner resolves it from the
authorized immutable context snapshot. The request key is unique for one participant attempt. A retry
uses a new invocation ID and key linked to the prior terminal invocation.

The caller's authenticated identity is authoritative. `actorId` above names the
authenticated caller in the internal contract; a public request body cannot set it. The
internal request still carries `inputText` for bounded queue execution. The Agents owner
replaces this field with material resolved from `contextRef`; caller text never affects
the request hash or reaches the queue. The queue consumer checks the queued text against
the owner-persisted text. A missing authorized snapshot fails before reservation.
Lifecycle dispatch and meeting-side result reconciliation remain open.
`resolve` and `dispatch` check project execution scope, current Agent access, member
binding, and binding revision. `dispatch` persists a stable owner invocation key before
queue delivery. A queue message key is derived from the owner invocation ID, not from a
work attempt. The owner creates a dedicated thread for each invocation and uses a fresh
session. It does not reuse participant or work history.

## Context and tools

Agents resolves the immutable meeting context reference through an authorized source
reader and verifies its hash. It supplies only topic, desired outcome, the participant's
role snapshot, selected source material, and the participant's own response instructions.
Participants cannot see other participant outputs. Synthesis receives only the frozen
accepted contribution set, exclusion reasons, and source references.

For v1, `supplied-material-only` is the supported default. Agents builds the runtime with
no saved Agent tools, no integrations, no workflow tools, no `department_work` tool, no
delegation/background tools, and no inherited conversation memory. The owner checks the
effective runtime tool registry before the model call and rejects the invocation if any
tool remains. A later `verified-read-only` mode is available only after Agents has a
server-owned registry that proves the selected tool operation is read-only and checks
source access at use time. Client-supplied tool IDs, labels, and descriptions do not
establish that guarantee. Writes, messages, workflow execution, work actions, hiring, and
unverified tools are always denied.

Agents enforces context isolation between participants, the deadline, maximum output
size, owner-internal retry limit, and safe failure classification. It does not retry on
quota, authorization, or policy rejection. Meeting-level retry is a new correlated
invocation and requires the prior invocation to be terminal. A v1 invocation has one
model turn and no follow-up chat. The final assistant object is the contribution candidate;
Agents returns it only through `readResult` after terminal success and current access
checks. It validates the schema, enforces at most three key points, applies per-field
length limits, and rejects malformed output. It requests at most 1,000 output tokens and
limits the serialized contribution to 4,000 Unicode characters, truncating text fields at
valid Unicode boundaries when required. The department validates attribution, current
meeting state, and result hash before storing the bounded contribution. Synthesis receives
only the frozen accepted contributions and exclusions. Its request also has an explicit
output limit under the owner context budget. Minutes must preserve opposing positions
with attribution and must not report unsupported consensus.

## Lookup, events, stop, and result

Agents provides authorized lookup and snapshot by project, invocation ID, owner reference,
and request key. Lookup reconciles the stable queue message and linked execution, including
after the queue row is consumed. Snapshots include a monotonically increasing sequence, phase, terminal
outcome, safe error classification, and timestamps. The sequence increases for every
state change. Duplicate or lower-sequence updates are no-ops. The department polls or
receives an owner event, then calls `snapshot` and `readResult`; an event is only an
invalidation hint. The department accepts a result only if it matches project, meeting,
participant, invocation, input hash, active meeting version, and current access. The
result body is fetched through the owner boundary; raw provider payloads are not copied
into meeting activity.

Stop accepts a stable command ID. Acknowledgment means only that the owner recorded the
request. `confirmedTerminal` is true only after the owner observes correlated terminal
execution state. Repeating the same stop command is idempotent. Unknown stop remains
pending and retains the directory guard.
Cancellation must also fence an invocation before the department has an owner reference.
The owner accepts cancellation by project, invocation ID, request key, and expected input
hash. It stores a cancellation tombstone under that identity. Reservation and queue
acceptance must check the tombstone. Queue claim must check it again before runtime
admission. A queue item that races with cancellation may remain stored, but the consumer
must discard it before model execution. A cancellation lookup that returns `absent` is not
terminal proof while a dispatch caller can still reserve the key. Keep the meeting in
`cancelling` until the owner proves each accepted invocation terminal and the owner fence
proves each unaccepted key cannot reach runtime execution.
Stop and result delivery are fenced after cancellation or access revocation. A late result
is retained by Agents and reported as late metadata; it cannot create a contribution.

## Current API gap and acceptance evidence

| Existing Agents surface | Source behavior | Reuse for meetings |
|---|---|---|
| `DepartmentExecutor.resolve` | Resolves a binding in project and checks `agent:execute` for the actor. | Possible primitive. The owner must add member/binding revision equality and meeting-specific authority. |
| `DepartmentExecutor.dispatch` | Accepts `DepartmentAttemptContext`; queues hidden chat with `source: 'ai-department'` and a message that requires `department_work`. | Not reusable as-is. It requires work/attempt IDs and exposes work instructions. A meeting dispatch must use a distinct owner mode and tool set. |
| `lookup` | Correlates by dispatch message ID and work attempt thread. | Pattern may inform lookup. Meeting correlation needs meeting and participant IDs. |
| `requestStop` / `snapshot` | Validate and reconcile a work attempt, execution thread, and attempt ID. | Stop receipt and terminal snapshot patterns may inform the owner contract. The current signatures cannot identify a meeting call. |
| `DepartmentWorkflowInvocation` | Reserves workflow calls under `DepartmentWorkflowInvocationAuthority`, which requires `attemptId`. | Not reusable for meeting model calls. It also remains gated by Spec 004. |

The existing work adapters establish useful owner-side patterns, but they do not establish
a standalone meeting call. The work dispatch adapter sends a `department_work` instruction, and
the existing queue identity is a message key attached to an attempt thread. Do not call
it with synthetic identifiers or infer context isolation from `sessionMode: 'new'`.

The queue accepts a `sessionMode` and `source`, and it hashes department input for
idempotency only when `source === 'ai-department'`. The implementation adds a dedicated
meeting source and key/hash conflict behavior. Runtime reconstruction adds a meeting
runtime profile. That profile strips configured tools, integrations,
workspace and knowledge attachments, plan tools, `department_work`, delegation, and
background tools. The current `injectRuntimeDependencies` path adds built-in tools even
when configured tools are empty. A meeting profile must skip that injection and attach
only the model and required output guard. The existing `departmentWork` runtime flag is
not a safe shortcut because it installs the `department_work` capability and optional
workflow tools.

Before tasks can be generated, the Agents owner must review the proposed request, result,
stop, tool, context, and permission semantics against current Agent queue/runtime APIs.
Before enablement,
verify accepted/unknown lookup, duplicate key/hash conflict, owner-internal retries, tool
denial, context isolation, deadline, access revocation, late output, stop across restart,
and result delivery with a real owner. Controlled mocks do not close these gates.
