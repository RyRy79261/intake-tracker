# Requirements: Intake Tracker

**Defined:** 2026-04-11
**Core Value:** Accurate, queryable health data across all domains — intake, vitals, bodily functions, and medication adherence — structured so that cross-domain analysis is reliable and future AI querying is possible.

## v2.0 Requirements

Requirements for cloud sync and settings overhaul milestone. Each maps to roadmap phases.

### Settings Restructure

- [ ] **SET-01**: User sees settings organized as expandable accordions grouped by color code instead of a flat list
- [ ] **SET-02**: User configures urination/defecation defaults, weight graph toggles, and liquid presets inline within their respective sections (Customization modal removed)
- [ ] **SET-03**: User finds animation timing settings (scroll speed, hide delay, transition speed) in a dedicated UI/UX section
- [ ] **SET-04**: User configures medication settings (dose reminders, time format, follow-up config) on the main settings page
- [ ] **SET-05**: User sees a Storage & Security section with sync status, storage info, and migration entry point
- [ ] **SET-06**: No settings modals exist except the Debug panel

### Authentication

- [ ] **AUTH-01**: User can log in with email and password via Neon Auth
- [ ] **AUTH-02**: PIN gate fully removed (pin-service, pin-dialog, use-pin-gate deleted)
- [ ] **AUTH-03**: All API routes authenticate via Neon Auth sessions (Privy middleware replaced)
- [ ] **AUTH-04**: Privy provider, dependencies, and env vars fully removed from codebase
- [ ] **AUTH-05**: E2E tests use Neon Auth login flow instead of Privy OTP iframe

### NeonDB Schema

- [ ] **SCHEMA-01**: All 16 Dexie tables have matching Postgres tables defined via Drizzle ORM
- [ ] **SCHEMA-02**: Every Postgres row has a user_id FK tying it to the authenticated user
- [ ] **SCHEMA-03**: Neon database is clean (old test data wiped, fresh schema applied)
- [ ] **SCHEMA-04**: CI test validates parity between Dexie schema and Drizzle schema

### Sync Engine

- [ ] **SYNC-01**: User's writes go to IndexedDB immediately regardless of network state
- [ ] **SYNC-02**: Background sync queue pushes dirty records to NeonDB in batches when online
- [ ] **SYNC-03**: App pulls new/updated records from NeonDB on startup and periodically
- [ ] **SYNC-04**: Conflicts resolved via record-level last-write-wins using updatedAt timestamps
- [ ] **SYNC-05**: App detects online/offline state and syncs automatically on reconnect
- [ ] **SYNC-06**: Sync status (last sync time, online/offline, health) visible in Storage & Security section

### Data Migration

- [ ] **MIG-01**: User can trigger one-time migration wizard to upload IndexedDB data to NeonDB
- [ ] **MIG-02**: Migration requires a mandatory backup before starting
- [ ] **MIG-03**: Migration is resumable if interrupted (cursor-based progress persisted)
- [ ] **MIG-04**: Migration verifies success with row count comparison

### Push Notifications

- [ ] **PUSH-01**: Server-side cron triggers push notification delivery (client-side polling removed)
- [x] **PUSH-02**: Push subscriptions use Neon Auth user identity

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Sync Enhancements

- **SYNC-F01**: Per-field timestamp merge conflict resolution (upgrade from record-level LWW)
- **SYNC-F02**: Conflict review UI for manual resolution
- **SYNC-F03**: Manual "Sync Now" button for user confidence
- **SYNC-F04**: Settings sync to cloud (Zustand settings persisted to NeonDB user_settings table)

### Server-Side Intelligence

- **INTEL-F01**: Server-side insights queries running on NeonDB instead of client-side IndexedDB
- **INTEL-F02**: AI-powered data querying / natural language questions

### Export & Reporting

- **EXPORT-F01**: Doctor-ready report generation / PDF export

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time sync (WebSockets) | Single-user app — poll-based sync is sufficient |
| CRDT-based sync | Designed for multi-user; record-level LWW solves this adequately |
| Toggle between local-only and remote-sync modes | Doubles testing surface for no user benefit |
| Granular per-table sync controls | Partial sync creates orphaned FK references across 16 tables |
| OAuth/social login | Email/password sufficient for single-user app |
| Native/Android app | Future milestone, PWA-first |
| Multi-user support | Single-user app |
| @neondatabase/auth-ui (alpha) | Pre-built UI kit is alpha quality; build custom forms with existing shadcn/ui |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SET-01 | Phase 40 | Pending |
| SET-02 | Phase 40 | Pending |
| SET-03 | Phase 40 | Pending |
| SET-04 | Phase 40 | Pending |
| SET-05 | Phase 40 | Pending |
| SET-06 | Phase 40 | Pending |
| AUTH-01 | Phase 41 | Pending |
| AUTH-02 | Phase 41 | Pending |
| AUTH-03 | Phase 41 | Pending |
| AUTH-04 | Phase 41 | Pending |
| AUTH-05 | Phase 41 | Pending |
| PUSH-02 | Phase 41 | Complete |
| SCHEMA-01 | Phase 42 | Pending |
| SCHEMA-02 | Phase 42 | Pending |
| SCHEMA-03 | Phase 42 | Pending |
| SCHEMA-04 | Phase 42 | Pending |
| SYNC-01 | Phase 43 | Pending |
| SYNC-02 | Phase 43 | Pending |
| SYNC-03 | Phase 43 | Pending |
| SYNC-04 | Phase 43 | Pending |
| SYNC-05 | Phase 43 | Pending |
| SYNC-06 | Phase 44 | Pending |
| MIG-01 | Phase 45 | Pending |
| MIG-02 | Phase 45 | Pending |
| MIG-03 | Phase 45 | Pending |
| MIG-04 | Phase 45 | Pending |
| PUSH-01 | Phase 46 | Pending |

**Coverage:**
- v2.0 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation*
