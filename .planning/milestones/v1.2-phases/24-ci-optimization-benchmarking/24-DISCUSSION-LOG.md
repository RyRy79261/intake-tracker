# Phase 24: CI Optimization & Benchmarking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 24-ci-optimization-benchmarking
**Areas discussed:** Path filter categories, Coverage reporting, Build cache strategy, Benchmark scope, E2E vs unit test filters, Coverage baseline mechanics, Benchmark job structure, New job count impact on ci-pass, Coverage job gating, Benchmark PR reporting, Workflow self-test, 2-minute target

---

## Path Filter Categories

### Skippable Jobs

| Option | Description | Selected |
|--------|-------------|----------|
| E2E + tests only | Only skip E2E and test-tz-* jobs on non-src changes. Lint, typecheck, and build always run. Data-integrity and supply-chain stay unconditional | :heavy_check_mark: |
| All non-security jobs | Skip lint, typecheck, test-tz-*, build, AND E2E when only docs/config change | |
| Aggressive | Even lint and typecheck skip on docs-only PRs | |

**User's choice:** E2E + tests only (Recommended)

### Gate Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Skip-aware gate | ci-pass checks each job: pass if 'success' OR 'skipped'. Fail only on 'failure'/'cancelled' | :heavy_check_mark: |
| Conditional gate job | ci-pass itself becomes conditional | |

**User's choice:** Skip-aware gate (Recommended)

### Filter Categories

