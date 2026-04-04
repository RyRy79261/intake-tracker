# Requirements: Intake Tracker

**Defined:** 2026-04-04
**Core Value:** Accurate, queryable health data across intake, vitals, and medication adherence — structured for cross-domain analysis and future AI querying

## v1.3 Requirements

Requirements for Deployment Lifecycle milestone. Each maps to roadmap phases.

### Release Automation

- [ ] **REL-01**: Conventional commit messages are enforced via commitlint + husky commit-msg hook
- [ ] **REL-02**: Release Please automates version bumps, changelog generation, and GitHub Releases on merge to main
- [ ] **REL-03**: CHANGELOG.md is generated automatically from conventional commits, grouped by type
- [ ] **REL-04**: GitHub Releases are created with formatted release notes and semver git tags
- [ ] **REL-05**: Package.json version is reconciled from `0.1.0` to current project version before Release Please activation
- [ ] **REL-06**: Existing `version-bump.yml` is replaced by Release Please workflow

### Staging Environment

- [ ] **STG-01**: Stable staging URL (`staging.intake-tracker.ryanjnoble.dev`) deploys automatically on push to `staging` branch (manual Vercel + DNS setup documented)
- [ ] **STG-02**: Staging uses an isolated Neon DB branch for push notification data
- [ ] **STG-03**: Staging-specific environment variables are configured in Vercel (DATABASE_URL, Privy origins, etc.)
- [ ] **STG-04**: PWA/service worker is disabled on staging to prevent stale content caching
- [ ] **STG-05**: Neon staging branch resets to clean schema automatically on production release
- [ ] **STG-06**: Privy is configured to allow the staging origin for authentication

### Deployment Pipeline

- [ ] **DEP-01**: Branch protection rules require CI to pass before merging to `staging` or `main`
- [ ] **DEP-02**: GitHub environment protection rules gate production deployments with required reviewer approval
- [ ] **DEP-03**: Deployment workflows are separate files from existing `ci.yml`

### Observability

- [ ] **OBS-01**: App version from package.json is displayed in the Settings page
- [ ] **OBS-02**: Rollback procedure is documented (Vercel Instant Rollback + git revert)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Native App

- **NAT-01**: Android app via Capacitor, Tauri, or similar wrapper
- **NAT-02**: Platform-specific build pipeline in CI/CD

### Advanced Deployment

- **ADV-01**: CI-built Vercel deployments (`--prebuilt`) for artifact-exact deploys
- **ADV-02**: Automated E2E tests against live staging URL
- **ADV-03**: Slack/Discord deployment notifications

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Release Please manifest mode (multi-package) | Single-app repo — manifest mode is for monorepos |
| Date-based staging tags | Branch tip is the staging state; extra tags add overhead for single app |
| Per-PR Neon database branches | Neon only used for push subscriptions; one persistent staging branch is sufficient |
| Vercel `--prebuilt` pipeline | Adds significant complexity; Vercel git integration is reliable for single app |
| Custom Vercel environments (Pro plan) | Branch-domain mapping on Hobby plan achieves the same result for free |
| Canary/blue-green deployments | Single-user app; Vercel Instant Rollback is sufficient |
| Multi-environment Neon (dev/staging/prod) | Dev doesn't need Neon; two environments sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-01 | Phase 27 | Pending |
| REL-02 | Phase 27 | Pending |
| REL-03 | Phase 27 | Pending |
| REL-04 | Phase 27 | Pending |
| REL-05 | Phase 27 | Pending |
| REL-06 | Phase 27 | Pending |
| STG-01 | Phase 28 | Pending |
| STG-02 | Phase 28 | Pending |
| STG-03 | Phase 28 | Pending |
| STG-04 | Phase 28 | Pending |
| STG-05 | Phase 28 | Pending |
| STG-06 | Phase 28 | Pending |
| DEP-01 | Phase 29 | Pending |
| DEP-02 | Phase 29 | Pending |
| DEP-03 | Phase 29 | Pending |
| OBS-01 | Phase 30 | Pending |
| OBS-02 | Phase 30 | Pending |

**Coverage:**
- v1.3 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation*
