---
phase: 16
slug: dashboard-cleanup-and-text-metrics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 16 — Validation Strategy

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
| Text metrics show correct daily totals | DASH-08 | Needs populated IndexedDB data | Log water + salt + coffee, verify metrics update |
| Weekly summary Monday-start | DASH-08 | Date boundary logic | Check on a Wednesday that Mon-Wed data shows |
| BP heart rate always visible | DASH-06 | Visual check | Open BP card, verify HR field visible without expanding |
| Card ordering correct | DASH-10 | Visual layout | Scroll dashboard, verify Liquids → Food+Salt → BP → Weight → Urination → Defecation |
| Food calculator fully removed | DASH-07 | No UI entry point | Search for any food calculator reference in UI |
| Liquid Presets manager in settings | DASH-09 | Interactive flow | Open settings, verify presets tab shows all presets with CRUD |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
