# Feature Research: Cloud Sync, Auth Migration & Settings Overhaul

**Domain:** Offline-first sync UX, storage migration flows, settings page restructure, auth migration
**Researched:** 2026-04-11
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any offline-first cloud sync app, auth migration, and settings overhaul must have. Missing these creates a broken or confusing experience.

#### Sync Engine & Cloud Storage

| Feature | Why Expected | Complexity | Existing Dep | Notes |
|---------|--------------|------------|--------------|-------|
| **Local-first writes with instant UI** | Users expect zero latency on data entry; writes hit IndexedDB first, sync happens in background. Any pause or spinner on write kills the offline-first premise. | LOW | Dexie.js v15, React Query hooks, service layer | Already the current behavior. Sync engine layers on top without changing write path. |
| **Background sync queue** | Changes made offline must reliably reach the server when connectivity returns. Users expect "it just works" -- no manual sync button for normal operation. | HIGH | Service worker (existing PWA), Dexie tables with `updatedAt`/`deviceId` | Implement an outbound mutation queue in IndexedDB. Each write appends to queue. Background process drains queue to NeonDB via API. Exponential backoff + jitter on failures. Queue is append-only; entries removed only after server confirms. |
| **Sync status indicator** | Users need to know: am I synced? Is sync happening? Did something fail? A small, unobtrusive status indicator (checkmark/spinner/warning) in the header or settings page. | MEDIUM | AppHeader component | Three states: synced (checkmark, "Last synced: 2m ago"), syncing (spinner), error (warning icon). Show timestamp of last successful sync. Do NOT show on every page -- settings section and optionally a subtle header icon. |
| **Offline capability preserved** | The app must work fully offline exactly as it does today. Cloud sync is additive, not a requirement. If the server is down, the user notices nothing except "last synced" getting stale. | LOW | Entire current architecture | This is the existing behavior. The sync engine must be purely additive. All reads continue from IndexedDB. All writes continue to IndexedDB. Sync is a background concern. |
| **Per-record sync metadata** | Every syncable record needs `syncStatus` ("pending" / "synced" / "failed"), `serverUpdatedAt`, and `syncVersion` fields to track what has been uploaded. | MEDIUM | All 16 Dexie tables already have `createdAt`, `updatedAt`, `deletedAt`, `deviceId` | Add sync metadata columns in a new Dexie version (v16). Existing records get `syncStatus: "pending"` on migration so they are queued for initial upload. |
| **Soft delete propagation** | Existing soft-delete pattern (`deletedAt` field) must sync correctly. Deleting locally sets `deletedAt`; sync engine pushes the tombstone to server. Server-side queries filter on `deletedAt IS NULL`. | LOW | All records already use soft-delete pattern | Tombstones sync like any other mutation. Server stores them. This is already the data model -- just needs to flow through the sync queue. |

#### One-Time Data Migration (IndexedDB to NeonDB)

| Feature | Why Expected | Complexity | Existing Dep | Notes |
|---------|--------------|------------|--------------|-------|
| **Migration wizard with progress** | Existing users have months of health data in IndexedDB. They need a clear, guided flow: "Your data is local. Upload to cloud?" with a progress bar showing table-by-table upload status. | MEDIUM | Backup service (reads all 16 tables), push-db.ts (Neon connection pattern) | Reuse backup service's `exportAllData()` to read all tables. Upload in batches (50-100 records per API call). Show determinate progress bar with table name + record count. Estimate total time upfront. |
| **Resumable migration** | If migration fails mid-way (network drop, tab closed), the user must be able to resume from where it stopped, not restart from scratch. | MEDIUM | None | Track migration progress per table in localStorage: `{table: "intakeRecords", lastId: "abc123", status: "in_progress"}`. On resume, skip already-uploaded records. The existing `id` field on every record makes cursor-based resumption straightforward. |
| **Pre-migration validation** | Before uploading, validate that local data is consistent (no orphaned references, no corrupt records). Surface warnings but allow user to proceed. | LOW | Data integrity CI tests (schema consistency, backup round-trip) | Port existing data integrity validation to a client-side check. Quick scan: count records per table, check for obvious issues. Show summary before upload begins. |
| **Post-migration verification** | After upload completes, verify server-side record counts match local counts. Show a summary: "Uploaded: 1,234 intake records, 89 weight records..." with a green checkmark. | LOW | None | Simple count comparison. API endpoint returns record counts per table. Client compares to local counts. Any mismatch gets flagged with option to retry specific tables. |
| **Migration is one-time only** | After successful migration, the sync engine takes over. No "re-migrate" button. This prevents accidental duplicate uploads. | LOW | None | Set a `migrationComplete: true` flag in settings store after successful migration. Hide migration wizard permanently. Sync engine handles all subsequent data movement. |

