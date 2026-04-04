---
phase: 24
slug: ci-optimization-benchmarking
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts src/__tests__/ci-workflow-structure.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~700ms (config validation) |

---

## Sampling Rate

- **After every task commit:** Run config validation tests
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-T1 | 01 | 1 | CIOP-02, BNCH-01 | unit (static) | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts` | ✅ 10 tests | ✅ green |
| 24-01-T2 | 01 | 1 | BNCH-01 | unit (static) | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts` | ✅ bench file + baseline tests | ✅ green |
| 24-02-T1 | 02 | 2 | CIOP-01, CIOP-02, CIOP-03, BNCH-01 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ 18 tests (CIOP/BNCH blocks) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docs-only PR skips expensive jobs | CIOP-01 | Requires actual GitHub PR to trigger path filtering | Push branch with docs-only change, open PR, verify test/E2E/bench jobs are skipped |
| PR receives coverage delta comment | CIOP-02 | Requires actual GitHub PR for comment posting | Push branch with src change, open PR, verify coverage comment appears with delta |
| .next/cache preserved between runs | CIOP-03 | Requires two sequential CI runs on same branch | Run CI twice on same PR, compare build times in logs |
| Benchmark results in CI logs | BNCH-01 | Requires CI environment to run full benchmark pipeline | Open PR touching db.ts, verify benchmark job runs and outputs results |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

**Gap 1 resolved:** Benchmark/coverage config validation (`benchmark-coverage-config.test.ts`) — 10 tests verifying vitest coverage reporters, bench/bench:ci scripts, bench files exist, and baseline JSON committed.

**Gap 2 resolved:** CI optimization structure (`ci-workflow-structure.test.ts`) — 18 tests verifying dorny/paths-filter changes job, coverage job with vitest-coverage-report-action, .next/cache in build job, benchmark job gated on bench changes, and skip-aware ci-pass gate.
