# Phase 1: Schema Foundation - Research

**Researched:** 2026-03-02
**Domain:** Dexie.js v4 schema migration, IndexedDB testing, TypeScript data modeling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration Strategy**
- Fresh start at v10 — delete old v4-v9 migration/upgrade code, define one clean schema
- User's existing data MUST be preserved — this is the hard constraint
- Claude decides the versioning approach (single v10 vs split across versions)
- Migration test harness verifies both schema upgrade success AND data integrity (field values survive correctly)
- Test fixtures are synthetic only — no real medical data in the codebase
- Synthetic fixtures must cover edge cases: empty fields, optional fields missing, records from old schema versions

**Event-Sourced Inventory**
- Pure event sourcing — `currentStock` is never stored as a mutable field, always derived from `inventoryTransactions`
- Every stock change is a transaction, including initial stock when adding an inventory item (type: "initial")
- UI shows cached/computed count instantly with a subtle indicator for fresh vs stale (Phase 6, but data layer must support it)
- `InventoryTransaction` gets a `doseLogId` field linking consumed stock back to the specific dose that caused it
- When a transaction causes stock to hit the refill warning threshold, trigger a once-per-day alert (not per-transaction spam)

**Sync-Readiness Fields**
- ALL tables get the full field set: `createdAt`, `updatedAt`, `deletedAt`, `deviceId`
- Standardize across every table — no exceptions
- Future sync target is NeonDB (serverless Postgres on Vercel), NOT Dexie Cloud
- `deviceId` instead of Dexie-specific `realmId`
- Soft deletes via `deletedAt` — deleted items move to an archive view
- Conflict resolution strategy: Claude's discretion

**Index Design**
- Every table gets timestamp-based compound indexes optimized for date-range queries
- Compound indexes: `[prescriptionId+scheduledDate]` on doseLogs, `[inventoryItemId+timestamp]` on inventoryTransactions, `[type+timestamp]` on intakeRecords
- Additional indexes on all health tables to enable cross-domain correlation queries
- Target query patterns: correlate water/urination, food patterns, missed doses in date range, compliance per prescription

### Claude's Discretion
- Versioning strategy (single v10 vs multiple versions)
- Conflict resolution approach for future NeonDB sync
- Exact compound index definitions per table beyond the researched recommendations
- Migration code structure and error handling patterns
- Test harness architecture and synthetic data generation approach

### Deferred Ideas (OUT OF SCOPE)
- Lazy rendering on history/charts page — Phase 6+ UI concern
- Analytics service cross-domain query functions — Phase 4
- Archive view UI for soft-deleted items — Phase 6+
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHM-01 | Dexie v10 migration with compound indexes for cross-domain queries | Dexie version() + stores() API with bracket notation for compound indexes; upgrade() callback for data migration |
| SCHM-02 | Migration test harness that verifies schema upgrades don't corrupt the database | fake-indexeddb package provides in-memory IDB; pattern: seed old-schema data → run upgrade → assert fields/counts |
| SCHM-03 | Event-sourced inventory — `currentStock` derived from transaction sum, not stored | Remove `currentStock` from InventoryItem interface; add "initial" to transaction type union; query with `.where('inventoryItemId').equals(id).toArray()` then sum |
| SCHM-04 | `updatedAt` timestamps on all tables for future sync readiness | Add `createdAt`, `updatedAt`, `deletedAt`, `deviceId` to every interface; index `updatedAt` for sync delta queries |
| TEST-01 | Vitest + fake-indexeddb test infrastructure configured and working | vitest + @vitest/coverage-v8 + fake-indexeddb; vitest.config.ts with `setupFiles` that calls `require('fake-indexeddb/auto')` |
</phase_requirements>

---

## Summary

This phase rewrites `src/lib/db.ts` from a v4-v9 migration chain to a single clean v10 schema. The existing Dexie version is 4.0.8, which supports the `EntityTable<T, "id">` typing pattern already in use. The migration must carry forward all user data — there are 600+ live records — while replacing the mutable `currentStock` counter on `InventoryItem` with pure event sourcing via `inventoryTransactions`.

The key technical risks are: (1) the upgrade function for v10 must populate `createdAt`/`updatedAt`/`deviceId` for every existing record that lacks them, and (2) removing `currentStock` from the schema requires migrating any code that reads it before this phase is done (services are out of scope for Phase 1, but TypeScript compile errors will surface immediately and must be suppressed with a migration shim or addressed). The test infrastructure (Vitest + fake-indexeddb) must be stood up from scratch — nothing exists in the project today.

