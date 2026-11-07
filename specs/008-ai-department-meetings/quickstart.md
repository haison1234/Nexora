# Quickstart: AI Department Meetings

**Status**: Design validation guide. No meeting runtime is currently available.

## Controlled design walkthrough

1. Use one project with an active department and four active members. Leave one member
   without an executor to check unavailable-state handling.
2. Create a draft from a purpose template or custom topic. Include a prior coordinator-
   approved decision and verify the source meeting/version and approver are shown. Confirm
   that prior minutes and contributions are not selectable.
3. Review the frozen briefing and participant roles. Start only when the Agents owner
   contract is implemented and enabled for the test environment.
4. Verify the UI shows up to five model calls for four participants, excluding retries.
   Exercise valid structured responses, malformed output, and disagreement between members.
   Confirm comparison view and minutes attribute each position without inventing consensus.
   Exercise full participation, quorum with one missing response, and deadline synthesis
   with at least one contribution. Confirm the accepted set freezes and lists absentees.
5. Verify each participant output stops at 1,000 tokens and at 4,000 characters, and that
   synthesis receives only the bounded accepted text. Test synthesis success and failure.
   On failure, verify one explicit retry or
   coordinator-written minutes. Keep all generated text in draft.
6. Approve minutes, then convert one action item and decline another. Verify converted
   work is backlog with review required and has not started.
7. Interrupt the process after work creation but before meeting linkage. Resolve the same
   actor/request ID and verify the meeting links the original work item once.
8. Cancel an active invocation, restart the service, and verify cancellation stays
   pending until Agents proves terminal state. Confirm late output cannot change minutes.
9. Revoke project or source access. Verify protected bodies disappear, commands fail
   closed, and no result is published. Restore access and refresh authoritative state.
10. Attempt department/member archive during collecting and cancelling states. Verify the
    shared admission guard blocks it until terminal completion.

## Before runtime acceptance

- Agents owner approves and implements the standalone invocation, lookup, tools, stop,
  sequence, access, and result-delivery contract.
- Work owner provides a narrow command receipt resolver for uncertain create outcomes.
- Directory owner confirms meeting-guard registration under the shared admission fence.
- Product owner accepts participant limits, deadlines, and tool fallback.
- Product owner accepts the proposed quorum, output caps, and call-count estimate.
- Run acceptance in English and Vietnamese with keyboard-only navigation, reduced motion,
  360 CSS pixel viewport, and Office disabled.

Do not use a controlled mock as evidence of provider behavior, restart recovery, or owner
stop proof. Do not enable dispatch while any owner gate is open.
