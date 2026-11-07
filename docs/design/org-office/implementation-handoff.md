# Implementation Handoff: Org and Office

Read first: `DESIGN.md` and `design-contract.md` in this folder, then `specs/007-ai-department-3d-office/` and `specs/006-ai-department-operations-ui/`.
Work in `packages/modules/ai-department/frontend/`. Use a separate branch or worktree. The main worktree has many uncommitted changes.

## Rules

- Tokens: n8n design-system tokens only. No new hex values or raw px in Vue files.
- Text: `@n8n/i18n`, with `vi` and `en` together.
- Data: the existing department store. No second store.
- Libraries: no new dependency in phase 1. Add `@vue-flow/core` or `dagre` only if the plan shows the current layout fails a test.
- Security: no prompt, credential, or runtime payload in any label.
- Provenance: record every ported file in `docs/design/org-office/PROVENANCE.md`.

## Phases

1. **Data layer**
   - Add `updateDepartmentMember` and `archiveDepartmentMember` to `ai-department.api.ts`.
   - Add one refresh that loads members, work, help attention, and activity under one request generation.
   - Keep the 4 s visible polling and the 12 s stale rule.
   - Proof: a store test shows a late response from an old selection does not overwrite a new one.
   - **Snapshot and push (backend):**
     - Add `GET .../operations`. It returns members, work, help requests, and activity in one read, with a department revision.
     - Allocate the revision in the same transaction as each accepted change.
     - Add one typed push message in `@n8n/api-types` that carries only the department ID and the revision. The browser then reads the snapshot.
     - Send it through the existing n8n `Push` service. Check project `agent:read` access again at send time.
     - Hook one publisher into every write path (work, handoff, release, help request, member, binding).
     - The frontend subscribes through the existing push connection and keeps the 4 s polling as the fallback.
   - Proof: a test shows a user who lost access gets no message. A reconnect reads a full snapshot.
2. **Org**
   - Member card, group header, search, collapse, keyboard map, and the below-640 px tree list.
   - Save card positions in browser IndexedDB, keyed by user, project, department, and member. Drop records of removed members. Add a "reset layout" button.
   - A coordinator can set the manager from the card menu, with `expectedVersion`. Show the server message for a cycle or a stale version.
   - Proof: component tests for keyboard and labels. Layout tests for 1 and 60 members.
3. **Office**
   - DOM label overlay, status ring, help link arc, camera presets, shared selection with the org view.
   - Keep the fallback to the roster when WebGL fails.
   - Proof: model tests for status parity with the org view. A manual run on one low-end device records frames per second and memory.
4. **Shared base**
   - Move the status map, chip, and card tokens to one shared file used by both views. This file starts the full UI redesign.

## First artifact must prove

- The same member shows the same status, in the tree, the scene, and the roster, after one refresh.
- A help request draws a link between the requester and the recipient.
- Everything works with the keyboard at 360 px, with reduced motion on.

## Out of scope

Nested departments, sound, hub server code, the permission tab, positions shared across browsers.
