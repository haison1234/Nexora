# Quickstart: Operations Interface, Slices A and B

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

1. With the roadmap fixture, open Overview and identify the next attention item within one minute. Verify attention -> active work -> ownership -> activity ordering.
2. Use only the keyboard to create a department/member, create and assign work, and accept/return a controlled result. Repeat as a reader and deny changes.
3. Open one business review and one tool request. Labels and routes differ; accepting the result grants no tool permission.
4. Check loading, empty, partial failure, unavailable executor, stale edit, pending cancellation, and lost connection in Vietnamese and English at 360 CSS pixels.
5. With healthy push and a visible page, provide 100 updates; at least 95 become visible within five seconds of projection commit. During push failure, verify four-second polling and report its latency separately. Deliver duplicates and older revisions without rollback.
6. Disconnect after a start/review request, then reconnect. Recover the command/resource state without repeating it. Revoke access and clear all protected cached content.
7. Disable external runtime and Office. Complete every core 2D action.
8. Open the organization tree and Agent/member detail. Verify manager hierarchy, role, availability, binding status, assigned work, and access denial.
9. Open goal and work detail. Follow parent/child and blocker links, comments, activity, current claim, runtime attempt/outcome, business review, and result reference.
10. Finish a runtime run without an Agent result report. Verify the UI still shows work as open and displays the run outcome separately. Submit a result report and verify the configured review policy controls the next business state.
11. Deliver duplicate wake/activity updates and reclaim a stale run. Verify one current claim, safe history ordering, and no stale rollback after reconnect.

## Record the Result

Record environment and dependency versions, fixture size, command/test paths, outcomes, timing where required, and unverified cases in the implementation report. A failed integration gate keeps that integration disabled. Do not replace actual behavior with seeded progress or simulated completion.
