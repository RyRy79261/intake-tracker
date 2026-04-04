# Phase 20: Core CI Pipeline - Research

**Researched:** 2026-03-28
**Domain:** GitHub Actions CI, Vitest, TypeScript, pnpm, branch protection
**Confidence:** HIGH

## Summary

This phase creates a GitHub Actions CI workflow (`ci.yml`) that gates every PR to `main` on lint, type checking, dual-timezone unit tests, and a production build with bundle security scanning. The project already has all the test infrastructure in place -- 300 passing Vitest tests, dual-TZ npm scripts, ESLint config, and a bundle security scanner. The main work is orchestrating these in GitHub Actions with proper caching and a gate job.

One critical prerequisite was discovered: `tsc --noEmit` currently fails with 57 errors, all confined to test files (no source file errors). These are almost entirely `Object is possibly 'undefined'` and discriminated union narrowing issues -- mechanical fixes. The plan must address this before the typecheck job can pass in CI.

**Primary recommendation:** Fix the 57 test file TypeScript errors, create a `ci.yml` with 5 parallel jobs (lint, typecheck, test-tz-sa, test-tz-de, build), add a `ci-pass` gate job, add Neon DB patterns to bundle-security.test.ts, and document branch protection settings.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Single `ci.yml` workflow file with parallel jobs (lint, typecheck, test-tz-sa, test-tz-de, build)
- **D-02:** Trigger on `pull_request` targeting `main` only. Version-bump.yml already handles post-merge concerns
- **D-03:** Timezone test runs as two separate parallel jobs (not sequential in one job) for faster execution and clear failure attribution
- **D-04:** Cache pnpm store between CI runs using `pnpm/action-setup` built-in cache or `actions/cache`
- **D-05:** Bundle security test runs as part of the build job (after `pnpm build`), not as a separate job
- **D-06:** Add Neon DB patterns to existing bundle-security.test.ts -- check for `postgres://` connection strings and `NEON_*` env vars in addition to the existing 6 patterns
- **D-07:** Status checks only (no PR annotations or comment summaries). Each job reports independently
- **D-08:** A `ci-pass` gate job that depends on all other jobs (lint, typecheck, test-tz-sa, test-tz-de, build). This is the single required status check for branch protection, ensuring no job can be silently removed
- **D-09:** Branch protection configured manually in GitHub repo settings after the workflow is running, not automated via CI
- **D-10:** Branch protection recommended settings documented in CONTEXT.md (require ci-pass, up-to-date branches, no admin bypass, no force push, no branch deletions)

### Claude's Discretion
- Node.js version for CI runners (match what's working in version-bump.yml or upgrade)
- Specific pnpm/action-setup version and cache configuration details
- Whether to add `tsc --noEmit` as a new package.json script or inline in the workflow
- Ubuntu runner version (latest vs pinned)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CIPL-01 | GitHub Actions workflow runs ESLint, TypeScript check, and Vitest unit tests as parallel jobs on every PR | Workflow structure with 5 parallel jobs + gate job documented; pnpm/action-setup v5 with cache; existing `pnpm lint`, `pnpm test` commands confirmed working |
| CIPL-02 | CI runs `pnpm build` and verifies no secrets in the client bundle | Build job runs `pnpm build` then `vitest run src/__tests__/bundle-security.test.ts`; Neon DB patterns (D-06) need adding |
| CIPL-03 | Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin in CI | Two parallel jobs using existing `test:tz:sa` and `test:tz:de` scripts; TZ env var set at job level in Actions YAML |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced via `preinstall` hook; npm/yarn will fail)
- Production build: `pnpm build` (runs `next build`)
- Linting: `pnpm lint` (runs `next lint`)
- Tests: `pnpm test` (runs `vitest run`)
- Timezone tests: `pnpm test:tz:sa` and `pnpm test:tz:de`
- Path alias: `@/*` maps to `src/*`
- Next.js 14 App Router, Vitest for unit tests, Playwright for E2E (Phase 22 scope)

