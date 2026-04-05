# Phase 21: Data Integrity Gates - Research

**Researched:** 2026-03-28
**Domain:** Dexie.js schema validation, CI quality gates, backup integrity testing
**Confidence:** HIGH

## Summary

Phase 21 builds CI-enforced gates that prevent Dexie schema corruption, migration breakage, and backup data loss. The core technical challenge is parsing `db.ts` at test time to extract version-to-table mappings, then using those mappings to verify consistency across three surfaces: the schema (db.ts), the backup service (BackupData interface + exportBackup), and the test fixtures (db-fixtures.ts maker functions).

All required infrastructure already exists: Vitest 4.0.18 runs in `node` environment (giving `fs` access), fake-indexeddb handles Dexie operations in tests, and the existing round-trip test plus fixture makers cover all 16 tables. The work is additive -- new test files in `src/__tests__/integrity/`, a static parser utility, and one new CI job in `ci.yml`.

**Primary recommendation:** Build a regex-based static parser for db.ts that extracts table names per version block, then write three focused test files (schema consistency, backup round-trip deep equality, table sync detection) plus one CI job that runs them unconditionally on every PR.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Static analysis approach -- parse db.ts at test time, extract table names per version block, verify each version includes all tables from the prior version
- **D-02:** No runtime/fake-indexeddb verification needed -- static parse is the primary and only layer
- **D-03:** Parser should be reusable -- DATA-07 (new table detection) will reuse the same parser to extract the latest version's table list
- **D-04:** New dedicated `data-integrity` job in ci.yml alongside existing lint/typecheck/test/build jobs
- **D-05:** Job runs unconditionally on every PR -- no path-filter gating. DATA-05 is satisfied by default since db.ts changes can't skip a job that always runs
- **D-06:** Job added to `ci-pass` gate's `needs` list so it blocks merge like all other jobs
- **D-07:** Tests live in `src/__tests__/integrity/` directory, run via `pnpm exec vitest run src/__tests__/integrity/`
- **D-08:** Deep field-by-field equality -- export all 16 tables, import into fresh DB, compare every record with JSON deep equal (not just record counts)
- **D-09:** Extend existing `round-trip.test.ts` pattern -- already has typed fixture makers for all 16 tables and beforeEach cleanup
- **D-10:** Parser-derived table list -- reuse the static parser from D-01 to extract the latest version's tables, compare against backup service exports and test fixture makers
- **D-11:** Three-way check: db.ts tables vs BackupData interface keys vs fixture maker functions. All three must stay in sync
- **D-12:** Actionable remediation messages -- each failure names the specific problem and tells the developer exactly how to fix it (file, interface, function to update)
- **D-13:** Error format: "x [Category]: [what's wrong]\n  Missing: [specific item]\n  Fix: [exact remediation step]"

### Claude's Discretion
- Parser implementation details (regex vs AST vs line-based parsing of db.ts)
- Test file organization within `src/__tests__/integrity/`
- Whether to enhance the existing round-trip.test.ts in place or create a new integrity-focused copy
- Exact Vitest assertion patterns for generating actionable messages

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-04 | Schema consistency check verifies each `db.version(N)` includes all tables from prior versions | Static parser extracts table sets per version block; test compares version N tables against version N-1 superset |
| DATA-05 | Any change to `db.ts` forces all migration and backup round-trip tests to run | New `data-integrity` CI job runs unconditionally on every PR (D-05); no path filtering means db.ts changes always trigger it |
| DATA-06 | CI runs backup export + import round-trip covering all 16 tables and verifies no data loss | Deep equality round-trip test using existing fixture makers; export -> clear -> import -> JSON deep equal per record |
| DATA-07 | CI fails if a new Dexie table is added without updating the backup service and test fixtures | Three-way sync check: parser-derived table list vs BackupData interface keys vs fixture maker function names |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager: **pnpm** (enforced via preinstall hook)
- Path alias: `@/*` maps to `src/*`
- Dexie schema currently at version 15 (CLAUDE.md says 14, but db.ts shows v15 as latest -- CLAUDE.md is stale)
- 16 tables in schema
- When adding a new Dexie version, must repeat all existing store definitions
- Test command: `pnpm test` runs `vitest run`
- Test files pattern: `src/**/*.test.ts`
- Vitest setup: `src/__tests__/setup.ts` with fake-indexeddb/auto

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.0.18 | Test runner | Already used for all tests in project |
| fake-indexeddb | (installed) | In-memory IndexedDB for Dexie tests | Already used in setup.ts |
| dexie | (installed) | IndexedDB wrapper | The database being validated |

