# Phase 36: Neon DB + Vercel Integration Understanding - Research

**Researched:** 2026-04-06
**Domain:** NeonDB branching, Vercel environment variable scoping, dev/prod database separation
**Confidence:** HIGH

## Summary

The user is currently using a single production NeonDB connection string (`DATABASE_URL`) for both local development and production deployments. This is a safety risk -- any accidental schema changes or data mutations during local dev hit production data. The Neon database is used exclusively for server-side push notification tables (4 tables: `push_subscriptions`, `push_dose_schedules`, `push_sent_log`, `push_settings`), so the blast radius is limited but still unacceptable.

The solution is straightforward: create a Neon development branch, configure Vercel environment variables with proper scoping (different `DATABASE_URL` per environment), and update the local `.env.local` to use the dev branch connection string. Neon's Vercel integration can automate preview branch creation per deployment, but for this single-user app the simpler approach is a persistent `dev` branch with manual environment variable configuration.

The project already has Phase 28 infrastructure (staging branch, `staging-db-reset.yml` workflow, Neon branch actions) that validates this pattern works. Phase 36 extends it to cover local development.

**Primary recommendation:** Create a persistent Neon `dev` branch via `neonctl` or Neon Console, set its connection string as `DATABASE_URL` in Vercel's Development environment and in local `.env.local`, and keep the production connection string scoped to Vercel's Production environment only.

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (npm/yarn will fail)
- All user data lives in client-side IndexedDB via Dexie.js -- Neon Postgres is server-side only (push notifications)
- `DATABASE_URL` is a server-only env var -- must never be prefixed with `NEXT_PUBLIC_`
- `@neondatabase/serverless` is the database driver (not `pg` or Prisma)
- Bundle security tests verify `DATABASE_URL` and `NEON_DATABASE_URL` never leak to client bundles
- Never start the dev server; let user run `pnpm dev` themselves

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@neondatabase/serverless` | 1.0.2 | Neon Postgres driver (HTTP-based, edge-compatible) | Already installed, used in `push-db.ts` [VERIFIED: pnpm list] |
| Neon Console / neonctl | latest | Branch management (create dev branch, get connection string) | Official tooling for Neon branch operations [CITED: neon.com/docs/local/neon-local] |
| Vercel Dashboard | N/A | Environment variable scoping per environment | Built-in Vercel feature, no additional tooling needed [CITED: vercel.com/docs/environment-variables] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `neonctl` CLI | latest | Create/manage Neon branches from terminal | One-time setup of dev branch; optional for ongoing management [CITED: neon.com/guides/local-development-with-neon] |
| Neon Local (Docker) | latest | Local proxy for Neon branches (ephemeral/persistent) | Future consideration if offline dev is needed; not required for this phase [CITED: neon.com/docs/local/neon-local] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Neon dev branch (cloud) | Local Postgres via Docker | Local Postgres requires Docker, introduces environment drift from production, needs manual schema setup. Neon branch is copy-on-write from prod -- zero schema drift. |
| Neon dev branch (cloud) | Neon Local (Docker proxy) | Neon Local adds Docker dependency and `neonConfig` overrides in code. Overkill when a simple cloud branch with a different connection string suffices. |
| Manual env var scoping | Neon Vercel Integration (auto-provision) | The integration auto-creates preview branches per deployment and auto-injects env vars. Powerful but unnecessary for a single-user app with 4 tables. Manual scoping is simpler and more transparent. |
| Persistent dev branch | Ephemeral branches per feature | Ephemeral branches consume the 10-branch free tier limit. A single persistent dev branch uses 1 slot (main + staging + dev = 3 of 10). |

**Installation:**
```bash
# No new dependencies needed. @neondatabase/serverless is already installed.
# Optional: install neonctl for branch management
npm i -g neonctl
```

## Architecture Patterns

### Current Database Architecture
```
src/
  lib/
    push-db.ts          # ALL Neon usage -- 4 tables, parameterized queries via neon()
  app/
    api/
      push/
        subscribe/route.ts    # Uses savePushSubscription from push-db
        unsubscribe/route.ts  # Uses deletePushSubscription from push-db
        sync-schedule/route.ts # Uses syncDoseSchedules from push-db
        send/route.ts         # Uses getDueNotifications, getFollowUpNotifications, logSentNotification from push-db
