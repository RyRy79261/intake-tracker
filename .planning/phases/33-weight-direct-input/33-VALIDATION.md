---
phase: 33
slug: weight-direct-input
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + playwright (e2e) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:e2e` |
| **Estimated runtime** | ~5 seconds (unit) + ~30 seconds (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | WGT-01 | — | N/A | unit | `pnpm test` | TBD | ⬜ pending |
| 33-01-02 | 01 | 1 | WGT-01 | — | N/A | e2e | `pnpm test:e2e` | TBD | ⬜ pending |
| 33-02-01 | 02 | 1 | WGT-01 | — | N/A | e2e | `pnpm test:e2e` | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or configuration needed.

- Vitest already configured for unit tests
- Playwright already configured for E2E tests with dev server auto-start
- Existing `e2e/dashboard.spec.ts` has weight card test pattern to extend

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Numeric keyboard appears on mobile | WGT-01 | Cannot verify keyboard type in Playwright | Test on physical mobile device: tap weight value, verify decimal numeric keyboard |
| No visual transition on tap | WGT-01 | Visual regression needs human eye | Compare screenshots: before tap vs during input — must look identical except cursor |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
