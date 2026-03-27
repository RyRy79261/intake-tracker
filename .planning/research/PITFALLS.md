# Domain Pitfalls: CI & Data Integrity

**Domain:** CI pipeline, E2E testing, data integrity protection, and supply chain security for an offline-first health tracking PWA
**Researched:** 2026-03-27
**Confidence:** HIGH (codebase inspection + Dexie.js issue tracker + pnpm docs + Playwright docs + real-world supply chain incident analysis)

---

## Critical Pitfalls

Mistakes that cause data loss, create false security confidence, or render the CI pipeline counterproductive.

---

### Pitfall 1: Dexie Schema Migration Silently Corrupts Data on Production Devices (No Rollback)

**What goes wrong:** A new `db.version(16)` ships to production. The user's phone browser upgrades IndexedDB from version 150 to 160 (Dexie multiplies by 10). The upgrade function has a bug -- perhaps it modifies records incorrectly or throws a partial error. The browser auto-commits whatever portion of the upgrade succeeded. Now you discover the bug and revert to the previous deployment. The user's browser tries to open version 150, but the database is already at version 160. IndexedDB throws `VersionError`. **The app is bricked on that device.** The data cannot be read by the old code OR the new code.

**Why it happens:** IndexedDB is fundamentally a forward-only schema system. There is no `ALTER TABLE` rollback. Dexie v3 threw `VersionError` when code tried to open a database newer than the declared version. Dexie v4.0.1 relaxed this -- it opens newer databases without error, which sounds helpful but creates a worse problem: the old code silently reads/writes records that are missing fields the upgrade was supposed to add, creating **inconsistent data where some records have the new fields and others do not**. When the fixed version re-deploys, the upgrade function does not re-run (version already matches), leaving a mix of migrated and unmigrated records.

**Consequences:** For this app, records are UNRECOVERABLE. There is no server-side database. If the user's phone has corrupt data, that data is gone. Medication dose logs, blood pressure history, daily notes -- all potentially lost.

**This codebase's specific exposure:**
- 6 migration versions (v10-v15) with upgrade functions touching all 16 tables
- The v10 upgrade backfills sync fields (`createdAt`, `updatedAt`, `deletedAt`, `deviceId`) across every table AND creates inventory transactions from legacy `currentStock` -- a destructive transform
- The v11 upgrade converts PhaseSchedule `time` (HH:MM string) to `scheduleTimeUTC` (integer minutes) using timezone inference -- lossy conversion
- The v12 upgrade creates SubstanceRecord entries from keyword matching in intake record notes -- creates new records from heuristics
- Each migration depends on the previous one completing successfully. A partial v11 failure leaves some PhaseSchedules with `time` but no `scheduleTimeUTC`

**Prevention:**
1. **Pre-deployment migration safety gate in CI:** Before any PR that touches `db.ts` can merge, CI must:
   - Run the full migration chain (v10->v15+) against synthetic data representing the production schema shape
   - Verify record counts before and after migration (no records lost)
   - Verify specific field transformations (e.g., `scheduleTimeUTC` is a number for all PhaseSchedules)
   - Detect any new `db.version()` call and require explicit approval label on the PR
2. **Backup-before-migrate pattern:** The app should export a backup before applying any schema upgrade. CI should test that this backup can be re-imported to a fresh database and produce identical data.
3. **Never ship an upgrade function that modifies existing records without a migration test.** The codebase already has v10-v15 migration tests -- this discipline must continue and be CI-enforced.
4. **Schema diff detection:** CI should compare the current `db.version()` declarations against the base branch. If the latest version number changed, flag for review.

**Detection:** CI gate that runs on any diff to `src/lib/db.ts`. Blocks merge if migration tests fail or if new version lacks test coverage.

