---
phase: 22
slug: e2e-testing-in-ci
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test --reporter=line` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --reporter=line`
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | E2E-01 | e2e | `npx playwright test` | Yes | pending |
| 22-01-02 | 01 | 1 | E2E-01 | ci | `grep -q "e2e:" .github/workflows/ci.yml` | Yes | pending |
| 22-01-03 | 01 | 1 | E2E-02 | e2e | `npx playwright test e2e/settings.spec.ts` | Yes | pending |
| 22-02-01 | 02 | 1 | E2E-02 | e2e | `npx playwright test e2e/intake-logs.spec.ts` | Yes | pending |
| 22-02-02 | 02 | 1 | E2E-02 | e2e | `npx playwright test e2e/medication-wizard.spec.ts` | Yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

No Wave 0 requirements. All spec files either exist or are created by Plan 01 tasks. Both plans are Wave 1 with no inter-plan dependencies.

*Existing infrastructure covers most phase requirements -- Playwright installed, spec files exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser caching speed | E2E-01 | CI timing depends on GitHub Actions runner | Check CI logs for Playwright install time < 30s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
