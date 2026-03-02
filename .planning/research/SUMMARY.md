# Project Research Summary

**Project:** Intake Tracker — Medication Management + Engineering Overhaul
**Domain:** Offline-first health tracking PWA (medication management, multi-region travel context)
**Researched:** 2026-03-02
**Confidence:** HIGH (stack and architecture grounded in codebase analysis and official docs; features and pitfalls MEDIUM-HIGH)

## Executive Summary

This is a milestone-scoped engineering overhaul of an existing Next.js 14 + Dexie.js health tracking PWA. The app already handles water/salt intake, vitals, and some medication tracking. The overhaul goal is to rebuild the medication management subsystem correctly, harden the data model for future cloud sync, and establish a testing foundation that currently does not exist. The recommended approach is bottom-up: fix the schema and data model first (the foundation for everything else), then rebuild the service layer with full transactional integrity, then layer in UI last. Cloud sync, AI querying, and doctor reports are explicitly out of scope for this milestone.

The app's primary differentiator is compound-first medication management for a user who travels internationally between South Africa and Germany with regional brand variants of the same drugs. No competitor (Medisafe, MyTherapy, CareClinic) handles this use case. The features that deliver this value — prescription-as-compound identity, multi-brand inventory under one prescription, fractional pill dose tracking, and retroactive dose logging — are all architecturally feasible with the existing Dexie schema model, but require the schema, service, and UI layers to be rebuilt with deliberate consistency.

The highest risks are not architectural novelty but implementation precision: non-atomic multi-table writes causing stock drift, timezone-naive dose scheduling corrupting adherence data for a traveling user, an irreversible Dexie schema migration deployed without a test harness, and a backup service that silently omits medication data. All five critical pitfalls are preventable in the first two phases of the roadmap if addressed in the correct order. The schema and service layer phases must enforce these constraints before any UI is built.

## Key Findings

### Recommended Stack

The existing stack (Next.js 14, Dexie.js 4.0.8, React Query 5, Zustand, shadcn/ui, Playwright) is stable and should not be replaced. The overhaul adds only what is missing: a unit/integration test layer and two TypeScript strictness flags. See `.planning/research/STACK.md` for full details.

**Core technology additions:**
- **Vitest ^4.x + fake-indexeddb ^6.2.5:** Unit/integration test runner — the official Next.js recommendation; `fake-indexeddb` is the standard pattern for testing Dexie services in Node without a browser, enabling migration tests before any deployment
- **@testing-library/react ^16 + jsdom ^26:** Component hook testing — used narrowly for testing service-layer hooks; Playwright continues to own full UI E2E flows
- **vite-tsconfig-paths ^5.x:** Makes `@/*` path aliases work inside Vitest — required or all service imports fail in test context
- **@tanstack/react-query-devtools ^5.91:** Dev-only query cache inspection — critical for debugging cross-domain invalidation chains during the overhaul
- **TypeScript `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`:** Two strict flags not currently enabled — will surface 50-200 latent bugs in array indexing and optional field handling; fix them, do not suppress them

**Do not change:** Zod stays on v3 for this milestone (v4 API breaks are not worth the churn during a stability overhaul). UUID primary keys stay as-is (sync-safe). Auto-increment IDs must never be introduced.

**Schema additions (not new libraries):** Compound indexes needed for efficient cross-domain queries — `[prescriptionId+scheduledDate]`, `[inventoryItemId+timestamp]`, `[type+timestamp]` — added as a new Dexie version (10+). Add `realmId?: string` to all entity interfaces now as a zero-cost preparatory change for future Dexie Cloud sync.

### Expected Features

The medication management MVP must replace the broken current implementation and deliver the core differentiating value. All P1 features are required for this milestone to be complete. See `.planning/research/FEATURES.md` for full prioritization matrix and competitor analysis.

**Must have (table stakes — users consider the app broken without these):**
- Prescription / medication list with compound-first display
- Dose confirmation (take / skip) — single tap, no confirmation dialog; undo > confirm
- Dose history view (taken / skipped / missed per day)
- Stock tracking with refill alerts at configurable threshold
- Multiple prescriptions and schedule types (daily, specific days, as-needed)
- Offline operation — already architecturally solved; must not regress

