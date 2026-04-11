# Pitfalls Research

**Domain:** Cloud sync, auth migration, and offline-first patterns for existing IndexedDB-based health tracking PWA
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against codebase analysis, official docs, and multiple community sources)

## Critical Pitfalls

### Pitfall 1: Data Loss During One-Time IndexedDB to NeonDB Migration

**What goes wrong:**
The one-time upload of existing IndexedDB data to NeonDB fails silently, partially, or corrupts data. The user has months of health data (water/salt intake, medications, vitals, dose logs across 16 tables) stored only on their phone's browser. A failed migration means permanent data loss with no recovery path.

**Why it happens:**
- IndexedDB `toArray()` on large tables can exceed browser memory limits (especially on mobile Safari which caps at ~1GB)
- Network interruption during a multi-table upload leaves some tables synced and others not
- No transactional guarantee across the full upload -- Postgres commits table by table but IndexedDB reads are separate transactions
- Type mismatches between IndexedDB's loosely-typed records and Postgres's strict schema go undetected until insert failures
- The user has ~16 tables with interrelated records (groupId composable entries, prescriptionId references, inventoryItemId links) -- partial upload breaks referential integrity

**How to avoid:**
- Take a full encrypted backup (existing `backup-service.ts` already supports this) BEFORE starting migration -- make it mandatory, not optional
- Upload in dependency order: prescriptions before medicationPhases before phaseSchedules before doseLogs before inventoryTransactions
- Use cursor-based iteration over IndexedDB tables instead of `toArray()` for tables that could grow large
- Batch uploads in chunks of 100-500 records per API call to prevent timeout and memory issues
- Implement a migration state machine: NOT_STARTED -> BACKING_UP -> UPLOADING(table, progress) -> VERIFYING -> COMPLETE
- After upload, verify row counts per table match between IndexedDB and NeonDB before marking migration complete
- Keep IndexedDB data intact for 30 days after successful migration as a safety net

**Warning signs:**
- Migration progress bar stalls on a specific table
- Browser memory usage spikes during migration (check via `performance.memory` if available)
- Network errors in console during upload
- Post-migration dashboard shows different totals than pre-migration

**Phase to address:**
Data Migration phase -- this should be its own dedicated phase, not bundled with sync engine work

---

### Pitfall 2: Auth Session Gap During Privy to Neon Auth Cutover

**What goes wrong:**
During the transition from Privy to Neon Auth, users experience either: (a) being locked out of their app entirely, (b) losing their session and needing to re-authenticate at an inconvenient time (medication tracking is time-sensitive), or (c) API routes rejecting valid requests because the auth verification layer doesn't recognize the new token format.

**Why it happens:**
- Privy uses JWT tokens verified via `@privy-io/server-auth` with `verifyAuthToken()` + `getUser()` -- completely different from Better Auth's cookie-based session system
- The current `auth-middleware.ts` wraps all API routes with `withAuth()` which calls `verifyAndCheckWhitelist()` from `privy-server.ts` -- every API route breaks simultaneously when Privy is removed
- The current `AuthGuard` component and `useAuth` hook are tightly coupled to Privy's `usePrivy()` hook -- conditional export based on `NEXT_PUBLIC_PRIVY_APP_ID` env var
- E2E tests authenticate via Privy test account (PRIVY_TEST_EMAIL/PRIVY_TEST_OTP) -- all 22 tests break
- Push notification system uses Privy userId for push subscription storage (`push_subscriptions.user_id`) -- new auth system generates different user IDs
- Service worker may cache stale auth-related responses, serving old Privy auth pages after migration

