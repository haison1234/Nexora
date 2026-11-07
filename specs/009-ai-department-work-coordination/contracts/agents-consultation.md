# Agents Consultation Owner Contract

**Status**: Proposed boundary. This is not an existing generic Agents API. G1 wake and
current owner recovery acceptance remain open.

## Ownership

Agents owns executor verification, model invocation, prompt assembly, effective tool
registry, deadline, stop proof, owner sequence, result storage, and recovery. AI Department
owns help-request state, routing, response attribution, Work activity, and business state.
The department must call a narrow Agents proxy. It must not read or write Agent queue,
execution, prompt, credential, or checkpoint tables.

## Request

```ts
type ConsultationInvocationRequest = {
  schemaVersion: 1;
  projectId: string;
  departmentId: string;
  requestId: string;
  workId: string;
  sourceAttemptId: string;
  requesterMemberId: string;
  recipientMemberId: string;
  initiatingUserId: string;
  executorId: string;
  bindingVersion: number;
  commandKey: string;
  expectedInputHash: string;
  contextRef: string;
  deadlineAt: string;
  maxOutputChars: number;
  maxOutputTokens: number;
  toolPolicy: { mode: 'none'; policyVersion: string };
};
```

The owner resolves the authorized question context by `contextRef`. Do not trust caller
supplied prompt text as the canonical context. The owner verifies member, project,
department, binding revision, initiating actor, and current access before dispatch.

## Operations

| Operation | Result |
|---|---|
| `invoke(request)` | Durable `accepted`, definite `rejected`, or `unknown` result |
| `lookup(commandKey, inputHash)` | Same owner invocation, confirmed absent, conflict, or unknown |
| `stop(invocationRef, commandId)` | Stop acknowledgment; it is not terminal proof |
| `snapshot(invocationRef)` | Current phase, outcome, monotonically increasing sequence, and safe bounded result when terminal |
| `recover()` | Reconcile accepted, unknown, and stopping requests after restart without duplicate execution |

An accepted answer uses one model turn. The effective runtime tool registry must be empty.
Enforce output size and deadline. Keep late output attached to its original invocation and
do not accept it after cancellation, expiry, access loss, or a newer terminal decision.

## Terminal result

Return only a bounded answer, safe terminal status, owner invocation reference, and owner
sequence. Do not return a prompt, credential, raw provider error, tool arguments, or full
execution log. An unavailable, failed, timed-out, stopped, or unknown outcome is distinct
from a successful empty response.

## Requester continuation

After AI Department commits a valid answer, it requests a wake through the existing
coalesced wake lane. The wake identity binds the project, department, work, help request,
answer, requester member, initiating actor, and current binding revision. The wake must
not carry new permission. The owner rechecks the existing attempt and executor access.

The requester attempt must be terminal before continuation. If the response is committed
and no blocker remains, AI Department may move the same Work item from blocked to ready.
It keeps the assignee and creates a new eligibility generation for that member. An unknown
stop or unresolved blocker keeps the Work item blocked and prevents the wake.

The current wake lane has open G1 runtime acceptance. Do not enable Agent consultation
or automatic requester continuation until lost-wake, coalescing, duplicate delivery,
restart, access loss, and current binding checks pass on the current owner revision.