#### Auth Migration (Privy to Neon Auth)

| Feature | Why Expected | Complexity | Existing Dep | Notes |
|---------|--------------|------------|--------------|-------|
| **Email/password sign-up and sign-in** | Basic auth flow. Neon Auth (Better Auth) provides email/password out of the box. User creates account, signs in, sessions managed via cookies. | MEDIUM | Privy auth (to be replaced), AuthGuard component, AccountSection component | Install `@neondatabase/auth`. Create `lib/auth/server.ts` with `createNeonAuth()`, API catch-all route, client instance. Replace `usePrivy()` hooks with Neon Auth equivalents. |
| **Session persistence across reloads** | User signs in once, stays signed in. Cookie-based sessions managed by Neon Auth. No re-auth on every page load. | LOW | Privy handles this currently | Neon Auth's cookie-based sessions handle this automatically. `NEON_AUTH_COOKIE_SECRET` env var required. Middleware checks session on protected routes. |
| **Sign-out** | Clear button to sign out. Destroys session cookie. Returns to sign-in page. | LOW | Existing sign-out in AccountSection | Replace `logout()` from Privy with Neon Auth's sign-out method. |
| **PIN gate removal** | PROJECT.md explicitly calls for PIN gate removal. With proper auth (email/password), the local PIN is redundant. | LOW | PinGateProvider, use-pin-gate.tsx, PrivacySecuritySection | Remove PinGateProvider from provider stack, delete PIN-related components, remove PIN settings from PrivacySecuritySection. Clean up audit log actions for PIN. |
| **Whitelist enforcement** | Current `ALLOWED_EMAILS` env var restricts who can sign up. Must be preserved in Neon Auth. Single-user app -- only one email should work. | LOW | Existing whitelist logic in API middleware | Move whitelist check to Neon Auth middleware or sign-up server action. Reject registration for non-whitelisted emails before account creation. |

#### Settings Page Restructure

