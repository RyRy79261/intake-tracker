# Phase 10: Test Coverage - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add comprehensive unit tests for all service functions, with priority on medication-related services. Migration path tests for all Dexie schema versions. Timezone dual-pass validation (SA + Germany). No code changes to source files — test-only phase.

</domain>

<decisions>
## Implementation Decisions

### Test scope prioritization
- **P1 (must test):** dose-log-service, medication-service, titration-service, dose-schedule-service — complex business logic, fractional math, phase activation, timezone-aware scheduling
- **P2 (should test):** backup-service (extend existing tests), inventory-service, medication-schedule-service
- **P3 (nice to have):** intake-service, health-service, eating-service, urination-service, defecation-service, pin-service, audit-service, push-notification-service, medication-notification-service
- All P1 and P2 services MUST be tested. P3 should be included if time allows but are not blocking.

### Dexie mocking strategy
- Use `fake-indexeddb` package as IndexedDB polyfill (already used by existing migration tests)
- Tests run against a real Dexie instance with in-memory backend
- Full transaction support — catches real query issues, not just mock behavior
- Each test should clear the database before running (fresh state)
- Import `fake-indexeddb/auto` in vitest setup

### Timezone dual-pass approach
- Run the full suite twice with different TZ environment variables
- `TZ=Africa/Johannesburg vitest run` and `TZ=Europe/Berlin vitest run`
- Add `test:tz` script to package.json for convenience
- Timezone-sensitive tests use real Date objects — no mocking of Date or timezones
- Tests must pass in BOTH timezones to be considered green

### Migration tests
- Every Dexie schema version (1 through current) must have a migration test
- Tests verify upgrade completes without data loss
- Extend existing v10 and v12 migration tests pattern to cover all versions

### Explicit assertions required
- No tests that pass by accident — timezone edge cases, fractional dose math, and phase-activation invariants each need explicit assertions
- Dose math: test 0.25, 0.5, 0.75 pill fractions explicitly
- Timezone: test schedule generation crossing midnight, DST transitions
- Phase activation: test that activating one phase deactivates the previous

### Claude's Discretion
- Exact test file organization (co-located vs __tests__ directory)
- Whether to add coverage thresholds to vitest config
- Test naming conventions
- Whether to use test fixtures/factories or inline data

</decisions>

<canonical_refs>
## Canonical References

### Existing test patterns
- `src/__tests__/migration/v10-migration.test.ts` — Migration test pattern with fake-indexeddb
- `src/__tests__/migration/v12-migration.test.ts` — Migration test pattern
- `src/__tests__/backup/round-trip.test.ts` — Service test pattern with fake-indexeddb and fixture factories
- `src/__tests__/fixtures/db-fixtures.ts` — Test fixture factories (makePrescription, makeInventoryItem, etc.)
- `src/lib/analytics-service.test.ts` — Co-located service test pattern

### Service files to test
- P1: `src/lib/dose-log-service.ts`, `src/lib/medication-service.ts`, `src/lib/titration-service.ts`, `src/lib/dose-schedule-service.ts`
- P2: `src/lib/backup-service.ts`, `src/lib/inventory-service.ts`, `src/lib/medication-schedule-service.ts`
- P3: remaining `*-service.ts` files

</canonical_refs>

<code_context>
## Existing Code Insights

### Test Infrastructure
- Vitest configured and working (`pnpm test` runs existing tests)
- `fake-indexeddb` already a dependency (used by migration tests)
- `src/__tests__/fixtures/db-fixtures.ts` has factory functions for common entities
- 3 E2E tests in Playwright (separate from unit tests)

### Established Patterns
- Migration tests: import fake-indexeddb, open old DB version, add data, upgrade, verify
- Service tests: import real service functions, call them against fake-indexeddb Dexie instance
- Fixture factories: `makePrescription()`, `makeInventoryItem()`, `makeTitrationPlan()` in db-fixtures.ts

### Key Complexity Areas
- `dose-log-service.ts`: takeDose/untakeDose/skipDose with inventory stock math, fractional pills, actionTimestamp override
- `dose-schedule-service.ts`: slot generation from phases + schedules, timezone-aware UTC conversion, missed-dose detection
- `medication-service.ts`: prescription CRUD, phase lifecycle (activate/complete), inventory management
- `titration-service.ts`: plan create/update/activate/complete/cancel with phase cascading

</code_context>

<specifics>
## Specific Ideas

- Fractional dose math must be tested explicitly: 0.25, 0.5, 0.75 tablets with stock deduction verification
- Phase activation cascade: activating phase B should deactivate phase A
- Retroactive dose logging: takenAtTime should set actionTimestamp correctly
- Dose schedule generation should produce correct slots when timezone changes between SA and Germany

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-test-coverage*
*Context gathered: 2026-03-23*