**Primary recommendation:** Single `db.version(10)` definition with one `.upgrade()` callback that backfills timestamps and creates "initial" inventory transactions from the old `currentStock` values. Delete all v4-v9 version blocks. Configure Vitest separately from Next.js (use `vitest.config.ts`, not `next.config`), targeting only `src/**/*.test.ts` files to avoid conflicts with Playwright e2e tests.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.0.8 (already installed) | IndexedDB ORM, schema versioning | Already in project; v4 is current stable |
| fake-indexeddb | ^6.x | In-memory IDB for Node.js/Vitest | Official Dexie recommendation for testing |
| vitest | ^2.x | Test runner | Vite-native, ESM-first, fastest for Next.js 14 projects |
| @vitest/coverage-v8 | ^2.x | Coverage reporting | Ships with vitest ecosystem |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/fake-indexeddb | (bundled in fake-indexeddb v6) | TypeScript types | Automatically included |
| vite-tsconfig-paths | ^5.x | Resolve `@/*` aliases in Vitest | Required because project uses `@/*` → `src/*` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fake-indexeddb | jest-environment-jsdom with IDBFactory polyfill | fake-indexeddb is purpose-built; jsdom IDB polyfill is incomplete |
| vitest | jest | jest requires babel transform for ESM Dexie imports; vitest handles ESM natively |

**Installation:**
```bash
pnpm add -D vitest @vitest/coverage-v8 fake-indexeddb vite-tsconfig-paths
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   └── db.ts               # Single v10 schema — rewritten
├── __tests__/
│   ├── setup.ts            # fake-indexeddb/auto import + beforeEach db reset
│   ├── fixtures/
│   │   └── db-fixtures.ts  # Synthetic test data generators
│   └── migration/
│       └── v10-migration.test.ts  # Schema upgrade tests
vitest.config.ts             # Vitest config (NOT inside next.config)
```

### Pattern 1: Single Clean Version Block

**What:** Define one `db.version(10)` with all stores. Include one `.upgrade()` that handles the full migration from any previous state (v4-v9). Delete all old version blocks.

**When to use:** When wiping migration history is acceptable (it is here — user approved fresh start at v10).

**Why single version vs split:** Dexie requires every intermediate version to be defined if any client might be on it. Since real users are on v9 (or earlier), we need exactly: all old versions (even if empty stubs) up to v9 to prevent "DatabaseClosedError: db.version(N) must be >= N" errors — OR we define v10 as the only version and rely on the fact that Dexie will run upgrade from whatever version the client has. **Critical finding:** Dexie runs upgrade callbacks sequentially for all versions between the stored version and the new version. If we define only v10 with an upgrade callback, and a user is on v8, Dexie will run v10's upgrade starting from the v8 schema state. This works correctly — the upgrade sees existing data and can migrate it. The old version blocks (v4-v9) can be deleted safely.

```typescript
// Source: Dexie official docs - upgrading
const db = new Dexie("IntakeTrackerDB") as Dexie & { ... };

db.version(10).stores({
  intakeRecords: "id, [type+timestamp], timestamp, source, updatedAt",
  // ... all stores
}).upgrade(async (trans) => {
  const now = Date.now();
  const deviceId = "migrated";
  // backfill all tables
  await trans.table("intakeRecords").toCollection().modify((record) => {
    if (!record.createdAt) record.createdAt = record.timestamp ?? now;
    if (!record.updatedAt) record.updatedAt = record.createdAt;
    if (!record.deletedAt) record.deletedAt = null;
    if (!record.deviceId) record.deviceId = deviceId;
  });
  // ... repeat for all tables
  // Convert currentStock to initial transaction
  const items = await trans.table("inventoryItems").toArray();
  for (const item of items) {
    if (item.currentStock > 0) {
      await trans.table("inventoryTransactions").add({
        id: crypto.randomUUID(),
        inventoryItemId: item.id,
        timestamp: item.createdAt ?? now,
        amount: item.currentStock,
        type: "initial",
        note: "Migrated from v9 currentStock",
        createdAt: item.createdAt ?? now,
        updatedAt: item.createdAt ?? now,
        deletedAt: null,
        deviceId: deviceId,
      });
    }
    // Remove currentStock from the record
    delete (item as any).currentStock;
    await trans.table("inventoryItems").put(item);
  }
});
```

### Pattern 2: Compound Index Definition

**What:** Dexie uses bracket notation `[fieldA+fieldB]` in the stores string for compound indexes.

**When to use:** Any query that filters on two fields together (e.g., "all intakeRecords of type=water between timestamps T1 and T2").