### Supporting (Node.js built-ins, no install needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (Node.js) | built-in | Read db.ts file at test time | Static parser reads file system |
| path (Node.js) | built-in | Resolve file paths | Locate db.ts from test directory |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex parser | TypeScript AST (ts-morph) | AST is more robust but massive dependency for simple pattern matching; db.ts has very regular structure |
| Regex parser | Babel parser | Same overkill issue; the `.stores({...})` blocks are simple key-value pairs |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/__tests__/
├── integrity/
│   ├── schema-consistency.test.ts    # DATA-04: version-to-version table consistency
│   ├── backup-round-trip.test.ts     # DATA-06: deep equality round-trip
│   └── table-sync.test.ts            # DATA-07: three-way sync check
├── backup/
│   └── round-trip.test.ts            # Existing (kept as-is)
├── fixtures/
│   └── db-fixtures.ts                # Existing fixture makers (kept as-is)
└── migration/
    └── v10-v15-migration.test.ts     # Existing (kept as-is)
```

Plus one shared utility:
```
src/__tests__/integrity/
└── parse-schema.ts                   # Reusable parser (D-01, D-03)
```

### Pattern 1: Static Schema Parser (Regex-based)

**What:** Read `db.ts` from disk at test time using `fs.readFileSync`, extract `db.version(N).stores({...})` blocks via regex, parse table names from each block.

**When to use:** All integrity tests that need schema metadata.

**Why regex over AST:** The `db.version(N).stores({...})` pattern in db.ts is extremely regular:
- Each version block starts with `db.version(N).stores({`
- Table definitions are `tableName: "index, definitions"` one per line
- Blocks end with `})` (with optional `.upgrade(...)`)

A regex can reliably extract this. The file has been maintained with this exact pattern across 6 versions (v10-v15). An AST parser (ts-morph, babel) would add a heavy dependency for no practical benefit.

**Example:**
```typescript
// parse-schema.ts
import { readFileSync } from "fs";
import { resolve } from "path";

export interface VersionSchema {
  version: number;
  tables: string[];
}

export function parseDbSchema(): VersionSchema[] {
  const dbPath = resolve(__dirname, "../../lib/db.ts");
  const content = readFileSync(dbPath, "utf-8");

  const results: VersionSchema[] = [];
  // Match db.version(N).stores({ ... })
  const versionRegex = /db\.version\((\d+)\)\.stores\(\{([^}]+)\}\)/gs;
  let match: RegExpExecArray | null;

  while ((match = versionRegex.exec(content)) !== null) {
    const version = parseInt(match[1]!, 10);
    const storeBlock = match[2]!;
    // Extract table names (word before colon at start of line)
    const tables = [...storeBlock.matchAll(/^\s*(\w+)\s*:/gm)]
      .map((m) => m[1]!);
    results.push({ version, tables });
  }

  return results;
}
```

**Key detail:** The regex `([^}]+)` for the stores block works because the Dexie index definitions (the string values) do not contain `}`. Verified against all 6 version blocks in the current db.ts.

### Pattern 2: Deep Equality Round-Trip Test

**What:** Insert fixture records into all 16 tables, export via backup service, clear database, import, then compare each record field-by-field using `JSON.stringify` equality (matching the existing `isContentEqual` pattern in backup-service.ts).

**When to use:** DATA-06 verification.

**Example:**
```typescript
// After import, for each table:
const originalRecords = [/* fixture records inserted before export */];
const restoredRecords = await db.intakeRecords.toArray();

