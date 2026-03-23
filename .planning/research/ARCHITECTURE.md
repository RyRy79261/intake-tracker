# Architecture Patterns

**Domain:** Composable data entries, unified input cards, AI substance lookup
**Researched:** 2026-03-23
**Supersedes:** 2026-03-02 architecture research (v1.0 milestone). Retains foundational patterns; adds composable entry layer.

## Recommended Architecture

### Core Concept: Entry Groups via `groupId` Foreign Key

The composable data entry system links records across existing tables through a shared `groupId` field rather than introducing a new junction table or parent entity. This is the right pattern because:

1. **Each child record remains independently valid** -- an eating record is still an eating record whether or not it was created as part of a group.
2. **Existing service layer untouched for reads** -- queries that fetch eating records, intake records, or substance records continue to work without modification.
3. **GroupId is an optional field** -- records created outside composable entries simply have `groupId: undefined`. No migration of existing data needed.
4. **Dexie transactions already handle cross-table atomicity** -- the codebase has 25+ examples of `db.transaction("rw", [...tables], async () => {...})`.

The alternative (a parent `EntryGroup` table with junction records) was rejected because it adds a table that contains no health data, just metadata. Every query would need a join. The parent table accumulates without providing queryable health information. Backup/restore gets more complex.

The `groupId` pattern is already proven in this codebase: `SubstanceRecord.sourceRecordId` links to intake records, `InventoryTransaction.doseLogId` links to dose logs, `DailyNote.doseLogId` links to dose logs. The composable entry pattern generalizes this to a shared group key across N tables.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `composable-entry-service.ts` (NEW) | Atomic cross-table writes, cascading deletes, group queries | `db.ts` (direct), inherits validation patterns from existing services |
| `use-composable-entry.ts` (NEW) | React hooks wrapping composable entry service | `composable-entry-service.ts` |
| `LiquidsCard` (NEW) | Tabbed UI for water/coffee/alcohol input | `use-intake-queries`, `use-substance-queries`, `use-composable-entry` |
| `FoodSaltCard` (NEW) | Unified food+salt input with AI parsing | `use-eating-queries`, `use-intake-queries`, `use-composable-entry` |
| `TextMetrics` (NEW) | Today's limits, substance totals, weekly summary | `use-intake-queries`, `use-substance-queries`, `use-analytics-queries` |
| `/api/ai/substance-lookup/route.ts` (NEW) | AI-powered caffeine/alcohol per-100ml lookup for presets | Perplexity API |
| Liquid presets (NEW, Zustand) | Saved caffeine-per-100ml / alcohol-per-100ml user presets | `settings-store.ts` |

### Data Flow

**Composable Entry Creation (e.g., "scrambled eggs on toast with coffee"):**
```
User input
  -> AI parse (food -> water + salt estimates)
  -> User confirms/adjusts
  -> composable-entry-service.addComposableEntry({
       eating: { note: "scrambled eggs on toast", grams: 200 },
       intakes: [
         { type: "water", amount: 89, source: "food:scrambled-eggs" },
         { type: "salt", amount: 520, source: "food:scrambled-eggs" },
       ],
       substance: { type: "caffeine", amountMg: 95, volumeMl: 250, description: "filter coffee" }
     })
  -> Single db.transaction writes all records with same groupId + timestamp
  -> useLiveQuery reactivity fires: intake totals, eating list, substance totals all update
```

**Cascading Delete:**
```
User deletes the eating record from a group
  -> UI offers: "Delete this item only" vs "Delete all linked entries"
  -> If "all": composable-entry-service.deleteEntryGroup(groupId)
    -> Single db.transaction:
       - Soft-delete all records where groupId matches across 3 tables
       - Each table queried via groupId index
  -> If "this only": eating-service.deleteEatingRecord(id)
    -> Only that record deleted; groupId link preserved on siblings
```

