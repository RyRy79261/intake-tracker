# Architecture Patterns: CI & Data Integrity

**Domain:** CI pipeline, E2E testing, data integrity gates, supply chain security
**Project:** Intake Tracker v1.2
**Researched:** 2026-03-27
**Confidence:** HIGH (patterns verified against reference repo + official docs + existing codebase)

## Current State Assessment

### What Exists

| Component | State | Location |
|-----------|-------|----------|
| Vitest unit tests | 28 test files, `fake-indexeddb` setup | `src/**/*.test.ts` |
| Vitest config | Node environment, tsconfig paths | `vitest.config.ts` |
| Playwright E2E | 3 specs (auth-bypass, intake-logs, medication-wizard) | `e2e/*.spec.ts` |
| Playwright config | Chromium-only, webServer with LOCAL_AGENT_MODE | `playwright.config.ts` |
| Migration tests | v10-v15, raw IndexedDB seeding pattern | `src/__tests__/migration/` |
| Backup round-trip | Full 16-table export/import/verify | `src/__tests__/backup/round-trip.test.ts` |
| Bundle security | API key leak detection in `.next/static` | `src/__tests__/bundle-security.test.ts` |
| Test fixtures | Factory functions for all 16 table types | `src/__tests__/fixtures/db-fixtures.ts` |
| GitHub workflows | Only `version-bump.yml` (on push to main) | `.github/workflows/` |
| Coverage config | `@vitest/coverage-v8` installed, `test:coverage` script exists | `package.json` |

### What Does Not Exist

| Component | Notes |
|-----------|-------|
| CI workflow | No pull_request workflow at all |
| Lint in CI | `pnpm lint` exists but never runs automatically |
| Build verification | `pnpm build` never runs in CI |
| Typecheck in CI | No `tsc --noEmit` in any workflow or script |
| Coverage reporting | No PR comments, no baseline tracking |
| Playwright in CI | No workflow to install browsers, run E2E |
| Migration safety gates | Tests exist but nothing blocks a PR that breaks them |
| Supply chain checks | No `pnpm audit`, no lockfile integrity checks |
| Dynamic test selection | No path-based filtering |
| PR title enforcement | No conventional commits check |

## Recommended Architecture

### Workflow Topology

```
PR opened/synchronized
    |
    v
[ci.yml] ---------> detect-changes (dorny/paths-filter)
    |                    |
    |                    +---> outputs: src, db, e2e, deps
    |
    +---> lint           (always)
    +---> typecheck      (if src changed)
    +---> unit-tests     (if src changed, matrix: 3 TZ)
    +---> migration-gate (if db changed)
    +---> build          (if src changed)
    +---> bundle-security(after build, if src changed)
    +---> coverage       (after unit-tests)
    +---> e2e            (after build, if src or e2e changed)
    +---> supply-chain   (if deps changed: package.json or pnpm-lock.yaml)

[pr-title.yml] ----> conventional commits check (separate workflow)

Push to main
    |
    v
[version-bump.yml]   (existing)
[codecov-base.yml]   (new - upload baseline coverage)
```

### Single Workflow vs Multi-Workflow Decision

**Use a single `ci.yml` workflow.** Rationale:

1. The cipher-box reference repo splits into `ci.yml` + `e2e.yml` + `release-gate.yml` because it is a monorepo with separate Tauri desktop + web + API packages. This project is a single Next.js app -- the complexity overhead of multiple workflows is not justified.
2. A single workflow with `dorny/paths-filter` + conditional `needs` achieves the same selective execution.
3. GitHub's required status checks work most cleanly with jobs inside one workflow (avoids the "skipped workflow doesn't report status" footgun).

Exception: `pr-title.yml` should be its own workflow because it has a different trigger (`types: [opened, edited, synchronize]`) and no dependency on code changes.

## Component Boundaries

### New Files to Create

