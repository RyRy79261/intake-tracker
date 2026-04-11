# Architecture Patterns: v2.0 Cloud Sync & Auth Migration

**Domain:** Offline-first sync engine, auth migration, data layer restructuring for health tracking PWA
**Project:** Intake Tracker v2.0
**Researched:** 2026-04-11

## Current Architecture (Baseline)

Before detailing changes, here is the exact current state of the system:

```
+--------------------------+
|       React UI           |
|  (shadcn/ui + Tailwind)  |
+---------+----------------+
          |
+---------v----------------+     +--------------------+
|  useLiveQuery hooks      |     | useMutation hooks  |
|  (dexie-react-hooks)     |     | (React Query)      |
+---------+----------------+     +--------+-----------+
          |                               |
+---------v-------------------------------v-----------+
|            Service Layer (src/lib/*-service.ts)      |
|  intake-service, health-service, medication-service  |
|  eating-service, substance-service, dose-log-service |
|  composable-entry-service, etc.                      |
+---------+-------------------------------------------+
          |
+---------v----------------+
|     Dexie.js (db.ts)     |
|   16 tables, schema v15  |
|   IndexedDB              |
+--------------------------+

Server-side (separate):
+--------------------------+     +------------------+
|  API Routes (Next.js)    |     | Neon Postgres    |
|  /api/ai/*               |---->| (push tables     |
|  /api/push/*             |     |  only: 4 tables) |
|  /api/version            |     +------------------+
+---------+----------------+
          |
+---------v----------------+
|   Privy Auth             |
|   (withAuth middleware)  |
+--------------------------+
```

### Key Current Patterns

| Pattern | Implementation | Location |
|---------|---------------|----------|
| Reads | `useLiveQuery()` from dexie-react-hooks -- auto-reactive | `src/hooks/use-*-queries.ts` (15 files) |
| Writes | `useMutation()` from React Query -- calls service layer | Same hook files |
| Service CRUD | Direct `db.tableName.add/update/get` on Dexie | `src/lib/*-service.ts` (15+ files) |
| Soft deletes | `deletedAt: number \| null` on every record | All 16 tables |
| Sync metadata | `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone` | All records since v10 |
| Auth (server) | `withAuth()` HOF -- verifies Privy JWT, checks email whitelist | `src/lib/auth-middleware.ts` |
| Auth (client) | `PrivyProvider` + `PinGateProvider` in provider stack | `src/app/providers.tsx` |
| Settings | Zustand store persisted to localStorage (v5 migration chain) | `src/stores/settings-store.ts` |
| Composable entries | `groupId` links records across tables atomically | `composable-entry-service.ts` |
| IDs | `Date.now()-random` format (not UUID) | `src/lib/utils.ts` |

---

## Recommended Architecture (Target)

```
+--------------------------+
|       React UI           |
|  (shadcn/ui + Tailwind)  |
+---------+----------------+
          |
+---------v----------------+     +--------------------+
|  useLiveQuery hooks      |     | useMutation hooks  |
|  (dexie-react-hooks)     |     | (React Query)      |
|  (reads still from IDB)  |     | (writes still to   |
|                          |     |  service layer)    |
+---------+----------------+     +--------+-----------+
          |                               |
+---------v-------------------------------v-----------+
|        Service Layer (src/lib/*-service.ts)          |
|  MODIFIED: writes to Dexie AND marks dirty          |
|  Adds updatedAt per-field timestamps on mutations   |
+----+------------------------------------------+-----+
     |                                          |
+----v------------------+    +---------NEW------v-----+
| Dexie.js (db.ts)      |    | Sync Engine            |
| 16 tables, schema v16 |<-->| (src/lib/sync-engine.ts|
| IndexedDB             |    |  + sync-queue)         |
| + _syncMeta table     |    +----------+-------------+
+------------------------+               |
                                         |
                          +--------------v------------+
                          |  Sync API Routes          |
                          |  /api/sync/push           |
                          |  /api/sync/pull           |
                          |  /api/sync/status         |
                          +----------+----------------+
                                     |
                          +----------v----------------+
                          | Neon Postgres             |
                          | (ALL data tables +        |
                          |  push tables +            |
                          |  neon_auth schema)        |
                          +---------------------------+

Auth (replaces Privy):
+--------------------------+
| Neon Auth (Better Auth)  |
| /api/auth/[...path]     |
| NeonAuthProvider         |
| auth.getSession()        |
+--------------------------+
```

