# Architecture Patterns: Deployment Lifecycle

**Domain:** Release automation, staging environments, database branching, CI/CD pipeline integration
**Project:** Intake Tracker v1.3
**Researched:** 2026-04-04

## Recommended Architecture

Three systems integrate with the existing 12-job CI pipeline to form a release-and-deploy pipeline:

```
Developer PR ──> CI (existing 12 jobs) ──> merge to main
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                              Release Please          Vercel auto-deploy
                              (on push to main)       (production)
                                    │
                              Creates/updates
                              release PR
                                    │
                              Merge release PR
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                    GitHub Release         Tag v1.x.y
                    + CHANGELOG.md         triggers Vercel
                                           production deploy

Developer PR ──> push to `staging` branch ──> Vercel preview deploy
                                               │
                                    staging.intake-tracker.ryanjnoble.dev
                                               │
                                    Neon staging branch (DATABASE_URL)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `release-please.yml` (NEW) | Automated versioning, changelogs, GitHub Releases | Replaces `version-bump.yml`; runs on push to main |
| `release-please-config.json` (NEW) | Release Please configuration | Read by `release-please.yml` |
| `.release-please-manifest.json` (NEW) | Tracks current version | Updated by Release Please PRs |
| Vercel staging environment | Branch-based deploy at `staging.intake-tracker.ryanjnoble.dev` | Triggered by push to `staging` branch |
| Neon staging branch | Isolated Postgres for staging push notifications | Used by staging Vercel deployment via `DATABASE_URL` |
| `staging-reset.yml` (NEW) | Resets Neon staging branch to match production | Manual trigger (`workflow_dispatch`) |
| `promote.yml` (NEW) | Promotes staging to production with approval gate | Manual trigger with GitHub environment protection |
| `ci.yml` (MODIFIED) | Existing CI adds staging branch trigger | Adds `staging` to PR branch triggers |
| `next.config.js` (MODIFIED) | Exposes staging-aware env vars | Reads `VERCEL_GIT_COMMIT_REF` for staging detection |
| `about-dialog.tsx` (MODIFIED) | Shows staging environment label | Reads new `NEXT_PUBLIC_IS_STAGING` env var |

### Data Flow

**Release flow (main branch):**
1. PR merges to `main` --> existing CI runs on PR, Vercel auto-deploys production
2. Release Please action runs on push to `main`, scans conventional commits since last release
3. If releasable commits found: creates/updates a release PR with CHANGELOG.md + version bump
4. When release PR merges: creates GitHub Release with tag `v1.x.y`, bumps `package.json`, generates CHANGELOG
5. Vercel picks up the merge and deploys production with the new version in `NEXT_PUBLIC_APP_VERSION`

**Staging flow:**
1. Developer pushes to `staging` branch (typically: `git merge main && git push origin staging`)
2. Vercel auto-deploys preview for `staging` branch at `staging.intake-tracker.ryanjnoble.dev`
3. Staging deployment uses staging-specific env vars including Neon staging branch `DATABASE_URL`
4. `VERCEL_ENV` = `preview`, but `VERCEL_GIT_COMMIT_REF` = `staging` (used to detect staging)
5. Manual promotion: verify staging, then either merge to main (new deploy) or use Vercel "Promote to Production"

**Neon staging branch:**
1. One-time setup: create persistent `staging` branch from production in Neon Console
2. Staging Vercel deployment uses staging branch connection string (set as branch-specific env var)
3. Reset when needed: `staging-reset.yml` runs `neondatabase/reset-branch-action` to sync from parent
4. Connection string is preserved after reset (branch identity unchanged, data refreshed)

## Patterns to Follow

### Pattern 1: Release Please with Manifest Config

**What:** Use manifest-based Release Please configuration rather than inline action config.
**Why:** Separates release config from workflow YAML, supports future monorepo expansion, tracks version in a dedicated manifest file.
**Confidence:** HIGH (official docs, widely adopted pattern)

**Configuration files:**

`release-please-config.json`:
```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  }
}
```

`.release-please-manifest.json`:
```json
{
  ".": "0.1.0"
}
```

**Workflow (`.github/workflows/release-please.yml`):**
```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
      version: ${{ steps.release.outputs.version }}
