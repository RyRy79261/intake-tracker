# Stack Research: v2.0 Cloud Sync & Auth Migration

**Domain:** NeonDB cloud sync, auth migration, offline-first sync engine, Vercel Cron push notifications
**Researched:** 2026-04-11
**Confidence:** MEDIUM (Neon Auth is beta; sync engine is custom build)

## Recommended Stack

### Authentication: Neon Auth (replacing Privy)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@neondatabase/auth` | 0.1.0-beta.20 | Server-side auth (session, middleware, handlers) | Wrapper around Better Auth 1.4.18 managed by Neon. Auth state branches with DB -- isolated preview environments. No separate auth infra to manage. Email/password + Google OAuth out of the box. |
| `@neondatabase/auth` (client export) | 0.1.0-beta.20 | Client-side auth (`createAuthClient`) | Same package, client entrypoint at `@neondatabase/auth/next`. Provides `signIn`, `signUp`, `signOut`, `getSession` on client. |

**Key integration points:**
- Server: `createNeonAuth()` from `@neondatabase/auth/next/server` -- creates `auth` instance with `.handler()`, `.middleware()`, `.getSession()`
- Client: `createAuthClient()` from `@neondatabase/auth/next` -- browser-side auth operations
- API route: `app/api/auth/[...path]/route.ts` -- catch-all handler proxying to Neon Auth service
- Middleware: `middleware.ts` at project root -- `auth.middleware({ loginUrl: '/auth/sign-in' })`
- Env vars: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (32+ chars via `openssl rand -base64 32`)

**What this replaces:**
- `@privy-io/react-auth` -- client-side auth provider, login modal, usePrivy hook
- `@privy-io/server-auth` -- server-side token verification
- `src/lib/privy-server.ts` -- entire file replaced
- `src/lib/auth-middleware.ts` -- replaced with Neon Auth middleware
- `src/hooks/use-pin-gate.tsx` -- PIN gate removed entirely
- CSP rules for `*.privy.io`, `auth.privy.io` -- replaced with Neon Auth base URL domain

**NOT recommended:**
- `@neondatabase/auth-ui` (0.1.0-alpha.11) -- Pre-built auth UI components. Skip this. The app has shadcn/ui and existing form patterns. Build custom sign-in/sign-up forms matching the existing design system. The alpha-stage UI package adds a dependency for minimal value in a single-user app.

**Confidence: MEDIUM** -- Neon Auth is in beta. Better Auth 1.4.18 is the pinned version. The SDK API surface is stable enough for this use case (email/password + Google), but expect minor breaking changes before GA. The core patterns (handler, middleware, getSession) are well-documented.

### Database ORM: Drizzle ORM

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `drizzle-orm` | 0.45.2 | Type-safe SQL query builder for NeonDB | Native Neon HTTP driver support (`drizzle-orm/neon-http`). SQL-like API maps cleanly to existing raw SQL in `push-db.ts`. Schema-as-code with TypeScript. Zero runtime overhead -- compiles to SQL. |
| `drizzle-kit` | latest (dev dep) | Schema migrations, push, generate | CLI for generating SQL migration files from schema changes. `drizzle-kit push` for rapid prototyping; `drizzle-kit generate` + `drizzle-kit migrate` for production. |

**Why Drizzle over raw SQL (current approach):**
- Current `push-db.ts` uses raw tagged template SQL via `neon()`. This works but provides no type safety, no schema validation, and no migration tooling.
- With 16 tables migrating to Postgres, raw SQL becomes unmaintainable. Drizzle provides type-safe schema definitions that serve as both documentation and runtime validation.
- Drizzle's Neon HTTP driver (`drizzle-orm/neon-http`) uses the same `@neondatabase/serverless` package already installed.

**Why Drizzle over Prisma:**
- Prisma requires a query engine binary -- heavier for serverless. Drizzle compiles to direct SQL.
- Drizzle schema is TypeScript code, not a separate DSL. Better IDE integration.
- Drizzle has first-class Neon HTTP driver support. Prisma's Neon adapter is less mature.
- The existing codebase already has raw SQL patterns; Drizzle is closer to SQL than Prisma's abstraction.