**Should have (the differentiators this app owns):**
- Prescription-as-compound-identity with multi-brand inventory (SA brand + German brand under one prescription) — this is the core UX innovation no competitor provides
- Retroactive dose logging with time picker — pre-filled to scheduled time, not current time
- Fractional pill dose tracking (0.5 tablet, 0.25 tablet) with correct stock depletion math
- Physical pill vs. prescribed dose distinction (prescribed: 5mg; pill: 10mg tablet; consumed: 0.5 tablet)
- Active inventory selection — which pack is currently being pulled from
- Phase / titration schedule support (named phases with automatic transition logic)
- Audit log written on all medication mutations (already in schema, must actually be written)

**Defer to v1.x (after P1 is stable):**
- Phase / titration visualization and transition UI
- Adherence percentage in history
- Audit log viewer in settings

**Defer to v2+ (future milestones):**
- Cross-domain health correlation (medication adherence vs. BP readings) — data model must support it now, UI deferred
- Doctor report / PDF export — requires proven, stable dose history first
- Cloud sync — explicitly out of scope; NanoDB/Dexie Cloud is a future milestone
- Drug interaction checking, gamification, caregiver sharing — out of scope or anti-features

### Architecture Approach

The layered architecture is correct and must be enforced more strictly during the overhaul. The build order is non-negotiable: schema first, then services, then hooks, then UI. The architecture is organized as: Route pages → Hooks (React Query) → Services (business logic, pure async) → Dexie (IndexedDB). Components and pages must not import from `db.ts` or service files directly. All `db.*` calls live in `src/lib/*-service.ts` only. See `.planning/research/ARCHITECTURE.md` for full diagrams, data flow walkthroughs, and anti-pattern documentation.

**Major components:**
1. **`db.ts` + `types.ts`** — Schema definition and consolidated type exports; single source of truth for all data shapes; must be correct before any service is written
2. **Service layer** (`medication-service.ts`, `dose-log-service.ts`, `medication-schedule-service.ts`, and domain services) — All business logic including the phase-activation invariant (only one active phase per prescription), stock depletion atomicity, and cross-service calls (dose-log-service calls medication-service for stock); fully unit-testable with `fake-indexeddb`
3. **`analytics-service.ts` (new)** — Cross-domain correlation queries; reads from multiple domain services, writes nothing; the future seam for AI natural-language querying
4. **Hooks layer** (`use-medication-queries.ts`, `use-analytics-queries.ts`) — Thin React Query wrappers; all cache invalidation logic centralized here; no business logic
5. **Medication UI** (`/medications` route + components) — Built last; depends on stable hooks; must surface the compound-first hierarchy clearly in the UX

**Key invariant:** Only one `MedicationPhase` per `Prescription` may be `status === "active"` at any time. `activatePhase()` and `startNewPhase()` enforce this inside a Dexie transaction. Direct `db.medicationPhases.update()` calls bypass this invariant and must be eliminated.

### Critical Pitfalls

Full prevention strategies, phase mappings, and recovery steps are in `.planning/research/PITFALLS.md`.

1. **Dexie schema migration is irreversible** — Once version N is in users' browsers, there is no rollback. Prevention: establish a migration test harness using `fake-indexeddb` before writing version 10. Every upgrade function must be defensive (`try/catch`, null checks on old fields). A broken migration requires a new corrective version, not a deploy rollback.

2. **Non-atomic dose-take operations cause stock drift** — The current `takeDose()` calls `adjustStock()` and `upsertDoseLog()` in sequence without a wrapping `db.transaction`. A tab background/crash between them decrements stock with no dose log. Prevention: every multi-table write in the medication domain must be wrapped in a single `db.transaction("rw", [...tables], ...)`.

3. **Timezone-naive scheduling corrupts traveling user's adherence data** — `scheduledDate` computed as `new Date().toISOString().split('T')[0]` gives UTC date, not local date. The `generatePendingDoseLogs` UTC-noon anchor is wrong for both SA and Germany DST scenarios. Prevention: use local date for `scheduledDate` generation; store device timezone in dose logs; add `timezone` field to `PhaseSchedule`; test with `TZ=Europe/Berlin` and `TZ=Africa/Johannesburg`.