```

**Key details:**
- Action is at `googleapis/release-please-action@v4` (NOT `google-github-actions/` which is archived)
- `bump-minor-pre-major: true` means breaking changes only bump minor while version < 1.0.0 (appropriate for current `0.1.0`)
- Release Please auto-updates `package.json` version for `release-type: node`
- The manifest `.release-please-manifest.json` must be set to current version (`0.1.0`) on first setup
- `bootstrap-sha` can be set in config to prevent scanning entire git history on first run

### Pattern 2: Branch-Based Staging on Vercel (All Plans)

**What:** Assign a custom subdomain to a `staging` git branch in Vercel project settings.
**Why:** Works on Hobby plan (no Pro required), provides stable URL, auto-deploys on push to branch.
**Confidence:** HIGH (official Vercel KB article, well-documented approach)

**Setup steps:**
1. In Vercel Dashboard > Project > Settings > Domains
2. Add `staging.intake-tracker.ryanjnoble.dev`
3. Edit the domain assignment: set to Preview environment, Git Branch = `staging`
4. Add CNAME record for `staging.intake-tracker.ryanjnoble.dev` pointing to `cname.vercel-dns.com` (same as production)

**Environment variable configuration:**
- In Vercel Dashboard > Project > Settings > Environment Variables
- Add staging-specific overrides with "Preview" environment + branch filter `staging`:
  - `DATABASE_URL` = Neon staging branch connection string
  - `DATABASE_URL_UNPOOLED` = Neon staging branch unpooled connection string
  - `NEXT_PUBLIC_IS_STAGING` = `true` (custom flag for UI)

**Critical detail on `VERCEL_ENV`:**
- `VERCEL_ENV` = `preview` for all non-production deployments (including staging on Hobby plan)
- `VERCEL_TARGET_ENV` = custom environment name ONLY on Pro/Enterprise with custom environments
- On Hobby plan: use `VERCEL_GIT_COMMIT_REF` (= `staging`) or a custom env var to distinguish staging from other preview deploys
- Current `next.config.js` sets `NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || 'development'` -- this will show `preview` for staging. Add `NEXT_PUBLIC_IS_STAGING` check for proper labeling.

### Pattern 3: Persistent Neon Staging Branch

**What:** Create a long-lived Neon branch named `staging` as child of the production (main) branch.
**Why:** Preserves connection string across resets, isolates staging push notification data from production, enables testing push notification flows without affecting real dose schedules.
**Confidence:** HIGH (official Neon docs, designed for this use case)

**One-time setup:**
1. In Neon Console or via CLI: create branch `staging` from the primary/main branch
2. Note the connection string (it persists through resets)
3. Store in Vercel as staging-specific `DATABASE_URL` env var
4. Store `NEON_API_KEY` and `NEON_PROJECT_ID` in GitHub repository secrets/variables

**Reset workflow (`.github/workflows/staging-reset.yml`):**
```yaml
name: Reset Staging Database

on:
  workflow_dispatch:

jobs:
  reset:
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/reset-branch-action@v1
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: staging
          parent: true
          api_key: ${{ secrets.NEON_API_KEY }}
```

**Neon action versions (current as of April 2026):**
- `neondatabase/create-branch-action@v6` -- creates branches, returns `db_url`, `db_url_pooled`, `branch_id`, `password`
- `neondatabase/reset-branch-action@v1` (v1.3.2) -- resets branch to parent state, preserves connection string
- `neondatabase/delete-branch-action@v3` -- cleanup (not needed for persistent staging)

### Pattern 4: Conventional Commits for Release Please

**What:** Adopt conventional commit message format so Release Please can parse intent.
**Why:** Release Please determines version bumps from commit prefixes. Without conventional commits, no releases are created.
**Confidence:** HIGH (hard requirement of Release Please)

**Commit prefixes that matter:**
- `feat:` -- triggers minor version bump
- `fix:` -- triggers patch version bump
- `feat!:` or `fix!:` or `BREAKING CHANGE:` footer -- triggers major version bump (or minor while < 1.0.0)
- `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` -- appear in changelog but do NOT trigger release by default

**Migration from current style:**
The project currently uses prefixed messages like `chore: bump version`, `docs(phase-26): complete phase`, `feat/ui-fixes` branch names. The existing style partially aligns with conventional commits but needs consistency enforcement. No linting tool is required immediately (commitlint is optional and adds complexity) -- just team discipline.

### Pattern 5: GitHub Environment Protection Rules for Promotion

**What:** Use GitHub's environment protection rules to gate production promotions.
**Why:** Prevents accidental production deploys, creates audit trail, works with manual `workflow_dispatch`.
**Confidence:** HIGH (native GitHub feature, no third-party deps)

**Setup:**
1. In GitHub repo > Settings > Environments > Create `production` environment
2. Add required reviewers (the repo owner)
3. Create promotion workflow that references this environment

**Promotion workflow (`.github/workflows/promote.yml`):**
```yaml
name: Promote Staging to Production

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type "promote" to confirm'
        required: true

