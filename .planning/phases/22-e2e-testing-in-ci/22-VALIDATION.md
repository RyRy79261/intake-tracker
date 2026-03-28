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
| 22-01-01 | 01 | 1 | E2E-01 | e2e | `npx playwright test` | ✅ | ⬜ pending |
| 22-02-01 | 02 | 2 | E2E-02 | e2e | `npx playwright test e2e/intake-logs.spec.ts` | ✅ | ⬜ pending |
| 22-02-02 | 02 | 2 | E2E-02 | e2e | `npx playwright test e2e/medication-wizard.spec.ts` | ✅ | ⬜ pending |
| 22-02-03 | 02 | 2 | E2E-02 | e2e | `npx playwright test e2e/settings.spec.ts` | ❌ W0 | ⬜ pending |
| 22-03-01 | 03 | 3 | E2E-03 | ci | `gh workflow run ci.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/settings.spec.ts` — stubs for E2E-02 settings persistence tests
- [ ] Verify `playwright.config.ts` has CI-aware webServer config

*Existing infrastructure covers most phase requirements — Playwright installed, spec files exist.*

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
