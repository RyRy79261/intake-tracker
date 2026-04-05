# Phase 12: Composable Data Foundation - Research

**Researched:** 2026-03-23
**Domain:** Dexie.js schema migration, cross-table atomic transactions, soft-delete standardization, composable entry service
**Confidence:** HIGH

## Summary

Phase 12 builds the data foundation for composable entries -- a `groupId` field on `IntakeRecord`, `EatingRecord`, and `SubstanceRecord` that links records created atomically from a single user action. This requires a Dexie v15 schema migration (adding `groupId` index to 3 tables), a new `composable-entry-service.ts` for atomic cross-table writes and cascading soft-deletes, a new `use-composable-entry.ts` hooks file, and standardizing `intake-service.ts` (and `eating-service.ts`) to use soft-delete instead of hard-delete.

The phase involves zero new npm dependencies. All capabilities exist in the current stack: Dexie.js transactions for atomic multi-table writes, `useLiveQuery` from dexie-react-hooks for reactive reads across tables, and the established `ServiceResult` / `syncFields()` / `generateId()` patterns. The codebase already has 25+ examples of `db.transaction("rw", [...], async () => {...})`, and the `substance-service.ts` is a proven model for the exact pattern needed (multi-table atomic write + soft-delete cascade).

The most critical risk is the soft-delete migration: `intake-service.ts` currently uses hard-delete (`db.intakeRecords.delete(id)`) and its read queries have ZERO `deletedAt` filtering. Similarly, `eating-service.ts` uses hard-delete with no `deletedAt` filtering. Switching to soft-delete requires both (a) changing delete to set `deletedAt` and (b) adding `.filter(r => r.deletedAt === null)` to every read query in both services. This must be done before composable entry cascading deletes can work correctly.

**Primary recommendation:** Build in strict order -- (1) soft-delete standardization for intake + eating services with deletedAt filtering, (2) Dexie v15 schema migration adding groupId, (3) composable-entry-service with atomic create/delete/read, (4) hooks layer. Each step is independently testable with fake-indexeddb.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Users can freely edit any record within a composable group -- the groupId link persists regardless of edits. The group is provenance, not a constraint.
- **D-02:** Two recalculation modes available: (a) re-run AI from stored original input text (full reset of derived values), (b) recalculate math from current record values (e.g., new volume * per-100ml). Both options should be supported by the service layer.
- **D-03:** The composable entry must store the original input text (e.g., "chicken soup") so AI can be re-invoked on an existing group.
- **D-04:** Group membership is flexible at the data model level -- groupId is just a field, any record can reference it. However, no UI or service methods for manual group membership editing are needed now. Groups are created atomically and membership is effectively fixed at creation through normal usage.
- **D-05:** Groups can shrink (individual records can be deleted from a group) -- remaining members stay linked.
- **D-06:** Deleting a record that belongs to a group prompts: "Delete all linked records or just this one?" User chooses scope.
- **D-07:** Standardize all intake record deletion to soft-delete (currently hard-delete in intake-service.ts, but schema already has deletedAt field).
- **D-08:** All deletes (group and individual, within or outside groups) show an undo toast with ~5 second window, matching the existing dose Take/Skip pattern.

### Claude's Discretion
- Exact groupId generation strategy (UUID, nanoid, etc.)
- Dexie v15 index design for groupId queries
- Internal structure of the composable-entry-service API (input types, return types)
- Whether to store group metadata (original input, creation source) as fields on one record or as a lightweight group metadata object
- Undo toast implementation details (reuse existing toast pattern from dose logging)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-01 | User can create a single input that atomically produces linked records across multiple tables via a shared groupId | Composable entry service pattern (Pattern 1), Dexie transaction multi-table atomic write, groupId field design |
| COMP-02 | Dexie v15 schema migration adds groupId index to intakeRecords, eatingRecords, and substanceRecords without corrupting existing data | Schema migration section with exact v15 store definitions, migration test pattern from v14 tests |
| COMP-03 | Deleting a composable entry group soft-deletes all linked records in a single transaction (intake records standardized to soft-delete) | Soft-delete standardization analysis, cascading delete pattern, undo toast pattern |
| COMP-04 | User can view all records linked to a composable group as a unit via useLiveQuery hooks | Single useLiveQuery multi-table read pattern, getEntryGroup service function |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Package manager is **pnpm** (enforced via `preinstall` hook)
- Dexie.js is the data layer; schema is at version 14 with migration logic in `db.ts`
- When adding a new Dexie version, must repeat ALL existing store definitions
- Service files in `src/lib/`, hooks in `src/hooks/`
- ESLint no-restricted-imports: components never import from services directly
- `useLiveQuery` for ALL reads, `useMutation`/`useCallback` for writes
- `ServiceResult<T>` / `ok()` / `err()` / `unwrap()` for error handling
- `syncFields()` generates createdAt, updatedAt, deletedAt, deviceId, timezone
- Soft-delete uses `deletedAt` with `null` (not undefined) for IndexedDB indexability
- Conditional spread for exactOptionalPropertyTypes compliance
- `pnpm test` (vitest) for unit tests, `pnpm lint` for ESLint