## Standard Stack

### Core (already installed -- no new packages needed)

| Tool | Version | Purpose | CI Role |
|------|---------|---------|---------|
| Vitest | ^4.0.18 (installed: 4.0.18) | Test runner | Runs 300 unit tests |
| TypeScript | ^5.6.3 (installed: 5.9.3) | Type checking | `tsc --noEmit` |
| ESLint | ^8.57.1 | Linting | `next lint` |
| Next.js | 14.2.15 | Framework | `next build` |
| pnpm | 10.30.2 | Package manager | `pnpm install` with cache |

### GitHub Actions

| Action | Version | Purpose | Why This Version |
|--------|---------|---------|------------------|
| actions/checkout | v4 | Clone repo | Matches existing version-bump.yml |
| pnpm/action-setup | v5 | Install pnpm | Latest stable (March 2026); auto-detects version from packageManager field |
| actions/setup-node | v4 | Install Node.js + cache | Built-in `cache: 'pnpm'` support |

### Discretion Recommendations

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Node.js version | **20** | Node 18 hit EOL April 2025 (11 months ago); Node 20 is active LTS until April 2026; Next.js 14.2.15 runs fine on Node 20; local dev uses Node 22 so backward compat is proven |
| pnpm/action-setup version | **v5** | Latest release (March 2026); reads `packageManager` field from package.json automatically, no explicit version needed |
| tsc --noEmit | **Add `"typecheck": "tsc --noEmit"` to package.json scripts** | Consistent with other scripts (`lint`, `test`, `build`); easier to run locally |
| Ubuntu runner | **`ubuntu-latest`** (currently Ubuntu 24.04) | No pinning needed; version-bump.yml already uses `ubuntu-latest`; no OS-specific dependencies |

## Architecture Patterns

### Workflow Structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint:          # pnpm lint (next lint)
  typecheck:     # pnpm typecheck (tsc --noEmit)
  test-tz-sa:    # TZ=Africa/Johannesburg vitest run
  test-tz-de:    # TZ=Europe/Berlin vitest run
  build:         # pnpm build + bundle security test
  ci-pass:       # Gate job -- depends on all above
```

All 5 check jobs run in parallel. The `ci-pass` gate job runs after all complete.

### Shared Setup Pattern (reusable across jobs)

Each job needs identical setup steps. Use this pattern in every job:

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: pnpm/action-setup@v5

  - uses: actions/setup-node@v4
    with:
      node-version: '20'
      cache: 'pnpm'

  - run: pnpm install --frozen-lockfile
```

Key points:
- `pnpm/action-setup@v5` reads `packageManager` from package.json (no `version:` input needed)
- `actions/setup-node@v4` with `cache: 'pnpm'` handles store caching via pnpm-lock.yaml hash
- `--frozen-lockfile` prevents accidental lockfile updates in CI

### Gate Job Pattern (D-08)

```yaml
ci-pass:
  if: always()
  needs: [lint, typecheck, test-tz-sa, test-tz-de, build]
  runs-on: ubuntu-latest
  steps:
    - name: Check all jobs passed
      run: |
        if [[ "${{ needs.lint.result }}" != "success" ||
              "${{ needs.typecheck.result }}" != "success" ||
              "${{ needs.test-tz-sa.result }}" != "success" ||
              "${{ needs.test-tz-de.result }}" != "success" ||
              "${{ needs.build.result }}" != "success" ]]; then
          echo "::error::One or more CI jobs failed or were cancelled"
          exit 1
        fi
```

