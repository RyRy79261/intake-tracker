# Requirements: Intake Tracker

**Defined:** 2026-03-27
**Core Value:** Accurate, queryable health data across all domains — structured so that cross-domain analysis is reliable and future AI querying is possible.

## v1.2 Requirements

Requirements for milestone v1.2 CI & Data Integrity. Each maps to roadmap phases.

### CI Pipeline

- [ ] **CIPL-01**: GitHub Actions workflow runs ESLint, TypeScript check, and Vitest unit tests as parallel jobs on every PR
- [ ] **CIPL-02**: CI runs `pnpm build` and verifies no secrets in the client bundle
- [ ] **CIPL-03**: Unit tests run under both TZ=Africa/Johannesburg and TZ=Europe/Berlin in CI

### Data Integrity

- [ ] **DATA-04**: Schema consistency check verifies each `db.version(N)` includes all tables from prior versions
- [ ] **DATA-05**: Any change to `db.ts` forces all migration and backup round-trip tests to run
- [ ] **DATA-06**: CI runs backup export + import round-trip covering all 16 tables and verifies no data loss
- [ ] **DATA-07**: CI fails if a new Dexie table is added without updating the backup service and test fixtures

### E2E Testing

- [ ] **E2E-01**: Playwright runs in headless Chromium in CI with browser caching for fast startup
- [ ] **E2E-02**: E2E scenarios cover composable entry creation, medication dose logging lifecycle, and settings persistence
- [ ] **E2E-03**: E2E tests run against production build (`pnpm build && pnpm start`) not dev server

### Supply Chain Security

- [ ] **SCHN-01**: pnpm enforces 24h minimum package age via `minimumReleaseAge=1440`
- [ ] **SCHN-02**: pnpm `trustPolicy=no-downgrade` detects compromised publisher accounts
- [ ] **SCHN-03**: pnpm `blockExoticSubdeps=true` prevents git/tarball transitive dependencies
- [ ] **SCHN-04**: `pnpm audit` runs in CI and fails on known vulnerabilities

### CI Optimization

- [ ] **CIOP-01**: Dynamic test selection via `dorny/paths-filter` gates expensive jobs on changed file categories
- [ ] **CIOP-02**: Coverage report posted as PR comment, tracking decrease rather than absolute threshold
- [ ] **CIOP-03**: Next.js `.next/cache` preserved between CI runs for faster builds

### Benchmarking

- [ ] **BNCH-01**: Vitest bench establishes performance baselines for critical paths (migration speed, service layer operations)

## v1.0–v1.1 Requirements (completed)

See archived requirements:
- `.planning/milestones/v1.0-REQUIREMENTS.md` — 36 requirements (all complete)
- `.planning/milestones/v1.1-REQUIREMENTS.md` — 17 requirements (all complete)

## Future Requirements

### Sync

- **SYNC-01**: Cloud sync via Dexie Cloud across devices

### AI Querying

- **AIQL-01**: Natural language questions against health data

### Reporting

- **REPT-01**: Doctor-ready report generation (PDF export)

### Platform

- **PLAT-01**: Capacitor wrapper for Android Play Store distribution

## Out of Scope

| Feature | Reason |
|---------|--------|
| External coverage service (Codecov/Coveralls) | vitest-coverage-report-action provides PR comments without signup/tokens |
| Flame graph profiling in CI | Single-user offline PWA has no server-side hot path; Chrome DevTools sufficient |
| Visual regression testing (screenshots) | Complexity vs value for single-user app; functional E2E is sufficient |
| Deployment pipeline (CD) | PWA deployed manually; CI focuses on quality gates, not deployment |
| Real-browser migration E2E | Prototyping deferred — fake-indexeddb migration tests + schema consistency is the pragmatic first step |
| Absolute coverage thresholds | Research shows decrease-tracking is more effective; Goodhart's Law risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CIPL-01 | — | Planned |
| CIPL-02 | — | Planned |
| CIPL-03 | — | Planned |
| DATA-04 | — | Planned |
| DATA-05 | — | Planned |
| DATA-06 | — | Planned |
| DATA-07 | — | Planned |
| E2E-01 | — | Planned |
| E2E-02 | — | Planned |
| E2E-03 | — | Planned |
| SCHN-01 | — | Planned |
| SCHN-02 | — | Planned |
| SCHN-03 | — | Planned |
| SCHN-04 | — | Planned |
| CIOP-01 | — | Planned |
| CIOP-02 | — | Planned |
| CIOP-03 | — | Planned |
| BNCH-01 | — | Planned |

**Coverage:**
- v1.2 requirements: 18 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 18

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27*
