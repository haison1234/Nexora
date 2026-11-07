# AI Department Org and Office: Design Direction

Scope: the Org chart and the 3D Office views in `packages/modules/ai-department/frontend/`.
These two views set the pattern for the later full UI redesign.
Method: OpenDesign `reference-design-contract`. Every rule below is binding for the first build.

## Amendment 2026-11-07: match the two reference interfaces (approved by the user)

The user wants the Org view to look like the `ui` repo org chart and the Office view to look like 3D Claude Hub Remote.
This amendment replaces any rule below that blocks that look. The rules for status, text, keyboard, and motion stay.

- **Org (from `ui`):** soft rounded cards, a tinted body and border taken from one accent color, a large shadow, and a pulsing ring on the selected card. The accent is the member status color. The tint is `color-mix` of the accent with `--background--surface`, so it works in light and dark themes.
- **Office (from the Hub):** a dark, night office scene and a glass panel over it. Reference values:
  - Surfaces: ink `#06080c`, `#0a0e14`, `#0e131b`, `#121823`, `#1a2230`, `#263041`.
  - Text: mist `#eef2f7`, `#b7c1cf`, `#7c8797`.
  - Signals: accent `#7cc4d6`, ok `#6fe3a4`, warning `#f2b46a`, bad `#ff8a7a`.
  - Glass panel: a 180 degree gradient from `rgb(22 29 41 / .82)` to `rgb(12 16 23 / .86)`, a 1 px border `rgb(183 193 207 / .09)`, an inset top highlight, a deep shadow, blur 14 px, saturate 1.15, radius 16 px.
  - Eyebrow: 10.5 px, uppercase, letter spacing .12em.
  - Fonts: Inter and JetBrains Mono.
  - Scene lights: hemisphere `#a8bdf0` over `#3a2c20`, key light `#ffdcbc`, warm point lights `#ffbf82`, blue fill `#7d97d8`.
- **One theme file.** Hex values for the Office theme live only in `office/office-theme.ts`, `office/office-theme.css`, and the scene modules in `office/scene/`. Vue files use the CSS variables from the theme file. This replaces the rule "no hex in Vue files" for the Office only.
- **Allowed now, in the two views only:** gradients, glass blur, a night skyline, and a dark scene in every n8n theme. The 2D chrome of the rest of the module stays on n8n tokens.
- **Still required:** status icon plus text, keyboard use, reduced motion, 360 px layout, and no private runtime data in labels.
- **Provenance:** every Hub value or file used is listed in `PROVENANCE.md` with revision `c1e8ba18dcc594d36932ffcf822adb0136633b0e` and the MIT notice.

## 1. Visual Theme & Atmosphere

- Stance: **calm operations room**. A manager reads who is working, who is blocked, and who needs help in one glance.
- The 2D chrome uses n8n design-system tokens only. The 3D scene is a single dim-lit office with warm desk lights.
- Status is the only strong color on screen. Everything else is neutral.
- Keep from the references: dense but readable cards (BrainZ org chart), labeled stations, status ring around a character, short speech bubble, side detail panel (3D Claude Hub Remote).
- No decoration that carries no data: no skyline, no particles, no gradients.

## 2. Color

- Use n8n tokens already used by the module: `--color--primary`, `--color--success`, `--color--warning`, `--color--danger`, `--background--surface`, `--background--subtle`, `--text-color`, `--text-color--subtle`, `--border-color`.
- Do not add new hex values in Vue files.
- Status map (color is never the only signal; each status also has an icon and a text label):

| Status | Token | Icon cue |
|---|---|---|
| working | `--color--success` | pulse dot |
| review | `--color--warning` | eye |
| waiting (blocked work with an open help request) | `--color--primary` | speech bubble |
| blocked | `--color--danger` | octagon |
| queued | `--color--primary` | clock |
| idle | `--text-color--subtle` | minus |
| unconfigured, unavailable | `--border-color` dashed | plug with slash |

- 3D scene colors are constants in `office/scene/` and must come from the same status map. Light and dark theme both stay legible.

## 3. Typography

