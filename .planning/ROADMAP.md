# Roadmap: Intake Tracker

## Overview

This project is a personal health tracking PWA. v1.0 rebuilt the medication management subsystem, hardened the data model, and established test infrastructure. v1.1 redesigns the intake tracking UI with composable data entries (single input creates linked records across domains), unified input cards (Liquids with tabs, Food+Salt merged), AI-powered substance lookup with saved presets, and dashboard modernization (text metrics, card reordering, cleanup).

## Milestones

- **v1.0 Engineering Overhaul** - Phases 1-11 (shipped 2026-03-23)
- **v1.1 UI Overhaul** - Phases 12-17 (in progress)

## Phases

<details>
<summary>v1.0 Engineering Overhaul (Phases 1-11) - SHIPPED 2026-03-23</summary>

- [x] **Phase 1: Schema Foundation** - Dexie v10 migration with compound indexes, event-sourced inventory, sync-ready timestamps, and test infrastructure
- [x] **Phase 2: TypeScript and Service Contracts** - Strict TypeScript flags enabled with all latent errors fixed; clean service boundary rules enforced
- [x] **Phase 3: Service Layer Rebuild** - Medication services rebuilt with transactional atomicity, timezone-aware scheduling, and fractional dose math
- [x] **Phase 4: Analytics Service** - Cross-domain analytics service with substance tracking, correlation analysis, and analytics page replacing /history
- [x] **Phase 5: Security Hardening** - API keys server-side only, encryption foundations for data at rest, auth patterns ready for cloud sync (completed 2026-03-10)
- [x] **Phase 6: Medication UX Core** - Compound-first prescription views, dose logging with stock depletion, retroactive logging, multi-region inventory, prescriptions tab, wizard improvements
- [x] **Phase 6.1: Dashboard Input Redesign** - Replace popup modals with inline input flows for all dashboard intake metrics (completed 2026-03-20)
- [x] **Phase 7: Schedule Visualization** - Maintenance vs titration phase display with named phases and transition clarity (completed 2026-03-20)
- [x] **Phase 8: Drug Interactions** - AI-powered compound interaction data stored and surfaced per prescription with ad-hoc lookup (completed 2026-03-20)
- [x] **Phase 9: Data Integrity and Backup** - Backup includes all medication tables, audit logging enforced, round-trip test verified
- [x] **Phase 10: Test Coverage** - Full service unit test suite, migration tests, timezone-variant test runs (completed 2026-03-23)
- [x] **Phase 11: Push Notifications** - PWA/Android push notifications for scheduled doses (completed 2026-03-23)

### Phase 1: Schema Foundation
**Goal**: The Dexie schema is correct, safe to deploy, and tested before any service depends on it
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02, SCHM-03, SCHM-04, TEST-01
**Success Criteria** (what must be TRUE):
  1. Dexie upgrades to version 10 with compound indexes (`[prescriptionId+scheduledDate]`, `[inventoryItemId+timestamp]`, `[type+timestamp]`) without corrupting existing data
  2. Every entity table has `updatedAt` and `realmId?: string` fields (verifiable in IndexedDB DevTools)
  3. `currentStock` is no longer stored as a mutable counter on InventoryItem — computed value only, derived from transaction sum
  4. A migration test using `fake-indexeddb` runs against the version 10 upgrade and passes without errors
  5. Vitest test runner is configured, executes, and reports results in the terminal
**Plans**: 3

Plans:
- [x] 01-01: Test Infrastructure Setup (TEST-01)
- [x] 01-02: Dexie v10 Schema Rewrite (SCHM-01, SCHM-03, SCHM-04)
- [x] 01-03: Migration Test Suite (SCHM-02)

### Phase 2: TypeScript and Service Contracts
**Goal**: TypeScript strict flags are on, all surfaced bugs are fixed, and service boundary rules prevent UI from touching the database directly
**Depends on**: Phase 1
**Requirements**: SRVC-03, SRVC-04
**Success Criteria** (what must be TRUE):
  1. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled in tsconfig with zero `// @ts-ignore` suppressions
  2. `pnpm build` and `pnpm lint` pass with no TypeScript errors
  3. No component or page file contains an import from `db.ts` or any `*-service.ts` file (verifiable by grep)
  4. Zod validation schemas exist at all external data entry points (API routes, user input boundaries)
**Plans**: 4

