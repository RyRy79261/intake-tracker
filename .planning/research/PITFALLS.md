# Pitfalls Research

**Domain:** Deployment lifecycle for existing Next.js 14 PWA (release automation, staging, CI/CD)
**Researched:** 2026-04-04
**Confidence:** HIGH (verified against official docs, existing codebase, and real-world migration reports)

## Critical Pitfalls

### Pitfall 1: Release Please v4 `releases_created` vs `release_created` Output Trap

**What goes wrong:**
Release Please v4 has an output called `releases_created` (plural) that returns `true` regardless of whether a release was actually created. If you use this in a conditional step to trigger deployments, every merge to main triggers a production deployment -- even when no release PR was merged.

**Why it happens:**
The v4 action changed the semantics of this output from v3. The plural `releases_created` is a string representation of an array and JavaScript/YAML truthiness evaluates any non-empty string as true. The correct output for single-package repos is `release_created` (singular).

**How to avoid:**
Use `release_created` (singular) for non-monorepo projects. In the workflow:
```yaml
if: ${{ steps.release.outputs.release_created }}
```
Never use `releases_created` in conditionals. This is especially dangerous because the version-bump.yml replacement workflow will likely include a post-release step (tag push, Vercel production promote, etc.).

**Warning signs:**
- Production deployments happening on every merge to main, not just release PR merges
- GitHub releases created with empty changelogs
- Version not actually bumping between deployments

**Phase to address:**
Phase 1 (Release Please setup) -- must be correct from first implementation. Add a smoke test: merge a non-release commit and verify no deployment triggers.

