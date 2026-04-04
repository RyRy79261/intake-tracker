# Phase 24: CI Optimization & Benchmarking - Research

**Researched:** 2026-03-28
**Domain:** GitHub Actions CI optimization, Vitest coverage reporting, Vitest benchmarking
**Confidence:** HIGH

## Summary

Phase 24 adds four capabilities to the existing CI workflow: path-based job gating via `dorny/paths-filter`, coverage delta reporting via `vitest-coverage-report-action`, Next.js build caching via `actions/cache`, and performance benchmarking via `vitest bench`. All decisions are locked in CONTEXT.md with clear implementation specifics. No new npm packages are needed -- `vitest bench` and `@vitest/coverage-v8` are already available in the project's installed Vitest 4.0.18. The work is entirely in CI workflow YAML, vitest config adjustments, and new `.bench.ts` test files.

The most complex piece is the coverage comparison workflow, which requires running coverage on both the PR branch and the base branch within the same CI run, uploading artifacts, and then comparing them. The benchmarking piece is simpler -- `vitest bench` with `--outputJson` generates baselines committed to `benchmarks/`, and CI runs with `--compare` to detect regressions.

**Primary recommendation:** Structure work as three plans: (1) paths-filter gating + ci-pass gate updates, (2) coverage job + reporting, (3) build caching + benchmarking job. The paths-filter must come first since coverage and benchmark jobs depend on its outputs.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Dedicated `changes` job runs `dorny/paths-filter` as the first job in the workflow. Gated jobs use `if: needs.changes.outputs.src == 'true'` to decide whether to run
- D-02: Single `src` filter category triggers both unit tests and E2E together. Filter includes: `src/**`, `e2e/**`, `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `next.config.*`
- D-03: `.github/**` is included in the `src` filter -- any workflow file change forces all jobs to run
- D-04: Skippable jobs: `test-tz-sa`, `test-tz-de`, `e2e`, `coverage`, `benchmark`. Always-run jobs: `lint`, `typecheck`, `build`, `data-integrity`, `supply-chain`
- D-05: The "docs-only PR completes in under 2 minutes" target is aspirational, not a hard constraint
- D-06: New dedicated `coverage` job runs `pnpm test:coverage` (single TZ, no dual pass needed). Gated by same `src` paths-filter
- D-07: `vitest-coverage-report-action` runs coverage on both the PR branch and base branch for comparison -- no committed baseline artifacts needed on main
- D-08: Delta-only PR comment showing coverage change vs base branch. No absolute numbers, no file-by-file breakdown, no summary table
- D-09: Coverage is purely informational -- never blocks CI
- D-10: `actions/cache` preserves `.next/cache` between CI runs in the `build` job
- D-11: Cache key: `hashFiles('pnpm-lock.yaml', 'next.config.*')` with partial restore key fallback
- D-12: Keep existing `setup-node` pnpm store caching as-is. No additional caching
- D-13: Dedicated `benchmark` job, gated by paths-filter on `src/lib/db.ts`, `src/__tests__/migration/**`, `src/__tests__/integrity/**`, `src/lib/backup-service.ts`
- D-14: Benchmark targets: Dexie v10-v15 migration chain and full backup export/import round-trip cycle
- D-15: Baseline JSON files committed to `benchmarks/` directory at repo root
- D-16: Benchmark results stay in CI job logs only -- no PR comment
- D-17: Benchmarks are informational only -- never block CI
- D-18: Skip-aware gate logic: unconditional jobs require `success`. Gated jobs accept `success` OR `skipped`
- D-19: `changes` job always runs and always succeeds -- treated as unconditional in the gate

### Claude's Discretion
- Exact dorny/paths-filter version and YAML syntax
- Whether coverage job needs a separate `vitest.coverage.config.ts` or can use existing config with `--coverage` flag
- Vitest bench configuration details (vitest.bench.config.ts vs inline)
- Benchmark iteration count and warmup settings
- Exact cache restore key format and fallback pattern
- Whether to add new package.json scripts for bench/coverage or use inline commands

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CIOP-01 | Dynamic test selection via `dorny/paths-filter` gates expensive jobs on changed file categories | dorny/paths-filter v4.0.1 verified available; YAML patterns documented; ci-pass gate update pattern researched |
| CIOP-02 | Coverage report posted as PR comment, tracking decrease rather than absolute threshold | vitest-coverage-report-action v2.9.3 verified; dual-branch comparison workflow documented; json-summary reporter config needed |
| CIOP-03 | Next.js `.next/cache` preserved between CI runs for faster builds | Official Next.js docs provide exact actions/cache@v4 YAML; hashFiles pattern verified |
| BNCH-01 | Vitest bench establishes performance baselines for critical paths (migration speed, service layer operations) | vitest bench CLI verified in installed v4.0.18; --outputJson and --compare flags confirmed; bench() API with tinybench options documented |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced via preinstall hook)
- All CI commands use `pnpm` (install, exec, run)
- Vitest 4.0.18 with `@vitest/coverage-v8` 4.0.18 already installed
- Test setup uses `fake-indexeddb/auto` in `src/__tests__/setup.ts`
- Existing `test:coverage` script: `vitest run --coverage`
- Existing CI uses Node 20, `pnpm/action-setup@v5`, `actions/setup-node@v4` with pnpm cache

## Standard Stack

### Core (GitHub Actions -- no npm installs needed)

| Action | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `dorny/paths-filter` | v4.0.1 | Path-based job gating | De facto standard for GitHub Actions path filtering; v4 supports Node 24; picomatch glob syntax |
| `davelosert/vitest-coverage-report-action` | v2 | PR coverage comment | Purpose-built for Vitest; supports json-summary comparison; actively maintained (v2.9.3 latest) |
| `actions/cache` | v4 | .next/cache persistence | Official GitHub cache action; already used implicitly via setup-node pnpm cache |
| `actions/upload-artifact` | v4 | Coverage artifact transfer between jobs | Already used in e2e job for traces; standard for inter-job data |
| `actions/download-artifact` | v4 | Coverage artifact retrieval | Companion to upload-artifact |

### Already Installed (no changes needed)

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | 4.0.18 | Test runner + bench subcommand |
| `@vitest/coverage-v8` | 4.0.18 | V8-based coverage provider |
| `fake-indexeddb` | 6.2.5 | IndexedDB mock for bench tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dorny/paths-filter` | `tj-actions/changed-files` | Equally popular but dorny is simpler for boolean gating; locked by decision |
| `vitest-coverage-report-action` | Codecov/Coveralls | Out of scope per REQUIREMENTS.md -- external service signup/tokens |
| `vitest bench` | CodSpeed | CodSpeed solves CI variance but adds external dependency; vitest bench is sufficient for informational baselines |

## Architecture Patterns

### CI Workflow Structure (after Phase 24)

```
ci.yml jobs:
  changes          (always runs - paths-filter detection)
  lint             (always runs)
  typecheck        (always runs)
  build            (always runs - now with .next/cache)
  data-integrity   (always runs)
  supply-chain     (always runs)
  test-tz-sa       (gated by changes.outputs.src)
  test-tz-de       (gated by changes.outputs.src)
  e2e              (gated by changes.outputs.src)
  coverage         (gated by changes.outputs.src)
  benchmark        (gated by changes.outputs.bench)
  ci-pass          (skip-aware gate - all above)
```

### Pattern 1: Paths-Filter as Dedicated Job with Outputs

**What:** A standalone job that runs `dorny/paths-filter` and exposes boolean outputs consumed by downstream jobs via `needs.changes.outputs.*`
**When to use:** When multiple jobs need the same filter results

```yaml
# Source: https://github.com/dorny/paths-filter (README)
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      src: ${{ steps.filter.outputs.src }}
      bench: ${{ steps.filter.outputs.bench }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v4
        id: filter
        with:
          filters: |
            src:
              - 'src/**'
              - 'e2e/**'
              - 'package.json'
              - 'pnpm-lock.yaml'
              - 'vitest.config.ts'
              - 'playwright.config.ts'
              - 'tsconfig.json'
              - 'next.config.*'
              - '.github/**'
            bench:
              - 'src/lib/db.ts'
              - 'src/__tests__/migration/**'
              - 'src/__tests__/integrity/**'
              - 'src/lib/backup-service.ts'
```

### Pattern 2: Skip-Aware CI Gate

**What:** `ci-pass` gate that accepts `success` or `skipped` for gated jobs
**When to use:** When some jobs may be legitimately skipped by path filtering

```yaml
# Source: GitHub Actions docs + existing ci-pass pattern
ci-pass:
  if: always()
  needs: [changes, lint, typecheck, test-tz-sa, test-tz-de, build, data-integrity, e2e, supply-chain, coverage, benchmark]
  runs-on: ubuntu-latest
  steps:
    - name: Check all jobs passed
      run: |
        # Unconditional jobs: must succeed
        if [[ "${{ needs.changes.result }}" != "success" ||
              "${{ needs.lint.result }}" != "success" ||
              "${{ needs.typecheck.result }}" != "success" ||
              "${{ needs.build.result }}" != "success" ||
              "${{ needs.data-integrity.result }}" != "success" ||
              "${{ needs.supply-chain.result }}" != "success" ]]; then
          echo "::error::Unconditional job failed"
          exit 1
        fi
        # Gated jobs: success OR skipped
        for job in test-tz-sa test-tz-de e2e coverage benchmark; do
          result="${{ needs[job].result }}"  # Note: this doesn't work in GHA
        done
        # Must check each explicitly (GHA doesn't support dynamic needs access)
        for result in \
          "${{ needs.test-tz-sa.result }}" \
          "${{ needs.test-tz-de.result }}" \
          "${{ needs.e2e.result }}" \
          "${{ needs.coverage.result }}" \
          "${{ needs.benchmark.result }}"; do
          if [[ "$result" != "success" && "$result" != "skipped" ]]; then
            echo "::error::Gated job failed (not success or skipped): $result"
            exit 1
          fi
        done
```

### Pattern 3: Dual-Branch Coverage Comparison

**What:** Run coverage on both PR branch and base branch, compare via artifacts
**When to use:** For delta coverage reporting without committed baselines

```yaml
# Source: https://github.com/davelosert/vitest-coverage-report-action + Medium article
coverage:
  needs: [changes]
  if: needs.changes.outputs.src == 'true'
  runs-on: ubuntu-latest
  permissions:
    pull-requests: write
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v5
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    # Run coverage on PR branch
    - name: Run coverage (PR)
      run: pnpm test:coverage
    - name: Report coverage
      if: always()
      uses: davelosert/vitest-coverage-report-action@v2
      with:
        file-coverage-mode: none
```

### Pattern 4: Build Cache with actions/cache

**What:** Cache `.next/cache` directory between CI runs
**When to use:** For Next.js build acceleration

```yaml
# Source: https://nextjs.org/docs/pages/guides/ci-build-caching
- name: Cache Next.js build
  uses: actions/cache@v4
  with:
    path: ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('pnpm-lock.yaml', 'next.config.*') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-
```

### Anti-Patterns to Avoid

- **Dynamic needs access in shell:** `${{ needs[job].result }}` does not work in GitHub Actions expressions inside shell scripts. Must check each job result explicitly.
- **Running coverage twice for comparison without artifacts:** The coverage action needs `json-summary-compare-path` pointing to a file from the base branch. If comparing, either use artifact upload/download between jobs or run both in the same job.
- **Caching node_modules alongside pnpm store:** The project already caches the pnpm store via `actions/setup-node`. Adding node_modules caching would be redundant and potentially cause stale-dependency bugs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path-based job filtering | Shell scripts diffing git changes | `dorny/paths-filter@v4` | Handles PR base detection, merge commits, glob matching; tested across thousands of repos |
| Coverage PR comments | Custom script to parse coverage JSON and post via gh api | `davelosert/vitest-coverage-report-action@v2` | Handles comment creation/update, formatting, comparison, permissions |
| Build cache management | Manual tar/upload/download of .next/cache | `actions/cache@v4` | Handles cache eviction, key matching, restore-keys fallback, cross-run persistence |
| Benchmark framework | Custom timing loops with performance.now() | `vitest bench` (tinybench) | Statistical rigor (warmup, iterations, percentiles, hz calculation), JSON output, --compare flag |

**Key insight:** All four capabilities have mature, purpose-built solutions. The only custom code needed is the benchmark test files themselves (`.bench.ts`) and the coverage vitest config adjustments.

## Common Pitfalls

### Pitfall 1: Missing `permissions` for Coverage PR Comment
**What goes wrong:** Coverage report action silently fails to post PR comment
**Why it happens:** Default GITHUB_TOKEN may not have `pull-requests: write` permission
**How to avoid:** Add `permissions: pull-requests: write` to the coverage job
**Warning signs:** Action succeeds but no comment appears on PR

### Pitfall 2: `json-summary` Reporter Not Configured
**What goes wrong:** `vitest-coverage-report-action` fails with "coverage-summary.json not found"
**Why it happens:** Default vitest coverage only generates `text` + `clover.xml` + `coverage-final.json`. The `json-summary` reporter must be explicitly configured.
**How to avoid:** Add `coverage.reporter: ['text', 'json-summary', 'json']` to vitest config or pass `--coverage.reporter=json-summary` on CLI
**Warning signs:** Coverage directory lacks `coverage-summary.json` file

### Pitfall 3: ci-pass Gate Treating `skipped` as Failure
**What goes wrong:** docs-only PRs fail CI because gated jobs show `skipped` instead of `success`
**Why it happens:** The existing gate checks `!= "success"` which rejects `skipped` results
**How to avoid:** Update gate to accept `success` OR `skipped` for gated jobs (D-18)
**Warning signs:** PR that only changes README.md fails ci-pass

### Pitfall 4: Benchmark Variance in CI
**What goes wrong:** Benchmarks show false regressions due to noisy CI runners
**Why it happens:** GitHub Actions runners share physical hosts; CPU throttling varies between runs
**How to avoid:** Benchmarks are informational only (D-17); use generous thresholds; focus on large regressions (>50%); use `--compare` for trend direction, not absolute values
**Warning signs:** Same code shows 20% variance between runs

### Pitfall 5: Coverage Comparison Requires Base Branch Checkout
**What goes wrong:** Coverage delta shows as "N/A" or comparison fails
**Why it happens:** `vitest-coverage-report-action` needs `json-summary-compare-path` pointing to base branch coverage. Without running coverage on the base branch, there's nothing to compare against.
**How to avoid:** Two approaches: (a) matrix strategy to test both branches then compare via artifacts, or (b) run base branch coverage in the same job before PR coverage. Approach (b) is simpler for this project.
**Warning signs:** PR comment shows absolute numbers instead of deltas

### Pitfall 6: paths-filter Needs `pull-requests: read` Permission
**What goes wrong:** paths-filter fails to detect changes or errors on API call
**Why it happens:** For pull_request events, the action uses the GitHub API to get changed files, requiring read access
**How to avoid:** Add `permissions: pull-requests: read` to the `changes` job
**Warning signs:** Filter always returns `true` or action fails with 403

### Pitfall 7: Benchmark Files Need Different Setup than Tests
**What goes wrong:** Bench files import from `@/lib/db` but get module resolution errors or missing fake-indexeddb
**Why it happens:** `vitest bench` does NOT use the `test.setupFiles` configuration by default. The bench mode has its own configuration namespace.
**How to avoid:** Either configure `benchmark.setupFiles` in vitest config or import `fake-indexeddb/auto` directly in bench files. The simplest approach: add `setupFiles` to the benchmark config section.
**Warning signs:** "indexedDB is not defined" errors when running `vitest bench`

## Code Examples

### Vitest Coverage Configuration (vitest.config.ts addition)

```typescript
// Source: https://github.com/davelosert/vitest-coverage-report-action + vitest docs
// Add to existing vitest.config.ts
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportOnFailure: true,
    },
  },
});
```

### Benchmark File Pattern (*.bench.ts)

```typescript
// Source: https://vitest.dev/api/test + tinybench docs
// File: src/__tests__/bench/migration.bench.ts
import "fake-indexeddb/auto";
import { bench, describe, beforeEach } from "vitest";
import { db } from "@/lib/db";

describe("migration chain v10-v15", () => {
  beforeEach(async () => {
    await db.delete();
  });

  bench("full migration chain open", async () => {
    await db.delete();
    // Seed at v10 (IDB version 100), then open via db.ts triggers full chain
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 100);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        (event.target as IDBOpenDBRequest).result.close();
        resolve();
      };
      request.onerror = reject;
    });
    await db.open();
    await db.close();
  }, { time: 2000, iterations: 5, warmupIterations: 1 });
});
```

### Backup Round-Trip Benchmark Pattern

```typescript
// Source: existing backup-round-trip.test.ts pattern + vitest bench API
// File: src/__tests__/bench/backup.bench.ts
import "fake-indexeddb/auto";
import { bench, describe, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { exportBackup, importBackup } from "@/lib/backup-service";
import { /* fixture makers */ } from "@/__tests__/fixtures/db-fixtures";