jobs:
  promote:
    runs-on: ubuntu-latest
    environment: production  # triggers approval gate
    if: github.event.inputs.confirm == 'promote'
    steps:
      - uses: actions/checkout@v4
        with:
          ref: staging
      - name: Merge staging into main
        run: |
          git fetch origin main
          git checkout main
          git merge origin/staging --no-edit
          git push origin main
```

**Note:** This is a lightweight approach. Vercel also supports staged production deployments (disable auto-assign domains, then manually promote), but that requires more Vercel Dashboard interaction and is less auditable than a GitHub-native workflow.

## Integration Points with Existing CI

### Existing `ci.yml` -- Modifications Required

The current CI triggers on `pull_request` to `main` only. Two changes needed:

**1. Add staging branch to CI triggers (OPTIONAL but recommended):**
```yaml
on:
  pull_request:
    branches: [main, staging]
```
This ensures PRs targeting staging also pass CI. However, if staging is always updated by merging main (which already passed CI), this may be unnecessary. Recommend adding it for safety -- someone might push directly to staging.

**2. No changes needed to the 12 existing jobs.** The `ci-pass` gate job, path filters, E2E tests, supply chain audit, etc. all work as-is. The CI pipeline is purely a quality gate on PRs and does not interact with release or deployment logic.

### Existing `version-bump.yml` -- DELETE

Release Please completely replaces `version-bump.yml`. The current workflow:
- Triggers on push to main
- Parses commit messages for `[major]`/`[minor]` markers
- Bumps `package.json` and pushes a commit

Release Please does all of this better:
- Uses conventional commit parsing (industry standard vs custom markers)
- Creates a release PR instead of auto-committing (reviewable)
- Generates CHANGELOG.md
- Creates GitHub Releases with tags
- Manifest tracks version separately from package.json

**Migration path:** Delete `version-bump.yml` and add `release-please.yml` in the same PR. Set `.release-please-manifest.json` to current version `"0.1.0"` and optionally set `bootstrap-sha` in config to the current HEAD of main.

### New Workflows Summary

| Workflow | Trigger | Purpose | GitHub Secrets/Vars Needed |
|----------|---------|---------|---------------------------|
| `release-please.yml` | `push: branches: [main]` | Create release PRs, GitHub Releases | `GITHUB_TOKEN` (built-in) |
| `staging-reset.yml` | `workflow_dispatch` | Reset Neon staging branch to production data | `NEON_API_KEY` (secret), `NEON_PROJECT_ID` (var) |
| `promote.yml` | `workflow_dispatch` | Merge staging to main with approval gate | `GITHUB_TOKEN` (built-in) |

### New GitHub Repository Configuration

| Setting | Location | Value |
|---------|----------|-------|
| `NEON_API_KEY` | Repo Secrets | Neon API key from Neon Console > Account Settings |
| `NEON_PROJECT_ID` | Repo Variables | Neon project ID from Neon Console > Project Settings |
| `production` environment | Repo Settings > Environments | Required reviewer: repo owner |

### New Vercel Project Configuration

| Setting | Location | Value |
|---------|----------|-------|
| Domain `staging.intake-tracker.ryanjnoble.dev` | Project > Settings > Domains | Assigned to Preview env, branch `staging` |
| DNS CNAME | DNS provider | `staging.intake-tracker.ryanjnoble.dev` -> `cname.vercel-dns.com` |
| `DATABASE_URL` (staging override) | Project > Settings > Env Vars | Preview + branch `staging`, Neon staging branch URL |
| `DATABASE_URL_UNPOOLED` (staging override) | Project > Settings > Env Vars | Preview + branch `staging`, Neon staging branch URL |
| `NEXT_PUBLIC_IS_STAGING` | Project > Settings > Env Vars | Preview + branch `staging`, value `true` |

### Code Changes Required

**`next.config.js`** -- Add staging detection:
```javascript
env: {
  NEXT_PUBLIC_APP_VERSION: packageJson.version,
  NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || 'development',
  // NEW: staging detection via branch name (Hobby plan compatible)
  NEXT_PUBLIC_IS_STAGING: process.env.VERCEL_GIT_COMMIT_REF === 'staging' ? 'true' : '',
},
```

**`about-dialog.tsx`** -- Add staging label:
```typescript
const isStaging = process.env.NEXT_PUBLIC_IS_STAGING === 'true';