Plans:
- [x] 02-01-PLAN.md — Strict TypeScript flags + ServiceResult foundation + service-layer fixes
- [x] 02-02-PLAN.md — ESLint import boundaries + UI TypeScript fixes + any elimination
- [x] 02-03-PLAN.md — Import boundary enforcement (hooks refactoring)
- [x] 02-04-PLAN.md — Zod validation at all external boundaries (API routes, AI responses, forms)

### Phase 3: Service Layer Rebuild
**Goal**: All multi-table medication writes are atomic, dose scheduling is timezone-aware for SA/Germany travel, and fractional pill math is correct
**Depends on**: Phase 2
**Requirements**: SRVC-01, SRVC-02, SRVC-06
**Success Criteria** (what must be TRUE):
  1. Taking or skipping a dose is a single `db.transaction` — a crash between stock decrement and dose log creation cannot produce inconsistent state
  2. `scheduledDate` is generated from local date (not UTC), and the device timezone is stored with each dose log
  3. Logging a half-pill dose decrements inventory by 0.5 of the physical pill unit, not by the prescribed dose amount
  4. The phase-activation invariant (only one active phase per prescription) is enforced inside a transaction in `activatePhase()`
**Plans**: 5

Plans:
- [x] 03-01-PLAN.md — Dexie v11 schema migration + timezone utilities + audit service
- [x] 03-02-PLAN.md — Medication service rebuild with atomic transactions, fractional math, audit logging
- [x] 03-03-PLAN.md — Non-medication service cleanup + hook useLiveQuery migration
- [x] 03-04-PLAN.md — Dose schedule service (derive-at-read) + medication hook migration
- [x] 03-05-PLAN.md — Inventory stock recalculation + debug panel rebuild

### Phase 4: Analytics Service
**Goal**: A dedicated analytics service provides cross-domain query shapes, substance tracking, correlation analysis, insights, and a unified analytics page -- the data foundation for future AI analysis
**Depends on**: Phase 3
**Requirements**: SRVC-05
**Success Criteria** (what must be TRUE):
  1. `analytics-service.ts` exists in `src/lib/` and provides at least fluid balance and medication adherence query functions
  2. The analytics service reads from multiple domain services but writes nothing and has no side effects
  3. Calling an analytics query returns a typed result usable by a React Query hook without additional transformation
**Plans**: 8

Plans:
- [x] 04-01-PLAN.md — Analytics types + stats helpers + core analytics service
- [x] 04-02-PLAN.md — Dexie v12 migration + substance service + substance hooks
- [x] 04-03-PLAN.md — Query registry + analytics hooks
- [x] 04-04-PLAN.md — Substance dashboard UI + type picker + settings
- [x] 04-05-PLAN.md — Analytics page shell + time range selector + records tab
- [x] 04-06-PLAN.md — Insights tab + insight banners + dashboard badge
- [x] 04-07-PLAN.md — Correlations tab + titration tab
- [x] 04-08-PLAN.md — PDF/CSV export + cleanup + backup update

### Phase 5: Security Hardening
**Goal**: No secrets are exposed to the client, data at rest has encryption foundations, and auth patterns require no retrofit when cloud sync is added
**Depends on**: Phase 2
**Requirements**: SECU-01, SECU-02, SECU-03
**Success Criteria** (what must be TRUE):
  1. The Perplexity API key is only accessible server-side — no environment variable prefixed `NEXT_PUBLIC_` contains any API key
  2. Scanning the compiled client bundle (`pnpm build` output) finds no API key strings
  3. PIN-based access control has a documented encryption pattern for data at rest (even if full encryption is deferred, the foundation pattern is in place)
  4. Auth session handling is documented as sync-ready (no auth patterns that would require breaking changes for Dexie Cloud)
**Plans**: 3

Plans:
- [x] 05-01-PLAN.md — Auth middleware + client API key removal from store, security utils, hooks, and components (SECU-01, SECU-03)
- [x] 05-02-PLAN.md — Encryption foundations: useEncryptedField hook, encrypted backup, SECURITY.md (SECU-02)
- [x] 05-03-PLAN.md — API route auth migration, bundle security scan, PII hardening, CSP refinement (SECU-01, SECU-03)

