# Stack Research: v1.3 Deployment Lifecycle

**Domain:** Release automation, staging environments, CI/CD extensibility for health tracking PWA
**Researched:** 2026-04-04
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Release Please Action | v4.4.0 (`googleapis/release-please-action@v4`) | Automated releases with changelogs, semver, GitHub Releases | PR-based workflow gives human review of version bumps before they land. Maintains a living release PR that accumulates conventional commits. Directly replaces the current `version-bump.yml`. Google-maintained, 17+ language strategies. Better fit than semantic-release for a web app (not publishing to npm). |
| Vercel branch-to-domain mapping | N/A (platform feature) | Stable staging URL at `staging.intake-tracker.ryanjnoble.dev` | Works on all Vercel plans including Hobby. Assign a custom subdomain to a `staging` git branch in project Settings > Domains. Every push to that branch auto-deploys to the stable URL. No Vercel CLI or custom environments needed. |
| Neon Create Branch Action | v6.3.1 (`neondatabase/create-branch-action@v6`) | Create isolated Neon DB branch for staging | Copy-on-write branching means zero-cost clones of production data. The staging branch gets its own connection string, isolated from production push_subscriptions. |
| Neon Delete Branch Action | v3.2.1 (`neondatabase/delete-branch-action@v3`) | Clean up ephemeral DB branches (PR previews, future use) | Prevents branch accumulation. Not needed for the persistent staging branch, but essential infrastructure for future PR-preview DB branches. |
| Neon Reset Branch Action | v1.3.2 (`neondatabase/reset-branch-action@v1`) | Reset staging DB branch to match production parent | Keeps staging data fresh. One-command reset via `parent: true` input. Useful before promoting staging to production. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vercel CLI | >=39.x (latest) | `vercel promote` for CLI-based promotion, `vercel env pull` for local dev | Only needed in CI if implementing CLI-based promotion flow. Not a project dependency -- install globally in workflow runners via `pnpm i -g vercel@latest`. Current latest is 50.39.0 but pin to `@latest` since Vercel CLI is backwards-compatible. |
| neonctl | latest | Local branch management, schema inspection, manual resets | Developer convenience tool only. Not a project dependency. Install via `npm i -g neonctl` when needed locally. |

### GitHub Actions (New Workflows)

| Action | Reference | Purpose | Notes |
|--------|-----------|---------|-------|
| `googleapis/release-please-action` | `@v4` | Release PR creation + GitHub Release publishing | Replaces `version-bump.yml`. Runs on push to `main`. |
| `neondatabase/create-branch-action` | `@v6` | One-time staging branch setup (or in workflow) | Required inputs: `project_id`, `api_key`, `branch_name`, `parent_branch` |
| `neondatabase/delete-branch-action` | `@v3` | Branch cleanup | Required inputs: `project_id`, `api_key`, `branch` |
| `neondatabase/reset-branch-action` | `@v1` | Reset staging to production data | Required inputs: `project_id`, `api_key`, `branch`, `parent: true` |
| `actions/checkout` | `@v4` | Already in use | No change |
| `pnpm/action-setup` | `@v5` | Already in use | No change |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Conventional Commits | Commit message format for Release Please | `feat:` = minor, `fix:` = patch, `feat!:` / `BREAKING CHANGE:` = major. Already partially in use (commit messages show `chore:`, `docs:`, `fix:` patterns). |
| `release-please-config.json` | Release Please configuration | Lives in repo root. Defines release-type, changelog sections, package path. |
| `.release-please-manifest.json` | Version tracking for Release Please | Lives in repo root. Tracks current version per package. Must exist (can be empty `{}` initially). |

## Configuration Files

### release-please-config.json

```json
{
  "release-type": "node",
  "packages": {
    ".": {
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  },
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json"
}
```

**Key decisions:**
- `release-type: "node"` -- automatically reads/writes `package.json` version
- `bump-minor-pre-major: true` -- while version is < 1.0.0, `feat:` commits bump patch instead of minor (current version is 0.1.0)
- `bump-patch-for-minor-pre-major: true` -- keeps pre-1.0 versioning predictable
- Single package (not monorepo) so `.` path is sufficient

### .release-please-manifest.json

```json
{
  ".": "0.1.0"
}
```

**Note:** Must match current `package.json` version. Release Please will update this file on each release.

### New GitHub Secrets Required

| Secret | Purpose | Where to Get |
|--------|---------|-------------|
| `NEON_API_KEY` | Authenticate Neon GitHub Actions | Neon Console > Account Settings > API Keys |
| `VERCEL_TOKEN` | Vercel CLI auth in CI (if using CLI promotion) | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | Vercel project identification | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | Vercel project identification | `.vercel/project.json` after `vercel link` |

