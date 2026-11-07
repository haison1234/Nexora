# Work Coordination Service Contract

**Status**: Proposed API and Agent-tool behavior. Validate against current source before implementation.

## Agent `department_work` actions

Keep all actions inside the authenticated department execution context. Derive the actor,
member, attempt, project, executor, and binding from that context. Require current claim,
work version, and stable command identity for every mutation.

### Structured `submit`

Replace the free-form `body` with:

```ts
type CompletionReport = {
  result: string;
  completedWork: string[];
  checkedEvidence: Array<{ reference?: string; summary: string }>;
  openIssues: string[];
  nextSteps: string[];
};
```

Use these proposed limits: `result` is 1–4,000 characters; each list has at most 10 items;
each list item and evidence summary has at most 500 characters. Evidence references must
be authorized Work or attempt references. The server records one report activity and
follows the existing `reviewPolicy`. A valid report does not grant tool approval or bypass
business review.

### `ask`

```ts
type AskForHelp = {
  expectedVersion: number;
  question: string;
  attemptedSteps: string[];
  reason: string;
  expertiseTags: string[];
  requestId: string;
};
```

The question is limited to 2,000 characters. The reason is limited to 1,000 characters.
The action accepts up to 10 attempted steps of 500 characters each and up to five
expertise tags of 64 characters each. An Agent answer is limited to 1,000 tokens and
4,000 characters. Each recipient stage has a proposed 10-minute deadline.

The action validates the current attempt, claim, member, binding, work state, request limit,
and idempotency key. It resolves the recipient using the deterministic routing rules in
`../plan.md`. It writes the request, Work activity, blocked transition, and owner-stop
intent in one transaction. It returns an acknowledgment that ends the Agent turn. The
claim may be released only as part of this safe-stop flow; the Work assignee stays the
requesting member.

The Agents owner must confirm the turn is terminal. Only then can the request enter
`awaiting_answer`. The response path accepts one bounded answer and records it before
continuation. If no other blocker remains, move Work from `blocked` to `ready`, create a
new eligibility generation, then request a coalesced wake. If a blocker remains, keep Work
blocked and do not wake it. Unknown stop, answer, or wake outcomes remain pending for
reconciliation.

### Human answer

The project-authorized Work UI exposes an answer command to the selected person. The
server checks current project access and request state, writes one attributed response,
and requests the same durable requester wake. A human response does not invoke an Agent.

### `delegate`

```ts
type DelegateWork = {
  expectedVersion: number;
  recipientMemberId: string;
  title: string;
  instruction: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requestId: string;
};
```

The recipient must be an active, bound direct report of the current Agent member in the
same project and department. Recheck the manager link, current claim, project access,
binding revision, and blockers in the transaction. Create one ready child Work item, its
parent and blocker relationships, activity, command receipt, eligibility generation, wake
lane generation, and durable wake intent in that transaction. The existing lane rechecks
current authority before reserving the child. Replay with the same command identity and
payload returns the same child. Replay with a changed payload conflicts.

Limit the title to 200 characters and the instruction to 1–4,000 characters.

For both relationship kinds, set `workId` to the child and `relatedWorkId` to the parent.
The `blocks` edge makes the child the unresolved blocker for the parent.

After delegation, the parent Agent releases its current turn with the exact reason
`waiting_for_children`. Only this reason marks the durable release as eligible for parent
continuation. A confirmed terminal snapshot rechecks child blockers. If blockers remain,
the parent stays blocked. When the last child is accepted and no blocker remains, the system
creates one fresh parent eligibility and wake. An unknown parent outcome never triggers a
new attempt.

A child Agent can delegate only during its own later claimed turn and only to its own
direct report. The validated org tree bounds the delegation chain. Do not copy executor
credentials, workflow grants, claims, or runtime state to child Work. Business review
remains governed by the child Work's review policy.

### Workflow calls

Workflow calls use the member's separately selected `WorkflowCapability` under C5. The
server rechecks its revision, current project scopes, binding, claim, attempt, and exact
published workflow version on every call. Do not expose arbitrary workflow selection or
inherit the delegating member's capabilities. Keep the call disabled until the C5 owner
gates pass. A workflow result is evidence for a later business report; it does not accept
that report or bypass its review policy.

## Projection behavior

Work detail returns the structured report, requests, responses, request state, responder,
and child relationships after current project authorization. Parent detail includes each
authorized child's state and structured report after its own review policy accepts the
result. When the final child blocker resolves, re-evaluate parent eligibility after owner
stop confirmation and issue one durable parent wake if the current attempt is terminal.
The attention view exposes unanswered human requests and terminal routing failures. Do not
expose Agent prompts, credentials, raw output, or private owner logs.

## Errors and recovery

- `400`: invalid report, question, expertise tag, field size, or state transition.
- `403`: missing current project, member, executor, or answer authority.
- `404`: absent or inaccessible cross-project request.
- `409`: stale Work version, request limit, duplicate answer, conflicting command payload,
  active owner turn, or unresolved child blocker.
- Unknown owner acknowledgment stays pending. Reconcile the same stable request key.
- Do not dispatch a replacement while stop or prior invocation state is unknown.