---

## Component-by-Component Change Analysis

### Components That Stay Unchanged

| Component | Why It Stays |
|-----------|-------------|
| React UI components (`src/components/`) | UI reads from hooks, writes through hooks. Data source is abstracted. |
| `useLiveQuery` pattern in hook files | Dexie remains the local read source. Reactivity pattern is unaffected. |
| Service worker (push notifications) | Push event handling stays. SW does not interact with data sync. |
| Zustand settings store | Stays in localStorage. Settings are UI preferences, not health data. Settings sync is a separate concern (can sync a `user_settings` table later). |
| shadcn/ui + Tailwind styling | Zero data layer coupling. |
| AI API routes (`/api/ai/*`) | Already server-side. Auth middleware swap is the only change. |

### Components That Get Modified

#### 1. Service Layer (`src/lib/*-service.ts`) -- CRITICAL CHANGE

**Current:** Services write directly to Dexie and return.
**Target:** Services write to Dexie, then enqueue a sync operation.

The key insight: **services remain the write entry point**. The change is minimal -- after every Dexie write, the sync queue is notified.

```typescript
// BEFORE (intake-service.ts)
export async function addIntakeRecord(...): Promise<ServiceResult<IntakeRecord>> {
  const record: IntakeRecord = { id: generateId(), ...syncFields() };
  await db.intakeRecords.add(record);
  return ok(record);
}

// AFTER (intake-service.ts)
export async function addIntakeRecord(...): Promise<ServiceResult<IntakeRecord>> {
  const record: IntakeRecord = { id: generateId(), ...syncFields() };
  await db.intakeRecords.add(record);
  syncQueue.enqueue('intakeRecords', record.id, 'create');
  return ok(record);
}
```

**Impact:** Every `*-service.ts` file gains a `syncQueue.enqueue()` call after write operations. The number of affected service files: ~15.

**Field-level timestamps:** For per-field merge conflict resolution, the `updatedAt` on the record level is insufficient. Each mutable field needs its own timestamp. This is handled at the Postgres schema level (not in Dexie -- Dexie keeps current `updatedAt` for simplicity). The sync engine compares field timestamps during merge.

#### 2. Database Schema (`src/lib/db.ts`) -- MODERATE CHANGE

**New Dexie version (v16):**
- Add `_syncMeta` table to track per-record sync status
- Add `syncVersion` field for vector clock / sequence tracking
- **No structural changes to existing 16 tables** -- the current `createdAt`/`updatedAt`/`deletedAt`/`deviceId` fields are already sync-ready (this was designed from v10)

```typescript
// New table in Dexie v16
interface SyncMeta {
  id: string;           // composite: "tableName:recordId"
  tableName: string;
  recordId: string;
  status: 'clean' | 'dirty' | 'pending' | 'conflict';
  lastSyncedAt: number; // timestamp of last successful sync
  syncVersion: number;  // monotonic sequence for ordering
}

db.version(16).stores({
  // ... all existing v15 stores unchanged ...
  _syncMeta: "id, tableName, status, lastSyncedAt",
});
```

#### 3. Provider Stack (`src/app/providers.tsx`) -- SIGNIFICANT CHANGE

**Current:** `ErrorBoundary > QueryClientProvider > ThemeProvider > PrivyProvider > PinGateProvider > TimezoneGuard`

**Target:** `ErrorBoundary > QueryClientProvider > ThemeProvider > NeonAuthProvider > SyncProvider > TimezoneGuard`

Changes:
- **Remove:** `PrivyProvider`, `PrivyProviderWithTheme`, `PinGateProvider`
- **Add:** `NeonAuthProvider` (wraps Neon Auth client context)
- **Add:** `SyncProvider` (manages sync engine lifecycle, online/offline state)
- **PinGateProvider removal:** PIN gate is eliminated entirely (Neon Auth handles access control)

```typescript
// Target providers.tsx
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NeonAuthProvider>
            <SyncProvider>
              <TimezoneGuard>{children}</TimezoneGuard>
            </SyncProvider>
          </NeonAuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
```

#### 4. Auth Middleware (`src/lib/auth-middleware.ts` + `src/lib/privy-server.ts`) -- REPLACE

