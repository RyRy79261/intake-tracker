# Roadmap: Intake Tracker

## Overview

Personal health tracking PWA. v1.0 rebuilt the engineering foundation (strict TypeScript, atomic transactions, analytics, security, tests, push notifications). v1.1 redesigned the intake UI with composable data entries, unified cards, AI substance lookup, and dashboard modernization. v1.2 added a world-class CI pipeline protecting data integrity, E2E testing, supply chain hardening, and performance benchmarking. v1.3 establishes the deployment lifecycle: automated releases with changelogs, a stable staging environment with isolated backend, protected production deployments, and version observability.

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1–11, 44 plans (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 12–19, 16 plans (shipped 2026-03-27) — [archived](./milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 CI & Data Integrity** — Phases 20–26, 16 plans (shipped 2026-04-04) — [archived](./milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Deployment Lifecycle** — Phases 27–30 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.2 CI & Data Integrity (Phases 20–26) — SHIPPED 2026-04-04</summary>

- [x] Phase 20: Core CI Pipeline (2/2 plans) — completed 2026-03-28
- [x] Phase 21: Data Integrity Gates (2/2 plans) — completed 2026-03-28
- [x] Phase 22: E2E Testing in CI (2/2 plans) — completed 2026-03-28
- [x] Phase 23: Supply Chain Hardening (3/3 plans) — completed 2026-03-28
- [x] Phase 24: CI Optimization & Benchmarking (2/2 plans) — completed 2026-03-28
- [x] Phase 25: CI Integration Fixes (1/1 plan) — completed 2026-03-28
- [x] Phase 26: Comprehensive E2E Test Coverage (4/4 plans) — completed 2026-04-04

</details>

### 🚧 v1.3 Deployment Lifecycle (In Progress)

- [x] **Phase 27: Release Automation** - Replace fragile version-bump with Release Please pipeline producing changelogs, semver tags, and GitHub Releases (completed 2026-04-04)
- [x] **Phase 28: Staging Environment** - Stable staging URL with isolated Neon DB, disabled service worker, and configured auth (completed 2026-04-04)
- [ ] **Phase 29: Deployment Protection** - Branch protection, environment gates, and promotion workflow for production deployments
- [ ] **Phase 30: Observability & Rollback** - Version visibility in the app and documented recovery procedures

## Phase Details

### Phase 27: Release Automation
**Goal**: Every merge to main produces a properly versioned release with an auto-generated changelog and GitHub Release
**Depends on**: Nothing (first phase of v1.3; builds on existing CI from v1.2)
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06
**Success Criteria** (what must be TRUE):
  1. Committing with a non-conventional message format is rejected by the commit-msg hook before the commit is created
  2. Merging a `feat:` commit to main causes Release Please to open (or update) a release PR with a version bump and changelog entries
  3. Merging the Release Please PR creates a GitHub Release with formatted release notes and a semver git tag (e.g., `v1.3.0`)
  4. CHANGELOG.md exists in the repo root and contains entries grouped by type (Features, Bug Fixes, etc.) generated from conventional commits
  5. The old `version-bump.yml` workflow no longer exists and `package.json` version reflects the project's actual version history (starting from `1.2.0`)
**Plans**: TBD

### Phase 28: Staging Environment
**Goal**: A stable staging environment exists at a known URL with its own isolated backend, where service workers cannot cache stale content and auth works correctly
**Depends on**: Phase 27 (staging branch inherits clean version state from Release Please)
**Requirements**: STG-01, STG-02, STG-03, STG-04, STG-05, STG-06
**Success Criteria** (what must be TRUE):
  1. Pushing to the `staging` git branch automatically deploys to `staging.intake-tracker.ryanjnoble.dev` and the page loads successfully
  2. Push notification data on staging is stored in an isolated Neon DB branch, not the production database
  3. The service worker is not registered on the staging URL (no stale content caching between deployments)
  4. A user can log in via Privy on the staging URL without auth errors
  5. Triggering a Neon staging branch reset restores the staging database to a clean production-mirrored schema
**Plans**: TBD

### Phase 29: Deployment Protection
**Goal**: Production deployments are gated by CI checks and human approval, with promotion managed through dedicated workflows separate from ci.yml
**Depends on**: Phase 28 (promotion workflow requires a working staging environment to promote from)
**Requirements**: DEP-01, DEP-02, DEP-03
**Success Criteria** (what must be TRUE):
  1. A PR to `staging` or `main` cannot be merged unless CI passes (branch protection rules enforced)
  2. Production deployment via the promotion workflow requires at least one reviewer approval through GitHub environment protection
  3. Deployment and promotion workflows exist as separate `.yml` files from `ci.yml`
**Plans**: TBD

### Phase 30: Observability & Rollback
**Goal**: The running app version is visible to the user and there is a documented procedure for recovering from bad deployments
**Depends on**: Phase 27 (version display requires Release Please to manage package.json version)
**Requirements**: OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. The Settings page displays the current app version (matching the version in package.json at build time)
  2. A rollback runbook exists documenting how to use Vercel Instant Rollback and git revert to recover from a bad production deployment
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 27 → 28 → 29 → 30

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 20. Core CI Pipeline | v1.2 | 2/2 | Complete | 2026-03-28 |
| 21. Data Integrity Gates | v1.2 | 2/2 | Complete | 2026-03-28 |
| 22. E2E Testing in CI | v1.2 | 2/2 | Complete | 2026-03-28 |
| 23. Supply Chain Hardening | v1.2 | 3/3 | Complete | 2026-03-28 |
| 24. CI Optimization & Benchmarking | v1.2 | 2/2 | Complete | 2026-03-28 |
| 25. CI Integration Fixes | v1.2 | 1/1 | Complete | 2026-03-28 |
| 26. Comprehensive E2E Test Coverage | v1.2 | 4/4 | Complete | 2026-04-04 |
| 27. Release Automation | v1.3 | 3/3 | Complete    | 2026-04-04 |
| 28. Staging Environment | v1.3 | 4/4 | Complete   | 2026-04-04 |
| 29. Deployment Protection | v1.3 | 0/? | Not started | - |
| 30. Observability & Rollback | v1.3 | 0/? | Not started | - |