4. **Sync-hostile mutable `currentStock`** — `currentStock` as a mutable counter on `InventoryItem` will cause last-write-wins conflict data loss when cloud sync is added. Prevention: derive `currentStock` from `inventoryTransactions` sum (the transactions table already exists and is the ground truth); never persist `currentStock` as a stored field going forward.

5. **Backup service silently omits medication data** — The current `exportBackup()` does not include prescriptions, phases, inventory, or dose logs. A user who backs up and restores loses their entire medication history. Prevention: medication tables must be added to the export before shipping this milestone; verify with an integration test (export → clear → import → verify all medication records present).

## Implications for Roadmap

The architecture research defines a clear build order: foundation (schema + types) → services → hooks → UI. The pitfalls define which phases are highest risk. Combining these, five phases emerge.

### Phase 1: Schema and Data Model Hardening

**Rationale:** Everything else depends on the schema being correct. The schema cannot be patched later without an irreversible migration. This phase must happen before any service is written or refactored. It also establishes the migration test harness that makes all future schema versions safe to deploy.

**Delivers:** Dexie version 10 with compound indexes, `realmId?: string` on all entities, `updatedAt` on all tables, `deletedAt` on soft-deletable records, defensive upgrade functions with tests. `types.ts` consolidated type re-exports. TypeScript strict flags enabled with all surfaced errors fixed.

**Addresses features:** Fractional dose tracking data model (dosageAmount as decimal fraction of physical pill), physical pill vs. prescribed dose distinction in InventoryItem, sync-ready schema for future Dexie Cloud.

**Avoids pitfalls:** Schema rollback impossibility (migration tests), sync-hostile mutable `currentStock` (architectural decision made here — derive from transactions), non-defensive upgrade functions.

**Research flag:** Standard Dexie patterns — skip phase research. The compound index syntax, upgrade function patterns, and `fake-indexeddb` integration are all well-documented in STACK.md.

### Phase 2: Service Layer Rebuild

**Rationale:** Services are the business logic layer. No hooks or UI can be correct if the services underneath are incorrect. The medication domain services need a full rebuild (not just refactor) because the atomicity, invariant enforcement, and timezone handling are currently broken. Domain services (intake, health, etc.) need cleanup for TypeScript strict compliance.

**Delivers:** All medication services (`medication-service.ts`, `medication-schedule-service.ts`, `dose-log-service.ts`) rebuilt with: full `db.transaction` wrapping on all multi-table writes, the phase-activation invariant enforced in a single transaction, timezone-aware `scheduledDate` generation, timezone stored in dose logs, correct stock depletion unit math (dosageAmount as fraction of physical pill). All service functions covered by Vitest unit tests using `fake-indexeddb`.

**Addresses features:** Retroactive dose logging (time picker logic in service), active inventory selection, stock depletion tied to dose log, audit log written on all medication mutations.

**Avoids pitfalls:** Non-atomic dose-take (every multi-table write in a transaction), timezone-naive scheduling (local date + timezone field), useLiveQuery + React Query conflict (establish one reactivity pattern as a convention here).

**Research flag:** Needs attention during planning — the useLiveQuery vs. React Query reactivity decision (Pitfall 2) should be made explicitly before service refactor begins. Options are documented in PITFALLS.md; roadmap phase should include this as a decision gate.

### Phase 3: Medication UI Rebuild

**Rationale:** UI is built last because it depends on stable services and hooks. Building UI before the services are correct leads to UI that encodes broken behavior and must be rebuilt twice. This phase delivers the visible milestone: a working medication management experience that replaces the broken current implementation.

**Delivers:** Prescription list with compound-first display (multi-brand InventoryItems grouped under one Prescription), daily dose schedule timeline, one-tap dose confirmation (take/skip/retroactive), stock view per prescription with days-of-supply calculation, refill alert display, active inventory selection UI, dose history view. Multi-step wizard for prescription + inventory + schedule creation (existing wizard refactored to use rebuilt services).

**Addresses features:** All P1 features from FEATURES.md. The compound-first UX and multi-brand inventory grouping are the core differentiators that must be visually clear.

**Avoids pitfalls:** Inventory view without clear grouping (prescriptions group multi-brand inventory with region/brand sub-labels), retroactive dose logging defaulting to current time (UI pre-fills with scheduled time), refill alert missing which inventory item (alert names specific brand + strength + region).

