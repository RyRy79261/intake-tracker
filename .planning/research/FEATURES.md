# Feature Research: Deployment Lifecycle

**Domain:** Release automation, staging environments, and CI/CD deployment pipelines for a single Next.js app on Vercel
**Researched:** 2026-04-04
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features any production-grade single-app deployment pipeline should have. Missing these means the pipeline is incomplete or fragile.

| Feature | Why Expected | Complexity | CI Dependency | Notes |
|---------|--------------|------------|---------------|-------|
| **Conventional Commits enforcement** | Release automation tools (Release Please, semantic-release) require structured commit messages to determine version bumps and generate changelogs. Without enforcement, one bad commit message breaks the chain. | LOW | None (local git hook) | commitlint + husky. pnpm-native setup: `pnpm add -D @commitlint/cli @commitlint/config-conventional husky`. The commit-msg hook validates messages before they reach the repo. Existing `preinstall` hook already enforces pnpm. |
| **Automated release pipeline (Release Please)** | Manual version bumps are error-prone, current `version-bump.yml` doesn't generate changelogs or GitHub Releases. Release Please parses conventional commits, maintains a release PR with changelog preview, bumps `package.json` version, tags the commit, and creates a GitHub Release on merge. | MEDIUM | Replaces `version-bump.yml`. Runs on push to `main`. | Use `googleapis/release-please-action` with `release-type: node`. Config files: `release-please-config.json` + `.release-please-manifest.json`. Single-app mode (not manifest multi-package). Creates a persistent "Release PR" that accumulates changes; merging it triggers the release. Current version is `0.1.0` -- first release will be whatever semver the accumulated conventional commits dictate. |
| **CHANGELOG.md generation** | Users (and future-you) need a record of what changed per release. Release Please generates this automatically from conventional commit messages, grouped by type (features, fixes, etc.). | LOW | Part of Release Please -- no separate tool needed. | Generated file committed to repo by Release Please bot. No manual maintenance. |
| **GitHub Releases with release notes** | GitHub Releases are the canonical way to communicate what shipped. Release Please creates these automatically when the release PR merges, populating the body from the changelog entry. | LOW | Part of Release Please. Requires `contents: write` permission on the workflow. | Each release gets a git tag (e.g., `v1.3.0`) and a GitHub Release with formatted notes. These serve as the source of truth for "what version is deployed." |
| **Staging environment with stable URL** | Need to verify changes in a production-like environment before they go live. A persistent `staging.intake-tracker.ryanjnoble.dev` URL lets you test without hunting for preview deployment URLs. | MEDIUM | New staging workflow or branch-domain config in Vercel. | **Hobby plan approach:** Assign a custom domain (`staging.intake-tracker.ryanjnoble.dev`) to a `staging` branch in Vercel Dashboard (Settings > Domains > Edit > assign to staging branch). Vercel auto-deploys on push to that branch. No custom environments needed (Pro-only feature). Branch-specific env vars override Preview defaults. |
| **Isolated staging database (Neon branch)** | Push notification subscriptions use server-side Neon Postgres. Staging must not pollute production data. A persistent Neon branch for staging provides schema isolation with near-zero cost. | LOW | Neon `create-branch-action` in staging deploy workflow, or manual one-time branch creation. | Neon free tier allows unlimited branches (0.5 GB storage per branch). Create a persistent `staging` branch from `main` once. Set `DATABASE_URL` as a staging-branch-specific env var in Vercel. Use `neondatabase/reset-branch-action` to refresh staging data from production periodically if needed. |
| **CI-gated deployments (CI must pass before deploy)** | Deploying broken code to staging or production defeats the purpose. The existing 12-job CI pipeline should gate all deployments. | LOW | Existing `ci.yml` `ci-pass` job. New deploy workflows depend on CI passing. | For staging: deploy workflow triggers on push to `staging` branch, depends on CI passing. For production: Vercel auto-deploys on merge to `main` (current behavior) -- CI already gates PRs to main via branch protection. |
| **Promotion flow (staging to production)** | After validating on staging, need a clear path to production. For a single-app Hobby plan, this is merge-to-main. No need for Vercel's "promote deployment" feature (Pro-only staged production builds). | LOW | Merge PR from `staging` to `main` triggers production deploy. | The simplest right-sized approach: staging branch gets a PR to main. CI runs, reviewer approves, merge triggers Vercel production deploy. This is just normal Git flow with a named staging branch. |

### Differentiators (Competitive Advantage)

Features that make the deployment pipeline notably better than "just push to main." Not required for a working pipeline, but add real value.

