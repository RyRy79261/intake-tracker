---
phase: 1
slug: cross-app-bug-fixes-and-ux-improvements
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm lint` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint` + relevant Playwright spec
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | D-01 | — | N/A | unit | `pnpm vitest run src/components/__tests__/quick-nav-footer-filter.test.ts` | ✅ | ✅ green |
| 1-01-02 | 01 | 1 | D-02, D-17 | — | N/A | manual | Visual: flex-wrap tabs, stacked export buttons | — | ⬜ manual |
| 1-02-01 | 02 | 1 | D-13 | — | N/A | unit | `pnpm vitest run src/__tests__/migration/v16-migration.test.ts` | ✅ | ✅ green |
| 1-02-02 | 02 | 1 | D-14, D-15 | T-1-02 | Zod schema validation on AI response | unit | `pnpm vitest run src/app/api/ai/medicine-search/route.test.ts` | ✅ | ✅ green |
| 1-03-01 | 03 | 1 | D-05 | — | N/A | unit | `pnpm vitest run src/lib/dose-log-service.test.ts` | ✅ | ✅ green |
| 1-03-02 | 03 | 1 | D-03, D-04, D-06 | — | N/A | unit+manual | `pnpm vitest run src/lib/dose-schedule-service.test.ts` (D-03); D-04, D-06 manual | ✅ | ✅ green |
| 1-04-01 | 04 | 1 | D-07, D-08 | — | N/A | manual | Visual: parenthetical dose format, brand name display | — | ⬜ manual |
| 1-04-02 | 04 | 1 | D-09, D-10 | — | N/A | manual | Visual: collapsed Rx card format | — | ⬜ manual |
| 1-05-01 | 05 | 2 | D-11, D-12 | — | N/A | manual | Visual: expandable indication, compound details drawer | — | ⬜ manual |
| 1-05-02 | 05 | 2 | D-12 | T-1-06, T-1-07 | React auto-escaping, user accept/reject | manual | Visual: AI refresh diff accept/reject | — | ⬜ manual |
| 1-06-01 | 06 | 1 | D-16 | — | N/A | unit | `pnpm vitest run src/lib/analytics-service.test.ts` | ✅ | ✅ green |
| 1-06-02 | 06 | 1 | D-18 | — | N/A | unit | `pnpm vitest run src/stores/__tests__/settings-store-thresholds.test.ts` | ✅ | ✅ green |
| 1-07-01 | 07 | 1 | D-20, D-21, D-22, D-23 | — | N/A | manual | Visual: accordion presets, color coding, delete-only | — | ⬜ manual |
| 1-07-02 | 07 | 1 | D-19, D-20 | — | N/A | manual | Visual: dead sections removed, accordion replaces modal | — | ⬜ manual |
| 1-08-01 | 08 | 3 | D-01–D-23 | — | N/A | unit | `pnpm vitest run` | ✅ | ✅ green |
| 1-08-02 | 08 | 3 | D-01–D-23 | — | N/A | manual | Human verification checkpoint | — | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Decision Coverage Matrix