```typescript
// Source: Dexie official docs - compound indexes
db.version(10).stores({
  intakeRecords:    "id, [type+timestamp], timestamp, updatedAt",
  doseLogs:         "id, [prescriptionId+scheduledDate], prescriptionId, scheduledDate, status, updatedAt",
  inventoryTransactions: "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, updatedAt",
  weightRecords:    "id, timestamp, updatedAt",
  bloodPressureRecords: "id, timestamp, updatedAt",
  eatingRecords:    "id, timestamp, updatedAt",
  urinationRecords: "id, timestamp, updatedAt",
  defecationRecords: "id, timestamp, updatedAt",
  prescriptions:    "id, isActive, updatedAt",
  medicationPhases: "id, prescriptionId, status, updatedAt",
  phaseSchedules:   "id, phaseId, updatedAt",
  inventoryItems:   "id, prescriptionId, isActive, updatedAt",
  dailyNotes:       "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:        "id, timestamp, action",
});
```

### Pattern 3: fake-indexeddb Test Setup

**What:** Import `fake-indexeddb/auto` before any Dexie code runs. This patches the global IDB API in Node.js so Dexie works identically to in a browser.

**When to use:** Every test file that touches `db.ts`.

```typescript
// Source: fake-indexeddb README / Dexie testing docs
// src/__tests__/setup.ts
import "fake-indexeddb/auto";

// vitest.config.ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
```

### Pattern 4: Database Reset Between Tests

**What:** Each test must start with a fresh database. fake-indexeddb creates a new in-memory store per process, but the Dexie instance is a module singleton. The standard pattern is to delete and re-open the database in `beforeEach`.

```typescript
// src/__tests__/setup.ts (or per-test beforeEach)
import { db } from "@/lib/db";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterAll(async () => {
  await db.close();
});
```

### Anti-Patterns to Avoid

- **Storing `currentStock` on `InventoryItem`:** Sync-hostile. Two devices that both update the counter will conflict with no merge strategy. Event sourcing sidesteps this entirely.
- **Indexing non-queried fields:** Every indexed field adds write overhead. Only index fields used in `.where()` or `.orderBy()` queries.
- **Using `null` vs `undefined` for `deletedAt`:** Choose one and be consistent. `null` is indexable in Dexie (you can query `where('deletedAt').equals(null)`); `undefined` means the field is absent and cannot be queried. Use `null` for "not deleted" so the field is always present.
- **Defining compound indexes on rarely-queried pairs:** The `[type+timestamp]` compound on `intakeRecords` is correct because the main query is "water records in date range." Don't add compound indexes speculatively.
- **Calling `db.version()` without repeating ALL store definitions:** Dexie requires the full schema string each version. If you omit a table, it gets deleted. This is the #1 source of migration data loss.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-memory IDB for tests | Custom IDB polyfill | fake-indexeddb | fake-indexeddb passes Dexie's own test suite; custom polyfills miss edge cases |
| Batch field backfill in upgrade | Manual forEach loops | `.toCollection().modify()` | `modify()` is atomic within the upgrade transaction and handles large datasets without loading all records into memory |
| UUID generation | Custom ID generator | `crypto.randomUUID()` | Already used in existing upgrade code; built into all modern engines |
| TypeScript config resolution in Vitest | Manual path aliases | vite-tsconfig-paths plugin | Reads `tsconfig.json` paths automatically; zero duplication |

**Key insight:** Dexie's `.upgrade()` callback runs inside an implicit IndexedDB transaction. Any error thrown aborts the entire upgrade and rolls back, which is exactly the safety net needed for a migration with 600+ live records.

---

## Common Pitfalls

### Pitfall 1: "VersionError" on Fresh-Start

**What goes wrong:** If a user has database version 9 and the code only defines `db.version(10)`, Dexie will attempt to upgrade from 9 → 10. This works. BUT if the code defines only `db.version(10)` WITHOUT an `.upgrade()` callback, Dexie silently deletes all object stores that existed in the old schema and creates new ones — losing all data.

**Why it happens:** Dexie interprets "no upgrade callback" as "schema changes only, no data migration needed." It still applies schema changes, which for a fresh stores() definition means deleting old indexes.

**How to avoid:** ALWAYS provide an `.upgrade()` callback even if it does nothing. The callback signals "I know there's existing data to preserve."

**Warning signs:** Database opens successfully but all tables are empty after upgrade.

### Pitfall 2: `currentStock` Still Referenced by Services

**What goes wrong:** Removing `currentStock` from the `InventoryItem` interface causes TypeScript errors in every service file that reads it. This phase doesn't rewrite services (Phase 3), but the TypeScript build will break.

**Why it happens:** `db.ts` exports the interfaces and all services import them. Interface changes are compile-time breaking changes.

