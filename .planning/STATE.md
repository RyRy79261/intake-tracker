---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Phase 8 context gathered
last_updated: "2026-03-20T18:38:58.515Z"
progress:
  total_phases: 12
  completed_phases: 8
  total_plans: 35
  completed_plans: 35
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** Accurate, queryable health data across intake, vitals, and medication adherence — structured for cross-domain analysis and future AI querying
**Current focus:** Phase 07 — schedule-visualization

## Current Position

Phase: 07 (schedule-visualization) — COMPLETE
Plan: 1 of 1 (all complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: 6.9 min
- Total execution time: 1.57 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Schema Foundation | 3 | 11 min | 3.7 min |
| 2 - TypeScript and Service Contracts | 4 | 29 min | 7.3 min |
| 3 - Service Layer Rebuild | 5 | 48 min | 9.6 min |
| 4 - Analytics Service | 2 | 6 min | 3.0 min |

**Recent Trend:**

- Last 5 plans: 03-03 (9 min), 03-04 (9 min), 03-05 (9 min), 04-01 (est), 04-02 (6 min)
- Trend: stable

*Updated after each plan completion*
| Phase 04 P01 | 10min | 2 tasks | 5 files |
| Phase 04 P03 | 2min | 2 tasks | 3 files |
| Phase 04 P04 | 6min | 2 tasks | 7 files |
| Phase 04 P06 | 4min | 2 tasks | 6 files |
| Phase 04 P05 | 16min | 2 tasks | 9 files |
| Phase 04 P07 | 16min | 2 tasks | 4 files |
| Phase 04 P08 | 9min | 2 tasks | 6 files |
| Phase 04 P09 | 2min | 2 tasks | 1 files |
| Phase 04 P10 | 4min | 2 tasks | 2 files |
| Phase 05 P01 | 13min | 2 tasks | 13 files |
| Phase 05 P02 | 7min | 2 tasks | 3 files |
| Phase 05 P03 | 11min | 2 tasks | 10 files |
| Phase 06 P01 | 8min | 2 tasks | 7 files |
| Phase 06 P03 | 55min | 2 tasks | 8 files |
| Phase 06 P02 | 51min | 2 tasks | 3 files |
| Phase 06 P05 | 7min | 2 tasks | 10 files |
| Phase 06 P07 | 14min | 2 tasks | 3 files |
| Phase 06 P06 | 14min | 2 tasks | 6 files |
| Phase 06.1 P02 | 5min | 2 tasks | 3 files |
| Phase 06.1 P01 | 7min | 2 tasks | 3 files |
| Phase 07 P01 | 10min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-phase]: Build order is non-negotiable — schema before services, services before UI (Dexie migrations are irreversible)
- [Pre-phase]: `currentStock` derived from `inventoryTransactions` sum, never stored as mutable counter (sync-hostile pattern eliminated)
- [Pre-phase]: Phase 5 (Security) depends on Phase 2 only — can run parallel to Phase 3 if needed
- [Pre-phase]: useLiveQuery vs. React Query reactivity decision is an open architectural question — must be resolved before Phase 3 begins (see research/SUMMARY.md)
- [01-01]: Node environment (not jsdom) for vitest since fake-indexeddb patches global IDB directly
- [01-01]: Explicit vitest imports (globals: false) for clarity and IDE support
- [01-01]: Fixture factories use `as Type` casts for forward-compat with Plan 01-02 schema additions
- [01-02]: Consolidated v4-v9 into single v10 — old migration code deleted (already ran on production)
- [01-02]: deletedAt uses null (not undefined) for IndexedDB indexability
- [01-02]: deviceId backfill uses "migrated-v10" literal for all existing records
- [01-02]: Legacy medications/medicationSchedules tables omitted from v10 (Dexie deletes them)
- [01-02]: currentStock kept as deprecated optional — services still read until Phase 3
- [01-03]: Fixed import path from @/tests/fixtures to @/__tests__/fixtures (plan had wrong path alias)
- [02-02]: Conditional spread pattern for exactOptionalPropertyTypes: ...(val !== undefined && { prop: val })
- [02-02]: AddDailyNoteInput interface extracted for daily-notes-drawer (raw Omit<DailyNote> required deletedAt/deviceId)
- [02-03]: useHistoryData hook encapsulates multi-service loading (preserves manual state management in history page)
- [02-03]: DoseLogWithDetails re-exported from hooks layer (components never import from services)
- [02-03]: ESLint test override added for src/__tests__/**
- [02-04]: Co-located Zod schemas per file (not centralized)
- [02-04]: AI response validation uses retry-once then 422 with fallbackToManual
- [02-04]: Per-step validation in medication wizard (search, schedule, inventory)
- [03-01]: UTC offset via locale-string diff trick (cross-browser reliable without external libs)
- [03-01]: Migration uses hardcoded timezone rules (not device timezone) for backfill
- [03-01]: PhaseSchedule keeps deprecated time field alongside scheduleTimeUTC for v10 compat
- [03-02]: Stock math inlined into dose transactions (no nested transactions -- Dexie Pitfall 4)
- [03-02]: Negative stock allowed with no blocking per user decision
- [03-02]: Individual transactions per dose in takeAll/skipAll (one failure doesn't block others)
- [03-02]: Components pass dosageMg (mg) not pill count -- service handles pill math internally
- [03-03]: useLiveQuery default values eliminate loading states for array-returning hooks
- [03-03]: graphKeys export removed (no invalidation needed with useLiveQuery)
- [03-03]: Optimistic updates removed from health add mutations (useLiveQuery provides fast enough reactivity)
- [03-04]: useLiveQuery default values eliminate loading states for medication hooks (instant render with [])
- [03-04]: History hook returns reactive data object instead of async fetch callback
- [03-04]: Rescheduled dose slots map to skipped status in DoseSlot derivation
- [03-04]: Inventory warnings prioritize negative_stock over odd_fraction
- [03-05]: ESLint override added for providers.tsx (infrastructure file needs service import for stock recalculation init)
- [03-05]: Debug panel uses collapsible sections (not tabs) for audit logs, stock management, raw records
- [04-02]: v12 migration uses keyword matching on intake note field (no network calls in migration)
- [04-02]: Only one substance record per intake record (first keyword match wins, caffeine before alcohol)
- [04-02]: Background enrichment batches 5 records with 1s delay between batches
- [04-02]: Substance-intake linking via source field format 'substance:{id}'
- [Phase 04-01]: db.ts import exception for substance records (no substance-service exists yet)
- [Phase 04-01]: Map.forEach instead of for-of iteration (downlevelIteration not enabled)
- [Phase 04-01]: Conditional spread for optional heartRate (exactOptionalPropertyTypes compliance)
- [Phase 04]: Registry uses flat array with find-by-id (8 entries, no Map overhead needed)
- [Phase 04]: Field-level update pattern for substance settings (not Partial<T> spread) due to exactOptionalPropertyTypes
- [Phase 04]: Caffeine yellow / alcohol fuchsia card themes to differentiate from existing amber salt and rose BP
- [Phase 04-06]: isDismissed uses ratio-based threshold (10%) against trigger value for insight reappearance
- [Phase 04-06]: Analytics page reads ?tab= URL param so InsightBadge navigation opens correct tab
- [Phase 04]: useRecordsTabData hook aggregates all domain services into unified sorted array (respects no-direct-service-import ESLint rule)
- [Phase 04]: UnifiedRecord extended with caffeine/alcohol types, RecordRow handles substance display
- [Phase 04]: Substance records are delete-only (no edit dialog) since derived from intake records
- [Phase 04]: [04-07]: ESLint override for titration-tab.tsx (direct service calls in useLiveQuery -- hooks cannot be nested)
- [Phase 04]: [04-07]: CorrelationChart auto-selects overlay vs scatter based on data shape (lagDays > 0 or series > 5)
- [Phase 04]: [04-07]: Titration data loaded via single useLiveQuery calling service functions directly per phase range
- [Phase 04]: Keep use-graph-data.ts and use-history-queries.ts (too many callers to delete safely)
- [Phase 04]: Backup version 4 with substanceRecords support
- [Phase 04]: No upgrade function needed for v13 (Dexie auto-indexes existing createdAt data)
- [Phase 04]: Quick-add buttons use same handleSelect logic as drawer picker (no duplication)
- [05-01]: Zustand persist migration uses version 0->1 with double-cast for TypeScript strictness
- [05-01]: API routes require auth always (no clientApiKey fallback) -- server-side PERPLEXITY_API_KEY only
- [05-01]: LOCAL_AGENT_MODE production guard logs warning but does not bypass auth in production
- [05-02]: useEncryptedField returns memoized object with encrypt/decrypt/isAvailable (not wired to tables)
- [05-02]: EncryptedBackup envelope: { encrypted: true, payload: EncryptedData, version } for format detection
- [05-02]: importBackup auto-detects encrypted format, returns error directing to importEncryptedBackup
- [05-02]: importEncryptedBackup delegates to importBackup after decryption (single import logic path)
- [Phase 05]: Status route kept public but stripped of key length/format info (info leak)
- [06-01]: MedTab reduced from 5 to 3 values (schedule, medications, settings) -- status and prescriptions tabs removed
- [06-01]: CompoundCard uses useDailyDoseSchedule to derive next dose status per prescription
- [06-01]: Stock displayed as pill count (formatPillCount for fractional, plain number for whole)
- [06-03]: Mark All handled inline via immediate+undo pattern instead of MarkAllModal dialog
- [06-03]: DoseSlot converted to DoseLogWithDetails for DoseDetailDialog backward compatibility
- [06-03]: compound-card-expanded fixed: foodInstruction before/after (not with_food/without_food), DoseSlotStatus has no rescheduled
- [06-02]: No region field on InventoryItem -- brandName and strength differentiate items
- [06-02]: BrandSwitchPicker uses Dialog (not Drawer) for focused selection
- [06-02]: Inline expand uses AnimatePresence height 0->auto with stopPropagation on nested actions
- [06-05]: Dexie boolean fields queried via .toArray().filter() -- .where().equals(1) does not match boolean true
- [06-05]: Transaction edit/delete recalculates stock by summing all non-deleted transactions
- [06-05]: Conditional spread for optional note field (exactOptionalPropertyTypes compliance)
- [06-07]: Dosage auto-select uses simple regex matching on search query for mg pattern
- [06-07]: Dynamic wizard steps: filter STEPS array to skip indication when assigning to existing prescription
- [06-07]: Pre-populate foodInstruction from existing prescription's active phase via usePhasesForPrescription
- [Phase 06]: Conditional spread for notes field (exactOptionalPropertyTypes compliance)
- [Phase 06]: CreatePhaseInput re-exported from hooks layer for component boundary compliance
- [Phase 06.1]: Eating card uses plain datetime-local for time input (consistent with existing pattern)
- [Phase 06.1]: Quick-log buttons disable siblings while submitting to prevent double-tap
- [Phase 06.1]: Weight pre-fills with latest recorded value (fallback 70kg) instead of blank input
- [Phase 06.1]: BP Record button placed above details expander for one-tap recording
- [Phase 06.1]: Merged BP Advanced and detail sections into single 'More options' collapsible
- [Phase 07]: Descending sort by startDate for timeline (future at top, past at bottom)
- [Phase 07]: Conditional spread for exactOptionalPropertyTypes on optional ref props
- [Phase 07]: Explicit default constants for strict Record lookups (DEFAULT_TYPE_BADGE etc)

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 5.1 inserted after Phase 5 then removed (2026-03-11) — Pencil design-first workflow abandoned, no downstream dependencies existed
- Phase 06.1 inserted after Phase 6: Dashboard Input Redesign (URGENT) — replace popup modals with inline inputs for all dashboard metrics before merging to prod

### Blockers/Concerns

- [RESOLVED]: useLiveQuery vs. React Query — decided: useLiveQuery for ALL reads (all services), useMutation kept for writes. No invalidation needed. Resolved in Phase 3 context discussion.
- [Pre-phase]: "NanoDB" identity unconfirmed — PROJECT.md references it as future cloud sync target, but likely means Dexie Cloud. Does not block this milestone.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Download Pencil.dev Linux AppImage, run via WSLg, verify MCP connectivity | 2026-03-10 | 911f838 | [1-download-pencil-dev-linux-appimage-run-i](./quick/1-download-pencil-dev-linux-appimage-run-i/) |
| 2 | Remove Phase 5.1 from roadmap (never started, no downstream deps) | 2026-03-11 | 756f12f | [2-review-roadmap-and-plans-to-assess-penci](./quick/2-review-roadmap-and-plans-to-assess-penci/) |

## Session Continuity

Last session: 2026-03-20T18:38:58.509Z
Stopped at: Phase 8 context gathered
Resume file:
.planning/phases/08-drug-interactions/08-CONTEXT.md
