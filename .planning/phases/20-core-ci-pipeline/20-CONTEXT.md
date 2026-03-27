# Phase 20: Core CI Pipeline - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every PR automatically validates code quality, type safety, build success, and test correctness across both deployment timezones (Africa/Johannesburg and Europe/Berlin). This phase delivers the GitHub Actions CI workflow and documents branch protection settings for manual configuration.

</domain>

<decisions>
## Implementation Decisions

### Workflow Structure
- **D-01:** Single `ci.yml` workflow file with parallel jobs (lint, typecheck, test-tz-sa, test-tz-de, build)
- **D-02:** Trigger on `pull_request` targeting `main` only. Version-bump.yml already handles post-merge concerns
- **D-03:** Timezone test runs as two separate parallel jobs (not sequential in one job) for faster execution and clear failure attribution
- **D-04:** Cache pnpm store between CI runs using `pnpm/action-setup` built-in cache or `actions/cache`

### Secret Scanning
- **D-05:** Bundle security test runs as part of the build job (after `pnpm build`), not as a separate job
- **D-06:** Add Neon DB patterns to existing bundle-security.test.ts — check for `postgres://` connection strings and `NEON_*` env vars in addition to the existing 6 patterns

### Failure Reporting
- **D-07:** Status checks only (no PR annotations or comment summaries). Each job reports independently
- **D-08:** A `ci-pass` gate job that depends on all other jobs (lint, typecheck, test-tz-sa, test-tz-de, build). This is the single required status check for branch protection, ensuring no job can be silently removed

### Branch Protection
- **D-09:** Branch protection configured manually in GitHub repo settings after the workflow is running, not automated via CI
- **D-10:** CONTEXT.md (this file) documents recommended settings for manual configuration:
  - Require `ci-pass` status check to pass before merge
  - Require branches to be up to date before merging
  - Do not allow bypassing required checks (no admin bypass)
  - No force pushes to main
  - No branch deletions for main

### Claude's Discretion
- Node.js version for CI runners (match what's working in version-bump.yml or upgrade)
- Specific pnpm/action-setup version and cache configuration details
- Whether to add `tsc --noEmit` as a new package.json script or inline in the workflow
- Ubuntu runner version (latest vs pinned)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CI Infrastructure
- `.github/workflows/version-bump.yml` -- Existing workflow pattern to follow for Actions setup
- `vitest.config.ts` -- Vitest configuration (test environment, setup files, include/exclude patterns)
- `playwright.config.ts` -- Playwright config (Phase 22 scope, but useful for understanding test infrastructure)

### Test Infrastructure
- `src/__tests__/bundle-security.test.ts` -- Existing bundle security scanner, needs Neon DB patterns added (D-06)
- `src/__tests__/setup.ts` -- Vitest setup file
- `package.json` scripts: `test`, `test:tz:sa`, `test:tz:de`, `test:tz`, `test:coverage`, `lint`, `build`

### Linting
- `.eslintrc.json` -- ESLint config with next/core-web-vitals and custom import restriction rules

### Requirements
- `.planning/REQUIREMENTS.md` -- CIPL-01, CIPL-02, CIPL-03 map to this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bundle-security.test.ts`: Already checks 6 secret patterns against .next/static. Needs Neon patterns added
- Dual-TZ scripts: `test:tz:sa` and `test:tz:de` already exist in package.json, ready to use in CI
- `@vitest/coverage-v8`: Already installed, `test:coverage` script exists

### Established Patterns
- Version-bump.yml uses Node.js 18, actions/checkout@v4, setup-node@v4 -- follow same pattern
- ESLint configured via `.eslintrc.json` with `next lint` command
- Vitest tests in `src/**/*.test.ts` (28 test files), setup in `src/__tests__/setup.ts`

### Integration Points
- CI workflow goes in `.github/workflows/ci.yml` alongside existing `version-bump.yml`
- Bundle security test depends on `.next/static` existing (requires `pnpm build` first)
- `ci-pass` gate job becomes the single status check for branch protection

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

*Phase: 20-core-ci-pipeline*
*Context gathered: 2026-03-28*