**Independent Edit:**
```
User edits the salt amount on a linked salt record
  -> Normal intake-service.updateIntakeRecord(id, { amount: 500 })
  -> Only that record changes; groupId link preserved
  -> Existing useLiveQuery hooks automatically reflect the change
```

**AI Substance Lookup (for presets):**
```
User types "cortado" in coffee tab preset creator
  -> POST /api/ai/substance-lookup { name: "cortado", type: "caffeine" }
  -> Response: { per100ml: 212, defaultVolumeMl: 120, reasoning: "..." }
  -> User confirms, preset saved to Zustand: { name: "Cortado", caffeinePer100ml: 212, defaultVolumeMl: 120 }
  -> Next time user selects "Cortado" preset: caffeine auto-calculated from volume
```

## Schema Changes (Dexie v15)

### New Fields on Existing Interfaces

Add `groupId?: string` to these interfaces in `db.ts`:
- `IntakeRecord`
- `EatingRecord`
- `SubstanceRecord`

These are the only tables that participate in composable entries. Weight, BP, urination, defecation, and medication tables remain standalone -- they have no use case for linked creation.

### New Index Definition

```typescript
db.version(15).stores({
  // Modified: add groupId index
  intakeRecords:        "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  eatingRecords:        "id, timestamp, groupId, updatedAt",
  substanceRecords:     "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",

  // Unchanged: repeat all v14 definitions exactly
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
// No upgrade function needed.
```

**Why no migration:** `groupId` is optional. Existing records have `undefined` for this field, and IndexedDB excludes `undefined` values from index entries. Existing queries on other indexes are completely unaffected. No data backfill required.

### Liquid Presets (Zustand, NOT Dexie)

Presets are user preferences, not health data. They belong in Zustand/localStorage alongside existing settings like `coffeeDefaultType`, `waterIncrement`, etc.

```typescript
// Added to settings-store.ts

interface LiquidPreset {
  id: string;
  name: string;                // "Cortado", "Craft IPA", "Green Tea"
  category: 'coffee' | 'alcohol' | 'other';
  defaultVolumeMl: number;     // typical serving size
  caffeinePer100ml?: number;   // mg per 100ml (coffee/tea)
  alcoholPer100ml?: number;    // grams pure alcohol per 100ml
  isDefault?: boolean;         // built-in presets (cannot be deleted)
}

// State additions:
liquidPresets: LiquidPreset[];
addLiquidPreset: (preset: Omit<LiquidPreset, 'id'>) => void;
updateLiquidPreset: (id: string, updates: Partial<LiquidPreset>) => void;
deleteLiquidPreset: (id: string) => void;
```

**Why Zustand not Dexie:** Presets are configuration, not time-series health data. They don't need timestamps, soft-delete, deviceId, or sync fields. The existing `COFFEE_PRESETS` constant in `constants.ts` proves the pattern -- this just makes them user-editable and AI-populatable. If future cloud sync is needed, Zustand's localStorage persistence is trivially syncable as a single settings blob.

**Migration from existing COFFEE_PRESETS:** The default `liquidPresets` array in the store initializer includes the current 4 coffee presets (espresso 30ml, double-espresso 60ml, moka 50ml, other 0ml) as `isDefault: true` entries. The `COFFEE_PRESETS` constant in `constants.ts` is then deprecated.

## Patterns to Follow

### Pattern 1: Composable Entry Service

The new service sits alongside existing services, not above them. It uses `db` directly (same as all other services) and wraps multi-table writes in a single transaction.

**What:** A service that creates/deletes linked records across tables atomically.
**When:** Any input that creates records in 2+ tables simultaneously.

