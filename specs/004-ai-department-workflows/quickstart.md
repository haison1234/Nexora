# Quickstart: Workflow Capability Bridge

This guide defines validation after implementation. It does not claim the feature exists or that these checks passed.

## Prerequisites

- Use a local instance with two projects, a coordinator, and a reader. Keep fixtures and provider state in test-owned storage.
- Use the roadmap fixture: up to 10 departments, 100 members, 1,000 work items, and 20 active attempts.
- Install the feature's dependencies listed in plan.md. Controlled adapters validate contracts only; a production enablement check uses the selected real owner.
- Read the API/interface contract before creating requests. Never put secrets in command arguments.

## Focused Checks

After the planned package and tests exist, run the owning checks from the repository root:

```sh
pnpm agent:test --filter n8n -- src/modules/ai-department/__tests__/workflow --maxWorkers=1
```

Use the root/package AGENTS for formatting, lint, and any required migration/provider/browser checks. Use one worker. For external runner and Office enablement, include the feature-specific matrix or device measurement below; unit tests alone are insufficient.

## Acceptance Scenarios

1. Configure a published compatible workflow for one member. Reject an unselected, another project's, unpublished, archived, or incompatible workflow.
2. Call with valid input during an active attempt. Follow work -> attempt -> capability -> invocation -> owner execution. Try invalid input and revoked access; no new execution may start.
3. Duplicate the same request before and after acknowledgment. Change the project pool after queue acceptance, restart the process, and reconcile the same invocation key from the original queue without another execution.
4. Supply waiting, native retry, failure, success, pending stop, and confirmed cancellation outcomes. Preserve distinct child labels.
5. Deliver an older attempt's result after retry. Keep it in its original history and do not change the current attempt or business review state.
6. Remove execution-detail access while preserving safe work access. Return an unavailable/private label without payload disclosure.

## Record the Result

Record environment and dependency versions, fixture size, command/test paths, outcomes, timing where required, and unverified cases in the implementation report. A failed integration gate keeps that integration disabled. Do not replace actual behavior with seeded progress or simulated completion.
