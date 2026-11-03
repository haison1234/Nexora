# Design: Optional Department Office

**Status**: Proposed optional presentation after 006B.
**Authority**: [Shared design](../AI-DEPARTMENT-DESIGN.md) and [operations design](../006-ai-department-operations-ui/design.md).

## Overview

Office presents actual department members as simple characters in department areas. A DOM roster and the normal 2D detail routes provide all readable status and actions. The scene helps recognition; business state comes from the same authorized projection used in 006.

## Colors and Typography

Use the existing n8n theme for surrounding controls, text, surfaces, and status. Derive scene colors from semantic theme roles at the Vue boundary. Use procedural geometry and simple materials. Keep text labels in accessible DOM elements instead of relying on small canvas text.

Use the 006 typography hierarchy. Character name, role, availability, work status, and update time must remain readable in the roster. No new font or reference-project branding is introduced.

## Layout

| Region | Content |
|---|---|
| Header | Department name, freshness label, Refresh, visible 2D switch |
| Office canvas | Department areas and authorized members; restrained manual camera controls |
| Text roster | Searchable/paged names, roles, availability, work state, and detail links |
| Selection | The same authorized member/work detail route used in 006 |

Wide screens may place the roster beside the canvas. Narrow screens stack roster and canvas; the roster remains usable without camera movement. At 360 CSS pixels, controls wrap and the page does not scroll horizontally.

## Identity and Interaction

Every visible character corresponds to one stable member ID. Grouping and position are display preferences. Do not infer assignment from a desk, room, animation, or camera location. Archived members remain available only through authorized 2D history.

Selecting a character or roster row opens the same detail. Selection does not start work or grant permission. Only explicit controls in the authorized detail can mutate business records.

## Status and Motion

Show work status, availability, and freshness as separate text. Use a bounded icon/color treatment only as a secondary signal. Idle animation does not imply active work. Missing updates show a stale timestamp rather than invented activity.

Reduced motion disables automatic camera travel and character movement. Manual camera use is optional. No animation completion can trigger a business action. Use demand-driven rendering; read-model updates must reach the DOM roster even when GPU rendering pauses.

## Failure and Fallback

Loading shows a readable roster while the renderer loads. Missing WebGL 2, initialization failure, context loss, or unavailable assets activates the 2D alternative with a short reason. The user can choose 2D at any time. Retry must not reload or repeat work commands.

Project change or permission loss clears roster labels, selected IDs, and scene objects. Stop callbacks and dispose resources. Disconnect retains only the authorized last-known snapshot with its age, until a new access decision requires clearing it.

## Assets and Rendering Budget

The first scene uses new procedural rooms, desks, and character shapes. Pin the Three.js version and record notices. Imported assets require immutable provenance and per-file rights before use.

The initial proposed budget covers 10 rooms and 100 members, no real-time shadows, pixel ratio at most 1.5, at most 100 draw calls, and at most 50,000 triangles. Target p95 frame time is 33 ms during manual camera movement on the recorded test device. Measure before enabling; if the budget fails, reduce scene complexity and retain 2D.

## Review Fixture

Compare 2D and Office for every visible member/status. Test empty data, repeated/older updates, disconnection, access loss, context loss, renderer failure, keyboard selection, reduced motion, both locales, and repeated teardown. Every core action must remain available in 2D. Record text-update latency separately from render frame time.
