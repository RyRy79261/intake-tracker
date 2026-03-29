---
phase: 22
slug: e2e-testing-in-ci
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.58.2 + Vitest 4.0.18 (config validation) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test --reporter=line` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30s (E2E), ~500ms (config validation) |

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
| 22-01-01 | 01 | 1 | E2E-01, E2E-03 | unit (static) | `pnpm exec vitest run src/__tests__/playwright-config.test.ts` | ✅ 9 tests | ✅ green |
| 22-01-02 | 01 | 1 | E2E-01 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ 8 tests (E2E block) | ✅ green |
| 22-01-03 | 01 | 1 | E2E-02 | e2e | `npx playwright test e2e/settings.spec.ts` | ✅ settings.spec.ts | ✅ green |
| 22-02-01 | 02 | 1 | E2E-02 | e2e | `npx playwright test e2e/intake-logs.spec.ts` | ✅ intake-logs.spec.ts (3 tests) | ✅ green |
| 22-02-02 | 02 | 1 | E2E-02 | e2e | `npx playwright test e2e/medication-wizard.spec.ts` | ✅ medication-wizard.spec.ts (2 tests) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser caching speed | E2E-01 | CI timing depends on GitHub Actions runner | Check CI logs for Playwright install time < 30s |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

**Gap 1 resolved:** Playwright config validation (`playwright-config.test.ts`) — 9 tests verifying CI dual-mode webServer, service worker blocking, production build commands, and LOCAL_AGENT_MODE.

**Gap 2 resolved:** E2E CI job wiring (`ci-workflow-structure.test.ts`) — 8 tests verifying e2e job exists, installs Chromium with caching, runs pnpm test:e2e, uploads traces on failure, and is wired to ci-pass gate.
