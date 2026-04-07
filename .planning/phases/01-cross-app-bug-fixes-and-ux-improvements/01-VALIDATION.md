---
phase: 1
slug: cross-app-bug-fixes-and-ux-improvements
status: draft
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
| 1-01-01 | 01 | 1 | D-01 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/dashboard.spec.ts` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | D-02, D-17 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts && npx playwright test e2e/history.spec.ts` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | D-13 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 1 | D-14, D-15 | T-1-02 | Zod schema validation on AI response | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-03-01 | 03 | 1 | D-05 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-03-02 | 03 | 1 | D-03, D-04, D-06 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-04-01 | 04 | 1 | D-07, D-08 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-04-02 | 04 | 1 | D-09, D-10 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-05-01 | 05 | 2 | D-11, D-12 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-05-02 | 05 | 2 | D-12 | T-1-06, T-1-07 | React auto-escaping, user accept/reject | e2e | `pnpm lint && npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-06-01 | 06 | 1 | D-16 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/history.spec.ts` | ✅ | ⬜ pending |
| 1-06-02 | 06 | 1 | D-18 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/history.spec.ts` | ✅ | ⬜ pending |
| 1-07-01 | 07 | 1 | D-20, D-21, D-22, D-23 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/settings.spec.ts` | ✅ | ⬜ pending |
| 1-07-02 | 07 | 1 | D-19, D-20 | — | N/A | e2e | `pnpm lint && npx playwright test e2e/settings.spec.ts` | ✅ | ⬜ pending |
| 1-08-01 | 08 | 3 | D-01–D-23 | — | N/A | e2e | `pnpm lint && pnpm build && pnpm test:e2e` | ✅ | ⬜ pending |
| 1-08-02 | 08 | 3 | D-01–D-23 | — | N/A | manual | Human verification checkpoint | — | ⬜ pending |

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

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
