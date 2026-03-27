---
phase: 15
slug: unified-food-salt-card
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x + fake-indexeddb |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- --reporter=verbose` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint -- --no-warn-ignored && pnpm build 2>&1 | tail -5`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI food parse creates composable preview | FOOD-02 | Requires live Claude API | Type "chicken soup", verify preview shows eating + water + salt records |
| Preview edit/remove before confirm | FOOD-03 | Interactive UI flow | Edit water amount in preview, remove salt record, confirm remaining |
| Salt +/- UX preserved | FOOD-01 | Visual parity with IntakeCard(salt) | Compare salt section with current salt card side-by-side |
| Water from food adds to Liquids total | FOOD-02 | Cross-card reactivity | Log food with water, verify Liquids card total increases |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