## Standard Stack

### Core
| Library | Version (installed) | Latest | Purpose | Why Standard |
|---------|-------------------|--------|---------|--------------|
| dexie | 4.2.1 | 4.3.0 | IndexedDB wrapper, transactions, schema migration | Already in use; no upgrade needed for this phase |
| dexie-react-hooks | 1.1.7 | 4.2.0 | `useLiveQuery` reactive reads | Already in use; 1.1.7 compatible with dexie 4.2.1 |
| fake-indexeddb | 6.2.5 | 6.2.5 | In-memory IndexedDB for tests | Already in use; latest version |
| vitest | 4.0.18 | -- | Test runner | Already configured with setup.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.25.76 | Input validation if needed | If composable entry inputs need schema validation |
| @radix-ui/react-tabs | 1.1.13 | Not needed this phase | Future phases (UI cards) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `generateId()` (timestamp+random) | `crypto.randomUUID()` | UUID is more standard for groupIds; existing codebase mixes both; recommend `crypto.randomUUID()` for groupId since it has no temporal ordering benefit needed |
| dexie-relationships plugin | Manual transactions | Plugin unmaintained since 2019, incompatible with Dexie 4.x types; manual transactions are already the pattern |

**Installation:**
```bash
# No new packages needed. All capabilities exist in the current stack.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  lib/
    db.ts                         # Modified: v15 schema, groupId on 3 interfaces
    composable-entry-service.ts   # NEW: atomic cross-table writes, cascade delete, group read
    intake-service.ts             # Modified: soft-delete + deletedAt filtering
    eating-service.ts             # Modified: soft-delete + deletedAt filtering
    substance-service.ts          # Unchanged (already uses soft-delete)
  hooks/
    use-composable-entry.ts       # NEW: useLiveQuery for group reads, mutation hooks
    use-intake-queries.ts         # Unchanged (service change is transparent)
    use-eating-queries.ts         # Unchanged (service change is transparent)
  __tests__/
    migration/
      v15-migration.test.ts       # NEW: groupId migration test
    fixtures/
      db-fixtures.ts              # Modified: add makeComposableGroup helper
  lib/
    composable-entry-service.test.ts  # NEW: service unit tests
```

### Pattern 1: Composable Entry Service (Atomic Cross-Table Write)

**What:** A new service that creates linked records across `intakeRecords`, `eatingRecords`, and `substanceRecords` in a single Dexie transaction with a shared `groupId`.
**When:** Any user action that produces records in 2+ tables simultaneously.