**Research flag:** Standard shadcn/ui + Next.js App Router patterns — skip phase research. The data model and services established in Phases 1-2 drive all UI decisions.

### Phase 4: Data Integrity and Backup

**Rationale:** The medication data is now the most important data in the app but is excluded from backups. This is a critical safety gap that must be closed before the medication rebuild is considered complete. This phase also adds the `analytics-service.ts` cross-domain query layer which is the data foundation for history correlation.

**Delivers:** `exportBackup()` updated to include prescriptions, phases, phaseSchedules, inventoryItems, inventoryTransactions, doseLogs, and auditLogs. Import/restore covering all medication tables. `analytics-service.ts` implemented with fluid balance and medication adherence correlation query shapes (UI deferred to v2). Integration test: export → clear → import → verify all medication records present.

**Addresses features:** Backup completeness (critical gap), cross-domain analytics data model (v2 UI deferred), audit log integrity (append-only semantics enforced).

**Avoids pitfalls:** Backup missing medication tables, stock recalculation from transactions (add admin tool in settings for "recalculate stock from transaction history").

**Research flag:** Standard patterns — skip phase research. Dexie `db.table.each()` streaming export is documented. The analytics-service pattern is defined in ARCHITECTURE.md.

### Phase 5: Test Coverage and TypeScript Hardening

**Rationale:** The test infrastructure (Vitest) is installed in Phase 1, but full coverage of service functions and migration logic is built out here as a dedicated phase. TypeScript errors surfaced by the strict flags in Phase 1 are systematically addressed. This phase is what makes future changes safe to ship.

**Delivers:** Vitest unit test suite covering all service functions, all Dexie schema migration paths, date utility functions, and business logic (phase activation invariant, stock depletion math, fractional dose calculation). Tests run with both `TZ=Africa/Johannesburg` and `TZ=Europe/Berlin`. TypeScript strict flag errors all resolved (no `// @ts-ignore` suppressions). Security audit: API key removed from client storage, `sanitizeForAI` enforced at route level.

**Avoids pitfalls:** Schema rollback impossibility (migration tests), timezone-naive scheduling (timezone-variant test runs), sync-hostile patterns.

**Research flag:** Vitest + fake-indexeddb integration has known rough edges (documented in STACK.md sources). This phase may need a focused research spike on the specific Vitest + Dexie setup before writing the configuration.

### Phase Ordering Rationale

- **Schema before services:** Dexie migrations are irreversible. Compound indexes, `realmId`, soft-delete timestamps, and the architectural decision on `currentStock` derivation must all be made before any service function is written that assumes a particular schema shape.
- **Services before UI:** The medication UI in the current app encodes broken behavior (non-atomic writes, no timezone handling) because it was built without correct services underneath. Rebuilding UI before services would repeat this mistake.
- **Backup in phase 4, not later:** Medication data is irreplaceable personal health history. The backup gap must be closed in the same milestone that introduces the medication rebuild, not deferred to a future milestone.
- **Test coverage last (as a dedicated phase) but test infrastructure first (in phase 1):** Installing Vitest in Phase 1 allows individual services written in Phase 2 to be tested as they are built. Phase 5 systematically completes coverage rather than letting it remain ad-hoc.

### Research Flags

Phases needing deeper research during planning:

- **Phase 2 (Service Layer Rebuild):** The useLiveQuery vs. React Query reactivity pattern decision (Pitfall 2) needs an explicit architectural decision before this phase begins. The options are documented but the choice has downstream consequences for how hooks are written.
- **Phase 5 (Test Coverage):** The Vitest + fake-indexeddb integration with Next.js App Router has known rough edges. A focused configuration spike is recommended before writing the full test suite.

Phases with standard patterns (skip research-phase):

