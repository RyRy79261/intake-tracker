---
phase: 21
slug: data-integrity-gates
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run src/__tests__/integrity/` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~450ms (integrity), ~2.5s (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run src/__tests__/integrity/`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | DATA-04 | unit (static) | `pnpm exec vitest run src/__tests__/integrity/schema-consistency.test.ts` | ✅ 4 tests | ✅ green |
| 21-01-02 | 01 | 1 | DATA-06 | unit (fake-indexeddb) | `pnpm exec vitest run src/__tests__/integrity/backup-round-trip.test.ts` | ✅ 3 tests | ✅ green |
| 21-01-03 | 01 | 1 | DATA-07 | unit (static) | `pnpm exec vitest run src/__tests__/integrity/table-sync.test.ts` | ✅ 4 tests | ✅ green |
| 21-02-01 | 02 | 2 | DATA-05 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ 6 tests (DATA-05 block) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

**Gap resolved:** DATA-05 CI wiring validation — 6 tests added to `ci-workflow-structure.test.ts` verifying data-integrity job exists, runs unconditionally, and is wired to ci-pass gate.