### Phase 6: Medication UX Core
**Goal**: A user can manage their full medication workflow — view prescriptions by compound, log doses, track retroactive doses, manage prescriptions and titration phases, and see clearly which regional brand stock is being used
**Depends on**: Phase 3, Phase 5
**Requirements**: MEDX-01, MEDX-02, MEDX-03, MEDX-04, MEDX-05, MEDX-06, MEDX-07
**Success Criteria** (what must be TRUE):
  1. The prescription list shows compound name as the primary identity; brand names appear as sub-labels under each compound
  2. Tapping "Take" on today's dose dashboard decrements the correct inventory item's stock and records the dose log in a single operation
  3. A user can log a dose that was taken yesterday at a specific time using a time picker pre-filled to the scheduled time (not current time)
  4. SA and Germany inventory items for the same prescription are visually grouped under one compound entry with region and brand clearly labeled
  5. Fractional doses (0.5 tablet, 0.25 tablet) display correctly in both the schedule and the dose confirmation UI
  6. Today's medication dashboard shows due, taken, and pending doses at a glance without navigating to the prescription detail
  7. Prescriptions tab shows active prescriptions with dosage, schedule, and titration phase management
**Plans**: 7 plans

Plans:
- [x] 06-01-PLAN.md — Tab restructure (5->3 tabs) + shared utilities + compound card (collapsed) (MEDX-01, MEDX-04, MEDX-05)
- [x] 06-02-PLAN.md — Compound card expanded view + brand switching + multi-region inventory (MEDX-01, MEDX-04)
- [x] 06-03-PLAN.md — Schedule dashboard rebuild with inline Take/Skip, progress summary, undo toast (MEDX-02, MEDX-05, MEDX-06)
- [x] 06-04-PLAN.md — Retroactive dose logging + dose detail with Untake + visual verification (MEDX-03)
- [x] 06-05-PLAN.md — Bug fixes (boolean indexing, expanded card, inventory nav) + 4th tab + editable refills (MEDX-01, MEDX-02, MEDX-04)
- [x] 06-06-PLAN.md — Prescriptions tab with list, detail drawer, titration phases, notes (MEDX-05, MEDX-06, MEDX-07)
- [x] 06-07-PLAN.md — Wizard AI auto-select + prescription assignment + compound card relationship (MEDX-01, MEDX-03)

### Phase 6.1: Dashboard Input Redesign (INSERTED)
**Goal:** Replace popup modals with inline input flows for all dashboard intake metrics (weight, BP, eating, urination, defecation). Weight gets increment/decrement with pre-filled last value. Others get comprehensive inline inputs like the water/coffee pattern.
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Depends on:** Phase 6
**Success Criteria** (what must be TRUE):
  1. Weight card shows increment/decrement buttons flanking a centered value pre-filled with latest recorded weight
  2. Blood pressure card has systolic/diastolic inputs always visible with details (HR, position, arm) in expandable section
  3. Eating card has one-tap "I ate" button with optional inline expandable details (no popup)
  4. Urination card has inline small/medium/large amount buttons that log on tap (no popup)
  5. Defecation card has inline small/medium/large amount buttons that log on tap (no popup)
  6. No card uses a Dialog component for new entry creation — modals only for editing existing records
**Plans:** 2/2 plans complete

Plans:
- [x] 06.1-01-PLAN.md — Weight card increment/decrement + BP card expandable details (DASH-01, DASH-02)
- [x] 06.1-02-PLAN.md — Eating, urination, defecation cards with inline inputs (DASH-03, DASH-04, DASH-05)

### Phase 7: Schedule Visualization
**Goal**: A user can see their titration and maintenance phases laid out clearly, understanding which phase is active and what the transition looks like
**Depends on**: Phase 6
**Requirements**: MEDX-07
**Success Criteria** (what must be TRUE):
  1. The prescription detail view shows named phases (e.g., "Titration Week 1", "Maintenance") in a visual timeline or list
  2. The active phase is clearly distinguished from past and future phases
  3. A maintenance phase vs titration phase are visually distinct — the user can tell at a glance which type is active
**Plans**: 1

Plans:
- [x] 07-01-PLAN.md — PhaseTimeline component + PrescriptionDetailDrawer integration (MEDX-07)

### Phase 8: Drug Interactions
**Goal**: A user can see known interactions and contraindications for their prescriptions and check whether a new substance is safe to take
**Depends on**: Phase 6
**Requirements**: INTR-01, INTR-02, INTR-03, INTR-04
**Success Criteria** (what must be TRUE):
  1. Each prescription detail view has a persistent "Interactions" section showing known contraindications (e.g., "no NSAIDs") and drug class warnings
  2. Adding a new prescription triggers an AI interaction check against existing prescriptions and surfaces any conflicts before saving
  3. A user can type a substance name into an ad-hoc lookup and get a result indicating whether it conflicts with any current prescription
  4. Interaction data is stored per prescription in the database — it persists offline without re-querying the AI
