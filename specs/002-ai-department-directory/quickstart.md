# Quickstart: AI Department Directory

This guide defines acceptance scenarios for implementation. It does not claim that the feature is implemented.

## Prerequisites

- Run the n8n development backend with a project-enabled local account.
- Use two projects and users with different project scopes.
- Use the same focused test and API tooling as the owning package. See root `AGENTS.md`.
- For archive scenarios, run the feature 003 work-management provider or a test-owned guard fixture.

## Acceptance scenarios

1. In a guided session, time a coordinator creating one department and two members without executor bindings. Confirm it takes two minutes or less and all records appear only in the selected project.
2. Set the second member's manager to the first member. Confirm the hierarchy is returned and both member IDs stay stable.
3. Submit a self-manager, cross-department manager, and cycle update. Confirm each request fails and the stored hierarchy remains unchanged.
4. As a reader with `agent:list` but without `agent:update`, list the directory. Attempt a rename and confirm access is denied and the record version does not change.
5. Bind a saved Agent from the same project. Confirm the member ID stays unchanged. Try an Agent from another project and confirm the API hides it as not found.
6. Replace or clear the binding. Confirm old work references are unchanged and new directory reads show the current binding state.
7. Submit an outdated `expectedVersion`. Confirm the API returns a conflict and preserves the current record.
8. Archive a member with no active work. Confirm the member remains readable and cannot receive new work. Repeat with nonterminal work and confirm the guard blocks the change.
9. Archive a department with no active work. Confirm its members and prior references remain readable. Repeat with nonterminal work and confirm the guard blocks the change.
10. Complete automatic business work while its owner attempt remains active. Confirm both member and department archive are blocked. Confirm archive succeeds only after owner terminal state is reconciled.
11. Race archive against ready/start admission. Confirm the shared fence lets one operation commit and never starts work in an archived department.

## Expected outcomes

- Cross-project requests never reveal directory content.
- Invalid hierarchy or stale writes do not partially update records.
- A member without a binding is visible as unconfigured and cannot start work.
- An unavailable binding does not erase the member or its history.
- Archive fails closed if the work guard is unavailable. The current module registers the guard; rerun the active-work cases before release.
