# Phase 36: Neon DB + Vercel Integration Understanding - Research

**Researched:** 2026-04-06
**Phase:** 36-neon-db-vercel-integration-understanding
**Question:** What do I need to know to PLAN this phase well?

## Current State of Neon in the Codebase

### What Exists Today

Only **push notification infrastructure** uses NeonDB. The single consumer is `src/lib/push-db.ts`, which uses `@neondatabase/serverless` (v1.0.2) with raw SQL (no ORM). Four server-side tables exist:

| Table | Purpose |
|-------|---------|
| `push_subscriptions` | VAPID push subscription storage per user |
| `push_dose_schedules` | Medication reminder schedules (time_slot + day_of_week) |
| `push_sent_log` | Deduplication log for sent notifications |
| `push_settings` | Per-user notification preferences |

All 16 Dexie.js tables (intakeRecords, weightRecords, etc.) remain client-side only in IndexedDB. There is **no server-side schema** for health tracking data.

### Existing Environment Variables

The `.env.template` contains ~15 Neon/Postgres variables. Based on research, these break down as:

**Auto-injected by Neon-Vercel integration (for production/preview/dev):**
- `DATABASE_URL` — pooled connection (via pgbouncer), used by `push-db.ts`
- `DATABASE_URL_UNPOOLED` — direct connection without pgbouncer

**Auto-injected legacy PostgreSQL variables:**
- `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`

**Auto-injected Vercel Postgres Template variables:**
- `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `POSTGRES_URL_NO_SSL`, `POSTGRES_PRISMA_URL`

**Only `DATABASE_URL` is actually consumed** by the codebase (`push-db.ts`). All other variables are injected by the integration but unused.

### Existing GitHub Actions

- `.github/workflows/staging-db-reset.yml` — Uses `neondatabase/reset-branch-action@v1` to reset the Neon "staging" branch from its parent (production). Triggered on release publish or manual dispatch.
- `.github/workflows/promote-to-production.yml` — Creates a Neon production snapshot before staging-to-main promotion PRs. Uses Neon REST API directly.

### Security Measures

- `src/__tests__/bundle-security.test.ts` — Verifies `DATABASE_URL` and `NEON_DATABASE_URL` are not leaked to client bundle
- Server-only DB access via Next.js API routes — connection strings never reach the client

## Neon-Vercel Integration Architecture

### Integration Types

Two options exist:

1. **Vercel-Managed Integration** — Create/manage Neon databases from Vercel dashboard. Billing through Vercel. Preview branches supported.
2. **Neon-Managed Integration** — Link existing Neon project to Vercel. Billing through Neon. Preview branches supported.

The project uses the **Neon-Managed Integration** (user confirmed they installed it via the Vercel marketplace and already have a Neon account).

### Branch Database Lifecycle

```
Neon Project
├── main (production branch)
│   └── DATABASE_URL → production Vercel environment
├── staging (child of main)
│   └── DATABASE_URL → staging Vercel environment
│   └── Reset from parent on release publish
└── preview/<git-branch> (child of main, auto-created)
    └── DATABASE_URL → specific preview deployment only
    └── Cleaned up when git branch deleted
```

**Branch creation flow (preview deployments):**
1. Developer pushes to a feature branch on GitHub
2. Vercel triggers a preview deployment
3. Neon integration receives webhook from Vercel
4. Neon creates branch named `preview/<git-branch>` (copy-on-write from main)
5. New connection string injected as environment variables for that specific deployment only
6. Branch is instantly ready — copy-on-write means no data copying delay

**Branch cleanup:**
- **Neon-Managed:** Automatic when git branch is deleted (executes next time a preview deployment is created)
- **Vercel-Managed:** Depends on Vercel's deployment retention policy (can delay branch deletion by months)
- Warning: Renaming git or Neon branches breaks name-matching logic

**Staging branch lifecycle:**
- Persistent child of `main` branch
- Reset to production state via `staging-db-reset.yml` (triggered on release publish)
- Reset is a **complete overwrite** — both schema and data are replaced with parent's current state
- Connections temporarily interrupted during reset but connection details remain unchanged

### Environment Variable Injection Per Environment

| Variable | Production | Preview | Development |
|----------|-----------|---------|-------------|
| `DATABASE_URL` | main branch (pooled) | preview/\<branch\> (pooled) | vercel-dev branch (pooled) |
| `DATABASE_URL_UNPOOLED` | main branch (direct) | preview/\<branch\> (direct) | vercel-dev branch (direct) |
| `PGHOST` | main host | preview host | dev host |
| `PGUSER` | main role | preview role | dev role |
| `PGDATABASE` | neondb | neondb | neondb |
| `PGPASSWORD` | main password | preview password | dev password |
| All POSTGRES_* vars | main | preview | dev |

Key insight: Preview deployments get **isolated connection strings** — each preview deploy talks to its own branch, not the production database.

## Neon Auth (Privy Replacement Path)

### What It Is

Neon Auth is a managed authentication service built on **Better Auth** (v1.4.18+). Authentication data is stored directly in the Neon database in the `neon_auth` schema.

### Key Features for This Project

1. **Branch-compatible auth** — Auth state branches with the database. Preview deploys get isolated auth environments.
2. **Database-native** — User data in `neon_auth` schema, queryable via SQL, compatible with Row Level Security (RLS)
3. **Zero server management** — Managed REST API service, configure in Neon Console
4. **E2E testing advantage** — Each branch has its own auth state, so test accounts can be created per branch without affecting production (solves the current Privy E2E testing limitation)
5. **Next.js SDK** — Server: `createNeonAuth()` + `auth.handler()` for API routes. Client: `createAuthClient()` + `NeonAuthUIProvider` for React components.

### Authentication Methods

- Email/password (built-in)
- Google OAuth (out-of-the-box credentials for testing)
- Other OAuth providers via Better Auth plugins
- Magic links, OTP (via Better Auth)

### Environment Variables Added

When Neon Auth is enabled:
- `NEON_AUTH_BASE_URL` — Auth API endpoint (auto-injected by integration)
- `NEON_AUTH_COOKIE_SECRET` — Cookie encryption (manually set, generated via `openssl rand -base64 32`)

### Migration Path from Privy

The project currently uses Privy for email/Google authentication with a whitelist (`ALLOWED_EMAILS`). Migration to Neon Auth would:
1. Replace Privy SDK with Better Auth client/server SDKs
2. Move user identity from Privy's external service to `neon_auth` schema in Neon
3. Replace `PrivyProvider` + `PinGateProvider` in `src/app/providers.tsx`
4. Remove Privy-related env vars (`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, `PRIVY_APP_SECRET`)
5. E2E tests can create test users directly in the branch database (no Privy test account needed)