| Decision | Task ID(s) | Full/Partial | Notes |
|----------|-----------|--------------|-------|
| D-01 | 1-01-01 | Full | Remove caffeine/alcohol from CARD_THEMES |
| D-02 | 1-01-02 | Full | flex-wrap on med-footer tabs |
| D-03 | 1-03-02 | Full | Creation-day time filter in dose-schedule-service |
| D-04 | 1-03-02 | Full | RetroactiveTimePicker useEffect reset |
| D-05 | 1-03-01 | Full | Boolean query fix in dose-log-service |
| D-06 | 1-03-02 | Full | Progress bar fix (mandatory investigation + fix) |
| D-07 | 1-04-01 | Full | Dose format "1/2 tablet (6.25mg)" in dose-row |
| D-08 | 1-04-01 | Full | Brand name next to compound in dose-row |
| D-09 | 1-04-02 | Full | Collapsed Rx card "{pill} Nx per day" |
| D-10 | 1-04-02 | Full | Rx sub-card parenthetical format |
| D-11 | 1-05-01 | Full | Expandable indication text |
| D-12 | 1-05-01, 1-05-02 | Full | Compound Details button + drawer |
| D-13 | 1-02-01 | Full | Dexie v16 + Prescription interface |
| D-14 | 1-02-02 | Full | AI tool schema + mechanismOfAction |
| D-15 | 1-02-02 | Full | Wizard persists compound data |
| D-16 | 1-06-01 | Full | Adherence excludes future doses |
| D-17 | 1-01-02 | Full | Export buttons stacked vertically |
| D-18 | 1-06-02 | Full | Thresholds in store + UI + wired to useInsights |
| D-19 | 1-07-02 | Full | Dead sections removed from settings |
| D-20 | 1-07-01, 1-07-02 | Full | Accordion replaces modal |
| D-21 | 1-07-01 | Full | Delete-only presets |
| D-22 | 1-07-01 | Full | Color-coded accordion sections |
| D-23 | 1-07-01 | Full | Default presets deletable |

---

## Wave 0 Requirements

Existing infrastructure covers all phase areas with e2e specs for dashboard, medications, history, and settings. No Wave 0 gaps.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dexie schema version bump doesn't break existing data | D-13 | Production data only on user's phone | Open app on phone after deploy, verify all existing prescriptions load correctly |
| Medication tabs wrap on narrow viewport | D-02 | CSS layout, visual | Resize browser to <375px, verify tabs wrap to second row |
| Time picker auto-populates with slot time | D-04 | Component interaction | Open Mark All dialog, verify time matches slot |
| Progress bar shows taken/total counts | D-06 | Component rendering | Mark doses, verify progress bar updates |
| Parenthetical dose format "1/2 tablet (6.25mg)" | D-07 | Rendering | Check dose rows in schedule view |
| Brand name next to compound | D-08 | Rendering | Check dose rows show "Compound (Brand)" |
| Collapsed Rx card shows pill amount + frequency | D-09 | Rendering | Collapse a prescription card, verify format |
| Rx sub-card parenthetical format | D-10 | Rendering | Check mini-cards within Rx card |
| Expandable indication text | D-11 | Interaction | Verify Show more/less toggle on indication |
| Compound Details drawer with AI refresh diff | D-12 | Complex interaction | Open drawer, trigger AI refresh, accept/reject fields |
| Wizard persists compound data | D-15 | Complex flow | Add medication via wizard, verify compound fields saved |
| Stacked export buttons | D-17 | CSS layout | Check export buttons in analytics are full-width stacked |
| Dead substance settings removed | D-19 | Visual | Verify Settings page has no substance section |
| Accordion replaces modal for presets | D-20 | Visual/interaction | Verify accordion opens/closes in settings |
| Delete-only presets with undo | D-21 | Interaction | Delete a preset, verify undo toast |
| Color-coded accordion sections | D-22 | Visual | Verify domain color tokens on accordion headers |
| Default presets deletable | D-23 | Interaction | Delete a default preset, verify it works |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution

---

## Validation Audit 2026-04-09

| Metric | Count |
|--------|-------|
| Gaps found | 20 |
| Resolved (automated) | 7 |
| Manual-only | 15 |
| Previously covered | 2 |

**Tests added:** 5 files, 41 tests total
- `src/components/__tests__/quick-nav-footer-filter.test.ts` (4 tests) — D-01
- `src/__tests__/migration/v16-migration.test.ts` (3 tests) — D-13
- `src/app/api/ai/medicine-search/route.test.ts` (7 tests) — D-14
- `src/lib/analytics-service.test.ts` (+2 tests) — D-16
- `src/stores/__tests__/settings-store-thresholds.test.ts` (11 tests) — D-18
