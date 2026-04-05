# Project Research Summary

**Project:** Intake Tracker v1.3 — Deployment Lifecycle
**Domain:** Release automation, staging environments, CI/CD pipeline for Next.js PWA on Vercel + Neon
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

This milestone establishes a proper deployment lifecycle for a mature single-user PWA that currently ships with a fragile keyword-based version-bump workflow, no changelogs, no GitHub Releases, and no staging environment. The research is highly confident because every component — Release Please, Vercel branch-domain assignment, Neon branching, and GitHub environment protection — is stable, well-documented, and specifically designed for the Hobby-plan / single-app / no-npm-publish use case. The correct approach is a clean transition: delete the existing `version-bump.yml` and replace it with Release Please, then add a persistent `staging` git branch mapped to a stable subdomain backed by an isolated Neon database branch.

The recommended architecture deliberately avoids overengineering. Research confirmed that several patterns which appear in reference projects (monorepo manifest mode, per-PR Neon branches, Vercel CLI deploys from Actions, Vercel Pro custom environments, date-stamped staging tags) are wrong-sized for a single-package app with one small server-side database. The right-sized solution uses Release Please in simple mode, Vercel's built-in Git integration for all deploys, a single persistent Neon staging branch, and GitHub environment protection for the promotion gate.

The most significant risks are all front-loaded in the first phase: the version history must be reconciled before Release Please activates (current `package.json` says `0.1.0` but the project is functionally at v1.2), the singular vs plural output name trap in Release Please v4 must be used correctly from day one, and `version-bump.yml` must be deleted before Release Please is enabled — running both simultaneously creates irrecoverable version state conflicts. Subsequent phases (Neon branch, Vercel staging, code changes) have well-understood, low-risk implementation patterns.

## Key Findings

### Recommended Stack

All tooling for this milestone is GitHub Actions and platform features — there are no new project dependencies. Release Please (`googleapis/release-please-action@v4`) replaces the existing `version-bump.yml` workflow and becomes the single source of truth for versioning, changelogs, and GitHub Releases. Vercel's built-in Git integration handles all deployments automatically on branch push with no custom Actions workflow needed. Neon's official GitHub Actions (`create-branch-action@v6`, `reset-branch-action@v1`) manage the isolated staging database. Two new config files (`release-please-config.json` and `.release-please-manifest.json`) live in the repo root; all secrets live in GitHub Secrets and Vercel env vars.

**Core technologies:**
- `googleapis/release-please-action@v4` (v4.4.0): Automated versioning and changelogs — PR-based workflow gives human review before version bumps; replaces the fragile keyword-based `version-bump.yml`
- Vercel branch-to-domain mapping (Hobby plan feature): Stable staging URL at `staging.intake-tracker.ryanjnoble.dev` — works without Pro plan upgrade, auto-deploys on push to `staging` branch
- `neondatabase/reset-branch-action@v1` (v1.3.2): Resets the persistent Neon staging branch to match production — copy-on-write means zero-cost, instant, preserves connection string
- `neondatabase/create-branch-action@v6` (v6.3.1): One-time staging branch creation — needed during initial setup only
- Conventional Commits (commit message convention): Hard dependency of Release Please — project already uses `chore:`, `docs:`, `fix:` prefixes, needs consistent `feat:` adoption

### Expected Features

Research clearly separates the P1 launch set from post-launch additions and deferred work.

**Must have (v1.3 core — P1):**
- Conventional Commits enforcement — foundation for Release Please; without it, changelogs are empty and version bumps are silent
- Release Please pipeline (`release-please.yml`) — replaces `version-bump.yml`; produces changelogs, semver tags, GitHub Releases
- CHANGELOG.md generation — automated, no manual maintenance; produced by Release Please
- GitHub Releases with release notes — canonical record of what shipped; free output of Release Please
- Staging branch with stable domain (`staging.intake-tracker.ryanjnoble.dev`) — persistent URL for pre-production testing
- Neon staging branch — isolates push notification data from production; prevents staging tests corrupting production data
- CI gates on all deployments — existing `ci-pass` gate via branch protection already covers this; confirm wiring