| Feature | Value Proposition | Complexity | CI Dependency | Notes |
|---------|-------------------|------------|---------------|-------|
| **GitHub environment protection rules** | Manual approval gate before production deployment. Adds a human checkpoint without complex tooling. Since the repo is public, GitHub Free plan supports required reviewers on environments. | LOW | New GitHub environment `production` with required reviewer. Deploy workflow uses `environment: production`. | Create `production` environment in repo Settings > Environments. Add yourself as required reviewer. The deploy-to-production workflow references this environment, pausing for approval. Public repos get this for free. |
| **Deployment status notifications** | Know immediately when staging/production deploys succeed or fail without checking the dashboard. GitHub deployment status checks + Vercel's built-in GitHub integration already provide PR comments with preview URLs. | LOW | Vercel GitHub integration (already active). | Vercel's existing integration posts deployment status to PRs. For staging branch, this means every push shows deploy status. Slack/Discord webhooks are a future enhancement, not needed now. |
| **CI-built artifacts deployed to Vercel (`--prebuilt`)** | "What CI tested is what production runs." Build once in GitHub Actions, deploy the artifact to Vercel without rebuilding. Eliminates the class of bugs where Vercel's build environment differs from CI. | HIGH | New deploy workflow: `vercel pull` + `vercel build --prod` + `vercel deploy --prebuilt --prod`. Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets. | This is the gold standard but adds significant complexity: must disable Vercel's auto-deploy on git push, manage Vercel CLI in CI, handle env var pulling. Right-sized recommendation: defer this. Vercel's built-in git integration is reliable for a single app. The CI pipeline already validates the build passes. |
| **Rollback documentation / runbook** | When production breaks, you need a clear "how to roll back" procedure. Vercel's Instant Rollback feature + GitHub Release tags make this straightforward. | LOW | None -- this is documentation + Vercel Dashboard knowledge. | Document the rollback procedure: (1) Vercel Dashboard > Deployments > previous production deploy > Instant Rollback, or (2) `git revert` + push to main. No automation needed -- a documented runbook is the right level for a single-user app. |
| **Release-triggered staging refresh** | After a production release, automatically reset the staging Neon branch to match production data. Keeps staging fresh without manual intervention. | LOW | `neondatabase/reset-branch-action` triggered by Release Please's release event. | Trigger on `release: published` event. Resets the staging Neon branch to the current state of the main branch. Low effort, high hygiene value. |
| **Version display in app** | Show the current version in the app (settings page, footer, or meta tag). Helps verify which version is actually deployed to staging vs production. | LOW | Build-time injection from `package.json` version. | `process.env.npm_package_version` or read from `package.json` at build time. Display in Settings page. Trivial to implement, surprisingly useful for debugging "is my deploy live?" |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem appealing but add disproportionate complexity for a single-user single-app project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Release Please manifest mode (multi-package)** | Reference project (cipher-box) uses it for 15-package monorepo. | Manifest mode manages per-component versioning, separate changelogs, independent release cycles. This project is a single Next.js app -- manifest mode adds config overhead for zero benefit. | Use Release Please simple mode with `release-type: node`. One `package.json`, one `CHANGELOG.md`, one version. |
| **Date-based staging tags (`staging-YYYYMMDD-release-N`)** | Reference project uses them for staging cut identification. | Useful in monorepos where "which packages are in this staging cut?" is ambiguous. For a single app, the staging branch HEAD *is* the staging cut. Extra tagging adds process overhead with no information gain. | The staging branch tip is the staging state. Git log provides full history. GitHub Releases mark production cuts. |
| **Per-PR Neon database branches** | Neon docs heavily promote this pattern. Each PR gets its own DB branch for isolated testing. | This project's user data is entirely in IndexedDB (client-side). Neon is only used for push notification subscriptions -- a small, rarely-changing table. Per-PR DB branches add Actions complexity for a table that barely changes. | One persistent staging branch in Neon. E2E tests don't hit Neon (they use local IndexedDB via Playwright). |
| **Vercel `--prebuilt` deployment pipeline (replace git integration)** | "Build once, deploy the tested artifact." Eliminates build-environment divergence. | Requires disabling Vercel's auto-deploy on git push, managing `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets, pulling env vars in CI, handling the `.vercel/output` directory. For a single Next.js app where Vercel's build is deterministic (same Node version, same deps via lockfile), the risk of build-environment divergence is near-zero. | Keep Vercel's git integration. CI validates the build passes (`pnpm build` in CI). Vercel rebuilds from the same commit. If divergence ever appears, revisit then. |
| **Custom Vercel environments (Pro plan)** | Named `staging` environment with branch rules, attached domain, separate env var namespace. | Requires Vercel Pro ($20/month). The Hobby plan branch-domain approach achieves 95% of the same result for free: assign a domain to the staging branch, use branch-specific env var overrides. | Hobby plan: assign `staging.intake-tracker.ryanjnoble.dev` to the `staging` branch. Override `DATABASE_URL` for that branch. Functionally identical for a single-user app. |
| **Slack/Discord deployment notifications** | Real-time deployment status in chat. | Single-user app. You are the only person who needs to know. GitHub's existing notification system (email, mobile app) plus Vercel's dashboard already surface deployment status. Adding a webhook integration is overhead for an audience of one. | GitHub notification settings + Vercel Dashboard. If you want push notifications for deploys, Vercel's Slack integration is a 5-minute setup later -- but it's not infrastructure to build now. |
| **Canary/blue-green deployments** | Gradual rollout to catch issues before full traffic shift. | Enterprise pattern for apps with thousands of users. This is a single-user app. You *are* the canary. Vercel doesn't support canary natively on Hobby. | Deploy to production. If it breaks, Instant Rollback (one click in Vercel Dashboard). |
| **Automated E2E tests against staging deployment** | Run Playwright against the live staging URL to catch deployment-specific issues. | E2E tests require Privy test credentials, which are configured for `localhost:3000`. Reconfiguring for a live URL adds auth complexity (Privy origin restrictions). The existing CI E2E tests already validate the app works. Deployment-specific issues (env vars, routing) are rare and caught by manual smoke testing. | Run E2E in CI (already implemented). Manual smoke test on staging before promoting to production. If deployment-specific E2E is needed later, it's a separate phase. |
| **Multi-environment Neon DB setup (dev/staging/prod)** | Full environment parity with three separate databases. | Only push notification subscriptions use Neon. Dev doesn't need Neon at all (app works without it per CLAUDE.md). Three environments for one small table is overengineered. | Two Neon environments: production (main branch) + staging (Neon branch). Local dev skips Neon entirely. |

