---
phase: 38
slug: weight-input-default-value-bug
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright E2E |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm test:e2e` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm build`
- **After every plan wave:** Run `pnpm test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | — | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 38-01-02 | 01 | 1 | — | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 38-01-03 | 01 | 1 | — | — | N/A | build | `pnpm build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed -- build verification and lint cover the type-safety and structural changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Weight pre-fills with last recorded value | D-03 | Requires IndexedDB with existing data | Open app with existing weight records, verify weight card shows last recorded value |
| Skeleton shows during DB load | D-09 | Timing-dependent, hard to assert in E2E | Throttle CPU in DevTools, reload page, observe skeleton in weight input area |
| First-time user sees 69 kg | D-12 | Requires empty IndexedDB | Clear all data, reload, verify 69 appears after brief loading |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