**Should have (v1.3.x follow-up — P2):**
- GitHub environment protection rules — required-reviewer gate before production merges; free for public repos
- Version display in app (Settings page) — surface `package.json` version at build time; trivial, useful for "which version is live?"
- Release-triggered staging Neon refresh — reset staging DB on every GitHub Release event; keeps staging data current
- Rollback runbook — document Vercel Instant Rollback + `git revert` procedure after first real release

**Defer (v2+ — P3):**
- CI-built Vercel deployments (`--prebuilt`) — eliminates build-environment divergence; high complexity for near-zero practical risk given a deterministic lockfile
- Automated E2E tests against staging URL — blocked by Privy origin restrictions on test account
- Slack/Discord deployment notifications — audience of one; GitHub and Vercel dashboard is sufficient

### Architecture Approach

Three workflow files integrate with the existing 12-job CI pipeline without modifying it. The key separation is: `ci.yml` is a quality gate on PRs only; release and deployment are separate concerns triggered by different events. Release Please runs on push to `main`, scans conventional commits, and opens/accumulates a release PR. Merging that PR creates the GitHub Release and tag. Vercel handles all actual deployments via Git integration — push to `main` deploys production, push to `staging` deploys staging. The Neon staging branch is a persistent child of production, reset manually via `workflow_dispatch` when fresh data is needed.

**Major components:**
1. `release-please.yml` (NEW) — triggered on push to `main`; creates/updates release PR; on merge creates GitHub Release + tag; replaces `version-bump.yml` entirely
2. `staging-reset.yml` (NEW) — manual `workflow_dispatch` to reset Neon staging branch to production state; run before promotion testing
3. `promote.yml` (NEW) — manual `workflow_dispatch` with GitHub `production` environment gate; merges `staging` branch into `main` with required-reviewer approval
4. Vercel staging environment — branch-domain assignment maps `staging.intake-tracker.ryanjnoble.dev` to the `staging` git branch with overridden env vars (`DATABASE_URL`, `NEXT_PUBLIC_IS_STAGING`)
5. Neon staging branch — persistent copy-on-write clone of production; connection string never changes across resets
6. Code changes (`next.config.js`, `about-dialog.tsx`, `/api/version`) — staging detection via `NEXT_PUBLIC_IS_STAGING` env var; shows distinct "Staging" badge in About dialog

### Critical Pitfalls

1. **Release Please v4 `releases_created` (plural) output trap** — Always use `release_created` (singular) in conditionals; the plural form evaluates as truthy on every push to main, triggering unintended deployments on every merge. Smoke test: merge a non-release commit to main and confirm no GitHub Release is created.

2. **Version history reconciliation before bootstrap** — `package.json` version is `0.1.0` but the project is functionally at v1.2 (last milestone commit `a3a0b2d`). Before enabling Release Please: update `package.json` to `1.2.0`, set `.release-please-manifest.json` to `{ ".": "1.2.0" }`, create git tag `v1.2.0` on `a3a0b2d`, and set `bootstrap-sha` in config to that commit. Failure causes Release Please to propose wrong versions or scan the entire git history for changelog entries.

3. **Running `version-bump.yml` and Release Please simultaneously** — Never acceptable even briefly. Two version management systems create irrecoverable state conflicts. Delete `version-bump.yml` in the same PR that introduces `release-please.yml`.

4. **Service worker caching stale content on staging** — Vercel ALWAYS builds in production mode for all environments including staging previews, so `next-pwa` generates a service worker for staging despite the existing `NODE_ENV === 'production'` guard in `next.config.js`. Add `&& process.env.VERCEL_ENV === 'production'` to the PWA check before the first staging deployment; retrofitting after the service worker is installed requires manual cache clearing on every test device.

5. **Privy auth failing on staging due to origin mismatch** — The staging subdomain is a different origin from production. Add `staging.intake-tracker.ryanjnoble.dev` to Privy Dashboard allowed origins before deploying to staging, or login will silently fail. Configure before first staging deployment — not after symptoms appear.

## Implications for Roadmap

