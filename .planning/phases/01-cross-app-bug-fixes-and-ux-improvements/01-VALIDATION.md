---
phase: 1
slug: cross-app-bug-fixes-and-ux-improvements
status: draft
nyquist_compliant: false
wave_0_complete: false
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

- **After every task commit:** Run `pnpm lint`
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | D-01 | — | N/A | e2e | `npx playwright test e2e/dashboard.spec.ts` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | D-05 | — | N/A | e2e | `npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | D-06 | — | N/A | e2e | `npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | D-07 | — | N/A | e2e | `npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | D-13 | — | N/A | manual | N/A (production data on phone) | - | ⬜ pending |
| 1-02-02 | 02 | 1 | D-14 | T-1-01 | Zod schema validation on AI response | e2e | `npx playwright test e2e/medications.spec.ts` | ✅ | ⬜ pending |
| 1-03-01 | 03 | 2 | D-16 | — | N/A | e2e | `npx playwright test e2e/history.spec.ts` | ✅ | ⬜ pending |
| 1-03-02 | 03 | 2 | D-17 | — | N/A | e2e | `npx playwright test e2e/history.spec.ts` | ✅ | ⬜ pending |
| 1-04-01 | 04 | 2 | D-19-23 | — | N/A | e2e | `npx playwright test e2e/settings.spec.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase areas with e2e specs for dashboard, medications, history, and settings.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dexie schema version bump doesn't break existing data | D-13 | Production data only on user's phone | Open app on phone after deploy, verify all existing prescriptions load correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
