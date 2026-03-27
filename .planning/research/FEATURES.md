# Feature Landscape: CI & Data Integrity

**Domain:** CI pipeline, automated testing, data integrity protection, supply chain security for an offline-first PWA
**Researched:** 2026-03-27
**Confidence:** HIGH (well-established ecosystem; tools are mature; patterns are documented by GitHub, Playwright, Vitest, and pnpm officially)

---

## 1. Data Integrity Protection

The most unusual domain here. Traditional CI data integrity means "protect the production database." This app has no server-side database for user data -- all health data lives in IndexedDB on the user's phone. A bad migration shipped to production silently corrupts irreplaceable medical records. CI must catch schema/migration regressions *before* they reach the user's device.

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| Migration round-trip tests (v10 through v15) | Each Dexie version upgrade must be verified to not lose data. Dexie runs upgrade functions sequentially -- a broken v12 upgrade poisons all subsequent versions. | LOW | YES -- 6 migration test files exist covering v10-v15 | Already solid. CI just needs to run them reliably. |
| Backup export/import round-trip test | Verifies all 16 tables survive export-to-JSON and re-import without data loss. The only disaster recovery mechanism for on-device data. | LOW | YES -- `round-trip.test.ts` covers all 16 tables, merge/replace modes, conflict detection | Already built. CI runs it. |
| Schema version consistency check | Detects when a developer adds a new Dexie version but forgets to repeat all store definitions (Dexie requires full schema each version). Currently a manual discipline. | MEDIUM | NO | **New feature.** Write a unit test that programmatically extracts store definitions from each `db.version(N).stores()` call and verifies the final version includes all tables from all prior versions. This is the single highest-value data integrity gate for this codebase specifically. |
| TypeScript strict mode in CI | Catches type mismatches between Dexie interfaces and service layer. A `number` field silently becoming `string | number` after a migration would break queries. | LOW | PARTIAL -- `strict: true` in tsconfig, but `tsc --noEmit` not enforced in CI | Add `tsc --noEmit` as a CI step. |
| Build succeeds (no compile errors) | `pnpm build` must pass. Catches Next.js build-time errors including missing imports, bad dynamic routes, etc. | LOW | NO CI workflow exists yet | Table stakes for any CI pipeline. |
| Bundle security scan (no leaked API keys) | Existing `bundle-security.test.ts` scans `.next/static` for API key patterns. Must run post-build. | LOW | YES -- test exists but requires `pnpm build` first | Wire into CI: build then run bundle security test. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Schema drift detection (declared vs actual) | Programmatically compare Dexie's declared schema (from `db.version(N).stores()`) against what fake-indexeddb actually creates. Catches index mismatches, missing fields, and upgrade functions that silently skip records. Dexie has no built-in API for this (confirmed via Issue #950). | MEDIUM | Write a test that opens DB dynamically after all upgrades, extracts actual table/index structure, and compares against declared schema. Uses the approach from Dexie maintainer David Fahlander's workaround: `db.tables.map(t => ({ name: t.name, schema: t.schema }))`. |
| Table count sentinel test | Hard-code expected table count (currently 16) and fail CI if it changes without updating the sentinel + backup service + fixture factory. Prevents adding a Dexie table while forgetting to update backup/restore. | LOW | Simple assertion: `expect(db.tables.length).toBe(16)`. The value is that it forces developers to consciously acknowledge new tables across the entire data pipeline. |
| Upgrade path smoke test (v10 raw IDB to current) | Seed raw IndexedDB at v10 level (IDB version 100) with realistic fixture data, then open via `db.ts` to trigger the full v10->v15 upgrade chain. Verify zero data loss. | MEDIUM | The v15 migration test already does a version of this (seeds at v14=IDB 140). Extend to cover the full chain from v10. This catches cross-version interaction bugs. |
| Migration idempotency check | Run the same migration twice and verify no duplicate records or corrupted state. Dexie upgrade functions run exactly once per version, but this guards against developer mistakes where upgrades have side effects that break on re-open. | LOW | Open db, close, re-open. Count records. Should be identical. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual schema diffing tool (like Prisma Migrate) | Dexie is not a server DB with DDL. IndexedDB schema changes are imperative (upgrade functions), not declarative. Building a visual diff tool is massive overhead for a 16-table schema. | Sentinel test + schema drift detection test cover the same ground at 1% of the cost. |
| Automated rollback on schema failure | Dexie/IndexedDB cannot downgrade versions (Issue #1599). A lower version number causes `VersionError` and the DB refuses to open. Rolling back a deployed migration requires deleting the entire database. | Prevent bad migrations from shipping via CI gates. Backup/restore is the recovery mechanism. |
| Production data snapshot testing | User's real data is on their phone. No way to pull it into CI. Running tests against "production-like" data requires synthetic fixtures. | Comprehensive fixture factory (already exists in `db-fixtures.ts`) with realistic data shapes. |
| Schema migration approval workflow (manual gate) | Overkill for a single-developer project. The goal is automated detection, not process. | CI fails automatically on schema issues. Developer reviews the failure and fixes. |

---

## 2. E2E UI Testing (Playwright)

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| Auth bypass for test execution | Tests must not require real Privy authentication. | LOW | YES -- `LOCAL_AGENT_MODE=true` env var bypasses Privy | Already working. |
| Core user workflow tests | Intake logging (water, salt), medication wizard, navigation between pages. Tests that exercise the primary user journeys. | MEDIUM | PARTIAL -- 3 basic tests exist (auth bypass, intake logs, medication wizard) | Existing tests are thin. Medication wizard test is good (mocks AI, walks through 6 steps). Intake test just clicks "Confirm Entry" once. Need deeper scenario coverage. |
| AI route mocking | AI API calls (`/api/ai/parse`, `/api/ai/medicine-search`, `/api/ai/substance-lookup`) must be mocked in E2E tests to avoid hitting real APIs, avoid flakiness from network issues, and avoid cost. | LOW | PARTIAL -- medication wizard mocks `medicine-search` via `page.route()` | Extend pattern to all AI routes. |
| CI-compatible configuration | Single worker on CI (avoids race conditions), retries for flakiness, trace collection on failure. | LOW | YES -- `playwright.config.ts` already has CI-aware settings (`workers: 1`, `retries: 2`, `trace: 'on-first-retry'`) | Good foundation. |
| Chromium-only testing | PWA is mobile-focused, single-user. Testing Firefox/Safari/WebKit adds CI time without meaningful coverage for this use case. | LOW | YES -- config only has Chromium project | Correct decision. Keep it. |
| Artifact upload on failure | Playwright traces and screenshots must be uploadable from CI for debugging. | LOW | NO -- no CI workflow exists | Standard pattern: `actions/upload-artifact` with `if: failure()` condition. 7-day retention. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Medication lifecycle E2E test | Full prescription lifecycle: create via wizard, log a dose, check inventory decrement, skip a dose with reason, verify history. This is the most complex user workflow and the most likely to regress. | HIGH | The medication wizard test is a starting point. Needs to continue beyond creation into the dose logging and inventory flow. |
| Composable entry E2E test | Test the AI food parse flow: enter food description, verify preview shows linked water + salt + eating records, confirm, verify all records exist, delete primary record, verify cascade. | HIGH | Exercises the composable data model end-to-end through real UI. Highest-value new E2E test. |
| Settings persistence E2E test | Change day-start-hour, theme, limits in settings. Navigate away. Return. Verify settings persisted. Tests Zustand localStorage persistence through real browser. | LOW | Low effort, catches real bugs (localStorage quota, serialization issues). |
| Backup/restore E2E test | Export backup via UI, clear data, import backup, verify records restored. Tests the actual File API / download flow that unit tests cannot exercise. | MEDIUM | Playwright can intercept downloads and trigger file uploads. Tests the full browser-level backup flow. |
| Mobile viewport testing | Run tests at 375px width (iPhone SE) since the app is mobile-focused (max-w-lg container). Catches responsive layout regressions. | LOW | Add a Playwright project with `devices['iPhone 13']`. Runs same tests at mobile dimensions. |
| `--only-changed` for PR speed | Playwright v1.46+ supports `--only-changed=origin/$GITHUB_BASE_REF` to run only tests affected by changed files. On a feature branch that only changes the settings page, skip medication wizard tests. | LOW | Requires `fetch-depth: 0` in checkout action. Known issue: "dubious ownership" errors in GitHub Actions require `git config --global --add safe.directory`. Use as a "fast feedback" job, not a replacement for full suite. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Visual regression testing (screenshot comparison) | The app is pre-refinement (per memory notes). UI is actively changing. Screenshot comparisons would fail constantly and train developers to ignore failures. | Functional assertions (element visible, text content, navigation works). Add visual regression only after UI stabilizes. |
| Multi-browser testing (Firefox, WebKit) | Single-user PWA. The user uses Chrome on Android. Firefox/WebKit testing adds 2-3x CI time for bugs that will never affect the real user. | Chromium-only. Revisit if the app gets external users. |
| Service worker / offline testing in CI | Playwright has experimental service worker support, but it is unreliable in headless CI environments. next-pwa's service worker is generated at build time and difficult to test meaningfully in CI. | Test service worker registration manually on the real device. Focus CI E2E on application logic, not browser platform features. |
| Playwright sharding | With ~5-10 E2E tests, sharding across 4 workers would create more overhead than savings. Sharding pays off at 50+ tests taking 10+ minutes. | Run all tests in a single job. Revisit when test count justifies the complexity. |
| Playwright UI mode in CI | Interactive debugging tool. Useful locally, useless in headless CI. | Use trace viewer for CI failure debugging. Traces are non-interactive and uploadable as artifacts. |

---

## 3. Dynamic Test Selection

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| Vitest `--changed` flag | Run only unit tests affected by changed files. Vitest traces imports from changed source files to their test files. Default behavior: changes to `vitest.config.ts` or `package.json` trigger full suite rerun. | LOW | NO -- not configured | Add `vitest run --changed=HEAD~1` (or `--changed=origin/main` on PRs) as a fast-feedback CI job. Full suite still runs as a separate job. |
| Playwright `--only-changed` | Run only E2E tests whose spec files or imported utilities changed. Playwright v1.46+ traces import graphs. | LOW | NO -- not configured | Add as a "fast E2E" CI job alongside the full suite. Use `--only-changed=origin/$GITHUB_BASE_REF`. |
| `forceRerunTriggers` for critical files | When `db.ts`, `backup-service.ts`, or `vitest.config.ts` change, rerun the entire test suite regardless of affected-file analysis. These files affect everything. | LOW | NO | Configure in `vitest.config.ts`: `forceRerunTriggers: ['**/db.ts', '**/backup-service.ts', '**/vitest.config.ts', '**/package.json']`. |
| Path-based workflow filtering | GitHub Actions `paths` filter on workflow triggers. Don't run E2E tests when only `.md` files or `.planning/` changed. | LOW | NO -- no CI workflow exists | Use `paths-ignore: ['**.md', '.planning/**', 'docs/**']` on workflow triggers, or use dorny/paths-filter for job-level filtering (as seen in cipher-box reference repo). |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Two-tier CI: fast feedback + full suite | Job 1: lint + typecheck + `vitest --changed` + `playwright --only-changed` (runs in ~1-2 min). Job 2: full `vitest run` + full `playwright test` (runs in ~5-10 min). Developer gets fast signal while full validation runs in parallel. | MEDIUM | Requires two workflow jobs with different triggers. Fast job blocks merge only if it fails. Full job is the actual merge gate. |
| dorny/paths-filter for job-level routing | Skip entire CI jobs based on which files changed. E.g., if only `src/lib/medication-service.ts` changed, skip the supply chain security audit job entirely. More granular than `paths` at workflow level. | LOW | Proven pattern from cipher-box reference repo. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom dependency graph analysis | Building a bespoke "which tests are affected by this source file" resolver. Vitest and Playwright already do this natively via import tracing. | Use built-in `--changed` and `--only-changed` flags. |
| Test impact analysis via code coverage mapping | Tools like Launchable or Codecov's test selection use historical coverage data to predict affected tests. Massive complexity, requires a coverage database, and is designed for 1000+ test suites. | Overkill for 203 unit tests and ~10 E2E tests. Built-in `--changed` flags are sufficient. |
| Skipping tests based on file extension patterns | "Only run tests if .ts files changed" -- too coarse. A changed `.css` file can break visual layouts that E2E tests catch. | Use import-graph-based analysis (Vitest/Playwright built-in), not file extension heuristics. |

---

## 4. Code Coverage

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| V8 coverage provider in Vitest | `@vitest/coverage-v8` is already a devDependency. V8 provider is faster than Istanbul and works with TypeScript without extra transforms. | LOW | PARTIAL -- package installed, `test:coverage` script exists, but no CI integration or thresholds | Wire into CI. |
| Coverage summary on PRs | Post a coverage comment on each PR showing overall coverage and per-file coverage for changed files. | LOW | NO | Use `davelosert/vitest-coverage-report-action` -- the standard GitHub Action for Vitest coverage. Requires `json-summary` and `json` reporters. |
| Coverage thresholds | Fail CI if coverage drops below a minimum. Prevents gradual erosion. | LOW | NO | Set in `vitest.config.ts`: `coverage: { thresholds: { lines: 70, functions: 70, branches: 60 } }`. Start with realistic thresholds based on current coverage, then ratchet up. Do not set 80%+ initially -- it will block productive work. |
| Coverage reporters for CI | Generate `json-summary` (for PR comments), `json` (for file-level details), and `text` (for console output). | LOW | NO -- only `--coverage` flag exists | Configure in `vitest.config.ts` under `coverage.reporter`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Coverage ratcheting | Never allow coverage to decrease. Track the "high water mark" and update thresholds in config as coverage improves. | LOW | Manual process: after each milestone, update thresholds to current coverage level. No tooling needed. |
| Separate coverage for migration tests | Track migration test coverage independently. These tests are the most critical (data integrity) but cover a small code surface. High coverage on `db.ts` upgrade functions is more important than high coverage on UI components. | MEDIUM | Run migration tests with `--coverage` in a separate Vitest project/config. Report separately. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| 100% coverage target | Forces writing meaningless tests for trivial code (type exports, re-exports, simple getters). Creates test maintenance burden without improving confidence. | Set pragmatic thresholds (70-80% lines). Focus coverage effort on services and data layer, not UI components. |
| Coverage badges in README | Vanity metric for a single-developer project. No external audience to impress. | Coverage is reported on PRs where it matters for decision-making. |
| Codecov / Coveralls integration | Third-party services add complexity (token management, API flakiness) for a single-developer project. The GitHub Action provides the same PR comment functionality without a third-party dependency. | Use `davelosert/vitest-coverage-report-action` for PR comments. Self-contained, no external service. |

---

## 5. Benchmarking

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| Build time tracking | Track `pnpm build` duration across PRs. A build that goes from 30s to 120s indicates a problem. | LOW | NO | Log build duration in CI via GitHub Actions step timing. No special tooling needed. |
| Test suite duration tracking | Track total Vitest and Playwright run times. Catch regressions in test speed. | LOW | NO | GitHub Actions natively shows step durations. Sufficient for a 44K LOC app. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Vitest bench for service layer | Benchmark critical service functions (backup export, migration upgrade, analytics aggregation) using Vitest's experimental `bench` API. Track `ops/sec` across PRs. | MEDIUM | Vitest bench is still experimental. Use `github-action-benchmark` to store results and comment on PRs with regression alerts. `@codspeed/vitest-plugin` provides more consistent measurement in CI by using instrumented execution instead of wall-clock time, but adds a third-party dependency. |
| IndexedDB operation benchmarks | Benchmark bulk insert/query times for realistic record counts (100, 1000, 10000 records across 16 tables). Catches performance regressions in Dexie queries or index misconfiguration. | MEDIUM | Relevant because the app will accumulate years of health data. A query that is fast with 100 records but slow with 10000 records is a real production bug. Uses fake-indexeddb, so measures algorithmic performance not browser IDB speed. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Flame graph generation in CI | CI environments have inconsistent CPU profiles. Flame graphs from GH Actions runners are not comparable across runs due to noisy neighbors, varying CPU frequency, and containerization overhead. | Run flame graphs locally when investigating a specific performance issue. CI benchmarks should use `ops/sec` or duration-based metrics. |
| Lighthouse CI | Measures runtime performance, accessibility, SEO in a headless browser. Useful for public-facing websites. For a single-user PWA where the user is also the developer, the signal-to-noise ratio is low. | If performance profiling is needed, run Lighthouse locally. Don't gate CI on Lighthouse scores. |
| Bundle size tracking | Tools like `size-limit` track JS bundle size across PRs. Useful for library authors and public websites. For a single-user PWA on a known device with known network conditions, bundle size is not a meaningful gate. | Monitor build output size informally. Don't add CI tooling for it. |

---

## 6. Supply Chain Security

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| `pnpm audit` in CI | Check for known vulnerabilities in dependencies. pnpm audit checks the npm advisory database. | LOW | NO | Run `pnpm audit --audit-level=high` in CI. Fail on high/critical vulnerabilities. `--audit-level=moderate` will likely produce too many false positives for transitive devDependencies. |
| Frozen lockfile enforcement | `pnpm install --frozen-lockfile` in CI ensures the lockfile is committed and matches `package.json`. Prevents accidental dependency updates during CI runs. | LOW | NO -- no CI workflow exists | Standard practice. Every CI job that installs dependencies must use `--frozen-lockfile`. |
| `minimumReleaseAge` in pnpm config | Delay installation of newly published packages by 24+ hours. After the Shai-Hulud attacks (Nov 2025) and PackageGate zero-days (Jan 2026), this is now considered essential. pnpm 10.16+ supports this natively. | LOW | NO | Add to `.npmrc` or `pnpm-workspace.yaml`: `minimumReleaseAge: 1440` (24 hours in minutes). This means `pnpm install` will refuse packages published less than 24 hours ago. Set exclusions for known-safe packages if needed. |
| Lockfile committed to repo | Prevents `pnpm install` from resolving different versions on different machines or CI runs. | LOW | YES -- `pnpm-lock.yaml` is committed | Already done. |
| GitHub Actions pinned to SHA or major version | Prevent supply chain attacks via compromised GitHub Actions. Pin to specific commit SHAs or at minimum major versions (`actions/checkout@v4` not `actions/checkout@latest`). | LOW | NO -- no CI workflow exists | Pin all actions to specific versions. The cipher-box reference repo uses explicit `v4`/`v5` versioning. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `trustPolicy: no-downgrade` | pnpm 10.21+ feature that detects when a package's trust level decreases (e.g., previously published via Trusted Publisher OIDC, now published without provenance). Early signal of account compromise. | LOW | Add to pnpm config. Zero runtime cost, significant security value. Requires pnpm 10.21+ (current project has `pnpm@10.30.2`, so this is available). |
| `blockExoticSubdeps: true` | Prevents transitive dependencies from using git repositories or direct tarball URLs as sources. Forces all deps to come from the npm registry. | LOW | One line in pnpm config. Blocks a common supply chain attack vector. |
| Lifecycle script blocking (default in pnpm 10) | pnpm 10 blocks postinstall scripts by default. Instead of `dangerouslyAllowAllBuilds`, use `allowBuilds` to whitelist specific packages that need lifecycle scripts. | LOW | pnpm 10 already does this by default. Audit existing `allowBuilds` entries if any. |
| Dependabot/Renovate configured but NOT auto-merging | Automated dependency update PRs are useful for awareness but must require manual review. Auto-merging dependency updates is a supply chain attack vector (Shai-Hulud 2.0 used this). | LOW | Create a `dependabot.yml` or `renovate.json` with `automerge: false`. Weekly schedule, security updates only, or grouped by ecosystem. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-merging dependency updates | Even with security-only scope, auto-merging removes the human review step. After PackageGate (Jan 2026) showed that lockfiles themselves can be exploited, human review of dependency changes is essential. | Dependabot/Renovate creates PRs. Human reviews and merges. |
| Socket.dev / Snyk integration | Third-party security scanners that monitor every install. Useful for organizations, overkill for a single-developer project. Adds token management and API dependency. | `pnpm audit` + `minimumReleaseAge` + `trustPolicy` covers the same ground with zero external dependencies. |
| npm provenance verification on every install | Checking SIGSTORE attestations for every package adds significant install time and requires network access to Rekor transparency log. Not all packages have provenance yet. | `trustPolicy: no-downgrade` catches the important case (trust level regression) without verifying every package. |

---

## 7. CI Workflow Orchestration (GitHub Actions)

### Table Stakes

| Feature | Why Expected | Complexity | Existing? | Notes |
|---------|--------------|------------|-----------|-------|
| PR-triggered workflow | Run on `pull_request` to `main`. Every PR gets automated feedback before merge. | LOW | NO -- no CI workflow exists | Foundation of the entire CI pipeline. |
| pnpm + Node.js setup with caching | Use `pnpm/action-setup` + `actions/setup-node` with `cache: 'pnpm'`. Caches pnpm store between runs. | LOW | NO | Standard pattern. Saves 30-60s per run. |
| Parallel jobs for independent tasks | Lint, typecheck, unit tests, and E2E tests can run in parallel. Don't serialize tasks that don't depend on each other. | LOW | NO | Lint + typecheck have no deps. Unit tests need `pnpm install`. E2E tests need `pnpm build` + Playwright install. |
| Next.js build cache | Cache `.next/cache` between runs. Next.js incremental compilation uses this to skip unchanged pages. | LOW | NO | Use `actions/cache` with key based on lockfile hash. Saves 30-60s on builds. |
| Playwright browser caching | Cache `~/.cache/ms-playwright` keyed on Playwright version. Avoids re-downloading Chromium (~150MB) on every run. | LOW | NO | Key: `${{ runner.os }}-playwright-${{ steps.playwright-version.outputs.version }}`. Only install browsers when cache misses. |
| Clear failure reporting | Each CI job has a descriptive name. Failed steps show which exact check failed. No "CI failed" with no context. | LOW | NO | Name jobs descriptively: `lint`, `typecheck`, `unit-tests`, `e2e-tests`, `supply-chain-audit`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Path-based job filtering (dorny/paths-filter) | Only run E2E tests when source code changes. Only run supply chain audit when `package.json` or `pnpm-lock.yaml` changes. Saves CI minutes on documentation-only PRs. | LOW | Proven pattern from cipher-box reference repo. Adds a `changes` job that downstream jobs `needs`. |
| Timezone dual-pass in CI | Run unit tests twice: `TZ=Africa/Johannesburg` and `TZ=Europe/Berlin`. The user travels between SA and Germany; timezone bugs are real production risks. The `test:tz` script already does this locally. | LOW | Add `matrix: { tz: ['Africa/Johannesburg', 'Europe/Berlin'] }` to the unit test job. Two parallel runs. |
| Build artifact reuse | Build once, reuse across E2E tests and bundle security scan. Don't rebuild for each downstream job. | MEDIUM | Use `actions/upload-artifact` / `actions/download-artifact` to share `.next/` build output. Saves 1-2 minutes per dependent job. |
| Concurrency control | Cancel in-progress CI runs when a new commit is pushed to the same PR. Prevents wasting CI minutes on superseded commits. | LOW | `concurrency: { group: 'ci-${{ github.ref }}', cancel-in-progress: true }`. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Self-hosted runners | Maintenance burden (patching, security, uptime) for a single-developer project. GitHub-hosted runners are free for public repos and have generous limits for private repos. | Use `ubuntu-latest` GitHub-hosted runners. |
| Docker-based CI | App has no Docker setup. Adding Docker to CI for an app that deploys to Vercel/static hosting adds complexity without benefit. | Run directly on the runner with `pnpm install`. |
| Deployment from CI | CI should validate, not deploy. Deployment is a separate concern (Vercel preview deploys, or manual `pnpm build && push`). Mixing validation and deployment in the same workflow creates confusing failure modes. | Keep CI as a pure quality gate. Deploy separately. |
| Matrix testing across Node versions | Single-developer app pinned to a specific Node version. Testing on Node 18, 20, and 22 adds CI time without value since the deployment target is fixed. | Pin to one Node version (match production/Vercel). |

---

## Feature Dependencies

```
[GitHub Actions Workflow File]
    |
    +-- enables --> [All CI features below]
    |
    +-- contains --> [pnpm install --frozen-lockfile]
    |                    |
    |                    +-- enables --> [pnpm audit]
    |                    +-- enables --> [Vitest run]
    |                    +-- enables --> [Playwright install + test]
    |
    +-- contains --> [pnpm build]
                         |
                         +-- enables --> [Bundle security scan]
                         +-- enables --> [E2E tests (need running app)]
                         +-- enables --> [Build time tracking]

[Supply Chain Config (pnpm settings)]
    |
    +-- independent of --> [CI workflow]
    +-- works locally too --> [minimumReleaseAge, trustPolicy, blockExoticSubdeps]

[Vitest --changed / Playwright --only-changed]
    |
    +-- requires --> [fetch-depth: 0 in checkout]
    +-- requires --> [forceRerunTriggers config for critical files]
    +-- parallel with --> [Full test suite (separate job)]

[Coverage reporting]
    |
    +-- requires --> [Vitest coverage reporters configured]
    +-- requires --> [vitest-coverage-report-action in workflow]

[Schema drift detection test]
    |
    +-- requires --> [fake-indexeddb (already installed)]
    +-- requires --> [Dexie dynamic mode for schema extraction]
    +-- independent of --> [CI workflow (runs as regular unit test)]

[Table count sentinel test]
    |
    +-- requires --> [Hard-coded expected count]
    +-- triggers update to --> [backup-service.ts, db-fixtures.ts]
```

---

## MVP Recommendation

### Phase 1: Foundation (must ship first)

Priority: Get the CI workflow running with maximum data integrity protection.

1. **GitHub Actions workflow file** -- PR-triggered, with pnpm/Node setup, caching
2. **Lint + typecheck (`tsc --noEmit`)** -- fastest feedback, zero new code
3. **Unit tests with timezone dual-pass** -- existing 203 tests, two TZ matrix entries
4. **Schema version consistency check** -- new test, highest-value data integrity feature
5. **Table count sentinel test** -- one assertion, high leverage
6. **pnpm build + bundle security scan** -- existing test, just needs CI wiring
7. **Supply chain basics** -- `--frozen-lockfile`, `minimumReleaseAge`, `trustPolicy`

### Phase 2: E2E & Coverage

Priority: Real browser testing and coverage visibility.

1. **Playwright E2E in CI** -- browser caching, artifact upload on failure
2. **Expand E2E test suite** -- composable entry test, settings persistence, medication lifecycle
3. **Coverage reporting on PRs** -- vitest-coverage-report-action with pragmatic thresholds
4. **`pnpm audit` in CI** -- supply chain vulnerability scanning

### Phase 3: Optimization & Polish

Priority: Speed up CI and add advanced features.

1. **Dynamic test selection** -- `vitest --changed` + `playwright --only-changed` as fast-feedback jobs
2. **Path-based job filtering** -- skip irrelevant jobs on documentation-only PRs
3. **Build artifact reuse** -- build once, share across E2E + bundle security jobs
4. **Concurrency control** -- cancel superseded CI runs
5. **Dependabot/Renovate** -- automated dependency update PRs (no auto-merge)

### Defer

- Visual regression testing -- UI is still evolving
- Playwright sharding -- not enough tests to justify
- Lighthouse CI -- single-user app, no external performance requirements
- Third-party security scanners (Socket.dev, Snyk) -- pnpm native features are sufficient
- Flame graphs -- local debugging tool, not CI
- Bundle size tracking -- single-user app on known device
- Benchmarking -- add only if performance concerns emerge from daily use

---

## Feature Prioritization Matrix

| Feature | Data Integrity Value | Implementation Cost | Priority |
|---------|---------------------|---------------------|----------|
| GitHub Actions workflow (PR trigger, caching) | HIGH (enables all gates) | MEDIUM | P0 |
| Lint + tsc --noEmit in CI | MEDIUM | LOW | P0 |
| Unit tests + TZ dual-pass in CI | HIGH | LOW | P0 |
| Schema version consistency test | HIGH | MEDIUM | P0 |
| Table count sentinel test | MEDIUM | LOW | P0 |
| pnpm build + bundle security in CI | MEDIUM | LOW | P0 |
| --frozen-lockfile + minimumReleaseAge + trustPolicy | HIGH | LOW | P0 |
| Playwright E2E in CI | MEDIUM | MEDIUM | P1 |
| Expanded E2E scenarios (composable, meds, backup) | MEDIUM | HIGH | P1 |
| Coverage reporting on PRs | LOW | LOW | P1 |
| Coverage thresholds | LOW | LOW | P1 |
| pnpm audit in CI | MEDIUM | LOW | P1 |
| Schema drift detection test | MEDIUM | MEDIUM | P1 |
| vitest --changed / playwright --only-changed | LOW | LOW | P2 |
| Path-based job filtering (dorny/paths-filter) | LOW | LOW | P2 |
| Build artifact reuse | LOW | MEDIUM | P2 |
| Concurrency control (cancel superseded runs) | LOW | LOW | P2 |
| Migration idempotency test | LOW | LOW | P2 |
| Vitest bench for services | LOW | MEDIUM | P3 |
| IndexedDB operation benchmarks | LOW | MEDIUM | P3 |
| Dependabot/Renovate (no auto-merge) | LOW | LOW | P3 |

**Priority key:**
- P0: Foundation -- must exist before anything else works
- P1: Core value -- the features that justify the milestone
- P2: Optimization -- make CI faster and smarter
- P3: Nice to have -- add when the core pipeline is solid

---

## Sources

### Official Documentation (HIGH confidence)
- [Playwright CI Setup](https://playwright.dev/docs/ci-intro) -- official Playwright CI guide
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) -- official testing patterns
- [Playwright Sharding](https://playwright.dev/docs/test-sharding) -- official sharding with GitHub Actions matrix
- [Playwright --only-changed](https://dev.to/playwright/iterate-quickly-using-the-new-only-changed-option-55m2) -- official Playwright blog post
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security) -- official pnpm security features
- [pnpm audit CLI](https://pnpm.io/cli/audit) -- official audit docs
- [Next.js CI Build Caching](https://nextjs.org/docs/pages/guides/ci-build-caching) -- official Next.js CI guide
- [Vitest CLI --changed](https://vitest.dev/guide/cli) -- official Vitest CLI reference
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action) -- GitHub Action for Vitest coverage PR comments

### Reference Implementation (HIGH confidence)
- [FSM1/cipher-box CI workflow](https://github.com/FSM1/cipher-box/tree/main/.github) -- real-world CI patterns: path-based filtering, codecov integration, release gates, E2E artifact handling

### Ecosystem Research (MEDIUM confidence)
- [npm minimumReleaseAge announcement](https://socket.dev/blog/npm-introduces-minimumreleaseage-and-bulk-oidc-configuration) -- Socket.dev blog, Nov 2025
- [pnpm minimumReleaseAge](https://pnpm.io/blog/2025/12/05/newsroom-npm-supply-chain-security) -- pnpm blog on supply chain defense
- [Shai-Hulud / PackageGate attacks](https://bastion.tech/blog/npm-supply-chain-attacks-2026-saas-security-guide) -- 2025-2026 attack context
- [Vitest coverage with GitHub Actions](https://medium.com/@alvarado.david/vitest-code-coverage-with-github-actions-report-compare-and-block-prs-on-low-coverage-67fceaa79a47) -- community guide
- [CodSpeed Vitest bench](https://codspeed.io/blog/vitest-bench-performance-regressions) -- benchmarking in CI
- [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) -- continuous benchmark tracking

### Dexie.js Specific (MEDIUM confidence)
- [Dexie Issue #950: Schema checking](https://github.com/dfahlander/Dexie.js/issues/950) -- no built-in schema comparison API; workaround via dynamic mode
- [Dexie Issue #1599: Version downgrade](https://github.com/dexie/Dexie.js/issues/1599) -- IndexedDB cannot downgrade; VersionError on lower version
- [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) -- pure JS IndexedDB implementation used in existing tests

---
*Feature research for: CI pipeline, data integrity, E2E testing, supply chain security*
*Researched: 2026-03-27*