```typescript
// src/lib/composable-entry-service.ts
// Source: Architecture patterns from substance-service.ts (lines 37-50)

import { db } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";

// Tables that participate in composable entry transactions
const COMPOSABLE_TABLES = [db.intakeRecords, db.eatingRecords, db.substanceRecords] as const;

interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: Array<{ type: "water" | "salt"; amount: number; source?: string; note?: string }>;
  substance?: {
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    volumeMl?: number;
    description: string;
  };
  originalInputText?: string; // D-03: stored for AI re-run capability
}

interface ComposableEntryResult {
  groupId: string;
  eatingId?: string;
  intakeIds: string[];
  substanceId?: string;
}

export async function addComposableEntry(
  input: ComposableEntryInput,
  timestamp?: number
): Promise<ServiceResult<ComposableEntryResult>> {
  const groupId = crypto.randomUUID();
  const ts = timestamp ?? Date.now();
  const fields = syncFields();
  const result: ComposableEntryResult = { groupId, intakeIds: [] };

  try {
    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      if (input.eating) {
        const id = crypto.randomUUID();
        await db.eatingRecords.add({
          id, timestamp: ts, groupId,
          ...(input.eating.note && { note: input.eating.note }),
          ...(input.eating.grams && { grams: input.eating.grams }),
          ...fields,
        });
        result.eatingId = id;
      }

      for (const intake of input.intakes ?? []) {
        const id = crypto.randomUUID();
        await db.intakeRecords.add({
          id, timestamp: ts, groupId,
          type: intake.type, amount: intake.amount,
          source: intake.source ?? "composable",
          ...(intake.note && { note: intake.note }),
          ...fields,
        });
        result.intakeIds.push(id);
      }

      if (input.substance) {
        const substanceId = crypto.randomUUID();
        await db.substanceRecords.add({
          id: substanceId, timestamp: ts, groupId,
          type: input.substance.type,
          ...(input.substance.amountMg !== undefined && { amountMg: input.substance.amountMg }),
          ...(input.substance.amountStandardDrinks !== undefined && {
            amountStandardDrinks: input.substance.amountStandardDrinks,
          }),
          ...(input.substance.volumeMl !== undefined && { volumeMl: input.substance.volumeMl }),
          description: input.substance.description,
          source: "standalone",
          aiEnriched: false,
          ...fields,
        });
        result.substanceId = substanceId;

        // Substance volume counts as water intake
        if (input.substance.volumeMl) {
          const intakeId = crypto.randomUUID();
          await db.intakeRecords.add({
            id: intakeId, timestamp: ts, groupId,
            type: "water", amount: input.substance.volumeMl,
            source: `substance:${substanceId}`,
            note: input.substance.description,
            ...fields,
          });
          result.intakeIds.push(intakeId);
        }
      }
    });
    return ok(result);
  } catch (e) {
    return err("Failed to create composable entry", e);
  }
}
```

**Key details:**
- `COMPOSABLE_TABLES` constant ensures all tables are declared in every transaction (prevents Pitfall 1)
- All AI/network calls happen BEFORE calling this function (prevents Pitfall 7: transaction auto-close)
- Uses `crypto.randomUUID()` for groupId (more standard than `generateId()` for non-temporal IDs)
- Uses conditional spread (`...(x && { key: x })`) for exactOptionalPropertyTypes compliance
- Follows existing `ServiceResult<T>` pattern

### Pattern 2: Cascading Soft-Delete via GroupId

**What:** Soft-delete all records sharing a groupId in a single transaction.
**When:** User chooses "Delete all linked entries" on a grouped record.

```typescript
// Source: Adapted from substance-service.ts deleteSubstanceRecord (lines 110-135)

export async function deleteEntryGroup(
  groupId: string
): Promise<ServiceResult<{ deletedCount: number }>> {
  const now = Date.now();
  let deletedCount = 0;

  try {
    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const r of records) {
          if (r.deletedAt === null) {
            await table.update(r.id, { deletedAt: now, updatedAt: now });
            deletedCount++;
          }
        }
      }
    });
    return ok({ deletedCount });
  } catch (e) {
    return err("Failed to delete entry group", e);
  }
}
```

**Why `.where("groupId").equals()` not `.modify()`:** Within a transaction, we need the count of affected records for the undo toast message. Using `where().toArray()` + individual `update()` gives us the count and lets us skip already-deleted records. The `modify()` API returns the count but makes it harder to conditionally skip records.

### Pattern 3: Single useLiveQuery for Multi-Table Group Read

**What:** Fetch all records in a composable group with a single reactive hook.
**When:** Displaying a composable entry as a unit.

