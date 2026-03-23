# Requirements: Intake Tracker

**Defined:** 2026-03-02
**Core Value:** Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis is reliable and future AI querying is possible.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Schema

- [x] **SCHM-01**: Dexie v10 migration with compound indexes for cross-domain queries (`[prescriptionId+scheduledDate]`, `[type+timestamp]`, etc.)
- [x] **SCHM-02**: Migration test harness that verifies schema upgrades don't corrupt or brick the database
- [x] **SCHM-03**: Event-sourced inventory — `currentStock` derived from `inventoryTransactions`, not stored as mutable counter
- [x] **SCHM-04**: `updatedAt` timestamps on all tables for future sync readiness

### Services

- [x] **SRVC-01**: All multi-table writes wrapped in `db.transaction` (fixes `takeDose`/`skipDose` atomicity bug)
- [ ] **SRVC-02**: Timezone-aware dose log generation — correct day-of-week for SA (UTC+2) and Germany (UTC+1/+2 DST) travel
- [x] **SRVC-03**: Strict TypeScript across all services — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Zod validation at boundaries, no `any`
- [x] **SRVC-04**: Clean service layer boundaries — services don't import each other's internals, UI never touches `db.ts` directly
- [x] **SRVC-05**: Cross-domain analytics service (`analytics-service.ts`) as query seam for future AI analysis
- [x] **SRVC-06**: Fractional dose depletion math — half and quarter pill tracking with correct inventory decrement

### Design System

- [ ] **DSGN-01**: Design tokens — all domain colors as CSS custom properties, Tailwind config entries, and Pencil variables with light/dark theme support
- [ ] **DSGN-02**: Pencil primitive components — all 17 shadcn/ui primitives mirrored as reusable Pencil components with 1:1 visual parity
- [ ] **DSGN-03**: Pencil domain components — intake cards, health metric cards, tracking cards, substance cards, medication components, app header, quick-nav footer
- [ ] **DSGN-04**: Screen designs — Dashboard, Medications (list + detail + flows), Analytics (4 tabs), Settings with populated/empty/loading/error state variants
- [ ] **DSGN-05**: Overlay designs — all dialogs, drawers, and wizard flows designed in Pencil
- [ ] **DSGN-06**: Design-first workflow — documented Pencil convention in CLAUDE.md for future phases

### Medication UX

- [x] **MEDX-01**: Prescription-first views — compound identity as primary, not brand names
- [x] **MEDX-02**: Dose logging with schedule display and automatic stock depletion
- [x] **MEDX-03**: Retroactive dose logging — mark a dose taken at a specific past time
- [x] **MEDX-04**: Multi-region inventory grouping — SA vs Germany brands clearly distinguished per compound
- [x] **MEDX-05**: Fractional pill display — 0.5 tablet, 0.25 tablet shown clearly in UI
- [x] **MEDX-06**: Today's medication dashboard — immediate view of due/taken/pending doses for the day
- [x] **MEDX-07**: Schedule visualization — maintenance vs titration phases displayed clearly

### Dashboard UX

- [x] **DASH-01**: Weight card inline increment/decrement input with pre-filled latest value and configurable step size
- [x] **DASH-02**: Blood pressure card with primary sys/dia inputs always visible and details in expandable section
- [x] **DASH-03**: Eating card one-tap log with inline expandable details (no popup dialog)
- [x] **DASH-04**: Urination card inline amount selector buttons with quick-log on tap (no popup dialog)
- [x] **DASH-05**: Defecation card inline amount selector buttons with quick-log on tap (no popup dialog)

### Interactions

- [x] **INTR-01**: AI-powered compound interaction/contraindication data stored per prescription (via Perplexity or similar)
- [x] **INTR-02**: Interaction check on add — warn when new prescription conflicts with existing ones
- [x] **INTR-03**: Persistent interaction section on prescription detail view — known interactions, contraindications, drug class warnings (e.g., "no NSAIDs")
- [x] **INTR-04**: Ad-hoc "can I take X?" lookup — check a substance against current prescriptions

### Notifications

- [ ] **NOTF-01**: Push notifications for scheduled doses (Android/PWA, iOS not required)

### Security