**Driver choice:** Use `drizzle-orm/neon-http` (not WebSocket). All server-side operations are single-query transactions in serverless functions -- HTTP is faster and simpler. WebSocket driver is only needed for interactive transactions or session-based connections, which this app does not require.

**Configuration:**
```typescript
// src/lib/drizzle.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql });
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Confidence: HIGH** -- Drizzle ORM 0.45.x is stable, widely used, and has excellent Neon integration. The Neon HTTP driver is the officially recommended approach in both Drizzle and Neon docs.

### Sync Engine: Custom Build (not Dexie Cloud, not dexie-syncable)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Custom sync module | N/A | Bidirectional sync between Dexie (IndexedDB) and NeonDB (Postgres) | Full control over per-field timestamp merge resolution. No vendor lock-in. Fits the existing architecture. |
| `navigator.onLine` + `online`/`offline` events | Web API | Detect connectivity changes | Trigger sync on reconnection. Already available in browsers. |
| React Query mutations | Existing | Queue and retry sync operations | Already in the stack. `useMutation` with `onSettled` for sync triggers. |

**Why NOT Dexie Cloud:**
- Dexie Cloud is a managed SaaS service with its own auth system and Postgres backend. This project already has NeonDB and wants Neon Auth. Using Dexie Cloud would mean two separate Postgres databases and two auth systems.
- Dexie Cloud's conflict resolution is CRDT-based at the record level, not per-field timestamp merge. The project specifically requires per-field LWW.
- Self-hosting Dexie Cloud Server requires a Silver/Gold license. Over-engineered for a single-user app.

**Why NOT dexie-syncable:**
- Beta for years, never stabilized. The maintainer (David Fahlander) has shifted focus to Dexie Cloud.
- ISyncProtocol requires implementing a complex bidirectional change-tracking protocol. For a single-user app, this complexity is unnecessary.
- The app already has `updatedAt`, `createdAt`, `deletedAt`, `deviceId` on every record -- custom sync is straightforward.

**Sync engine design approach:**
1. **Local-first writes**: All mutations write to Dexie first, then queue for server sync.
2. **Sync queue**: A `_syncQueue` table in Dexie tracks pending changes (table name, record ID, operation type, timestamp).
3. **Background sync**: On connectivity restore or periodic timer, batch-push pending changes to server API routes.
4. **Server merge**: API routes accept batched changes. For each field, compare `fieldUpdatedAt` timestamps. Server wins ties (server timestamp is authoritative).
5. **Pull changes**: After pushing, pull any server-side changes newer than last sync timestamp. Apply to Dexie.
6. **Per-field timestamps**: Add a `_fieldTimestamps` JSON column to Postgres (or a separate metadata table) storing `{ fieldName: updatedAtMs }` for each record. On merge, compare per-field, not per-record.

**Confidence: MEDIUM** -- Custom sync is the right approach for this specific use case, but it is the highest-risk component of the milestone. Per-field timestamp merge is well-understood in theory but has edge cases (clock skew, batch atomicity, soft-delete propagation). This phase will need the most careful design.

### Push Notifications: Vercel Cron

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel Cron | Vercel platform | Trigger push notification checks on schedule | Already using CRON_SECRET auth pattern. Replaces client-side polling. Reliable server-triggered approach. |
| `vercel.json` | N/A | Cron schedule configuration | Standard Vercel project configuration. |

**CRITICAL: Vercel Plan Requirement**

| Plan | Min Interval | Precision | Sufficient? |
|------|-------------|-----------|-------------|
| Hobby | Once/day | +/- 59 min | NO -- medication reminders need multiple daily triggers |
| Pro ($20/mo) | Once/minute | Per-minute | YES -- can check every minute for due doses |
| Enterprise | Once/minute | Per-minute | YES |

The existing `POST /api/push/send` endpoint already handles the logic (check due notifications, send follow-ups). It currently authenticates via `CRON_SECRET` bearer token. The change is:

1. **Add `vercel.json`** with cron configuration pointing to the existing endpoint (change from POST to GET or add GET handler)
2. **Vercel Cron sends GET requests** -- the existing endpoint uses POST. Need to add a GET handler or create a new `/api/cron/push` GET route that calls the same logic.
3. **Pro plan required** for per-minute scheduling.

**Configuration:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/push",
      "schedule": "* * * * *"
    }
  ]
}
```

