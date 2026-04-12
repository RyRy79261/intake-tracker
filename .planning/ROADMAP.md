# Roadmap: Intake Tracker

## Overview

Personal health tracking PWA. v1.0 rebuilt the engineering foundation (strict TypeScript, atomic transactions, analytics, security, tests, push notifications). v1.1 redesigned the intake UI with composable data entries, unified cards, AI substance lookup, and dashboard modernization. v1.2 added a world-class CI pipeline protecting data integrity, E2E testing, supply chain hardening, and performance benchmarking. v1.3 established the deployment lifecycle: automated releases with changelogs, a stable staging environment, protected production deployments, and version observability. v1.4 fixed bugs, UI inconsistencies, and missing functionality identified after the v1.3 production release. v2.0 moves from fully-local IndexedDB storage to NeonDB as source of truth with offline-capable local mirror, replaces Privy auth with Neon Auth, restructures settings into organized expandable sections, and migrates push notifications to server-side delivery.

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1-11, 44 plans (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 12-19, 16 plans (shipped 2026-03-27) — [archived](./milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 CI & Data Integrity** — Phases 20-26, 16 plans (shipped 2026-04-04) — [archived](./milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Deployment Lifecycle** — Phases 27-31, 12 plans (shipped 2026-04-05) — [archived](./milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Post-Release Fixes** — Phases 32-39, 17 plans (shipped 2026-04-06) — [archived](./milestones/v1.4-ROADMAP.md)
- 🚧 **v2.0 Cloud Sync & Settings Overhaul** — Phases 40-46 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.3 Deployment Lifecycle (Phases 27-31) — SHIPPED 2026-04-05</summary>

- [x] Phase 27: Release Automation (3/3 plans) — completed 2026-04-04
- [x] Phase 28: Staging Environment (4/4 plans) — completed 2026-04-04
- [x] Phase 29: Deployment Protection (2/2 plans) — completed 2026-04-04
- [x] Phase 30: Observability & Rollback (2/2 plans) — completed 2026-04-04
- [x] Phase 31: Rollback & Documentation Fixes (1/1 plan) — completed 2026-04-05

</details>

<details>
<summary>✅ v1.4 Post-Release Fixes (Phases 32-39) — SHIPPED 2026-04-06</summary>

- [x] Phase 32: Release Pipeline + Weight Settings Infrastructure (2/2 plans) — completed 2026-04-06
- [x] Phase 33: Weight Direct Input (4/4 plans) — completed 2026-04-06
- [x] Phase 34: Food/Sodium Card Restructure (3/3 plans) — completed 2026-04-06
- [x] Phase 35: Preset Fixes (2/2 plans) — completed 2026-04-06
- [x] Phase 36: Neon DB + Vercel Integration Understanding (3/3 plans) — completed 2026-04-06
- [x] Phase 37: Water Entry Label Formatting Bug (1/1 plan) — completed 2026-04-06
- [x] Phase 38: Weight Input Default Value Bug (1/1 plan) — completed 2026-04-06
- [x] Phase 39: Preset Save-and-Log Label Fix (1/1 plan) — completed 2026-04-06

</details>

### 🚧 v2.0 Cloud Sync & Settings Overhaul (In Progress)

**Milestone Goal:** Move from fully-local IndexedDB storage to NeonDB as source of truth with offline-capable local mirror, replace Privy auth with Neon Auth, and restructure the settings page into organized expandable sections.

- [ ] **Phase 40: Settings Accordion Restructure** - Reorganize settings into expandable color-coded sections, eliminate modals, surface orphaned settings
- [ ] **Phase 41: Neon Auth + Privy Removal** - Replace Privy with Neon Auth email/password, remove PIN gate, update push subscriptions to new identity
- [ ] **Phase 42: Postgres Schema + Drizzle Setup** - Mirror all 16 Dexie tables to Postgres via Drizzle ORM with user_id FK and CI parity validation
- [ ] **Phase 43: Sync Engine Core** - Build local-first sync engine with dirty queue, batch push/pull, conflict resolution, and offline handling
- [ ] **Phase 44: Sync Service Integration** - Wire sync into all service files, surface sync status in Storage & Security section
- [ ] **Phase 45: Data Migration** - One-time guided migration wizard uploading IndexedDB data to NeonDB with safety guarantees
- [ ] **Phase 46: Server-Side Push Notifications** - Replace client-side push polling with Vercel Cron server-side delivery

## Phase Details

### Phase 40: Settings Accordion Restructure
**Goal**: Users see a well-organized, navigable settings page with expandable sections instead of a flat overwhelming list
**Depends on**: Nothing (first phase of v2.0 — zero data-layer risk)
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05, SET-06
**Success Criteria** (what must be TRUE):
  1. User sees settings grouped into expandable accordion sections with color-coded headers (e.g., Tracking, Customization, Medication, UI/UX, Storage & Security, Debug)
  2. User can configure urination/defecation defaults, weight toggles, and liquid presets inline within their sections without opening any modal (except Debug panel)
  3. User finds animation timing settings (scroll speed, hide delay, transition speed) in a dedicated UI/UX section
  4. User finds medication settings (dose reminders, time format, follow-up config) on the main settings page rather than buried elsewhere
  5. User sees a Storage & Security section with placeholder sync status and storage info (populated in later phases)
**Plans**: TBD
**UI hint**: yes

### Phase 41: Neon Auth + Privy Removal
**Goal**: Users authenticate via email/password through Neon Auth with all Privy infrastructure fully removed
**Depends on**: Phase 40
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, PUSH-02
**Success Criteria** (what must be TRUE):
  1. User can log in with email and password via Neon Auth and maintain authenticated sessions
  2. No PIN gate dialog appears anywhere in the app (pin-service, pin-dialog, use-pin-gate deleted)
  3. All API routes reject unauthenticated requests using Neon Auth sessions (no Privy middleware remains)
  4. No Privy provider, dependencies, env vars, or imports exist anywhere in the codebase
  5. E2E tests authenticate via Neon Auth login flow (Privy OTP iframe flow removed)
**Plans**: 6 plans
Plans:
- [ ] 41-01-PLAN.md — Neon Auth server foundation (helper, catch-all handler, middleware.ts, withAuth rewrite)
- [ ] 41-02-PLAN.md — Client auth surface (/auth page + Tabs, useAuth hook, auth-button, account-section, providers.tsx)
- [ ] 41-03-PLAN.md — Push identity migration (truncation script + drop authToken from push client)
- [ ] 41-04-PLAN.md — Privy + PIN sweep (delete files, remove packages, update CSP, scrub env vars, consumer cleanup)
- [ ] 41-05-PLAN.md — E2E rework (globalSetup + storageState, Neon test branch in CI, seed script)
- [ ] 41-06-PLAN.md — Human UAT checkpoint (full Neon Auth migration verification)
**UI hint**: yes

### Phase 42: Postgres Schema + Drizzle Setup
**Goal**: All 16 data tables exist in Postgres with type-safe Drizzle ORM definitions and CI-enforced parity with Dexie
**Depends on**: Phase 41 (auth must exist so schema can include user_id FK referencing neon_auth users)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Success Criteria** (what must be TRUE):
  1. Every Dexie table (all 16) has a corresponding Postgres table defined via Drizzle ORM with matching fields
  2. Every Postgres row has a user_id foreign key tying it to the authenticated Neon Auth user
  3. Neon database is clean — old test data wiped, fresh schema applied via Drizzle migrations
  4. CI test validates that Dexie schema and Drizzle schema define the same tables and fields (drift detected = CI failure)
**Plans**: TBD

### Phase 43: Sync Engine Core
**Goal**: User's data syncs bidirectionally between IndexedDB and NeonDB with local-first writes, background push, and automatic conflict resolution
**Depends on**: Phase 42 (Postgres tables must exist before sync can write to them)
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05
**Success Criteria** (what must be TRUE):
  1. User's writes land in IndexedDB immediately regardless of network state — no perceptible delay from sync
  2. Dirty records push to NeonDB in batches when online, with exponential backoff on failure
  3. App pulls new/updated records from NeonDB on startup and periodically during use
  4. Conflicts between local and remote records resolve automatically via record-level last-write-wins using updatedAt timestamps
  5. App detects online/offline transitions and automatically syncs queued changes on reconnect
**Plans**: TBD

### Phase 44: Sync Service Integration
**Goal**: Sync is wired into every data service and its operational status is visible to the user
**Depends on**: Phase 43 (sync engine must be proven before wiring into all 15 service files)
**Requirements**: SYNC-06
**Success Criteria** (what must be TRUE):
  1. Every write operation across all 16 tables enqueues a sync operation (no table left unwired)
  2. User can see last sync time, online/offline indicator, and sync health in the Storage & Security settings section
  3. Offline writes from any service queue correctly and flush on reconnect without data loss
**Plans**: TBD
**UI hint**: yes

### Phase 45: Data Migration
**Goal**: Users can safely migrate their existing IndexedDB data to NeonDB through a guided wizard with safety guarantees
**Depends on**: Phase 44 (migration reuses the sync push path — all services must be wired)
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04
**Success Criteria** (what must be TRUE):
  1. User can trigger a one-time migration wizard from the Storage & Security settings section
  2. Migration requires and performs a mandatory backup before any data upload begins
  3. Migration is resumable if interrupted — progress is persisted and the wizard picks up where it left off
  4. Migration completes with a verification step comparing local and remote row counts per table
**Plans**: TBD
**UI hint**: yes

### Phase 46: Server-Side Push Notifications
**Goal**: Push notifications are delivered reliably via server-side scheduling instead of client-side polling
**Depends on**: Phase 41 (needs Neon Auth for user identity), Phase 44 (needs sync infrastructure for reliable server-side data access)
**Requirements**: PUSH-01
**Success Criteria** (what must be TRUE):
  1. Vercel Cron job triggers push notification delivery on schedule (no client-side polling code remains)
  2. Push notifications continue to arrive for scheduled medication doses with the same reliability as before
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 40 → 41 → 42 → 43 → 44 → 45 → 46

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 40. Settings Accordion Restructure | v2.0 | 0/TBD | Not started | - |
| 41. Neon Auth + Privy Removal | v2.0 | 0/TBD | Not started | - |
| 42. Postgres Schema + Drizzle Setup | v2.0 | 0/TBD | Not started | - |
| 43. Sync Engine Core | v2.0 | 0/TBD | Not started | - |
| 44. Sync Service Integration | v2.0 | 0/TBD | Not started | - |
| 45. Data Migration | v2.0 | 0/TBD | Not started | - |
| 46. Server-Side Push Notifications | v2.0 | 0/TBD | Not started | - |
