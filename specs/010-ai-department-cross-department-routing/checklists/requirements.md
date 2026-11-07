# Requirements Quality Checklist: AI Department Cross-Department Routing

**Purpose**: Review the clarity, completeness, consistency, and testability of Spec 010 before planning.
**Created**: 2026-11-08
**Feature**: [spec.md](../spec.md)

**Note**: These checks review requirements quality. They do not verify implementation.
**Review Ownership**: Leave items unchecked until a reviewer confirms the requirement is clear and complete.

## Requirement Completeness

- [ ] CHK001 Are all actors, project scopes, and Agent restrictions stated? [Spec: Scope and Actors; Permission Boundary; FR-001, FR-008, FR-011]
- [ ] CHK002 Are allowed source states and all conditions that reject referral stated? [Spec: D14; US1; FR-005; SC-009]
- [ ] CHK003 Are direct-link behavior and upstream/downstream completion responsibilities clear? [Spec: What A Referral Means; D8; FR-012, FR-016]
- [ ] CHK004 Are chain root identity, per-department limits, and A → B → A behavior unambiguous? [Spec: D17; FR-014; SC-011]
- [ ] CHK005 Are pending eligibility and wake behavior on referral and fence release defined? [Spec: D15; FR-006; SC-005, SC-012]
- [ ] CHK006 Is archive behavior defined for every department in an unresolved referral chain? [Spec: D16; FR-015; SC-010]

## Requirement Clarity and Consistency

- [ ] CHK007 Does the spec distinguish the required item-level fence behavior from the technical integration still to be researched in the plan? [Spec: What A Referral Means; FR-005, FR-006]
- [ ] CHK008 Are receiving review policy and copied fields consistent across decisions, requirements, and scenarios? [Spec: D6, D7; FR-003; US1]
- [ ] CHK009 Are request ID identity, cross-operation reuse, replay, and conflict behavior consistent with the existing receipt contract? [Spec: D11; FR-004]
- [ ] CHK010 Are revision bumps defined for referral creation, receiving state changes, ancestor fence changes, and receiving-side comments/help? [Spec: D12; FR-013]
- [ ] CHK011 Do snapshots and activity entries avoid exposing data outside the stated project reader boundary? [Spec: Permission Boundary; Activity Entries; Key Entities]

## Suggestion and Acceptance Quality

- [ ] CHK012 Are token normalization, stop words, diacritic handling, multi-token tags, deduplication, and scoring objectively specified? [Spec: Suggestion Rules; D18, D19]
- [ ] CHK013 Are eligible suggestion departments and tie-breaking rules stated, including source and archived departments? [Spec: Suggestion Rules; US2]
- [ ] CHK014 Is the SC-006 evaluation set reproducible, independently labelled, and measured before routing code is merged? [Spec: SC-006]
- [ ] CHK015 Are success criteria measurable without treating a proposed suggestion threshold as approved? [Spec: SC-001–SC-012]

## Edge Cases and Dependencies

- [ ] CHK016 Are concurrent referral, transaction rollback, and chain conflict outcomes specified? [Spec: Edge Cases; FR-004, FR-005, FR-014; SC-008]
- [ ] CHK017 Are source cancellation, downstream cancellation, and source fence release outcomes consistent? [Spec: What A Referral Means; Edge Cases; FR-006, FR-012]
- [ ] CHK018 Are project-level permission assumptions and the need to re-review behavior if department-level access is added explicit? [Spec: Permission Boundary; Assumptions]

## Referral Concurrency and Recovery

- [ ] CHK019 Are ancestor fences kept active when an intermediate item is cancelled but descendants remain nonterminal? [Spec: D20; FR-012, FR-016; SC-013]
- [ ] CHK020 Are explicit resume actions for backlog and ready sources distinguished, with a new eligibility generation required for each? [Spec: D15, D21; FR-018; SC-015]
- [ ] CHK021 Does referral reject a stale source version using the Spec 003 conflict behavior? [Spec: D22; FR-005, FR-017; SC-014]
- [ ] CHK022 Are no-match responses limited to eligible departments and defined when that set is empty? [Spec: US2 acceptance scenario 4; D18]
- [ ] CHK023 Are stop-word contents, empty-tag behavior, and deterministic reason ordering fixed before baseline measurement? [Spec: D23; Suggestion Rules; FR-019; SC-016]
- [ ] CHK024 Does archive protection cover every department in every link, including closed links, while any link in its chain remains open? [Spec: D16; FR-015; SC-010]

- [ ] CHK025 Do ancestor fence changes bump each affected department revision and send the required invalidation without exposing descendant reports? [Spec: FR-013; SC-017]