Based on research dependencies, the architecture's suggested build order directly maps to phases. Each phase is independent of later ones but is a prerequisite for the next.

### Phase 1: Release Please — Replace Version Automation
**Rationale:** Fully independent of all other phases. Fixes the broken version-bump workflow immediately and produces correct semver history from the first merge. Must come first so the staging branch inherits a clean version state and every subsequent merge to `main` is properly versioned.
**Delivers:** `release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`, automated `CHANGELOG.md`, GitHub Releases on every milestone merge; deletion of `version-bump.yml`
**Addresses:** Automated release pipeline, CHANGELOG.md, GitHub Releases (all P1 table-stakes features from FEATURES.md)
**Avoids:** `releases_created` plural trap; version/tag mismatch bootstrap trap; `version-bump.yml` coexistence trap; CI gate file-boundary confusion (new workflow is a separate file, not a new job in `ci.yml`)

### Phase 2: Staging Environment — Vercel + Neon + Auth + Service Worker
**Rationale:** Neon connection string must exist before Vercel staging env vars can be configured. Service worker disable and Privy allowed-origin config must both be done before the first staging deployment — retrofitting after a service worker is installed is significantly more painful. Groups all "configure before first deploy" concerns into one phase.
**Delivers:** `staging` git branch; `staging.intake-tracker.ryanjnoble.dev` with stable URL; Neon staging branch with isolated `DATABASE_URL`; service worker disabled on staging; Privy origin configured for staging subdomain
**Uses:** `neondatabase/create-branch-action@v6`, Vercel branch-domain assignment, Vercel branch-specific env vars, Privy Dashboard settings
**Avoids:** Service worker stale content trap; Privy origin mismatch; preview-vs-staging env var bleed; staging using production Neon data

### Phase 3: Promotion Workflow + Code Changes
**Rationale:** Promotion workflow requires staging to exist (Phase 2) and a production environment to target. Code changes (staging badge, version display, API route) are cosmetic and functional only after the staging environment exists. Groups "polish and promotion path" work that closes out the deployment lifecycle.
**Delivers:** `promote.yml` with GitHub `production` environment approval gate; `staging-reset.yml` for manual Neon refresh; staging environment badge in About dialog; version surfaced in Settings; `/api/version` route with staging flag
**Implements:** GitHub environment protection rules; `NEXT_PUBLIC_IS_STAGING` detection in `next.config.js` and `about-dialog.tsx`; `NEXT_PUBLIC_APP_VERSION` build-time injection
**Avoids:** `VERCEL_ENV` system variable override anti-pattern; About dialog showing "Preview" instead of "Staging"; automatic staging Neon reset on every push (manual only)

### Phase Ordering Rationale

- Release Please before everything because it is independent, fixes an existing broken workflow, and every commit after this phase feeds correctly into changelog generation
- Neon branch before Vercel staging env because the staging `DATABASE_URL` env var in Vercel must point to the Neon staging connection string; you cannot configure what does not exist
- Service worker and Privy origin config before first staging deploy because both are "must configure before first deploy" concerns that cannot be easily retrofitted on a live staging origin with cached assets
- Promotion workflow last because it requires a working staging environment to have something to promote; the approval gate is valuable but not blocking earlier phases from delivering value

### Research Flags

Phases with well-documented patterns (skip `/gsd:research-phase`):
- **Phase 1 (Release Please):** Official docs are comprehensive, actions are stable, exact workflow YAML is drafted in ARCHITECTURE.md. The only complexity — bootstrap version alignment — is already resolved in PITFALLS.md with the specific commit SHA (`a3a0b2d`) and target version (`1.2.0`).
- **Phase 2 (Staging environment):** Vercel branch-domain setup is documented step-by-step in official KB. Neon branch creation is straightforward. Both pitfall mitigations (service worker, Privy) are written as concrete code changes in ARCHITECTURE.md.
- **Phase 3 (Promotion + code changes):** GitHub environment protection is a native GitHub feature with clear docs. Code changes are small and already drafted in ARCHITECTURE.md with exact `next.config.js` and `about-dialog.tsx` snippets.