**Current:** `withAuth()` verifies Privy JWT via `@privy-io/server-auth`, checks email whitelist.

**Target:** `withAuth()` calls `auth.getSession()` from `@neondatabase/auth/next/server`. Session is cookie-based (not Bearer token).

```typescript
// New auth-middleware.ts
import { auth } from '@/lib/auth/server';

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const { data: session } = await auth.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", requiresAuth: true },
        { status: 401 }
      );
    }

    return handler({ request, auth: {
      success: true,
      userId: session.user.id,
      email: session.user.email,
    }});
  };
}
```

**Files affected:**
- `src/lib/auth-middleware.ts` -- rewrite
- `src/lib/privy-server.ts` -- delete entirely
- `src/hooks/use-pin-gate.tsx` -- delete entirely
- `src/lib/pin-service.ts` -- delete entirely
- `src/components/pin-dialog.tsx` -- delete entirely

#### 5. Push Notification DB (`src/lib/push-db.ts`) -- MODERATE CHANGE

**Current:** Uses `@neondatabase/serverless` with raw SQL against 4 push tables.

**Target:** Same 4 push tables stay, but `user_id` column values change from Privy user IDs to Neon Auth user IDs. Needs a one-time migration of `user_id` values.

The push-db.ts code itself needs minimal changes -- the SQL queries are parameterized by `userId` already. The change is the ID format flowing in from the new auth middleware.

#### 6. ID Generation (`src/lib/utils.ts`) -- CONSIDER CHANGING

**Current:** `Date.now()-random7chars` format (e.g., `1712345678901-abc1234`).

**Decision needed:** These IDs work fine for sync (they are unique per-device). However, for the Postgres schema, UUIDs are conventional. Two options:
- **Option A (recommended):** Keep existing IDs as-is. They are already unique, sortable, and embedded in all production data. The Postgres `id` column is `TEXT PRIMARY KEY`.
- **Option B:** Switch to `crypto.randomUUID()` for new records going forward. Old records keep their format. Postgres accepts both.

**Recommendation:** Option A. Changing ID format mid-stream creates unnecessary complexity. The current format is functionally equivalent to a ULID (time-sortable + random suffix).

---

## New Components

### 1. Sync Engine (`src/lib/sync-engine.ts`) -- CORE NEW COMPONENT

The sync engine is the most architecturally significant new piece. It sits between the service layer and the server.

**Responsibilities:**
- Track dirty records via `_syncMeta` table
- Batch push dirty records to server
- Pull remote changes and apply to Dexie
- Handle per-field timestamp merge on conflicts
- Manage online/offline state transitions
- Retry failed syncs with exponential backoff

**Architecture:**

```
+------------------+
| SyncEngine       |
|                  |
| - syncQueue      |  <-- Enqueued by service layer after writes
| - pushWorker     |  <-- Batches dirty records, POSTs to /api/sync/push
| - pullWorker     |  <-- Periodically GETs /api/sync/pull?since=<cursor>
| - conflictMerger |  <-- Per-field LWW merge
| - stateManager   |  <-- online/offline/syncing/error states
+------------------+
```

**Sync protocol (pull):**
```
Client: GET /api/sync/pull?since=1712345678901&tables=intakeRecords,weightRecords,...
Server: { changes: [...], cursor: 1712345999000, hasMore: false }
```

**Sync protocol (push):**
```
Client: POST /api/sync/push
Body: { changes: [{ table, id, data, updatedAt, fieldTimestamps }] }
Server: { accepted: [...], conflicts: [...], rejected: [...] }
```

**Per-field timestamp merge:**

For conflict resolution, the server maintains a JSONB column `field_timestamps` on each row. When client and server both modified the same record, the merge function compares timestamps per-field:

```typescript
// Server-side merge (in /api/sync/push handler)
function mergeRecord(
  serverRow: Record<string, unknown>,
  serverFieldTs: Record<string, number>,
  clientData: Record<string, unknown>,
  clientFieldTs: Record<string, number>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...serverRow };
  for (const [field, clientTs] of Object.entries(clientFieldTs)) {
    const serverTs = serverFieldTs[field] ?? 0;
    if (clientTs > serverTs) {
      merged[field] = clientData[field];
    }
  }
  return merged;
}
```