for (const original of originalRecords) {
  const restored = restoredRecords.find(r => r.id === original.id);
  expect(restored, `Record ${original.id} missing after round-trip`).toBeDefined();
  // Deep equality on all fields
  expect(JSON.stringify(restored)).toBe(JSON.stringify(original));
}
```

**Note on audit logs:** The `exportBackup()` function calls `logAudit("data_export", ...)` which adds an audit log record during export. This means the exported auditLogs array will contain the fixture audit log(s) PLUS the export audit log. The test must account for this: either filter out the extra log or check `>= expected` count and verify fixture records are present by ID.

### Pattern 3: Three-Way Sync Check

**What:** Compare three independently-maintained lists of table names:
1. **db.ts** -- parsed from the latest version block
2. **BackupData interface** -- parsed from backup-service.ts (keys that are arrays, excluding metadata fields)
3. **Fixture makers** -- parsed from db-fixtures.ts (`export function make*` names mapped to table names)

**When to use:** DATA-07 verification.

**Mapping challenge:** The naming is not 1:1:
| db.ts table | BackupData key | Fixture function |
|-------------|---------------|------------------|
| `intakeRecords` | `intakeRecords` | `makeIntakeRecord` |
| `bloodPressureRecords` | `bloodPressureRecords` | `makeBloodPressureRecord` |
| `titrationPlans` | `titrationPlans` | `makeTitrationPlan` |

Pattern: fixture names are `make` + PascalCase(singular of table name). The parser needs a mapping from table name to expected fixture name, or parse actual exports from the fixture file.

**Recommended approach:** Parse `db-fixtures.ts` for all `export function make*` names, then build a set. For BackupData, parse the interface keys from `backup-service.ts`. Compare both sets against the parser-derived table list.

### Anti-Patterns to Avoid

- **Importing db.ts at parse time:** Do NOT `import { db } from '@/lib/db'` in the parser module. The parser must read the raw file text. Importing db.ts triggers Dexie initialization which has side effects.
- **Hardcoded table lists:** Do NOT maintain a separate hardcoded list of "expected tables" in the tests. The parser should be the single source of truth, extracting from the actual code.
- **Coupling to version numbers:** The schema consistency check should work for ANY future version (v16, v17, etc.) without test modification. It should dynamically find all version blocks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema parsing | Full TypeScript AST parser | Regex on well-structured file | db.ts has 6 identical patterns; regex is 20 lines vs 200+ with ts-morph |
| Deep record comparison | Custom field-by-field diff | `JSON.stringify` comparison | All records are serializable; stringify handles nested objects/arrays. Matches existing `isContentEqual` approach |
| CI job structure | Custom CI scripting | Existing `ci.yml` pattern | Phase 20 established the exact pattern: checkout -> pnpm setup -> install -> run tests |

**Key insight:** This phase is about VERIFICATION, not about building new data infrastructure. Every verification target (db.ts, backup-service.ts, db-fixtures.ts) is a file that can be read as text at test time. The regex-based approach is appropriate because the patterns being parsed are controlled by this project and extremely regular.

## Common Pitfalls

### Pitfall 1: Regex Failing on Multi-Line Store Blocks
**What goes wrong:** The `.stores({...})` regex fails if the block contains nested objects or unusual formatting.
**Why it happens:** Default regex doesn't match across newlines, or `[^}]` fails on edge cases.
**How to avoid:** Use the `s` (dotAll) flag. Verify the regex works against all 6 existing version blocks before writing tests. The current db.ts only uses flat key-value pairs in `.stores()` calls (index strings never contain `}`), so `[^}]+` is safe.
**Warning signs:** Parser returns fewer than 6 versions or fewer than expected tables per version.

### Pitfall 2: AuditLog Side Effect in exportBackup
**What goes wrong:** The round-trip test expects exact record count after export+import, but `exportBackup()` calls `logAudit("data_export", ...)` which adds an audit log record to the database during export.
**Why it happens:** The export function has a side effect that inserts into `auditLogs`.
**How to avoid:** In the deep equality test, handle audit logs specially: either (a) export the data, then read `auditLogs` from DB (which now includes the export log) and compare that full set, or (b) compare by specific IDs rather than full set equality. Option (b) is cleaner -- verify that every fixture record survives the round-trip by ID lookup, ignoring extra audit records.
**Warning signs:** Test passes for 15/16 tables but fails on auditLogs with count mismatch.

### Pitfall 3: BackupData Optional Fields
**What goes wrong:** The three-way sync check treats all BackupData keys equally, but some are optional (`eatingRecords?`, `substanceRecords?`, etc.) and some are metadata (`version`, `exportedAt`, `appVersion`, `settings`).
**Why it happens:** BackupData interface mixes table data keys with metadata keys.
**How to avoid:** When parsing BackupData keys, explicitly exclude known metadata fields (`version`, `exportedAt`, `appVersion`, `settings`). The remaining keys are the data table keys.
**Warning signs:** Sync check flags `version` or `settings` as "missing from db.ts".

### Pitfall 4: Fixture Maker Name Mapping
**What goes wrong:** The three-way check can't map `makeBloodPressureRecord` back to `bloodPressureRecords` because the naming transform is non-trivial (singular vs plural, camelCase variants).
**Why it happens:** Fixture functions use singular form (`makeBloodPressureRecord`) while db.ts uses plural (`bloodPressureRecords`).
**How to avoid:** Build an explicit mapping table between table names and expected fixture function names. There are only 16 entries, and this mapping changes only when a table is added (which is exactly what the test catches).
**Warning signs:** False positives where the sync check says a fixture is missing when it actually exists under a different name.

### Pitfall 5: CI Job Missing from ci-pass Needs
**What goes wrong:** The data-integrity job runs but doesn't block merge because it wasn't added to the `ci-pass` gate job's `needs` array.
**Why it happens:** Developer adds the job but forgets to update the gate.
**How to avoid:** The `ci-pass` job needs both: (a) add `data-integrity` to the `needs` list, and (b) add the result check in the shell script.
**Warning signs:** Data-integrity job fails on a PR but the PR is still mergeable.

## Code Examples

### Current db.ts Version Block Structure (verified)
```typescript
// Source: src/lib/db.ts lines 616-633
db.version(15).stores({
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
});
```

### Current CI Gate Pattern (verified)
```yaml
# Source: .github/workflows/ci.yml lines 73-88
ci-pass:
  if: always()
  needs: [lint, typecheck, test-tz-sa, test-tz-de, build]
  runs-on: ubuntu-latest
  steps:
    - name: Check all jobs passed
      run: |
        if [[ "${{ needs.lint.result }}" != "success" ||
              "${{ needs.typecheck.result }}" != "success" ||
              "${{ needs.test-tz-sa.result }}" != "success" ||
              "${{ needs.test-tz-de.result }}" != "success" ||
              "${{ needs.build.result }}" != "success" ]]; then
          echo "::error::One or more CI jobs failed or were cancelled"
          exit 1
        fi