```typescript
// src/lib/composable-entry-service.ts

import { db } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";

interface ComposableIntakeInput {
  type: "water" | "salt";
  amount: number;
  source?: string;
  note?: string;
}

interface ComposableSubstanceInput {
  type: "caffeine" | "alcohol";
  amountMg?: number;
  amountStandardDrinks?: number;
  volumeMl?: number;
  description: string;
}

interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: ComposableIntakeInput[];
  substance?: ComposableSubstanceInput;
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
  const groupId = generateId();
  const ts = timestamp ?? Date.now();
  const fields = syncFields();
  const result: ComposableEntryResult = { groupId, intakeIds: [] };

  try {
    await db.transaction(
      "rw",
      [db.intakeRecords, db.eatingRecords, db.substanceRecords],
      async () => {
        // Eating record
        if (input.eating) {
          const id = generateId();
          await db.eatingRecords.add({
            id, timestamp: ts, groupId,
            ...(input.eating.note && { note: input.eating.note }),
            ...(input.eating.grams && { grams: input.eating.grams }),
            ...fields,
          });
          result.eatingId = id;
        }

        // Intake records (water, salt from food parsing)
        for (const intake of input.intakes ?? []) {
          const id = generateId();
          await db.intakeRecords.add({
            id, timestamp: ts, groupId,
            type: intake.type,
            amount: intake.amount,
            source: intake.source ?? "composable",
            ...(intake.note && { note: intake.note }),
            ...fields,
          });
          result.intakeIds.push(id);
        }

        // Substance record + its linked water intake
        if (input.substance) {
          const substanceId = generateId();
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

          // Substance volume counts as water intake for fluid balance
          if (input.substance.volumeMl) {
            const intakeId = generateId();
            await db.intakeRecords.add({
              id: intakeId, timestamp: ts, groupId,
              type: "water",
              amount: input.substance.volumeMl,
              source: `substance:${substanceId}`,
              note: input.substance.description,
              ...fields,
            });
            result.intakeIds.push(intakeId);
          }
        }
      }
    );

    return ok(result);
  } catch (e) {
    return err("Failed to create composable entry", e);
  }
}

export async function deleteEntryGroup(
  groupId: string
): Promise<ServiceResult<{ deletedCount: number }>> {
  const now = Date.now();
  let deletedCount = 0;

  try {
    await db.transaction(
      "rw",
      [db.intakeRecords, db.eatingRecords, db.substanceRecords],
      async () => {
        // Soft-delete all records sharing this groupId
        for (const table of [db.intakeRecords, db.eatingRecords, db.substanceRecords]) {
          const records = await table.where("groupId").equals(groupId).toArray();
          for (const r of records) {
            await table.update(r.id, { deletedAt: now, updatedAt: now });
            deletedCount++;
          }
        }
      }
    );

    return ok({ deletedCount });
  } catch (e) {
    return err("Failed to delete entry group", e);
  }
}

export async function getEntryGroup(groupId: string) {
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
}
```

### Pattern 2: Unified Card with Tabs (LiquidsCard)

**What:** Single card component with tabs for water/coffee/alcohol, replacing the current liquid type dropdown in `intake-card.tsx`.
**When:** The main intake dashboard.

```
LiquidsCard
  |-- TabBar: [Water] [Coffee] [Alcohol]
  |
  |-- WaterTab:
  |     Preserves EXACT existing UX: increment buttons, +/- amount, manual entry.
  |     Uses existing useIntake("water") hook directly (no composable entry needed).
  |     Single-table write: intake-service.addIntakeRecord("water", amount).
  |
  |-- CoffeeTab:
  |     Preset selector (from Zustand liquidPresets where category === 'coffee')
  |     Volume input (seeded from preset.defaultVolumeMl)
  |     Caffeine auto-calculated: (volume / 100) * preset.caffeinePer100ml
  |     AI FAB: calls /api/ai/substance-lookup to populate a new preset
  |     On submit: composable-entry-service.addComposableEntry({
  |       substance: { type: "caffeine", amountMg, volumeMl, description },
  |       // No separate water intake needed -- substance service creates linked intake
  |     })
  |
  |-- AlcoholTab:
  |     Same pattern as CoffeeTab but with alcohol presets
  |     Standard drinks auto-calculated from alcohol-per-100ml * volume
```