## Feature Dependencies

```
[Conventional Commits (commitlint + husky)]
    └──required by──> [Release Please]
                           ├──produces──> [CHANGELOG.md]
                           ├──produces──> [GitHub Releases + tags]
                           └──produces──> [Version in package.json]
                                              └──enables──> [Version display in app]

[Staging branch + domain config]
    ├──requires──> [Neon staging branch (for DATABASE_URL)]
    └──enhanced by──> [GitHub environment protection rules]

[Release Please release event]
    └──triggers──> [Staging Neon branch refresh]

[CI pipeline (existing)]
    └──gates──> [All deployments (via branch protection)]
```

### Dependency Notes

- **Release Please requires Conventional Commits:** Release Please parses commit messages to determine version bumps and generate changelog entries. Without commitlint enforcement, developers can write non-conventional messages that Release Please ignores, leading to silent version skips or empty changelogs.
- **Staging domain requires Neon branch:** The staging environment needs its own `DATABASE_URL` pointing to an isolated Neon branch. Without this, staging would share the production database for push subscriptions.
- **Version display requires Release Please:** The app version in the UI should match the released version. Release Please bumps `package.json` version on release, which the app reads at build time.
- **Staging refresh requires Release Please release event:** The `release: published` GitHub event (from Release Please) triggers a Neon branch reset, keeping staging data fresh after each production release.

## MVP Definition

### Launch With (v1.3 Core)

The minimum set of features that constitutes a functioning deployment lifecycle.

- [ ] **Conventional Commits enforcement** -- Foundation for all release automation; install commitlint + husky
- [ ] **Release Please pipeline** -- Replace `version-bump.yml` with `release-please-action`; produces changelogs, tags, GitHub Releases
- [ ] **Staging branch with stable domain** -- Create `staging` branch, assign `staging.intake-tracker.ryanjnoble.dev` in Vercel, configure branch-specific env vars
- [ ] **Neon staging branch** -- Create persistent staging branch in Neon, set `DATABASE_URL` override for staging in Vercel
- [ ] **CI gates deployments** -- Ensure branch protection rules require CI to pass before merging to `staging` or `main`

### Add After Validation (v1.3.x)

Features to layer on once the core pipeline is proven to work.

- [ ] **GitHub environment protection rules** -- Add `production` environment with required reviewer approval; add when comfortable that the staging-to-main flow is solid
- [ ] **Version display in app** -- Surface `package.json` version in Settings page; trivial but useful once versions are being properly tracked
- [ ] **Release-triggered staging refresh** -- Wire up Neon branch reset on release event; add once you've observed the staging branch drifting from production
- [ ] **Rollback runbook** -- Document the rollback procedure; write after the first real production deploy so the instructions are grounded in reality