```typescript
// Source: Dexie docs confirm useLiveQuery tracks all tables touched within callback
// Ref: https://github.com/dexie/Dexie.js/issues/2090

export function useEntryGroup(groupId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!groupId) return null;
      const [intakes, eatings, substances] = await Promise.all([
        db.intakeRecords.where("groupId").equals(groupId).toArray(),
        db.eatingRecords.where("groupId").equals(groupId).toArray(),
        db.substanceRecords.where("groupId").equals(groupId).toArray(),
      ]);
      return {
        intakes: intakes.filter(r => r.deletedAt === null),
        eatings: eatings.filter(r => r.deletedAt === null),
        substances: substances.filter(r => r.deletedAt === null),
      };
    },
    [groupId],
    undefined // undefined default = loading state distinguishable from empty
  );
}
```

**Critical:** Use a SINGLE `useLiveQuery` callback that queries all 3 tables. Separate hooks per table would fire independently, causing brief UI inconsistency after atomic writes. Dexie's observation system tracks all tables touched in one callback and re-fires the entire callback when any of them change.

### Pattern 4: Group Metadata Storage (D-03: Original Input Text)

**What:** Store the original input text and creation source on group records for AI re-run capability.
**Decision:** Add `groupId`, `originalInputText`, and `groupSource` fields to the records, rather than creating a separate metadata table. The `originalInputText` and `groupSource` only need to be stored on ONE record in the group (the "primary" record, e.g., the eating record for food entries).

```typescript
// Additional fields on EatingRecord, IntakeRecord, SubstanceRecord interfaces:
groupId?: string;              // shared key linking records in a composable group
originalInputText?: string;    // stored on primary record only, for AI re-run
groupSource?: string;          // "ai_food_parse" | "ai_substance_lookup" | "manual"
```

**Why not a separate table:** A metadata table would exist solely to hold `originalInputText` and `groupSource` -- two fields. Every group query would require joining to this table. Since the composable entry always has a "primary" record (the eating record for food, the substance record for beverages), storing metadata there avoids the extra table and join.

### Pattern 5: Undo Toast with Soft-Delete Reversal

**What:** Show an undo toast after delete, reversing the soft-delete if the user taps Undo within 5 seconds.
**Source:** Existing `showUndoToast` from `src/components/medications/undo-toast.tsx`.

```typescript
// Undo reversal function
export async function undoDeleteEntryGroup(
  groupId: string
): Promise<ServiceResult<{ restoredCount: number }>> {
  let restoredCount = 0;
  try {
    await db.transaction("rw", [...COMPOSABLE_TABLES], async () => {
      const now = Date.now();
      for (const table of COMPOSABLE_TABLES) {
        const records = await table.where("groupId").equals(groupId).toArray();
        for (const r of records) {
          if (r.deletedAt !== null) {
            await table.update(r.id, { deletedAt: null, updatedAt: now });
            restoredCount++;
          }
        }
      }
    });
    return ok({ restoredCount });
  } catch (e) {
    return err("Failed to undo delete", e);
  }
}
```

The UI flow:
1. User taps delete -> service sets `deletedAt` on records -> `useLiveQuery` hooks automatically exclude them -> UI updates instantly
2. Toast appears with "Undo" button (5s timer via `showUndoToast`)
3. If user taps Undo -> `undoDeleteEntryGroup` sets `deletedAt: null` -> records reappear
4. If toast expires -> records remain soft-deleted (no additional action needed)

### Anti-Patterns to Avoid

- **Anti-Pattern 1: Calling fetch/AI inside a Dexie transaction.** IndexedDB transactions auto-close when the event loop is idle. A `fetch()` yields to the event loop, splitting the transaction. All data must be gathered BEFORE the transaction opens.
- **Anti-Pattern 2: Separate useLiveQuery hooks per table for composable group display.** Each hook fires independently, creating brief UI inconsistency. Use a single callback.
- **Anti-Pattern 3: Cascading delete logic in individual domain services.** The eating service should NOT know about substance records. Cascade logic belongs exclusively in `composable-entry-service.ts`.
- **Anti-Pattern 4: Hard-deleting intake records while soft-deleting substance records.** Mixed delete behavior makes undo impossible for intake records. Standardize first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-table atomicity | Custom rollback logic | `db.transaction("rw", [tables], callback)` | Dexie handles rollback on error automatically; 25+ existing examples in codebase |
| Reactive multi-table reads | Custom event system or polling | `useLiveQuery` with single callback | Dexie's observation system tracks all tables touched; already the standard pattern |
| Unique ID generation | Custom incrementing IDs | `crypto.randomUUID()` | Browser-native, guaranteed unique, no state management |
| Record timestamp/metadata | Manual field setting | `syncFields()` from `src/lib/utils.ts` | Returns `{ createdAt, updatedAt, deletedAt: null, deviceId, timezone }` |
| Error handling | try/catch with custom shapes | `ServiceResult<T>` / `ok()` / `err()` | Established pattern across all services |
| Undo toast UI | Custom undo mechanism | `showUndoToast()` from `src/components/medications/undo-toast.tsx` | Already working for dose take/skip; 5-second window with action button |

