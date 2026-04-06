---
phase: 39
slug: preset-save-and-log-label-fix
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-06
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + Playwright |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm lint && pnpm build` |
| **Full suite command** | `pnpm lint && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm build`
- **After every plan wave:** Run `pnpm lint && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | PRES-01 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 39-01-02 | 01 | 1 | PRES-01 | — | N/A | build | `pnpm build` | N/A | ⬜ pending |
| 39-01-03 | 01 | 1 | PRES-01 | — | N/A | lint+build | `pnpm lint && pnpm build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed -- this is a bug fix with type-system verification via `pnpm build`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preset save-and-log creates entry with preset name label | PRES-01 | Requires Dexie + Zustand + UI interaction | 1. Open app, go to Coffee tab, 2. AI lookup a beverage, 3. Click "Save as preset & log", 4. Check recent entries shows preset name |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
