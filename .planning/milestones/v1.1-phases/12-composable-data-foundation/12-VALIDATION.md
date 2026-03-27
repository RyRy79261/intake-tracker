---
phase: 12
slug: composable-data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 12 — Validation Strategy

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

- **After every task commit:** Run `pnpm test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | COMP-02 | unit | `pnpm test -- src/__tests__/db-migration-v15.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | COMP-02 | unit | `pnpm test -- src/__tests__/db-migration-v15.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | COMP-01 | unit | `pnpm test -- src/__tests__/composable-entry-service.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | COMP-03 | unit | `pnpm test -- src/__tests__/composable-entry-service.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | COMP-04 | unit | `pnpm test -- src/__tests__/use-composable-entry.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/db-migration-v15.test.ts` — migration test stubs for COMP-02
- [ ] `src/__tests__/composable-entry-service.test.ts` — service test stubs for COMP-01, COMP-03
- [ ] `src/__tests__/use-composable-entry.test.ts` — hook test stubs for COMP-04

*Existing vitest + fake-indexeddb infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Undo toast appears on delete | COMP-03 | UI toast requires browser | Delete a record, verify toast appears with ~5s undo window |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
