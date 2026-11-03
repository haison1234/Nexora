<!--
Sync Impact Report
Version: 1.0.0 -> 2.0.0
Reason: Separate department identity from executor identity. Replace the mandatory
saved-Agent model with a runtime-neutral department model. This changes a core boundary.
Modified principles: repository precedence, reuse, project access, interface, review.
Added sections: Product and Engineering Constraints; Development Workflow; Governance.
Removed sections: none. Prior rules are consolidated below.
Templates synchronized: spec-template.md, plan-template.md, tasks-template.md.
Command synchronized: .specify/commands/speckit.tasks.md validation policy.
Guidance synchronized: AGENTS.md, CLAUDE.md, roadmap, design, research, Specs 002-007.
Deferred work: Owner-adapter implementation, pinned provider checks, and measured UI/renderer validation remain in each plan. Phase 0/1 documents now exist for 002–007.
-->
# AI Department Constitution for the n8n Fork

## Core Principles

### I. Repository Rules and Evidence

All work MUST follow root and package `AGENTS.md`. This constitution supplements those
rules. Plans MUST distinguish observed source behavior from proposed design. Existing
user changes and data MUST be preserved. A source review MUST NOT be reported as a
successful runtime test.

### II. One Department Product

The AI Department MUST own the product language for departments, members, goals,
work, and review. Paperclip, Orca, 3D Claude Hub Remote, and My Office provide selected
concepts. Their full applications MUST NOT become required copies inside the product.
A department member MUST have a stable identity that is separate from its executor.
A member may exist before an executor is configured.

### III. Execution Through Owned Contracts

n8n MUST own workflow execution, integrations, and workflow credentials. Department
members MUST call workflows through authorized capabilities. The department MUST NOT
build a second workflow engine. An executor binding may reference an existing n8n
Agent or an external runtime. Such a binding MUST use a verified owner contract.
Existing execution state, prompts, credentials, checkpoints, and cost ledgers MUST
remain with their owners. The department stores references and safe summaries.

### IV. Project Access and Human Control

The backend MUST enforce project access for records, actions, execution references,
and event delivery. Executor access MUST NOT exceed the initiating user's policy.
Business review MUST remain distinct from tool approval. Native Agent tools MUST use
existing Agent approval controls. External tool decisions MUST use an explicit,
reviewed adapter contract. Unknown, expired, or mismatched approval requests MUST NOT
permit execution. General events MUST omit secrets, raw prompts, and tool arguments.

### V. Shared Interface Before Integration

All stages MUST follow `specs/AI-DEPARTMENT-DESIGN.md`. The department overview and
2D work views MUST provide every core action. The 3D office MUST be optional and read
shared department state. The interface MUST show loading, empty, failed, disconnected,
and stale states. It MUST support keyboard access, reduced motion, and localization.

### VI. Durable Work and Verifiable Changes

Work transitions MUST have an actor, time, prior state, and new state. Repeated start
requests MUST NOT create duplicate active attempts. Late events MUST NOT rewrite a
terminal attempt. Repository boundaries and migrations MUST follow n8n rules. Behavior
changes MUST have focused checks appropriate to their risk and the owning package.
Documentation-only changes require document review and `git diff --check`, not code tests.

## Product and Engineering Constraints

- Keep the initial product in this repository and within one project context at a time.
- Keep hosting inside n8n as the current deployment proposal. It is not a dependency
  on the workflow canvas as the department's primary interface.
- Reuse the existing TypeScript, Vue, pnpm, module, design-system, and i18n conventions.
- Keep TypeORM within persistence. Use approved migration and transaction mechanisms.
- Keep provider control and filesystem access outside the n8n server process.
- Do not promise unattended autonomous management, organization-wide budgets, a new
  credential store, or multiple remote n8n instances in the first release.
- Product assumptions in a draft spec remain reviewable. They are not approved features.

## Development Workflow

1. Review the constitution, shared design, roadmap, and active feature spec.
2. Define actors, scope, user stories, acceptance cases, edge cases, and measurable outcomes.
3. Review the requirements-quality checklist. Record assumptions and remaining gaps.
4. Research current source contracts in Phase 0. Record evidence and rejected alternatives.
5. Complete Phase 1 data model, interface contracts, and quickstart where applicable.
6. Recheck constitution gates. Generate story-based tasks only after blockers are resolved.
7. Implement the accepted scope. Run focused validation and update affected documents.
8. Run cross-artifact analysis after `tasks.md` exists. Do not claim task coverage before then.

## Governance

This is the sole Spec Kit constitution for this fork. `AGENTS.md` defines repository
policy. `CLAUDE.md` explains architecture and workflow. Feature specs define product
behavior. Plans define implementation choices. Tasks define the accepted work order.

Amendments MUST state the reason, affected principles, compatibility impact, and files
to synchronize. Use a MAJOR version for removed or redefined principles, a MINOR version
for added obligations, and a PATCH version for clarification. Record the amendment in
an HTML Sync Impact Report and update the last-amended date. Do not invent extra approval
roles beyond repository policy and the user's authorization.

Every feature plan MUST record each principle as pass, not applicable with reason, or
blocked with a resolution. An unresolved security, ownership, or contract decision
blocks tasks for the affected slice. A plan MUST NOT label a pending gate as passed.

**Version**: 2.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-11-02
