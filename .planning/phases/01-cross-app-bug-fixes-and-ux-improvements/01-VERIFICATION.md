---
status: passed
phase: 01-cross-app-bug-fixes-and-ux-improvements
verified_at: 2026-04-08
must_haves_verified: 23
must_haves_total: 23
human_verification:
  - "Visual check: quick-nav footer no longer shows Caffeine/Alcohol shortcuts (D-01)"
  - "Visual check: medication tabs wrap to second row on narrow screens (D-02)"
  - "Visual check: dose formatting shows '1/2 tablet (6.25mg)' format (D-07, D-10)"
  - "Visual check: brand name appears next to compound name in schedule (D-08)"
  - "Visual check: collapsed Rx card shows pill amount and frequency (D-09)"
  - "Visual check: indication text truncates and expands on tap (D-11)"
  - "Visual check: Compound Details drawer opens and shows compound data (D-12)"
  - "Visual check: export buttons stacked vertically (D-17)"
  - "Visual check: insight threshold gear icon and inline editing (D-18)"
  - "Visual check: accordion preset sections with color coding (D-20, D-22)"
  - "Functional check: deleting a preset shows undo toast (D-21, D-23)"
  - "Functional check: Mark All dialog auto-populates correct time (D-04)"
  - "Functional check: taking a dose creates consumed inventory transaction (D-05)"
  - "Functional check: progress bar shows correct taken/total counts (D-06)"
---

# Phase 01 Verification: Cross-app Bug Fixes & UX Improvements

## Goal Achievement

Phase goal: Fix medication bugs, improve Rx view, restructure Settings, and clean up Dashboard/Analytics UX across 23 decisions.

**Result: PASSED** -- All 23 decisions verified against the codebase.

## Must-Have Verification

| ID | Decision | Status | Evidence |
|----|----------|--------|----------|
| D-01 | Remove caffeine/alcohol from quick-nav | PASS | `NAV_EXCLUDED` filter in quick-nav-footer.tsx |
| D-02 | Medication tabs wrap | PASS | `flex-wrap` class on tab bar in med-footer.tsx |
| D-03 | Creation-day dose filter | PASS | createdAt comparison in dose-schedule-service.ts |
| D-04 | Mark All time auto-populate | PASS | `markAllTarget?.time` as defaultTime in schedule-view.tsx |
| D-05 | Inventory deduction on dose take | PASS | `consumed` transaction type in dose-log-service.ts |
| D-06 | Progress bar counts | PASS | `computeProgress` in medication-ui-utils.ts |
| D-07 | Parenthetical dose format | PASS | `formatPillCount(pillsPerDose) (dosageMg unit)` in dose-row.tsx |
| D-08 | Brand name in schedule | PASS | `inventory?.brandName` display in dose-row.tsx |
| D-09 | Collapsed Rx shows pill/frequency | PASS | `pillLabel` + `frequencyLabel` in prescription-card.tsx |
| D-10 | Rx sub-card dose format | PASS | Parenthetical format in prescription-card.tsx mini-card |
| D-11 | Expandable indication | PASS | `line-clamp-2` + toggle in compound-card-expanded.tsx |
| D-12 | Compound Details drawer | PASS | compound-details-drawer.tsx with AI refresh diff |
| D-13 | Compound fields on Prescription | PASS | drugClass, mechanismOfAction, etc. in db.ts Prescription |
| D-14 | AI returns mechanismOfAction | PASS | Field in route.ts tool schema and MedicineSearchResult |
| D-15 | Wizard persists compound data | PASS | AI data passed through in add-medication-wizard.tsx |
| D-16 | Adherence excludes future doses | PASS | `countableSlots` filter in analytics-service.ts |
| D-17 | Export buttons stacked | PASS | `flex-col` layout in export-controls.tsx |
| D-18 | Editable insight thresholds | PASS | insightThresholds in settings-store.ts, gear icon in insights-tab.tsx |
| D-19 | Remove dead substance settings | PASS | SubstanceSettingsSection no longer imported in settings page |
| D-20 | Accordion preset sections | PASS | preset-accordion-section.tsx with 4 categories |
| D-21 | Delete-only presets | PASS | X button per preset, no edit UI |
| D-22 | Color-coded presets | PASS | text-caffeine, text-alcohol, text-orange-500 classes |
| D-23 | Delete any preset including defaults | PASS | deleteLiquidPreset works on all presets by ID |

## Automated Checks

| Check | Status |
|-------|--------|
| pnpm lint | PASS |
| pnpm build | PASS |
| vitest (417 tests) | PASS |
| E2E (19 tests) | SKIP (Privy auth gate, pre-existing) |

## Code Review

Status: clean (3 info-level observations, 0 critical/warning)
Report: 01-REVIEW.md

## Human Verification Required

14 visual/functional checks listed in frontmatter. These require browser verification to confirm rendering and interaction behavior match intent.
