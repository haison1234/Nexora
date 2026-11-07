# Provenance: Org and Office

## Reference snapshots

| Repository | Revision | Rights |
|---|---|---|
| `NinelXram/3d-claude-hub-remote` | `c1e8ba18dcc594d36932ffcf822adb0136633b0e` | MIT. Copyright 2026 NinelXram. The Nexora files listed below carry source headers where their implementation adapts Hub code. |
| User's `ui` repository (BrainZ UI) | `3a9f152b108b82236b781e3fb71606d6b3ebd311` | The user states that they own this repository and may use its design in Nexora. No source code was copied. |

The Hub revision was checked out locally for comparison. The Hub says it has no prompt or image from `ai-agent-3d-prompts`, and it has no binary scene assets.

## Org view informed by `ui`

| Nexora file | Reference file | Adaptation |
|---|---|---|
| `components/OrgCanvas.vue` | `src/components/tenant/orgchart/OrgChartCanvas.vue` | Canvas structure and member selection. Rewritten with Vue Flow and n8n components. |
| `components/OrgTreeList.vue` | `src/components/tenant/orgchart/OrgChartCanvas.vue`, `orgChartKeyboard.js` | Narrow-screen tree and keyboard behavior. Implemented as an accessible nested list. |
| `components/org-layout.ts` | `src/components/tenant/orgchart/useOrgChartLayout.js`, `orgChartLayoutStore.js`, `orgChartLayoutDelta.js` | Layout and change handling. Nexora keeps manager relationships as its source of truth. |
| `components/org-tree.ts` | `src/components/tenant/orgchart/OrgChartCanvas.vue`, `orgChartHighlight.js` | Tree traversal, selection emphasis, and search matching. Implemented for department members. |
| `components/MemberPanel.vue` | `src/components/tenant/orgchart/OrgChartMemberProfileSheet.vue` | Member detail hierarchy. Reuses Nexora member and Work actions. |
| `views/AiDepartmentHomeView.vue` | `src/components/tenant/orgchart/OrgChartToolbarControls.vue`, `OrgChartSearchModal.vue` | Search and view controls. Rewritten with n8n tokens and i18n. |

The Org view uses the reference card anatomy, selection emphasis, search, keyboard behavior, and responsive approach. It does not use the reference's Tailwind classes, shadcn components, tenant API, permission tab, or source code.

## Office files adapted from the Hub

| Nexora file | Hub source | Adaptation |
|---|---|---|
| `office/office-theme.css`, `office/office-theme.ts` | `app/src/app/globals.css` | Theme colors and glass panel values. |
| `office/scene/lighting.ts` | `app/src/world/Lighting.tsx` | Light roles, colors, and reflection panels. Rewritten for Nexora's layout and resource disposal. |
| `office/scene/environment.ts` | `app/src/world/OfficeEnvironment.tsx` | Night office composition, window wall, skyline, plants, and floor treatment. Rewritten for dynamic department layouts. |
| `office/scene/workstations.ts` | `app/src/world/Workstations.tsx`, `stationOwners.ts` | Desk and status display patterns. Nexora binds every display to department state. |
| `office/scene/robots.ts` | `app/src/agents/AgentCharacter.tsx`, `robotRigs.ts` | Procedural character and rig patterns. Nexora maps roles and status from authorized members. |
| `office/scene/animator.ts` | `app/src/agents/AgentAnimator.ts` | Procedural pose blending patterns. Nexora keeps reduced-motion behavior in its renderer. |
| `office/scene/motion.ts` | `app/src/agents/AgentController.ts`, `world/agentMotion.ts` | Character movement patterns. Nexora moves characters only to display reported work status. |
| `office/scene/layout.ts` | `app/src/simulation/worldLayout.ts` | Spatial layout concepts. `buildLayout`, `routeBetween`, team rooms, lead offices, and `wallSegments` are Nexora code. |
| `office/scene/textures.ts` | `app/src/world/proceduralTextures.ts` | Procedural canvas texture patterns. Nexora owns and disposes its generated textures. |
| `office/scene/camera.ts`, `scene/presets.ts` | `app/src/world/CameraController.tsx`, `cameraPresets.ts` | Camera bounds and named views. Nexora uses its own layout-aware presets and controls. |
| `office/office-renderer.ts` | `app/src/world/WorldCanvas.tsx`, `AgentLabelsOverlay.tsx` | Demand-driven rendering and DOM labels. Rewritten without React or the Hub runtime. |

The listed source files contain adaptations of Hub implementation patterns. Each adapted TypeScript module has a short MIT attribution header. The Office excludes the Hub server, session handling, hooks, prompt data, and sound.

## Nexora-authored files

- `office/scene/rooms.ts` and `office/scene/links.ts` implement team rooms, help-request links, and wall-aware paths for Nexora.
- `office/office-model.ts`, `office/status-visual.ts`, `office/OfficeRoster.vue`, `office/OfficeStatusChip.vue`, and `office/OfficeStatusIcon.vue` map the authorized department projection to the shared status UI.
- Org and Office API state, access checks, selection routes, failure handling, and i18n use Nexora contracts.
- `components/org-layout-storage.ts` is Nexora-authored IndexedDB storage. Its per-user, project, department, and member keys follow the handoff's local layout requirement; no reference source code was copied.
- New team rooms, lead offices, the open independent area, work-title bubbles, and active-work counts are Nexora-authored changes.

These statements describe design and implementation provenance. They do not claim runtime or device acceptance. See `specs/007-ai-department-3d-office/tasks.md` for the open fallback and measurement checks.