- Use the n8n font stack and `--font-size--*` tokens.
- Card title: `--font-size--sm`, `--font-weight--bold`. Meta: `--font-size--2xs`, `--text-color--subtle`.
- 3D labels are DOM overlays, not canvas text. They use the same tokens and a 12 px minimum.
- Truncate with an ellipsis. The full text is in the detail panel and in `title`.

## 4. Spacing & Grid

- Spacing only from `--spacing--5xs` to `--spacing--sm`. No raw px except 3D world units.
- Org card size stays at the current `ORG_CARD` (214 by 108) until a layout test justifies a change.
- Org canvas gap: `ORG_GAP` (32 by 76).
- 3D uses world units from `office/scene/layout.ts`. One desk is the unit of spacing.

## 5. Layout & Composition

- **Org, 640 px and wider:** top-down tree by `managerMemberId`. Toolbar (fit, zoom, search, collapse) on top. Detail panel on the right.
- **Org, below 640 px:** an indented tree list with expand and collapse. No pan and no zoom.
- **Office, 640 px and wider:** one scene, left. Detail panel, right.
- **Office, below 640 px:** the scene above, a roster list below. The roster is the primary control on small screens.
- Independent members (no manager) sit in one "independent" group, as in the current office model.
- Both views show the same members, the same status, and the same selection.

## 6. Components

- **Member card (org):** icon avatar, name, role, status chip (icon and text), up to 3 expertise tags, work count badge. A coordinator sees a menu for "set manager".
- **Team room (3D):** the 3D floor follows the Org. Every member who has direct reports leads one room and sits in its office, even when that member also reports to someone. Everyone else sits in the room of their direct manager. Rooms follow the order of the reporting tree and fill rows up to 26 m wide. Each row is followed by a 0.9 m hallway, and a free column at the left edge joins the hallways, so every walk reaches the shared areas without crossing a wall. Members with no manager and no reports share one open area, and when nobody is placed under a manager the whole floor is open with no walls. Each room stands in its own room with glass walls, one door in the front wall, and a sign with the lead's name. The lead has a private glass office at the back of the room, with a sign that shows the lead's role (for the root of the tree, this is the CEO office). Members without a team sit in one open area with no walls. Walls come from `wallSegments` in `office/scene/layout.ts`, and a test checks that no walk crosses a wall except through a door.
- **Group header (org):** department name, member count, and a collapse toggle.
- **Status ring (3D):** ring color from the status map. Blocked adds a slow pulse. Reduced motion shows a static ring.
- **Label overlay (3D):** name and status, up to two lines. A speech bubble shows the safe work title only.
- **Help link (3D and org):** an arc from the requester to the recipient. Pending is dashed. Answered fades out after one poll.
- **Camera presets (3D):** overview, team, focus. Each is a button with a text label and a keyboard shortcut.
- **Detail panel:** reuse `MemberPanel` and the work detail. Do not create a second detail view.
- **Connection chip:** live, stale, or disconnected, as in `OfficeStatusChip`.

## 7. Motion & Interaction

- 3D renders on demand. It stops when the tab is hidden or the scene is idle.
- Reduced motion: no walking, no pulse, no camera tween. Positions change by cut.
- Selection in either view highlights the same member in the other view and in the roster.
- Keyboard: arrow keys move between cards or roster rows. Enter opens the detail panel. Escape closes it and returns focus to the trigger.
- Background refresh never moves focus and never resets camera or pan.

## 8. Voice & Brand

- All text goes through `@n8n/i18n`. Vietnamese and English ship together.
- Use plain words: "Đang làm", "Chờ duyệt", "Bị chặn", "Cần hỗ trợ". Use the product word "member", not "robot" or "agent", in user text.
- State the reason for every unavailable state in one sentence.

## 9. Anti-patterns

- Status shown by color alone.
- Any action that exists only in 3D.
- A hex color, a raw px spacing value, or a hardcoded string in a Vue file.
- Prompts, credentials, runtime payloads, or full instructions in labels, bubbles, or the DOM.
- Animation that runs while the tab is hidden or when reduced motion is set.
- Hiding members beyond the 60-character limit without showing the count that were hidden.
- A second data store. Both views read the existing department store.
- Copying a Tailwind class list or a React component as it is. Rewrite it with n8n tokens and Vue.
- A "live" label when the data came from polling. The chip says "stale" after 12 seconds.