| Option | Description | Selected |
|--------|-------------|----------|
| src/ + config files | Tests run when src/**, e2e/**, package.json, pnpm-lock.yaml, vitest.config.ts, playwright.config.ts, tsconfig.json, or next.config.* change | :heavy_check_mark: |
| src/ only | Only src/** and e2e/** trigger tests | |
| You decide | Claude picks | |

**User's choice:** src/ + config files (Recommended)

### Filter Job Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated filter job | A 'changes' job runs dorny/paths-filter first. Gated jobs use 'if: needs.changes.outputs.src == true' | :heavy_check_mark: |
| Inline per-job | Each gatable job runs its own paths-filter step | |

**User's choice:** Dedicated filter job (Recommended)

---

## Coverage Reporting

### Coverage Job

| Option | Description | Selected |
|--------|-------------|----------|
| Separate coverage job | New 'coverage' job runs 'pnpm test:coverage' once. Uploads JSON as artifact | :heavy_check_mark: |
| Piggyback on test-tz-sa | Add --coverage flag to existing TZ test job | |
| You decide | Claude picks | |

**User's choice:** Separate coverage job (Recommended)

### PR Comment Style

| Option | Description | Selected |
|--------|-------------|----------|
| Delta-only comment | Show coverage change vs base branch. No absolute numbers, no file-by-file breakdown | :heavy_check_mark: |
| Delta + summary table | Show delta AND summary table (lines/branches/functions) | |
| Delta + changed files detail | Show delta plus per-file coverage for changed files | |

**User's choice:** Delta-only comment (Recommended)

### Blocking Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Informational only | Coverage comment shows delta but never fails CI | :heavy_check_mark: |
| Soft block on large drops | Fail CI if coverage drops more than e.g. 5% | |
| You decide | Claude picks | |

**User's choice:** Informational only (Recommended)

---

## Build Cache Strategy

### Cache Key

| Option | Description | Selected |
|--------|-------------|----------|
| Hash on lockfile + next config | Cache key: hashFiles('pnpm-lock.yaml', 'next.config.*'). Restore key falls back to partial match | :heavy_check_mark: |
| Always restore, never key-match | Static restore key, always restores most recent run | |
| You decide | Claude picks | |

**User's choice:** Hash on lockfile + next config (Recommended)

### pnpm Cache

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current setup-node cache | Only add .next/cache via actions/cache. Don't over-optimize | :heavy_check_mark: |
| Add Playwright browser cache too | Cache ~/.cache/ms-playwright alongside .next/cache | |
| You decide | Claude judges | |

**User's choice:** Keep current setup-node cache (Recommended)

---

## Benchmark Scope

### Bench Targets

| Option | Description | Selected |
|--------|-------------|----------|
| Migration chain + backup round-trip | Benchmark Dexie v10-v15 migration and full backup export/import cycle | :heavy_check_mark: |
| Above + key service operations | Also benchmark intake-service, medication-service CRUD | |
| Migration only | Just the Dexie migration chain | |
| You decide | Claude picks | |

**User's choice:** Migration chain + backup round-trip (Recommended)

### Bench CI Usage

| Option | Description | Selected |
|--------|-------------|----------|
| Store baselines, report only | Commit baseline JSON. CI reports but never blocks on regression | :heavy_check_mark: |
| Block on large regressions | Fail CI if benchmark regresses more than 2x | |
| You decide | Claude picks | |

**User's choice:** Store baselines, report only (Recommended)

### Bench Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Gated by paths-filter | Only run when db.ts, migration tests, or backup-service change | :heavy_check_mark: |
| Every PR | Always run benchmarks | |

**User's choice:** Gated by paths-filter (Recommended)

---

## E2E vs Unit Test Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Single 'src' filter for both | One filter for both test-tz-* and E2E. E2E-only changes also trigger unit tests | :heavy_check_mark: |
| Separate filters | Unit tests: src/**, vitest.config.ts. E2E: src/**, e2e/**, playwright.config.ts | |
| You decide | Claude picks | |

**User's choice:** Single 'src' filter for both (Recommended)

---

## Coverage Baseline Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Action runs coverage on both branches | Checks out base branch, runs coverage there too, then compares. Zero maintenance | :heavy_check_mark: |
| Committed baseline JSON on main | Post-merge workflow commits coverage JSON. PR job downloads it as baseline | |
| You decide | Claude picks | |

**User's choice:** Action runs coverage on both branches (Recommended)

---

## Benchmark Job Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Own job, gated by paths-filter | Dedicated 'benchmark' job. Baseline JSON in benchmarks/ directory | :heavy_check_mark: |
| Share with data-integrity job | Add bench step to existing data-integrity job | |
| You decide | Claude picks | |

**User's choice:** Own job, gated by paths-filter (Recommended)

---

## ci-pass Gate Impact

| Option | Description | Selected |
|--------|-------------|----------|
| Accept success OR skipped for gated jobs | Unconditional jobs must be 'success'. Gated jobs accept 'success' OR 'skipped' | :heavy_check_mark: |
| Collapse to 'all non-failure' | If NO job is 'failure' or 'cancelled', pass | |
| You decide | Claude picks | |

**User's choice:** Accept success OR skipped for gated jobs (Recommended)

---

## Coverage Job Gating

| Option | Description | Selected |
|--------|-------------|----------|
| Gated like tests | Skip coverage when tests skip. Same 'src' filter | :heavy_check_mark: |
| Always run | Coverage runs on every PR | |

**User's choice:** Gated like tests (Recommended)

---

## Benchmark PR Reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Job logs only | Results stay in CI logs. No PR comment. Only coverage gets a comment | :heavy_check_mark: |
| PR comment with comparison | Post comparison comment on PR | |
| You decide | Claude picks | |

**User's choice:** Job logs only (Recommended)

---

## Workflow Self-Test

| Option | Description | Selected |
|--------|-------------|----------|
| .github/** forces all jobs | Add .github/** to filter. Any workflow change triggers everything | :heavy_check_mark: |
| Trust the filter | Workflow changes don't override filter | |
| You decide | Claude picks | |

**User's choice:** .github/** forces all jobs (Recommended)

---

## 2-Minute Target

| Option | Description | Selected |
|--------|-------------|----------|
| Aspirational | Aim for it but don't engineer around it. Real goal is 'significantly faster than running everything' | :heavy_check_mark: |
| Hard constraint | Investigate and optimize until it hits 2 minutes | |
| You decide | Claude interprets | |

**User's choice:** Aspirational (Recommended)

---

## Claude's Discretion

- dorny/paths-filter version and YAML syntax
- Coverage provider configuration details
- Vitest bench configuration (config file vs inline)
- Benchmark iteration count and warmup settings
- Cache restore key format and fallback pattern
- New package.json scripts for bench/coverage

## Deferred Ideas

None -- discussion stayed within phase scope.