| File | Responsibility | Communicates With |
|------|---------------|-------------------|
| `.github/workflows/ci.yml` | Main CI orchestration | All test/lint/build jobs |
| `.github/workflows/pr-title.yml` | PR title conventional commits check | None (standalone) |
| `.github/workflows/codecov-base.yml` | Upload coverage baseline on main push | ci.yml coverage artifact |
| `src/__tests__/schema/schema-snapshot.test.ts` | Validates db.ts schema against snapshot | `db.ts` |
| `src/__tests__/schema/__snapshots__/` | Snapshot files for schema state | schema-snapshot test |
| `scripts/check-supply-chain.sh` | Package age + audit wrapper | pnpm-lock.yaml |

### Existing Files to Modify

| File | Change | Why |
|------|--------|-----|
| `playwright.config.ts` | Add CI reporter (github, blob), CI-aware webServer command | CI needs machine-readable output + built app |
| `vitest.config.ts` | Add coverage thresholds, reporters | Coverage gates + PR reporting |
| `package.json` | Add `test:migration`, `test:schema` scripts | Explicit CI entry points |

### Files That Must NOT Change

| File | Why |
|------|-----|
| `src/lib/db.ts` | This milestone is about protecting it, not changing it |
| `src/__tests__/setup.ts` | Existing setup is correct for unit tests |
| `e2e/*.spec.ts` (existing) | Existing E2E tests are valid; new tests extend, not replace |

## Data Flow: PR to CI to Feedback

```
Developer opens PR
    |
    v
GitHub triggers ci.yml (pull_request on main)
    |
    +---> dorny/paths-filter analyzes changed files
    |     outputs: { src: true, db: false, e2e: true, deps: false }
    |
    +---> lint (always): pnpm lint
    |     result: pass/fail status check
    |
    +---> typecheck (if src): npx tsc --noEmit
    |     result: pass/fail status check
    |
    +---> unit-tests (if src):
    |     matrix: [UTC, Africa/Johannesburg, Europe/Berlin]
    |     - TZ=${{ matrix.tz }} pnpm test
    |     result: pass/fail + coverage JSON artifacts (UTC run only)
    |
    +---> migration-gate (if db changed):
    |     - pnpm vitest run src/__tests__/migration/
    |     - pnpm vitest run src/__tests__/schema/
    |     - pnpm vitest run src/__tests__/backup/round-trip.test.ts
    |     result: pass/fail (BLOCKING -- protects live data)
    |
    +---> build (if src): pnpm build
    |     result: pass/fail + .next/ artifact for downstream
    |
    +---> bundle-security (after build):
    |     - pnpm vitest run src/__tests__/bundle-security.test.ts
    |     result: pass/fail (verifies no API key leaks)
    |
    +---> e2e (after build, if src|e2e):
    |     - Install Playwright Chromium
    |     - NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm exec playwright test
    |     result: pass/fail + playwright-report artifact
    |
    +---> coverage (after unit-tests):
    |     - davelosert/vitest-coverage-report-action
    |     result: PR comment with coverage summary + delta
    |
    +---> supply-chain (if deps):
    |     - pnpm install --frozen-lockfile
    |     - pnpm audit --audit-level=high
    |     result: pass/fail
    |
    v
All checks reported as GitHub status checks
PR mergeable only if all required checks pass
```

## CI Job Dependency Graph

```
detect-changes ----+
    |               |
    v               v
  lint          pr-title (separate workflow)
    |
    +---> typecheck ------+
    |                     |
    +---> unit-tests --+  |
    |     (matrix: 3)  |  |
    |                  v  v
    |              coverage
    |
    +---> migration-gate (if db changed)
    |
    +---> build ----------+
    |                     |
    +---> bundle-security (after build)
    |                     |
    +---> e2e (after build)
    |
    +---> supply-chain (if deps changed)
```

Jobs that must be required status checks for merge:
- `lint`
- `typecheck` (when triggered)
- `unit-tests` (when triggered)
- `migration-gate` (when triggered)
- `build` (when triggered)
- `e2e` (when triggered)

Jobs that inform but should not block merge:
- `coverage` (provides PR comment; threshold enforcement is in vitest config)
- `pr-title` (enforce once commit conventions are stable)