```

### Table Name to Fixture Function Mapping (verified)
```typescript
// All 16 tables and their corresponding fixture makers
const TABLE_TO_FIXTURE: Record<string, string> = {
  intakeRecords:         "makeIntakeRecord",
  weightRecords:         "makeWeightRecord",
  bloodPressureRecords:  "makeBloodPressureRecord",
  eatingRecords:         "makeEatingRecord",
  urinationRecords:      "makeUrinationRecord",
  defecationRecords:     "makeDefecationRecord",
  substanceRecords:      "makeSubstanceRecord",
  prescriptions:         "makePrescription",
  medicationPhases:      "makeMedicationPhase",
  phaseSchedules:        "makePhaseSchedule",
  inventoryItems:        "makeInventoryItem",
  inventoryTransactions: "makeInventoryTransaction",
  doseLogs:              "makeDoseLog",
  titrationPlans:        "makeTitrationPlan",
  dailyNotes:            "makeDailyNote",
  auditLogs:             "makeAuditLog",
};
```

### Actionable Error Message Pattern (per D-12, D-13)
```typescript
// Example assertion with remediation guidance
const missingTables = prevTables.filter(t => !currentTables.includes(t));
expect(missingTables, [
  `x [Schema Consistency]: Version ${version} is missing tables that existed in version ${version - 1}`,
  `  Missing: ${missingTables.join(", ")}`,
  `  Fix: Add the missing table(s) to the db.version(${version}).stores({...}) block in src/lib/db.ts`,
  `  Note: Dexie requires every version to repeat ALL table definitions from prior versions`,
].join("\n")).toHaveLength(0);
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm exec vitest run src/__tests__/integrity/` |
| Full suite command | `pnpm test` (runs all tests) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-04 | Each db.version(N) includes all tables from prior versions | unit (static analysis) | `pnpm exec vitest run src/__tests__/integrity/schema-consistency.test.ts -x` | Wave 0 |
| DATA-05 | db.ts changes trigger migration + backup tests | CI config | Verified by `data-integrity` job running unconditionally | N/A (CI config) |
| DATA-06 | Backup export+import round-trip verifies zero data loss | unit (fake-indexeddb) | `pnpm exec vitest run src/__tests__/integrity/backup-round-trip.test.ts -x` | Wave 0 |
| DATA-07 | New table without backup service + fixture update fails CI | unit (static analysis) | `pnpm exec vitest run src/__tests__/integrity/table-sync.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run src/__tests__/integrity/`
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/integrity/parse-schema.ts` -- reusable parser utility (D-01, D-03)
- [ ] `src/__tests__/integrity/schema-consistency.test.ts` -- covers DATA-04
- [ ] `src/__tests__/integrity/backup-round-trip.test.ts` -- covers DATA-06
- [ ] `src/__tests__/integrity/table-sync.test.ts` -- covers DATA-07

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual review of Dexie version blocks | Automated static analysis at test time | This phase | Prevents accidental table omission |
| Record count-only round-trip verification | Deep field-by-field equality verification | This phase (D-08) | Catches field corruption, not just missing records |
| No sync enforcement between db.ts/backup/fixtures | Three-way automated sync check | This phase (D-11) | New tables must update all three surfaces |