describe("backup round-trip", () => {
  bench("export + import 16 tables", async () => {
    // Seed all 16 tables, export, clear, import
    // ... follows existing backup-round-trip.test.ts pattern
  }, { time: 2000, iterations: 5, warmupIterations: 1 });
});
```

### Package.json Script Addition

```json
{
  "scripts": {
    "bench": "vitest bench",
    "bench:ci": "vitest bench --outputJson benchmarks/results.json"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dorny/paths-filter v3 (Node 20) | v4 (Node 24) | March 2025 | Must use v4 for forward compatibility; Node 20 deprecated in GHA |
| Manual coverage threshold checks | vitest-coverage-report-action v2 | 2024 | Automated PR comments with delta comparison |
| Committed baseline coverage on main | Dual-branch comparison in single CI run | vitest-coverage-report-action v2+ | No need to maintain coverage artifacts in git |
| Custom benchmark scripts | vitest bench (tinybench) | vitest 1.x+ | Statistical benchmarking built into test runner |

**Deprecated/outdated:**
- `dorny/paths-filter@v3`: Still works but Node 20 will be deprecated in GHA by mid-2026. Use v4.
- `vitest-coverage-report-action@v1`: Use v2 which supports comparison features.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + Playwright 1.58.2 |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `pnpm exec vitest run src/__tests__/smoke.test.ts` |
| Full suite command | `pnpm test:tz && pnpm test:e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CIOP-01 | Docs-only PR skips expensive jobs | manual-only | Requires actual PR to test path filtering | N/A -- CI behavior |
| CIOP-02 | PR receives coverage delta comment | manual-only | Requires actual PR to verify comment | N/A -- CI behavior |
| CIOP-03 | .next/cache preserved between runs | manual-only | Requires two sequential CI runs to verify | N/A -- CI behavior |
| BNCH-01 | Vitest bench baselines exist for migration + backup | smoke | `pnpm exec vitest bench --run` | Wave 0 -- needs bench files |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm typecheck` (fast validation of YAML/config syntax)
- **Per wave merge:** Full test suite + `pnpm exec vitest bench --run` (verify bench files execute)
- **Phase gate:** Push branch, open PR, verify CI workflow behaves correctly (path filtering, coverage comment, cache, benchmarks)

### Wave 0 Gaps
- [ ] `src/__tests__/bench/migration.bench.ts` -- benchmark for migration chain (BNCH-01)
- [ ] `src/__tests__/bench/backup.bench.ts` -- benchmark for backup round-trip (BNCH-01)
- [ ] `benchmarks/` directory -- baseline JSON storage (BNCH-01)
- [ ] Coverage reporter config (`json-summary`, `json`) in vitest.config.ts (CIOP-02)

## Open Questions

1. **Coverage comparison approach: same-job vs artifact-based**
   - What we know: `vitest-coverage-report-action` supports `json-summary-compare-path` for delta display. The base branch coverage must be generated within the same CI run.
   - What's unclear: Whether to (a) checkout base branch within the same job, run coverage, then checkout PR and run coverage again, or (b) use a matrix strategy with artifact upload/download between jobs. Approach (a) is simpler but slower. Approach (b) is more complex but parallelizable.
   - Recommendation: Use approach (a) -- single job, sequential. The project's test suite is fast (~15s). Running it twice is simpler than managing artifact pipelines and saves a runner allocation. Checkout base, run coverage, save summary, checkout PR, run coverage, compare.

2. **Benchmark setup files**
   - What we know: `vitest bench` uses `benchmark.include` pattern to find `.bench.ts` files. It does NOT automatically use `test.setupFiles`.
   - What's unclear: Whether vitest 4.x has a `benchmark.setupFiles` option or if bench files must self-bootstrap.
   - Recommendation: Import `fake-indexeddb/auto` directly at the top of each bench file. Simple, explicit, no config dependency.

3. **Benchmark `--compare` flag for CI regression detection**
   - What we know: `vitest bench --compare benchmarks/results.json` compares current run against a baseline. The baseline JSON must be committed.
   - What's unclear: Exact JSON format and whether comparison output includes pass/fail thresholds.
   - Recommendation: Per D-17 benchmarks are informational only. Commit initial baselines via `vitest bench --outputJson benchmarks/results.json`. CI runs `vitest bench --compare benchmarks/results.json` and outputs to logs only. No threshold enforcement.

## Sources

### Primary (HIGH confidence)
- [dorny/paths-filter GitHub](https://github.com/dorny/paths-filter) - v4.0.1 verified, YAML syntax, job-output pattern
- [davelosert/vitest-coverage-report-action GitHub](https://github.com/davelosert/vitest-coverage-report-action) - v2.9.3 latest, inputs (json-summary-compare-path, file-coverage-mode), PR comment behavior
- [Next.js CI Build Caching docs](https://nextjs.org/docs/pages/guides/ci-build-caching) - Official actions/cache@v4 YAML for .next/cache
- [Vitest benchmark config](https://vitest.dev/config/benchmark) - benchmark.include, outputJson, compare options
- [Vitest bench API](https://vitest.dev/api/test) - bench() function signature, BenchOptions (time, iterations, warmupTime, warmupIterations)
- Local verification: `pnpm exec vitest bench --help` confirms --outputJson and --compare flags in v4.0.18

### Secondary (MEDIUM confidence)
- [Medium: Vitest Code Coverage with GitHub Actions](https://medium.com/@alvarado.david/vitest-code-coverage-with-github-actions-report-compare-and-block-prs-on-low-coverage-67fceaa79a47) - Matrix strategy for dual-branch coverage comparison workflow
- [dorny/paths-filter releases](https://github.com/dorny/paths-filter/releases) - v4.0.1 released March 17, 2025

### Tertiary (LOW confidence)
- [CodSpeed blog on vitest bench CI](https://codspeed.io/blog/vitest-bench-performance-regressions) - Benchmark CI variance is a known challenge; informational-only approach is pragmatic

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All actions verified via official repos and docs; vitest bench confirmed locally
- Architecture: HIGH - Patterns from official docs + existing ci.yml provides clear extension points
- Pitfalls: HIGH - Coverage json-summary and permissions issues well-documented; benchmark variance acknowledged
- Benchmarking: MEDIUM - vitest bench API is stable but `--compare` output format not fully documented; informational-only use mitigates risk

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain; GitHub Actions and Vitest release cycles are slow)