### Future Consideration (v2+)

Features to defer until scale or pain demands them.

- [ ] **CI-built Vercel deployments (`--prebuilt`)** -- Defer until build-environment divergence is observed; adds significant complexity for theoretical benefit
- [ ] **Automated E2E on staging URL** -- Defer until Privy auth can be configured for staging origin; blocked by auth provider constraints
- [ ] **Slack/Discord notifications** -- Defer until there's a team to notify; single-user app doesn't need this

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Conventional Commits (commitlint + husky) | HIGH | LOW | P1 |
| Release Please pipeline | HIGH | MEDIUM | P1 |
| CHANGELOG.md generation | HIGH | LOW (free with Release Please) | P1 |
| GitHub Releases | HIGH | LOW (free with Release Please) | P1 |
| Staging branch + domain | HIGH | MEDIUM | P1 |
| Neon staging branch | MEDIUM | LOW | P1 |
| CI gates deployments | HIGH | LOW (mostly already exists) | P1 |
| GitHub environment protection | MEDIUM | LOW | P2 |
| Version display in app | LOW | LOW | P2 |
| Staging Neon refresh on release | LOW | LOW | P2 |
| Rollback runbook | MEDIUM | LOW | P2 |
| CI-built Vercel deploys | LOW | HIGH | P3 |
| E2E on staging | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.3 launch -- forms the deployment lifecycle backbone
- P2: Should have, add in v1.3.x follow-up phases
- P3: Nice to have, defer to future milestone

## Existing CI Pipeline Integration Points

The existing 12-job CI pipeline (`ci.yml`) already provides strong foundations. Here is how new deployment lifecycle features integrate:

| Existing CI Job | Integration Point |
|-----------------|-------------------|
| `ci-pass` (gate job) | Deploy workflows for staging/production depend on this job passing via branch protection |
| `build` | Validates the build succeeds in CI; Vercel rebuilds from same commit |
| `e2e` | Validates app works end-to-end before merge to staging or main |
| `data-integrity` | Ensures schema consistency before any deployment |
| `supply-chain` | Audit runs on every PR, preventing compromised deps from reaching staging/production |
| `version-bump.yml` | **Replaced** by Release Please. Delete after Release Please is configured. |

## Right-Sizing Assessment: cipher-box vs intake-tracker

| Aspect | cipher-box (reference) | intake-tracker (this project) | Right-sized approach |
|--------|----------------------|-------------------------------|---------------------|
| Repo structure | Monorepo, 15 packages | Single Next.js app | Simple mode Release Please, not manifest |
| Release granularity | Per-component releases | Single version | One `CHANGELOG.md`, one version, one tag |
| Staging identification | Date-based tags (`staging-YYYYMMDD-release-N`) | Branch tip | Staging branch = staging state; no extra tags |
| Database isolation | Multiple services, multiple DBs | One Neon table (push subscriptions) | One persistent Neon staging branch |
| Approval gates | Manual approval per component | Single approval before production | GitHub environment required reviewer |
| CI complexity | Multi-package builds, per-package tests | Single build, single test suite | Existing `ci-pass` gate is sufficient |

## Sources

- [Release Please GitHub repository](https://github.com/googleapis/release-please) -- configuration, release types, manifest vs simple mode
- [Release Please Action](https://github.com/googleapis/release-please-action) -- GitHub Action setup
- [Vercel Environments documentation](https://vercel.com/docs/deployments/environments) -- Preview, Production, Custom environments, plan limitations
- [Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment) -- Staged production, promotion, instant rollback
- [Vercel Staging Environment KB](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) -- Hobby plan branch-domain approach
- [Neon GitHub Actions branching guide](https://neon.com/docs/guides/branching-github-actions) -- create-branch, delete-branch, reset-branch actions
- [Neon pricing/plans](https://neon.com/docs/introduction/plans) -- Free tier: unlimited branches, 0.5 GB storage per branch
- [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) -- Protection rules, required reviewers (free for public repos)
- [trstringer/manual-approval](https://github.com/trstringer/manual-approval) -- Workaround for private repos (not needed here, repo is public)
- [Vercel + GitHub Actions deployment guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) -- `--prebuilt` workflow pattern
- [Release automation comparison](https://oleksiipopov.com/blog/npm-release-automation/) -- Release Please vs semantic-release vs Changesets

---
*Feature research for: Deployment Lifecycle (v1.3)*
*Researched: 2026-04-04*
