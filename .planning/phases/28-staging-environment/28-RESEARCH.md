# Phase 28: Staging Environment - Research

**Phase:** 28
**Goal:** A stable staging environment exists at a known URL with its own isolated backend, where service workers cannot cache stale content and auth works correctly
**Researched:** 2026-04-04
**Confidence:** HIGH

## RESEARCH COMPLETE

## Executive Summary

Phase 28 establishes a staging environment for the Intake Tracker PWA at `staging.intake-tracker.ryanjnoble.dev`. The phase requires changes across three domains: (1) code changes to disable the service worker on non-production Vercel environments, (2) GitHub Actions workflow to automate Neon staging branch reset on release, and (3) documentation for manual Vercel/DNS/Privy/Neon setup steps the user performs once. All patterns are well-documented by their respective platforms and the milestone-level research (`.planning/research/ARCHITECTURE.md`) has already drafted the exact approach.

The implementation is low-risk because the app already exposes `NEXT_PUBLIC_VERCEL_ENV` in `next.config.js` (line 60), the `next-pwa` conditional loading pattern already exists (line 3), and the Neon database layer (`src/lib/push-db.ts`) reads `DATABASE_URL` with no hardcoded connection strings. The only code changes are a one-line enhancement to the PWA conditional in `next.config.js` and a client-side guard in `use-service-worker.ts`. Everything else is infrastructure configuration (Vercel env vars, DNS, Privy dashboard, Neon branch creation) and a new GitHub Actions workflow file.

## Technical Analysis

### 1. Service Worker Disabling (STG-04)

**Current state:** `next.config.js` line 3 conditionally loads `next-pwa` when `NODE_ENV === 'production'`. However, Vercel builds ALL environments (including preview/staging) in production mode (`NODE_ENV=production`), so the service worker is currently generated for staging deployments too.

**Solution:** Add `VERCEL_ENV` check to the existing conditional. `VERCEL_ENV` is a Vercel system environment variable set to `production` only for the production deployment. Preview/staging deployments get `VERCEL_ENV=preview`.

```javascript
// Current (line 3):
const withPWA = process.env.NODE_ENV === 'production'

// Target:
const withPWA = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview'
```

**Belt-and-suspenders:** Even if the build-time check is missed (e.g., local production build), `use-service-worker.ts` should also guard against registering on non-production Vercel environments. The `NEXT_PUBLIC_VERCEL_ENV` variable is already exposed client-side via `next.config.js` line 60.

**Verified:** `VERCEL_ENV` is a read-only system variable set by Vercel. It cannot be overridden in Vercel project settings. Values: `production`, `preview`, `development`. The staging branch gets `preview` because Vercel treats all non-production branches as preview.

### 2. Neon Database Branching (STG-02, STG-05)

**Current state:** `src/lib/push-db.ts` reads `process.env.DATABASE_URL` with no environment-specific logic. This is ideal — the staging deployment just needs a different `DATABASE_URL` env var pointing to the Neon staging branch.

**Neon branch approach (from CONTEXT.md D-04, D-05, D-06):**
- One-time setup: Create a `staging` branch from the `main` (production) branch in Neon Console
- Automated reset: GitHub Action triggered by `release` event (Release Please creating a GitHub Release) deletes the staging branch and recreates it from main
- Safety guard: Hardcode the staging branch name in the workflow, explicit check that branch name is NOT the production branch before deletion

**Neon API details:**
- `neondatabase/create-branch-action@v6` — creates a branch. Inputs: `project_id`, `parent`, `branch_name`. Output: `db_url` (connection string)
- `neondatabase/delete-branch-action@v1` — deletes a branch by name/ID. Requires `project_id`, `branch_id` or `branch`
- Alternative: use `neondatabase/reset-branch-action@v1` which does atomic reset-to-parent. However, CONTEXT.md D-05 specifies delete+recreate for a clean slate

**Connection string stability:** After reset, the Neon branch connection string changes if delete+recreate is used (new branch = new connection string). This means the Vercel staging `DATABASE_URL` env var would need to be updated after each reset. This is a significant operational concern.

