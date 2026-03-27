---
phase: 4
slug: analytics-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 + fake-indexeddb ^6.2.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SRVC-05a | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "fluid balance"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | SRVC-05b | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "adherence"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | SRVC-05c | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "bp trend"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | SRVC-05d | unit | `pnpm test -- src/lib/analytics-registry.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | SRVC-05e | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "serializable"` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | SRVC-05f | unit | `pnpm test -- src/lib/analytics-stats.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | SRVC-05g | unit | `pnpm test -- src/lib/substance-service.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | SRVC-05h | unit | `pnpm test -- src/__tests__/migration/v12.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 3 | SRVC-05i | unit | `pnpm test -- src/lib/export-service.test.ts -t "csv"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/analytics-service.test.ts` — stubs for fluid balance, adherence, BP trend, serializability
- [ ] `src/lib/analytics-stats.test.ts` — stubs for statistical helper functions
- [ ] `src/lib/analytics-registry.test.ts` — stubs for query registry
- [ ] `src/lib/substance-service.test.ts` — stubs for substance record creation
- [ ] `src/__tests__/migration/v12.test.ts` — stubs for Dexie v12 migration
- [ ] `src/lib/export-service.test.ts` — stubs for CSV export

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Analytics page renders charts correctly | SRVC-05 | Visual rendering | Open /history, verify charts display with sample data |
| Substance quick-log UI flow | SRVC-05g | Interactive flow | Log a substance via main dashboard, verify it appears in history |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
