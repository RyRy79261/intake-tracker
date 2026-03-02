# Requirements: Intake Tracker

**Defined:** 2026-03-02
**Core Value:** Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis is reliable and future AI querying is possible.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Schema

- [ ] **SCHM-01**: Dexie v10 migration with compound indexes for cross-domain queries (`[prescriptionId+scheduledDate]`, `[type+timestamp]`, etc.)
- [ ] **SCHM-02**: Migration test harness that verifies schema upgrades don't corrupt or brick the database
- [ ] **SCHM-03**: Event-sourced inventory — `currentStock` derived from `inventoryTransactions`, not stored as mutable counter
- [ ] **SCHM-04**: `updatedAt` timestamps on all tables for future sync readiness

### Services

- [ ] **SRVC-01**: All multi-table writes wrapped in `db.transaction` (fixes `takeDose`/`skipDose` atomicity bug)
- [ ] **SRVC-02**: Timezone-aware dose log generation — correct day-of-week for SA (UTC+2) and Germany (UTC+1/+2 DST) travel
- [ ] **SRVC-03**: Strict TypeScript across all services — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, Zod validation at boundaries, no `any`
- [ ] **SRVC-04**: Clean service layer boundaries — services don't import each other's internals, UI never touches `db.ts` directly
- [ ] **SRVC-05**: Cross-domain analytics service (`analytics-service.ts`) as query seam for future AI analysis
- [ ] **SRVC-06**: Fractional dose depletion math — half and quarter pill tracking with correct inventory decrement

### Medication UX

- [ ] **MEDX-01**: Prescription-first views — compound identity as primary, not brand names
- [ ] **MEDX-02**: Dose logging with schedule display and automatic stock depletion
- [ ] **MEDX-03**: Retroactive dose logging — mark a dose taken at a specific past time
- [ ] **MEDX-04**: Multi-region inventory grouping — SA vs Germany brands clearly distinguished per compound
- [ ] **MEDX-05**: Fractional pill display — 0.5 tablet, 0.25 tablet shown clearly in UI
- [ ] **MEDX-06**: Today's medication dashboard — immediate view of due/taken/pending doses for the day
- [ ] **MEDX-07**: Schedule visualization — maintenance vs titration phases displayed clearly

### Interactions

- [ ] **INTR-01**: AI-powered compound interaction/contraindication data stored per prescription (via Perplexity or similar)
- [ ] **INTR-02**: Interaction check on add — warn when new prescription conflicts with existing ones
- [ ] **INTR-03**: Persistent interaction section on prescription detail view — known interactions, contraindications, drug class warnings (e.g., "no NSAIDs")
- [ ] **INTR-04**: Ad-hoc "can I take X?" lookup — check a substance against current prescriptions

### Notifications

- [ ] **NOTF-01**: Push notifications for scheduled doses (Android/PWA, iOS not required)

### Security

- [ ] **SECU-01**: API keys removed from client storage — Perplexity key server-side only
- [ ] **SECU-02**: Encryption foundations for data at rest (PIN + encryption patterns)
- [ ] **SECU-03**: Auth patterns designed for future cloud sync (no retrofit needed)

### Data Integrity

- [ ] **DATA-01**: Backup/export includes all tables — prescriptions, phases, inventory, dose logs, daily notes (currently missing)
- [ ] **DATA-02**: Backup round-trip test — export → clear → import → verify all data
- [ ] **DATA-03**: Audit logging for all medication operations

### Testability

- [ ] **TEST-01**: Vitest + fake-indexeddb test infrastructure configured and working
- [ ] **TEST-02**: Unit tests for all service layer functions
- [ ] **TEST-03**: Migration tests for schema version upgrades
- [ ] **TEST-04**: Timezone-specific test runs in both `TZ=Africa/Johannesburg` and `TZ=Europe/Berlin`

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
| SCHM-01 | Phase 1 | Pending |
| SCHM-02 | Phase 1 | Pending |
| SCHM-03 | Phase 1 | Pending |
| SCHM-04 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| SRVC-03 | Phase 2 | Pending |
| SRVC-04 | Phase 2 | Pending |
| SRVC-01 | Phase 3 | Pending |
| SRVC-02 | Phase 3 | Pending |
| SRVC-06 | Phase 3 | Pending |
| SRVC-05 | Phase 4 | Pending |
| SECU-01 | Phase 5 | Pending |
| SECU-02 | Phase 5 | Pending |
| SECU-03 | Phase 5 | Pending |
| MEDX-01 | Phase 6 | Pending |
| MEDX-02 | Phase 6 | Pending |
| MEDX-03 | Phase 6 | Pending |
| MEDX-04 | Phase 6 | Pending |
| MEDX-05 | Phase 6 | Pending |
| MEDX-06 | Phase 6 | Pending |
| MEDX-07 | Phase 7 | Pending |
| INTR-01 | Phase 8 | Pending |
| INTR-02 | Phase 8 | Pending |
| INTR-03 | Phase 8 | Pending |
| INTR-04 | Phase 8 | Pending |
| DATA-01 | Phase 9 | Pending |
| DATA-02 | Phase 9 | Pending |
| DATA-03 | Phase 9 | Pending |
| TEST-02 | Phase 10 | Pending |
| TEST-03 | Phase 10 | Pending |
| TEST-04 | Phase 10 | Pending |
| NOTF-01 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after roadmap creation — all 32 requirements mapped to phases 1-11*