**Better approach:** Use `neondatabase/reset-branch-action@v1` with `parent: true` instead of delete+recreate. This preserves the branch identity and connection string while refreshing all data to match the parent. The CONTEXT.md says delete+recreate, but the research shows reset-branch is operationally superior because:
1. Connection string never changes
2. Atomic operation (no window where branch doesn't exist)
3. Same end result (clean data from production schema)

**Recommendation:** Use reset-branch instead of delete+recreate. Document the tradeoff in the plan.

### 3. Vercel Staging Configuration (STG-01, STG-03)

**Vercel branch-domain assignment (Hobby plan):**
- Available on all plans including Hobby (free)
- Settings > Domains > Add domain > assign to git branch `staging`
- Domain: `staging.intake-tracker.ryanjnoble.dev` — requires CNAME record pointing to `cname.vercel-dns.com`
- Branch-specific env vars: set in Vercel Dashboard > Settings > Environment Variables > select "Preview" scope and filter by branch `staging`

**Required staging env vars:**
| Variable | Value | Scope |
|----------|-------|-------|
| `DATABASE_URL` | Neon staging branch connection string | Preview (staging branch) |
| `ALLOWED_EMAILS` | Same as production whitelist | Preview (staging branch) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Same as production (Privy handles origins separately) | Preview (staging branch) |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Same as production | Preview (staging branch) |

**Note:** `VERCEL_ENV` is a system variable set automatically by Vercel — do NOT set it manually. It will be `preview` for the staging branch deployment.

### 4. Privy Auth Configuration (STG-06)

**Current state:** `src/app/providers.tsx` reads `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_CLIENT_ID`. The Privy SDK sends the current page origin to Privy's servers for validation.

**Requirement:** Add `staging.intake-tracker.ryanjnoble.dev` to the allowed origins list in the Privy Dashboard (Settings > Allowed Origins). Without this, login requests from the staging domain will be rejected.

**No code changes needed** for Privy — the SDK works the same on any allowed origin.

### 5. Staging Branch Reset Workflow (STG-05)

**Trigger:** GitHub `release` event (fired when Release Please merges a release PR and creates a GitHub Release). This is the correct trigger per CONTEXT.md D-04.

**Workflow structure:**
```yaml
name: Reset Staging DB
on:
  release:
    types: [published]
  workflow_dispatch:  # Manual trigger as fallback

jobs:
  reset-staging-db:
    runs-on: ubuntu-latest
    steps:
      - name: Safety check
        run: |
          STAGING_BRANCH="staging"
          if [ "$STAGING_BRANCH" = "main" ]; then
            echo "::error::ABORT: Cannot reset the production branch"
            exit 1
          fi
      - name: Reset Neon staging branch
        uses: neondatabase/reset-branch-action@v1
        with:
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch: staging
          parent: true
          api_key: ${{ secrets.NEON_API_KEY }}
```

**Required GitHub Secrets:**
- `NEON_PROJECT_ID` — Neon project ID
- `NEON_API_KEY` — Neon API key with branch management permissions

### 6. CI Workflow Updates

**Current CI (`ci.yml`):** Runs on `pull_request` to `[main]` only. The staging branch needs CI coverage too.

**Change:** Add `staging` to the `branches` array in `ci.yml`:
```yaml
on:
  pull_request:
    branches: [main, staging]
```

This ensures PRs targeting the staging branch also run CI checks. Direct pushes to staging (allowed per D-03) do NOT trigger this workflow — only PRs do.

## Validation Architecture

### Dimension 1: Functional Correctness
- Service worker NOT registered on staging URL
- Privy login succeeds on staging URL
- Push notification data stored in staging Neon branch, not production

### Dimension 2: Integration Boundary
- `next.config.js` PWA conditional correctly evaluates on Vercel preview
- `use-service-worker.ts` respects `NEXT_PUBLIC_VERCEL_ENV`
- GitHub Actions workflow triggers on `release` event

### Dimension 3: Error Handling
- Safety guard prevents production Neon branch deletion
- Workflow fails gracefully if Neon API key is missing/invalid

### Dimension 4: Data Integrity
- Staging `DATABASE_URL` points to isolated Neon branch
- Reset action refreshes data without changing connection string
- `ALLOWED_EMAILS` whitelist prevents unauthorized staging access

### Dimension 5: Performance
- No performance implications — changes are build-time conditionals and infrastructure config

### Dimension 6: Security
- Staging shares same auth (Privy) as production — no weaker auth
- `ALLOWED_EMAILS` must be set on staging to prevent open access
- Neon API key stored as GitHub Secret, never in code

### Dimension 7: Edge Cases
- First deployment before Privy origin is configured = login failure
- Service worker cached from a previous preview deployment = stale content
- Neon free tier compute limit (~100h/month) with auto-suspend

### Dimension 8: Observability
- `about-dialog.tsx` already shows "Preview" label for `VERCEL_ENV=preview` — adequate for staging identification
- `/api/version` endpoint returns environment info for health checks

## File Inventory

**Files to modify:**
1. `next.config.js` — Add `VERCEL_ENV` check to PWA conditional (line 3)
2. `src/hooks/use-service-worker.ts` — Add client-side guard against staging registration
3. `.github/workflows/ci.yml` — Add `staging` to PR branch targets

**Files to create:**
1. `.github/workflows/staging-db-reset.yml` — Neon staging branch reset workflow
2. `docs/staging-setup.md` — Manual setup documentation for Vercel, DNS, Privy, and Neon

**Files unchanged:**
- `src/lib/push-db.ts` — Already reads `DATABASE_URL` generically, no changes needed
- `src/app/providers.tsx` — Privy config works with any allowed origin, no changes needed
- `src/components/about-dialog.tsx` — Already shows "Preview" badge, adequate for staging

## Implementation Order

1. **Code changes first** (service worker disable in `next.config.js` + `use-service-worker.ts`) — must be merged to any branch BEFORE the first staging deployment to prevent SW from installing
2. **CI workflow update** (add staging branch to `ci.yml`) — enables PR-based CI for staging
3. **Staging DB reset workflow** (`staging-db-reset.yml`) — can be created before or after Neon branch exists
4. **Manual setup documentation** — documents the one-time Vercel/DNS/Privy/Neon steps for the user
5. **User performs manual setup** — Vercel domain assignment, DNS CNAME, Privy allowed origins, Neon branch creation, Vercel env vars

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Service worker installs before code change deployed | LOW (code change merged first) | HIGH (requires manual cache clearing) | Merge SW disable before creating staging branch |
| Privy origin not configured before first login attempt | MEDIUM | LOW (login fails with clear error) | Document in setup guide; verify immediately |
| Neon free tier compute exhaustion | LOW (auto-suspend after 5 min) | LOW (staging unavailable until reset) | Monitor first 2 weeks |
| Delete+recreate changes connection string | N/A (using reset instead) | N/A | Use reset-branch-action which preserves connection |
| `ALLOWED_EMAILS` not set on staging | MEDIUM | HIGH (any Privy user can access) | Explicit in setup docs + verification step |

---
*Research completed: 2026-04-04*
*Phase: 28-staging-environment*
