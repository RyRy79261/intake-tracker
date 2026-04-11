# Project Research Summary

**Project:** Intake Tracker v2.0 — Cloud Sync & Auth Migration
**Domain:** Offline-first health tracking PWA with cloud sync, auth migration, and settings overhaul
**Researched:** 2026-04-11
**Confidence:** MEDIUM (sync engine is custom-built; Neon Auth is beta)

## Executive Summary

Intake Tracker v2.0 migrates a fully client-side, IndexedDB-only health tracking PWA to a cloud-backed architecture with offline-first guarantees preserved. The recommended approach is: (1) replace Privy auth with Neon Auth (Better Auth 1.4.18 managed service), (2) add Drizzle ORM + NeonDB schema mirroring all 16 Dexie tables, (3) build a custom sync engine using per-field last-write-wins merge, and (4) execute a one-time guided migration of existing IndexedDB data. All reads continue from IndexedDB — the UI sees zero changes. Sync is a purely additive background concern that layers on top of the existing service layer with a single syncQueue.enqueue() call per write.

The biggest architectural decision is rejecting managed sync solutions (Dexie Cloud, PowerSync, ElectricSQL) in favour of a custom sync engine. This is the right call: the app already has Neon Postgres + all the sync metadata fields (updatedAt, deletedAt, deviceId) on every record since Dexie v10. A custom engine gives full control over per-field merge semantics, stays within the existing auth and database infrastructure, and avoids paying for a second managed service on a single-user app. The tradeoff is implementation effort — custom sync is the highest-risk component of the milestone.

The key risk is the compounding of three simultaneous system boundaries: auth system replacement, database schema creation, and sync engine implementation. These are sequenced dependencies. Neon Auth must be validated first (it is still in beta with known missing features), the Postgres schema must exist before the sync engine can write, and the sync engine must work before the one-time data migration can reuse its upload path. Any phase that fails forces those after it to block. Mitigations: validate Neon Auth capabilities as the first task in a branch deployment; commit to record-level LWW initially and upgrade to per-field merge as a v2.x enhancement; build settings accordion restructure (zero data-layer risk) as Phase 1 to ship value while auth work is de-risked.

## Key Findings

### Recommended Stack

The stack adds three new packages to the existing Next.js 14 + Dexie + React Query + Zustand foundation. @neondatabase/auth (v0.1.0-beta.20) replaces Privy for auth — it wraps Better Auth 1.4.18, uses cookie-based sessions, and colocates the auth schema with the Neon Postgres database, giving isolated preview environments automatically. drizzle-orm (v0.45.2) with drizzle-orm/neon-http provides type-safe schema definitions for all 16 data tables and replaces the existing raw SQL in push-db.ts. The custom sync engine uses no new packages — it is implemented using existing Dexie hooks, React Query mutations, and navigator.onLine events.

**Core technologies:**
- `@neondatabase/auth@0.1.0-beta.20`: Auth replacement for Privy — cookie-based sessions, email/password, colocated with Neon DB schema, no separate auth infra
- `drizzle-orm@0.45.2` + `drizzle-kit`: Type-safe Postgres schema for 16 tables — neon-http driver, schema-as-code, migration tooling, avoids Prisma cold-start binary
- Custom sync module (`src/lib/sync-engine.ts`): Per-field LWW bidirectional sync — full control, no vendor lock-in, builds on existing metadata fields
- Vercel Cron (Pro plan required): Server-side push notification scheduling — replaces client-side polling, existing CRON_SECRET pattern reused
- `@neondatabase/auth-ui` (alpha): Do NOT install — skip this pre-built UI kit; build custom forms with existing shadcn/ui

**Critical version notes:**
- Neon Auth pins Better Auth at 1.4.18 — do NOT install better-auth directly; version conflicts result
- Vercel Hobby plan only allows daily cron — Pro ($20/mo) required for per-minute push notification scheduling
- Next.js must be 14.2.25+ (CVE-2025-29927 middleware bypass fix)

### Expected Features

The MVP (v2.0 core) is well-defined with clear P1/P2/P3 prioritization. Settings accordion restructure is intentionally P1 despite being UI-only — it is the lowest-risk deliverable and provides the UI shell for sync status and storage controls.