## Patterns to Follow

### Pattern 1: Path-Based Change Detection

**What:** Use `dorny/paths-filter@v3` as the first job to conditionally skip expensive jobs when irrelevant files change.

**When:** Every PR workflow invocation.

**Implementation:**

```yaml
jobs:
  detect-changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      src: ${{ steps.filter.outputs.src }}
      db: ${{ steps.filter.outputs.db }}
      e2e: ${{ steps.filter.outputs.e2e }}
      deps: ${{ steps.filter.outputs.deps }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            src:
              - 'src/**'
              - 'public/**'
              - 'next.config.js'
              - 'tsconfig.json'
              - 'tailwind.config.ts'
              - 'postcss.config.js'
            db:
              - 'src/lib/db.ts'
              - 'src/lib/*-service.ts'
              - 'src/__tests__/migration/**'
              - 'src/__tests__/backup/**'
              - 'src/__tests__/schema/**'
            e2e:
              - 'e2e/**'
              - 'playwright.config.ts'
            deps:
              - 'package.json'
              - 'pnpm-lock.yaml'
```

**Why this filter set:** The `db` filter is deliberately broad -- any change to a service file could introduce a query against a new index or column that requires a migration. Catching this early prevents "works on dev, breaks on upgrade" scenarios.

### Pattern 2: Migration Safety Gate

**What:** A dedicated job that runs migration tests, schema snapshot tests, and backup round-trip verification whenever `db.ts` or service files change.

**When:** Any PR touching data layer files.

The migration gate has three sub-checks:

1. **Migration chain tests** (`src/__tests__/migration/v*.test.ts`): Verify each upgrade path produces correct data. Already exist for v10-v15.

2. **Schema snapshot test** (NEW): Extract the current Dexie schema definitions programmatically and compare against a committed snapshot. If the schema changes, the snapshot must be explicitly updated -- forcing the developer to acknowledge they are changing the data model.

```typescript
// src/__tests__/schema/schema-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

describe("schema snapshot", () => {
  it("current schema matches committed snapshot", () => {
    const schema = db.tables.map(t => ({
      name: t.name,
      schema: t.schema.primKey.src + ", " +
        t.schema.indexes.map(i => i.src).join(", "),
    })).sort((a, b) => a.name.localeCompare(b.name));

    expect(schema).toMatchSnapshot();
  });

  it("database version is expected value", () => {
    // Dexie multiplies by 10 internally. Declared latest is v15.
    expect(db.verno).toBe(15);
  });
});
```

3. **Backup round-trip** (`src/__tests__/backup/round-trip.test.ts`): Already exists. Ensures export + clear + import restores all 16 tables. Include in the gate because a schema change that breaks serialization would destroy user data.

**Why this is the most important CI check:** The user's production data lives on their phone in IndexedDB with no server-side backup. A bad migration or broken backup means irrecoverable data loss.

### Pattern 3: Timezone Dual-Pass Testing

**What:** Run the full unit test suite three times under different TZ environment variables.

**When:** Any PR touching `src/**`.

```yaml
unit-tests:
  needs: [detect-changes, lint]
  if: needs.detect-changes.outputs.src == 'true'
  runs-on: ubuntu-latest
  strategy:
    matrix:
      tz: ['UTC', 'Africa/Johannesburg', 'Europe/Berlin']
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: actions/setup-node@v4
      with: { node-version: '18', cache: 'pnpm' }
    - run: pnpm install --frozen-lockfile
    - name: Run tests (TZ=${{ matrix.tz }})
      run: pnpm test
      env:
        TZ: ${{ matrix.tz }}
    - name: Generate coverage (UTC only)
      if: matrix.tz == 'UTC'
      run: pnpm test:coverage
    - uses: actions/upload-artifact@v4
      if: matrix.tz == 'UTC'
      with:
        name: coverage
        path: coverage/
```

**Why:** The user travels between South Africa and Germany. Timezone-dependent bugs in date parsing, schedule generation, and migration backfill are the project's #1 historical bug category. The existing `test:tz:sa` and `test:tz:de` scripts prove this was already a concern.

