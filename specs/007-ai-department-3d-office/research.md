# Research: Optional Department Office

**Feature**: `007-ai-department-3d-office`
**Reviewed**: 2026-11-02
**Evidence boundary**: Source and documentation review. No provider, migration, browser, or runtime test result is claimed.

## Source Evidence

| Concern | Source | Observed behavior |
|---|---|---|
| Optional office UX | `specs/AI-DEPARTMENT-DESIGN.md` | Office reads shared state, shows stale data truthfully, and preserves 2D parity. |
| Frontend boundary | `packages/frontend/AGENTS.md` | Keep this feature inside the department frontend module. |
| Tokens and motion | `.agents/skills/ui-design/SKILL.md` | Use current CSS tokens, accessible components, and reduced-motion patterns. |
| Renderer API | [Official documentation](https://threejs.org/docs/pages/WebGLRenderer) | WebGLRenderer requires WebGL 2 and exposes disposal and context-loss support. |
| Resource lifecycle | [Official documentation](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) | Geometries, materials, and textures need explicit disposal. |

## Decisions and Alternatives

### Renderer and placement

- **Decision**: Use Three.js behind a lazy `OfficeRenderer` boundary inside the existing department frontend module. Do not create another frontend module or backend business model.
- **Rationale**: The scene is a read-only projection and the public renderer provides context/disposal controls.
- **Alternative rejected**: Embed a reference application's frontend or let scene objects own work state.

### Asset provenance

- **Decision**: Use new procedural room/desk/character primitives for the first release. Pin the renderer version and record its license/notice in the dependency and provenance review.
- **Rationale**: No reference-model or avatar rights need to be assumed. Optional imported assets require exact source, immutable revision, license, and notice records before use.
- **Alternative rejected**: Copy bundled My Office/Hub art under a repository-wide license assumption.
- **Amendment 2026-11-06**: The Hub repository has a real MIT `LICENSE`. It has no binary art; its scene is procedural. Code and patterns from revision `c1e8ba18` may be adapted when the file header and `docs/design/org-office/PROVENANCE.md` record the source file, the revision, and the copyright notice. The Hub third-party notes (Remotion, voiceover) do not apply. The Hub server and hooks are not adopted.

### Rendering budget

- **Decision**: Start with at most 10 rooms and 100 members from the roadmap fixture, no real-time shadows, capped device-pixel ratio of 1.5, demand-driven rendering, and instanced repeated geometry.
- **Rationale**: Rendering must not delay readable status or 2D operations. Proposed initial ceilings are 100 draw calls and 50,000 triangles.
- **Alternative rejected**: Continuous cinematic animation as a requirement.
- **Measurement gate**: Before enabling 3D, record browser version, CPU/GPU/RAM, viewport, median/p95 frame times, geometry counts, and memory behavior on one laptop with integrated graphics and one 360 CSS-pixel mobile profile. Target p95 frame time is 33 ms during camera movement. These are proposed budgets, not measured results.

### Failure and access

- **Decision**: Maintain a DOM text roster outside the canvas. Context/asset failure, manual preference, reduced-motion preference, and access loss never require the user to interact with a working canvas.
- **Rationale**: Renderer failure must leave every core status/action accessible through the 006 views.
- **Alternative rejected**: Invent live actors or movement when data is unavailable.

## Ownership and Implementation Gate

The renderer and procedural asset strategy are selected. 3D enablement still requires measured device budgets and cleanup/fallback checks; 2D remains available throughout.

New contracts in this feature are proposed additions. Source observations do not mean those additions already exist. Keep source changes inside the owners shown in the plan.