**Confidence:** HIGH -- documented in [Release Please Action repo](https://github.com/googleapis/release-please-action), confirmed by [real-world report](https://danwakeem.medium.com/beware-the-release-please-v4-github-action-ee71ff9de151).

---

### Pitfall 2: Package.json Version vs Git Tag Mismatch on Bootstrap

**What goes wrong:**
The current `package.json` shows version `"0.1.0"` but the repo has git tags `v1.0` and `v1.1`. Release Please uses `.release-please-manifest.json` as its source of truth for the current version. If the manifest is initialized with the wrong version -- either `0.1.0` from package.json or failing to account for `v1.1` -- Release Please will either try to create a release for a version that already exists, or skip the changelog for commits between `v1.1` and now.

**Why it happens:**
The existing `version-bump.yml` runs `npm version` (updating package.json) on every push to main, but the version never actually advanced past `0.1.0` because the workflow has a guard that skips bot-authored commits -- and most merges to main come from PRs where the version bump was the last commit. The tags `v1.0` and `v1.1` were created manually for milestones, not by the version-bump workflow. Release Please expects a clean version history where the manifest version matches the latest release.

**How to avoid:**
1. Before enabling Release Please, update `package.json` version to match the last meaningful release tag (should be `1.2.0` since v1.2 CI & Data Integrity milestone is complete).
2. Create `.release-please-manifest.json` with `{ ".": "1.2.0" }`.
3. Create `release-please-config.json` with `release-type: node` and set `bootstrap-sha` to the commit that completed v1.2 (commit `a3a0b2d`).
4. Create the `v1.2.0` git tag on commit `a3a0b2d` if one does not already exist.
5. Delete `version-bump.yml` BEFORE enabling Release Please -- do not run them in parallel.

**Warning signs:**
- Release Please PR proposing version `0.2.0` or `1.0.0` instead of `1.3.0`
- Changelog containing every commit since the beginning of the repo
- Duplicate GitHub releases for the same version

**Phase to address:**
Phase 1 (Release Please setup) -- the very first step should be version alignment before Release Please is activated.

**Confidence:** HIGH -- verified by inspecting existing repo state (tags: `v1.0`, `v1.1`; `package.json` version: `0.1.0`; last milestone commit: `a3a0b2d`).

---

### Pitfall 3: Service Worker Caching Stale Content on Staging

**What goes wrong:**
next-pwa generates a service worker that precaches the entire Next.js build output using workbox. The service worker uses a stale-while-revalidate or cache-first strategy for static assets. On a persistent staging environment (`staging.intake-tracker.ryanjnoble.dev`), the service worker from a previous deployment continues to serve cached assets even after a new staging deployment. The user (you, testing on your phone) sees stale UI/behavior and thinks the deployment is broken.

**Why it happens:**
Service workers are scoped to the origin (domain). The staging subdomain is a persistent origin, so the service worker installs once and persists. next-pwa's `skipWaiting: true` config helps but only when the NEW service worker is fetched -- if the browser is serving the old HTML from cache, it never fetches the new SW. The existing `worker/index.js` listens for `SKIP_WAITING` messages, but this requires the app code to send that message, which itself might be cached.

The current `next.config.js` conditionally loads next-pwa based on `process.env.NODE_ENV === 'production'`. But Vercel ALWAYS builds in production mode, even for preview and staging deployments. So the service worker is generated for every Vercel deployment, including staging.

**How to avoid:**
Disable the service worker on staging by adding a `VERCEL_ENV` check at build time:
```js
const withPWA = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
  ? require('next-pwa')({ dest: 'public', register: true, skipWaiting: true, customWorkerDir: 'worker' })
  : (config) => config;
```
This ensures the service worker only generates for the production domain. Staging gets a standard SPA experience without caching complications.

**Warning signs:**
- Staging shows old version number in About dialog after deployment
- UI changes not appearing on staging despite Vercel dashboard showing successful deployment
- "Works in incognito but not regular browser" reports

**Phase to address:**
Phase 2 (Staging environment setup) -- configure before the first staging deployment. Retrofitting after the SW is already installed requires manual cache clearing on every test device.

**Confidence:** HIGH -- the codebase already conditionally loads next-pwa (`process.env.NODE_ENV === 'production'`), but this fires for both Vercel production and preview/staging since Vercel always builds in production mode. Verified in `next.config.js` line 3.

---

### Pitfall 4: Vercel Preview Deployments Are Not Staging

**What goes wrong:**
Developers conflate Vercel's automatic preview deployments (one per PR, ephemeral URL like `intake-tracker-abc123.vercel.app`) with a stable staging environment. They set up environment variables on "Preview" scope thinking it creates a staging environment, but every PR deployment shares those variables. Preview env vars bleed across branches. There is no persistent URL to bookmark or test against.

**Why it happens:**
Vercel's environment scoping has three built-in targets: Production, Preview, and Development. "Preview" applies to ALL non-production deployments unless you use branch-specific overrides or custom environments (Pro plan). The Hobby plan does not have custom environments, but does support branch-based domain assignment.

**How to avoid:**
1. Determine Vercel plan -- custom environments require Pro ($20/month). On Hobby, use branch-based domain assignment as a workaround.
2. For the staging URL (`staging.intake-tracker.ryanjnoble.dev`):
   - Add the domain in Vercel project settings
   - Assign it to the `staging` git branch (not the default branch)
   - Set branch-specific preview environment variables that override defaults for that branch
3. Keep preview deployments separate -- they are for PR review, not for staging validation.
4. Environment variables scoped to Preview branch `staging` will override general Preview variables. You only need to set the variables that DIFFER from production (e.g., `DATABASE_URL` for Neon staging branch, `NEXT_PUBLIC_ENVIRONMENT=staging`).

**Warning signs:**
- `DATABASE_URL` on staging pointing to production Neon
- Privy auth failing on preview URLs because allowed origins only list production + staging domains
- E2E tests passing against preview but failing on staging due to different env vars

**Phase to address:**
Phase 2 (Staging environment setup) -- design the environment strategy before creating any configuration.

**Confidence:** HIGH -- verified against [Vercel environments docs](https://vercel.com/docs/deployments/environments) and [staging setup guide](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel).

---

### Pitfall 5: Neon Staging Branch Schema Drift After Migration Changes

**What goes wrong:**
A Neon branch is created from the production database for staging. New code is deployed to staging that expects a schema change (e.g., a new column on `push_settings`). But the branch was created before the migration ran, so it still has the old schema. The staging deployment crashes with a SQL error. Alternatively, a migration runs on the staging branch but never makes it to production, creating forward drift.

**Why it happens:**
Neon branches use copy-on-write -- they snapshot the parent at creation time. Schema changes on one branch do not propagate to other branches. Unlike Dexie.js (which handles migrations in client code), the Neon tables use raw SQL migrations (`scripts/push-migration.sql`). There is no automated migration runner for the Neon tables in this project -- the migration script is run manually via `psql`.

**How to avoid:**
1. Use Neon's "Reset branch" action to periodically sync the staging branch back to production state. Automate this with `neondatabase/reset-branch-action` in a scheduled workflow or as part of the staging deployment pipeline.
2. For the 4 push notification tables, create a proper migration strategy:
   - Track applied migrations (even a simple version table)
   - Run migrations as part of deployment, not manually
   - Or: since the schema is simple (4 tables, all use `CREATE TABLE IF NOT EXISTS`), re-run the migration script on every staging reset -- it is idempotent for table creation but NOT for column additions
3. Never apply schema changes to the staging branch that have not been committed to the repo. Schema changes go through PR, land in the migration script, then get applied after reset.

**Warning signs:**
- API routes returning 500 errors on staging but working in production
- `push_subscriptions` table missing columns that exist in the migration script
- Staging working fine after reset but breaking again after a week

**Phase to address:**
Phase 2 or 3 (Neon branching setup) -- establish the reset cadence and migration strategy before relying on staging for testing.

**Confidence:** HIGH -- verified against [Neon branching docs](https://neon.com/docs/introduction/branching) and [staging sync guide](https://neon.com/blog/how-to-keep-staging-in-sync-with-production-in-postgres).

---

### Pitfall 6: Privy Auth Failing on Staging Due to Origin Mismatch

**What goes wrong:**
Privy enforces allowed origins for authentication. The staging subdomain (`staging.intake-tracker.ryanjnoble.dev`) is not listed in Privy's allowed origins, causing auth to fail silently or with cryptic CORS errors. Users see a blank screen or the Privy modal refuses to load. The E2E tests, which use the Privy test account, also fail on staging.

**Why it happens:**
Privy validates the requesting origin against the app's configured allowed origins list. Production (`intake-tracker.ryanjnoble.dev`) is configured, but the staging subdomain is a different origin. The code in `providers.tsx` passes `appId` directly to `PrivyProvider`, meaning the same Privy app is used everywhere -- but Privy's dashboard controls which origins can use that app.

**How to avoid:**
For this single-user app, use the single Privy App approach:
1. Add `staging.intake-tracker.ryanjnoble.dev` to the allowed origins list in the Privy Dashboard (Configuration > App settings).
2. Optionally create a staging-specific App Client with its own `clientId` if cookie behavior needs to differ. Set `NEXT_PUBLIC_PRIVY_CLIENT_ID` per-environment in Vercel.
3. The E2E test credentials (`PRIVY_TEST_EMAIL`, `PRIVY_TEST_OTP`) work against the same Privy app regardless of origin, so they need no changes.

Do NOT create a separate Privy app for staging -- that doubles configuration overhead and requires maintaining two sets of test accounts for a single-user app.

**Warning signs:**
- Privy login modal not appearing on staging
- CORS errors in browser console mentioning `auth.privy.io`
- E2E tests timing out on staging waiting for Privy iframe
- Login works in incognito (no cached cookies from production) but fails in regular browser

**Phase to address:**
Phase 2 (Staging environment setup) -- configure Privy origins before deploying to the staging subdomain.

**Confidence:** HIGH -- verified against [Privy settings docs](https://docs.privy.io/guide/dashboard/settings) and [app clients docs](https://docs.privy.io/guide/react/configuration/app-clients).

---

### Pitfall 7: CI Gate Job Failing After Adding New Workflow Jobs

**What goes wrong:**
The existing `ci-pass` gate job in `ci.yml` explicitly lists all 11 dependent jobs in its `needs` array and checks each result by name. Adding a new job to `ci.yml` without updating `ci-pass` means the gate does not wait for or validate the new job. Conversely, adding a reference to a job that runs in a different workflow file causes a workflow syntax error because cross-workflow job dependencies are not supported in GitHub Actions.

**Why it happens:**
The `ci-pass` job is a branch protection mechanism -- GitHub branch protection rules require `ci-pass` to succeed before merging. The job uses a hand-maintained list of job names in both the `needs` array AND the result-checking bash script. Both must be updated in sync when jobs change.

**How to avoid:**
1. Release Please and staging deployment workflows should be SEPARATE workflow files (e.g., `release.yml`, `deploy-staging.yml`), not additional jobs in `ci.yml`. CI validates code quality; deployment is a separate concern triggered by different events (push to main vs PR).
2. If any new quality gate jobs ARE added to `ci.yml` (e.g., schema diff check), update BOTH the `ci-pass.needs` array AND the result-checking script, including deciding whether the new job is "unconditional" (must succeed) or "gated" (success or skipped).
3. Document the pattern: CI jobs go in `ci.yml` with gate wiring; deployment jobs go in separate workflows triggered by different events (`push` to `main`, `workflow_dispatch`).

**Warning signs:**
- PRs merging without new quality checks running
- `ci-pass` succeeding but a required job actually failed (it was not in the needs list)
- Workflow file validation errors after adding jobs

**Phase to address:**
Phase 1 (Release Please setup) -- establish the workflow file boundaries before adding any new workflows.

**Confidence:** HIGH -- verified by reading the existing `ci.yml` gate implementation (line 243-287).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Running version-bump.yml alongside Release Please "just temporarily" | Avoids immediate workflow change | Double version bumps, Release Please confused by bot commits, manifest drift, possible infinite commit loop | Never -- delete version-bump.yml before first Release Please merge |
| Using production Neon database for staging | No branch setup needed | Staging push notification tests corrupt production data via `push_sent_log`, risk of sending real notifications from staging cron | Never -- the 4 push notification tables are small but contain real device endpoints |
| Hardcoding staging DATABASE_URL in repo/workflow files | Quick to set up | Connection string rotated by Neon = broken staging, credentials in git history | Never -- use Vercel environment variables or GitHub secrets |
| Skipping conventional commit linting | No new tooling to add | Release Please generates empty changelogs or wrong version bumps because non-conforming commits are invisible to it | Acceptable for v1.3 MVP if commit discipline is manual; the existing codebase already uses conventional commits on the feature branch. Add commitlint enforcement in a later milestone. |
| Using `ALLOW_DEV_FALLBACK=true` on staging to bypass Privy | Auth works immediately without configuring Privy origins | Security bypass in a production-like environment; does not test real auth flow; masks auth bugs that will appear in production | Never for staging -- staging must mirror production auth behavior |
| Manually promoting staging to production via Vercel dashboard | Works without any automation | Human error risk (wrong deployment promoted), no audit trail, no CI gate before promotion | Acceptable initially; automate in later phase |

## Integration Gotchas

Common mistakes when connecting services in this deployment lifecycle.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Release Please + version-bump.yml | Running both simultaneously. The `[skip version]` guard would prevent infinite loops, but the ambiguity is itself the problem -- two systems managing version state creates confusion about which is authoritative. | Clean cut: delete `version-bump.yml` BEFORE enabling Release Please. Release Please becomes the sole version authority. |
| Neon + Vercel env vars | Setting `DATABASE_URL` at Preview scope, which applies to ALL preview deployments including random PR previews that should not touch the staging Neon branch. | Use branch-specific env var override: set `DATABASE_URL` for the `staging` branch only. PR previews get no `DATABASE_URL` (acceptable since user data is in IndexedDB and push notifications are not tested on ephemeral previews). |
| Privy + Vercel domains | Adding staging domain to Privy allowed origins but forgetting Vercel's auto-generated preview URLs (`*.vercel.app`). | For this single-user app, only add the staging subdomain. The app gracefully falls back to no-auth mode when `NEXT_PUBLIC_PRIVY_APP_ID` is unset (verified in `providers.tsx` line 116-128). Do NOT set Privy env vars on random preview deployments. |
| GitHub Actions + Vercel deploy | Using `vercel deploy --prod` in GitHub Actions while also having Vercel's Git Integration enabled, causing double deployments. | Pick one trigger. For this project: keep Vercel Git Integration for automatic deployments. Use GitHub Actions only for Release Please (creates PRs, tags releases) and Neon branch management. Do not deploy from Actions. |
| NEXT_PUBLIC_APP_VERSION + Release Please | Release Please updates `package.json` version in the release PR. Vercel builds from the merged commit which has the updated version. But if a workflow step tries to read the version BEFORE the release PR merges, it gets the old version. | Do not read version in the Release Please workflow itself. Let Vercel's post-merge build pick up the updated `package.json` naturally through `next.config.js` line 58: `NEXT_PUBLIC_APP_VERSION: packageJson.version`. |
| About dialog env label | `VERCEL_ENV` returns `"preview"` for both PR previews and staging deployments (unless using Vercel Pro custom environments). The existing `getEnvLabel()` in `about-dialog.tsx` shows "Preview" for staging. | Add a `NEXT_PUBLIC_ENVIRONMENT` override env var on the staging branch. Check it first: `process.env.NEXT_PUBLIC_ENVIRONMENT \|\| process.env.NEXT_PUBLIC_VERCEL_ENV`. Show "Staging" with a distinct badge color. |

## Performance Traps

Patterns that work initially but cause issues at scale.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Neon staging branch left running indefinitely | Neon Free plan compute hours exhausted mid-month; staging queries start timing out | Use Neon's auto-suspend (default 5min idle). Consider resetting the branch (which recreates it from production snapshot) rather than keeping a long-lived branch accumulating drift. | When Neon free tier compute hours are exhausted (~100 hours/month) |
| Release Please PR accumulates months of commits | Changelog becomes unwieldy (50+ entries), PR diff is enormous, reviewers cannot meaningfully review | Merge release PRs regularly -- at least per milestone boundary. Release Please PRs are low-risk (only changelog + version bump). | When the release PR has been open for > 4 weeks |
| Every push to staging branch triggers a Vercel build | Staging branch gets frequent commits from merging main; each triggers a build that counts toward Vercel build minutes | Merge to staging less frequently (weekly, or per-milestone). Or use `vercel.json` with `"git": { "deploymentEnabled": false }` and deploy manually via CLI when needed. | When Vercel Hobby plan build queue gets saturated (100 deploys/day) |

## Security Mistakes

Domain-specific security issues for this deployment lifecycle.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Staging `ALLOWED_EMAILS` whitelist misconfigured | If staging has no whitelist (env var unset), `privy-server.ts` line 119 allows ALL authenticated users. Anyone with a Privy account could access the staging API routes. | Set identical `ALLOWED_EMAILS` for staging and production. Verify by calling `/api/version` on staging -- if it returns without auth, the whitelist is not enforced. |
| `ANTHROPIC_API_KEY` shared between staging and production | Staging AI usage counts against production API quota; if staging key leaks, production key is compromised | Use separate Anthropic API keys. Create a second key in the Anthropic dashboard with staging-appropriate rate limits. |
| Neon staging branch inherits production `push_subscriptions` data | Staging cron jobs could send real push notifications to production user's devices using the inherited subscription endpoints and VAPID keys | After resetting the staging branch, truncate `push_subscriptions` and `push_sent_log`. Also ensure push notification cron jobs check `VERCEL_ENV` and skip non-production environments. |
| Release Please GitHub token permissions too broad | `contents: write` + excessive permissions could allow a compromised action to modify repo settings or deploy | Use minimum permissions: `contents: write` and `pull-requests: write` for Release Please. Use the default `GITHUB_TOKEN`, not a PAT. |
| Staging `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` shared with production | Staging push notifications appear to come from production; users cannot distinguish staging test notifications from real ones | Use separate VAPID keys for staging, or disable push notification registration on staging entirely. |

## UX Pitfalls

Issues that affect the developer/operator experience.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| About dialog shows "Preview" for staging | Confusing -- "Is this a PR preview or the stable staging?" The existing `getEnvLabel()` maps `preview` to an amber badge, but staging should be visually distinct. | Add `NEXT_PUBLIC_ENVIRONMENT=staging` env var on the staging branch. Update `getEnvLabel()` to check it. Use a purple or blue badge for staging. |
| No visual indicator that staging is not production | User accidentally enters real health data into staging, thinking it is the production app | Show a persistent "STAGING" banner or watermark. Use a different favicon or header color on staging. |
| Release Please PR description is generic | Hard to tell what is included in the release without reading the full changelog | This is Release Please's default behavior and acceptable. The changelog itself is the description. |
| Neon branch name not visible anywhere in the app | When debugging staging database issues, no way to confirm which Neon branch is connected | Log the Neon branch name (from `DATABASE_URL` hostname) in the `/api/version` route response. Only expose in non-production environments. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Release Please configured:** Version bumps on merge -- but did you verify the CHANGELOG.md is actually populated? Empty changelogs mean conventional commits are not being parsed. Check that merged commits use `feat:`, `fix:`, etc. prefixes. The main branch has older commits without conventional prefixes -- verify `bootstrap-sha` skips those.
- [ ] **Version-bump.yml deleted:** File removed -- but did you verify no other workflow references it? Check that branch protection rules do not require a status check named "bump-version" or similar.
- [ ] **Staging domain resolves:** DNS CNAME set up, page loads -- but did you check that the service worker is NOT caching? Open DevTools > Application > Service Workers on staging to verify none is registered. If one is registered from a previous deployment, unregister it manually.
- [ ] **Neon staging branch exists:** Branch created, connection string set in Vercel -- but did you run the migration script (`push-migration.sql`)? If the branch was created from production and production already has the tables, they are inherited. But if you RESET the branch later, verify tables still exist.
- [ ] **Privy works on staging:** Login modal appears -- but did you test the FULL flow? Login, whitelist check, PIN gate, API route authorization. The `privy-server.ts` whitelist check uses server-side env vars that may differ between environments.
- [ ] **CI still passes after adding release.yml:** All 12 jobs green -- but did you verify `ci-pass` gate is unchanged? New workflow files should not affect `ci.yml`, but verify no accidental edits were made during the PR.
- [ ] **E2E tests can run against staging:** Playwright configured -- but the existing E2E tests run against a local dev server (configured in `playwright.config.ts`). Running against staging requires a separate config or `baseURL` override. This is NOT the same as "E2E tests pass in CI."
- [ ] **Staging push notifications isolated:** After branch creation/reset -- but did you verify staging cron is not sending to production devices? Query `SELECT count(*) FROM push_subscriptions` on the staging branch. If > 0 and endpoints match production, truncate the table.
- [ ] **`package.json` version correct:** Updated to match manifest -- but did `NEXT_PUBLIC_APP_VERSION` update too? It is read from `package.json` at build time (`next.config.js` line 58). Trigger a rebuild after updating the version.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Release Please created wrong version | LOW | Delete the GitHub release and tag via `gh release delete v1.3.0 --yes && git push origin :refs/tags/v1.3.0`. Update `.release-please-manifest.json` to correct version, commit to main. |
| Service worker serving stale staging | MEDIUM | On desktop: DevTools > Application > Service Workers > Unregister. On phone: clear site data for `staging.intake-tracker.ryanjnoble.dev` in browser settings. Then deploy the fix (conditional PWA check) to prevent recurrence. |
| Neon staging branch has drifted schema | LOW | Run `neonctl branches reset staging --parent` (Neon CLI) or use the Reset Branch GitHub Action. Re-run `psql $STAGING_DATABASE_URL -f scripts/push-migration.sql` if tables were dropped. |
| Privy auth broken on staging | LOW | Add staging domain to Privy Dashboard > Settings > Allowed origins. No redeploy needed -- Privy checks origins at runtime, not build time. |
| CI gate broken (new job not wired) | LOW | Update `ci-pass.needs` array and result-checking script in `ci.yml`. Re-run the failed CI check on the PR. |
| Double deployment from Git Integration + Actions | LOW | Identify which trigger is unwanted. If Git Integration, the deployment auto-cancels if another starts. Check Vercel dashboard for duplicate deployments and cancel the stale one. |
| Version-bump.yml ran alongside Release Please | MEDIUM | Check git log for bot commits that bumped version incorrectly. Revert the bot commit (`git revert <sha>`), update `.release-please-manifest.json`, delete any incorrect releases/tags. Then verify `version-bump.yml` is deleted. |
| Staging push notifications sent to production devices | LOW | No permanent damage -- notifications are one-time events. Connect to staging Neon branch and run `TRUNCATE push_subscriptions, push_sent_log;` to prevent recurrence. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| RP v4 `releases_created` trap | Phase 1: Release Please setup | Merge a non-release commit to main; verify no GitHub Release is created |
| Package.json/tag version mismatch | Phase 1: Release Please setup | After bootstrap, verify `.release-please-manifest.json` shows `1.2.0` and first RP PR proposes `1.3.0` |
| Version-bump.yml coexistence | Phase 1: Release Please setup | Verify `version-bump.yml` is deleted and no workflows reference it |
| CI gate job wiring | Phase 1: Release Please setup | Add `release.yml` as separate file; verify `ci-pass` still passes on a test PR |
| Service worker on staging | Phase 2: Staging environment | Open staging in browser, verify no service worker registered in DevTools > Application |
| Preview vs staging confusion | Phase 2: Staging environment | Create a PR; verify preview URL is different from staging URL; verify env vars differ |
| Privy origin mismatch | Phase 2: Staging environment | Complete a full login flow on staging subdomain including PIN gate |
| About dialog env label | Phase 2: Staging environment | Check About dialog on staging shows "Staging" not "Preview" |
| Neon schema drift | Phase 3: Neon branching | Reset staging branch, verify all 4 push tables exist with correct columns |
| Staging push notification leakage | Phase 3: Neon branching | After staging branch reset, query `push_subscriptions` -- should be empty or contain only test data |
| Neon free tier compute exhaustion | Phase 3: Neon branching | Monitor Neon dashboard compute hours after 2 weeks of staging usage |
| Shared API keys (Anthropic, VAPID) | Phase 2: Staging environment | Verify staging uses separate API keys by checking Vercel env vars per environment |

## Sources

- [Release Please Action (googleapis/release-please-action)](https://github.com/googleapis/release-please-action) -- v4 configuration, output variables
- [Release Please v4 gotcha report](https://danwakeem.medium.com/beware-the-release-please-v4-github-action-ee71ff9de151) -- `releases_created` vs `release_created` bug
- [Release Please manifest docs](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) -- bootstrap-sha, initial version setup
- [Release Please customizing docs](https://github.com/googleapis/release-please/blob/main/docs/customizing.md) -- release-type, version files
- [Vercel Environments docs](https://vercel.com/docs/deployments/environments) -- preview vs production vs custom
- [Vercel staging setup guide](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) -- branch-based domain assignment, environment variables
- [Vercel environment variables docs](https://vercel.com/docs/environment-variables) -- branch-specific overrides, Preview scope
- [Neon branching docs](https://neon.com/docs/introduction/branching) -- copy-on-write, branch lifecycle
- [Neon: Why your staging DB never matches production](https://neon.com/blog/why-your-staging-database-never-matches-production) -- data/schema/transformation drift
- [Neon: How to keep staging in sync](https://neon.com/blog/how-to-keep-staging-in-sync-with-production-in-postgres) -- reset branch strategy
- [Neon GitHub Actions automation](https://neon.com/docs/guides/branching-github-actions) -- NEON_API_KEY, reset-branch-action
- [Privy Settings docs](https://docs.privy.io/guide/dashboard/settings) -- allowed origins, cookie configuration
- [Privy App Clients docs](https://docs.privy.io/guide/react/configuration/app-clients) -- multi-environment clientId, per-client origins
- Existing codebase: `ci.yml` (12-job pipeline with gate), `version-bump.yml` (to be replaced), `next.config.js` (PWA conditional + version injection), `push-db.ts` (4 Neon tables), `providers.tsx` (Privy graceful fallback), `about-dialog.tsx` (env label display), `privy-server.ts` (whitelist + dev fallback)

---
*Pitfalls research for: v1.3 Deployment Lifecycle (Release Please + Vercel staging + Neon branching)*
*Researched: 2026-04-04*
