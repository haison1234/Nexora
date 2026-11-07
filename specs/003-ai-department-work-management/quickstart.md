# Quickstart: Goals, Work, and Attempts

This guide defines validation after implementation. It does not claim the feature exists or that these checks passed.

## Prerequisites

- Use a local instance with two projects, a coordinator, and a reader. Keep fixtures and provider state in test-owned storage.
- Use the roadmap fixture: up to 10 departments, 100 members, 1,000 work items, and 20 active attempts.
- Install the feature's dependencies listed in plan.md. Controlled adapters validate contracts only; a production enablement check uses the selected real owner.
- Read the API/interface contract before creating requests. Never put secrets in command arguments.

## Focused Checks

After the planned package and tests exist, run the owning checks from the repository root:

```sh
pnpm --filter n8n exec vitest run --config vitest.config.integration.ts \
  src/modules/ai-department/__tests__/work.service.integration.test.ts \
  src/modules/ai-department/__tests__/work.controller.integration.test.ts \
  --maxWorkers=1
```

Run the provider-backed Agent pickup and stop scenarios against the same test-owned
SQLite database. Stop any backend that has this database open before you run them. The
pickup test uses local Ollama at `http://127.0.0.1:1337/v1` and model `qwen2.5:3b` by
default. Keep `N8N_USER_FOLDER` and `N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER` pointed to
the same test folder. Do not use the working instance database.

```sh
N8N_USER_FOLDER=/tmp/nexora-native-owner-test \
N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER=/tmp/nexora-native-owner-test \
N8N_TEST_LIVE_DEPARTMENT_PICKUP=1 \
pnpm --filter n8n exec vitest run --config vitest.config.integration.ts \
  src/modules/ai-department/__tests__/work/work-live-agent-pickup.integration.test.ts \
  --maxWorkers=1

N8N_USER_FOLDER=/tmp/nexora-native-owner-test \
N8N_TEST_DEPARTMENT_RESTART_USER_FOLDER=/tmp/nexora-native-owner-test \
N8N_TEST_LIVE_DEPARTMENT_STOP=1 \
pnpm --filter n8n exec vitest run --config vitest.config.integration.ts \
  src/modules/ai-department/__tests__/work/work-live-stop.integration.test.ts \
  --maxWorkers=1
```

Use the root/package AGENTS for formatting, lint, and any required migration/provider/browser checks. Use one worker. For external runner and Office enablement, include the feature-specific matrix or device measurement below; unit tests alone are insufficient.

## Acceptance Scenarios

1. Create an active goal and work item; assign a member in two minutes or less. Try a goal cycle, another department's assignee, and an archived member; preserve prior data.
2. Assign ready work and deliver its wake twice. Verify one durable wake is coalesced, the Agent can list only its authorized work, and wake acceptance does not start a run.
3. Let two runs claim the same item. Accept one claim only. Expire the accepted lease, verify the owner confirms the prior run cannot mutate work, then reclaim with a new run identity.
4. Report progress, comment, blocker, result, and review request through Agent actions. Verify actor, claim, attempt, expected version, and ordered safe activity. Deny stale and unbound identities.
5. End a runtime successfully without a work report. Keep work open. Then report a result: send it to review or complete it only under the configured business policy.
6. Fail or interrupt an attempt. Record the runtime outcome separately, block the work with a recovery reason, and recover without starting a duplicate run.
7. Request cancellation, lose the connection, and deliver a late result before stop confirmation. Keep pending status truthful and apply the spec's cancellation race rule.
8. Accept and return results under `anyone`, `not_creator`, and `human_only` policies. Deny excluded reviewers and confirm no native tool grant changes.
9. Create parent/child work and blockers. Reject cross-department links, cycles, ready transitions with unresolved blockers, and completion while blocked.
10. Race member/department archive with assignment and start. The admission fence must permit only a consistent outcome; nonterminal work blocks archive.
11. Send duplicate, out-of-order, and older-attempt updates. Preserve history and reconcile a snapshot after a gap.

## Record the Result

Record environment and dependency versions, fixture size, command/test paths, outcomes, timing where required, and unverified cases in the implementation report. A failed integration gate keeps that integration disabled. Do not replace actual behavior with seeded progress or simulated completion.
