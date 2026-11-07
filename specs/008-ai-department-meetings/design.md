# AI Department Meetings — 2D Interface Design

**Status**: Proposed extension of [shared design](../AI-DEPARTMENT-DESIGN.md). No UI is
implemented by this document.

## Navigation and list

Add **Meetings** within the existing AI Department project navigation. It is a first-class
2D surface and does not depend on the Office view. The list shows topic, department,
state, participant progress, last update, and the next permitted action. Filters include
department, state, and attention. List summaries omit protected source and minutes text
when current access is missing.

Empty state explains who can create a meeting and how to select a department. Readers do
not see create or edit actions. Loading, failed read, disconnected, stale, and partial
participant failure states use the shared interface rules.

## Meeting detail

```text
Breadcrumb / Meetings / Topic                         State + freshness
Topic and desired outcome                              Cancel / permitted action
Participants: member, role, response state, safe result
Sources: authorized references and snapshot version
Minutes: draft revision, source contribution links, decisions
Contribution comparison: stance, key points, risks, proposed action by member
Action items: proposed → approved → create work / decline → linked backlog work
Activity: actor, safe action, target, time
```

Show the business meeting state separately from each owner invocation state. Pending
stop and unknown outcomes remain visible and disable retry/start. Exclusions show the
coordinator's reason. A quota or provider failure is a failure state, not an empty answer.
The facilitator's minutes remain draft until a coordinator approves them.

## Interaction rules

- Create a draft in a dialog or page with topic, desired outcome, department, 2–10 active
  members, facilitator, optional goal/work references, authorized sources, and optional
  decisions approved in earlier meetings. Prior minutes and contributions are not selectable.
- Offer purpose templates such as **Decision**, **Risk review**, and **Ideation**. Each
  template prefills short questions and structured output guidance. Coordinators can edit
  the fields before start. Templates do not change participant authority or tool policy.
- Start presents the frozen briefing, participant roles, source versions, and tool mode
  for review. After start, edit controls are unavailable; create a new meeting to change
  the set. Show the participant count and the estimate `up to N + 1 model calls` beside
  the start action. State that this excludes explicit retries and is not a price estimate.
- Show the quorum rule before start: `ceil(2N/3)` accepted contributions. Explain that
  collection closes at quorum or at the deadline when at least one contribution exists.
  At synthesis, list members without accepted contributions and their last known outcome.
- Each contribution is capped at 1,000 output tokens and 4,000 characters. Show only the
  bounded contribution in meeting details and synthesis. Mark truncation when it occurs.
- Render accepted contributions in a comparison table with members as columns and stance,
  key points, risks, and proposed action as rows. Make stance text explicit; do not rely
  on color alone.
- In minutes, show opposing positions together with their member attribution. Do not
  replace conflicting positions with a consensus label unless the coordinator approves it.
- Retry and cancel show pending owner state. Reconnect fetches current state and never
  repeats a command.
- Approval freezes a minutes revision. Each action item has separate **Create work** and
  **Decline** actions. A created item links to backlog and offers a separate Spec 003
  start action only when the user has permission.
- Conversion with unknown response shows recovery status and reuses the same command
  identity. It never presents a second create action as if the first had failed.
- Source denial hides protected bodies and clears cached content. Keep safe meeting
  metadata where project access permits.

## Accessibility and responsive behavior

Use semantic headings, labeled fields, visible focus, keyboard-operable participant
selection and dialogs, focus return, and live announcements for meaningful state changes.
Do not announce every participant token or background poll. Support English and Vietnamese,
reduced motion, and 360 CSS pixel width without horizontal page scrolling. On narrow
screens, stack participants, minutes, action items, and activity in reading order. Keep
state text beside icons and colors. Disabled actions include a visible reason.