## Open Questions

1. **Parser edge case: `.upgrade()` chains**
   - What we know: Some version blocks chain `.stores({...}).upgrade(async (trans) => {...})`. The regex `db\.version\((\d+)\)\.stores\(\{([^}]+)\}\)` will match the stores block and stop at the closing `})`, which is correct because the upgrade function comes after.
   - What's unclear: If a future version block has comments containing `}` inside the stores block, the regex would break.
   - Recommendation: LOW risk. Add a parser self-test that verifies it finds exactly 6 versions (v10-v15) and the expected table counts. This self-test will catch any parser regression.

2. **Whether to create a new round-trip test or enhance existing**
   - What we know: Existing `round-trip.test.ts` already does record count verification. D-08 requires deep field equality. D-09 says "extend existing pattern."
   - What's unclear: Whether to modify the existing file or create a separate integrity-focused file.
   - Recommendation: Create a NEW file at `src/__tests__/integrity/backup-round-trip.test.ts` that does the deep equality check. Keep the existing `round-trip.test.ts` unchanged -- it tests the backup service API behavior (merge, conflicts, replace mode) which is separate from the integrity gate concern. The integrity test focuses purely on "does every field survive the round-trip?"

## Sources

### Primary (HIGH confidence)
- `src/lib/db.ts` -- Direct inspection of 6 version blocks (v10-v15), 16 tables, regex pattern verified against all blocks
- `src/lib/backup-service.ts` -- Direct inspection of BackupData interface (16 data keys + 4 metadata keys), exportBackup function (exports all 16 tables)
- `src/__tests__/backup/round-trip.test.ts` -- Direct inspection of existing test patterns, fixture usage, beforeEach cleanup
- `src/__tests__/fixtures/db-fixtures.ts` -- Direct inspection of 16 `make*` factory functions
- `.github/workflows/ci.yml` -- Direct inspection of Phase 20 CI structure, `ci-pass` gate pattern
- `vitest.config.ts` -- Confirmed `environment: "node"` (fs access available)

### Secondary (MEDIUM confidence)
- Vitest 4.0.18 assertion API -- `expect().toHaveLength(0)` with custom message parameter for actionable errors (verified against Vitest docs)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already installed and verified in project
- Architecture: HIGH -- parser approach verified against actual file structure, all 6 version blocks inspected
- Pitfalls: HIGH -- identified from direct code inspection (auditLog side effect, BackupData metadata keys, fixture naming)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies, all code is project-internal)
