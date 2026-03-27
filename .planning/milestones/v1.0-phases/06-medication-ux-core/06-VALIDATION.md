---
phase: 6
slug: medication-ux-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + fake-indexeddb (unit); Playwright 1.58 (E2E) |
| **Config file** | vitest.config.ts, playwright.config.ts |
| **Quick run command** | `pnpm lint && pnpm build` |
| **Full suite command** | `pnpm test && pnpm test:e2e` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm build`
- **After every plan wave:** Run `pnpm test && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-XX | 01 | 1 | MEDX-01 | E2E | `npx playwright test e2e/medication-compound.spec.ts` | ❌ W0 | ⬜ pending |
| 06-02-XX | 02 | 1 | MEDX-02 | unit | `pnpm test -- --run src/__tests__/dose-log-service.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-XX | 03 | 2 | MEDX-03 | E2E | `npx playwright test e2e/medication-schedule.spec.ts` | ❌ W0 | ⬜ pending |
| 06-04-XX | 04 | 1 | MEDX-04 | E2E | `npx playwright test e2e/medication-compound.spec.ts` | ❌ W0 | ⬜ pending |
| 06-05-XX | 05 | 1 | MEDX-05 | unit | `pnpm test -- --run src/__tests__/fraction-display.test.ts` | ❌ W0 | ⬜ pending |
| 06-06-XX | 06 | 2 | MEDX-06 | E2E | `npx playwright test e2e/medication-dashboard.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/medication-compound.spec.ts` — stubs for MEDX-01, MEDX-04
- [ ] `e2e/medication-schedule.spec.ts` — stubs for MEDX-03
- [ ] `e2e/medication-dashboard.spec.ts` — stubs for MEDX-06
- [ ] `src/__tests__/dose-log-service.test.ts` — stubs for MEDX-02
- [ ] `src/__tests__/fraction-display.test.ts` — stubs for MEDX-05

*Existing infrastructure: Playwright configured with LOCAL_AGENT_MODE, Vitest installed. Only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Haptic feedback on Take/Skip | MEDX-02 | Vibration API requires real device | Test on Android phone, verify different patterns for Take vs Skip |
| Auto-scroll to next time slot | MEDX-06 | Scroll position hard to assert in E2E | Open schedule, verify viewport jumps to next upcoming slot |
| Pill icon visual appearance | MEDX-04 | Visual fidelity check | Compare rendered pill icons against expected shapes/colors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
