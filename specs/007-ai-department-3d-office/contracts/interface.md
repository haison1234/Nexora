# Optional Department Office: Contracts

**Contract version**: 1
**Status**: Proposed implementation contract. Existing n8n APIs are identified in research.md; the department surfaces below must be added.

## Route and data contract

Register an optional lazy Office route in the same `ai-department` module:
`/projects/:projectId/ai-departments/:departmentId/office`.

Consume the existing 006 authorized operations/directory projections. Do not add a scene feed containing private runtime data. Use the same member/work IDs, resource versions, and access-loss behavior.

## Renderer boundary

`OfficeRenderer` exposes mount(container), applySnapshot(displayState), setReducedMotion(enabled), select(memberId), and dispose(). These are proposed local UI operations.

The renderer emits selection IDs only. The Vue owner resolves them to the same detail route used by 006 and rechecks current access. A renderer callback never dispatches start, stop, review, or tool approval.

Validate incoming IDs against the current authorized snapshot. Display labels must be escaped as text. Do not put raw model output into scene HTML.

## Fallback and accessibility

Keep a visible 2D switch and DOM member roster outside the canvas. The roster includes name, role, work status, availability, update time, and detail links. Keyboard users can select every member without spatial camera movement.

If WebGL 2 or assets fail, activate the roster and 006 detail links automatically. On context loss, stop rendering and offer retry; the default remains the usable 2D view. Dispose GPU resources/listeners when leaving Office or losing access.

Reduced motion removes automatic camera/character movement. A plain label must communicate each state. Manual navigation and background updates must not move keyboard focus.

## Enablement checks

Record renderer/dependency versions and asset provenance. Use new procedural primitives initially. Meet the proposed budgets in research.md on the documented devices before enabling 3D. If the budget fails, retain 2D and revise scene complexity.

For 100 timed changes, at least 95 text-status updates must appear within five seconds on the healthy local acceptance setup. Render timing and text update timing are measured separately. Failure or disconnect must never create simulated workers or execution progress.