- [x] **SECU-01**: API keys removed from client storage — Perplexity key server-side only
- [x] **SECU-02**: Encryption foundations for data at rest (PIN + encryption patterns)
- [x] **SECU-03**: Auth patterns designed for future cloud sync (no retrofit needed)

### Data Integrity

- [x] **DATA-01**: Backup/export includes all tables — prescriptions, phases, inventory, dose logs, daily notes (currently missing)
- [x] **DATA-02**: Backup round-trip test — export → clear → import → verify all data
- [x] **DATA-03**: Audit logging for all medication operations

### Testability

- [x] **TEST-01**: Vitest + fake-indexeddb test infrastructure configured and working
- [x] **TEST-02**: Unit tests for all service layer functions
- [x] **TEST-03**: Migration tests for schema version upgrades
- [x] **TEST-04**: Timezone-specific test runs in both `TZ=Africa/Johannesburg` and `TZ=Europe/Berlin`

## v2 Requirements

### Sync

- **SYNC-01**: Cloud sync via Dexie Cloud (or "NanoDB") across devices

### AI Querying

- **AIQL-01**: Natural language questions against health data (cross-domain analysis)

### Reporting

- **REPT-01**: Doctor-ready report generation (PDF export with adherence, vitals, trends)
- **REPT-02**: Self-tracking dashboards beyond current charts

### Platform

- **PLAT-01**: Capacitor wrapper for Android Play Store distribution
- **PLAT-02**: iOS push notification support

## Out of Scope

| Feature | Reason |
|---------|--------|
| Licensed drug interaction database | AI-powered is sufficient for personal use; licensing is cost-prohibitive |
| Gamification | Creates shame and perverse incentives around logging accuracy |
| Multi-user support | Single-user personal app |
| iOS push notifications | PWA push unreliable on iOS; Android-first |
| Market positioning / business features | Open source, quality-first — not competing commercially |
| Real-time chat / social features | Not relevant to personal health tracking |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 1 | Complete |
| SCHM-02 | Phase 1 | Complete |
| SCHM-03 | Phase 1 | Complete |
| SCHM-04 | Phase 1 | Complete |
| TEST-01 | Phase 1 | Complete |
| SRVC-03 | Phase 2 | Complete |
| SRVC-04 | Phase 2 | Complete |
| SRVC-01 | Phase 3 | Complete |
| SRVC-02 | Phase 3 | Pending |
| SRVC-06 | Phase 3 | Complete |
| SRVC-05 | Phase 4 | Complete |
| SECU-01 | Phase 5 | Complete |
| SECU-02 | Phase 5 | Complete |
| SECU-03 | Phase 5 | Complete |
| DSGN-01 | Phase 5.1 | Pending |
| DSGN-02 | Phase 5.1 | Pending |
| DSGN-03 | Phase 5.1 | Pending |
| DSGN-04 | Phase 5.1 | Pending |
| DSGN-05 | Phase 5.1 | Pending |
| DSGN-06 | Phase 5.1 | Pending |
| MEDX-01 | Phase 6 | Complete |
| MEDX-02 | Phase 6 | Complete |
| MEDX-03 | Phase 6 | Complete |
| MEDX-04 | Phase 6 | Complete |
| MEDX-05 | Phase 6 | Complete |
| MEDX-06 | Phase 6 | Complete |
| MEDX-07 | Phase 7 | Complete |
| DASH-01 | Phase 6.1 | Complete |
| DASH-02 | Phase 6.1 | Complete |
| DASH-03 | Phase 6.1 | Complete |
| DASH-04 | Phase 6.1 | Complete |
| DASH-05 | Phase 6.1 | Complete |
| INTR-01 | Phase 8 | Complete |
| INTR-02 | Phase 8 | Complete |
| INTR-03 | Phase 8 | Complete |
| INTR-04 | Phase 8 | Complete |
| DATA-01 | Phase 9 | Complete |
| DATA-02 | Phase 9 | Complete |
| DATA-03 | Phase 9 | Complete |
| TEST-02 | Phase 10 | Complete |
| TEST-03 | Phase 10 | Complete |
| TEST-04 | Phase 10 | Complete |
| NOTF-01 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-20 after Phase 6.1 planning — 5 DASH requirements added, 43 total requirements mapped*
