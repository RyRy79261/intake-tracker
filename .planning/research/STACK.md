# Technology Stack: v1.2 CI & Data Integrity

**Project:** intake-tracker
**Researched:** 2026-03-27
**Confidence:** HIGH

## Existing Stack (NOT changing)

Next.js 14.2.15, TypeScript 5.6, Dexie.js v4 (schema v15), Zustand 5, React Query 5, shadcn/ui, Tailwind 3.4, pnpm 10.30.2, Node 22.x. Vitest 4.0.18 with @vitest/coverage-v8, Playwright 1.58.2, fake-indexeddb 6.2.5. 239 TypeScript files, ~44K LOC, 28 test files (203+ unit tests), 3 E2E specs.

---

## New Stack Additions

### 1. GitHub Actions Workflow Engine

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| `actions/checkout` | `@v4` | Repository checkout | Standard, used by cipher-box reference |
| `pnpm/action-setup` | `@v4` | Install pnpm in CI | Matches project's pnpm 10.30.2; cipher-box pattern |
| `actions/setup-node` | `@v4` | Node.js + pnpm cache | Built-in `cache: 'pnpm'` handles store caching automatically |
| `actions/cache` | `@v4` | Next.js build cache | Cache `.next/cache` to cut build times 60-80% on repeat runs |
| `actions/upload-artifact` | `@v4` | Playwright reports, coverage | Upload on failure for debugging; cipher-box pattern |

**No new npm packages needed.** These are GitHub Actions only.

**Runner:** `ubuntu-latest` for all jobs. Single-platform (Chromium-only) matches existing Playwright config. No need for macOS/Windows runners -- this is a PWA, not a desktop app.

**Node version in CI:** `22` (matches local dev environment, LTS).

### 2. Dynamic Test Selection (Path Filtering)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `dorny/paths-filter` | `@v3` | Detect changed files per PR | Proven pattern from cipher-box. Outputs boolean per filter for conditional job execution. |

**Why v3 not v4:** v4 (March 2026) only updates to node24 runtime. v3 is battle-tested and functionally identical. Use v3 for stability; upgrade to v4 later if desired.