scripts/
  push-migration.sql    # Schema DDL for the 4 push tables (CREATE TABLE IF NOT EXISTS)
```

### Pattern 1: Environment-Scoped DATABASE_URL

**What:** Different `DATABASE_URL` values for Production, Preview/Staging, and Development Vercel environments. Local `.env.local` uses the dev branch connection string.

**When to use:** Always -- this is the core pattern for dev/prod separation.

**How it works:**

```
Vercel Production env  --> DATABASE_URL = production Neon branch (main)
Vercel Preview env     --> DATABASE_URL = staging Neon branch (already set up in Phase 28)
Vercel Development env --> DATABASE_URL = dev Neon branch (new)
Local .env.local       --> DATABASE_URL = dev Neon branch connection string
```

[CITED: vercel.com/docs/environment-variables]

### Pattern 2: Neon Branch Creation

**What:** Create a `dev` branch from the production (`main`) branch in Neon. This is a copy-on-write clone -- instant, zero-cost, inherits schema and data from production.

**When to use:** One-time setup step.

**Example:**
```bash
# Via neonctl CLI
neonctl branches create --name dev --project-id <project-id>
neonctl connection-string dev --project-id <project-id>

# Or via Neon Console UI:
# Dashboard > Project > Branches > Create Branch > Name: "dev", Parent: "main"
```
[CITED: neon.com/guides/local-development-with-neon]

### Pattern 3: Vercel Environment Variable Scoping

**What:** Set `DATABASE_URL` with different values per Vercel environment (Production, Preview, Development).

**When to use:** During Vercel project configuration.

**How:**
1. Go to Vercel Dashboard > Project > Settings > Environment Variables
2. For `DATABASE_URL`:
   - Production scope: production Neon connection string (main branch)
   - Preview scope: staging Neon connection string (staging branch -- already exists from Phase 28)
   - Development scope: dev Neon connection string (new dev branch)
3. Same pattern for `DATABASE_URL_UNPOOLED` and other `PG*` / `POSTGRES_*` variables

[CITED: vercel.com/docs/environment-variables]

### Pattern 4: Local Development with vercel env pull

**What:** Use `vercel env pull` to download Development-scoped environment variables to a local `.env` file, or manually update `.env.local` with the dev branch connection string.

**When to use:** After setting up dev branch and Vercel env var scoping.

**Example:**
```bash
# Pull Development-scoped env vars from Vercel
vercel env pull .env.local --environment=development

# Or manually update .env.local:
# DATABASE_URL=postgresql://neondb_owner:...@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```
[CITED: vercel.com/docs/cli/env]

### Anti-Patterns to Avoid

- **Sharing production DATABASE_URL in .env.local:** This is the current problem. Local dev must use a dev branch connection string.
- **Using Neon Local Docker proxy for simple dev/prod separation:** Overkill when a cloud dev branch with a different connection string achieves the same goal without Docker.
- **Installing the full Neon Vercel Integration for a simple use case:** The integration auto-creates branches per preview deployment and manages env vars automatically. For 4 push tables on a single-user app, manual env var scoping is simpler and doesn't consume branch limits.
- **Modifying push-db.ts code to support different connection logic:** The code already reads `process.env.DATABASE_URL!` -- no code changes needed. The fix is entirely at the environment variable level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dev/prod DB separation | Custom connection string logic in code | Vercel environment variable scoping | Zero code changes. The app already reads `DATABASE_URL` from env. Different values per environment is a platform feature. |
| Branch management | Custom scripts to create/reset Neon branches | `neonctl` CLI or Neon Console UI | Official tooling handles authentication, project scoping, and connection string generation. |
| Schema sync between branches | Manual SQL migration tracking | Neon copy-on-write branching + `push-migration.sql` script | Neon branches inherit schema from parent. For schema changes, re-run the migration SQL on the dev branch. |
| Environment variable distribution | Custom env var management scripts | `vercel env pull` or manual `.env.local` updates | Built-in Vercel CLI feature handles env var synchronization. |

**Key insight:** This phase requires ZERO code changes to the application. The fix is entirely configuration: create a Neon branch, scope environment variables correctly in Vercel, and update `.env.local`.