No phases require additional research — all four research files are HIGH confidence sourced from official documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official repos and docs; exact action versions pinned with release dates confirmed in March/April 2026 |
| Features | HIGH | Feature set right-sized against a concrete reference project (cipher-box) and documented platform constraints (Hobby vs Pro plan) |
| Architecture | HIGH | Workflow YAML patterns fully drafted; component boundaries explicit; data flow traced end-to-end |
| Pitfalls | HIGH | Pitfalls verified against official docs, codebase inspection with specific line numbers cited, and a documented real-world bug report for the RP v4 output trap |

**Overall confidence:** HIGH

### Gaps to Address

- **Conventional Commits enforcement (commitlint + husky):** Research recommends this as P1 table-stakes but notes it is acceptable to defer for v1.3 MVP with manual commit discipline. The codebase already uses conventional prefixes. Decision needed during planning: add commitlint enforcement in Phase 1 or defer to a later milestone. If deferred, document the convention explicitly in CLAUDE.md.
- **`bootstrap-sha` exact value:** PITFALLS.md identifies commit `a3a0b2d` as the v1.2 completion commit. Verify this is still the intended bootstrap point when Phase 1 executes — additional commits may have landed on `main` since research was written.
- **Neon compute hours on free tier:** Free tier allows approximately 100 hours/month. Auto-suspend (5-minute idle default) should keep usage manageable for a single-user app, but monitor after the first two weeks of staging usage.
- **ALLOWED_EMAILS on staging:** Staging must have the identical `ALLOWED_EMAILS` whitelist as production. Without it, the `privy-server.ts` whitelist check allows all authenticated users. Verify by calling `/api/version` on staging after setup — if it returns without auth, the whitelist is not enforced.

## Sources

### Primary (HIGH confidence)
- [googleapis/release-please-action](https://github.com/googleapis/release-please-action) — v4 inputs/outputs, config schema, `release_created` vs `releases_created` semantics
- [googleapis/release-please manifest docs](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) — bootstrap-sha, manifest file format, node release-type
- [neondatabase/create-branch-action](https://github.com/neondatabase/create-branch-action) — v6.3.1 inputs/outputs
- [neondatabase/reset-branch-action](https://github.com/neondatabase/reset-branch-action) — v1.3.2, `parent: true` reset behavior
- [Neon branching with GitHub Actions](https://neon.com/docs/guides/branching-github-actions) — official CI/CD integration guide
- [Vercel Environments docs](https://vercel.com/docs/deployments/environments) — plan limitations, preview vs production vs custom environments
- [Vercel staging setup KB](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) — branch-domain assignment on Hobby plan
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) — `VERCEL_ENV` vs `VERCEL_TARGET_ENV` vs `VERCEL_GIT_COMMIT_REF` distinctions
- [Vercel assign domain to git branch](https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch) — confirmed available on all plans
- [GitHub environments for deployment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment) — required reviewers, public repo access
- [Privy settings docs](https://docs.privy.io/guide/dashboard/settings) — allowed origins configuration
- Existing codebase: `ci.yml`, `version-bump.yml`, `next.config.js` (line 3 PWA conditional, line 58 version injection), `push-db.ts`, `providers.tsx` (lines 116-128), `about-dialog.tsx`, `privy-server.ts` (line 119)

### Secondary (MEDIUM confidence)
- [Release Please v4 gotcha report](https://danwakeem.medium.com/beware-the-release-please-v4-github-action-ee71ff9de151) — `releases_created` plural bug, real-world impact
- [Neon: How to keep staging in sync](https://neon.com/blog/how-to-keep-staging-in-sync-with-production-in-postgres) — reset-branch strategy and cadence guidance
- [Release automation comparison](https://oleksiipopov.com/blog/npm-release-automation/) — Release Please vs semantic-release vs Changesets tradeoffs
- [Vercel CLI docs](https://vercel.com/docs/cli) — v50.39.0 latest (version changes frequently; pin to `@latest`)

---
*Research completed: 2026-04-04*
*Ready for roadmap: yes*