function getEnvLabel(env: string): { label: string; className: string } {
  if (isStaging) {
    return { label: "Staging", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" };
  }
  switch (env) {
    case "production":
      return { label: "Production", className: "..." };
    // ...
  }
}
```

**`/api/version` route** -- Add staging flag:
```typescript
return NextResponse.json({
  version: process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0",
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || "local",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  isStaging: process.env.NEXT_PUBLIC_IS_STAGING === 'true',
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Ephemeral Per-PR Neon Branches
**What:** Creating a new Neon branch for every PR and deleting on close.
**Why bad:** This project has exactly one server-side database use (push notifications). Per-PR branches add workflow complexity for negligible benefit. The push notification tables contain schedule metadata, not user-facing content that varies per feature.
**Instead:** Single persistent `staging` branch, reset manually when needed.

### Anti-Pattern 2: Vercel CLI Deploys from GitHub Actions
**What:** Using `vercel deploy --prod` or `vercel deploy --target=staging` from CI.
**Why bad:** Duplicates Vercel's built-in Git integration, requires managing Vercel tokens in GitHub, creates two deployment paths (Git push vs CLI), harder to debug.
**Instead:** Let Vercel's Git integration handle deployments. Push to branch = deploy. The only CLI interaction needed is initial domain/env var setup.

### Anti-Pattern 3: Release Please with PAT Instead of GITHUB_TOKEN
**What:** Creating a Personal Access Token for Release Please to trigger other workflows.
**Why bad:** Security risk, token management overhead. Release Please PRs created with `GITHUB_TOKEN` intentionally don't trigger other workflows (prevents infinite loops).
**Instead:** Use `GITHUB_TOKEN`. If you later need the release to trigger another workflow (e.g., Capacitor build), use `on: release` trigger in that workflow, which fires on the GitHub Release event regardless of token type.

### Anti-Pattern 4: Custom `VERCEL_ENV` Overrides
**What:** Overriding `VERCEL_ENV` system variable via project env vars to make staging show as custom value.
**Why bad:** `VERCEL_ENV` is a system variable, overriding it can break Vercel's internal behavior and Next.js conditional logic that depends on it.
**Instead:** Use a custom `NEXT_PUBLIC_IS_STAGING` variable and detect via `VERCEL_GIT_COMMIT_REF`.

### Anti-Pattern 5: Automatic Staging Reset on Every Push
**What:** Resetting the Neon staging branch automatically whenever staging deploys.
**Why bad:** Destroys any test data in staging that you're actively verifying. The staging DB should be stable during testing, only reset deliberately.
**Instead:** Manual `workflow_dispatch` for staging reset. Developer decides when fresh data is needed.

## Suggested Build Order

Dependencies between features determine implementation order:

```
Phase 1: Release Please (no external deps)
   └──> Phase 2: Neon Staging Branch (independent, but needed before Phase 3)
          └──> Phase 3: Vercel Staging Environment (needs Neon branch URL for env vars)
                 └──> Phase 4: Promotion Workflow (needs staging to exist)
                        └──> Phase 5: Code Changes (staging detection, UI labels)
```

### Phase 1: Release Please (~1-2 plans)
- Create `release-please-config.json` and `.release-please-manifest.json`
- Create `.github/workflows/release-please.yml`
- Delete `.github/workflows/version-bump.yml`
- Set `bootstrap-sha` to current HEAD of main
- First release PR will appear after next conventional commit to main
- **No CI changes needed.** Release Please runs independently of CI.

### Phase 2: Neon Staging Branch (~1 plan)
- Create `staging` branch in Neon Console from primary branch
- Note connection strings (pooled and unpooled)
- Add `NEON_API_KEY` to GitHub repo secrets
- Add `NEON_PROJECT_ID` to GitHub repo variables
- Create `.github/workflows/staging-reset.yml`
- **No CI changes needed.** This is infrastructure setup.

### Phase 3: Vercel Staging Environment (~1 plan)
- Create `staging` git branch from `main`
- Add `staging.intake-tracker.ryanjnoble.dev` domain in Vercel, assign to `staging` branch
- Add DNS CNAME record
- Add staging-specific env vars in Vercel (DATABASE_URL overrides, NEXT_PUBLIC_IS_STAGING)
- Push to `staging` branch to trigger first staging deploy
- Verify staging deploys and uses staging Neon branch
- **Optional CI change:** Add `staging` to `ci.yml` PR branch targets

### Phase 4: Promotion Workflow (~1 plan)
- Create `production` GitHub environment with approval gate
- Create `.github/workflows/promote.yml`
- Test promotion flow: staging -> approve -> merge to main -> production deploy

### Phase 5: Code Changes (~1 plan)
- Update `next.config.js` with staging detection
- Update `about-dialog.tsx` with staging environment label
- Update `/api/version` route with staging flag
- Update any other environment-aware UI components
- Add/update tests for environment detection logic

### Phase ordering rationale:
1. **Release Please first** because it is fully independent, replaces the broken `version-bump.yml`, and every subsequent merge to main will generate proper releases
2. **Neon before Vercel** because the staging Vercel environment needs the Neon staging connection string as an env var
3. **Vercel staging before promotion** because there is nothing to promote until staging exists
4. **Code changes last** because they are purely cosmetic (staging label) and the staging environment functions correctly without them

## Scalability Considerations

| Concern | Current (1 user) | Future (multi-env) | Future (multi-platform) |
|---------|-------------------|---------------------|------------------------|
| Release automation | Release Please, single package | Release Please manifest supports monorepo packages | Release Please can trigger platform-specific builds via `on: release` |
| Staging environments | Single `staging` branch + Neon branch | Could add `qa` environment on Pro plan | Each platform build could have its own staging |
| Database branches | 1 production + 1 staging | Neon supports many branches, per-PR if needed | Same pattern, more branches |
| CI pipeline | 12 jobs, PR-only | Add staging branch targets | Add platform-specific build jobs |
| Promotion gates | Manual workflow_dispatch | Could add automated smoke tests pre-promotion | Same pattern, more approval steps |

## Sources

### Release Please
- [googleapis/release-please-action (GitHub)](https://github.com/googleapis/release-please-action) -- HIGH confidence (official repo)
- [Release Please manifest docs](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) -- HIGH confidence (official docs)
- [Release Please customization docs](https://github.com/googleapis/release-please/blob/main/docs/customizing.md) -- HIGH confidence (official docs)

### Vercel Staging
- [Vercel Environments docs](https://vercel.com/docs/deployments/environments) -- HIGH confidence (official docs)
- [Vercel staging environment KB](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) -- HIGH confidence (official KB)
- [Vercel assign domain to git branch](https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch) -- HIGH confidence (official docs)
- [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) -- HIGH confidence (official docs, critical for VERCEL_ENV vs VERCEL_TARGET_ENV distinction)
- [Vercel promoting deployments](https://vercel.com/docs/deployments/promoting-a-deployment) -- HIGH confidence (official docs)

### Neon Database Branching
- [Neon GitHub Actions branching guide](https://neon.com/docs/guides/branching-github-actions) -- HIGH confidence (official docs)
- [neondatabase/create-branch-action (GitHub)](https://github.com/neondatabase/create-branch-action) -- HIGH confidence (official action, v6)
- [neondatabase/reset-branch-action (GitHub)](https://github.com/neondatabase/reset-branch-action) -- HIGH confidence (official action, v1.3.2)
- [Neon branching with preview environments](https://neon.com/blog/branching-with-preview-environments) -- MEDIUM confidence (blog post, but official)
- [Neon practical guide to database branching](https://neon.com/blog/practical-guide-to-database-branching) -- MEDIUM confidence (blog post, but official)

### GitHub Actions
- [GitHub environments for deployment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment) -- HIGH confidence (official docs)
- [GitHub reviewing deployments (approval gates)](https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments) -- HIGH confidence (official docs)