**Must have (v2.0 table stakes):**
- Settings page accordion restructure — the 12-section flat list is unusable on mobile; accordion with colour-coded section headers is the standard pattern
- Neon Auth email/password — replaces Privy, enables user identity for sync API routes
- PIN gate removal — redundant with proper auth; use-pin-gate.tsx, pin-dialog.tsx, pin-service.ts all deleted
- NeonDB fresh schema design — all 16 Dexie tables mirrored to Postgres with field_timestamps JSONB and user_id FK
- Dexie v16 _syncMeta table — syncStatus, syncVersion, lastSyncedAt per record
- Background sync queue — dirty tracking, batch push to /api/sync/push, cursor-based pull, exponential backoff
- One-time data migration wizard — progress bar, resumable (cursor-based), pre/post validation, mandatory backup before start
- Storage & Security settings section — sync status indicator, last sync timestamp, storage quota, migration entry point

**Should have (v2.x after validation):**
- Per-field timestamp merge — upgrade from record-level LWW to field-level LWW
- Conflict review UI — adapt existing ConflictReviewDrawer for sync conflicts
- Manual Sync Now button — user confidence trigger
- Settings sync to cloud — persist Zustand settings to user_settings NeonDB table
- Server-side push notifications via Vercel Cron — more reliable than client-side polling

**Defer (v3+):**
- E2E auth test rewrite — Privy OTP iframe flow replaced with Neon Auth email/password
- Cross-device sync verification — automated tests across two browser contexts
- Password reset flow — manageable via Neon Console for single-user app

**Explicit anti-features (do not build):**
- Real-time sync (WebSockets) — single-user app, poll-based sync is sufficient
- CRDT-based sync — designed for multi-user; per-field LWW solves this adequately
- Toggle between local-only and remote-sync modes — doubles testing surface for no user benefit
- Granular per-table sync controls — partial sync creates orphaned FK references across 16 tables

### Architecture Approach

The target architecture preserves the existing read path completely: useLiveQuery hooks still read from Dexie, service layer still handles writes to Dexie, and React Query mutations still call services. The sole structural addition is syncQueue.enqueue(table, id, operation) after each Dexie write in all ~15 service files, plus a SyncProvider in the provider stack. The provider stack changes from Privy + PIN gate to NeonAuth + SyncProvider. Server-side, Neon Postgres expands from 4 push tables to all 16 data tables plus the neon_auth schema.

**Major components:**
1. **Sync Engine** (`src/lib/sync-engine.ts`) — dirty queue, batch push to /api/sync/push, cursor-based pull from /api/sync/pull, per-field LWW merge on server, online/offline lifecycle
2. **NeonDB Schema** (`src/db/schema.ts`) — Drizzle definitions for all 16 tables, field_timestamps JSONB, user_id FK, TEXT PRIMARY KEY (keeps existing ID format)
3. **Auth Layer** (`src/lib/auth/server.ts` + `client.ts`) — Neon Auth wrappers replacing privy-server.ts and auth-middleware.ts
4. **SyncProvider** (`src/providers/sync-provider.tsx`) — React context exposing sync state, online/offline listeners, forceSync() for settings page
5. **Migration Service** (`src/lib/migration-service.ts`) — one-time cursor-based upload of all 16 Dexie tables via sync push path; resumable via localStorage progress

**Key patterns to follow:**
- Local-first writes with async sync: writes always hit Dexie first, sync is background
- Sync-transparent hook layer: 15 hook files require zero modifications; sync encapsulated in service layer
- Cursor-based delta pull: store last updatedAt cursor, pull only changes after it
- Batch Dexie transactions for sync writes: bulkPut() in single transaction triggers one useLiveQuery update

### Critical Pitfalls

1. **Data loss during one-time IndexedDB migration** — mandatory backup before start (existing backup-service.ts), FK dependency order upload, cursor-based iteration (not toArray()), 100-500 record batches, post-migration row count verification, keep IndexedDB intact 30 days after

2. **Auth session gap during Privy cutover** — validate Neon Auth as a branch spike before writing migration code; migrate push_subscriptions.user_id using email as stable lookup key; update SW cache exclusions BEFORE auth switch; treat cutover as atomic

3. **Neon Auth beta limitations** — verify every planned feature is currently available (not roadmap); MFA is in development, magic links coming soon; have Auth.js (NextAuth v5) with @auth/neon-adapter ready as fallback