**IMPORTANT:** Do NOT use `contains(needs.*.result, 'failure')` -- this has an unfixed GitHub Actions runner bug (actions/runner#1540) where the wildcard includes transitive dependencies, causing unexpected behavior. Explicitly check each job result.

The `if: always()` is essential: without it, the gate job would be skipped if any upstream job fails, and GitHub treats "skipped" as passing for required status checks -- which defeats the entire purpose.

### Timezone Job Pattern (D-03)

```yaml
test-tz-sa:
  runs-on: ubuntu-latest
  steps:
    # ... shared setup ...
    - name: Run tests (Africa/Johannesburg)
      run: pnpm test:tz:sa

test-tz-de:
  runs-on: ubuntu-latest
  steps:
    # ... shared setup ...
    - name: Run tests (Europe/Berlin)
      run: pnpm test:tz:de
```

The existing npm scripts already set `TZ` via the command prefix (`TZ=Africa/Johannesburg vitest run`). No need to set `env:` at job level -- the script handles it. Two separate jobs give clear failure attribution per timezone.

### Build + Bundle Security Pattern (D-05)

```yaml
build:
  runs-on: ubuntu-latest
  steps:
    # ... shared setup ...
    - name: Build production bundle
      run: pnpm build

    - name: Run bundle security scan
      run: pnpm exec vitest run src/__tests__/bundle-security.test.ts
```

The build produces `.next/static/` which the bundle security test reads. Both steps must be sequential within the same job (D-05).

### Anti-Patterns to Avoid
- **Using `needs.*.result` wildcards in gate job conditions:** Bug in GitHub Actions runner includes transitive dependencies. Explicitly check each job.
- **Skipping `if: always()` on the gate job:** Without it, skipped gate = passing status check, allowing broken PRs to merge.
- **Caching `node_modules/` directly:** Cache the pnpm store instead (via `cache: 'pnpm'` on setup-node). Caching node_modules can break pnpm's symlink structure.
- **Running `pnpm install` without `--frozen-lockfile`:** In CI, the lockfile should be authoritative. Without this flag, pnpm might update the lockfile.
- **Setting both pnpm/action-setup cache AND actions/setup-node cache:** Use one strategy, not both. The recommended approach is `actions/setup-node` with `cache: 'pnpm'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| pnpm caching | Manual `actions/cache` with store path | `actions/setup-node` with `cache: 'pnpm'` | Handles store path discovery, key generation, and cache restoration automatically |
| Bundle security scanning | New scanning tool | Existing `bundle-security.test.ts` + Neon additions | Already tested and working; just needs 3 new patterns added |
| Timezone test orchestration | Custom TZ-setting wrapper | Existing `test:tz:sa` and `test:tz:de` scripts | Scripts already embed `TZ=` prefix; just call them directly |
| Gate job logic | Complex conditional expressions | Explicit result checking per job | Simpler, debuggable, avoids GitHub Actions runner bugs |

## Common Pitfalls

### Pitfall 1: tsc --noEmit Fails on Test Files (MUST FIX FIRST)
**What goes wrong:** `tsc --noEmit` currently exits with code 2 due to 57 errors, all in test files.
**Why it happens:** Test files use loose patterns (accessing discriminated union `.data` without narrowing, not handling `undefined` from array indexing). The strict tsconfig (`noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) catches these.
**How to avoid:** Fix the 57 errors before the typecheck CI job can pass. Error breakdown:
- 23x `TS2532: Object is possibly 'undefined'` -- add `!` assertion or null check
- 21x `TS2339: Property 'data' does not exist on ServiceResult` -- narrow the discriminated union (`if (result.success) { result.data... }`)
- 8x `TS18048: variable is possibly 'undefined'` -- same pattern as TS2532
- 2x `TS2345/TS2375` -- type assignment fixes
- Files affected: `round-trip.test.ts` (bulk), `db-fixtures.ts`, migration tests, `analytics-service.test.ts`, `settings-store-presets.test.ts`, `medication-schedule-service.test.ts`
**Warning signs:** CI typecheck job fails immediately on first run.

### Pitfall 2: Gate Job Skipped = PR Mergeable
**What goes wrong:** If the gate job doesn't have `if: always()`, and any upstream job fails, the gate job is skipped. GitHub treats skipped required checks as passing.
**Why it happens:** Default job behavior is to skip when `needs` jobs fail.
**How to avoid:** Always use `if: always()` on the gate job, and explicitly check each dependency's result for `success`.
**Warning signs:** PRs with failing CI jobs can still be merged.