**Plans**: 3

Plans:
- [x] 08-01-PLAN.md — Interaction-check API route + localStorage cache + React hooks (INTR-01)
- [x] 08-02-PLAN.md — Interactions section in prescription drawer + wizard conflict check (INTR-02, INTR-03)
- [x] 08-03-PLAN.md — Ad-hoc substance interaction search on Medications tab (INTR-04)

### Phase 9: Data Integrity and Backup
**Goal**: A user's full medication history is included in backups and can be fully restored, and all medication mutations produce an audit trail
**Depends on**: Phase 6
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Triggering a backup export produces a file that includes prescriptions, phases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, and auditLogs
  2. Clearing all app data and restoring from the exported backup results in all medication records being present and correct (verifiable by count and spot-check)
  3. Every medication mutation (take dose, skip dose, add prescription, adjust inventory) produces an entry in the audit log table
**Plans**: 2

Plans:
- [x] 09-01-PLAN.md — Extend backup to all 16 tables + conflict detection + round-trip tests (DATA-01, DATA-02, DATA-03)
- [x] 09-02-PLAN.md — Conflict review Drawer UI + import confirmation + summary flow (DATA-02)

### Phase 10: Test Coverage
**Goal**: All service functions have unit tests, all migration paths are tested, and the test suite runs correctly under both SA and Germany timezones
**Depends on**: Phase 3, Phase 9
**Requirements**: TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `pnpm test` runs a Vitest suite that covers all functions in all `*-service.ts` files with no skipped tests
  2. Every Dexie schema migration path from version 1 through current has a test that verifies the upgrade completes without data loss
  3. Running the full test suite with `TZ=Africa/Johannesburg` and `TZ=Europe/Berlin` both pass with no timezone-related failures
  4. No service function has a test that passes by accident — timezone edge cases, fractional dose math, and phase-activation invariant each have explicit assertions
**Plans**: 3

Plans:
- [x] 10-01-PLAN.md — Dose log service + dose schedule service unit tests (TEST-02, TEST-04)
- [x] 10-02-PLAN.md — Medication service + titration service unit tests (TEST-02)
- [x] 10-03-PLAN.md — P2 service tests + migration tests v11/v13/v14 + timezone dual-pass scripts (TEST-02, TEST-03, TEST-04)

### Phase 11: Push Notifications
**Goal**: The app sends push notifications for scheduled medication doses on Android/PWA without requiring the app to be open
**Depends on**: Phase 6
**Requirements**: NOTF-01
**Success Criteria** (what must be TRUE):
  1. A user on Android receives a push notification at the scheduled dose time even if the app is in the background or closed
  2. Tapping the notification navigates directly to the dose confirmation for the relevant medication
  3. Notifications respect the user's day-start-hour setting and do not fire for missed doses from previous days
**Plans**: 3

Plans:
- [x] 11-01-PLAN.md — Server infrastructure: push-db, push-sender, VAPID script, SQL migration, service worker push handlers (NOTF-01)
- [x] 11-02-PLAN.md — API routes (subscribe, unsubscribe, sync-schedule, send) + client push subscription (NOTF-01)
- [x] 11-03-PLAN.md — Settings UI, Zustand fields, schedule sync hook, medication page wiring (NOTF-01)

</details>

### v1.1 UI Overhaul (In Progress)

**Milestone Goal:** Redesign the intake tracking UI with composable data entries, unified input cards, AI-powered substance lookup, and dashboard modernization

- [x] **Phase 12: Composable Data Foundation** - Dexie v15 schema migration with groupId, composable entry service for atomic cross-table writes, and soft-delete standardization (completed 2026-03-23)
- [x] **Phase 13: Liquid Presets and AI Lookup** - Zustand preset store for beverages and AI-powered caffeine/alcohol per-100ml lookup route (completed 2026-03-24)
- [x] **Phase 14: Unified Liquids Card** - Tabbed water/coffee/alcohol card with preset-based logging and substance auto-calculation (completed 2026-03-24)
- [x] **Phase 15: Unified Food+Salt Card** - Merged food and salt input with AI parsing that creates composable linked entries (completed 2026-03-24)
- [x] **Phase 16: Dashboard Cleanup and Text Metrics** - BP heart rate visible, food calculator removed, text metrics, coffee settings migrated, card reordering (completed 2026-03-24)
- [x] **Phase 17: Timezone-Aware Dose Logging** - Correct day-of-week schedule generation for SA/Germany timezones with device timezone stored per dose log (completed 2026-03-26)