**Integration pattern (from cipher-box):**

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      src: ${{ steps.filter.outputs.src }}
      db: ${{ steps.filter.outputs.db }}
      e2e: ${{ steps.filter.outputs.e2e }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            src:
              - 'src/**'
              - 'package.json'
              - 'pnpm-lock.yaml'
              - 'tsconfig.json'
              - 'next.config.js'
            db:
              - 'src/lib/db.ts'
              - 'src/__tests__/migration/**'
              - 'src/__tests__/backup/**'
            e2e:
              - 'src/**'
              - 'e2e/**'
              - 'playwright.config.ts'
```

Downstream jobs use `if: needs.changes.outputs.src == 'true'` to skip when irrelevant files changed (docs-only PRs, CI config tweaks, etc.).

### 3. Coverage Tracking

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@vitest/coverage-v8` | `^4.0.18` | V8-based coverage collection | **Already installed.** Default Vitest provider, no instrumentation step needed. |
| `davelosert/vitest-coverage-report-action` | `@v2` | PR coverage comments | Posts coverage summary + per-file diff as PR comment. Updates in-place (no comment spam). Reads Vitest thresholds from config. Free, no external service. |

**Why NOT Codecov:** Codecov requires signup, token management, and an external service dependency for a single-user personal project. The `vitest-coverage-report-action` is self-contained within GitHub Actions, posts directly as a PR comment, and reads coverage thresholds from `vitest.config.ts`. Zero operational overhead.

**Configuration additions to `vitest.config.ts`:**

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'json'],  // json-summary needed for PR action
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/__tests__/**', 'src/components/ui/**'],  // exclude shadcn generated
    thresholds: {
      // Start modest, ratchet up as coverage improves
      statements: 40,
      branches: 35,
      functions: 35,
      lines: 40,
    },
  },
}
```

### 4. Supply Chain Hardening

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `pnpm audit` | built-in (pnpm 10.30.2) | Vulnerability scanning | Built into pnpm, no external tool needed. Run `pnpm audit --audit-level=high` in CI. |
| `minimumReleaseAge` | pnpm 10.16+ setting | 24h package quarantine | Prevents installing packages published < 24h ago. Defends against the 2025 Shai-Hulud-style attacks. |
| `trustPolicy` | pnpm 10.21+ setting | Detect trust downgrades | Fails install if a package loses its trusted publisher or provenance status between versions. |
| `blockExoticSubdeps` | pnpm 10.x setting | Block non-registry deps | Prevents transitive dependencies from pulling from git URLs or tarballs. |

**No new npm packages.** All supply chain features are pnpm configuration.

**`.npmrc` additions:**

```ini
# Existing
engine-strict=true
auto-install-peers=true
strict-peer-dependencies=false

# New: Supply chain hardening
minimum-release-age=1440
trust-policy=no-downgrade
block-exotic-subdeps=true
```

**`pnpm-workspace.yaml` additions:**

```yaml
onlyBuiltDependencies:
  - '@reown/appkit'  # existing

# Future: Add allowedDeprecatedVersions if needed
```

**CI workflow step:**

```yaml
- name: Security audit
  run: pnpm audit --audit-level=high
  continue-on-error: false  # Fail the build on high/critical vulnerabilities
```

### 5. Data Integrity Testing (CI-Specific)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `fake-indexeddb` | `^6.2.5` | IndexedDB in Node.js tests | **Already installed.** Used by migration tests. Powers schema validation in CI. |

**No new packages.** Data integrity testing builds on existing infrastructure:

- **Migration safety gate:** Existing `src/__tests__/migration/v*-migration.test.ts` files (6 files covering v10-v15). CI runs these on every PR that touches `src/lib/db.ts`.
- **Backup round-trip:** Existing `src/__tests__/backup/round-trip.test.ts`. CI runs on every PR touching backup/db code.
- **Schema validation test (NEW test, no new deps):** A new Vitest test that programmatically reads `db.ts`, extracts the declared schema version, and asserts it matches expected table/index declarations. Catches "forgot to bump version" or "added table without index" errors.
- **Bundle security:** Existing `src/__tests__/bundle-security.test.ts` runs post-build to verify no API keys leak. CI runs after `pnpm build`.

### 6. E2E Testing Enhancements

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@playwright/test` | `^1.58.2` | E2E browser testing | **Already installed.** v1.51+ supports IndexedDB in storageState (useful for seeding test data). |

**No new packages.** Playwright enhancements are configuration/test-writing changes:

**Playwright config enhancements:**

```typescript
// playwright.config.ts additions
reporter: process.env.CI
  ? [['html', { open: 'never' }], ['github']]  // GitHub annotations on failure
  : 'html',
use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
},
```

The `github` reporter posts test failures as inline PR annotations -- free, built into Playwright, no action needed.

**IndexedDB storageState (Playwright 1.51+):**
Playwright now supports saving/restoring IndexedDB via `browserContext.storageState({ indexedDB: true })`. Use this to seed test scenarios with known Dexie data instead of clicking through UI setup. The project already has `NEXT_PUBLIC_LOCAL_AGENT_MODE=true` for auth bypass.

### 7. Benchmarking

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vitest bench` | built-in (Vitest 4.x) | Performance benchmarks | Built into Vitest. Write `.bench.ts` files alongside code. Zero additional deps. |

**Why NOT CodSpeed:** CodSpeed requires an external service signup, GitHub App installation, and is overkill for a single-user PWA. Vitest's built-in `bench` command runs locally and in CI. Store results as JSON artifacts; compare manually or via a simple script.

**Why NOT flame graphs for CI:** Flame graphs are a developer debugging tool, not a CI gate. For a single-user offline-first PWA with ~44K LOC, there is no server-side hot path to profile. If a specific rendering issue arises, Chrome DevTools' Performance tab is the right tool -- used ad-hoc during development, not automated in CI. **Do not add flame graph tooling to CI.** It would add complexity without catching regressions.

**Benchmark approach:**

```typescript
// src/lib/intake-service.bench.ts
import { bench, describe } from 'vitest';
import { db } from '@/lib/db';

describe('intake-service', () => {
  bench('bulk insert 1000 records', async () => {
    await db.intakeRecords.bulkAdd(records);
  });

  bench('query today records', async () => {
    await db.intakeRecords.where('timestamp').above(todayStart).toArray();
  });
});
```

Run with `pnpm vitest bench`. Store `--reporter=json` output as a CI artifact for trend comparison.

### 8. PR Quality Gates

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Conventional Commits check | shell script in workflow | PR title validation | Matches cipher-box pattern. Enforces `feat|fix|docs|...` prefixes for clean changelogs. No npm package needed. |

---

## What NOT To Add

| Technology | Why Not |
|------------|---------|
| **Codecov** | External service overhead for a personal project. `vitest-coverage-report-action` is self-contained. |
| **CodSpeed** | External service, GitHub App install. Vitest bench + JSON artifacts sufficient. |
| **Socket.dev** | Commercial tool. pnpm's built-in `audit`, `trustPolicy`, and `minimumReleaseAge` cover the same ground for free. |
| **Renovate / Dependabot** | PROJECT.md explicitly says "no automatic dependency updates." Supply chain hardening means manual, deliberate updates only. |
| **Flame graph tools (0x, clinic.js)** | No server-side hot path. Single-user PWA. Chrome DevTools is the right tool, used ad-hoc. |
| **Docker / containerized CI** | No backend services to spin up. Tests use fake-indexeddb, not a real browser DB. Playwright uses direct Chromium install. |
| **Turborepo / Nx** | Single-package repo (not a monorepo). pnpm scripts + GitHub Actions job-level parallelism is sufficient. |
| **Husky / lint-staged** | CI is the enforcement point, not git hooks. Keeps dev loop fast. Can add later if needed. |
| **Jest** | Already on Vitest 4.x. No reason to switch. |
| **Cypress** | Already on Playwright with working E2E specs. No reason to switch. |
| **Visual regression (Percy, Chromatic)** | External paid services. For a single-user PWA, functional E2E tests (does the button work, does data persist) matter more than pixel-perfect screenshots. Consider later if UI churn becomes a problem. |

---

## GitHub Actions Workflow Architecture

Based on cipher-box patterns adapted for this project's simpler (non-monorepo) structure:

### ci.yml (on: pull_request to main)

```
Job graph:
  changes (detect) ──> lint
                   ──> typecheck (if src changed)
                   ──> test-unit (if src changed)
                        ├── coverage report
                        └── migration tests (if db changed)
                   ──> build (if src changed)
                        └── bundle-security (post-build)
                   ──> test-e2e (if e2e or src changed)
                        └── Playwright report artifact on failure
                   ──> supply-chain-audit
                   ──> pr-coverage-comment
```

### Key patterns from cipher-box:

1. **`--frozen-lockfile`**: Always use `pnpm install --frozen-lockfile` in CI. Prevents lockfile drift.
2. **Parallel jobs**: lint, typecheck, test, build, audit run in parallel after change detection.
3. **Artifact upload on failure**: Playwright HTML report + trace uploaded only when tests fail.
4. **pnpm cache**: `actions/setup-node` with `cache: 'pnpm'` handles store caching automatically.
5. **Next.js build cache**: `actions/cache` for `.next/cache` with key based on `pnpm-lock.yaml` hash.
6. **PR title lint**: Conventional Commits enforcement via shell regex (no npm package).

---

## Installation Summary

### New npm packages: NONE

All capabilities come from:
- Existing dev dependencies (`@vitest/coverage-v8`, `@playwright/test`, `fake-indexeddb`)
- pnpm built-in features (`audit`, `minimumReleaseAge`, `trustPolicy`)
- GitHub Actions marketplace (free actions, no tokens required except `GITHUB_TOKEN`)
- Vitest built-in features (`bench` command, coverage reporters)
- Playwright built-in features (`github` reporter, IndexedDB storageState)

### Configuration changes:

```bash
# .npmrc additions (3 lines)
minimum-release-age=1440
trust-policy=no-downgrade
block-exotic-subdeps=true

# vitest.config.ts: Add coverage thresholds + reporters
# playwright.config.ts: Add github reporter, screenshot/video on failure
# New files: .github/workflows/ci.yml (main CI), possibly pr-title.yml
```

### New scripts in package.json:

```json
{
  "test:ci": "vitest run --coverage",
  "test:bench": "vitest bench",
  "test:e2e:ci": "playwright test --reporter=github,html"
}
```

---

## Version Verification

| Tool | Claimed Version | Verification Source | Confidence |
|------|----------------|---------------------|------------|
| dorny/paths-filter | v3 (v4 exists) | [GitHub releases](https://github.com/dorny/paths-filter/releases), cipher-box uses v3 | HIGH |
| davelosert/vitest-coverage-report-action | v2 (v2.8.3) | [GitHub Marketplace](https://github.com/marketplace/actions/vitest-coverage-report) | HIGH |
| pnpm minimumReleaseAge | pnpm 10.16+ | [pnpm docs](https://pnpm.io/supply-chain-security), local pnpm 10.30.2 | HIGH |
| pnpm trustPolicy | pnpm 10.21+ | [pnpm 10.21 release](https://pnpm.io/blog/releases/10.21), local pnpm 10.30.2 | HIGH |
| Playwright IndexedDB storageState | 1.51+ | [Playwright release notes](https://playwright.dev/docs/release-notes), local 1.58.2 | HIGH |
| Vitest bench | Vitest 4.x | [Vitest CLI docs](https://vitest.dev/guide/cli), local 4.0.18 | HIGH |
| @vitest/coverage-v8 | 4.0.18 | package.json, already installed | HIGH |
| actions/checkout, setup-node, cache, upload-artifact | v4 | cipher-box reference, GitHub Actions current | HIGH |

---

## Sources

- [cipher-box CI workflow](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/ci.yml) -- GitHub Actions patterns, change detection, coverage upload
- [cipher-box E2E workflow](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/e2e.yml) -- Playwright CI integration, artifact upload
- [cipher-box PR title lint](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/pr-title.yml) -- Conventional Commits enforcement
- [cipher-box release gate](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/release-gate.yml) -- Release safety pattern
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security) -- minimumReleaseAge, trustPolicy, blockExoticSubdeps
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) -- V8 provider, reporters
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) -- CI configuration
- [dorny/paths-filter](https://github.com/dorny/paths-filter) -- Change detection action
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action) -- PR coverage comments
- [Next.js CI Build Caching](https://nextjs.org/docs/pages/guides/ci-build-caching) -- .next/cache strategy
