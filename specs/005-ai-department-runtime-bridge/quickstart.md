# Quickstart: External Coding Runtime Bridge

This guide defines validation after implementation. It does not claim the feature exists or that these checks passed.

## Prerequisites

- Use a local instance with two projects, a coordinator, and a reader. Keep fixtures and provider state in test-owned storage.
- Use the roadmap fixture: up to 10 departments, 100 members, 1,000 work items, and 20 active attempts.
- Install the feature's dependencies listed in plan.md. Controlled adapters validate contracts only; a production enablement check uses the selected real owner.
- Read the API/interface contract before creating requests. Never put secrets in command arguments.

## Focused Checks

After the planned package and tests exist, run the owning checks from the repository root:

```sh
pnpm agent:test --filter n8n -- src/modules/ai-department/__tests__/runtime --maxWorkers=1
```

Use the root/package AGENTS for formatting, lint, and any required migration/provider/browser checks. Use one worker. For external runner and Office enablement, include the feature-specific matrix or device measurement below; unit tests alone are insufficient.

## Acceptance Scenarios

1. Create a short-lived project/workspace grant, connect a controlled runner, and revoke it. Verify expired/revoked/cross-project events and commands change no state.
2. Start one assigned coding task, duplicate the start and follow-up commands, disconnect, and reconnect. Recover the same attempt/session and do not replay input.
3. Request stop while the runner is unreachable. Show pending/unknown until the runner reports an observed process/container outcome.
4. Grant, deny, expire, replay, and alter one action request. Verify only the matching unconsumed grant can authorize the exact action.
5. Try a workspace traversal, external symlink, unregistered command, unauthorized mount, repository hook, and general shell action. Deny them inside the runner boundary.
6. Inject secret-shaped output and large messages. General activity contains only safe bounded summaries; protected content follows separate owner access.
7. Disable the external provider. Complete directory, planning, and business review scenarios with no dependency on it.

## Record the Result

Record environment and dependency versions, fixture size, command/test paths, outcomes, timing where required, and unverified cases in the implementation report. A failed integration gate keeps that integration disabled. Do not replace actual behavior with seeded progress or simulated completion.
