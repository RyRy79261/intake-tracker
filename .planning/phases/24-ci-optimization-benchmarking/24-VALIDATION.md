---
phase: 24
slug: ci-optimization-benchmarking
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + Playwright 1.58.2 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm lint && pnpm typecheck` |
| **Full suite command** | `pnpm test:tz && pnpm test:e2e` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm typecheck` (fast validation of YAML/config syntax)
- **After every plan wave:** Run `pnpm test:tz && pnpm exec vitest bench --run` (verify bench files execute)
- **Before `/gsd:verify-work`:** Push branch, open PR, verify CI workflow behaves correctly (path filtering, coverage comment, cache, benchmarks)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-T1 | 01 | 1 | CIOP-02, BNCH-01 | auto | `grep -q "json-summary" vitest.config.ts && grep -q '"bench"' package.json` | ✅ | ⬜ pending |
| 24-01-T2 | 01 | 1 | BNCH-01 | auto | `pnpm bench --run 2>&1 \| tail -5` | ❌ W0 → created by task | ⬜ pending |
| 24-02-T1 | 02 | 2 | CIOP-01, CIOP-02, CIOP-03, BNCH-01 | auto | `grep -q "dorny/paths-filter" .github/workflows/ci.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/bench/migration.bench.ts` — benchmark stub for migration chain (BNCH-01)
- [ ] `src/__tests__/bench/backup.bench.ts` — benchmark stub for backup round-trip (BNCH-01)
- [ ] `benchmarks/` directory — baseline JSON storage (BNCH-01)
- [ ] Coverage reporter config (`json-summary`, `json`) in vitest.config.ts (CIOP-02)

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
