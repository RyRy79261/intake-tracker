---
phase: 14
slug: unified-liquids-card
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 14 — Validation Strategy

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
- **Max feedback latency:** 30 seconds (build is slower for UI components)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | LIQD-01 | build | `pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 14-01-02 | 01 | 1 | LIQD-01 | build | `pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 14-02-01 | 02 | 2 | LIQD-04 | build | `pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | LIQD-01 | build+lint | `pnpm lint && pnpm build 2>&1 \| tail -5` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No Wave 0 needed — UI components are verified via build + lint. Existing test infrastructure covers service layer (tested in Phase 12-13).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Water tab UX preserved | LIQD-01 | Visual/interaction parity requires browser | Compare water +/- buttons, daily total, limit warning with current IntakeCard |
| Tab switching preserves state | LIQD-01 | Browser state management | Switch Water→Coffee→Water, verify pending amount retained |
| Preset selection fills fields | LIQD-04 | Interactive flow | Tap espresso preset, verify volume/caffeine fields populate |
| AI lookup returns inline result | LIQD-04 | Requires live Claude API | Type "cortado", tap AI icon, verify fields populate |
| Log Entry creates linked records | LIQD-04 | Requires IndexedDB verification | Log a coffee, check both intakeRecords and substanceRecords in DevTools |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