## Common Pitfalls

### Pitfall 1: Free Tier Branch Limit (10 per project)

**What goes wrong:** Creating too many branches (dev, staging, feature branches, preview branches) exceeds the 10-branch free tier limit.
**Why it happens:** Users assume branches are unlimited. The free plan allows only 10 branches per project. [VERIFIED: neon.com/pricing -- "10/project" on Free plan]
**How to avoid:** Be deliberate about branch creation. This project needs: `main` (production, default), `staging` (Phase 28), and `dev` (this phase) = 3 branches. That leaves 7 for future use.
**Warning signs:** Neon Console shows branch count approaching 10; branch creation fails with a limit error.

### Pitfall 2: Forgetting to Scope Vercel Env Vars Per Environment

**What goes wrong:** Setting `DATABASE_URL` once with "All Environments" checked, meaning production, preview, and development all use the same connection string.
**Why it happens:** Vercel's default when adding an env var is to check all environments.
**How to avoid:** When adding/editing `DATABASE_URL` in Vercel, explicitly set different values per environment scope (Production, Preview, Development).
**Warning signs:** `vercel env pull` returns the production connection string; staging/preview deployments write to production database.

### Pitfall 3: Multiple Redundant Env Vars (DATABASE_URL, POSTGRES_URL, PGHOST, etc.)

**What goes wrong:** The `.env.template` shows 11+ database-related variables. Only `DATABASE_URL` is actually used in code (`push-db.ts` line 4). Updating one but not others creates confusion.
**Why it happens:** Neon's onboarding generates many variables for compatibility with different ORMs/drivers. The app only uses `@neondatabase/serverless` which needs only `DATABASE_URL`.
**How to avoid:** Only scope `DATABASE_URL` per environment in Vercel. The other `PG*` and `POSTGRES_*` variables can be removed from `.env.local` and Vercel settings since they're unused. Alternatively, scope them all consistently if keeping for future ORM adoption.
**Warning signs:** Code search for `PGHOST`, `POSTGRES_URL`, etc. returns zero hits in `src/` (already verified -- only `DATABASE_URL` is used).

### Pitfall 4: Schema Drift Between Branches

**What goes wrong:** Production schema evolves (new tables, altered columns) but the dev branch was created from an older snapshot and doesn't have the changes.
**Why it happens:** Neon branches are copy-on-write snapshots at creation time. They don't auto-sync with the parent.
**How to avoid:** For this project (4 static tables, no ORM migrations), re-run `push-migration.sql` on the dev branch when schema changes. All CREATE statements use `IF NOT EXISTS`. For more complex scenarios, use Neon's reset-branch-action to recreate from parent.
**Warning signs:** Push notification API routes return SQL errors about missing columns/tables on dev/staging.

### Pitfall 5: Committing .env.local with Production Credentials

**What goes wrong:** Developer updates `.env.local` with a dev connection string but accidentally commits the file.
**Why it happens:** `.env.local` is usually in `.gitignore` but worth verifying.
**How to avoid:** Verify `.gitignore` includes `.env.local` and `.env` (already standard for Next.js projects).
**Warning signs:** `git status` shows `.env.local` as untracked or modified.

## Code Examples

### Current Database Connection (no changes needed)

```typescript
// src/lib/push-db.ts -- line 1-5
// Source: codebase grep (VERIFIED)
import { neon } from "@neondatabase/serverless";

function getSQL() {
  return neon(process.env.DATABASE_URL!);
}
```

This code reads `DATABASE_URL` from the environment at runtime. No changes needed -- the fix is ensuring different environments provide different values.

### Creating a Dev Branch via neonctl

```bash
# Source: neon.com/guides/local-development-with-neon (CITED)

# Install neonctl
npm i -g neonctl

# Authenticate
neonctl auth

# Create dev branch from main (production)
neonctl branches create --name dev --project-id <your-project-id>

# Get the connection string for the dev branch
neonctl connection-string dev --project-id <your-project-id>
# Output: postgresql://neondb_owner:...@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

### Running Schema Migration on Dev Branch

```bash
# Source: scripts/push-migration.sql in codebase (VERIFIED)