### New GitHub Variables Required

| Variable | Purpose | Where to Get |
|----------|---------|-------------|
| `NEON_PROJECT_ID` | Neon project identifier for branch actions | Neon Console > Project Settings |

### Vercel Environment Variables (Staging)

The staging branch deployment needs its own `DATABASE_URL` pointing to the Neon staging branch. Configure in Vercel Dashboard under the staging domain's environment variables (or branch-specific env vars).

## Installation

```bash
# No new project dependencies needed.
# All tools are GitHub Actions or platform features.

# Local developer convenience (optional):
npm i -g neonctl        # Neon CLI for local branch management
npm i -g vercel@latest  # Vercel CLI for local promotion testing
```

```bash
# Configuration files to create in repo root:
# 1. release-please-config.json   (see above)
# 2. .release-please-manifest.json (see above)
```

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Release Please (`googleapis/release-please-action@v4`) | semantic-release | semantic-release is fully automated with no human review step. Release Please creates a PR that accumulates changes, giving a review gate before version bump. Better for a single-dev app where you want to batch releases. semantic-release also requires npm publishing config even when you don't publish to npm. |
| Release Please | Changesets (`@changesets/cli`) | Changesets is designed for monorepo library publishing. Overkill for a single-package web app that doesn't publish to npm. Requires manual changeset files per PR. |
| Release Please | Keep existing `version-bump.yml` | Current workflow is fragile: keyword-based (`[major]`/`[minor]` in commit message), no changelog, no GitHub Releases, no PR review step. Release Please is strictly better. |
| Vercel branch-to-domain (Hobby) | Vercel Custom Environments (Pro, $20/mo) | Custom Environments require Pro plan at $20/seat/month. Branch-to-domain mapping achieves the same stable staging URL on Hobby plan. Upgrade to Pro only if you need separate env var scoping per environment (branch-specific env vars work on Hobby too). |
| Vercel branch-to-domain | Vercel CLI `--target=staging` | CLI deployment is an alternative but adds complexity. The Git-integrated auto-deploy on branch push is simpler and already works. CLI approach is better for promotion flow (see below). |
| Neon branch via GitHub Action | Manual Neon branch via dashboard | GitHub Action is automatable and reproducible. Dashboard is fine for one-time setup but doesn't integrate into CI. Use Action for the workflow, dashboard for initial setup. |
| Neon branching | Separate Neon project for staging | Separate project wastes the free tier limit. Branching is copy-on-write (free, instant) and shares compute with the parent project. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Docker / container builds | App runs on Vercel (serverless). Docker adds build complexity with zero benefit. No self-hosted infra. | Vercel's built-in Next.js builder |
| Terraform / Pulumi for infra | Single Vercel project + single Neon project. Infrastructure-as-code is overkill for this scale. | Manual Vercel/Neon dashboard setup + GitHub Actions for branch automation |
| `vercel-action` (`amondnet/vercel-action`) | Third-party wrapper around Vercel CLI. Adds an unnecessary dependency. Use Vercel CLI directly in workflows if CLI deployment is needed. | Direct `vercel` CLI commands in workflow steps |
| GitHub Environments for approval gates | GitHub Environments with required reviewers could gate production deploys, but for a single-user app this adds friction without value. | Simple promotion via Vercel dashboard or CLI `vercel promote` |
| Neon GitHub Integration (app) | Full GitHub App integration auto-creates branches per PR. Overkill for this project which only needs a single persistent staging branch. Consider later if PR-preview DBs become valuable. | Individual Neon GitHub Actions for targeted branch operations |
| Separate CI workflow for staging deploy | Vercel auto-deploys on branch push via Git integration. A separate deploy workflow would duplicate what Vercel already does. | Vercel's built-in Git integration (push to `staging` branch = auto-deploy) |

## Integration with Existing CI Pipeline

### What Changes

| Current | After v1.3 |
|---------|-----------|
| `version-bump.yml` runs on push to `main`, bumps package.json | **Deleted.** Release Please handles versioning via release PRs. |
| `ci.yml` runs on PR to `main` (12 jobs) | **No changes.** CI pipeline remains identical. Release Please runs separately on push to `main`. |
| No staging environment | `staging` branch with domain `staging.intake-tracker.ryanjnoble.dev` and isolated Neon DB branch |
| No GitHub Releases | Release Please creates tagged GitHub Releases with auto-generated changelogs |