4. **Schema drift between IndexedDB and Postgres** — TypeScript interfaces in db.ts must be the single source of truth; extend schema-consistency.test.ts CI test to validate parity; include non-indexed fields (originalInputText, groupSource, visualIdentification) in Drizzle schema

5. **useLiveQuery thrashing during bulk sync writes** — wrap all sync-from-server writes in single db.transaction() per batch; triggers one useLiveQuery update per table not one per record; never write to IndexedDB via raw IDB API

## Implications for Roadmap

Based on research, suggested phase structure (6 phases; build order converges independently from both ARCHITECTURE.md and FEATURES.md):

### Phase 1: Settings Accordion Restructure
**Rationale:** Zero dependency on auth or sync. Pure UI work. Ships immediately. Provides the Storage & Security section shell that houses sync status controls in later phases. Lowest risk of any phase.
**Delivers:** Collapsible accordion settings, Customization modal contents inline, Medication settings surfaced, new UI/UX animation section, Storage & Security section (sync status placeholder)
**Addresses:** All settings restructure features (FEATURES.md P1)
**Avoids:** Bundling UI work with risky data-layer changes

### Phase 2: Neon Auth + Remove Privy
**Rationale:** Auth must work before sync API routes can be protected. Beta risk must be validated early. Service worker cache strategy must update BEFORE auth switch, not after.
**Delivers:** Working email/password auth, PIN gate removal, all Privy code and env vars deleted, updated auth middleware, push user_id migrated, E2E auth test rewritten
**Uses:** @neondatabase/auth@0.1.0-beta.20
**Implements:** Auth layer component
**Avoids:** Auth session gap pitfall, SW stale auth pitfall, Neon Auth beta surprise pitfall

### Phase 3: Postgres Schema + Drizzle Setup
**Rationale:** Postgres tables must exist before sync engine can push to them. Best time to establish single source of truth for schema parity. Contained, independently deployable.
**Delivers:** drizzle-orm installed, src/db/schema.ts with all 16 tables + field_timestamps JSONB + user_id FK, drizzle.config.ts, CI schema parity test extended, push tables under Drizzle migrations
**Uses:** drizzle-orm@0.45.2, drizzle-kit
**Implements:** NeonDB Schema component
**Avoids:** Schema drift pitfall (Pitfall 4)

### Phase 4: Sync Engine Core
**Rationale:** Highest-risk, highest-value phase. Build record-level LWW first (simpler), prove the sync round-trip works, then service layer wiring and migration can proceed on stable ground.
**Delivers:** Dexie v16 + _syncMeta table, sync-engine.ts, sync-queue.ts, /api/sync/push, /api/sync/pull, /api/sync/status, SyncProvider, online/offline handling, exponential backoff, sync status indicator wired to Storage & Security section
**Implements:** Sync Engine + SyncProvider
**Avoids:** useLiveQuery thrashing pitfall, offline queue overflow pitfall, timezone sync conflict pitfall

### Phase 5: Service Layer Integration
**Rationale:** Low-risk mechanical work after sync engine is proven. ~15 service files each get one syncQueue.enqueue() call per write. Must happen after Phase 4 to avoid debugging a moving target.
**Delivers:** All *-service.ts files enqueue sync ops; offline writes queue and flush on reconnect; integration tests verify per-table round-trips
**Implements:** Sync-transparent hook layer pattern
**Avoids:** Dual-write at hook layer anti-pattern

### Phase 6: One-Time Data Migration
**Rationale:** Ships last — migration reuses sync push path (Phases 4+5 must exist). One-time operation on production health data; needs the most stable foundation.
**Delivers:** migration-service.ts, mandatory pre-migration backup flow, cursor-based upload of all 16 tables in FK dependency order, progress UI in Settings, row count verification, resumable state in localStorage
**Implements:** Migration Service component
**Avoids:** Data loss during migration pitfall (entire phase exists to prevent Pitfall 1)

### Phase Ordering Rationale

