# Roadmap: Intake Tracker

## Overview

Personal health tracking PWA. v1.0 rebuilt the engineering foundation (strict TypeScript, atomic transactions, analytics, security, tests, push notifications). v1.1 redesigned the intake UI with composable data entries, unified cards, AI substance lookup, and dashboard modernization. v1.2 added a world-class CI pipeline protecting data integrity, E2E testing, supply chain hardening, and performance benchmarking. v1.3 established the deployment lifecycle: automated releases with changelogs, a stable staging environment, protected production deployments, and version observability. v1.4 fixed bugs, UI inconsistencies, and missing functionality identified after the v1.3 production release.

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1–11, 44 plans (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 12–19, 16 plans (shipped 2026-03-27) — [archived](./milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 CI & Data Integrity** — Phases 20–26, 16 plans (shipped 2026-04-04) — [archived](./milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Deployment Lifecycle** — Phases 27–31, 12 plans (shipped 2026-04-05) — [archived](./milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Post-Release Fixes** — Phases 32–39, 17 plans (shipped 2026-04-06) — [archived](./milestones/v1.4-ROADMAP.md)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.3 Deployment Lifecycle (Phases 27–31) — SHIPPED 2026-04-05</summary>

- [x] Phase 27: Release Automation (3/3 plans) — completed 2026-04-04
- [x] Phase 28: Staging Environment (4/4 plans) — completed 2026-04-04
- [x] Phase 29: Deployment Protection (2/2 plans) — completed 2026-04-04
- [x] Phase 30: Observability & Rollback (2/2 plans) — completed 2026-04-04
- [x] Phase 31: Rollback & Documentation Fixes (1/1 plan) — completed 2026-04-05

</details>

<details>
<summary>✅ v1.4 Post-Release Fixes (Phases 32–39) — SHIPPED 2026-04-06</summary>

- [x] Phase 32: Release Pipeline + Weight Settings Infrastructure (2/2 plans) — completed 2026-04-06
- [x] Phase 33: Weight Direct Input (4/4 plans) — completed 2026-04-06
- [x] Phase 34: Food/Sodium Card Restructure (3/3 plans) — completed 2026-04-06
- [x] Phase 35: Preset Fixes (2/2 plans) — completed 2026-04-06
- [x] Phase 36: Neon DB + Vercel Integration Understanding (3/3 plans) — completed 2026-04-06
- [x] Phase 37: Water Entry Label Formatting Bug (1/1 plan) — completed 2026-04-06
- [x] Phase 38: Weight Input Default Value Bug (1/1 plan) — completed 2026-04-06
- [x] Phase 39: Preset Save-and-Log Label Fix (1/1 plan) — completed 2026-04-06

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 27. Release Automation | v1.3 | 3/3 | Complete | 2026-04-04 |
| 28. Staging Environment | v1.3 | 4/4 | Complete | 2026-04-04 |
| 29. Deployment Protection | v1.3 | 2/2 | Complete | 2026-04-04 |
| 30. Observability & Rollback | v1.3 | 2/2 | Complete | 2026-04-04 |
| 31. Rollback & Documentation Fixes | v1.3 | 1/1 | Complete | 2026-04-05 |
| 32. Release Pipeline + Weight Settings | v1.4 | 2/2 | Complete | 2026-04-06 |
| 33. Weight Direct Input | v1.4 | 4/4 | Complete | 2026-04-06 |
| 34. Food/Sodium Card Restructure | v1.4 | 3/3 | Complete | 2026-04-06 |
| 35. Preset Fixes | v1.4 | 2/2 | Complete | 2026-04-06 |
| 36. Neon DB + Vercel Integration Understanding | v1.4 | 3/3 | Complete | 2026-04-06 |
| 37. Water Entry Label Formatting Bug | v1.4 | 1/1 | Complete | 2026-04-06 |
| 38. Weight Input Default Value Bug | v1.4 | 1/1 | Complete | 2026-04-06 |
| 39. Preset Save-and-Log Label Fix | v1.4 | 1/1 | Complete | 2026-04-06 |
| 1. Cross-app Bug Fixes & UX | — | 0/8 | Planning | — |

### Phase 1: Cross-app bug fixes and UX improvements

**Goal:** Fix medication bugs (inventory deduction, progress bar, dose formatting, adherence calculation), improve Rx view (compound details drawer, pill organizer format), restructure Settings (accordion presets replacing modal), and clean up Dashboard/Analytics UX.
**Requirements**: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-20, D-21, D-22, D-23]
**Depends on:** None (new milestone cycle)
**Plans:** 8 plans

Plans:
- [ ] 01-01-PLAN.md — Dashboard quick-nav cleanup, medication tab wrap, export button stack (D-01, D-02, D-17)
- [ ] 01-02-PLAN.md — Dexie v16 schema extension, AI medicine-search mechanismOfAction, wizard persistence (D-13, D-14, D-15)
- [ ] 01-03-PLAN.md — Schedule bug fixes: inventory deduction, progress bar, Mark All time, creation-day filter (D-03, D-04, D-05, D-06)
- [ ] 01-04-PLAN.md — Dose formatting fix and collapsed Rx card display (D-07, D-08, D-09, D-10)
- [ ] 01-05-PLAN.md — Compound Details drawer with AI refresh diff, expandable indication (D-11, D-12)
- [ ] 01-06-PLAN.md — Adherence calculation fix and insight threshold editing (D-16, D-18)
- [ ] 01-07-PLAN.md — Settings restructure: remove dead sections, accordion presets with color coding (D-19, D-20, D-21, D-22, D-23)
- [ ] 01-08-PLAN.md — Final verification checkpoint: build, E2E, human verify all 23 decisions