**Confidence:** HIGH -- based on [Dexie.js issue #1599](https://github.com/dexie/Dexie.js/issues/1599) (version downgrade), [issue #2097](https://github.com/dexie/Dexie.js/issues/2097) (v4 VersionError relaxation), and direct inspection of this codebase's migration chain.

---

### Pitfall 2: Partial Migration on Browser Crash Leaves Database in Inconsistent State

**What goes wrong:** The user opens the app, triggering a migration. Mid-upgrade (e.g., during the v10 backfill of 16 tables), the browser tab crashes, the phone runs out of battery, or iOS evicts the tab from memory. IndexedDB's upgrade transaction was in progress. Depending on the browser, the transaction either: (a) rolls back completely, or (b) partially commits whatever object store changes had been flushed. On next open, the browser sees the version is already upgraded (the `onupgradeneeded` event already fired) so it does NOT re-run the upgrade function.

**Why it happens:** IndexedDB's `versionchange` transaction is a single transaction, but browsers differ in crash recovery behavior. Chrome generally rolls back incomplete `versionchange` transactions. Safari on iOS is known to be more aggressive about evicting tabs and has historically had bugs with incomplete upgrades. This was reported in [Dexie.js issue #942](https://github.com/dfahlander/Dexie.js/issues/942) where upgrade functions silently failed to run after a browser crash.

**This codebase's specific exposure:**
- The v10 upgrade iterates over ALL inventory items and creates new transaction records. If the browser crashes after processing 5 of 10 items, only 5 get initial transactions.
- The v12 upgrade iterates over ALL intake records looking for caffeine/alcohol keywords. A partial run creates substance records for some but not all matching intakes.
- Both upgrades use `await` inside loops, giving the browser multiple opportunities to evict the tab between iterations.

**Consequences:** Records missing sync fields (`createdAt`, `updatedAt`), PhaseSchedules without `scheduleTimeUTC`, inventory items without corresponding initial transactions. The app appears to work but data is silently incomplete. Queries that filter by `deletedAt === null` return wrong results for records that were never backfilled.

**Prevention:**
1. **Post-migration integrity checks:** On every app open (not just during migration), run a lightweight validation pass that checks critical invariants:
   - All records across all tables have `createdAt`, `updatedAt`, `deletedAt` fields
   - All PhaseSchedules have `scheduleTimeUTC` as a number
   - All InventoryItems with historical `currentStock > 0` have at least one "initial" InventoryTransaction
2. **Idempotent repair function:** A function that can safely re-run the backfill logic for any records that are missing expected fields, without creating duplicates. This is NOT a re-run of the migration -- it is a separate "heal" pass.
3. **CI must test the integrity checker itself** -- seed a database with deliberately incomplete migration output and verify the checker catches it.

**Detection:** Runtime integrity check on app startup. Log results to audit log. Surface warnings in the settings page if issues are found.

**Confidence:** MEDIUM -- browser crash during migration is real but rare. Safari iOS is the highest risk. The [Dexie.js issue #942](https://github.com/dfahlander/Dexie.js/issues/942) confirms the failure mode exists.

---

### Pitfall 3: fake-indexeddb Migration Tests Pass But Real Browser Migrations Fail

**What goes wrong:** The existing migration tests (v10-v15) use `fake-indexeddb/auto` in Node.js via Vitest. fake-indexeddb is a pure JS in-memory implementation that passes the W3C IndexedDB test suite, but it does NOT replicate browser-specific behaviors: transaction timing, storage quota limits, multi-tab upgrade blocking, or Safari's aggressive transaction timeouts. A migration that works in fake-indexeddb may fail in Safari or Firefox.

**This codebase's specific exposure:**
- The test setup (`src/__tests__/setup.ts`) calls `db.delete()` + `db.open()` before every test. This means migrations always run on an empty database. **The tests never exercise upgrading a database that has actual data from a previous version in the same way a real user's phone would.**
- The v10 migration test seeds raw IDB at version 9 then opens via `db.ts` -- this is good! But it only seeds `inventoryItems` and `intakeRecords`. It does not seed all 16 tables with representative data volumes.
- fake-indexeddb does not enforce storage quotas. A migration that temporarily doubles storage (copying data to new format) would pass in tests but fail on a phone with 95% full storage.

**Consequences:** CI shows green. The migration ships. On the user's phone with real data volume, the migration fails due to quota exceeded, or Safari's 500ms transaction timeout kills the upgrade mid-flight.

**Prevention:**
1. **Migration tests must seed ALL tables with realistic data shapes** -- not just the tables the migration touches. Other tables must survive the migration unchanged.
2. **Add a Playwright-based migration E2E test** that runs in a real Chromium browser:
   - Use `page.evaluate()` to seed IndexedDB at the previous version number using raw IDB API
   - Navigate to the app (which opens the database and triggers migration)
   - Verify all records survived with correct data
3. **Keep the fake-indexeddb unit tests for fast CI feedback**, but add the Playwright browser test as a slower "safety net" gate.
4. **Test with non-trivial data volumes** -- at least 100 records per table, not 1-2. This catches performance issues in upgrade loops.

**Detection:** Playwright E2E test that runs migrations in a real browser context. This test should run on every PR that modifies `db.ts`.

**Confidence:** HIGH -- fake-indexeddb's README explicitly states it "works exactly like IndexedDB except data is not persisted to disk." It does NOT claim to replicate browser-specific timing, quota, or transaction lifetime behaviors.

---

### Pitfall 4: Supply Chain Attack Window Is Wider Than You Think (pnpm minimumReleaseAge Bypass Bug)

**What goes wrong:** You configure `minimumReleaseAge: 1440` (24 hours) in pnpm settings, thinking all dependencies must be 24 hours old before installation. But [pnpm issue #10438](https://github.com/pnpm/pnpm/issues/10438) (reported January 2026) reveals that **minimumReleaseAge is NOT enforced when the dependency already exists in the lockfile**. If a compromised version gets into `pnpm-lock.yaml` before the 24h window (e.g., through a Dependabot PR or manual `pnpm update`), subsequent `pnpm install` runs silently install it regardless of age.

**Why it happens:** pnpm optimizes for speed by trusting the lockfile. The minimumReleaseAge check only runs during resolution (when adding new versions), not during lockfile-based installation. This is a known bug, not intended behavior.

**This codebase's specific exposure:**
- The September 2025 npm supply chain attack compromised `chalk`, `debug`, and 16 other packages with a combined 2.6 billion weekly downloads. These are common transitive dependencies of Next.js, Playwright, and ESLint -- all in this project's dependency tree.
- The November 2025 self-replicating npm worm compromised 796 packages. The malware used `preinstall` scripts.
- The February 2026 Cline CLI attack used a compromised npm publish token.

**Prevention:**
1. **Lockfile audit in CI:** Every PR must run `pnpm audit` and fail on high/critical vulnerabilities. This catches known compromised packages.
2. **Lockfile diff detection:** CI should flag any change to `pnpm-lock.yaml` that adds or updates a dependency. Changes to the lockfile without a corresponding change to `package.json` are suspicious.
3. **pnpm v10 postinstall script blocking:** pnpm v10 blocks postinstall scripts by default. Use `allowBuilds` to explicitly whitelist trusted packages. NEVER use `dangerouslyAllowAllBuilds`.
4. **Block exotic subdependencies:** Set `blockExoticSubdeps: true` in pnpm settings to prevent transitive dependencies from using git repos or tarball URLs.
5. **Pin exact versions in package.json** for critical dependencies (next, dexie, playwright). Use `^` ranges only for non-critical dev tools.
6. **Do NOT auto-merge Dependabot/Renovate PRs.** Every dependency update must have a human review the diff.
7. **Consider `trustPolicy: "no-downgrade"`** which blocks packages that show reduced trust levels compared to previous releases.

**Detection:** CI job that:
- Runs `pnpm audit --audit-level=high`
- Checks for lockfile changes without package.json changes
- Verifies `minimumReleaseAge` is set (even with the bypass bug, it protects during `pnpm add` and `pnpm update`)

**Confidence:** HIGH -- the pnpm bypass bug is documented. The September 2025 and November 2025 attacks are verified incidents that affected common Next.js transitive dependencies.

---

### Pitfall 5: E2E Tests That Are Flaky From Day One Due to IndexedDB + PWA Timing

**What goes wrong:** Playwright E2E tests interact with IndexedDB through the app's UI. IndexedDB operations are asynchronous and their timing varies by system load. On a CI runner under load, a test clicks "Confirm Entry," expects a toast notification, but the IndexedDB write + React Query invalidation + useLiveQuery re-render chain takes longer than expected. The test fails intermittently. After a few weeks of random failures, developers start ignoring CI results or adding retries that mask real bugs.

**This codebase's specific exposure:**
- The existing `intake-logs.spec.ts` test clicks "Confirm Entry" then immediately expects `text=Water intake recorded`. This works locally but depends on the speed of: IndexedDB write -> React Query mutation -> toast notification render. On a slow CI runner, this is a race condition.
- The `medication-wizard.spec.ts` test navigates a 6-step wizard with form fills and button clicks. Any step timing out breaks the entire test.
- The Playwright config has `retries: process.env.CI ? 2 : 0`. This means CI retries failed tests twice -- which masks flakiness instead of surfacing it.
- Service worker caching in a PWA can serve stale JavaScript bundles. If the test navigates to the app and gets a cached version from a previous test run, the IndexedDB schema version might mismatch.

**Consequences:** Flaky tests erode trust faster than no tests at all. Developers learn to "just re-run CI" instead of investigating failures. Real regressions hide behind the noise. The CI pipeline becomes a ritual that nobody trusts.

**Prevention:**
1. **Use Playwright's built-in waiting mechanisms, not manual waits:**
   - `await expect(locator).toBeVisible()` already polls. Set a generous timeout (10s, not the default 5s) for CI.
   - Never use `page.waitForTimeout()`. If you need to wait, wait for a specific DOM state.
2. **Disable service workers in Playwright tests:** Set `serviceWorkers: 'block'` in the Playwright config's `use` options. This prevents cached assets from interfering with tests.
3. **Clean IndexedDB state before each test:**
   ```typescript
   test.beforeEach(async ({ page }) => {
     await page.goto('/');
     await page.evaluate(() => {
       indexedDB.deleteDatabase('IntakeTrackerDB');
     });
     await page.reload();
   });
   ```
4. **Do NOT use retries to mask flakiness.** Start with `retries: 0` even in CI. A test that needs retries is a test that needs fixing. Add retries later (1, not 2) only for tests that have proven stable over 50+ runs.
5. **Use `data-testid` attributes** instead of text selectors. The existing tests use `text=Intake Tracker` and `text=Confirm Entry` -- these break on any copy change and are locale-dependent.
6. **Run tests in serial (not parallel) until the suite is proven stable.** The existing config already does `workers: 1` on CI -- keep this.
7. **Trace on first failure, not first retry:** Change trace config from `on-first-retry` to `retain-on-failure` so you capture diagnostics on the FIRST failure, not after a retry masks the original state.

**Detection:** Track flaky test rate over time. Any test that fails then passes on retry is flaky. If flaky rate exceeds 5%, stop and fix before adding new tests.

**Confidence:** HIGH -- the existing test code uses patterns known to cause flakiness (text selectors, no DB cleanup between E2E runs, retry-based masking). Verified against [Playwright best practices documentation](https://playwright.dev/docs/best-practices).

---

## Moderate Pitfalls

---

### Pitfall 6: CI Pipeline Gets Too Slow and Developers Start Bypassing It

**What goes wrong:** The CI pipeline starts at 5 minutes. Over time, more tests are added. E2E tests are slow (Playwright needs a dev server + browser). Coverage collection adds overhead. The pipeline grows to 15+ minutes. Developers start pushing directly to main, merging without waiting for CI, or marking PRs as "skip CI" for "trivial" changes that turn out to break things.

**Why it happens:** Every CI feature adds time. Lint (30s) + typecheck (60s) + unit tests (30s) + E2E tests (3-5 min) + coverage (30s) + supply chain audit (20s) is already 6-7 minutes minimum. If these run sequentially, it is 7+ minutes. If the Next.js build is included (for verifying production builds), add 2-3 more minutes.

**This codebase's specific exposure:**
- 44K LOC TypeScript means typecheck is not instant
- 6 migration test files + unit tests + timezone dual-pass means the test suite is already non-trivial
- Playwright E2E starts a dev server with a 120s timeout, adding overhead even before tests run
- The `test:tz` script runs the ENTIRE test suite twice (once per timezone) -- this should NOT be in the PR pipeline

**Prevention:**
1. **Parallel jobs, not sequential steps.** The reference repo (cipher-box) demonstrates this well: lint, typecheck, and tests run as separate parallel jobs. Only jobs with actual dependencies (typecheck depends on lint) are chained.
2. **Dynamic test selection (affected-path analysis):** Use `dorny/paths-filter` (as cipher-box does) to skip E2E tests when only docs or config files changed. Only run migration tests when `db.ts` changes.
3. **Cache aggressively:** Cache pnpm store, Next.js `.next/cache`, Playwright browsers. The cipher-box CI uses `actions/setup-node` with `cache: 'pnpm'`.
4. **Separate "fast" and "slow" pipelines:**
   - Fast (every PR): lint + typecheck + unit tests + supply chain audit. Target: under 3 minutes.
   - Slow (PR to main, or explicitly triggered): E2E tests + coverage + timezone dual-pass. Target: under 8 minutes.
5. **Never include `pnpm build` in the PR pipeline** unless specifically testing build output. It adds 2-3 minutes with zero value for most PRs.
6. **Do NOT run timezone dual-pass on every PR.** Run it nightly or on PRs that modify timezone-related files.

**Detection:** Measure CI duration per PR over time. Alert if median exceeds 5 minutes for the fast pipeline.

**Confidence:** HIGH -- research shows developers context-switch when CI exceeds 15 minutes, and teams cut pipeline duration 40-60% by targeting the top 3 slowest jobs.

---

### Pitfall 7: Coverage Metrics Incentivize Writing Bad Tests (Goodhart's Law)

**What goes wrong:** A coverage target is set (e.g., "80% coverage required to merge"). Developers write tests that technically cover lines but don't actually test anything meaningful. A test that calls a function without asserting results increases coverage while adding zero value. The migration tests are already thorough, but service-layer tests could easily devolve into "call function, assert it didn't throw" patterns that inflate coverage without catching bugs.

**Why it happens:** Goodhart's Law: "When a measure becomes a target, it ceases to be a good measure." Coverage counts which lines EXECUTED, not which lines were TESTED MEANINGFULLY. A test with no assertions covers code. A test that asserts `expect(true).toBe(true)` covers code. Neither catches regressions.

**This codebase's specific exposure:**
- The backup service (`backup-service.ts`) has 16 validator functions with similar structure. Achieving "coverage" on these is trivial (call with valid data), but the important tests are the INVALID data cases.
- The medication service has complex multi-table transactions. A coverage-focused test might call `createPrescription()` and check it returns, but miss that inventory transactions were not created correctly.
- AI API route handlers are difficult to meaningfully test in unit tests (they depend on external API responses). Forcing coverage on these leads to brittle mocks that test mock behavior, not real behavior.

**Prevention:**
1. **Track coverage as a METRIC, not a GATE.** Report coverage on PRs (using a tool like `@vitest/coverage-v8` which is already installed) but do NOT block merge on coverage thresholds.
2. **Use coverage DECREASE detection instead:** Block merge if a PR DECREASES coverage by more than 2% without explanation. This prevents regression without incentivizing bad tests.
3. **Require assertion density, not line coverage.** A test file with 10 tests and 5 assertions is suspicious. Code review should catch tests without meaningful assertions.
4. **Exclude generated code and type-only files from coverage.** The 16 Dexie table interfaces in `db.ts` don't need coverage. AI route handlers should be covered by E2E tests, not unit tests.
5. **Do NOT set a coverage target in the first milestone.** Establish a baseline first. After 2-3 months of organic test growth, evaluate whether a floor is needed.

**Detection:** Review coverage reports for files with high coverage but low assertion counts. Flag test files where `expect()` count is less than 50% of test count.

**Confidence:** HIGH -- well-documented anti-pattern. The existing codebase already has good migration tests as a positive example of meaningful coverage.

---

### Pitfall 8: Backup Round-Trip Test Gives False Confidence Without Schema Awareness

**What goes wrong:** CI includes a "backup round-trip" test: export all data, import to fresh database, compare. The test passes. But the backup format (`BackupData` interface in `backup-service.ts`) is at version 5, while the database schema is at version 15. A new migration adds a field (`groupId` on intakeRecords). The backup service exports the field (it serializes full records). The import service writes records with the field. But the import validator (`isValidIntakeRecord`) does NOT check for `groupId` -- it only checks `id`, `type`, `amount`, `timestamp`. A backup with corrupt `groupId` values passes validation and imports silently.

**This codebase's specific exposure:**
- The validators in `backup-service.ts` are minimal: `isValidIntakeRecord` checks 4 fields out of 12. Records missing `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`, `groupId`, `source`, `note` all pass validation.
- The backup format version (5) has not been updated despite schema versions advancing from v10 to v15.
- The `isContentEqual` comparison ignores `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone` -- exactly the fields that migrations transform. A backup round-trip would not detect if a migration scrambled these fields.

**Prevention:**
1. **CI backup round-trip test must validate ALL fields**, not just the 4 that `isValidIntakeRecord` checks. Use the TypeScript interface types to generate validators, or use Zod schemas for both runtime validation and type generation.
2. **After a migration run, export backup and verify it re-imports without data loss.** This means: seed DB with known data, run migration, export, import to fresh DB, compare record-by-record with deep equality on ALL fields.
3. **Bump backup format version when schema version changes.** The backup version should track which schema fields are expected.
4. **Test import of backups from OLDER format versions.** A v3 backup imported into a v15 database should work (the import should handle missing fields gracefully).

**Detection:** CI test that compares backup export before and after migration, field-by-field, with no exclusions.

**Confidence:** HIGH -- directly verified by reading `backup-service.ts` validators and `isContentEqual` exclusion set.

---

### Pitfall 9: PWA Service Worker Serves Stale Code After CI-Verified Deployment

**What goes wrong:** CI verifies the build, tests pass, the new version deploys. The user's phone has the old service worker cached. The service worker serves the old JavaScript bundle (with the old `db.version()` declarations). The user continues using the app with OLD code that does not know about the new schema. If the new version included a migration, the migration never runs because the old code does not declare the new version. When the service worker finally updates (could be hours or days later), the migration runs -- but the user has been creating records with the old code, potentially writing data that the migration assumes does not exist yet.

**Why it happens:** PWA service workers update asynchronously. The update check happens on navigation, but the new worker does not activate until all tabs are closed. On mobile, tabs persist indefinitely. The user may run old code for days after deployment.

**This codebase's specific exposure:**
- The app is a PWA (`next.config.js` likely has PWA configuration)
- The app is used on a phone by a single user who travels between SA and Germany
- The user may open the app, use it, and close it without fully closing the browser tab, preventing service worker updates

**Prevention:**
1. **Service worker update notification:** Show an in-app prompt when a new version is detected: "A new version is available. Please refresh to update." This is standard PWA practice but critical when schema migrations are involved.
2. **CI cannot directly prevent this.** But CI can verify that the service worker update notification component exists and functions correctly (E2E test).
3. **Migration code must handle data created by both old and new code.** Upgrade functions should use defensive checks (`if (record.field == null)`) rather than assuming all records are from the old version.
4. **The existing migration code already does this well** (the v10 backfill checks `if (record.createdAt == null)`). Enforce this pattern via code review and CI linting.

**Detection:** E2E test that verifies the service worker update prompt appears when a new version is available.

**Confidence:** MEDIUM -- depends on the specific PWA configuration. The risk is real for any PWA with schema migrations, but the existing migration code already uses defensive patterns.

---

## Minor Pitfalls

---

### Pitfall 10: Running Full Timezone Dual-Pass in CI Doubles Test Time

**What goes wrong:** The `test:tz` script runs the entire Vitest suite twice: once with `TZ=Africa/Johannesburg` and once with `TZ=Europe/Berlin`. This is valuable for catching timezone bugs but doubles CI time. If included in every PR pipeline, it pushes total time past the "developers ignore CI" threshold.

**Prevention:** Run timezone dual-pass only nightly or on PRs that modify files matching `*timezone*`, `*tz*`, `db.ts` (which has timezone-dependent migrations), or `*schedule*`. Use path filtering in CI to skip it otherwise.

**Detection:** CI duration monitoring. If the fast pipeline exceeds 3 minutes, investigate.

---

### Pitfall 11: Playwright Dev Server Startup Timeout in CI

**What goes wrong:** The Playwright config starts a dev server with `NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm run dev` and waits up to 120 seconds. On a slow CI runner or cold cache, the Next.js dev server may take 60-90 seconds to start. This adds dead time to every E2E run. Worse: if the timeout is exceeded, ALL E2E tests fail with a confusing "server not ready" error that looks like a test failure.

**Prevention:**
1. **Use `next build && next start` instead of `next dev` for CI.** The production server starts faster and is more deterministic. The dev server compiles on-demand per route, adding latency to every page navigation.
2. **Cache the Next.js build between CI runs** using `actions/cache` on `.next/cache`.
3. **Increase the startup timeout to 180s** for CI to account for cold starts.
4. **Use `webServer.reuseExistingServer: true`** (already configured) so local development can pre-start the server.

**Detection:** Monitor E2E step duration. If >50% of the time is server startup, switch to production server.

---

### Pitfall 12: CI Passes But Production Build Fails (Dev-Only Imports)

**What goes wrong:** CI runs lint + typecheck + tests using the development configuration. All pass. But `pnpm build` fails because a component imports something that is only available in development (e.g., `fake-indexeddb` leaking into production code, or a dev-only environment variable check). The build failure is only caught if CI includes a build step.

**This codebase's specific exposure:**
- `fake-indexeddb/auto` is imported in `src/__tests__/setup.ts` -- safe. But if a test helper accidentally gets imported from a component file, it pulls fake-indexeddb into the production bundle.
- The `LOCAL_AGENT_MODE` bypass in auth is controlled by a `NEXT_PUBLIC_` env var. If this check has a bug, production could be bypassed.

**Prevention:**
1. **Include `pnpm build` in the CI pipeline**, but only for PRs targeting main (not feature branches, to save time).
2. **Use ESLint's `no-restricted-imports` rule** to prevent importing from `fake-indexeddb`, `vitest`, or `@playwright/test` in non-test files.
3. **Verify `LOCAL_AGENT_MODE` is NOT set in production.** CI should have a step that checks the production environment variables.

**Detection:** Build failure in CI. Caught by including build step in the "slow" pipeline.

---

### Pitfall 13: Dexie Schema Version Repetition Drift Between Versions

**What goes wrong:** Dexie requires repeating the FULL schema definition for every version. The codebase already has 6 versions with the same store definitions copied each time. A future PR adds an index to `intakeRecords` in v16 but forgets to also add it to the v17 declaration they add in the same PR. The index silently disappears from v17 onward.

**This codebase's specific exposure:** The schema definition for `doseLogs` alone is `"id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt"` -- a long, dense string that is easy to copy-paste incorrectly. This is repeated verbatim in v10, v11, v12, v13, v14, and v15.

**Prevention:**
1. **CI schema consistency check:** A script that parses `db.ts` and verifies that the latest version's store definitions are a superset of the previous version's definitions (no accidental index removal).
2. **Extract store definitions into constants** (already recommended in previous research). This eliminates copy-paste as a failure mode.
3. **Automated test:** Query each index declared in the latest version and verify it returns results (or at minimum does not throw). The existing v10 migration tests do this for compound indexes -- extend to all versions.

**Detection:** CI script that parses Dexie version declarations and diffs them.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Migration safety gates | Pitfall 1 (no rollback), Pitfall 2 (partial migration), Pitfall 3 (fake-indexeddb vs real browser) | CI must test migrations in both fake-indexeddb (fast) AND Playwright/Chromium (authoritative). Schema diff detection required. |
| E2E test foundation | Pitfall 5 (flaky from day one), Pitfall 11 (dev server timeout) | Use `data-testid`, disable service workers, start with `retries: 0`, use production build for CI. |
| Supply chain hardening | Pitfall 4 (minimumReleaseAge bypass) | Lockfile audit + lockfile diff detection + manual review of all dependency updates. minimumReleaseAge is necessary but not sufficient. |
| Coverage tracking | Pitfall 7 (Goodhart's Law) | Track as metric, gate on coverage decrease only, never set an absolute threshold in v1. |
| CI orchestration | Pitfall 6 (too slow) | Parallel jobs, path filtering, fast/slow pipeline split, cache everything. |
| Backup integrity | Pitfall 8 (shallow validators) | Comprehensive field-by-field validation, schema-aware backup format version. |
| Dynamic test selection | Pitfall 6 (too slow), Pitfall 10 (tz dual-pass) | Path-based filtering for E2E and timezone tests. Only run what changed files could affect. |
| PWA deployment | Pitfall 9 (stale service worker) | Service worker update notification, defensive migration code, E2E test for update flow. |

---

## Sources

### Dexie.js Migration & Version Management
- [Dexie.js issue #1599: Version downgrade on rollback](https://github.com/dexie/Dexie.js/issues/1599) -- confirmed: IndexedDB cannot downgrade versions
- [Dexie.js issue #2097: v4 VersionError relaxation](https://github.com/dexie/Dexie.js/issues/2097) -- confirmed: v4 silently opens newer DBs, creating inconsistent data
- [Dexie.js issue #942: Upgrade function not running after crash](https://github.com/dfahlander/Dexie.js/issues/942) -- confirmed: partial migration recovery gap
- [Dexie.js issue #921: Migration of existing IndexedDB](https://github.com/dexie/Dexie.js/issues/921) -- schema declaration requirements
- [Dexie.js Migrating existing DB documentation](https://dexie.org/docs/Tutorial/Migrating-existing-DB-to-Dexie)
- [Dexie.js UpgradeError documentation](https://dexie.org/docs/DexieErrors/Dexie.UpgradeError)

### Supply Chain Security
- [pnpm supply chain security documentation](https://pnpm.io/supply-chain-security) -- minimumReleaseAge, blockExoticSubdeps, trustPolicy
- [pnpm issue #10438: minimumReleaseAge lockfile bypass](https://github.com/pnpm/pnpm/issues/10438) -- confirmed: bypass when version in lockfile
- [CISA: Widespread npm supply chain compromise (Sept 2025)](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [Cline CLI supply chain attack (Feb 2026)](https://thehackernews.com/2026/02/cline-cli-230-supply-chain-attack.html)
- [Brief history of npm supply chain attacks in 2025](https://emilyxiong.medium.com/brief-history-of-npm-supply-chain-attacks-in-year-2025-a887dd2e11a4)

### CI & Testing Best Practices
- [Playwright best practices](https://playwright.dev/docs/best-practices) -- selector strategy, waiting, auto-retrying assertions
- [Playwright E2E Testing: 12 Best Practices (2026)](https://elionavarrete.com/blog/e2e-best-practices-playwright.html)
- [BrowserStack: Playwright flaky tests detection (2026)](https://www.browserstack.com/guide/playwright-flaky-tests)
- [Optimizing GitHub Actions for speed (2025)](https://marcusfelling.com/blog/2025/optimizing-github-actions-workflows-for-speed)
- [Speed up CI and cut GitHub Actions costs](https://costops.dev/guides/speed-up-ci-pipelines)
- [FSM1/cipher-box CI workflow](https://github.com/FSM1/cipher-box/tree/main/.github) -- reference for path filtering, parallel jobs, release gates

### Coverage & Metrics
- [Goodhart's Law in software engineering](https://codepulsehq.com/guides/goodharts-law-engineering-metrics)
- [Code coverage as a metric](http://softwareascraft.com/posts/code-coverage-as-a-metric/)
- [Keeping tests valuable: Are coverage metrics trustworthy?](https://chroniclesofapragmaticprogrammer.substack.com/p/keeping-tests-valuable-are-code-coverage)

### Codebase Inspection
- `src/lib/db.ts` -- 6 Dexie versions (v10-v15), 16 tables, 3 upgrade functions with data transforms
- `src/lib/backup-service.ts` -- backup format v5, minimal validators, `isContentEqual` exclusion set
- `src/__tests__/migration/` -- v10-v15 migration tests using fake-indexeddb
- `src/__tests__/setup.ts` -- test harness: `db.delete()` + `db.open()` per test
- `e2e/*.spec.ts` -- 3 existing E2E tests with text-based selectors
- `playwright.config.ts` -- dev server startup, CI retries, chromium-only
- `.github/workflows/version-bump.yml` -- only existing CI workflow