**Key integration point:** The Water tab preserves the existing `useIntake("water")` hook and increment button UX exactly. Coffee and Alcohol tabs use the composable entry service which creates both the substance record AND the linked water intake record atomically (same pattern as current `substance-service.ts` line 39-49, but through composable entry for consistency).

### Pattern 3: AI Substance Lookup Route

**What:** New API route for looking up caffeine-per-100ml or alcohol-per-100ml for a beverage name.
**When:** User creates a new liquid preset or uses the AI FAB on coffee/alcohol tabs.

```
POST /api/ai/substance-lookup
  Body: { name: "cortado", type: "caffeine" | "alcohol" }
  Response: {
    per100ml: number,         // mg caffeine or grams pure alcohol per 100ml
    defaultVolumeMl: number,  // typical serving size for this beverage
    reasoning: string
  }
```

**Why a separate route from `/api/ai/substance-enrich`:** The existing enrich route takes a free-text description and returns absolute amounts for a specific drink instance (e.g., "95mg caffeine in this 250ml coffee"). The lookup route takes a beverage name and returns per-100ml rates for saving as a reusable preset (e.g., "cortado has 212mg caffeine per 100ml, typical serving 120ml"). Different prompts, different response schemas, different use cases. The existing route continues to work for backward-compatible substance enrichment.

**Implementation follows the established pattern:** Same structure as `/api/ai/substance-enrich/route.ts` -- Zod request/response validation, `withAuth` middleware, rate limiting, `sanitizeForAI`, Perplexity API call with retry.

### Pattern 4: Food+Salt Card AI Integration

**What:** The unified Food+Salt card sends food descriptions to the existing `/api/ai/parse` route, then uses the response to auto-create linked entries via composable entry service.
**When:** User describes food in the food card's AI input.

```
User types: "scrambled eggs on toast with butter"
  -> POST /api/ai/parse { input: "scrambled eggs on toast with butter" }
  -> Response: { water: 89, salt: 520, reasoning: "..." }
  -> UI shows preview: eating record (auto), +89ml water (toggle), +520mg salt (toggle)
  -> User can adjust any value or toggle off water/salt auto-creation
  -> On confirm: composable-entry-service.addComposableEntry({
       eating: { note: "scrambled eggs on toast with butter" },
       intakes: [
         { type: "water", amount: 89, source: "food:scrambled-eggs-on-toast" },
         { type: "salt", amount: 520, source: "food:scrambled-eggs-on-toast" },
       ]
     })
```

**No changes to `/api/ai/parse` needed.** The existing route already returns water + salt estimates. The change is purely client-side: instead of creating separate unlinked records, the UI creates a composable entry with all records sharing a groupId.

**Manual salt input (salt tablets, seasoning):** Remains a standalone intake record via `addIntakeRecord("salt", amount)`. No groupId needed -- it's not linked to a food entry.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parent Entity Table
**What:** Creating a `ComposableEntry` table that acts as a parent, with child records pointing to it via `entryId`.
**Why bad:** Adds a table with no health data, just metadata. Every query that wants group context needs a join. Backup/restore must handle the parent table. The parent can become orphaned if children are deleted independently.
**Instead:** Use `groupId` on child records. The "group" is implicit -- defined by records sharing the same groupId value.

### Anti-Pattern 2: Denormalized Composite Records
**What:** Storing all linked data in a single mega-record (eating + water + salt + substance all in one row in a new table).
**Why bad:** Breaks the existing service layer contract. Analytics that query `intakeRecords` for water totals would miss water from composite records. Every consumer (hooks, analytics, backup/restore, future AI queries) would need to know about the composite format.
**Instead:** Keep records in their natural tables. Composable entry creates multiple standard records linked by groupId.