**Key insight:** This phase is almost entirely reusing existing patterns. The only genuinely new thing is the `groupId` field and the cross-table logic in `composable-entry-service.ts`. Everything else -- transactions, soft-delete, syncFields, ServiceResult, useLiveQuery, undo toast -- is established pattern application.

## Common Pitfalls

### Pitfall 1: Forgetting Tables in Dexie Transaction Declaration
**What goes wrong:** `db.transaction("rw", [db.intakeRecords, db.eatingRecords], ...)` omits `db.substanceRecords`. Writes to the undeclared table operate outside the transaction. On rollback, those writes persist as orphaned records.
**Why it happens:** Composable entries touch 3 tables; easy to miss one when copying from existing 2-table transaction patterns.
**How to avoid:** Define `const COMPOSABLE_TABLES = [db.intakeRecords, db.eatingRecords, db.substanceRecords] as const;` and use `[...COMPOSABLE_TABLES]` in every transaction. Write a test that intentionally fails mid-transaction and verifies zero records in ALL tables.
**Warning signs:** Orphaned records with `groupId` that have no siblings in other tables.

### Pitfall 2: Intake Service Read Queries Return Soft-Deleted Records
**What goes wrong:** After switching `deleteIntakeRecord` to soft-delete, every existing query (`getDailyTotal`, `getRecentRecords`, `getRecordsInLast24Hours`, `getRecordsByDateRange`, `getAllRecords`, pagination queries) will return soft-deleted records because they have ZERO `deletedAt` filtering.
**Why it happens:** Hard-delete meant no filtering was needed. The `substance-service.ts` already filters correctly because it was built with soft-delete from the start.
**How to avoid:** When switching to soft-delete, add `.filter(r => r.deletedAt === null)` to ALL read functions in `intake-service.ts` and `eating-service.ts`. Audit every public function.
**Warning signs:** Daily totals include deleted records; "recent" list shows deleted entries.
**Specific functions needing filter:**
- `intake-service.ts`: `getRecordsInLast24Hours`, `getTotalInLast24Hours`, `getDailyTotal`, `getRecentRecords`, `getAllRecords`, `getRecordsPaginated`, `getRecordsByCursor`, `getRecordsByDateRange`
- `eating-service.ts`: `getEatingRecords`, `getEatingRecordsByDateRange`

### Pitfall 3: Transaction Auto-Close via External Await
**What goes wrong:** Awaiting a non-Dexie promise (fetch, setTimeout, custom Promise) inside a Dexie transaction causes IndexedDB to auto-close the transaction. Subsequent writes silently start a new implicit transaction.
**Why it happens:** IndexedDB spec behavior -- transactions auto-commit when the event loop is idle. Safari is especially aggressive.
**How to avoid:** All external calls (AI parsing, network requests) must complete BEFORE `db.transaction()` is called. The composable entry service receives fully-resolved data as input.
**Warning signs:** Intermittent partial writes; transaction works in Chrome but fails in Safari.

### Pitfall 4: useLiveQuery Reactivity Gaps with Split Queries
**What goes wrong:** Separate `useLiveQuery` hooks for each table in a group fire independently after an atomic transaction. Brief UI inconsistency where one table's data is stale.
**Why it happens:** Dexie's observation system fires per-query, not per-transaction.
**How to avoid:** Single `useLiveQuery` callback that reads from all 3 tables in one pass.
**Warning signs:** Composable entry components render 2-3 times per data change.

