# Quickstart: Optional Department Office

This guide defines validation after implementation. It does not claim the feature exists or that these checks passed.

## Prerequisites

- Use a local instance with two projects, a coordinator, and a reader. Keep fixtures and provider state in test-owned storage.
- Use the roadmap fixture: up to 10 departments, 100 members, 1,000 work items, and 20 active attempts.
- Install the feature's dependencies listed in plan.md. Controlled adapters validate contracts only; a production enablement check uses the selected real owner.
- Read the API/interface contract before creating requests. Never put secrets in command arguments.

## Focused Checks

After the planned package and tests exist, run the owning checks from the repository root:

```sh
pnpm turbo test --filter=@n8n/frontend-module-ai-department -- --maxWorkers=1
```

Use the root/package AGENTS for formatting, lint, and any required migration/provider/browser checks. Use one worker. For external runner and Office enablement, include the feature-specific matrix or device measurement below; unit tests alone are insufficient.

## Acceptance Scenarios

1. Load real authorized fixture identities and verify every character maps to exactly one member. Select it and open the same member/work detail as 006.
2. Deliver 100 timestamped state changes, repeated events, and older versions. At least 95 text labels update within five seconds; no state rollback occurs.
3. Disconnect the data source. Show last-known state and time without invented progress. Revoke access and clear both roster and scene content.
4. Disable WebGL 2, lose the context, and fail an asset load. Complete every core action through 2D and the same detail routes.
5. Use keyboard-only navigation and reduced motion in both locales at 360 CSS pixels. No required animation or camera movement may block a detail/action.
6. Measure the declared device budget and repeated mount/unmount behavior. Record versions, hardware, p95 frame time, resource counts, and cleanup before enabling 3D.

## Record the Result

Record environment and dependency versions, fixture size, command/test paths, outcomes, timing where required, and unverified cases in the implementation report. A failed integration gate keeps that integration disabled. Do not replace actual behavior with seeded progress or simulated completion.