### Pitfall 3: pnpm Version Mismatch in CI
**What goes wrong:** CI installs a different pnpm version than local development, causing lockfile conflicts.
**Why it happens:** The `packageManager` field in package.json specifies `pnpm@10.30.2`. If the action doesn't read this, it installs a different version.
**How to avoid:** Use `pnpm/action-setup@v5` without specifying `version:` -- it reads `packageManager` from package.json automatically.
**Warning signs:** `pnpm install --frozen-lockfile` fails with lockfile format errors.

### Pitfall 4: Build Fails Without Env Vars
**What goes wrong:** `next build` might fail if it expects environment variables that aren't set in CI.
**Why it happens:** Server-side code may reference env vars without fallbacks.
**How to avoid:** Verified: all `NEXT_PUBLIC_*` vars have fallbacks (`|| 'development'`, `|| '0.0.0'`). Privy is skipped when `NEXT_PUBLIC_PRIVY_APP_ID` is unset. The build succeeds without any env vars. No action needed.
**Warning signs:** Build step fails with undefined env var errors (unlikely given current code).

### Pitfall 5: Bundle Security Test Runs Before Build
**What goes wrong:** `bundle-security.test.ts` reads from `.next/static/` which only exists after `pnpm build`.
**Why it happens:** Running the test before the build means the directory doesn't exist.
**How to avoid:** D-05 already addresses this -- bundle security runs as part of the build job, after the build step.
**Warning signs:** Test passes vacuously (reports 0 files scanned) or fails with "directory not found."

## Code Examples

### Complete ci.yml Workflow (recommended structure)

```yaml
# Source: Assembled from GitHub Actions docs, pnpm CI docs, project conventions
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test-tz-sa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:tz:sa

  test-tz-de:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:tz:de

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Bundle security scan
        run: pnpm exec vitest run src/__tests__/bundle-security.test.ts

  ci-pass:
    if: always()
    needs: [lint, typecheck, test-tz-sa, test-tz-de, build]
    runs-on: ubuntu-latest
    steps:
      - name: Check all jobs passed
        run: |
          if [[ "${{ needs.lint.result }}" != "success" ||
                "${{ needs.typecheck.result }}" != "success" ||
                "${{ needs.test-tz-sa.result }}" != "success" ||
                "${{ needs.test-tz-de.result }}" != "success" ||
                "${{ needs.build.result }}" != "success" ]]; then
            echo "::error::One or more CI jobs failed or were cancelled"
            exit 1
          fi
```

### Neon DB Patterns to Add to bundle-security.test.ts (D-06)

```typescript
// Add to existing "client bundle should not contain API key patterns" test:
// Neon/Postgres connection strings
expect(content).not.toMatch(/postgres(ql)?:\/\/[^\s'"]+/);

// Add to existing "client bundle should not contain sensitive env var values" test:
// Neon-specific env vars
expect(content).not.toMatch(/NEON_[A-Z_]+/);
```

### package.json typecheck script addition

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

### TypeScript Error Fix Patterns (for the 57 test file errors)