### Pitfall 5: Dexie v15 Schema Must Repeat ALL v14 Definitions
**What goes wrong:** Forgetting to repeat a table's index definition in v15 causes Dexie to delete that table's indexes.
**Why it happens:** Dexie requires the full schema in every version block. Copy-paste from v14 can miss a table or introduce a typo.
**How to avoid:** Copy v14 store definitions exactly, then modify only the 3 tables that need `groupId`. Verify with a migration test that existing data survives.
**Warning signs:** "KeyPath not indexed" errors on queries that worked before.

### Pitfall 6: `undefined` vs `null` for deletedAt on New GroupId Field
**What goes wrong:** Setting `groupId: undefined` on existing records during migration would put `undefined` in the index, which IndexedDB excludes from index entries. This is actually correct behavior -- but if someone accidentally sets `groupId: null`, it WOULD appear in the index and could cause unexpected results.
**Why it happens:** The codebase convention uses `null` for deletedAt (indexable) but `undefined` for optional fields that should be excluded from indexes.
**How to avoid:** `groupId` should be `string | undefined` (not `string | null`). Records without a group simply don't have the field. The Dexie v15 migration needs NO upgrade function -- existing records naturally have `undefined` for the new field.

## Code Examples

### Dexie v15 Schema Migration (Exact Code)
```typescript
// Source: Existing v14 block in db.ts, extended with groupId index on 3 tables

db.version(15).stores({
  // Modified: add groupId index
  intakeRecords:        "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  eatingRecords:        "id, timestamp, groupId, updatedAt",
  substanceRecords:     "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",

  // Unchanged: exact copy from v14
  weightRecords:        "id, timestamp, updatedAt",
  bloodPressureRecords: "id, timestamp, position, arm, updatedAt",
  urinationRecords:     "id, timestamp, updatedAt",
  defecationRecords:    "id, timestamp, updatedAt",
  prescriptions:        "id, isActive, updatedAt, createdAt",
  medicationPhases:     "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:       "id, phaseId, time, enabled, updatedAt",
  inventoryItems:       "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:"id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:             "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:           "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:            "id, [action+timestamp], timestamp, action",
  titrationPlans:       "id, conditionLabel, status, updatedAt",
});
// No upgrade function needed. groupId is optional; existing records have undefined,
// which IndexedDB excludes from index entries. Zero backfill required.
```

### Soft-Delete Migration for intake-service.ts
```typescript
// BEFORE (hard-delete):
export async function deleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    await db.intakeRecords.delete(id);
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete intake record", e);
  }
}

// AFTER (soft-delete):
export async function deleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.intakeRecords.update(id, { deletedAt: now, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete intake record", e);
  }
}

// AND add filtering to every read function, e.g.:
export async function getDailyTotal(type: "water" | "salt", dayStartHour: number): Promise<number> {
  const cutoffTime = getDayStartTimestamp(dayStartHour);
  const records = await db.intakeRecords
    .where("timestamp")
    .aboveOrEqual(cutoffTime)
    .filter((r) => r.type === type && r.deletedAt === null) // <-- add deletedAt check
    .toArray();
  return records.reduce((sum, r) => sum + r.amount, 0);
}
```

### Test Fixture: makeComposableGroup Helper
```typescript
// Addition to src/__tests__/fixtures/db-fixtures.ts

export async function seedComposableGroup(overrides?: {
  groupId?: string;
  eating?: Partial<EatingRecord>;
  intakes?: Array<Partial<IntakeRecord>>;
  substance?: Partial<SubstanceRecord>;
}): Promise<{ groupId: string; eatingId?: string; intakeIds: string[]; substanceId?: string }> {
  const groupId = overrides?.groupId ?? crypto.randomUUID();
  const result = { groupId, intakeIds: [] as string[] };

  if (overrides?.eating !== undefined || !overrides) {
    const id = crypto.randomUUID();
    await db.eatingRecords.add(makeEatingRecord({ id, groupId, ...overrides?.eating }));
    result.eatingId = id;
  }
  // ... similar for intakes, substance
  return result;
}
```