## Phase Details

### Phase 12: Composable Data Foundation
**Goal**: A composable entry service can atomically create, read, and soft-delete linked records across multiple tables, backed by a tested Dexie v15 schema migration
**Depends on**: Phase 11 (continues from v1.0)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Creating a composable entry with food, water, and salt data produces records in eatingRecords, intakeRecords, and substanceRecords that all share the same groupId
  2. Dexie v15 migration adds groupId index to intakeRecords, eatingRecords, and substanceRecords without corrupting any existing records (verified by migration test with fake-indexeddb)
  3. Deleting a composable entry group sets deletedAt on all linked records in a single transaction -- no orphaned records survive if any individual delete fails
  4. Querying by groupId via useLiveQuery returns all linked records across tables in a single reactive callback
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md -- Dexie v15 schema migration + soft-delete standardization (COMP-02, COMP-03)
- [x] 12-02-PLAN.md -- Composable entry service + hooks (COMP-01, COMP-03, COMP-04)

### Phase 13: Liquid Presets and AI Lookup
**Goal**: Users can save beverage presets with substance content and look up caffeine/alcohol concentrations via AI, ready for the Liquids card to consume
**Depends on**: Phase 12
**Requirements**: LIQD-02, LIQD-03
**Success Criteria** (what must be TRUE):
  1. User can create, edit, and delete beverage presets (name, type, default volume, substance-per-100ml) that persist across app restarts
  2. Hitting the AI lookup for a beverage name returns a caffeine-per-100ml or alcohol-per-100ml estimate with Zod-validated bounds, and the user can edit the value before saving as a preset
  3. Existing coffee presets are available as built-in defaults in the new preset system (seeded from current COFFEE_PRESETS constant)
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md -- Preset system in Zustand + shared Claude client + DEFAULT_LIQUID_PRESETS (LIQD-02)
- [x] 13-02-PLAN.md -- Migrate all 5 Perplexity AI routes to Claude + new substance-lookup route (LIQD-03)
- [x] 13-03-PLAN.md -- Perplexity cleanup: rename client lib, update imports, env, docs, CSP, bundle test (LIQD-02, LIQD-03)

### Phase 14: Unified Liquids Card
**Goal**: Users can track water, coffee, and alcohol from a single tabbed Liquids card, with water preserving its existing zero-friction UX and coffee/alcohol using presets with auto-calculated substance amounts
**Depends on**: Phase 12, Phase 13
**Requirements**: LIQD-01, LIQD-04
**Success Criteria** (what must be TRUE):
  1. The Liquids card shows water, coffee, and alcohol as tabs -- the water tab preserves the existing increment/decrement buttons and daily total exactly as they work today
  2. Selecting a coffee or alcohol preset and confirming a volume logs an intake record and a linked substance record with the correct calculated amount (volume * per-100ml / 100)
  3. The user can switch between tabs without losing in-progress input on any tab
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md -- LiquidsCard shell + WaterTab + BeverageTab (LIQD-01)
- [x] 14-02-PLAN.md -- PresetTab for Coffee/Alcohol + dashboard swap (LIQD-01, LIQD-04)

### Phase 15: Unified Food+Salt Card
**Goal**: Users can log food and salt from a single card, with AI food parsing automatically creating composable linked entries across eating, water, and salt domains
**Depends on**: Phase 12, Phase 13
**Requirements**: FOOD-01, FOOD-02, FOOD-03
**Success Criteria** (what must be TRUE):
  1. The Food+Salt card provides both AI food input and manual salt input (salt tablets, seasoning) in a single unified card
  2. Typing a food description and triggering AI parse shows a preview of all linked records (eating, water, salt) that will be created, with the ability to edit or remove individual entries before confirming
  3. Confirming an AI food parse atomically creates all linked records via the composable entry service -- all records share a groupId and appear as a unit in the UI
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md -- SaltSection + ComposablePreview + FoodSection components (FOOD-01, FOOD-02, FOOD-03)
- [x] 15-02-PLAN.md -- FoodSaltCard shell + dashboard integration (FOOD-01, FOOD-02, FOOD-03)