Only the UTC pass generates coverage to avoid double-counting.

### Pattern 4: E2E with Build Artifact Reuse

**What:** Build once, reuse the `.next/` output for both bundle-security and E2E tests.

**When:** E2E tests need a running server.

```yaml
build:
  needs: [detect-changes, typecheck]
  if: needs.detect-changes.outputs.src == 'true'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    # ... setup pnpm, node, install
    - run: pnpm build
    - uses: actions/upload-artifact@v4
      with:
        name: nextjs-build
        path: .next/
        retention-days: 1

e2e:
  needs: [detect-changes, build]
  if: >-
    needs.detect-changes.outputs.src == 'true' ||
    needs.detect-changes.outputs.e2e == 'true'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    # ... setup pnpm, node, install
    - uses: actions/download-artifact@v4
      with: { name: nextjs-build, path: .next/ }
    - run: pnpm exec playwright install chromium --with-deps
    - run: pnpm exec playwright test
      env:
        CI: true
        NEXT_PUBLIC_LOCAL_AGENT_MODE: true
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
```

**Recommended change to `playwright.config.ts`:**

The existing config uses `pnpm run dev` for the webServer. In CI, use `pnpm start` against the built artifact instead -- it is faster and catches production build issues (especially with next-pwa which is disabled in development):

```typescript
webServer: {
  command: process.env.CI
    ? 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm start'
    : 'NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm run dev',
  url: 'http://localhost:3000',
  reuseExistingServer: !process.env.CI,
  stdout: 'pipe',
  stderr: 'pipe',
  timeout: 120 * 1000,
},
```

### Pattern 5: Coverage Tracking with PR Comments

**What:** Generate coverage report on PRs, post as comment, enforce minimum thresholds.

**When:** Every PR with source code changes.

```yaml
coverage:
  needs: [unit-tests]
  runs-on: ubuntu-latest
  permissions:
    pull-requests: write
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with: { name: coverage, path: coverage/ }
    - uses: davelosert/vitest-coverage-report-action@v2
      with:
        json-summary-path: coverage/coverage-summary.json
        json-final-path: coverage/coverage-final.json
```

**Vitest config addition:**

```typescript
// vitest.config.ts
test: {
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary", "json", "lcov"],
    reportsDirectory: "coverage",
    thresholds: {
      // Start conservative, ratchet up over time
      statements: 40,
      branches: 30,
      functions: 35,
      lines: 40,
    },
  },
}
```

**Why start with low thresholds:** The codebase is ~44K LOC with 28 test files. Attempting to enforce 80% coverage from day one would block all PRs. Measure current coverage first, set thresholds 2% below that, then ratchet up as tests are added.

### Pattern 6: Supply Chain Hardening

**What:** Audit dependencies, verify lockfile integrity, optionally block packages newer than 24 hours.

**When:** Any PR changing `package.json` or `pnpm-lock.yaml`.

```yaml
supply-chain:
  needs: [detect-changes]
  if: needs.detect-changes.outputs.deps == 'true'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 10 }
    - uses: actions/setup-node@v4
      with: { node-version: '18', cache: 'pnpm' }
    - name: Verify lockfile integrity
      run: pnpm install --frozen-lockfile
    - name: Audit for high/critical vulnerabilities
      run: pnpm audit --audit-level=high
    - name: Check package ages (24h minimum)
      run: bash scripts/check-supply-chain.sh
```

The `check-supply-chain.sh` script should:
1. Parse `pnpm-lock.yaml` for new/changed packages (diff against main)
2. Query npm registry for publish dates
3. Fail if any newly-added package was published less than 24 hours ago

**Why 24 hours:** The npm "Shai Hulud" attack (September 2025) and the self-replicating worm (November 2025) both relied on rapid compromise followed by quick installations. A 24-hour delay gives the community time to detect and report malicious packages.

### Pattern 7: Fail-Fast with Lint Gate