### Migration Test Pattern (from v14-migration.test.ts)
```typescript
// Source: src/__tests__/migration/v14-migration.test.ts

describe("v15 migration: groupId index", () => {
  it("adds groupId index to intakeRecords without corrupting existing data", async () => {
    await db.close();
    await db.delete();

    // Seed at v14 level (IDB version 140)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["intakeRecords"], "readwrite");
        tx.objectStore("intakeRecords").add({
          id: "pre-v15-water", type: "water", amount: 250,
          timestamp: 1700000000000, source: "manual",
          createdAt: 1700000000000, updatedAt: 1700000000000,
          deletedAt: null, deviceId: "test", timezone: "UTC",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v15 upgrade
    await db.open();

    // Existing record preserved
    const record = await db.intakeRecords.get("pre-v15-water");
    expect(record).toBeDefined();
    expect(record!.amount).toBe(250);

    // groupId index is queryable (empty result for undefined groupId)
    const grouped = await db.intakeRecords.where("groupId").equals("test-group").toArray();
    expect(grouped).toHaveLength(0);

    // Can add a record WITH groupId
    await db.intakeRecords.add({
      id: "post-v15", type: "water", amount: 100,
      timestamp: 1700000001000, source: "composable", groupId: "grp-1",
      createdAt: 1700000001000, updatedAt: 1700000001000,
      deletedAt: null, deviceId: "test", timezone: "UTC",
    });
    const byGroup = await db.intakeRecords.where("groupId").equals("grp-1").toArray();
    expect(byGroup).toHaveLength(1);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-delete intake records | Soft-delete (deletedAt timestamp) | This phase | Enables undo, composable cascade, future sync |
| No cross-table record linking | groupId field on 3 tables | This phase | Enables composable entries |
| Separate unlinked records per user action | Atomic multi-record creation via composable-entry-service | This phase | Foundation for Phase 13-15 UI |

**Deprecated/outdated after this phase:**
- `db.intakeRecords.delete(id)` -- replaced by soft-delete via `update(id, { deletedAt: now })`
- `db.eatingRecords.delete(id)` -- same pattern

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Setup file | `src/__tests__/setup.ts` (fake-indexeddb, db reset per test) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` (all 19 test files, ~2s) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMP-01 | addComposableEntry creates linked records with shared groupId | unit | `pnpm test -- src/lib/composable-entry-service.test.ts` | Wave 0 |
| COMP-02 | v15 migration adds groupId index, preserves existing records | unit | `pnpm test -- src/__tests__/migration/v15-migration.test.ts` | Wave 0 |
| COMP-03 | deleteEntryGroup soft-deletes all linked records atomically | unit | `pnpm test -- src/lib/composable-entry-service.test.ts` | Wave 0 |
| COMP-03 | intake-service soft-delete + deletedAt filtering | unit | `pnpm test -- src/lib/intake-service.test.ts` | Wave 0 (new file) |
| COMP-03 | eating-service soft-delete + deletedAt filtering | unit | `pnpm test -- src/lib/eating-service.test.ts` | Wave 0 (new file) |
| COMP-04 | getEntryGroup returns all linked records via groupId query | unit | `pnpm test -- src/lib/composable-entry-service.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm lint`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/composable-entry-service.test.ts` -- covers COMP-01, COMP-03, COMP-04
- [ ] `src/__tests__/migration/v15-migration.test.ts` -- covers COMP-02
- [ ] `src/lib/intake-service.test.ts` -- new file for soft-delete behavior, deletedAt filtering
- [ ] `src/lib/eating-service.test.ts` -- new file for soft-delete behavior, deletedAt filtering
- [ ] Update `db-fixtures.ts` with `groupId` field support on existing make* functions

### Specific Test Scenarios Required

**COMP-01 (Atomic creation):**
- Creates eating + intake + substance records with same groupId
- Creates only eating + intake when no substance input
- Creates only substance + linked water intake when no eating input
- All records share the same timestamp
- All records have syncFields (createdAt, updatedAt, deletedAt: null, deviceId, timezone)
- Returns correct IDs in result

**COMP-02 (Migration):**
- Existing v14 intakeRecords survive upgrade with all data intact
- Existing v14 eatingRecords survive upgrade
- Existing v14 substanceRecords survive upgrade
- groupId index is queryable on all 3 tables after upgrade
- Records without groupId are not returned by groupId index queries

**COMP-03 (Cascading soft-delete):**
- deleteEntryGroup sets deletedAt on ALL records with matching groupId across 3 tables
- deleteEntryGroup in a single transaction: if one table fails, none are deleted
- After deleteEntryGroup, read queries exclude deleted records
- undoDeleteEntryGroup restores all records (sets deletedAt back to null)
- Individual record delete (not group) only affects that one record

**COMP-03 (Soft-delete standardization):**
- deleteIntakeRecord sets deletedAt instead of removing record
- getDailyTotal excludes soft-deleted records
- getRecentRecords excludes soft-deleted records
- getRecordsInLast24Hours excludes soft-deleted records
- Same for eating-service functions

**COMP-04 (Group query):**
- getEntryGroup returns all non-deleted records across 3 tables for a groupId
- getEntryGroup excludes soft-deleted records
- getEntryGroup returns empty arrays for non-existent groupId

## Open Questions

1. **Where to store `originalInputText` for D-03 (AI re-run)?**
   - What we know: Must be stored per group for AI re-run. D-03 explicitly requires this.
   - Options: (a) on the "primary" record in the group (eating record for food, substance for beverage), (b) on ALL records in the group (redundant but simpler queries), (c) as a separate lightweight field alongside groupId
   - Recommendation: Store on the primary record only. Add `originalInputText?: string` and `groupSource?: string` to all 3 interfaces but only populate on one. This avoids a metadata table and keeps the field count minimal. The `getEntryGroup` function already returns all records -- the caller can find the one with `originalInputText` set.

2. **Should `deleteIntakeRecord` undo also work for non-grouped records?**
   - What we know: D-08 says ALL deletes show undo toast. Currently no undo capability exists for intake/eating deletes.
   - Recommendation: Yes. Soft-delete enables undo for ALL records, not just grouped ones. The undo toast pattern from `showUndoToast` + soft-delete reversal works universally.

3. **Existing tests may need updating after soft-delete switch**
   - What we know: No existing `intake-service.test.ts` exists (the service was tested via E2E only). The `substance-service.test.ts` already tests soft-delete correctly.
   - Recommendation: Create new test files for intake-service and eating-service as part of this phase. No existing tests will break from the soft-delete change because there are no unit tests for these services.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection:** `src/lib/db.ts` (v14 schema, all interfaces), `src/lib/intake-service.ts` (hard-delete at line 57, zero deletedAt filtering), `src/lib/eating-service.ts` (hard-delete at line 44, zero deletedAt filtering), `src/lib/substance-service.ts` (soft-delete model, deletedAt filtering pattern), `src/hooks/use-intake-queries.ts` (useLiveQuery pattern), `src/hooks/use-substance-queries.ts` (useCallback mutation pattern), `src/components/medications/undo-toast.tsx` (showUndoToast pattern), `src/__tests__/migration/v14-migration.test.ts` (migration test pattern), `src/__tests__/setup.ts` (fake-indexeddb setup), `src/__tests__/fixtures/db-fixtures.ts` (fixture pattern)
- **Project research files:** `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`, `.planning/research/SUMMARY.md`
- **Dexie.js transaction behavior:** Verified across 25+ existing usages in the codebase; auto-rollback on error confirmed
- **IndexedDB spec:** `undefined` values excluded from index entries; adding groupId index has zero impact on existing records

### Secondary (MEDIUM confidence)
- [Dexie.js cascade on delete discussion (#1932)](https://github.com/dexie/Dexie.js/issues/1932) -- confirms no built-in cascade, recommends transaction pattern
- [useLiveQuery multi-table observation (#2090)](https://github.com/dexie/Dexie.js/issues/2090) -- single callback observes all tables touched
- [IndexedDB transaction auto-close behavior](https://javascript.info/indexeddb) -- fetch() closes transactions

### Tertiary (LOW confidence)
- None needed. This phase is entirely about codebase patterns + Dexie.js documented behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all verified against installed versions
- Architecture: HIGH -- based on 25+ existing transaction examples, proven linking patterns (sourceRecordId), existing soft-delete model in substance-service
- Pitfalls: HIGH -- soft-delete gap verified by direct code inspection (intake-service.ts has zero deletedAt filtering); transaction table omission documented in Dexie GitHub issues
- Migration: HIGH -- v14 migration test provides exact template; v15 migration requires no upgrade function

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain -- Dexie.js patterns unlikely to change)
