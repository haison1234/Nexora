# Design Contract: Org and Office

**Date:** 2026-11-06
**Target artifact:** the Org chart view and the 3D Office view of the AI Department module.
**Audience:** project coordinators who assign and review AI member work. A manager checks status many times a day.
**Goal:** redesign these two views first. Their rules then become the base for the full UI redesign.
**Status:** proposed. The user has not approved this contract.

## Evidence

| Source | What it gave | Confidence |
|---|---|---|
| `ui` repo, `src/components/tenant/orgchart/` (BrainZ UI, user has rights to use it) | Card anatomy, toolbar, search, highlight and de-emphasize on selection, keyboard handling, mobile variants | observed (read: card node, layout composable, service, file sizes) |
| `3d-claude-hub-remote` at `c1e8ba18` (MIT) | Station labels, status ring, speech bubble, communication link, camera presets, side panel, phone layout | observed (read: README, types, backend interface, two screenshots) |
| Nexora module source | Current `OrgCanvas`, `org-layout`, `org-tree`, `office-model`, `office-renderer`, `scene/*` | observed (read source; did not run or screenshot) |
| Backend controllers and `api-types` | The data each view can read and write today | observed |
| Current look of the running Nexora views | not available | inferred from code only |

## Keep, Change, Do not copy

| Reference | Keep | Change | Do not copy |
|---|---|---|---|
| `ui` org chart | Card info order, search, highlight, keyboard map, mobile list | Units with human users become members with AI executors. Remove the permission tab. Use n8n tokens and `N8n*` components | Tailwind and `shadcn` class lists, `axios` service, tenant API names |
| Hub 3D world | Labels, status ring, bubble, link arc, presets, demand rendering | Six fixed roles become any member. Hook events become status derived from polling | The Express and WebSocket server, Claude Code hooks, sessions panel, night-city skyline, sound by default |
| Existing Nexora office | `office-model`, scene modules, roster, fallback, connection chip | Add overlay, links, presets | Nothing is removed in the first build |

License note: the hub is MIT. When code is ported, record the file, the revision, and the copyright notice in the file header and in `docs/design/org-office/PROVENANCE.md`. The user states the `ui` repo is theirs to use. Record that claim in the same file.

## Final design stance

One calm operations room. Neutral surfaces from n8n tokens, status as the single strong color, the same members and selection in the tree and in the 3D office. The 3D view adds spatial memory and help links but never owns an action. The tree and the roster stay complete without 3D.

## What each view reads (today)

| Need | Endpoint | State |
|---|---|---|
| Members, manager, role, expertise tags, executor state | `GET .../members` | exists |
| Set manager, edit a member, archive | `PATCH .../members/:id`, `POST .../archive` | exists on the server. The frontend client has no function for them |
| Work per member and its state | `GET .../work` | exists. The client filters by assignee |
| Help requests: requester and recipient | `GET .../work-help/attention`, `GET .../work/:id/help-requests` | exists. The DTO has `requesterMemberId` and `routing.recipientMemberId` |
| Activity | `GET .../activity` | exists |
| Tool approvals | `GET .../tool-approvals` | exists |
| Departments | `GET .../ai-departments` | exists. Departments are flat, with no parent |
| Push updates | n8n push (WebSocket or SSE, set by config) | the channel exists. The department sends no message yet. Polling every 4 s stays as the fallback. Stale after 12 s |
| One combined snapshot | none | missing. A refresh needs 3 to 5 requests. Build `GET .../operations` with a department revision (contract C6) |
| Saved card positions | browser IndexedDB | decided: store per user, project, department, and member. The `ui` repo uses the same pattern. Positions stay on one browser |

## Risks and unknowns

1. No push channel. Animation is derived from state differences between polls, not from events.
2. No combined snapshot. The refresh cost grows with the number of views that poll.
3. The 60-character limit and device budgets are not measured. Spec 007 T009 is open.
4. Spec 007 chose new procedural primitives and has 0 of 9 tasks done. This work changes its scope and needs approval.
5. Nested departments need a backend change. The contract does not include it.
6. The `ui` org chart has many features that do not fit Nexora (permissions, multi-unit membership). The contract excludes them.
7. The review file `docs/reviews/ai-department-specs-002-008-review.md` is older than the current code for some findings.

## Quality gate

- [ ] Both views pass keyboard-only use of every action.
- [ ] Vietnamese and English both render with no hardcoded text.
- [ ] 360 CSS px works without horizontal scroll.
- [ ] Reduced motion removes all movement.
- [ ] Axe reports no violations on both views.
- [ ] A status is never shown by color alone.
- [ ] 3D and tree show the same status for the same member in one refresh.
- [ ] No private runtime data appears in any label.
- [ ] Hidden members are counted on screen.
- [ ] Provenance file lists every ported file.