### Anti-Pattern 3: Cascading Deletes via Application Logic in Each Service
**What:** Having `deleteEatingRecord` check if it's part of a group and cascade-delete related records in other tables.
**Why bad:** Couples every service to every other service. The eating service should not know about substance records or intake records. Introduces circular dependency risk and makes delete behavior unpredictable.
**Instead:** Cascade deletes go through `composable-entry-service.deleteEntryGroup()`. Individual record deletes (via existing services) only affect that single record -- the UI decides whether to offer "delete group" vs "delete this record only."

### Anti-Pattern 4: Storing Presets in Dexie
**What:** Creating a `liquidPresets` Dexie table with full sync fields (createdAt, updatedAt, deletedAt, deviceId, timezone).
**Why bad:** Presets are user preferences (like theme, increment size, day-start-hour). They don't have timestamps, aren't time-series data, and don't participate in health analytics. Adding them to Dexie means they need migration logic, backup/restore handling, and increase schema complexity.
**Instead:** Store in Zustand (persisted to localStorage) alongside existing settings. The existing `COFFEE_PRESETS` constant proves this pattern works for presets.

### Anti-Pattern 5: Modifying Existing Service Delete Functions
**What:** Changing `substance-service.deleteSubstanceRecord()` to also check for and delete linked intake records AND composable group siblings.
**Why bad:** The existing delete function already handles the substance-to-intake link correctly (lines 116-129 in `substance-service.ts`). Making it also aware of groupId creates coupling to the composable entry concept. If a substance record was created standalone (no groupId), the existing behavior is correct. If it was created as part of a group, `deleteEntryGroup` handles cascade.
**Instead:** Keep existing service deletes unchanged. Add `deleteEntryGroup` as a new function in `composable-entry-service.ts` for group-level operations.

## New vs Modified Files

### New Files
| File | Purpose |
|------|---------|
| `src/lib/composable-entry-service.ts` | Atomic cross-table writes, cascading deletes, group queries |
| `src/hooks/use-composable-entry.ts` | React hooks wrapping composable entry service (useLiveQuery for getEntryGroup, useCallback for mutations) |
| `src/components/liquids-card.tsx` | Tabbed liquids input (water/coffee/alcohol) |
| `src/components/food-salt-card.tsx` | Unified food+salt with AI parsing and composable entries |
| `src/components/text-metrics.tsx` | Text-based intake metrics replacing graphs |
| `src/app/api/ai/substance-lookup/route.ts` | AI caffeine/alcohol per-100ml lookup for presets |

### Modified Files
| File | Change | Scope |
|------|--------|-------|
| `src/lib/db.ts` | v15: add `groupId?: string` to IntakeRecord, EatingRecord, SubstanceRecord interfaces; add `groupId` index to 3 tables | Small -- 3 interface additions + 1 new version block |
| `src/stores/settings-store.ts` | Add `liquidPresets` array with CRUD actions; default values migrated from COFFEE_PRESETS | Medium -- new state slice |
| `src/lib/constants.ts` | Add `DEFAULT_LIQUID_PRESETS` replacing `COFFEE_PRESETS`; deprecate `COFFEE_PRESETS` | Small |
| `src/app/page.tsx` | Replace intake-card + food-calculator with LiquidsCard + FoodSaltCard + TextMetrics; reorder cards | Medium -- layout rewire |
| `src/components/intake-card.tsx` | REMOVED (replaced by LiquidsCard) | -- |
| `src/components/food-calculator.tsx` | REMOVED (replaced by FoodSaltCard) | -- |

### Unchanged Files (critical to verify)
| File | Why Unchanged |
|------|---------------|
| `src/lib/intake-service.ts` | Reads don't need groupId awareness; standalone writes (water tab) still use this directly |
| `src/lib/eating-service.ts` | Standalone eating records still use this; composable entries bypass it |
| `src/lib/substance-service.ts` | Existing substance-to-intake linking still works; composable entries use the new service instead |
| `src/lib/health-service.ts` | BP and weight are never part of composable entries |
| `src/hooks/use-intake-queries.ts` | Daily totals, recent records, rolling 24h -- all unchanged because records are in the same intakeRecords table regardless of groupId |
| `src/hooks/use-substance-queries.ts` | Substance queries work unchanged; groupId is transparent to existing reads |
| All medication files | No interaction with composable entries |