### New Workflow Files

1. **`release-please.yml`** -- Replaces `version-bump.yml`. Triggers on push to `main`. Creates/updates release PR. On release PR merge, creates GitHub Release + tag.

2. **`staging-db-reset.yml`** (optional) -- Manual dispatch workflow to reset staging Neon branch to production parent. Useful before promotion testing.

### What Does NOT Change

- `ci.yml` -- The 12-job pipeline is untouched. It runs on PRs to `main` exactly as before.
- Vercel Git integration -- Production deploys still trigger on merge to `main`. No custom deploy workflow needed.
- Environment variables in existing `.env.template` -- No changes to existing vars.
- `package.json` scripts -- No new scripts needed.

## Promotion Flow (Staging to Production)

Two viable approaches, recommend **Option A** for simplicity:

**Option A: Git merge flow (recommended)**
1. Develop on feature branches, PR to `main`
2. CI runs on PR. On merge to `main`, Vercel auto-deploys to production.
3. Release Please opens/updates a release PR tracking changes.
4. Separately, cherry-pick or merge to `staging` branch for pre-production testing.
5. Staging auto-deploys to `staging.intake-tracker.ryanjnoble.dev` with isolated Neon DB.

**Option B: Vercel promotion flow (future consideration)**
1. Disable auto-domain-assignment for production in Vercel settings.
2. Merges to `main` create "staged" production deployments (built but not serving traffic).
3. Manually promote via `vercel promote <deployment-url>` or Vercel dashboard.
4. Requires Vercel CLI + token in CI for automation.

Option A is simpler and sufficient. Option B adds value if production incidents become frequent enough to warrant a staging gate.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Release Please Action v4 | Node.js 18+ | Action runs on ubuntu-latest (Node 22 in CI) |
| Release Please Action v4 | `release-type: node` | Reads/writes `package.json` version field directly |
| Neon Actions (v6/v3/v1) | `@neondatabase/serverless` ^1.0.2 | Actions create branches; app connects via same driver package already installed |
| Neon branch | Existing `push-db.ts` schema | Branch inherits schema from parent. No migrations needed for copy-on-write clone. |
| Vercel branch domains | Hobby plan | Branch-to-domain assignment works on all plans. No upgrade needed. |
| Conventional Commits | Existing commit style | Project already uses `chore:`, `docs:`, `fix:` prefixes. Add `feat:` for features. |

## Sources

- [googleapis/release-please-action](https://github.com/googleapis/release-please-action) -- v4.4.0 (Oct 2025), action inputs/outputs, configuration (HIGH confidence)
- [googleapis/release-please manifest docs](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) -- Config file format, node release-type behavior (HIGH confidence)
- [neondatabase/create-branch-action](https://github.com/neondatabase/create-branch-action) -- v6.3.1 (Mar 2026), inputs/outputs verified (HIGH confidence)
- [neondatabase/delete-branch-action](https://github.com/neondatabase/delete-branch-action) -- v3.2.1 (Mar 2026), inputs verified (HIGH confidence)
- [neondatabase/reset-branch-action](https://github.com/neondatabase/reset-branch-action) -- v1.3.2 (Mar 2026), inputs verified (HIGH confidence)
- [Neon branching with GitHub Actions](https://neon.com/docs/guides/branching-github-actions) -- Official guide for CI/CD integration (HIGH confidence)
- [Vercel Environments docs](https://vercel.com/docs/deployments/environments) -- Custom environments require Pro; Preview branch domains work on all plans (HIGH confidence)
- [Vercel branch-to-domain assignment](https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch) -- Confirmed available on Hobby plan (HIGH confidence)
- [Vercel promoting deployments](https://vercel.com/docs/deployments/promoting-a-deployment) -- `vercel promote` CLI command, staged production flow (HIGH confidence)
- [Vercel staging setup guide](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) -- Branch-specific env vars, domain configuration (HIGH confidence)
- [Vercel CLI](https://vercel.com/docs/cli) -- v50.39.0 latest (MEDIUM confidence, version changes frequently)
- [Release Please vs semantic-release comparison](https://www.hamzak.xyz/blog-posts/release-please-vs-semantic-release) -- PR-based vs fully automated tradeoffs (MEDIUM confidence, blog post)
- [NPM release automation comparison](https://oleksiipopov.com/blog/npm-release-automation/) -- Release Please vs semantic-release vs Changesets (MEDIUM confidence, blog post)

---
*Stack research for: v1.3 Deployment Lifecycle*
*Researched: 2026-04-04*
