---
phase: 37
slug: water-entry-label-formatting-bug
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright E2E (existing) + manual verification |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test e2e/intake-logs.spec.ts` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build` (TypeScript/lint check)
- **After every plan wave:** Run `pnpm build`
- **Before `/gsd-verify-work`:** Build must pass, manual label verification
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | — | — | N/A | unit/grep | `grep "preset:manual" src/lib/utils.ts` returns match in handler | ✅ | ⬜ pending |
| 37-01-02 | 01 | 1 | — | — | N/A | unit/grep | `grep "substance:" src/lib/utils.ts` returns match in handler | ✅ | ⬜ pending |
| 37-01-03 | 01 | 1 | — | — | N/A | build | `pnpm build` exits 0 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework or stubs needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preset water entry shows beverage name | D-01 | Requires UI interaction with presets | Create water entry from a preset, verify label shows preset name not "preset:{id}" |
| Substance water entry shows description | D-04 | Requires substance record creation | Add a substance via AI lookup, verify water label shows description not "substance:{id}" |
| Deleted preset shows "Beverage" fallback | D-02 | Requires preset creation then deletion | Create preset, use it, delete it, verify label shows "Beverage" |
| Unknown source returns null | D-06 | Edge case verification | Confirm no raw source strings appear in any entry labels |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