## Offline-to-Cloud Sync Architecture (Future Migration)

### Current Architecture
```
[Browser] → IndexedDB (Dexie.js) → All 16 tables
                ↓ (no sync)
[Server] → NeonDB → Only push_* tables
```

### Target Architecture
```
[Browser] → IndexedDB (offline cache/buffer)
                ↓ sync via API routes
[Server] → NeonDB (primary data store)
                ↑
[Android App] → API routes → NeonDB
```

### Conflict Resolution Strategies

| Strategy | Pros | Cons | Best For |
|----------|------|------|----------|
| **Last-Write-Wins (LWW)** | Simple, no merge logic needed | Can silently lose edits from other device | Single-user apps, append-only data |
| **Version Vector / CRDT** | No data loss, automatic merge | Complex implementation, larger payloads | Multi-user, concurrent editing |
| **Revision History** | Manual conflict resolution possible | UX burden on user | Document-centric apps |
| **Server-Authoritative** | Predictable, simple client logic | Requires connectivity for authoritative state | Apps where server is always right |

**Recommendation for this project:** Last-Write-Wins (LWW) with timestamp-based resolution. Rationale:
- Single-user app (no concurrent editing from different users)
- Primary conflict scenario: same user editing on phone vs desktop while offline
- Health tracking records are append-mostly (new entries, not edits to existing)
- Simplest implementation path with `@neondatabase/serverless`

### Sync Implementation Pattern (IndexedDB Metadata)

Each Dexie record would need additional fields:
- `syncStatus`: 'pending' | 'synced' | 'failed'
- `lastModified`: ISO timestamp for LWW comparison
- `serverId`: UUID assigned by server on first sync
- `isDeleted`: Soft-delete flag for sync (tombstone)

### API Route Pattern for Sync

```
POST /api/sync/push   — Client sends pending changes to server
GET  /api/sync/pull    — Client fetches changes since last sync timestamp
POST /api/sync/full    — Full resync (initial setup or recovery)
```

## Verification Architecture

### How to Verify the Integration Works

1. **Neon Dashboard Check:**
   - Project has main branch (production)
   - Staging branch exists as child of main
   - Preview branches appear when PRs are opened

2. **Vercel Dashboard Check:**
   - Environment variables are set per environment
   - Preview deployments show different DATABASE_URL than production

3. **Functional Verification:**
   - Push notifications work in production (push_subscriptions table accessible)
   - Staging DB reset workflow succeeds
   - Preview deploys can read/write to their branch

### Env Var Audit Approach

Compare `.env.template` against what the integration actually injects:
- Variables consumed by code: `DATABASE_URL` only
- Variables injected but unused: all POSTGRES_*, PG*, DATABASE_URL_UNPOOLED
- Variables manually set: `PRIVY_*`, `ANTHROPIC_API_KEY`, `ALLOWED_EMAILS`

## Key Risks and Considerations

1. **Reset-from-parent is destructive** — Staging reset wipes all data, not just schema. If staging has test data that matters, it's gone.
2. **Preview branch cleanup timing** — Neon-Managed cleanup happens on next preview deploy creation, not immediately on git branch deletion.
3. **Copy-on-write semantics** — Preview branches share storage with parent until writes diverge. Low cost for many branches.
4. **Connection interruption on reset** — Staging connections temporarily break during reset. Current staging-db-reset.yml handles this gracefully.
5. **Child branch blocking** — If a preview branch has child branches, automatic deletion is blocked.

## RESEARCH COMPLETE