- **Phase 1 (Schema):** Dexie compound index syntax, upgrade function patterns, and `fake-indexeddb` test setup are all verified and documented in STACK.md with official sources.
- **Phase 3 (UI Rebuild):** shadcn/ui + Next.js App Router component patterns are established throughout the existing codebase. The data model drives UI decisions, not novel UI patterns.
- **Phase 4 (Backup):** Dexie streaming export patterns and React Query analytics hook patterns are standard and well-documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack verified via codebase; additions verified against official Next.js docs, npm, and official library changelogs. One LOW-confidence item: "NanoDB" identity is unresolved — likely Dexie Cloud but needs confirmation before that future milestone. |
| Features | MEDIUM-HIGH | Table stakes features verified against multiple competitor sources and academic literature review. Differentiators (multi-region, fractional dose, compound-first) grounded in PROJECT.md user requirements; competitor gap analysis is absence-of-evidence for some claims. |
| Architecture | HIGH | Based on direct codebase inspection of `src/lib/` and `src/hooks/` + official Dexie and React Query documentation. The layered architecture and build order are not speculative — they are derived from the existing structure and documented anti-patterns found in current code. |
| Pitfalls | HIGH | Critical pitfalls 1, 2, 4, and 5 confirmed via direct codebase inspection (the broken patterns exist in current code). Pitfall 3 (timezone) confirmed via Medisafe documentation and Apple Health community reports. The "looks done but isn't" checklist in PITFALLS.md reflects actual current code state. |

**Overall confidence:** HIGH

### Gaps to Address

- **"NanoDB" identity:** PROJECT.md references "future NanoDB cloud sync" but no established library named NanoDB for browser/Dexie sync was found. Most likely refers to Dexie Cloud. Confirm with project owner before the cloud sync milestone. If it is a different library, dedicated research is needed at that milestone. Does not block this overhaul milestone.
- **useLiveQuery vs. React Query reactivity decision:** Both patterns exist in the codebase. The correct pattern for this project (pick one, commit to it) must be decided at the start of Phase 2. The options are documented in PITFALLS.md but the architectural decision needs to be made explicitly in the roadmap.
- **Dexie 4.0.8 → 4.3.0 minor upgrade:** Safe to upgrade within `^4` semver. No action required for this milestone but low-risk and recommended.
- **iOS PWA push notification reliability:** The anti-feature stance (don't build core UX on push) is correct, but the exact current state of iOS web push reliability should be verified before any user-facing messaging about this limitation.

## Sources

### Primary (HIGH confidence)

- Existing codebase: `src/lib/`, `src/hooks/`, `src/lib/db.ts`, `src/lib/backup-service.ts` — direct inspection of current broken patterns
- Next.js official Vitest setup guide (2026-02-27): https://nextjs.org/docs/app/guides/testing/vitest
- Dexie.js official docs — compound indexes, cloud sync constraints: https://dexie.org/docs/Compound-Index, https://dexie.org/cloud/
- Zod v4 migration guide + InfoQ announcement (August 2025): https://zod.dev/v4/changelog
- Vitest 4.0 release notes: https://vitest.dev/blog/vitest-4
- PMC academic review of medication app features: https://pmc.ncbi.nlm.nih.gov/articles/PMC6786858/
- PROJECT.md: `.planning/PROJECT.md` — authoritative user requirements and travel context
- Dexie GitHub Issue #1599 (version downgrade impossible): https://github.com/dexie/Dexie.js/issues/1599
- Dexie GitHub Issue #2067 (useLiveQuery bulk update bug): https://github.com/dexie/Dexie.js/issues/2067

### Secondary (MEDIUM confidence)

- Medisafe, MyTherapy, CareClinic feature pages — competitor gap analysis
- Medisafe timezone documentation: https://medisafeapp.com/timezone/
- fake-indexeddb npm page (v6.2.5, 2025 Web Platform Tests): https://www.npmjs.com/package/fake-indexeddb
- Dexie Cloud best-practices (partial access): https://dexie.org/cloud/docs/best-practices
- LogRocket: Offline-first frontend apps in 2025: https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/
- nickb.dev: Pitfalls of React Query (stale data): https://nickb.dev/blog/pitfalls-of-react-query/
- Known IndexedDB bugs gist (Safari ITP, WAL growth): https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a

### Tertiary (LOW confidence)

- OrangeSoft, Stormotion developer blogs — industry feature survey (corroborating only, not authoritative)
- WebSearch: "Dexie cloud UUID primary key global uniqueness" — multiple Dexie Cloud docs confirmed UUID requirement but full doc text not retrieved
- Competitor fractional dose tracking claims — based on absence of evidence in competitor docs, not confirmed absence

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