# Get the dev branch connection string
DEV_DB_URL=$(neonctl connection-string dev --project-id <project-id>)

# Run migration (all CREATE TABLE IF NOT EXISTS -- safe to re-run)
psql "$DEV_DB_URL" -f scripts/push-migration.sql
```

### Vercel Environment Variable Configuration

```bash
# Source: vercel.com/docs/cli/env (CITED)

# Set DATABASE_URL for Production (main Neon branch)
vercel env add DATABASE_URL production
# Paste production connection string

# Set DATABASE_URL for Preview (staging Neon branch)
vercel env add DATABASE_URL preview
# Paste staging connection string

# Set DATABASE_URL for Development (dev Neon branch)
vercel env add DATABASE_URL development
# Paste dev connection string

# Pull development env vars to local .env.local
vercel env pull .env.local --environment=development
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single DATABASE_URL for all environments | Per-environment scoping in Vercel + Neon branching | Always available (Neon feature since launch) | Zero code changes, full environment isolation |
| Local Postgres Docker for dev | Neon cloud branches (or Neon Local Docker proxy) | Neon Local released 2025 | Cloud branches preferred for simplicity; Neon Local for offline work |
| Manual branch management | Neon GitHub Actions (create/delete/reset) | 2024-2025 | Already in use in this project (Phase 28 staging-db-reset.yml) |
| Full Neon Vercel Integration | Manual env var scoping | Both available | Integration is overkill for simple use cases; manual scoping is more transparent |

**Deprecated/outdated:**
- The `POSTGRES_*` and `PG*` env vars in `.env.template` are legacy compatibility variables. The app only uses `DATABASE_URL` via `@neondatabase/serverless`. These can be cleaned up but are harmless.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel project already has DATABASE_URL set (possibly without per-environment scoping) | Architecture Patterns | LOW -- user may need to add it fresh rather than edit existing |
| A2 | User has access to Neon Console for their project | Architecture Patterns | LOW -- standard for project owner |
| A3 | The staging Neon branch from Phase 28 is already created and working | Architecture Patterns | MEDIUM -- if Phase 28 was never fully executed, staging branch may not exist yet |
| A4 | User wants to keep using Neon cloud branch for dev (not local Postgres or Neon Local Docker) | Standard Stack | LOW -- simplest approach, user can override if they want offline dev |

## Open Questions

1. **Is Phase 28 staging infrastructure actually deployed?**
   - What we know: Phase 28 was planned (CONTEXT.md, workflows in repo) but STATE.md shows 0 completed phases in v1.4
   - What's unclear: Whether the staging Neon branch, staging Vercel domain, and env var scoping from Phase 28 are actually live
   - Recommendation: Phase 36 should be executable independently. If Phase 28 staging infra isn't live, this phase still works -- just create the dev branch and scope env vars. Staging configuration is separate.

2. **Should unused PG*/POSTGRES_* env vars be cleaned up?**
   - What we know: Only `DATABASE_URL` is used in code. 11+ other database env vars exist in `.env.template` and `.env.local`
   - What's unclear: Whether any future features might need them (e.g., if adding Prisma or Drizzle ORM)
   - Recommendation: Clean up in this phase to reduce confusion. They can be re-added if an ORM is adopted later.

3. **Does the user want the Neon Vercel Integration for automatic preview branching?**
   - What we know: The integration auto-creates a Neon branch per Vercel preview deployment and auto-injects env vars
   - What's unclear: Whether this automation is desired for a single-user app with 4 tables
   - Recommendation: Skip the integration. Manual env var scoping is simpler, more transparent, and doesn't consume branch limits per preview deployment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon Console access | Branch creation | Assumed (A2) | N/A | neonctl CLI |
| Vercel Dashboard access | Env var scoping | Assumed | N/A | vercel CLI |
| neonctl CLI | Branch management from terminal | Not checked | latest | Neon Console UI |
| vercel CLI | `vercel env pull` for local env | Not checked | latest | Manual `.env.local` editing |
| psql | Running push-migration.sql on dev branch | Not checked | -- | Neon Console SQL editor |

**Missing dependencies with no fallback:**
- None -- all operations can be done via web UIs (Neon Console, Vercel Dashboard)