### 2. Neon Auth Client (`src/lib/auth/server.ts` + `src/lib/auth/client.ts`)

**Server (`src/lib/auth/server.ts`):**
```typescript
import { createNeonAuth } from '@neondatabase/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
```

**Client (`src/lib/auth/client.ts`):**
```typescript
'use client';
import { createAuthClient } from '@neondatabase/auth/next';
export const authClient = createAuthClient();
```

**Auth API route (`src/app/api/auth/[...path]/route.ts`):**
```typescript
import { auth } from '@/lib/auth/server';
export const { GET, POST } = auth.handler();
```

### 3. Sync API Routes

Three new API routes handle the sync protocol:

**`/api/sync/push` (POST)** -- Receives batched changes from client
- Authenticates via `auth.getSession()`
- Validates payload (table name, record structure)
- For each change: check server `updatedAt` vs client `updatedAt`
  - No conflict: upsert to Postgres
  - Conflict: per-field merge, return merged result
- Returns accepted/conflict/rejected arrays

**`/api/sync/pull` (GET)** -- Returns changes since cursor
- Authenticates via `auth.getSession()`
- Queries Postgres for records where `updated_at > cursor`
- Returns paginated results with next cursor
- Single-user app means no row-level security needed beyond auth check

**`/api/sync/status` (GET)** -- Health check
- Returns sync state, last sync time, pending changes count

### 4. NeonDB Schema (`src/db/schema.ts` -- NEW, Drizzle ORM)

The Postgres schema mirrors all 16 Dexie tables. Each table gets:
- Same columns as the Dexie interface
- `id TEXT PRIMARY KEY` (keeps existing ID format)
- `field_timestamps JSONB` -- per-field update timestamps for merge
- `user_id TEXT NOT NULL REFERENCES neon_auth.user(id)` -- ties data to auth user
- Standard Postgres indexes mirroring Dexie compound indexes

```typescript
// Example: intake_records table in Drizzle
export const intakeRecords = pgTable('intake_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => neonAuthUser.id),
  type: text('type').notNull(),           // "water" | "salt"
  amount: integer('amount').notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  source: text('source'),
  note: text('note'),
  groupId: text('group_id'),
  originalInputText: text('original_input_text'),
  groupSource: text('group_source'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  deletedAt: bigint('deleted_at', { mode: 'number' }),
  deviceId: text('device_id').notNull(),
  timezone: text('timezone').notNull(),
  fieldTimestamps: jsonb('field_timestamps').$type<Record<string, number>>(),
});
```

### 5. Data Migration Service (`src/lib/migration-service.ts`)

One-time upload of all IndexedDB data to NeonDB after the user authenticates with Neon Auth for the first time.

**Flow:**
1. User signs in with Neon Auth
2. App checks: does the server have data for this user?
3. If empty: read all 16 Dexie tables, batch-upload to `/api/sync/push`
4. Mark migration as complete in `_syncMeta`
5. Normal bidirectional sync begins

### 6. SyncProvider (`src/providers/sync-provider.tsx`)

React context provider that:
- Initializes the sync engine on mount
- Exposes sync state to UI (`syncing`, `online`, `lastSyncAt`, `pendingCount`)
- Listens to `navigator.onLine` events
- Triggers pull on app focus / online transition
- Provides `forceSync()` for manual trigger from Settings

---

## Data Flow Changes

### Write Path (Before)

```
UI action -> useMutation -> service.add() -> db.table.add() -> Dexie -> done
                                                                  |
                                                          useLiveQuery re-fires
```

### Write Path (After)

```
UI action -> useMutation -> service.add() -> db.table.add() -> Dexie -> done
                                                |                  |
                                                |          useLiveQuery re-fires
                                                v
                                        syncQueue.enqueue()
                                                |
                                    [background, debounced]
                                                |
                                        syncEngine.push()
                                                |
                                        POST /api/sync/push
                                                |
                                        Neon Postgres
```

### Read Path (Unchanged)

```
UI component -> useLiveQuery(service.getX()) -> Dexie -> result
```

Reads always come from Dexie. The sync engine keeps Dexie up-to-date with remote changes via periodic pulls.

### Offline Behavior

```
Online:  write -> Dexie + syncQueue -> push to server (immediate or debounced)
Offline: write -> Dexie + syncQueue -> queued (status: 'dirty')
Reconnect: syncEngine detects online -> flush dirty queue -> pull remote changes
```

