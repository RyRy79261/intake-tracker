---
phase: 34
slug: food-sodium-card-restructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `pnpm build && pnpm lint` |
| **Full suite command** | `pnpm test:e2e` |
| **Estimated runtime** | ~30 seconds (build+lint), ~120 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm build && pnpm lint`
- **After every plan wave:** Run `pnpm build && pnpm lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | FOOD-01 | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-01-02 | 01 | 1 | FOOD-01 | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-01-03 | 01 | 1 | — | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-02-01 | 02 | 1 | FOOD-02, FOOD-03 | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-02-02 | 02 | 1 | FOOD-03 | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-02-03 | 02 | 1 | FOOD-03 | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-03-01 | 03 | 2 | — | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |
| 34-03-02 | 03 | 2 | — | — | N/A | build | `pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Build and lint provide sufficient automated feedback for UI restructuring. E2E tests verify end-to-end flows.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sodium total in header top-right | FOOD-01 | Visual layout verification | Open app, check food card header shows sodium total in top-right position |
| Description as entry title | FOOD-02 | Visual rendering check | Add food with description via AI, verify description appears as primary label in history |
| Merged history chronological order | FOOD-03 | Visual ordering check | Add food and sodium entries, verify single merged list in chronological order |
| Edit/delete routing correctness | FOOD-03 | Interactive behavior | Click edit on eating entry → EditEatingDialog; click edit on salt entry → EditIntakeDialog |
| Quick nav scrolls to card | — | Interactive behavior | Tap "Eating" in quick nav footer, verify scrolls to food-salt card |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