## Suggested Build Order

Build order driven by data model dependencies:

### Phase 1: Data Layer (no UI risk)
1. **Dexie v15 schema migration** -- Add `groupId` to 3 interfaces and 3 index definitions. Write migration test.
2. **`composable-entry-service.ts`** -- `addComposableEntry`, `deleteEntryGroup`, `getEntryGroup`. Unit test with fake-indexeddb.
3. **`use-composable-entry.ts`** -- Thin hooks wrapping the service.

### Phase 2: Presets + AI (independent of UI)
4. **Liquid presets in Zustand** -- `settings-store.ts` additions + `DEFAULT_LIQUID_PRESETS` in constants.
5. **`/api/ai/substance-lookup` route** -- New route following existing pattern. Test independently via curl/Playwright.

### Phase 3: UI (depends on phases 1-2)
6. **LiquidsCard** -- Tabbed water/coffee/alcohol. Water tab reuses existing `useIntake("water")`. Coffee/Alcohol tabs use composable entry + presets + AI lookup.
7. **FoodSaltCard** -- Unified food+salt. Uses existing `/api/ai/parse` + composable entry service.
8. **TextMetrics** -- Pure read component, queries existing data via existing hooks.

### Phase 4: Dashboard Integration
9. **Dashboard rewire** -- Update `page.tsx`: LiquidsCard, FoodSaltCard, TextMetrics, health cards. Remove intake-card.tsx and food-calculator.tsx.
10. **BP heart rate visibility** -- Small change to existing BP card component (unrelated to composable entries).
11. **Card reordering** -- Liquids -> Food+Salt -> health cards.

**Rationale:** Phases 1-2 are pure service/data layer with zero UI risk and can be tested in isolation. Phase 3 builds the new UI components. Phase 4 is the swap -- old components out, new components in. This minimizes the window where the app is in a broken state.

## Scalability Considerations

| Concern | Current (single user) | Future (cloud sync) |
|---------|----------------------|---------------------|
| GroupId queries | Index lookup on 3 tables, <1ms for any volume | GroupId is a standard indexed FK, syncs naturally via Dexie Cloud |
| Transaction scope | 3-table transactions are well within IndexedDB limits | Dexie Cloud handles multi-table sync transactions natively |
| Preset storage | localStorage via Zustand, <2KB for 50 presets | Sync as user settings blob, not individual records |
| Cascade deletes | Soft-delete via groupId index, 3 parallel where-queries | Soft-delete propagates via sync; deletedAt timestamp resolves conflicts |
| Backward compat | Old records have no groupId, queries exclude undefined from index | Same -- undefined groupId records are standalone, fully compatible |

## Sources

- **Existing codebase analysis (HIGH confidence):** `db.ts` (schema v10-v14 pattern), `substance-service.ts` (existing cross-table transaction + linked record pattern at lines 39-49 and 116-129), `intake-service.ts` (service layer pattern), `settings-store.ts` (Zustand persistence pattern), `constants.ts` (static preset pattern), `use-substance-queries.ts` and `use-intake-queries.ts` (hook patterns)
- **Dexie.js transaction behavior (HIGH confidence):** Transactions scope across listed tables with auto-rollback on error. Verified across 25+ existing usages in the codebase.
- **IndexedDB index behavior with undefined (HIGH confidence):** Per IndexedDB spec, `undefined` property values are excluded from index entries. Adding a `groupId` index does not affect records where groupId is undefined -- they simply don't appear in index lookups.
- **Existing API route patterns (HIGH confidence):** `/api/ai/substance-enrich/route.ts` and `/api/ai/parse/route.ts` establish the pattern for the new `/api/ai/substance-lookup` route: Zod validation, `withAuth` middleware, rate limiting, `sanitizeForAI`, Perplexity retry logic.