---

## Patterns to Follow

### Pattern 1: Local-First Writes with Async Sync

**What:** Every write hits Dexie first, then syncs in the background.
**When:** Always -- this is the fundamental pattern.
**Why:** Zero-latency UI updates. Offline works. Sync failures do not block the user.

### Pattern 2: Per-Field Last-Write-Wins Merge

**What:** When both client and server modified the same record, merge by comparing timestamps on individual fields rather than rejecting the entire record.
**When:** Conflict detected during push.
**Why:** Record-level LWW would lose data (e.g., user edits `note` on phone, `amount` on desktop -- record-level LWW discards one). Field-level LWW preserves both. For a single-user app, conflicts are rare (only phone-while-offline vs desktop), making this the sweet spot between simplicity and correctness.

### Pattern 3: Cursor-Based Pull Sync

**What:** Client stores a cursor (last `updatedAt` timestamp seen from server). Pulls only changes after that cursor.
**When:** Every pull sync (periodic + on-reconnect + on-focus).
**Why:** Efficient -- avoids full table scans. The cursor is a simple `bigint` (Unix ms timestamp), already the format used by all records.

### Pattern 4: Sync-Transparent Hook Layer

**What:** Hooks (`use-*-queries.ts`) do NOT know about sync. They call services, which handle sync enqueuing internally.
**When:** Always.
**Why:** 15 hook files do not need modification. The sync concern is encapsulated in the service layer.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dual-Write at the Hook Layer

**What:** Having hooks write to both Dexie and call a remote API directly.
**Why bad:** 15 hook files each handling online/offline branching. Error-prone, unmaintainable.
**Instead:** Services handle Dexie write + sync enqueue. Hooks call services only.

### Anti-Pattern 2: Server as Source of Truth for Reads

**What:** Fetching from Postgres for UI rendering.
**Why bad:** Requires network for every read. Breaks offline. Adds latency. Negates the local-first architecture.
**Instead:** Always read from Dexie. Sync engine keeps Dexie fresh.

### Anti-Pattern 3: Full Table Sync

**What:** Dumping entire tables on each sync cycle.
**Why bad:** 16 tables x potentially thousands of records. Wasteful bandwidth. Slow.
**Instead:** Cursor-based delta sync with dirty tracking.

### Anti-Pattern 4: Sync in the Service Worker

**What:** Running the sync engine inside the service worker.
**Why bad:** Dexie access from SW is possible but complex (different context, no React state, error handling is harder). The SW currently handles push notifications only.
**Instead:** Sync engine runs in the main thread via SyncProvider. Uses `navigator.onLine` and visibility API for triggers.

---

## Integration Points Summary

| Integration Point | Current | Target | Complexity |
|-------------------|---------|--------|-----------|
| Service layer writes | Direct Dexie | Dexie + sync enqueue | LOW -- add one line per write |
| Hook reads | useLiveQuery | useLiveQuery (unchanged) | NONE |
| Provider stack | Privy + PIN | Neon Auth + Sync | MEDIUM -- structural |
| Auth middleware | Privy JWT | Neon Auth session | MEDIUM -- rewrite |
| Push notifications | Privy userId | Neon Auth userId | LOW -- ID swap |
| Neon Postgres | 4 push tables | ALL tables (16 data + 4 push + 1 sync meta) | HIGH -- schema design |
| Settings sync | N/A (localStorage only) | Consider future `user_settings` table | DEFERRED |
| Backup service | Export/import all 16 tables to JSON | Still works, but becomes secondary to sync | LOW -- keep as-is |

---

## Suggested Build Order

Build order is constrained by dependencies. Each phase should be independently deployable.

### Phase 1: Settings Restructure (No data layer changes)
**Rationale:** Pure UI work with zero risk to data. Ships value independently.
- Expandable accordion sections
- Modals eliminated
- New UI/UX section
- Storage & Security section (placeholder for sync status)

