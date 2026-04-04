# Phase 21: Data Integrity Gates - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

CI prevents any change from corrupting the Dexie schema, breaking migrations, or losing data during backup/restore. Delivers automated gates that protect the user's irreplaceable phone-side health data. Covers requirements DATA-04 through DATA-07.

</domain>

<decisions>
## Implementation Decisions

### Schema Consistency Check (DATA-04)
- **D-01:** Static analysis approach — parse db.ts at test time, extract table names per version block, verify each version includes all tables from the prior version
- **D-02:** No runtime/fake-indexeddb verification needed — static parse is the primary and only layer
- **D-03:** Parser should be reusable — DATA-07 (new table detection) will reuse the same parser to extract the latest version's table list

### CI Integration (DATA-05)
- **D-04:** New dedicated `data-integrity` job in ci.yml alongside existing lint/typecheck/test/build jobs
- **D-05:** Job runs unconditionally on every PR — no path-filter gating. DATA-05 is satisfied by default since db.ts changes can't skip a job that always runs
- **D-06:** Job added to `ci-pass` gate's `needs` list so it blocks merge like all other jobs
- **D-07:** Tests live in `src/__tests__/integrity/` directory, run via `pnpm exec vitest run src/__tests__/integrity/`

### Backup Round-Trip Verification (DATA-06)
- **D-08:** Deep field-by-field equality — export all 16 tables, import into fresh DB, compare every record with JSON deep equal (not just record counts)
- **D-09:** Extend existing `round-trip.test.ts` pattern — already has typed fixture makers for all 16 tables and beforeEach cleanup

### New Table Detection (DATA-07)
- **D-10:** Parser-derived table list — reuse the static parser from D-01 to extract the latest version's tables, compare against backup service exports and test fixture makers
- **D-11:** Three-way check: db.ts tables vs BackupData interface keys vs fixture maker functions. All three must stay in sync

### Failure Messages
- **D-12:** Actionable remediation messages — each failure names the specific problem and tells the developer exactly how to fix it (file, interface, function to update)
- **D-13:** Error format: "✗ [Category]: [what's wrong]\n  Missing: [specific item]\n  Fix: [exact remediation step]"

### Claude's Discretion
- Parser implementation details (regex vs AST vs line-based parsing of db.ts)
- Test file organization within `src/__tests__/integrity/`
- Whether to enhance the existing round-trip.test.ts in place or create a new integrity-focused copy
- Exact Vitest assertion patterns for generating actionable messages

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `src/lib/db.ts` — Dexie schema versions 10-15, 16 tables, migration chain. The file being parsed by the static analyzer
- `src/lib/backup-service.ts` — BackupData interface defining which tables are backed up. Must stay in sync with db.ts

### Existing Tests
- `src/__tests__/backup/round-trip.test.ts` — Existing backup round-trip test with typed fixtures for all 16 tables. Pattern to extend for deep equality verification
- `src/__tests__/fixtures/db-fixtures.ts` — Factory functions (makeIntakeRecord, makeWeightRecord, etc.) for all 16 tables. Must stay in sync with db.ts
- `src/__tests__/migration/v10-migration.test.ts` through `v15-migration.test.ts` — Existing per-version migration tests

### CI Infrastructure
- `.github/workflows/ci.yml` — Current CI workflow (Phase 20). Add data-integrity job here
- `.planning/phases/20-core-ci-pipeline/20-CONTEXT.md` — Phase 20 decisions (job structure, ci-pass gate pattern)

### Requirements
- `.planning/REQUIREMENTS.md` — DATA-04, DATA-05, DATA-06, DATA-07 requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `round-trip.test.ts`: Already exports/imports all 16 tables with typed fixtures. Deep equality extension is natural
- `db-fixtures.ts`: Factory functions for every table type — the "expected" data for round-trip comparison
- `ci.yml`: Phase 20's job structure and ci-pass gate pattern — follow for the new job
- `db.ts` version blocks: Well-structured with `db.version(N).stores({...})` pattern — parseable

### Established Patterns
- Vitest with fake-indexeddb for database tests (setup.ts handles db lifecycle)
- Per-version migration test files in `src/__tests__/migration/`
- Bundle security test runs specific test file via `pnpm exec vitest run <path>`

### Integration Points
- `ci.yml` — new `data-integrity` job added to jobs list and ci-pass needs array
- `src/__tests__/integrity/` — new test directory for schema consistency and table sync tests
- Static parser utility — new module that reads db.ts and extracts version/table metadata

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-data-integrity-gates*
*Context gathered: 2026-03-28*
