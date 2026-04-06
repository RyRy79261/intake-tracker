---
phase: 35
slug: preset-fixes
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-06
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + Playwright |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm vitest run src/stores/__tests__/settings-store-presets.test.ts` |
| **Full suite command** | `pnpm tsc --noEmit && pnpm lint && pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit && pnpm lint`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | PRES-01 | — | N/A | type-check | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 35-01-02 | 01 | 1 | PRES-01 | — | N/A | lint | `pnpm lint` | ✅ | ⬜ pending |
| 35-02-01 | 02 | 1 | PRES-02 | — | N/A | type-check | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 35-02-02 | 02 | 1 | PRES-02 | — | N/A | unit | `pnpm vitest run src/stores/__tests__/settings-store-presets.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Long-press triggers confirm dialog | PRES-02 | Touch gesture timing requires real device | 1. Open liquids card, coffee tab 2. Long-press a preset button for ~500ms 3. Confirm dialog appears with preset name |
| Save button disabled until AI lookup | PRES-01 | AI lookup requires live API | 1. Type beverage name 2. Verify "Save as preset & log" is disabled 3. Click AI lookup 4. After response, verify button is enabled |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
