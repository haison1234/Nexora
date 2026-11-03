# C5: Workflow Capability Bridge

**Status:** Approved v1. G4–G5 remain OPEN for workflow invocation.
**Owner:** Spec 004. **Dependency:** C2 and one verified C3 executor. 005 is optional.

## Requirements

- C5-R1: A coordinator selects a same-project workflow capability per member. Selection
  requires agent:update and workflow:read. Invocation requires the initiating user's
  current agent:execute, workflow:execute, caller policy and native credential checks.
  Result detail separately requires execution:read and owner access.
- C5-R2: Accept only published, nonarchived, owner-compatible workflows. Record publication
  version, supported trigger/node version and input-schema fingerprint in the capability
  revision. Revalidate when publication changes; disable invocation until the coordinator
  accepts a refreshed revision. Do not run draft content or silently use another version.
- C5-R3: Validate inputs with the owner's derived schema, including native defaults.
  The capability cannot declare a different schema to bypass it. Preserve owner output
  format; do not promise a static output schema unless the owner verifies one. General
  activity stores a bounded safe summary and protected execution/result reference.
- C5-R4: The active claim and attempt authorize invocation. Persist invocation identity
  before dispatch. Owner acceptance atomically binds invocationKey to actual publication
  and child execution. A concurrent publication change rejects acceptance before effects
  unless the owner can execute the exact approved revision. Unknown outcome retains intent.
- C5-R5: Constrain all workflow dispatch paths in this department run, including inherited
  saved-Agent workflow tools and post-approval resume. Do not edit the shared saved Agent.
  If the owner cannot enforce this, department workflow calls remain disabled.
- C5-R6: Preserve child running, waiting, retrying, succeeded, failed, cancelled and unknown
  independently from parent business state. Native retries retain owner lineage. A fresh
  request ID is an explicit new call, never an automatic retry of external effects.
- C5-R7: Capability disable/revocation denies new calls and protected result delivery.
  Request stop for active children through the C3 owner control plane. A stop timeout
  remains pending. Parent stop requests child stop; parent/child outcomes stay distinct.
  No workflow result can bypass explicit result submission or C4 review.

## Model and API deltas

Extend WorkflowCapability with immutable revisions: member, workflow, publication ref,
trigger compatibility ref, input schema ref/fingerprint, purpose and enabled/version.
WorkflowInvocation stores project/work/attempt/claim generation, capability revision,
requestId/inputHash, expected/actual workflow version, dispatch state, owner execution ref,
native retry lineage and child state. Use unique `(attemptId, requestId)` with operation
namespace and owner invocation key. InvocationReceipt deduplicates owner sequence/events.
Persist stop intent, result-delivery authorization state and shared department revision.
Keep full inputs/outputs and credentials with n8n owners.

Keep the user routes in 004/contracts/service-api.md, with the common agent scopes plus
workflow/execution scopes above. Invocation is an authenticated service call:
`invoke({capabilityId, capabilityVersion, requestId, inputsRef, expectedWorkVersion,
claimGeneration}, ownerAttemptAuthority)`.
The server derives project/member/work/attempt from the owner context and checks them
against persistence. Return invocationId, dispatchState, childState and safe authorized
reference. Lookup by invocation key resolves retries without creating a new execution.

Owner boundary: `describePublishedCapability`, `acceptInvocation`, `lookupInvocation`,
`requestStop`, `snapshot`. Describe/accept must agree on publication and schema identity.
These are proposed additions; private workflow tool factories are not public adapters.

## Source and spec mapping

004 spec, plan, data model and service-api already require selected capabilities,
correlation, current policy and native outcomes. D6 strengthens publication update rules.
`workflow-tool-workflow-loader.service.ts` supports published content and rejects archive;
`workflow-tool-factory.ts` derives supported-trigger inputs and manages waits/results;
`subworkflow-policy-checker.ts` supplies caller-policy checks. These are reusable owner
internals. No department capability/invocation implementation was found in inspected source.
Do not treat native workflow tool existence as Spec 004 completion.

## Acceptance

- [ ] C5-A1: Compatible published workflow invokes once with approved input under current
  caller/credential policy. Invalid input, archive, incompatible trigger and lost access
  reject before dispatch.
- [ ] C5-A2: Publication changes before acceptance cannot execute an unapproved version.
  Refreshing the capability records a new revision and preserves old invocation identity.
- [ ] C5-A3: Duplicate key returns the same child; changed input conflicts. Timeout and
  restart reconcile by key without another execution or external side-effect retry.
- [ ] C5-A4: Wait, retry, fail, cancel and success preserve child lineage/state. Parent
  work changes only through C2/C4. Stop acknowledgment does not claim child termination.
- [ ] C5-A5: Revoke access/capability during wait, approval resume and result delivery.
  Deny new calls/delivery, request stop, and retain only authorized safe audit metadata.
- [ ] C5-A6: An inherited workflow tool cannot bypass selected capability policy. Failure
  to prove this leaves workflow invocation disabled for the department attempt.