**How to avoid:**
- Build a unified auth abstraction layer FIRST: `AuthProvider` interface with `getSession()`, `getUserId()`, `getAuthHeader()`, `isAuthenticated()` methods
- Implement Neon Auth adapter behind the same interface before removing Privy
- Map Privy user IDs to Neon Auth user IDs in the push_subscriptions table (the user's email is the stable identifier across both systems)
- Update `withAuth()` middleware to accept both Privy tokens AND Neon Auth sessions during a transition window
- For this single-user app: the cutover can be atomic (deploy once, old session invalidated, user logs in with new system) because there's only one user to coordinate with
- Update E2E test auth flow to use Neon Auth email/password instead of Privy OTP iframe

**Warning signs:**
- API routes returning 401 after deployment
- Push notifications stopping (user_id mismatch in push_subscriptions)
- Auth-guard showing login screen on pages that were previously accessible
- E2E test suite failing 100% on auth-related flows

**Phase to address:**
Auth Migration phase -- must complete BEFORE sync engine work begins, since sync requires authenticated API calls

---

### Pitfall 3: Sync Conflicts with Timezone-Sensitive Health Data

**What goes wrong:**
Per-field timestamp merge resolution produces incorrect data when the user travels between South Africa (UTC+2) and Germany (UTC+1/UTC+2 DST). Medication dose times shift, daily budget windows miscalculate, and "today's" data blurs across timezone boundaries during sync.

**Why it happens:**
- The current schema stores `timestamp` as Unix ms (timezone-agnostic) but `timezone` as a separate IANA string -- sync must preserve BOTH or lose the user's intent
- `dayStartHour` (currently 2am in Zustand settings) is used to calculate "today" for budget tracking -- if settings sync changes this while offline entries used the old value, budget totals are wrong
- PhaseSchedule stores `scheduleTimeUTC` (minutes from midnight UTC) with `anchorTimezone` -- if a sync conflict resolves to the wrong `scheduleTimeUTC`, medication reminders fire at wrong local times
- DoseLog has both `scheduledDate` (YYYY-MM-DD string) and `scheduledTime` (HH:MM string) plus `timezone` -- these three fields must be atomically consistent, but per-field merge could update one without the others
- PostgreSQL `timestamptz` stores UTC internally but `timestamp without time zone` does not -- using the wrong column type corrupts timezone data

**How to avoid:**
- Store all timestamps in Postgres as `BIGINT` (Unix ms) matching the existing IndexedDB format -- do NOT convert to `timestamptz` because the app already handles timezone via separate `timezone` column
- Define "atomic field groups" that must merge together: `{scheduledDate, scheduledTime, timezone}` on DoseLog, `{scheduleTimeUTC, anchorTimezone}` on PhaseSchedule
- For settings that affect data interpretation (dayStartHour), version them -- include the dayStartHour that was active when a record was created
- Add timezone to every sync conflict resolution comparison -- two records created at the "same time" in different timezones are NOT the same event
- In Postgres schema, add a CHECK constraint ensuring timezone is a valid IANA string, not empty

**Warning signs:**
- Dashboard showing different totals after sync than before
- Medication reminders firing 1 hour off (DST boundary error)
- DoseLog entries appearing on wrong dates after sync
- Budget reset happening at unexpected times

**Phase to address:**
Sync Engine phase -- timezone handling must be designed into the conflict resolution strategy from day one, not patched later

---

### Pitfall 4: IndexedDB Schema and Postgres Schema Drifting Apart

**What goes wrong:**
Over time, the Dexie schema (which defines IndexedDB object stores and indexes) and the Postgres schema (which defines tables, columns, types, and constraints) diverge. New fields get added to one but not the other. A Dexie migration runs client-side but the corresponding Postgres migration doesn't exist, or vice versa. The sync engine silently drops fields it doesn't recognize.

**Why it happens:**
- Dexie migrations are client-side JavaScript (in `db.ts`, currently v10-v15) while Postgres migrations are server-side SQL (Drizzle Kit) -- they're developed independently with no validation that they match
- IndexedDB is schema-less for non-indexed fields -- you can store any properties on a record without declaring them. Postgres requires explicit column definitions. This asymmetry means IndexedDB naturally accumulates undeclared fields (like `originalInputText`, `groupSource`) that may not exist in Postgres
- The codebase has 16 tables with ~150+ fields total -- manual tracking of schema parity is error-prone
- Dexie `db.version(N)` only declares indexes, not the full field set -- there's no Dexie-side enforcement that a record matches a TypeScript interface

**How to avoid:**
- Create a SINGLE TypeScript source of truth for all record shapes -- the existing interfaces in `db.ts` (IntakeRecord, WeightRecord, etc.) should generate BOTH Dexie store definitions AND Drizzle/Postgres schema
- Add a CI test (extending the existing `schema-consistency.test.ts`) that compares Dexie store field lists against Postgres column definitions and fails on mismatch
- When adding a field: always add to TypeScript interface -> regenerate both schemas -> write both migrations
- The sync engine should have a schema version handshake: client sends its schema version, server rejects if incompatible, forcing app update

**Warning signs:**
- Sync engine logs "unknown field" warnings
- Records synced from server missing fields when displayed in UI
- Records synced from client causing Postgres INSERT errors (column does not exist)
- TypeScript compiles clean but runtime data has mismatched shapes

**Phase to address:**
Database Schema Design phase (Neon DB reset and fresh schema design) -- establish the single source of truth before building the sync engine

---

### Pitfall 5: useLiveQuery Reactivity Breaking During Sync Engine Migration

**What goes wrong:**
The app currently uses Dexie's `useLiveQuery` (71 occurrences across 15 files) for reactive data binding -- IndexedDB changes automatically re-render components. When introducing a sync layer that writes to IndexedDB from background sync responses, `useLiveQuery` either fires too frequently (causing performance issues from constant re-renders during bulk sync) or doesn't fire at all (because writes bypass Dexie's observable transaction tracking).

**Why it happens:**
- `useLiveQuery` subscribes to Dexie transactions that touch specific tables -- a background sync writing 500 records to `intakeRecords` triggers 500 re-renders of every component watching that table
- If the sync engine writes directly to IndexedDB (bypassing Dexie), `useLiveQuery` won't detect the changes at all
- React Query (used alongside useLiveQuery for some operations) has its own cache that won't invalidate when background sync writes to IndexedDB
- The existing `staleTime: 1000 * 60` (1 minute) in QueryClient config means React Query cache can be stale relative to a sync that just completed

**How to avoid:**
- All writes to IndexedDB MUST go through Dexie's API (never raw IndexedDB transactions) to maintain observable chain
- Batch sync writes inside a single Dexie transaction: `db.transaction('rw', [db.intakeRecords, ...], async () => { /* bulk put */ })` -- this triggers ONE useLiveQuery update instead of N
- Add a "syncing" state that components can check to debounce renders during bulk sync
- After sync completes, invalidate all React Query caches: `queryClient.invalidateQueries()` as a single flush
- Consider migrating from `useLiveQuery` to React Query exclusively (reading from Dexie inside query functions) -- this gives you cache control and prevents the double-reactivity problem

**Warning signs:**
- UI freezing or janking during background sync
- Dashboard showing stale data until manual refresh after sync
- React DevTools showing excessive re-renders on components watching synced tables
- Memory usage climbing during sync as React processes a queue of pending re-renders

**Phase to address:**
Sync Engine phase -- the data access pattern change should be designed alongside the sync protocol

---

### Pitfall 6: Offline Queue Growing Unbounded When Connection is Unreliable

**What goes wrong:**
The user is on a flight, in a tunnel, or on South African mobile data with intermittent connectivity. They continue using the app normally -- logging water, salt, medication doses, meals. The offline queue of pending mutations grows. When connectivity returns, the sync engine tries to flush everything at once, either: (a) exceeding the Vercel function timeout (10s hobby, 60s pro), (b) triggering rate limits on Neon's connection pooler, or (c) creating a thundering herd of conflict resolution computations.

**Why it happens:**
- Health tracking apps have continuous small writes (water +250ml, log dose, record BP) -- 50+ writes per day is normal
- Multi-day offline periods during travel are realistic for this user (SA <-> Germany flights are 11+ hours)
- Vercel serverless functions have hard timeout limits -- a sync flush of 500+ pending mutations cannot complete in one request
- Neon's serverless driver (`@neondatabase/serverless`) uses HTTP-based connections which have per-request overhead -- batching matters
- No backpressure mechanism means the queue keeps growing without user awareness

**How to avoid:**
- Cap offline queue at a reasonable maximum (e.g., 2000 mutations) with user notification when approaching limit
- Flush in batches: 50-100 mutations per sync request, with exponential backoff on failures
- Show sync status in the UI (pending count, last synced timestamp) -- the planned "Storage & Security" settings section is the right place
- Prioritize mutation types: dose logs and medication changes first (time-critical), water/salt entries second
- Implement a "sync in progress" lock to prevent concurrent flush attempts from multiple tabs or service worker wake-ups
- Use optimistic UI: show local data immediately, sync in background, show success/failure indicators per-record

**Warning signs:**
- Sync status showing "pending: 500+" after a period offline
- Vercel function logs showing timeout errors on sync endpoint
- Neon connection pooler returning "too many connections" errors
- Client-side IndexedDB storage growing unusually large

**Phase to address:**
Sync Engine phase -- queue management and batch flushing are core sync engine concerns

---

### Pitfall 7: Service Worker Caching Stale Auth State and API Responses

**What goes wrong:**
The existing Workbox-based service worker (`sw.js`) caches API responses, HTML pages, and static assets aggressively. After switching from Privy to Neon Auth: (a) cached auth-related pages serve stale Privy login UI, (b) cached API responses include old auth tokens in headers, (c) the service worker intercepts auth redirects and serves cached 200 responses instead, (d) the user sees a blank screen or "authenticated as wrong user" after clearing cookies but not the SW cache.

**Why it happens:**
- The current SW configuration caches "others" (non-API pages) with NetworkFirst + 32 entry cache and "apis" (GET API routes) with NetworkFirst + 16 entry cache
- Auth-related redirects (3xx) are converted to 200 by the SW: `cacheWillUpdate: s && "opaqueredirect" === s.type ? new Response(s.body, {status: 200, ...})` -- this masks auth redirects
- The SW caches `/api/*` routes except `/api/auth/` -- but Neon Auth may use a different path pattern (e.g., `/api/auth/[...path]`) that needs explicit exclusion
- Stale JS bundles cached by the SW may contain old Privy SDK code that throws errors when Privy env vars are removed

**How to avoid:**
- Add explicit SW cache exclusion for ALL auth-related paths (both old Privy paths and new Neon Auth paths): `/api/auth/*`, `/auth/*`
- On auth state change (login/logout), clear the SW cache programmatically: `caches.keys().then(keys => keys.forEach(key => caches.delete(key)))`
- Remove the `opaqueredirect` -> 200 conversion from the start-url cache plugin -- it masks critical auth redirects
- Version the SW on every auth-system change deployment to force SW update and cache invalidation
- Add `skipWaiting()` + `clientsClaim()` (already present) but ALSO send a `postMessage` to all clients when SW activates, triggering a page reload to clear stale React state

**Warning signs:**
- User sees old login page after deployment
- Browser DevTools > Application > Cache Storage shows auth-related entries
- Service Worker scope includes auth routes
- "Network error" in console when auth redirect is intercepted by SW

**Phase to address:**
Auth Migration phase -- SW cache strategy must be updated BEFORE the auth switch, not after

---

### Pitfall 8: Neon Auth Beta Limitations Blocking Required Features

**What goes wrong:**
Neon Auth is currently in beta and missing features the app may need. Development proceeds assuming features are available, then hits a wall mid-implementation when discovering a limitation that requires architectural rework.

**Why it happens:**
- Neon Auth does not yet support separate frontend/backend architectures -- "Architectures where frontend and backend are separate deployments are not yet supported" because HTTP-only cookies cannot share across domains
- MFA is "in development" but not available yet -- if the PIN gate removal relies on MFA as a replacement security layer, that plan fails
- Magic link auth is "coming soon" -- if the migration plan assumes magic link for password-free onboarding, it won't work yet
- The Organization plugin is only partially supported
- Neon Auth requires AWS regions only -- Azure not yet available
- Neon Auth doesn't support projects with IP Allow or Private Networking enabled
- Better Auth parity gaps: custom plugins, hooks, and advanced configuration not available in the managed Neon Auth service

**How to avoid:**
- Verify EVERY Neon Auth feature you plan to use is currently available (not just on the roadmap) before committing to the architecture
- For this app: email/password login + Google OAuth are both supported today -- these cover the current Privy login methods (email, Google)
- Accept that PIN gate removal means losing that security layer entirely (no MFA replacement available yet) -- assess if this is acceptable for a single-user health app
- Test Neon Auth integration in a branch deployment EARLY in the milestone, before building the sync engine on top of it
- Have a fallback plan: if Neon Auth limitations are blocking, self-hosted Better Auth is an alternative (more work but full feature access)

**Warning signs:**
- Neon Auth docs page shows "Coming soon" for a feature you assumed was available
- Auth-related API calls failing with unexpected errors not covered in docs
- Cookie-based sessions not persisting across page loads (potential framework compatibility issue)

**Phase to address:**
Auth Migration phase -- validate Neon Auth capabilities as the FIRST task, before writing any auth migration code

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep both Privy and Neon Auth code paths permanently | Avoids big-bang migration | Doubles auth maintenance surface, two sets of env vars, confusing for future development | Never -- single-user app should do atomic cutover |
| Store settings in both Zustand/localStorage AND NeonDB | Works offline and online | Two sources of truth for settings means conflicts (dayStartHour changed offline vs online) | During transition only -- migrate settings to NeonDB within one release cycle |
| Skip schema validation CI test | Faster to ship features | Schema drift accumulates silently until a sync failure in production | Never -- this test is cheap to write and prevents expensive production bugs |
| Use `toArray()` for migration instead of cursors | Simpler code, works for small datasets | Memory crash on mobile with large datasets | Only if migration is guaranteed <1000 records per table |
| Write sync engine without batch transaction support | Simpler initial implementation | Performance degrades linearly with offline duration, useLiveQuery thrashing | Never -- batch from the start, retrofitting is painful |
| Skip offline queue size monitoring | Less UI to build | User discovers queue overflow only when sync fails catastrophically | Never -- even a simple "last synced: 5 min ago" is sufficient |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Neon Auth + Next.js 14 | Relying solely on middleware for auth protection (CVE-2025-29927 bypass via `x-middleware-subrequest` header) | Verify auth in every server action AND middleware. Use Data Access Layer pattern. Upgrade Next.js to 14.2.25+ |
| Neon Auth + Drizzle | Not including `neon_auth` in drizzle.config `schemaFilter` -- foreign key references to auth tables fail | Always set `schemaFilter: ['public', 'neon_auth']` in drizzle.config |
| Neon Auth + Drizzle | `drizzle-kit pull` generates migration wrapped in block comments causing `unterminated /* comment` error | Manually fix generated migration files -- replace block comments with line comments |
| Neon Auth + Production | Forgetting to add production URLs to "Trusted domains" in Neon Auth settings | Add ALL deployment URLs (production + staging + preview) to trusted domains before deploying auth changes |
| Vercel Cron + Hobby plan | Configuring cron more frequently than daily -- deployment fails silently | Verify plan supports desired frequency. For push notifications (needs minute-level), Pro plan required |
| Vercel Cron + Concurrency | Cron job running longer than interval between invocations causing duplicate processing | Implement Redis lock or idempotency keys. Push notification sent_log already has unique constraint -- good |
| Vercel Cron + Timezone | Cron expressions are ALWAYS UTC -- forgetting this when scheduling SA/Germany notifications | Calculate cron times in UTC. The existing push_dose_schedules already stores time_slot in local time -- the cron endpoint needs to convert |
| Vercel Cron + Idempotency | Vercel can deliver the same cron event more than once, causing duplicate notifications | Design all cron handlers to be idempotent. The existing `push_sent_log` with unique constraint on `(user_id, time_slot, sent_date, follow_up_index)` already handles this |
| Vercel Cron + No retry | Vercel does NOT retry failed cron invocations | Build retry logic into the cron handler itself, or accept that a single missed poll is acceptable for push notifications (next cron interval catches it) |
| Neon serverless driver | Creating new `neon()` connection on every request instead of reusing | Current `push-db.ts` already does this (new connection per call) -- acceptable for serverless, but sync endpoint with batched writes should pool within a single request |
| Dexie + background sync writes | Writing to IndexedDB via raw IDB API instead of Dexie, breaking `useLiveQuery` reactivity | ALL writes must go through Dexie's API. Even sync-from-server writes must use `db.table.bulkPut()` |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Syncing all 16 tables on every sync cycle | Sync takes 10+ seconds, blocks UI | Sync only tables with changes since last sync (use `updatedAt` index) | >500 total records |
| Per-record API calls during sync | N+1 query problem, Vercel function timeout | Batch upserts: single API call with array of records per table | >50 pending mutations |
| Full table scan for conflict detection | Sync latency grows linearly with data volume | Use `updatedAt > lastSyncTimestamp` index on both IndexedDB and Postgres | >1000 records per table |
| useLiveQuery re-renders during bulk sync writes | UI freezes, high CPU usage | Wrap sync writes in single Dexie transaction per table, debounce React renders | >20 records written in <1 second |
| Storing all audit logs in sync scope | Audit log table grows fastest (every action logged), bloats sync | Exclude audit logs from bidirectional sync -- push-only to server, never pull back | >5000 audit log entries |
| Fetching full records for conflict check when only timestamps needed | Excessive data transfer on mobile | First pass: compare (id, updatedAt) tuples. Second pass: fetch full records only for conflicts | >200 records needing comparison |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sending health data (medication names, dosages, conditions) in plaintext sync payloads | PHI exposure if HTTPS is somehow compromised or logged by intermediaries | Use TLS (already guaranteed by Vercel/Neon) + do NOT log sync payloads in Vercel function logs. The existing PII stripping pattern from AI routes should extend to sync endpoints |
| Neon Auth cookie secret too short or predictable | Session hijacking -- attacker forges auth cookies | Use `openssl rand -base64 32` (minimum 32 chars). Store in Vercel env vars, not in code |
| Not rotating CRON_SECRET when credentials are exposed | Anyone can trigger push notification cron endpoint, spamming the user | Use Vercel's built-in CRON_SECRET verification. Rotate on any suspected exposure |
| Keeping Privy env vars after migration | Stale API keys sitting in Vercel env vars, potential billing if Privy charges for API calls | Remove ALL Privy env vars (NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET, NEXT_PUBLIC_PRIVY_CLIENT_ID, ALLOWED_EMAILS, ALLOWED_WALLETS) after successful migration |
| IndexedDB data remaining unencrypted after cloud sync is live | Device theft exposes all health data locally even though cloud data is protected by auth | Consider encrypting IndexedDB at rest (the app already has `crypto.ts` with encrypt/decrypt) -- or accept the risk since the phone itself should have device encryption |
| push_subscriptions.user_id not migrated to new auth system | Push notifications stop working because user_id from Privy doesn't match Neon Auth user_id | Migrate push_subscriptions.user_id as part of auth cutover. Use email as the stable lookup key |
| Sync API endpoint not requiring authentication | Anyone who discovers the endpoint could read/write health data | Every sync endpoint must use the new `withAuth()` middleware wrapping Neon Auth session verification |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blocking UI during sync | User can't log a dose while waiting for sync -- medication timing is critical | Local-first writes with background sync. NEVER block the UI for sync operations |
| No sync status indicator | User doesn't know if their data is backed up, anxiety about data loss | Show subtle sync indicator: green checkmark (synced), orange spinner (syncing), red warning (sync failed) |
| Forced re-authentication during medication logging | User is logging a time-sensitive dose and gets bounced to login screen | Ensure auth session lasts at least 30 days for this single-user app. Use refresh tokens aggressively |
| Migration wizard that can't be resumed | User's phone dies mid-migration, must start over -- and original data may be corrupted | Save migration progress to localStorage. Resume from last successful table on next app open |
| Settings changes not syncing obviously | User changes dayStartHour on phone, sees old value elsewhere | Show "syncing settings..." indicator when settings change. Confirm sync before navigating away |
| Conflict resolution UI for single-user app | Showing merge dialogs for conflicts that the single user created themselves is confusing | Use last-write-wins for most fields. Only surface conflicts for critical data: medication changes, dose log status changes |
| Offline mode indistinguishable from online mode | User doesn't know if they're working with fresh or stale data | Show subtle offline indicator. Clearly communicate when viewing potentially stale data |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Sync Engine:** Records sync correctly -- verify that soft-deleted records (`deletedAt !== null`) also sync and remain deleted on both sides
- [ ] **Sync Engine:** Basic sync works -- verify that composable entry groups (records sharing a `groupId`) sync atomically, not partially
- [ ] **Auth Migration:** Login works -- verify that the `useAuth` hook export in `auth-guard.tsx` (which has a compile-time conditional) is updated for Neon Auth
- [ ] **Auth Migration:** Auth works in browser -- verify service worker doesn't cache stale auth pages (test: clear cookies, reload, should see login not cached dashboard)
- [ ] **Auth Migration:** Server-side auth works -- verify EVERY API route's `withAuth()` wrapper works with Neon Auth sessions, not just one test route
- [ ] **Data Migration:** Records uploaded -- verify that `inventoryTransactions` with `doseLogId` references still point to valid `doseLogs` entries in Postgres
- [ ] **Data Migration:** Migration complete -- verify that `phaseSchedules.scheduleTimeUTC` and `phaseSchedules.anchorTimezone` are consistent in Postgres (these were backfilled in Dexie v11 migration)
- [ ] **Data Migration:** All fields present -- verify non-indexed fields like `originalInputText`, `groupSource`, `visualIdentification` made it to Postgres (these exist in IDB but are not declared in Dexie store definitions)
- [ ] **Push Notifications:** Cron fires -- verify that `push_subscriptions.user_id` uses the NEW Neon Auth user ID, not the old Privy DID
- [ ] **Push Notifications:** Notifications arrive -- verify Vercel cron is on Pro plan (Hobby only allows daily, push notifications need per-minute)
- [ ] **Settings Sync:** Settings page works -- verify that Zustand localStorage settings are migrated to NeonDB and localStorage is cleaned up
- [ ] **Settings Sync:** Theme persists -- verify that `theme` preference works during offline periods (needs to remain in localStorage or equivalent for instant apply)
- [ ] **Offline Mode:** App works offline -- verify that the new Neon Auth flow gracefully handles offline state (no auth redirect when offline, use cached session)
- [ ] **Offline Mode:** Offline writes sync -- verify mutations made while offline actually upload when connectivity returns (not just display locally)
- [ ] **E2E Tests:** All 22 tests pass -- verify Privy OTP iframe auth flow in tests is replaced with Neon Auth email/password flow
- [ ] **Schema Parity:** CI test validates -- verify Dexie store definitions match Postgres table definitions for all 16 tables

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Data loss during migration | HIGH | Restore from pre-migration backup (encrypted JSON). Re-run migration. If backup was not taken, IndexedDB data may still exist if browser wasn't cleared -- attempt manual export via DevTools console |
| Auth session gap causing lockout | LOW | Deploy fix, user clears browser cache and re-authenticates. Single-user app means no other users affected |
| Schema drift between IDB and Postgres | MEDIUM | Add missing columns to Postgres via migration. Re-sync affected records. Add CI test to prevent recurrence |
| Sync conflict corrupting timezone data | MEDIUM | Query Postgres for records where timezone is empty/null. Backfill using the same `getTimezoneForTimestamp()` logic from Dexie v11 migration. Rewrite affected doseLogs |
| Offline queue overflow | LOW | Flush queue in batches. If queue exceeds IndexedDB quota, oldest non-critical entries (audit logs) can be dropped. Critical entries (dose logs) should never be dropped |
| Service worker serving stale UI | LOW | Force SW update via version bump. User can manually clear site data in browser settings. Consider adding "force refresh" button in settings |
| Push notifications stopping after auth migration | LOW | Update push_subscriptions.user_id in Postgres to new Neon Auth user ID. Re-register push subscription from client |
| useLiveQuery thrashing during sync | MEDIUM | Add transaction batching to sync engine. If already deployed, hotfix by wrapping sync writes in `db.transaction()`. Longer term: migrate to React Query-only reads |
| Neon Auth beta feature missing | MEDIUM | Fall back to self-hosted Better Auth (same API, full feature set). Requires running Better Auth server-side in the Next.js app instead of delegating to Neon's managed service |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Data loss during migration | Data Migration | Row count comparison test: IDB table count === Postgres table count for all 16 tables. Full backup taken before migration starts |
| Auth session gap | Auth Migration (Neon Auth) | E2E test: full login -> API call -> logout cycle with Neon Auth. Push notification still works after auth switch |
| Timezone sync conflicts | Sync Engine Design | Unit test: create records in Africa/Johannesburg, sync, verify they display correctly when read from Europe/Berlin context |
| Schema drift IDB vs Postgres | Database Schema Design | CI test: TypeScript interfaces match both Dexie store definitions AND Drizzle Postgres schema. Fails on any mismatch |
| useLiveQuery reactivity | Sync Engine | Performance test: sync 200 records, measure re-render count. Should be O(1) per table, not O(N) per record |
| Offline queue overflow | Sync Engine | Integration test: queue 1000 mutations offline, reconnect, verify all sync within 60 seconds in batches without timeout |
| Service worker stale auth | Auth Migration | Manual test: deploy auth change, verify SW updates, verify no cached Privy pages. Automated: E2E test checks no Privy script tags in DOM |
| Settings dual source of truth | Settings Restructure + Sync Engine | Integration test: change dayStartHour, verify it persists after sync cycle. Verify offline changes sync when online |
| Push notification user_id mismatch | Auth Migration | Query test: push_subscriptions.user_id matches Neon Auth user ID. Push notification arrives after auth migration |
| Vercel cron frequency limits | Push Notifications | Deployment test: verify vercel.json cron expression is valid for the deployment plan (Pro required for per-minute) |
| Neon Auth beta limitations | Auth Migration (first task) | Spike: create branch, install Neon Auth, verify email/password + Google OAuth + session persistence all work before committing to full migration |

## Sources

- [Neon Auth Overview](https://neon.com/docs/auth/overview) -- Neon Auth architecture, Better Auth integration, limitations (HIGH confidence)
- [Neon Auth Roadmap](https://neon.com/docs/auth/roadmap) -- Current beta status, missing features: MFA, magic link, separate frontend/backend (HIGH confidence)
- [Neon Auth + Next.js Guide](https://neon.com/guides/neon-auth-nextjs) -- Setup steps, Drizzle migration comment bug, trusted domains requirement (HIGH confidence)
- [Neon Auth Migration Guide](https://neon.com/docs/auth/migrate/from-legacy-auth) -- Schema changes from Stack Auth to Better Auth (MEDIUM confidence)
- [Better Auth + Next.js Integration](https://better-auth.com/docs/integrations/next) -- Session management, middleware pitfalls (MEDIUM confidence)
- [CVE-2025-29927 Next.js Middleware Bypass](https://workos.com/blog/nextjs-app-router-authentication-guide-2026) -- Critical auth middleware bypass (HIGH confidence)
- [Vercel Cron Jobs Docs](https://vercel.com/docs/cron-jobs) -- UTC timezone, no retry on failure, concurrency issues (HIGH confidence)
- [Vercel Cron Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) -- Hobby: daily only with hourly precision, Pro: per-minute (HIGH confidence)
- [Vercel Cron Management](https://vercel.com/docs/cron-jobs/manage-cron-jobs) -- No retry, duplicate delivery possible, idempotency required (HIGH confidence)
- [RxDB Downsides of Offline-First](https://rxdb.info/downsides-of-offline-first.html) -- Storage limits, conflict complexity, schema migration risks, Safari 7-day deletion (HIGH confidence)
- [Dexie.js Sync Discussion #1168](https://github.com/dfahlander/Dexie.js/issues/1168) -- Custom sync protocol challenges with PostgreSQL (MEDIUM confidence)
- [PWA Service Worker Auth Issues](https://github.com/OHIF/Viewers/issues/1691) -- Cache messing with authentication (MEDIUM confidence)
- [Offline Sync Conflict Resolution Patterns](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) -- Per-field timestamp merge tradeoffs (MEDIUM confidence)
- [PostgreSQL Timestamp Best Practices](https://wiki.postgresql.org/wiki/Don't_Do_This) -- timestamptz vs timestamp without time zone (HIGH confidence)
- [Zustand Persist Migration](https://dev.to/diballesteros/how-to-migrate-zustand-local-storage-store-to-a-new-version-njp) -- Version-based localStorage store migration (MEDIUM confidence)
- [Offline-first Frontend Apps in 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) -- IndexedDB limitations, sync patterns (MEDIUM confidence)
- Codebase analysis: `src/lib/db.ts` (16 tables, v10-v15 migrations, 296 lines of schema), `src/lib/privy-server.ts` (Privy auth with whitelist and dev fallback), `src/components/auth-guard.tsx` (conditional useAuth hook export based on env var), `src/lib/auth-middleware.ts` (withAuth wrapper for API routes), `src/lib/push-db.ts` (push subscription schema using user_id), `public/sw.js` (Workbox caching with opaqueredirect conversion), `src/stores/settings-store.ts` (30+ Zustand settings in localStorage), `src/app/providers.tsx` (Privy provider with graceful fallback)

---
*Pitfalls research for: Cloud sync, auth migration, and offline-first patterns for intake-tracker v2.0*
*Researched: 2026-04-11*
