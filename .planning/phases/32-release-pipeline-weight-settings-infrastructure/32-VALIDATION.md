---
phase: 32
slug: release-pipeline-weight-settings-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + pnpm build (type checking) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm build` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds (build), ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build`
- **After every plan wave:** Run `pnpm build`
- **Before `/gsd-verify-work`:** Build must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | WGT-02, WGT-03 | — | N/A | build | `pnpm build` | N/A | pending |
| 32-01-02 | 01 | 1 | WGT-02, WGT-03 | — | N/A | build | `pnpm build` | N/A | pending |
| 32-01-03 | 01 | 1 | WGT-02, WGT-03 | — | N/A | build | `pnpm build` | N/A | pending |
| 32-02-01 | 02 | 1 | REL-01 | — | N/A | manual | GitHub UI check | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or fixtures needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| release-please can create PRs | REL-01 | Requires GitHub repo settings change | Check repo Settings > Actions > General > Workflow permissions |
| Weight increment stepper visible in Settings | WGT-02 | Visual UI verification | Navigate to /settings, confirm Weight section with stepper appears |
| Weight values round to 0.05 precision | WGT-03 | Interaction verification | Tap +/- on weight card, verify display shows XX.X5 or XX.X0 |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