**How to avoid:** Two options — (a) keep `currentStock?: number` as a deprecated optional field with `@deprecated` JSDoc and a comment that services must not write to it; or (b) use `// @ts-expect-error` suppressions in services until Phase 3. Option (a) is cleaner and prevents Phase 3 from being blocked by type errors. The field being optional with no index means it won't be populated by new code but won't break existing reads.

**Warning signs:** `pnpm build` fails with "Property 'currentStock' does not exist" errors after db.ts rewrite.

### Pitfall 3: fake-indexeddb Not Resetting Between Tests

**What goes wrong:** Tests pass in isolation but fail when run together because state leaks between tests.

**Why it happens:** The Dexie instance is a module singleton. fake-indexeddb creates one in-memory store per Dexie database name. If test A adds records and test B expects an empty database, B fails.

**How to avoid:** Call `await db.delete(); await db.open();` in `beforeEach`. This drops and recreates the in-memory store cleanly.

**Warning signs:** Tests pass with `vitest run --testNamePattern=specific-test` but fail with `vitest run`.

### Pitfall 4: Compound Index Query Direction

**What goes wrong:** Querying `[type+timestamp]` with `.where('[type+timestamp]').between(...)` requires the compound key tuple syntax. Developers attempt `.where('type').equals('water').and(r => r.timestamp > T)` which uses a full table scan for the timestamp filter.

**Why it happens:** The `.and()` callback filter runs in JavaScript, not at the IDB index level.

**How to avoid:** Use `.where('[type+timestamp]').between(['water', start], ['water', end])` to leverage the compound index fully.

**Warning signs:** Charts page still slow after migration despite new indexes.

### Pitfall 5: `deletedAt` null vs undefined Inconsistency

