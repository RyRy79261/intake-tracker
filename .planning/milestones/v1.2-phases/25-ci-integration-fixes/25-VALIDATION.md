---
phase: 25
slug: ci-integration-fixes
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
updated: 2026-03-29
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm typecheck && pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `pnpm typecheck && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | CIPL-01 | unit (static) | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts` | ✅ tsconfig target test | ✅ green |
| 25-01-02 | 01 | 1 | BNCH-01 | unit (static) | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts` | ✅ worktree-path check | ✅ green |
| 25-01-03 | 01 | 1 | SCHN-04 | unit (CI config) | `pnpm exec vitest run src/__tests__/ci-workflow-structure.test.ts` | ✅ auditLevel drift test | ✅ green |
| 25-01-04 | 01 | 1 | CIPL-03 | unit (static) | `pnpm exec vitest run src/__tests__/benchmark-coverage-config.test.ts` | ✅ .claude/** exclude test | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

---

## Validation Audit 2026-03-29

| Metric | Count |
|--------|-------|
| Gaps found | 4 |
| Resolved | 4 |
| Escalated | 0 |

**Gap 1 resolved:** tsconfig.json ES2020 target validation — test verifies compilerOptions.target is "ES2020" (DEFECT-01).

**Gap 2 resolved:** Benchmark baseline worktree-path check — test verifies benchmarks/results.json has no "worktrees" references (DEFECT-02).

**Gap 3 resolved:** CI supply-chain drift check auditLevel — test verifies supply-chain job greps for auditLevel (DEFECT-03).

**Gap 4 resolved:** Vitest .claude/** exclude — test verifies vitest.config.ts excludes .claude/** in both test and benchmark config.
