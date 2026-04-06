# Roadmap: Intake Tracker

## Overview

Personal health tracking PWA. v1.0 rebuilt the engineering foundation (strict TypeScript, atomic transactions, analytics, security, tests, push notifications). v1.1 redesigned the intake UI with composable data entries, unified cards, AI substance lookup, and dashboard modernization. v1.2 added a world-class CI pipeline protecting data integrity, E2E testing, supply chain hardening, and performance benchmarking. v1.3 established the deployment lifecycle: automated releases with changelogs, a stable staging environment, protected production deployments, and version observability. v1.4 fixes bugs, UI inconsistencies, and missing functionality identified after the v1.3 production release.

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1–11, 44 plans (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 12–19, 16 plans (shipped 2026-03-27) — [archived](./milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 CI & Data Integrity** — Phases 20–26, 16 plans (shipped 2026-04-04) — [archived](./milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Deployment Lifecycle** — Phases 27–31, 12 plans (shipped 2026-04-05) — [archived](./milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 Post-Release Fixes** — Phases 32–38 (in progress)

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

### 🚧 v1.4 Post-Release Fixes (In Progress)

- [x] **Phase 32: Release Pipeline + Weight Settings Infrastructure** - Fix release-please PR permissions and establish correct weight increment/rounding foundations (completed 2026-04-06)
- [x] **Phase 33: Weight Direct Input** - Enable tap-to-type keyboard entry for weight values (completed 2026-04-06)
- [x] **Phase 34: Food/Sodium Card Restructure** - Reposition sodium display, use descriptions as titles, merge history sections (completed 2026-04-06)
- [x] **Phase 35: Preset Fixes** - AI-powered substance content on preset creation and reliable preset deletion (completed 2026-04-06)
- [x] **Phase 36: Neon DB + Vercel Integration Understanding** - Research how Vercel receives Neon branch DB connection details via the integration (completed 2026-04-06)
- [x] **Phase 37: Water Entry Label Formatting Bug** - Fix labels showing "preset:manual" and "substance:{id}" instead of clean text (completed 2026-04-06)
- [x] **Phase 38: Weight Input Default Value Bug** - Fix weight input defaulting to 70 instead of last recorded value (completed 2026-04-06)

## Phase Details

### Phase 32: Release Pipeline + Weight Settings Infrastructure
**Goal**: Release-please can create PRs again and weight tracking uses correct decimal precision throughout the settings and display pipeline
**Depends on**: Nothing (first phase of v1.4; builds on v1.3 infrastructure)
**Requirements**: REL-01, WGT-02, WGT-03
**Success Criteria** (what must be TRUE):
  1. Running the release-please GitHub Action after a conventional commit merge to main successfully opens or updates a release PR (no permission errors)
  2. User can navigate to Settings and see a weight increment control that defaults to 0.05 and persists the chosen value across app restarts
  3. Adjusting weight via increment buttons produces values rounded to 0.05 precision (e.g., 70.00, 70.05, 70.10 -- not 70.0, 70.1)
  4. The settings-helpers utility correctly stores and retrieves decimal values (parseFloat, not parseInt)
**Plans**: TBD

### Phase 33: Weight Direct Input
**Goal**: Users can enter weight values directly via keyboard instead of only using increment/decrement buttons
**Depends on**: Phase 32 (correct increment step and rounding precision must be in place)
**Requirements**: WGT-01
**Success Criteria** (what must be TRUE):
  1. User can tap the weight value on the dashboard card and a numeric keyboard appears (mobile) or the field becomes editable (desktop)
  2. Typing a decimal value (e.g., 71.35) and confirming saves the weight record with that exact value
  3. The entered value is rounded to the configured increment precision (0.05 by default) before saving
**Plans**: TBD
**UI hint**: yes

### Phase 34: Food/Sodium Card Restructure
**Goal**: The food/sodium card displays information consistently with other dashboard cards and provides a single unified history view
**Depends on**: Phase 32 (release pipeline functional for shipping fixes)
**Requirements**: FOOD-01, FOOD-02, FOOD-03
**Success Criteria** (what must be TRUE):
  1. Sodium amount is displayed in the top-right area of the food card, matching the positioning pattern used by other intake cards (water, caffeine)
  2. When a food entry has a description, that description appears as the primary title/label for the entry (not a generic "Food" or "Eating" label)
  3. A single history section at the bottom of the card shows all food and sodium entries in chronological order, each displaying date, amount, and a truncated name/description
  4. Editing or deleting an entry from the merged history correctly routes to the right mutation (eating record vs sodium record)
**Plans**: TBD
**UI hint**: yes

### Phase 35: Preset Fixes
**Goal**: Coffee presets are created with accurate substance data and can be reliably removed from the preset grid
**Depends on**: Nothing (independent of other v1.4 phases)
**Requirements**: PRES-01, PRES-02
**Success Criteria** (what must be TRUE):
  1. When user creates a new coffee preset and provides a name, the AI substance-lookup auto-populates caffeine and alcohol content per 100ml
  2. User can delete a preset from the preset grid and the preset disappears from the UI immediately without requiring a page refresh or navigation
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 32 → 33 → 34 → 35 → 36 → 37 → 38

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 27. Release Automation | v1.3 | 3/3 | Complete | 2026-04-04 |
| 28. Staging Environment | v1.3 | 4/4 | Complete | 2026-04-04 |
| 29. Deployment Protection | v1.3 | 2/2 | Complete | 2026-04-04 |
| 30. Observability & Rollback | v1.3 | 2/2 | Complete | 2026-04-04 |
| 31. Rollback & Documentation Fixes | v1.3 | 1/1 | Complete | 2026-04-05 |
| 32. Release Pipeline + Weight Settings Infrastructure | v1.4 | 2/2 | Complete    | 2026-04-06 |
| 33. Weight Direct Input | v1.4 | 4/4 | Complete   | 2026-04-06 |
| 34. Food/Sodium Card Restructure | v1.4 | 3/3 | Complete    | 2026-04-06 |
| 35. Preset Fixes | v1.4 | 2/2 | Complete    | 2026-04-06 |
| 36. Neon DB + Vercel Integration Understanding | v1.4 | 3/3 | Complete    | 2026-04-06 |
| 37. Water Entry Label Formatting Bug | v1.4 | 1/1 | Complete   | 2026-04-06 |
| 38. Weight Input Default Value Bug | v1.4 | 1/1 | Complete    | 2026-04-06 |

### Phase 36: Neon DB + Vercel Integration Understanding

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Nothing (independent research phase)
**Plans:** 4/4 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 36 to break down) (completed 2026-04-06)

### Phase 37: Water Entry Label Formatting Bug

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Nothing (independent bug fix)
**Plans:** 1/1 plans complete

Plans:
- [ ] TBD (run /gsd-plan-phase 37 to break down)

### Phase 38: Weight Input Default Value Bug

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Nothing (independent bug fix)
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 38 to break down) (completed 2026-04-06)