**What:** Lint runs unconditionally and fast. Expensive jobs wait for lint to pass.

**When:** Every PR.

**Why:** No point running 2-minute E2E tests if there are lint errors.

```yaml
typecheck:
  needs: [detect-changes, lint]  # lint must pass first
  if: needs.detect-changes.outputs.src == 'true'

unit-tests:
  needs: [detect-changes, lint]  # lint must pass first
  if: needs.detect-changes.outputs.src == 'true'
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running All Tests on Every PR

**What:** No path filtering -- every PR runs lint, typecheck, all unit tests, build, E2E, and supply chain regardless of what changed.

**Why bad:** A README-only change would take 8+ minutes. Developers stop waiting for CI and merge without green checks.

**Instead:** Use `dorny/paths-filter` to skip irrelevant jobs. A docs-only PR should complete in under 60 seconds (just lint + pr-title).

### Anti-Pattern 2: E2E Tests Against Dev Server in CI

**What:** Using `pnpm dev` for Playwright tests in CI.

**Why bad:** Dev server is slower to start, includes HMR overhead, and can mask production build issues (especially with next-pwa which is disabled in development via `next.config.js`).

**Instead:** Build first with `pnpm build`, then run E2E against `pnpm start`. This also catches build-time errors before E2E runs.

### Anti-Pattern 3: Schema Snapshot Without Explicit Update Path

**What:** Adding a snapshot test for the Dexie schema but not documenting how to update it.

**Why bad:** Developers change `db.ts`, CI fails with "snapshot mismatch", they run `--updateSnapshot` reflexively without reviewing the diff. The safety gate becomes theater.

**Instead:** Document the update command. The PR diff will show the snapshot change, making schema changes reviewable.

### Anti-Pattern 4: Coverage Thresholds That Block Everything

**What:** Setting coverage thresholds at 80% on day one.

**Why bad:** Existing coverage is likely 40-50%. Every PR would fail until massive test backfill is done, paralyzing development.

**Instead:** Measure current coverage, set thresholds 2% below that, ratchet up over time. Never let thresholds drop.

### Anti-Pattern 5: `pnpm audit` Blocking on Moderate Vulnerabilities

**What:** Running `pnpm audit` with default severity (all levels).

**Why bad:** Moderate vulnerabilities in deep transitive dependencies are common and often irrelevant to the actual attack surface. Blocking on every moderate finding creates alert fatigue.

**Instead:** Use `--audit-level=high` to only block on high and critical.

### Anti-Pattern 6: E2E Tests Without Failure Artifacts

**What:** E2E tests fail in CI with no trace or screenshot to debug.

**Why bad:** Impossible to diagnose without reproducing locally. Wastes hours.

**Instead:** Upload Playwright HTML report + traces as artifacts on failure (`if: always()` on artifact upload step).

### Anti-Pattern 7: Monolithic CI Job

**What:** Single job that runs lint, typecheck, test, build, E2E sequentially.

**Why bad:** 10+ minute CI times. One failure blocks all feedback. Cannot skip irrelevant checks.

**Instead:** Parallel jobs with change detection. Each job takes 1-3 minutes.

## Dexie Migration Safety: Deep Dive

### Why Migrations Are the Critical Path

The user's production data lives exclusively in IndexedDB on their phone. There is no server-side backup, no cloud sync. A bad migration means:

1. **Data loss**: If a migration drops or corrupts records, there is no recovery path
2. **Stuck app**: If a migration throws, Dexie refuses to open the database -- the app becomes completely unusable
3. **Silent corruption**: If a migration transforms data incorrectly (e.g., wrong timezone backfill), the user sees wrong data with no indication it was corrupted

### How Current Migration Tests Work

Each migration test (v10-v15) follows this pattern:

1. Open raw IndexedDB at the previous version number (Dexie multiplies by 10, so v14 = IDB version 140)
2. Seed records with the previous schema shape via raw IDB API
3. Close the raw connection
4. Open via `db.ts` (Dexie) -- this triggers the upgrade chain
5. Assert records survived with correct data

This is the correct pattern. The CI migration gate must run these tests.

### What the Schema Snapshot Adds

The migration tests verify that upgrades work. The schema snapshot verifies that the current schema definition hasn't changed accidentally. These are complementary:

- Migration tests catch: "upgrade from v14 to v15 corrupts data"
- Schema snapshot catches: "someone removed an index from v15 without creating v16"

### Migration Safety Rules (Enforce via PR Review)

1. **Never modify an existing version definition** -- always create a new version
2. **Always add a migration test for new versions** -- CI will run it
3. **Always update the schema snapshot** -- CI will fail until it is updated
4. **Test upgrade from N-1 to N** -- the most common real-world path
5. **Backup round-trip must pass** -- if serialization breaks, data is unrecoverable

## E2E Test Structure Recommendations

### Current State

Three tests exist, all basic happy-path flows:
- `auth-bypass.spec.ts` -- verifies LOCAL_AGENT_MODE works
- `intake-logs.spec.ts` -- adds water and salt entries
- `medication-wizard.spec.ts` -- full wizard flow with mocked AI

### Recommended Expansion Strategy

Organize E2E tests by feature domain, mirroring the route structure:

```
e2e/
  auth-bypass.spec.ts          (existing)
  intake/
    water-salt.spec.ts         (extracted from existing)
    liquid-presets.spec.ts     (NEW: test preset flow)
    food-entry.spec.ts         (NEW: AI parse mock + composable entry)
  medications/
    wizard.spec.ts             (extracted from existing)
    dose-logging.spec.ts       (NEW: mark taken/skipped/rescheduled)
    inventory.spec.ts          (NEW: stock tracking, refill flow)
  settings/
    preferences.spec.ts        (NEW: day-start-hour, theme toggle)
    backup-restore.spec.ts     (NEW: export + import via UI)
  cross-domain/
    composable-entries.spec.ts (NEW: food parse creates linked records)