**Security:** Vercel automatically sends `CRON_SECRET` env var as `Authorization: Bearer <secret>` header. The existing auth pattern in `push/send/route.ts` already validates this. Reuse the same pattern.

**Confidence: HIGH** -- Vercel Cron is well-documented, the existing push infrastructure just needs a thin GET wrapper and vercel.json config. The Pro plan requirement is the only cost consideration.

### Existing Packages: Retained

| Package | Current Version | Role in v2.0 | Changes |
|---------|----------------|--------------|---------|
| `@neondatabase/serverless` | ^1.0.2 | Neon HTTP driver for Drizzle + raw queries | No change. Drizzle wraps this. |
| `dexie` | ^4.0.8 | IndexedDB client-side storage | Remains as offline mirror. Add `_syncQueue` and `_syncMeta` tables. |
| `dexie-react-hooks` | ^1.1.7 | `useLiveQuery` for reactive reads | No change. Reads still come from Dexie. |
| `@tanstack/react-query` | ^5.90.20 | Async data + sync mutations | Add sync-specific mutations and query invalidation on sync complete. |
| `zustand` | ^5.0.0 | Settings persistence | Add sync status state (lastSyncAt, syncInProgress, syncError). Settings may also sync to server. |
| `web-push` | ^3.6.7 | Server-side push notification sending | No change. Used by cron endpoint. |
| `zod` | 3 | Request validation | Use for sync API request/response validation. |
| `next-pwa` | ^5.6.0 | Service worker generation | No change to SW generation. Push handler already in `worker/index.js`. |

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-zod` | latest | Auto-generate Zod schemas from Drizzle table definitions | Use for validating sync payloads match DB schema. Avoids duplicating types. |
| `better-auth` | (transitive via @neondatabase/auth) | Auth framework | Do NOT install directly. Neon Auth wraps it. Only interact via `@neondatabase/auth` API. |

## Installation

```bash
# New dependencies
pnpm add @neondatabase/auth@latest drizzle-orm

# New dev dependencies
pnpm add -D drizzle-kit

# Optional (recommended for sync payload validation)
pnpm add drizzle-zod

# Remove after migration
pnpm remove @privy-io/react-auth @privy-io/server-auth
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@neondatabase/auth` (Neon Auth) | Auth.js (NextAuth) with Neon adapter | If Neon Auth stays in beta too long or lacks needed features. Auth.js is more mature but requires self-managing auth tables and session logic. |
| `@neondatabase/auth` (Neon Auth) | Clerk | If you want a fully managed auth UI + backend with no beta risk. But Clerk is a separate service ($$$) and doesn't branch with Neon DB. |
| Drizzle ORM | Raw SQL via `@neondatabase/serverless` | If schema is very simple (fewer than 5 tables). With 16 tables, raw SQL is unmaintainable. |
| Drizzle ORM | Prisma | If you prefer a higher-level abstraction with auto-generated client. But Prisma's query engine binary adds cold-start latency in serverless. |
| Custom sync engine | Dexie Cloud (self-hosted) | If building for multi-user with shared data and CRDT conflict resolution. This is single-user with per-field LWW. |
| Custom sync engine | PowerSync | If you want a managed sync service with Postgres. But PowerSync uses SQLite on client, not IndexedDB/Dexie. Would require rewriting entire client data layer. |
| Custom sync engine | ElectricSQL | If CRDTs + Postgres sync appeals. But ElectricSQL is still maturing and would replace Dexie entirely. |
| Vercel Cron | Upstash QStash | If staying on Hobby plan. QStash can schedule HTTP calls to your endpoint on a cron schedule without Vercel Pro. $1/mo for 500 messages/day. |
| Vercel Cron | External cron service (cron-job.org) | If budget is zero. Free external cron hits your endpoint. But adds external dependency and less reliable. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@neondatabase/auth-ui` | Alpha (0.1.0-alpha.11), re-exports third-party components that don't match shadcn/ui design system | Build custom auth forms with existing shadcn/ui components |
| `@neondatabase/neon-auth` | Deprecated package name. Renamed to `@neondatabase/auth` | `@neondatabase/auth` |
| `dexie-syncable` | Perpetual beta, maintainer moved to Dexie Cloud, complex ISyncProtocol | Custom sync module using existing Dexie hooks |
| `dexie-cloud-addon` | Requires Dexie Cloud service, own auth, own Postgres | Custom sync to NeonDB |
| `better-auth` (direct install) | Neon Auth wraps this. Installing directly creates version conflicts and bypasses Neon's managed session/cookie handling | Use via `@neondatabase/auth` only |
| `prisma` | Query engine binary, cold-start penalty, separate schema DSL | Drizzle ORM (lighter, TypeScript-native, Neon HTTP driver) |
| `rxdb` | Full replacement for Dexie with its own sync protocol. Massive migration effort for no clear benefit | Keep Dexie + custom sync |
| Any WebSocket library for sync | Unnecessary for single-user. Polling-based sync (on app focus, on connectivity restore, periodic) is simpler and sufficient | `navigator.onLine` events + periodic sync |