- Auth before sync (Phase 2 before Phase 4): Sync API routes authenticate via auth.getSession(). Auth must work first.
- Schema before sync (Phase 3 before Phase 4): Sync push endpoint writes to Postgres. Tables must exist first.
- Sync before service integration (Phase 4 before Phase 5): No point wiring 15 service files to an unproven sync engine.
- Sync before migration (Phases 4+5 before Phase 6): Migration reuses the sync upload path. Building it independently would duplicate logic.
- Settings first (Phase 1 before everything): Delivers value immediately, zero risk, can run in parallel with auth spike work.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Neon Auth):** Whitelist enforcement mechanism, Next.js 14 App Router compatibility, cookie behaviour in PWA/offline mode — validate in branch spike before committing to full migration
- **Phase 4 (Sync Engine):** Per-field LWW merge at Postgres layer, atomic field groups for timezone-sensitive records (DoseLog.{scheduledDate, scheduledTime, timezone}), useLiveQuery batch transaction behaviour under bulk writes
- **Phase 6 (Data Migration):** Mobile Safari IndexedDB memory limits under toArray() for large tables; FK upload order validation against actual Drizzle schema constraints

Phases with standard patterns (skip research-phase):
- **Phase 1 (Settings Accordion):** shadcn Accordion (Radix) is well-documented; existing shadcn/ui patterns apply directly
- **Phase 3 (Drizzle Setup):** First-class supported combination with official Neon + Drizzle docs
- **Phase 5 (Service Layer Integration):** Mechanical pattern decided in Phase 4; no new research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Drizzle + Neon integration is HIGH. Neon Auth is MEDIUM — beta but core email/password API is stable. Custom sync is MEDIUM — right approach, edge cases need design work. |
| Features | HIGH | P1/P2/P3 matrix is clear. Anti-features explicitly documented to prevent scope creep. |
| Architecture | MEDIUM | Component boundaries well-defined. Per-field merge implementation and useLiveQuery batch behaviour need Phase 4 spike to confirm. |
| Pitfalls | HIGH | Grounded in codebase analysis (specific file names, existing code patterns) and official docs with CVE references. Recovery strategies provided. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Neon Auth whitelist enforcement:** Current ALLOWED_EMAILS env var checked in withAuth(). Neon Auth has no built-in allowlist. Decide: check in sign-up server action (reject registration) or middleware (redirect). Validate in Phase 2 spike.
- **Record-level vs. per-field LWW as v2.0 default:** Research recommends record-level LWW for v2.0, per-field in v2.x. Confirm this tradeoff is acceptable — for single-user, true same-field conflicts require multi-device-while-offline scenarios that are rare in practice.
- **Dexie non-indexed field audit:** Non-indexed fields (originalInputText, groupSource, visualIdentification) exist in IDB records but are invisible to Dexie store definitions. Full audit of IDB record shapes vs TypeScript interfaces needed before writing Drizzle schema in Phase 3.
- **Vercel plan confirmation:** Pro plan ($20/mo) required for per-minute Cron. Must confirm before Phase 4 designs push notification architecture.

## Sources

### Primary (HIGH confidence)
- [Neon Auth Overview](https://neon.com/docs/auth/overview) — architecture, neon_auth schema, limitations, roadmap
- [Neon Auth Next.js Quick Start](https://neon.com/docs/auth/quick-start/nextjs) — setup code, createNeonAuth API
- [Neon Auth Roadmap](https://neon.com/docs/auth/roadmap) — current beta status, missing features
- [Drizzle ORM + Neon Connection](https://orm.drizzle.team/docs/connect-neon) — HTTP vs WebSocket driver decision
- [Vercel Cron Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby vs Pro plan limits
- [CVE-2025-29927 Next.js Middleware Bypass](https://workos.com/blog/nextjs-app-router-authentication-guide-2026) — auth middleware security

### Secondary (MEDIUM confidence)
- [Offline Sync & Conflict Resolution Patterns (Apr 2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) — per-field LWW strategy
- [Dexie.js Issue #1168](https://github.com/dfahlander/Dexie.js/issues/1168) — maintainer guidance on custom sync vs Dexie Cloud
- [RxDB Downsides of Offline-First](https://rxdb.info/downsides-of-offline-first.html) — storage limits, Safari 7-day deletion, schema migration risks
- Codebase analysis: src/lib/db.ts (v10-v15 migrations, 16 tables), src/lib/privy-server.ts, src/components/auth-guard.tsx, src/lib/auth-middleware.ts, src/lib/push-db.ts, public/sw.js, src/stores/settings-store.ts

### Tertiary (LOW confidence)
- [Offline-First Frontend Apps in 2025 — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — IndexedDB limitations (needs empirical mobile testing)

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
