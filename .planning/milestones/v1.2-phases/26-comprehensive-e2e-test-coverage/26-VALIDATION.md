---
phase: 26
slug: comprehensive-e2e-test-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test e2e/{spec}.spec.ts` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test e2e/{changed-spec}.spec.ts`
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | TBD | e2e | `npx playwright test e2e/auth.spec.ts` | ❌ W0 | ⬜ pending |
| 26-02-01 | 02 | 1 | TBD | e2e | `npx playwright test e2e/dashboard.spec.ts` | ❌ W0 | ⬜ pending |
| 26-03-01 | 03 | 2 | TBD | e2e | `npx playwright test e2e/medications.spec.ts` | ❌ W0 | ⬜ pending |
| 26-04-01 | 04 | 2 | TBD | e2e | `npx playwright test e2e/history.spec.ts` | ❌ W0 | ⬜ pending |
| 26-05-01 | 05 | 2 | TBD | e2e | `npx playwright test e2e/settings.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Rename `e2e/auth-bypass.spec.ts` → `e2e/auth.spec.ts`
- [ ] Rename `e2e/intake-logs.spec.ts` → `e2e/dashboard.spec.ts`
- [ ] Rename `e2e/medication-wizard.spec.ts` → `e2e/medications.spec.ts`
- [ ] `e2e/history.spec.ts` — new file for analytics/charts tests

*Existing Playwright infrastructure covers all framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI pipeline green with Privy secrets | D-10 | Requires GitHub Actions runner | Push branch, verify CI E2E job passes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