**What goes wrong:** Some records have `deletedAt: null` (set by migration), others have no `deletedAt` field (created before the field was added or by code that doesn't set it). Queries for "active records" using `.where('deletedAt').equals(null)` miss records where the field is absent.

**Why it happens:** IndexedDB treats `null` and `undefined` differently for index lookups. A record without the field has an implicit `undefined`, which is NOT equal to `null`.

**How to avoid:** The upgrade callback must use `modify()` to set `deletedAt = null` on ALL existing records. New record creation code must always explicitly set `deletedAt: null`.

---

## Code Examples

### Derived Stock Calculation

```typescript
// Source: event-sourcing pattern — sum transactions
async function getComputedStock(inventoryItemId: string): Promise<number> {
  const transactions = await db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .toArray();
  return transactions.reduce((sum, tx) => {
    if (tx.type === "consumed") return sum - tx.amount;
    return sum + tx.amount; // "initial", "refill", "adjusted"
  }, 0);
}
```

### Compound Index Range Query

```typescript
// Source: Dexie compound index docs
async function getWaterIntakeInRange(start: number, end: number) {
  return db.intakeRecords
    .where("[type+timestamp]")
    .between(["water", start], ["water", end])
    .toArray();
}
```

### Migration Test Structure

```typescript
// src/__tests__/migration/v10-migration.test.ts
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { db } from "@/lib/db";

describe("v10 migration", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("preserves existing intake records", async () => {
    // Seed via low-level IDB before schema opens (or use a v9 fixture db)
    // Then open v10 db and verify records survive with new fields
  });

  it("creates initial transaction from legacy currentStock", async () => {
    // Verify that after migration, inventoryTransactions contains
    // one "initial" record per inventory item that had currentStock > 0
  });

  it("backfills deletedAt: null on all existing records", async () => {
    // Verify no record has deletedAt === undefined after migration
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dexie 3.x `Table<T>` typing | Dexie 4.x `EntityTable<T, "id">` typing | Dexie 4.0 (2023) | Cleaner TypeScript; already in use |
| Manual Dexie version stubs for each schema change | Single consolidated version with upgrade | N/A (project decision) | Cleaner codebase; safe when only one production schema state exists |
| Mutable `currentStock` counter | Event-sourced `inventoryTransactions` sum | N/A (project decision) | Sync-safe, auditable, no merge conflicts |

**Deprecated/outdated:**
- v4-v9 migration chain in `db.ts`: To be deleted in this phase — code is dead weight once v10 upgrade runs
- `InventoryTransaction.type` union without "initial": Needs "initial" added

---

## Open Questions

1. **Should `medications` and `medicationSchedules` legacy tables be included in v10 stores?**
   - What we know: They exist in v7 and are cleared in v8's upgrade. By v9 they're empty but still defined in the schema as store stubs implicitly (Dexie retains them since v8 defined them).
   - What's unclear: Whether they need to appear in v10's stores() call. If omitted from v10, Dexie will delete them, which is fine since they're empty. If included, they persist as empty tables.
   - Recommendation: Omit from v10 stores(). They're empty after v8 upgrade. Deleting them reduces schema clutter. Verify with `pnpm dev` that no service imports them.

2. **Single `db.version(10)` or keep minimal stubs for v4-v9?**
   - What we know: Dexie can upgrade from any version to v10 if only v10 is defined with an upgrade callback.
   - What's unclear: Whether Dexie requires intermediate versions to exist when jumping more than one version.
   - Recommendation: Define ONLY `db.version(10)`. Dexie's upgrade mechanism handles the gap. The upgrade callback sees the data as it exists in the current (v9) schema and can migrate it.

3. **`dosage` field on `PhaseSchedule` — what are the units?**
   - What we know: The v9 upgrade sets `s.dosage = pInfo.pills * pInfo.strength` (pills × mg/pill = mg total).
   - What's unclear: Whether the `unit` field from `MedicationPhase` should also live on `PhaseSchedule` for display purposes.
   - Recommendation: Add `unit` to `PhaseSchedule` interface during the v10 schema write. It's needed for Phase 6 UI (MEDX-05 fractional display). Out of scope to populate now, but schema should support it.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^2.x (not yet installed) |
| Config file | `vitest.config.ts` — Wave 0 task |
| Quick run command | `pnpm vitest run src/__tests__/migration/` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | Compound indexes defined and queryable | unit | `pnpm vitest run src/__tests__/migration/v10-migration.test.ts` | Wave 0 |
| SCHM-02 | Migration test harness runs without error | unit | `pnpm vitest run src/__tests__/migration/` | Wave 0 |
| SCHM-03 | `inventoryItems` has no `currentStock`; transactions sum to correct stock | unit | `pnpm vitest run src/__tests__/migration/` | Wave 0 |
| SCHM-04 | All tables have `updatedAt`, `createdAt`, `deletedAt`, `deviceId` after upgrade | unit | `pnpm vitest run src/__tests__/migration/` | Wave 0 |
| TEST-01 | Vitest runs, fake-indexeddb resolves, test passes | smoke | `pnpm vitest run` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run src/__tests__/migration/`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before phase sign-off

### Wave 0 Gaps

- [ ] `vitest.config.ts` — root config, sets up `vite-tsconfig-paths`, `setupFiles`, `include`/`exclude`
- [ ] `src/__tests__/setup.ts` — imports `fake-indexeddb/auto`; `beforeEach` db reset helper
- [ ] `src/__tests__/fixtures/db-fixtures.ts` — synthetic data generators for all 14 tables (edge cases: missing optional fields, records from old schema versions)
- [ ] `src/__tests__/migration/v10-migration.test.ts` — covers SCHM-01 through SCHM-04
- [ ] Framework install: `pnpm add -D vitest @vitest/coverage-v8 fake-indexeddb vite-tsconfig-paths`
- [ ] `package.json` test script: `"test": "vitest run"` (separate from `test:e2e` which is Playwright)

---

## Sources

### Primary (HIGH confidence)

- Existing `src/lib/db.ts` — direct inspection of current schema (v4-v9), all interfaces, upgrade callbacks
- `package.json` — dexie@4.0.8 confirmed installed; no vitest or fake-indexeddb present
- `.planning/phases/01-schema-foundation/01-CONTEXT.md` — locked user decisions

### Secondary (MEDIUM confidence)

- Dexie documentation patterns (compound indexes, upgrade callbacks, EntityTable typing) — based on training knowledge of Dexie 4.x, consistent with installed version 4.0.8
- fake-indexeddb v6+ with `fake-indexeddb/auto` auto-patching pattern — widely documented in Dexie testing guides
- Vitest + vite-tsconfig-paths configuration for Next.js 14 App Router projects — standard community pattern

### Tertiary (LOW confidence)

- Behavior of `db.version(10)` with no intermediate version stubs when upgrading from v8 — needs empirical test during Wave 0; Dexie docs suggest this works but the exact behavior with missing intermediate versions warrants a quick smoke test before committing to this approach

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — dexie version confirmed from package.json; fake-indexeddb and vitest are the standard Dexie testing stack
- Architecture: HIGH — patterns derived from direct inspection of existing db.ts code and Dexie's documented upgrade mechanism
- Pitfalls: HIGH — pitfalls 1, 2, 4, 5 are directly observable from the existing codebase; pitfall 3 is standard fake-indexeddb behavior

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (Dexie 4.x is stable; fake-indexeddb is stable)