**Missing dependencies with fallback:**
- `neonctl` and `vercel` CLI are optional; web UIs serve as fallbacks
- `psql` is optional; Neon Console has a built-in SQL editor

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 + playwright 1.58.2 |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `pnpm lint && pnpm typecheck` |
| Full suite command | `pnpm build` |

### Phase Requirements to Test Map

This phase is primarily configuration, not code. Validation is manual verification:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N36-01 | Dev branch exists in Neon | manual | N/A (verify via Neon Console) | N/A |
| N36-02 | Vercel Production env has production DATABASE_URL | manual | N/A (verify via Vercel Dashboard) | N/A |
| N36-03 | Vercel Development env has dev DATABASE_URL | manual | N/A (verify via Vercel Dashboard or `vercel env pull`) | N/A |
| N36-04 | Local .env.local uses dev branch connection string | manual | N/A (verify file contents) | N/A |
| N36-05 | Push API routes work against dev DB | manual | N/A (test push subscribe/unsubscribe locally) | N/A |
| N36-06 | Bundle security test still passes | unit | `pnpm test -- src/__tests__/bundle-security.test.ts` | Yes |

### Sampling Rate

- **Per task commit:** `pnpm lint && pnpm typecheck` (if any code changes)
- **Per wave merge:** `pnpm build`
- **Phase gate:** Manual verification of env var scoping + build green

### Wave 0 Gaps

None -- this phase requires no new test infrastructure. Existing bundle security test covers the one automated check (DATABASE_URL not in client bundle).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A (no auth changes) |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | No | N/A (no new inputs) |
| V6 Cryptography | No | N/A |
| V14 Configuration | Yes | Environment variable scoping per deployment environment |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Production DB accessed from dev environment | Information Disclosure | Separate DATABASE_URL per Vercel environment scope |
| Dev credentials committed to git | Information Disclosure | `.env.local` in `.gitignore` (already standard) |
| Production connection string in client bundle | Information Disclosure | Existing bundle security test (verified) |

## Sources

### Primary (HIGH confidence)
- [neon.com/pricing](https://neon.com/pricing) -- Free tier: 10 branches/project, 0.5 GB storage, 100 CU-hours/month
- [neon.com/docs/introduction/plans](https://neon.com/docs/introduction/plans) -- Plan comparison, branch limits confirmed
- [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables) -- Environment scoping (Production, Preview, Development), per-branch preview variables
- [neon.com/docs/guides/neon-managed-vercel-integration](https://neon.com/docs/guides/neon-managed-vercel-integration) -- Integration details, preview branch creation, env var injection
- [neon.com/docs/guides/vercel-managed-integration](https://neon.com/docs/guides/vercel-managed-integration) -- Vercel-managed integration alternative
- [neon.com/docs/guides/vercel-manual](https://neon.com/docs/guides/vercel-manual) -- Manual connection setup
- [neon.com/guides/local-development-with-neon](https://neon.com/guides/local-development-with-neon) -- Dev branch creation, neonctl workflow
- [neon.com/docs/local/neon-local](https://neon.com/docs/local/neon-local) -- Neon Local Docker proxy setup
- Codebase: `src/lib/push-db.ts`, `scripts/push-migration.sql`, `.env.template`, `package.json` -- VERIFIED via direct file reads

### Secondary (MEDIUM confidence)
- [vercel.com/docs/cli/env](https://vercel.com/docs/cli/env) -- `vercel env pull` command
- [neon.com/docs/guides/vercel-overview](https://neon.com/docs/guides/vercel-overview) -- Integration comparison (Vercel-managed vs Neon-managed vs Manual)
- [github.com/neondatabase/neon_local](https://github.com/neondatabase/neon_local) -- Neon Local README, Docker configuration

### Tertiary (LOW confidence)
- None -- all claims verified against official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `@neondatabase/serverless` already installed and working; Neon branching is well-documented
- Architecture: HIGH -- pattern is straightforward env var scoping, zero code changes required
- Pitfalls: HIGH -- branch limits verified against official pricing; env var scoping confirmed in Vercel docs
- Free tier limits: HIGH -- verified against neon.com/pricing (10 branches/project, 0.5 GB, 100 CU-hours)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable -- Neon and Vercel platforms change slowly)
