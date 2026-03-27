# Research Summary: v1.2 CI & Data Integrity

**Domain:** CI pipeline, testing infrastructure, data integrity protection, supply chain security
**Researched:** 2026-03-27
**Overall confidence:** HIGH

## Executive Summary

This milestone adds a world-class CI pipeline to an existing 44K LOC offline-first health tracking PWA. The most remarkable finding is that **zero new npm packages are required**. Every capability -- coverage tracking, supply chain hardening, benchmarking, dynamic test selection -- is achievable through existing dev dependencies (Vitest 4.x, Playwright 1.58.x, pnpm 10.30.x), built-in tool features, free GitHub Actions, and pnpm configuration settings. The project already has 203 unit tests, 6 migration tests, a backup round-trip test, a bundle security scanner, and 3 Playwright E2E specs. The work is primarily CI wiring, configuration, and test expansion -- not greenfield tooling.

The cipher-box reference repository demonstrates the exact patterns needed: `dorny/paths-filter@v3` for dynamic test selection, parallel job structure with a fan-out from change detection, `codecov/codecov-action` for coverage (though we use the simpler `davelosert/vitest-coverage-report-action@v2` instead, since it requires no external service signup), and Conventional Commits enforcement via shell script. The key architectural decision is a single `ci.yml` workflow with 7-8 parallel jobs gated by file-category detection, keeping fast-path CI under 3 minutes for docs-only or config-only PRs.

The most critical risk is data integrity. This is not a typical web app -- all user data lives in IndexedDB on the user's phone with no server-side backup. Schema migrations are forward-only (IndexedDB cannot downgrade versions). The existing migration tests use fake-indexeddb, which does not replicate browser-specific behaviors like Safari's aggressive transaction timeouts or storage quota limits. CI must enforce migration safety as a first-class gate: every change to `db.ts` triggers migration tests, backup round-trip verification, and schema consistency checks. The PITFALLS.md research identified specific exposure points in the v10-v15 migration chain (lossy timezone conversion, heuristic substance record creation, destructive inventory transforms) that must be protected.

Supply chain security leverages pnpm 10.30.2's built-in features: `minimumReleaseAge: 1440` (24h quarantine), `trustPolicy: no-downgrade` (detect compromised publisher accounts), `blockExoticSubdeps: true` (prevent git/tarball transitive deps), and `pnpm audit` in CI. This defends against the class of attacks seen in the September 2025 npm compromise (796 packages, 132M weekly downloads) without adding any external security service dependency.

## Key Findings

**Stack:** Zero new npm packages. All capabilities from existing deps + pnpm config + free GitHub Actions.
**Architecture:** Single ci.yml with fan-out from change detection to parallel jobs (lint, typecheck, test, build, E2E, audit, coverage).
**Critical pitfall:** Dexie schema migrations are forward-only and fake-indexeddb does not replicate real browser behavior. Migration safety gates are the most important CI feature.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Core CI Pipeline** - Get the basics running first
   - Addresses: lint, typecheck, unit tests, build, E2E in GitHub Actions
   - Avoids: Monolithic job anti-pattern (parallel from the start)
   - Rationale: Every subsequent phase depends on CI being operational. No point adding coverage tracking or supply chain checks if the basic pipeline does not exist.

2. **Data Integrity Gates** - The most important differentiator
   - Addresses: Migration safety, backup round-trip, schema consistency, bundle security
   - Avoids: Pitfall 1 (schema corruption), Pitfall 3 (fake-indexeddb false confidence)
   - Rationale: This project's unique risk profile. Data loss is unrecoverable. Must be in place before any future schema changes.

3. **Dynamic Test Selection & Coverage** - Make CI intelligent
   - Addresses: dorny/paths-filter, conditional job execution, coverage PR comments
   - Avoids: Pitfall 6 (CI too slow), Pitfall 7 (coverage as noise)
   - Rationale: Keeps CI fast as tests grow. Coverage reporting provides visibility without hard-gating.

4. **Supply Chain Hardening** - Defense-in-depth
   - Addresses: minimumReleaseAge, trustPolicy, blockExoticSubdeps, pnpm audit
   - Avoids: Pitfall 4 (supply chain attack window)
   - Rationale: Configuration-only changes (.npmrc). Quick to implement but important to have before any dependency updates.

5. **Benchmarking & Polish** - Nice-to-haves
   - Addresses: vitest bench, PR title lint, Next.js build caching
   - Rationale: Lower priority. Benchmarks establish baselines; PR title lint improves changelog hygiene; build caching speeds up CI.

**Phase ordering rationale:**
- Core CI first because everything else is infrastructure on top of it
- Data integrity second because it is the project's unique risk (not generic CI advice)
- Dynamic test selection third because CI will be slow without it as test count grows
- Supply chain fourth because it is config-only and the project already has lockfile discipline
- Benchmarking last because it provides baselines, not gates

**Research flags for phases:**
- Phase 1: Standard patterns, well-documented by cipher-box reference. Unlikely to need research.
- Phase 2: Likely needs deeper research -- Playwright-based migration E2E testing in real Chromium is novel for this codebase. The schema consistency check script needs design.
- Phase 3: Standard patterns (dorny/paths-filter documented, vitest-coverage-report-action documented).
- Phase 4: Standard patterns (pnpm config settings, well-documented).
- Phase 5: Standard patterns (vitest bench is built-in).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages. All versions verified against local installs and official docs. |
| Features | HIGH | Feature list directly from PROJECT.md requirements. Scope is clear. |
| Architecture | HIGH | CI workflow patterns verified against cipher-box production implementation. |
| Pitfalls | HIGH | Data integrity risks verified against Dexie.js issue tracker. Supply chain risks verified against 2025 incident reports. |

## Gaps to Address

- **Playwright migration E2E in real browser (Phase 2):** How exactly to seed IndexedDB at a previous version in Playwright and verify migration. Playwright 1.51+ supports IndexedDB storageState but the exact workflow for migration testing needs prototyping.
- **Schema consistency check script (Phase 2):** A script that parses `db.ts` Dexie version declarations and verifies the latest version is a superset of previous versions. Needs design during phase planning.
- **Coverage baseline (Phase 3):** Current coverage percentage is unknown. Need to run `vitest run --coverage` to establish baseline before setting thresholds.
- **Benchmark targets (Phase 5):** No existing performance baselines. First benchmark run will establish them; regression detection comes later.
- **E2E test expansion scope:** The 3 existing E2E specs are thin (one test each). Phase 1 should include expanding these to cover more user workflows, but the exact scope depends on which flows are most regression-prone.

## Sources

- [cipher-box CI workflow](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/ci.yml) -- primary reference for GitHub Actions patterns
- [cipher-box E2E workflow](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/e2e.yml) -- Playwright CI integration
- [cipher-box PR title lint](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/pr-title.yml) -- Conventional Commits
- [cipher-box release gate](https://github.com/FSM1/cipher-box/blob/main/.github/workflows/release-gate.yml) -- Release safety
- [pnpm Supply Chain Security](https://pnpm.io/supply-chain-security) -- minimumReleaseAge, trustPolicy
- [dorny/paths-filter](https://github.com/dorny/paths-filter) -- Dynamic test selection
- [davelosert/vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action) -- PR coverage
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) -- V8 provider configuration
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) -- CI testing patterns
- [Next.js CI Build Caching](https://nextjs.org/docs/pages/guides/ci-build-caching) -- .next/cache strategy

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