| Feature | Why Expected | Complexity | Existing Dep | Notes |
|---------|--------------|------------|--------------|-------|
| **Expandable/collapsible sections (accordion)** | 12 settings sections + Customization modal + Debug modal = a very long page. Accordion pattern collapses sections so users see all categories at a glance, expand only what they need. This is the standard pattern for mobile settings pages. | MEDIUM | 12 section components already exist as separate files, Collapsible component already installed | Use shadcn Accordion (`type="multiple"`, `collapsible`) or the existing Collapsible component. Each section becomes an AccordionItem with colored icon + title as trigger. Content stays the same. `type="multiple"` lets users keep multiple sections open -- critical for settings where users compare values across sections. |
| **Color-coded section headers with icons** | The current sections already have color-coded icons (blue for Account, emerald for Privacy, slate for Appearance, etc.). The accordion trigger should preserve these colors and icons for scannability. | LOW | Each section already has its own icon + color | Move the icon + color into the AccordionTrigger. The trigger row shows: icon (colored) + section title + chevron. Content appears below on expand. |
| **Customization modal contents moved inline** | The Customization modal (liquid presets, tracking defaults, graph settings) is hidden behind a button -- users don't discover these settings. Move them into the accordion as named sections: "Tracking Defaults", "Liquid Presets", "Graph Settings". | MEDIUM | CustomizationPanel component with three tabs | Break the three tabs into three accordion sections. Each tab's content becomes its own section. Remove the Dialog wrapper. The content components can be reused directly. |
| **Medication settings surfaced** | MedicationSettingsSection exists but is not rendered in the settings page (`page.tsx` doesn't import it). It needs to appear in the accordion alongside other sections. | LOW | MedicationSettingsSection component exists, not wired up | Add to the accordion. The component is complete -- just needs to be rendered. |
| **New "UI/UX" section for animation settings** | Animation timing settings (scrollDurationMs, autoHideDelayMs, barTransitionDurationMs) currently have no UI -- they're in the store but not exposed on the settings page. Create a dedicated UI/UX section with sliders for these values. | MEDIUM | Settings store already has these fields with defaults and ranges | New section component with sliders or number inputs. Show current values with min/max ranges. Include "Reset to defaults" per-section button. |
| **New "Storage & Security" section** | Houses sync status display, storage usage info, export/import (moved from Data Management), and auth-related settings. This becomes the home for cloud sync controls. | MEDIUM | DataManagementSection (export/import/clear), PrivacySecuritySection (PIN -- being removed) | Merge relevant parts of DataManagementSection and PrivacySecuritySection into a new section. Add sync status indicator, last sync timestamp, storage quota display (`navigator.storage.estimate()`). |
| **Debug modal preserved** | Debug panel stays as a modal (not inline) because it contains destructive/developer-only actions that should be intentionally accessed. | LOW | DebugPanel component | Keep as-is. The only modal that remains after the restructure. |

### Differentiators (Competitive Advantage)

Features that go beyond table stakes and provide notable user value, especially for a health tracking app with offline-first sync.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-field timestamp merge conflict resolution** | Instead of "last write wins" at the record level (which loses data), track `updatedAt` per field. When two devices edit different fields of the same record, both edits are preserved. Only truly conflicting same-field edits need resolution. | HIGH | This is the PROJECT.md specified approach. Requires adding per-field `updatedAt` maps to the Dexie schema (e.g., `fieldTimestamps: Record<string, number>`). Server merge logic compares field-by-field. Significant schema change but the correct approach for a health app where every data point matters. |
| **Conflict review UI** | When genuine conflicts occur (same field edited on two devices), show the user both values and let them pick. Health data conflicts are rare but high-stakes -- you don't want to silently drop a blood pressure reading. | MEDIUM | ConflictReviewDrawer already exists for backup import conflicts. Adapt for sync conflicts. | Reuse the existing conflict review pattern. Show: field name, local value + timestamp, remote value + timestamp, pick one. Queue resolved conflicts for sync. |
| **Storage usage dashboard** | Show IndexedDB usage, record counts per table, estimated NeonDB usage. Helps users understand their data footprint. `navigator.storage.estimate()` provides quota/usage. | LOW | None | Small but delightful feature for a data-heavy app. Show in the Storage & Security section. Pie chart or simple bar of usage by table. |
| **Sync retry with exponential backoff** | Failed syncs automatically retry with increasing delays (1s, 2s, 4s, 8s... up to 5 min). Handles flaky connections gracefully without hammering the server. Includes jitter to prevent thundering herd if multiple tabs are open. | MEDIUM | None | Standard pattern. Implement in the sync queue processor. Reset backoff on successful sync. Cap at 5-minute intervals. User can force-retry via settings. |
| **Manual sync trigger** | Even though sync is automatic, a "Sync Now" button in settings gives users confidence and control. Especially useful after editing data on a spotty connection. | LOW | None | Button in Storage & Security section. Triggers immediate queue drain attempt. Shows result: "Synced 12 pending changes" or "Failed: offline". |
| **Server-side push notifications via Vercel Cron** | Move push notification scheduling from client-side polling to server-side cron. More reliable (works even when app isn't open), uses Vercel's free cron tier. | HIGH | push-db.ts (Neon connection), push-sender.ts, medication-notification-service.ts | The push subscription infrastructure already exists. Move the "check for due doses" logic to a Vercel Cron endpoint. Cron queries NeonDB for dose schedules, sends push via web-push library. Requires dose schedule data to be synced to NeonDB first. |
| **Settings sync to cloud** | Sync Zustand settings to NeonDB so they persist across devices. Currently settings are in localStorage -- lost on device switch or browser clear. | MEDIUM | settings-store.ts (Zustand persist to localStorage) | Add a `user_settings` table to NeonDB. On settings change, debounce and sync to cloud. On app load, merge cloud settings with local (cloud wins for most fields, local wins for device-specific like theme). |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build for this milestone.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time sync (WebSockets)** | "Data should appear instantly on other devices." | Single-user app. There is no second device watching simultaneously in a realistic scenario. WebSocket infrastructure adds server cost, connection management complexity, and reconnection logic for zero practical benefit. Poll-based or periodic sync (every 30-60 seconds when online) is sufficient. | Periodic background sync (30-60 second intervals when online) + manual "Sync Now" button. Data appears on other devices within a minute. |
| **CRDT-based sync** | "CRDTs solve all conflict resolution automatically." | CRDTs are designed for multi-user collaborative editing. This is a single-user app. CRDTs add significant library weight (e.g., Yjs, Automerge) and schema complexity for a problem that per-field LWW solves adequately. The conflict scenarios are: same user, different devices, different fields -- not concurrent multi-user edits. | Per-field timestamp LWW with manual conflict resolution for genuine same-field conflicts. Simpler, lighter, sufficient for the use case. |
| **Full Dexie Cloud integration** | "Dexie Cloud handles sync out of the box." | Dexie Cloud is a separate paid service ($9/mo+) with its own auth, its own server, and its own conflict resolution model. Using it means surrendering auth to Dexie Cloud instead of Neon Auth, storing data on Dexie's servers instead of your Neon instance, and giving up per-field merge control. It's a different product architecture. | Custom sync engine using existing Dexie.js + NeonDB. You already have both pieces -- just need the glue. |
| **Toggle between local-only and remote-sync modes** | "Let users choose to stay fully local." | PROJECT.md explicitly states: "end state is always remote sync with offline support." A toggle doubles the testing surface, creates two UX paths, and the sync engine needs to work regardless. | No toggle. After migration, sync is always on. Offline operation is seamless and transparent -- sync just pauses when offline. |
| **Automatic auth migration from Privy** | "Detect existing Privy session and seamlessly transition to Neon Auth." | Privy and Neon Auth have completely different session/token formats. There is no way to convert a Privy session to a Neon Auth session. The user must sign in again. For a single-user app, this is a one-time 30-second inconvenience. Building migration infrastructure for one user is pure waste. | Clear Privy session on deploy. Show sign-up/sign-in flow on first visit. User creates a new Neon Auth account with same email. One-time effort. |
| **OAuth/social login (Google, GitHub)** | "Keep the Google sign-in from Privy." | Neon Auth supports OAuth but it requires configuring OAuth credentials, callback URLs, and adds a dependency on third-party OAuth providers. For a single-user app, email/password is simpler, self-contained, and has no external dependencies. | Email/password via Neon Auth. One user, one password. Password reset via email if needed. |
| **Sync conflict auto-resolution without user input** | "Just pick the most recent one automatically." | For a health tracking app, silently dropping data is dangerous. A blood pressure reading or medication dose log that gets auto-resolved wrong could have health implications. Users need to see and approve conflict resolutions for health data. | Per-field LWW handles most cases automatically (different fields edited = no conflict). Only surface genuine same-field conflicts for manual review. In practice, conflicts will be extremely rare for a single-user app. |
| **Granular per-table sync controls** | "Let users choose which tables sync to cloud." | Increases complexity massively. Foreign key relationships between tables (prescriptions -> phases -> schedules -> dose logs) mean partial sync creates orphaned references. All or nothing is the right model. | All 16 tables sync. Period. The sync engine handles them all uniformly. |
| **Animated section transitions in settings** | "Smooth accordion open/close animations." | shadcn Accordion (Radix) includes CSS transitions by default. Adding custom spring animations via Framer Motion or similar adds bundle size and potential jank on mobile. The default Radix transitions are smooth enough. | Use default Radix accordion transitions. They're CSS-based, performant, and consistent with the existing shadcn component library. |

## Feature Dependencies

```
[Neon Auth setup]
    ├──enables──> [PIN gate removal]
    ├──enables──> [Whitelist enforcement]
    └──required by──> [Sync engine] (needs user identity for server writes)

[Sync metadata schema (Dexie v16)]
    └──required by──> [Background sync queue]
                           └──required by──> [Sync status indicator]
                           └──required by──> [Manual sync trigger]

[Background sync queue]
    └──required by──> [One-time data migration] (migration uses same upload path)
    └──required by──> [Server-side push notifications] (needs dose data in NeonDB)

[One-time data migration]
    └──required by──> [Server-side push notifications] (needs all data in NeonDB)
    └──enables──> [Settings sync to cloud]

[NeonDB schema design]
    └──required by──> [Background sync queue] (needs tables to write to)
    └──required by──> [One-time data migration]
    └──required by──> [Per-field merge logic] (server-side merge function)

[Settings page accordion restructure]
    ├──enables──> [Customization modal contents inline]
    ├──enables──> [Medication settings surfaced]
    ├──enables──> [UI/UX animation section]
    └──enables──> [Storage & Security section]
                       └──houses──> [Sync status indicator]
                       └──houses──> [Manual sync trigger]
                       └──houses──> [Migration wizard entry point]

[Accordion component install]
    └──required by──> [Settings page accordion restructure]

[Per-field timestamp merge]
    └──enhances──> [Background sync queue] (enriches conflict detection)
    └──enables──> [Conflict review UI for sync] (only needed if per-field conflicts exist)
```

### Dependency Notes

- **Neon Auth must come before sync engine:** The sync engine needs a user identity to associate data with on the server. Without auth, the server can't know whose data it's receiving. Auth is the first thing that must work.
- **Sync metadata schema must come before sync queue:** Records can't be tracked for sync without the `syncStatus` / `syncVersion` fields. This is a Dexie version bump (v15 -> v16).
- **NeonDB schema must come before sync queue or migration:** The server-side Postgres tables must exist before data can be uploaded. Fresh schema design is explicitly called out in PROJECT.md ("Neon DB reset and fresh schema design").
- **Sync queue must come before one-time migration:** The migration reuses the same upload-to-server path. Building the sync engine first means migration is just "mark all records as pending, let the sync engine drain them."
- **Settings accordion is independent of sync/auth:** The settings restructure has zero dependency on auth or sync. It can happen in parallel or as a first phase to set the stage for sync-related UI (Storage & Security section).
- **Server-side push notifications require synced dose data:** Push notifications need dose schedules in NeonDB. This means the one-time migration must complete before server-side push notifications work. This is the last dependency in the chain.

## MVP Definition

### Launch With (v2.0 Core)

Minimum features that constitute a working cloud sync + auth + settings overhaul.

- [ ] **Settings page accordion restructure** -- Independent of sync/auth, reduces settings page length, surfaces hidden settings
- [ ] **Neon Auth (email/password)** -- Replace Privy, enable user identity for sync
- [ ] **PIN gate removal** -- Redundant with proper auth
- [ ] **NeonDB fresh schema design** -- Server-side tables matching all 16 Dexie tables + sync metadata
- [ ] **Sync metadata in Dexie (v16)** -- Add `syncStatus`, `syncVersion`, `serverUpdatedAt` to all records
- [ ] **Background sync queue** -- Core sync engine: queue mutations, drain to NeonDB, exponential backoff
- [ ] **Sync status indicator** -- Checkmark/spinner/warning in settings, last sync timestamp
- [ ] **One-time data migration wizard** -- Progress bar, resumable, pre/post validation
- [ ] **Storage & Security settings section** -- Houses sync status, storage controls, export/import

### Add After Validation (v2.x)

Features to layer on once core sync is proven stable.

- [ ] **Per-field timestamp merge** -- Upgrade from record-level LWW to field-level LWW; requires schema enrichment
- [ ] **Conflict review UI for sync** -- Adapt existing ConflictReviewDrawer for sync conflicts
- [ ] **Manual sync trigger** -- "Sync Now" button in Storage & Security section
- [ ] **Settings sync to cloud** -- Persist Zustand settings to NeonDB `user_settings` table
- [ ] **Storage usage dashboard** -- Show IndexedDB/NeonDB usage stats
- [ ] **Server-side push notifications via Vercel Cron** -- Move from client-side to server-side scheduling

### Future Consideration (v3+)

Features to defer until sync is battle-tested.

- [ ] **E2E test updates for new auth flow** -- Rewrite Privy-based E2E auth to use Neon Auth test credentials
- [ ] **Cross-device sync verification** -- Automated tests that sync data between two browser contexts
- [ ] **Password reset flow** -- Neon Auth supports it, but single-user app can reset via Neon Console directly

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| Settings accordion restructure | MEDIUM | LOW | LOW | P1 |
| Customization modal -> inline | MEDIUM | LOW | LOW | P1 |
| Medication settings surfaced | LOW | LOW | LOW | P1 |
| UI/UX animation section | LOW | MEDIUM | LOW | P1 |
| Neon Auth (email/password) | HIGH | MEDIUM | MEDIUM | P1 |
| PIN gate removal | LOW | LOW | LOW | P1 |
| NeonDB fresh schema design | HIGH | MEDIUM | MEDIUM | P1 |
| Sync metadata Dexie v16 | HIGH | MEDIUM | MEDIUM | P1 |
| Background sync queue | HIGH | HIGH | HIGH | P1 |
| Sync status indicator | MEDIUM | LOW | LOW | P1 |
| One-time data migration | HIGH | MEDIUM | MEDIUM | P1 |
| Storage & Security section | MEDIUM | LOW | LOW | P1 |
| Per-field timestamp merge | HIGH | HIGH | HIGH | P2 |
| Sync conflict review UI | MEDIUM | MEDIUM | LOW | P2 |
| Manual sync trigger | LOW | LOW | LOW | P2 |
| Settings sync to cloud | MEDIUM | MEDIUM | LOW | P2 |
| Storage usage dashboard | LOW | LOW | LOW | P2 |
| Server-side push (Vercel Cron) | HIGH | HIGH | MEDIUM | P2 |
| E2E auth test rewrite | MEDIUM | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for v2.0 -- core sync, auth, and settings restructure
- P2: Should have, add in v2.x follow-up -- enrichments to sync and UX
- P3: Nice to have, defer to future -- testing and hardening

## Competitor/Pattern Analysis

| Pattern | Health Apps (Medisafe, MyFitnessPal) | Note-taking (Notion, Obsidian) | Our Approach |
|---------|-------------------------------------|-------------------------------|--------------|
| Sync model | Server-first, offline as fallback | Local-first, sync in background | Local-first (matches Obsidian pattern). IndexedDB is always the primary read/write store. NeonDB is the persistent backup. |
| Conflict resolution | Server wins (no user choice) | Last-write-wins or CRDT | Per-field LWW with manual review for genuine conflicts. Health data is too important for silent auto-resolution. |
| Auth | Email/password + social | Email/password or SSO | Email/password only. Single-user app, no need for social login. |
| Settings organization | Flat list or grouped tabs | Grouped with expand/collapse | Accordion with color-coded sections. Best of both: grouped for organization, expandable for space efficiency. |
| Migration UX | "Sign in and your data appears" (server-first) | Export/import JSON | Guided wizard with progress bar. Users see exactly what's happening with their data. Resumable. |
| Sync status | Hidden (no indicator) | Subtle "Saved" / "Syncing..." | Subtle indicator in settings + optional header icon. Not in-your-face but always available. |

## Sources

- [Offline-first frontend apps in 2025 -- LogRocket Blog](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Building an offline realtime sync engine -- GitHub Gist](https://gist.github.com/pesterhazy/3e039677f2e314cb77ffe3497ebca07b)
- [PWA, Indexed DB, and a Reliable Queue -- Offline-First by Design](https://medium.com/@11.sahil.kmr/offline-first-by-design-pwa-indexed-db-and-a-reliable-queue-775605b3d76c)
- [Offline sync & conflict resolution patterns -- Crash Course (Apr 2026)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/)
- [Beyond Timestamps: Advanced Conflict Resolution in Offline-First Apps](https://medium.com/@pranavdixit20/beyond-timestamps-advanced-conflict-resolution-in-offline-first-django-apps-ii-5e3d9f36541b)
- [Design Guidelines for Offline & Sync -- Google Open Health Stack](https://developers.google.com/open-health-stack/design/offline-sync-guideline)
- [Neon Auth overview](https://neon.com/docs/auth/overview)
- [Use Neon Auth with Next.js -- Quick Start](https://neon.com/docs/auth/quick-start/nextjs)
- [Migrate to Neon Auth with Better Auth](https://neon.com/docs/auth/migrate/from-legacy-auth)
- [Neon Auth Changelog Jan 30, 2026](https://neon.com/docs/changelog/2026-01-30) -- Major SDK update to `createNeonAuth()`
- [Accordion UI Design Best Practices -- LogRocket](https://blog.logrocket.com/ux-design/accordion-ui-design/)
- [Accordions on Mobile -- NN/g](https://www.nngroup.com/articles/mobile-accordions/)
- [shadcn/ui Accordion component](https://ui.shadcn.com/docs/components/radix/accordion)
- [shadcn/ui Collapsible component](https://ui.shadcn.com/docs/components/radix/collapsible)
- [Progress Bar UX Examples -- BricxLabs](https://bricxlabs.com/blogs/progress-bar-ux-examples)
- [UX for Migration -- Shopify Dev Docs](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/migrate-to-subscriptions-api/ux-for-migration)
- [How to Migrate Users to Auth0 -- Bulk & Automatic Migration](https://auth0.com/blog/how-to-migrate-users-to-auth0-a-technical-guide/)

---
*Feature research for: Cloud Sync, Auth Migration & Settings Overhaul (v2.0)*
*Researched: 2026-04-11*
