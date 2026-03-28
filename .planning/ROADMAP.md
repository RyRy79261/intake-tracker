# Roadmap: Intake Tracker

## Overview

Personal health tracking PWA. v1.0 rebuilt the engineering foundation (strict TypeScript, atomic transactions, analytics, security, tests, push notifications). v1.1 redesigned the intake UI with composable data entries, unified cards, AI substance lookup, and dashboard modernization. v1.2 adds a world-class CI pipeline that protects live data integrity above all else, catches regressions through automated UI and scenario testing, and hardens the supply chain against attacks.

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1–11, 44 plans (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 12–19, 16 plans (shipped 2026-03-27) — [archived](./milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 CI & Data Integrity** — Phases 20–25 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 20: Core CI Pipeline** - GitHub Actions with parallel lint, typecheck, unit tests, build, and timezone dual-pass (completed 2026-03-28)
- [x] **Phase 21: Data Integrity Gates** - Schema migration safety, backup round-trip verification, and table coverage enforcement in CI (completed 2026-03-28)
- [x] **Phase 22: E2E Testing in CI** - Playwright against production build with expanded scenario coverage (completed 2026-03-28)
- [x] **Phase 23: Supply Chain Hardening** - pnpm security configuration and vulnerability audit in CI (completed 2026-03-28)
- [x] **Phase 24: CI Optimization & Benchmarking** - Dynamic test selection, coverage reporting, build caching, and performance baselines (completed 2026-03-28)
- [ ] **Phase 25: CI Integration Fixes** - Fix typecheck target, regenerate benchmark baselines, complete drift check (gap closure)

## Phase Details

### Phase 20: Core CI Pipeline
**Goal**: Every PR automatically validates code quality, type safety, build success, and test correctness across both deployment timezones
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: CIPL-01, CIPL-02, CIPL-03
**Success Criteria** (what must be TRUE):
  1. Opening a PR triggers parallel CI jobs for linting, type checking, and unit tests -- each reports pass/fail independently
  2. CI builds the production bundle and verifies no secrets (API keys, tokens) leak into the client-side JavaScript
  3. Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin, and a timezone-sensitive test fails if either pass is skipped
  4. A PR with a TypeScript error, lint violation, or failing test cannot be merged (branch protection enforced)
**Plans**: 2 plans

Plans:
- [x] 20-01-PLAN.md — Fix TypeScript strict-mode errors, add typecheck script, extend bundle security patterns
- [x] 20-02-PLAN.md — Create CI workflow with parallel jobs and gate

### Phase 21: Data Integrity Gates
**Goal**: CI prevents any change from corrupting the Dexie schema, breaking migrations, or losing data during backup/restore -- protecting the user's irreplaceable phone-side health data
**Depends on**: Phase 20
**Requirements**: DATA-04, DATA-05, DATA-06, DATA-07
**Success Criteria** (what must be TRUE):
  1. A PR that adds a new `db.version(N)` block missing a table from a prior version fails CI with a clear error identifying the missing table
  2. Any change to `db.ts` automatically triggers the full migration test suite and backup round-trip tests -- skipping them is not possible
  3. CI exports a backup of all 16 tables, imports it into a fresh database, and verifies zero data loss (record counts, field integrity)
  4. Adding a new Dexie table without updating the backup service and test fixtures causes CI to fail with an actionable error message
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — Static schema parser, schema consistency test (DATA-04), and three-way table sync test (DATA-07)
- [x] 21-02-PLAN.md — Deep equality backup round-trip test (DATA-06) and data-integrity CI job (DATA-05)

### Phase 22: E2E Testing in CI
**Goal**: Real user workflows are exercised against the production build on every PR, catching functional regressions that unit tests miss
**Depends on**: Phase 20
**Requirements**: E2E-01, E2E-02, E2E-03
**Success Criteria** (what must be TRUE):
  1. Playwright runs in headless Chromium in CI with browser binary caching so startup is fast (not downloading Chromium every run)
  2. E2E tests exercise at least three key workflows: composable entry creation (food/liquid), medication dose logging lifecycle, and settings persistence across page reload
  3. E2E tests run against a production build (`pnpm build && pnpm start`), not the dev server, so regressions in the optimized bundle are caught
  4. A PR that breaks any exercised user workflow is blocked from merging
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — Playwright CI config (dual webServer, service worker blocking), e2e CI job, settings persistence test
- [x] 22-02-PLAN.md — Food/liquid composable entry tests and medication dose logging lifecycle test

### Phase 23: Supply Chain Hardening
**Goal**: The project is protected against supply chain attacks through pnpm security configuration and automated vulnerability scanning
**Depends on**: Phase 20
**Requirements**: SCHN-01, SCHN-02, SCHN-03, SCHN-04
**Success Criteria** (what must be TRUE):
  1. pnpm refuses to install any package published less than 24 hours ago (minimumReleaseAge enforced)
  2. pnpm detects and blocks publisher account compromises via trust policy (no-downgrade)
  3. Transitive dependencies using git URLs or tarball references are blocked (no exotic subdeps)
  4. `pnpm audit` runs in CI on every PR and fails the build if known vulnerabilities are found
**Plans**: 3 plans

Plans:
- [x] 23-01-PLAN.md — Add pnpm security settings and resolve all critical/high vulnerabilities
- [x] 23-02-PLAN.md — Add supply-chain CI job with config drift check and audit gate
- [x] 23-03-PLAN.md — Gap closure: fix lockfile override resolution and CI audit --ignore flags

### Phase 24: CI Optimization & Benchmarking
**Goal**: CI is fast and informative -- expensive jobs only run when relevant files change, coverage trends are visible per PR, builds are cached, and performance baselines exist for critical paths
**Depends on**: Phase 20, Phase 21, Phase 22, Phase 23
**Requirements**: CIOP-01, CIOP-02, CIOP-03, BNCH-01
**Success Criteria** (what must be TRUE):
  1. A docs-only or config-only PR skips expensive jobs (E2E, full test suite) and completes CI in under 2 minutes
  2. Every PR receives a coverage report comment showing change in coverage relative to the base branch (not an absolute threshold)
  3. Next.js build cache (`.next/cache`) is preserved between CI runs, measurably reducing build times on subsequent runs
  4. Vitest bench establishes performance baselines for critical paths (migration speed, service layer operations) that can detect regressions
**Plans**: 2 plans

Plans:
- [x] 24-01-PLAN.md — Benchmark test files, baseline generation, and coverage config
- [x] 24-02-PLAN.md — CI workflow overhaul: paths-filter gating, build cache, coverage job, benchmark job, skip-aware gate

### Phase 25: CI Integration Fixes
**Goal**: All CI jobs pass on a clean PR — typecheck succeeds, benchmark baselines compare correctly, and supply chain drift check is complete
**Depends on**: Phase 24 (gap closure for milestone audit defects)
**Requirements**: CIPL-01, CIPL-03, BNCH-01, SCHN-04
**Gap Closure**: Closes DEFECT-01 (critical), DEFECT-02 (warning), DEFECT-03 (minor) from v1.2 milestone audit
**Success Criteria** (what must be TRUE):
  1. `pnpm typecheck` (`tsc --noEmit`) exits 0 with zero errors
  2. `benchmarks/results.json` contains relative or CI-compatible paths, not worktree-absolute paths
  3. Supply chain drift check verifies all 4 pnpm security settings (minimumReleaseAge, trustPolicy, blockExoticSubdeps, auditLevel)
**Plans**: 1 plan

Plans:
- [ ] 25-01-PLAN.md — Fix tsconfig target, regenerate benchmark baselines, complete supply chain drift check

## Progress

**Execution Order:**
Phases execute in numeric order: 20 → 21 → 22 → 23 → 24 → 25
(Phases 21, 22, 23 can execute in any order after 20; Phase 24 depends on all prior phases; Phase 25 is gap closure)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 20. Core CI Pipeline | v1.2 | 2/2 | Complete    | 2026-03-28 |
| 21. Data Integrity Gates | v1.2 | 2/2 | Complete    | 2026-03-28 |
| 22. E2E Testing in CI | v1.2 | 1/2 | Complete    | 2026-03-28 |
| 23. Supply Chain Hardening | v1.2 | 3/3 | Complete    | 2026-03-28 |
| 24. CI Optimization & Benchmarking | v1.2 | 2/2 | Complete    | 2026-03-28 |
| 25. CI Integration Fixes | v1.2 | 0/1 | Planned     | — |