```

### E2E Test Principles

1. **Mock all AI routes** -- the existing `medication-wizard.spec.ts` already does this correctly with `page.route()`. Apply the same pattern to food parse and substance lookup.
2. **Test user workflows, not implementation** -- "Add water, verify toast, check history" rather than testing specific CSS selectors.
3. **Seed data where needed** -- For tests that need existing prescriptions, use `page.evaluate()` to insert via Dexie directly rather than navigating through the wizard every time.
4. **No cross-test dependencies** -- Each spec must work independently. IndexedDB is ephemeral per browser context in Playwright.

## Required GitHub Secrets

| Secret | Purpose | Required For |
|--------|---------|-------------|
| None for basic CI | Unit tests, lint, build, E2E all work without secrets | ci.yml |
| `CODECOV_TOKEN` | Coverage upload to Codecov (optional) | codecov-base.yml |

The app's AI routes require `ANTHROPIC_API_KEY` but E2E tests mock these routes, so no API key is needed in CI. The `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` flag bypasses auth. This is a significant advantage -- the CI pipeline requires zero secrets for all critical checks.

## Scalability Considerations

| Concern | Now (3 E2E, 28 unit) | At 30 E2E, 100 unit | At 100+ E2E, 500 unit |
|---------|----------------------|----------------------|-----------------------|
| CI time | ~5 min total | ~8 min total | Shard Vitest + Playwright |
| Flakiness | Negligible | Retry on first failure | Quarantine flaky tests |
| Browser coverage | Chromium only | Still Chromium only | Add Firefox for regression |
| Build caching | Not needed | Cache .next/cache | Essential for speed |
| Artifact storage | Minimal | ~50MB reports | Reduce retention-days |

Chromium-only E2E is correct for the foreseeable future because the app is a mobile PWA primarily used in Chrome/Chromium-based browsers.

## Suggested Build Order

Based on dependency analysis, the recommended implementation order:

### Phase 1: Foundation (Zero Dependencies)

**Build:** `ci.yml` with lint + typecheck + unit tests (including TZ matrix)

**Rationale:** These jobs run existing scripts (`pnpm lint`, `pnpm test`) in a workflow. Immediately provides value by catching regressions on every PR. No new files or code changes beyond the workflow file.

**Files created:**
- `.github/workflows/ci.yml` (initial: lint, typecheck, unit-tests jobs only)

### Phase 2: Build Verification + Bundle Security

**Build:** Add `build` job to `ci.yml`, run `bundle-security.test.ts` post-build

**Rationale:** The bundle-security test already exists but requires a build artifact. Running it in CI catches API key leaks automatically.

**Files modified:**
- `.github/workflows/ci.yml` (add build + bundle-security jobs)
- `playwright.config.ts` (add CI-aware webServer command)

### Phase 3: E2E in CI

**Build:** Add `e2e` job to `ci.yml` using build artifact from Phase 2

**Rationale:** The 3 existing E2E tests run without any code changes. This phase is purely CI wiring.

**Files modified:**
- `.github/workflows/ci.yml` (add e2e job with Playwright install + artifact upload)

### Phase 4: Data Integrity Gates

**Build:** Schema snapshot test + migration gate job

**Rationale:** Highest-value safety feature but requires writing new test code (schema snapshot). Placed after basic CI is running so there is an existing feedback loop.

**Files created:**
- `src/__tests__/schema/schema-snapshot.test.ts`
- `src/__tests__/schema/__snapshots__/` (generated by vitest)

**Files modified:**
- `.github/workflows/ci.yml` (add migration-gate job)
- `package.json` (add `test:migration` script)

### Phase 5: Coverage Tracking

**Build:** Add coverage reporting to PRs + baseline uploads on main

**Rationale:** Depends on unit tests being stable in CI (Phase 1). Adding coverage too early risks noisy PR comments on a still-stabilizing pipeline.

**Files created:**
- `.github/workflows/codecov-base.yml`

**Files modified:**
- `vitest.config.ts` (add coverage thresholds + reporters)
- `.github/workflows/ci.yml` (add coverage job)

### Phase 6: Supply Chain Security

**Build:** Audit + lockfile integrity + package age checks

**Rationale:** Only triggers on dependency changes (rare) and has the most complexity (package age script). Other phases provide more immediate value.

**Files created:**
- `scripts/check-supply-chain.sh`

**Files modified:**
- `.github/workflows/ci.yml` (add supply-chain job)

### Phase 7: Dynamic Test Selection + PR Title

**Build:** Path filtering via `dorny/paths-filter` + PR title lint workflow

**Rationale:** Optimization phase. CI works without path filtering -- it just runs everything. Adding `detect-changes` reduces CI time for focused PRs but is not correctness-critical. PR title enforcement is polish.

**Files created:**
- `.github/workflows/pr-title.yml`

**Files modified:**
- `.github/workflows/ci.yml` (add detect-changes job, wire `if` conditions)

### Alternative: Combine Phases 1-3 Into One

Phases 1-3 are all "wire existing functionality into CI" with no new test code. A confident implementer could build all three in a single phase. The split above is for risk management -- if CI configuration has issues, smaller phases are easier to debug.

## Sources

- [Playwright CI setup](https://playwright.dev/docs/ci-intro) -- official Playwright CI documentation (HIGH confidence)
- [dorny/paths-filter](https://github.com/dorny/paths-filter) -- GitHub Action for path-based filtering (HIGH confidence)
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action) -- Coverage PR comments (HIGH confidence)
- [pnpm audit CLI docs](https://pnpm.io/cli/audit) -- Supply chain auditing (HIGH confidence)
- [cipher-box reference repo](https://github.com/FSM1/cipher-box/tree/main/.github) -- Workflow structure patterns (HIGH confidence, directly examined)
- [npm Supply Chain Attack Analysis 2025](https://www.propelcode.ai/blog/npm-supply-chain-attack-analysis-2025) -- Context for 24h package age rule (MEDIUM confidence)
- [fake-indexeddb](https://www.npmjs.com/package/fake-indexeddb) -- Already in use for Dexie testing in CI (HIGH confidence, in codebase)
