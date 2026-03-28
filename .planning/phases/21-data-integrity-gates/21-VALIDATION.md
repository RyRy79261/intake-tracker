---
phase: 21
slug: data-integrity-gates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
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
| **Estimated runtime** | ~5 seconds |

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
| 21-01-01 | 01 | 1 | DATA-04 | unit (static) | `pnpm exec vitest run src/__tests__/integrity/schema-consistency.test.ts` | Wave 0 | pending |
| 21-01-02 | 01 | 1 | DATA-06 | unit (fake-indexeddb) | `pnpm exec vitest run src/__tests__/integrity/backup-round-trip.test.ts` | Wave 0 | pending |
| 21-01-03 | 01 | 1 | DATA-07 | unit (static) | `pnpm exec vitest run src/__tests__/integrity/table-sync.test.ts` | Wave 0 | pending |
| 21-02-01 | 02 | 2 | DATA-05 | CI config | Verified by `data-integrity` job in ci.yml | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/integrity/parse-schema.ts` -- reusable parser utility (D-01, D-03)
- [ ] `src/__tests__/integrity/schema-consistency.test.ts` -- stubs for DATA-04
- [ ] `src/__tests__/integrity/backup-round-trip.test.ts` -- stubs for DATA-06
- [ ] `src/__tests__/integrity/table-sync.test.ts` -- stubs for DATA-07

*Wave 0 creates the test files that the integrity suite depends on.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