## Stack Patterns by Variant

**If staying on Vercel Hobby plan:**
- Use Upstash QStash ($1/mo) instead of Vercel Cron for per-minute push notification scheduling
- Or accept once-daily push notifications (insufficient for medication reminders)

**If Neon Auth beta proves too unstable:**
- Fall back to Auth.js (NextAuth v5) with `@auth/neon-adapter`
- Auth.js is mature, has Neon adapter, supports email/password + Google
- Requires managing auth tables yourself (not auto-managed in neon_auth schema)

**If per-field merge proves too complex:**
- Simplify to record-level LWW initially (compare `updatedAt` per record, not per field)
- Add per-field merge later as an enhancement
- Record-level LWW risks overwriting concurrent field changes, but single-user app makes true conflicts unlikely

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@neondatabase/auth@0.1.0-beta.20` | `@neondatabase/serverless@^1.0.2` | Both from Neon ecosystem. Auth uses serverless driver internally. |
| `drizzle-orm@0.45.2` | `@neondatabase/serverless@^1.0.2` | Drizzle's `neon-http` driver wraps `@neondatabase/serverless`. |
| `drizzle-orm@0.45.2` | `drizzle-kit@latest` | Always use matching major versions. Kit generates migrations for ORM schema. |
| `@neondatabase/auth@0.1.0-beta.20` | Better Auth 1.4.18 | Neon Auth pins this version internally. Do not install better-auth separately. |
| `dexie@^4.0.8` | Custom sync module | Dexie's hooks/middleware API is stable. Sync module uses `db.table().toArray()`, `.put()`, `.bulkPut()`. |
| Next.js 14.2.35 | `@neondatabase/auth` | Auth uses Next.js middleware and App Router conventions. Compatible with 14.x. |
| `drizzle-zod` | `drizzle-orm@0.45.x` + `zod@3` | Generates Zod schemas from Drizzle tables. Both already in stack. |

## Environment Variables: New

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `NEON_AUTH_BASE_URL` | Vercel env vars | Neon Auth service endpoint (from Neon console > Branch > Auth) |
| `NEON_AUTH_COOKIE_SECRET` | Vercel env vars | Session cookie signing secret (32+ chars) |
| `DATABASE_URL` | Already exists | Neon Postgres connection string (used by Drizzle + existing push-db) |
| `CRON_SECRET` | Already exists | Vercel Cron authentication token |

**Remove after migration:**
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PUBLIC_PRIVY_CLIENT_ID`
- `PRIVY_APP_SECRET`
- `ALLOWED_EMAILS` (replace with Neon Auth allowlist or single-user check)
- `ALLOWED_WALLETS` (crypto wallet auth not needed)

## CSP Changes

The Content Security Policy in `next.config.js` needs updating:

**Remove:**
- `connect-src`: `https://*.privy.io`, `https://*.walletconnect.com`, `https://*.walletconnect.org`, `wss://*.walletconnect.org`
- `frame-src`: `https://auth.privy.io`

**Add:**
- `connect-src`: Neon Auth base URL domain (e.g., `https://*.neonauth.us-east-1.aws.neon.tech`)

## File Changes Summary

| Current File | Action | Replacement |
|-------------|--------|-------------|
| `src/lib/privy-server.ts` | DELETE | `src/lib/auth/server.ts` (Neon Auth) |
| `src/lib/auth-middleware.ts` | DELETE | `middleware.ts` (root, Neon Auth middleware) |
| `src/hooks/use-pin-gate.tsx` | DELETE | N/A (PIN gate removed) |
| `src/app/providers.tsx` | MODIFY | Remove PrivyProvider, PinGateProvider. Add NeonAuth client context if needed. |
| `src/lib/push-db.ts` | MODIFY | Migrate to Drizzle ORM queries |
| `scripts/push-migration.sql` | REPLACE | Drizzle schema definition + drizzle-kit migrations |
| `next.config.js` | MODIFY | Update CSP headers |
| N/A | CREATE | `vercel.json` (cron configuration) |
| N/A | CREATE | `src/db/schema.ts` (Drizzle schema for all 16 tables + push tables) |
| N/A | CREATE | `src/lib/drizzle.ts` (Drizzle client instance) |
| N/A | CREATE | `drizzle.config.ts` (Drizzle Kit configuration) |
| N/A | CREATE | `src/lib/sync/` directory (sync engine module) |
| N/A | CREATE | `src/app/api/auth/[...path]/route.ts` (Neon Auth handler) |
| N/A | CREATE | `src/app/api/cron/push/route.ts` (GET handler for Vercel Cron) |
| N/A | CREATE | `src/app/api/sync/push/route.ts` (receive client changes) |
| N/A | CREATE | `src/app/api/sync/pull/route.ts` (send server changes to client) |
| N/A | CREATE | `src/app/auth/sign-in/page.tsx` + `actions.ts` |
| N/A | CREATE | `src/app/auth/sign-up/page.tsx` + `actions.ts` |

## Sources

- [Neon Auth Overview](https://neon.com/docs/auth/overview) -- feature set, Better Auth 1.4.18, beta status
- [Neon Auth Next.js Quick Start](https://neon.com/docs/auth/quick-start/nextjs) -- setup guide, packages, code patterns
- [Neon Auth Next.js Server SDK Reference](https://neon.com/docs/auth/reference/nextjs-server) -- createNeonAuth config, API methods, middleware
- [Neon Auth API-only Quick Start](https://neon.com/docs/auth/quick-start/nextjs-api-only) -- custom forms approach (recommended over UI kit)
- [@neondatabase/auth npm](https://www.npmjs.com/package/@neondatabase/auth) -- version 0.1.0-beta.20
- [@neondatabase/auth-ui npm](https://www.npmjs.com/package/@neondatabase/auth-ui) -- version 0.1.0-alpha.11 (not recommended)
- [Drizzle ORM Neon Connection](https://orm.drizzle.team/docs/connect-neon) -- HTTP vs WebSocket drivers, setup code
- [Drizzle ORM npm](https://www.npmjs.com/package/drizzle-orm) -- version 0.45.2
- [Neon Drizzle Migrations Guide](https://neon.com/docs/guides/drizzle-migrations) -- drizzle-kit workflow
- [Vercel Cron Quickstart](https://vercel.com/docs/cron-jobs/quickstart) -- vercel.json format, GET requirement, CRON_SECRET
- [Vercel Cron Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) -- Hobby (once/day), Pro (once/minute)
- [Dexie.js Issue #1168](https://github.com/dfahlander/Dexie.js/issues/1168) -- Dexie maintainer on SQL sync approaches
- [Offline Sync Patterns Guide](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) -- per-field LWW strategy
- [Better Auth Documentation](https://better-auth.com/) -- email/password, Google OAuth, session management

---
*Stack research for: v2.0 Cloud Sync & Auth Migration*
*Researched: 2026-04-11*