### Phase 2: Neon Auth + Remove Privy
**Rationale:** Auth must be in place before sync API routes can be protected.
- Install `@neondatabase/auth`
- Create `lib/auth/server.ts` + `lib/auth/client.ts`
- Create `/api/auth/[...path]/route.ts`
- Rewrite `auth-middleware.ts`
- Replace PrivyProvider in providers.tsx
- Remove PIN gate entirely
- Delete `privy-server.ts`, `pin-service.ts`, `use-pin-gate.tsx`, `pin-dialog.tsx`
- Remove `@privy-io/react-auth`, `@privy-io/server-auth` from dependencies
- Update E2E tests for new auth flow
- Migrate push `user_id` values

### Phase 3: Postgres Schema + Drizzle Setup
**Rationale:** Schema must exist before sync engine can push to it.
- Install Drizzle ORM + drizzle-kit
- Define all 16 data tables in `src/db/schema.ts`
- Define `field_timestamps` JSONB column
- Define `user_id` foreign key to neon_auth.user
- Run migrations on Neon staging branch
- Keep existing push tables (move under managed migrations)

### Phase 4: Sync Engine Core
**Rationale:** Core sync plumbing -- dirty tracking, push, pull, merge.
- Dexie v16 with `_syncMeta` table
- `sync-engine.ts` -- queue, push worker, pull worker
- `sync-queue.ts` -- enqueue/dequeue with debounce
- `/api/sync/push` and `/api/sync/pull` routes
- Per-field LWW merge on server
- SyncProvider for lifecycle management
- Online/offline state handling

### Phase 5: Service Layer Integration
**Rationale:** Wire sync into existing writes.
- Add `syncQueue.enqueue()` to all service write operations
- Test: write offline, reconnect, verify sync
- Test: concurrent edits, verify per-field merge

### Phase 6: One-Time Data Migration
**Rationale:** Ship last -- the migration only runs once per user.
- `migration-service.ts` -- reads all Dexie data, batch-pushes to server
- Migration status tracking in `_syncMeta`
- Progress UI in Settings
- Rollback capability (can re-run migration)

---

## Scalability Considerations

| Concern | Current (single device) | After sync (phone + desktop) | Future (if multi-user ever) |
|---------|------------------------|------------------------------|---------------------------|
| Data volume | ~1K records typical | Same total, split across devices | Would need RLS policies |
| Conflict frequency | Zero | Very low (single user, sequential usage pattern) | Would need CRDT or OT |
| Sync latency | N/A | Acceptable at 1-5s debounce + pull interval | Would need WebSocket/SSE |
| Storage | IndexedDB only | IndexedDB + Neon Postgres | Same |
| Auth | Privy JWT | Neon Auth session cookies | Neon Auth scales to multi-user |

## Environment Variables (New)

| Variable | Purpose | Where |
|----------|---------|-------|
| `NEON_AUTH_BASE_URL` | Neon Auth API endpoint | `.env.local`, Vercel |
| `NEON_AUTH_COOKIE_SECRET` | Session cookie encryption | `.env.local`, Vercel |
| `DATABASE_URL` | Neon pooled connection (already exists for push) | Already configured |

**Removed:**
| Variable | Reason |
|----------|--------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy removed |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Privy removed |
| `PRIVY_APP_SECRET` | Privy removed |
| `ALLOWED_EMAILS` | Replaced by Neon Auth user management |
| `ALLOWED_WALLETS` | Privy wallet feature removed |

## Sources

- [Neon Auth Overview](https://neon.com/docs/auth/overview) -- Architecture, neon_auth schema, RLS integration
- [Neon Auth + Next.js Quick Start](https://neon.com/docs/auth/quick-start/nextjs) -- Setup guide, session access
- [Neon Auth Next.js API-Only](https://neon.com/docs/auth/quick-start/nextjs-api-only) -- API route protection
- [Neon Auth + Next.js Guide](https://neon.com/guides/neon-auth-nextjs) -- Full file structure, Drizzle integration
- [Drizzle ORM + Neon Postgres](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) -- Schema setup, migrations
- [Neon Schema Migrations with Drizzle](https://neon.com/docs/guides/drizzle-migrations) -- Migration workflow
- [Offline Sync & Conflict Resolution Patterns (Apr 2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) -- Per-field LWW patterns
- [Building Offline-First Sync Engine (DEV Community)](https://dev.to/daliskafroyan/builing-an-offline-first-app-with-build-from-scratch-sync-engine-4a5e) -- Custom sync architecture
- [Dexie.Syncable Documentation](https://dexie.org/docs/Syncable/db.syncable.connect()) -- Dexie sync protocol concepts