```typescript
// Pattern 1: Object possibly undefined (TS2532/TS18048)
// Before:
const record = records[0];
expect(record.name).toBe("test");

// After:
const record = records[0];
expect(record).toBeDefined();
expect(record!.name).toBe("test");

// Pattern 2: Discriminated union narrowing (TS2339 on ServiceResult)
// Before:
const result = await importBackup(data);
expect(result.data.imported).toBe(5);

// After:
const result = await importBackup(data);
expect(result.success).toBe(true);
if (!result.success) throw new Error("Expected success");
expect(result.data.imported).toBe(5);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pnpm/action-setup@v4 | pnpm/action-setup@v5 | March 2026 | Node 24 runtime, better packageManager field detection |
| Manual pnpm store caching | `actions/setup-node` cache: 'pnpm' | 2024 | Simpler config, automatic cache key management |
| Node 18 in CI | Node 20+ LTS | April 2025 (Node 18 EOL) | Security updates, performance improvements |
| `contains(needs.*.result)` gate | Explicit per-job result check | Ongoing (runner#1540 unfixed) | Avoids transitive dependency bug in wildcard expansion |
| ubuntu-22.04 default | ubuntu-24.04 (ubuntu-latest) | January 2025 | Newer base image, updated system packages |

## Open Questions

1. **Should version-bump.yml also be updated to Node 20?**
   - What we know: It currently uses Node 18, which is EOL
   - What's unclear: Whether this is in scope for Phase 20
   - Recommendation: Out of scope for this phase, but worth noting for a follow-up task

2. **Should `pnpm lint` use `--max-warnings 0` to fail on warnings?**
   - What we know: Currently `pnpm lint` exits 0 even with 1 warning (react-hooks/exhaustive-deps in schedule-view.tsx)
   - What's unclear: Whether to enforce zero-warnings policy now or defer
   - Recommendation: Keep current behavior (warnings don't fail CI) -- tightening lint policy is a separate concern

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test:tz` (both timezones) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CIPL-01 | Lint, typecheck, tests run as parallel jobs | integration (workflow validation) | Push a PR branch and verify all jobs appear in GitHub Actions | Manual -- verified by opening a test PR |
| CIPL-02 | Build + bundle security scan | unit | `pnpm exec vitest run src/__tests__/bundle-security.test.ts` | Yes (needs Neon patterns added) |
| CIPL-03 | Dual-timezone test execution | unit | `pnpm test:tz` | Yes (existing test:tz:sa and test:tz:de scripts) |

### Sampling Rate
- **Per task commit:** `pnpm test` (2.2s)
- **Per wave merge:** `pnpm test:tz && pnpm lint && pnpm typecheck`
- **Phase gate:** Open a test PR to verify CI workflow runs all jobs and reports correctly

### Wave 0 Gaps
- [ ] Fix 57 TypeScript errors in test files so `tsc --noEmit` passes
- [ ] Add `"typecheck": "tsc --noEmit"` script to package.json
- [ ] Add Neon DB patterns to `bundle-security.test.ts`

## Sources

### Primary (HIGH confidence)
- Existing project files: `version-bump.yml`, `vitest.config.ts`, `bundle-security.test.ts`, `package.json`, `.eslintrc.json`, `tsconfig.json`
- Local verification: `pnpm test` (300 pass, 2.2s), `pnpm lint` (exit 0, 1 warning), `tsc --noEmit` (57 errors, all in test files)
- [pnpm/action-setup GitHub repo](https://github.com/pnpm/action-setup) - v5 docs, inputs, cache configuration
- [pnpm CI docs](https://pnpm.io/continuous-integration) - Official pnpm GitHub Actions setup guide

### Secondary (MEDIUM confidence)
- [GitHub Actions gate job pattern](https://devopsdirective.com/posts/2025/08/github-actions-required-checks-for-conditional-jobs/) - Explicit result checking pattern
- [actions/runner#1540](https://github.com/actions/runner/issues/1540) - Bug: `needs.*.result` includes transitive dependencies (unfixed)
- [GitHub runner-images](https://github.com/actions/runner-images) - ubuntu-latest = Ubuntu 24.04 since January 2025
- [Node.js EOL schedule](https://endoflife.date/nodejs) - Node 18 EOL April 2025

### Tertiary (LOW confidence)
None -- all findings verified against official sources or local project state.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already installed and verified locally; Actions versions confirmed from official repos
- Architecture: HIGH - Pattern assembled from official docs + existing project conventions + verified bug reports
- Pitfalls: HIGH - TypeScript errors verified locally (57 count, all in test files); gate job bug verified from GitHub issues

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain -- GitHub Actions, Vitest, and pnpm don't change rapidly)
