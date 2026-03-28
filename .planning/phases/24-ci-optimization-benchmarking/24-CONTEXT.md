# Phase 24: CI Optimization & Benchmarking - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

CI is fast and informative -- expensive jobs only run when relevant files change, coverage trends are visible per PR, builds are cached, and performance baselines exist for critical paths. Covers CIOP-01 (dynamic test selection), CIOP-02 (coverage reporting), CIOP-03 (build caching), BNCH-01 (performance baselines).

</domain>

<decisions>
## Implementation Decisions

### Dynamic Test Selection (CIOP-01)
- **D-01:** Dedicated `changes` job runs `dorny/paths-filter` as the first job in the workflow. Gated jobs use `if: needs.changes.outputs.src == 'true'` to decide whether to run
- **D-02:** Single `src` filter category triggers both unit tests and E2E together. Filter includes: `src/**`, `e2e/**`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `next.config.*`
- **D-03:** `.github/**` is included in the `src` filter -- any workflow file change forces all jobs to run. Prevents a broken filter from silently disabling jobs
- **D-04:** Skippable jobs: `test-tz-sa`, `test-tz-de`, `e2e`, `coverage`, `benchmark`. Always-run jobs: `lint`, `typecheck`, `build`, `data-integrity`, `supply-chain` (last two per Phase 21/23 decisions)
- **D-05:** The "docs-only PR completes in under 2 minutes" target (success criteria #1) is aspirational, not a hard constraint. The real goal is "significantly faster than running everything"

### Coverage Reporting (CIOP-02)
- **D-06:** New dedicated `coverage` job runs `pnpm test:coverage` (single TZ, no dual pass needed). Gated by same `src` paths-filter as test jobs
- **D-07:** `vitest-coverage-report-action` runs coverage on both the PR branch and base branch for comparison -- no committed baseline artifacts needed on main
- **D-08:** Delta-only PR comment showing coverage change vs base branch (e.g., "+0.5% lines"). No absolute numbers, no file-by-file breakdown, no summary table
- **D-09:** Coverage is purely informational -- never blocks CI. Aligns with REQUIREMENTS.md rationale about Goodhart's Law risk with thresholds

### Build Caching (CIOP-03)
- **D-10:** `actions/cache` preserves `.next/cache` between CI runs in the `build` job
- **D-11:** Cache key: `hashFiles('pnpm-lock.yaml', 'next.config.*')` with partial restore key fallback. Invalidates when deps or Next config change
- **D-12:** Keep existing `setup-node` pnpm store caching as-is. No additional caching for Playwright browsers or other artifacts

### Benchmarking (BNCH-01)
- **D-13:** Dedicated `benchmark` job, gated by paths-filter on `src/lib/db.ts`, `src/__tests__/migration/**`, `src/__tests__/integrity/**`, `src/lib/backup-service.ts`
- **D-14:** Benchmark targets: Dexie v10-v15 migration chain and full backup export/import round-trip cycle. These are the two operations where performance regressions would actually hurt the user
- **D-15:** Baseline JSON files committed to `benchmarks/` directory at repo root
- **D-16:** Benchmark results stay in CI job logs only -- no PR comment. Keeps PR comments clean (only coverage gets a comment)
- **D-17:** Benchmarks are informational only -- never block CI. Same philosophy as coverage

### ci-pass Gate Updates
- **D-18:** Skip-aware gate logic: unconditional jobs (lint, typecheck, build, data-integrity, supply-chain) require `success`. Gated jobs (test-tz-sa, test-tz-de, e2e, coverage, benchmark) accept `success` OR `skipped`
- **D-19:** `changes` job always runs and always succeeds -- treated as unconditional in the gate

### Claude's Discretion
- Exact dorny/paths-filter version and YAML syntax
- Whether coverage job needs a separate `vitest.coverage.config.ts` or can use existing config with `--coverage` flag
- Vitest bench configuration details (vitest.bench.config.ts vs inline)
- Benchmark iteration count and warmup settings
- Exact cache restore key format and fallback pattern
- Whether to add new package.json scripts for bench/coverage or use inline commands

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CI Infrastructure
- `.github/workflows/ci.yml` -- Current CI workflow with 8 parallel jobs + ci-pass gate. All modifications happen here
- `.planning/phases/20-core-ci-pipeline/20-CONTEXT.md` -- Phase 20 decisions (job structure, ci-pass gate pattern, Node 20, pnpm cache)

### Test Infrastructure
- `vitest.config.ts` -- Vitest configuration. May need coverage settings added
- `playwright.config.ts` -- Playwright config (E2E job configuration)
- `package.json` scripts: `test:coverage` (already exists), `test:tz:sa`, `test:tz:de`, `test:e2e`

### Benchmark Targets
- `src/lib/db.ts` -- Dexie schema v10-v15 with migration chain. Primary benchmark target
- `src/lib/backup-service.ts` -- Backup export/import cycle. Secondary benchmark target
- `src/__tests__/migration/` -- v10 through v15 migration tests (pattern reference for bench tests)
- `src/__tests__/integrity/backup-round-trip.test.ts` -- Existing backup round-trip test (pattern reference)

### Prior Phase Decisions
- `.planning/phases/21-data-integrity-gates/21-CONTEXT.md` -- D-05: data-integrity runs unconditionally (no path-filter)
- `.planning/phases/23-supply-chain-hardening/23-CONTEXT.md` -- D-04: supply-chain runs unconditionally

### Requirements
- `.planning/REQUIREMENTS.md` -- CIOP-01, CIOP-02, CIOP-03, BNCH-01 map to this phase. Also documents Out of Scope rationale for external coverage services and flame graphs

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@vitest/coverage-v8` (^4.0.18): Already installed, `test:coverage` script exists in package.json
- `ci.yml`: 8 jobs + ci-pass gate with explicit per-job result checks -- pattern to extend
- `setup-node` pnpm cache: Already configured in every job -- no changes needed
- `src/__tests__/integrity/parse-schema.ts`: Static schema parser -- could inform benchmark test structure

### Established Patterns
- One CI job per concern (lint, typecheck, test-tz-sa, test-tz-de, build, data-integrity, e2e, supply-chain)
- `ci-pass` gate with `if: always()` and explicit per-job result checks
- Unconditional security-critical jobs (data-integrity, supply-chain) vs gatable jobs
- `pnpm exec vitest run <path>` for running specific test subsets in CI

### Integration Points
- `ci.yml` -- add `changes`, `coverage`, `benchmark` jobs + update ci-pass gate
- `vitest.config.ts` -- may need coverage provider configuration
- `benchmarks/` -- new directory for baseline JSON files
- New bench test files (e.g., `src/__tests__/bench/`) for Vitest bench specs

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 24-ci-optimization-benchmarking*
*Context gathered: 2026-03-28*