### Phase 16: Dashboard Cleanup and Text Metrics
**Goal**: The intake dashboard is reorganized with text metrics replacing graphs, cleaned-up cards in the correct order, and quick UI wins applied
**Depends on**: Phase 14, Phase 15
**Requirements**: DASH-06, DASH-07, DASH-08, DASH-09, DASH-10
**Success Criteria** (what must be TRUE):
  1. Heart rate input is always visible on the blood pressure card without needing to expand "more options"
  2. The food calculator feature is fully removed from the codebase (no dead code, no route, no UI entry point)
  3. The intake page shows text-based metrics -- today's water/salt limits with progress, caffeine and alcohol totals, and a weekly summary starting Monday -- instead of inline graphs
  4. Coffee settings have been migrated to serve as liquid tab defaults in the unified Liquids card
  5. Cards on the intake page appear in order: Liquids, Food+Salt, then remaining health metric cards (BP, weight, urination, defecation)
**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md -- LiquidPreset multi-substance model + composable entry service extension + Zustand v3 migration (DASH-09)
- [x] 16-02-PLAN.md -- TextMetrics component + BP heart rate promotion + Liquid Presets tab + PresetTab update + dashboard reorder (DASH-06, DASH-08, DASH-09, DASH-10)
- [x] 16-03-PLAN.md -- Dead code deletion: 13 replaced files + constants/themes/settings cleanup (DASH-07)
**UI hint**: yes



### Phase 17: Timezone-Aware Dose Logging
**Goal**: Dose log generation produces correct schedules when the user travels between South Africa and Germany, with each dose log recording the device timezone at time of logging
**Depends on**: Phase 11
**Requirements**: TMZN-01
**Success Criteria** (what must be TRUE):
  1. Dose schedule generation produces correct day-of-week slots for UTC+2 (SA) and UTC+1/UTC+2 DST (Germany) without manual user intervention
  2. Each dose log record stores the device timezone at the time of logging, enabling retrospective analysis of when doses were taken relative to local time
  3. Switching device timezone (simulating travel) does not duplicate or drop scheduled dose slots for the transition day
**Plans**: 2 plans

Plans:
- [x] 17-01-PLAN.md -- Timezone cache-busting + recalculateScheduleTimezones service + audit action + tests (TMZN-01)
- [x] 17-02-PLAN.md -- Timezone detection hook + confirmation dialog + provider wiring (TMZN-01)

## Progress

**Execution Order:**
v1.0: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 6.1 -> 7 -> 8 -> 9 -> 10 -> 11
v1.1: 12 -> 13 -> 14 -> 15 -> 16 -> 17

Note: Phase 14 and Phase 15 both depend on Phase 12 and 13 but are independent of each other -- they can execute in either order. Phase 17 depends only on Phase 11 and can execute in parallel with earlier v1.1 phases if needed.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. TypeScript and Service Contracts | v1.0 | 4/4 | Complete | - |
| 3. Service Layer Rebuild | v1.0 | 5/5 | Complete | - |
| 4. Analytics Service | v1.0 | 8/8 | Complete | - |
| 5. Security Hardening | v1.0 | 3/3 | Complete | 2026-03-10 |
| 6. Medication UX Core | v1.0 | 7/7 | Complete | 2026-03-20 |
| 6.1. Dashboard Input Redesign | v1.0 | 2/2 | Complete | 2026-03-20 |
| 7. Schedule Visualization | v1.0 | 1/1 | Complete | 2026-03-20 |
| 8. Drug Interactions | v1.0 | 3/3 | Complete | 2026-03-20 |
| 9. Data Integrity and Backup | v1.0 | 2/2 | Complete | - |
| 10. Test Coverage | v1.0 | 3/3 | Complete | 2026-03-23 |
| 11. Push Notifications | v1.0 | 3/3 | Complete | 2026-03-23 |
| 12. Composable Data Foundation | v1.1 | 2/2 | Complete    | 2026-03-23 |
| 13. Liquid Presets and AI Lookup | v1.1 | 3/3 | Complete    | 2026-03-24 |
| 14. Unified Liquids Card | v1.1 | 2/2 | Complete    | 2026-03-24 |
| 15. Unified Food+Salt Card | v1.1 | 2/2 | Complete    | 2026-03-24 |
| 16. Dashboard Cleanup and Text Metrics | v1.1 | 3/3 | Complete    | 2026-03-24 |
| 17. Timezone-Aware Dose Logging | v1.1 | 2/2 | Complete    | 2026-03-26 |
