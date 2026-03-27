# Phase 3: Service Layer Rebuild - Research

**Researched:** 2026-03-05
**Domain:** Dexie.js transactions, useLiveQuery reactivity, timezone-aware scheduling, fractional pill math
**Confidence:** HIGH

## Summary

Phase 3 is a large-scope rebuild touching every service and hook file in the codebase. The core technical challenges are: (1) wrapping dose state changes in atomic `db.transaction()` calls, (2) migrating all read hooks from React Query `useQuery` to Dexie's `useLiveQuery`, (3) adding timezone-aware scheduling with UTC storage and local display, and (4) implementing correct fractional pill depletion math.

The codebase already has `dexie-react-hooks@1.1.7` installed and `dexie@4.2.1`. The `db.transaction()` pattern is already used in `addPrescription`, `deletePrescription`, `activatePhase`, and `adjustStock` -- but critically NOT in `takeDose`, `skipDose`, `untakeDose`, or `rescheduleDose` where stock adjustment and dose log writes are separate non-atomic calls. This is the primary atomicity bug to fix.

**Primary recommendation:** Structure the phase into three major work streams: (1) Dexie v11 schema migration with timezone fields, (2) service layer rebuild with transactions + fractional math + audit logging, (3) hook layer migration from useQuery to useLiveQuery. The hook migration is mechanical but touches 10 files.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **useLiveQuery for all reads, all services** -- not just medication. Every domain switches from React Query reads to useLiveQuery
- **useMutation kept for writes** -- loading/error/retry states from React Query remain for mutations. No manual queryClient.invalidateQueries needed
- **No invalidation calls** -- useLiveQuery handles read freshness. Remove all invalidation logic from mutation hooks
- **Schedule times stored in UTC** -- user sets "08:00" in Berlin (UTC+1), stored as `scheduleTimeUTC` (integer, minutes from midnight UTC). Display layer converts to local timezone
- **IANA timezone stored on every record** -- ALL record types get a `timezone` field
- **Dexie v11 migration** for timezone fields and schedule time format conversion
- **Migration backfill:** records before 2026-02-12 get "Africa/Johannesburg", from 2026-02-12 onward get "Europe/Berlin". New records use detected device timezone
- **Schedule time migration:** existing "HH:MM" strings converted to UTC minutes using device timezone at migration time
- **Schedule dosage in mg, stock in fractional pills** -- pills consumed = dose_mg / pill_strength. Always derived, never stored
- **Stock can be fractional** -- e.g., 14.75 pills
- **Event-sourced with cached field** -- `currentStock` on InventoryItem is a cache, updated atomically inside same transaction as inventoryTransaction write
- **Automatic stock recalculation** on app launch from transactions
- **Negative stock allowed with warning** -- never block dose logging over inventory
- **Doses without inventory supported** -- dose logs can have no inventoryItemId
- **Every dose state change atomic** -- take, skip, untake, reschedule each wrap stock + dose log + audit log in single db.transaction()
- **takeAllDoses: individual transactions per dose** -- one failure doesn't block others
- **Phase activation invariant transactional** -- activatePhase wraps deactivate-old + activate-new atomically
- **Read functions return T directly (throw on error)** -- all services, all domains
- **Mutation functions keep ServiceResult<T>**
- **All service read functions drop ServiceResult** -- return T directly across all services
- **Full cleanup pass** on non-medication services while touching hooks
- **Audit logging in Phase 3** -- all medication mutations logged, append-only
- **Debug panel rebuild** included in Phase 3

### Claude's Discretion
- Dose log generation pattern (pre-create pending vs derive from schedule)
- Debug panel access pattern (dev flag, long-press, settings sub-page)
- useLiveQuery hook structure and naming conventions
- Stock recalculation timing and implementation details
- Audit log entry schema (what fields to include per entry)

### Deferred Ideas (OUT OF SCOPE)
- Retroactive inventory assignment UX (reconciliation flow) -- Phase 6
- Push notification scheduling -- Phase 11
- Android app packaging -- future milestone

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVC-01 | All multi-table writes wrapped in `db.transaction` (fixes takeDose/skipDose atomicity bug) | Dexie transaction API well-understood; existing patterns in codebase (addPrescription, adjustStock). Current dose-log-service.ts calls adjustStock outside a transaction -- must be restructured |
| SRVC-02 | Timezone-aware dose log generation -- correct day-of-week for SA (UTC+2) and Germany (UTC+1/+2 DST) | Intl.DateTimeFormat and date-fns-tz provide IANA timezone resolution. Schedule times stored as UTC minutes, display converted using stored timezone |
| SRVC-06 | Fractional dose depletion math -- half and quarter pill tracking with correct inventory decrement | Pure arithmetic: pills_consumed = dose_mg / pill_strength_mg. Must handle floating point carefully (use Math.round to 4 decimal places) |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dexie | 4.2.1 | IndexedDB wrapper, transactions, liveQuery | Already installed; provides `db.transaction()` and observable queries |
| dexie-react-hooks | 1.1.7 | React bindings for liveQuery | Already installed; provides `useLiveQuery` hook |
| @tanstack/react-query | 5.90.20 | Mutation state management | Already installed; kept for `useMutation` only (writes) |
| date-fns | 4.1.0 | Date manipulation | Already installed; use for date arithmetic |
| zod | 3.x | Input validation | Already installed; used at service boundaries per Phase 2 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intl.DateTimeFormat | (browser built-in) | IANA timezone detection and conversion | `Intl.DateTimeFormat().resolvedOptions().timeZone` for current device timezone |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Intl.DateTimeFormat | date-fns-tz | Extra dependency; Intl is built-in and sufficient for this use case |
| Manual UTC math | luxon / dayjs | Overkill; we only need HH:MM-to-UTC-minutes conversion, not full timezone calendar |

**No new dependencies needed.** Everything required is already installed or built into the browser.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── db.ts                          # Dexie schema v11 + migration
│   ├── timezone.ts                    # NEW: timezone detection + UTC conversion helpers
│   ├── medication-service.ts          # Rebuilt: atomic transactions, audit logging
│   ├── dose-log-service.ts            # Rebuilt: atomic take/skip/untake, fractional math
│   ├── medication-schedule-service.ts # Updated: UTC schedule time queries
│   ├── inventory-service.ts           # NEW or split: stock recalculation, event-sourced stock
│   ├── audit-service.ts              # NEW: append-only audit log writes
│   ├── intake-service.ts              # Updated: reads return T, timezone field
│   ├── health-service.ts              # Updated: reads return T, timezone field
│   ├── eating-service.ts              # Updated: reads return T, timezone field
│   ├── urination-service.ts           # Updated: reads return T, timezone field
│   ├── defecation-service.ts          # Updated: reads return T, timezone field
│   ├── backup-service.ts              # Updated: reads return T
│   └── service-result.ts             # Kept for mutations (ok/err/unwrap)
├── hooks/
│   ├── use-medication-queries.ts      # Rebuilt: useLiveQuery reads, useMutation writes
│   ├── use-intake-queries.ts          # Rebuilt: useLiveQuery reads
│   ├── use-health-queries.ts          # Rebuilt: useLiveQuery reads
│   ├── use-eating-queries.ts          # Rebuilt: useLiveQuery reads
│   ├── use-urination-queries.ts       # Rebuilt: useLiveQuery reads
│   ├── use-defecation-queries.ts      # Rebuilt: useLiveQuery reads
│   ├── use-daily-notes-queries.ts     # Rebuilt: useLiveQuery reads
│   ├── use-history-queries.ts         # Rebuilt: useLiveQuery reads
│   ├── use-backup-queries.ts          # Updated: mutations only (no reads to migrate)
│   └── use-notification-queries.ts    # Updated: mostly pass-through, minimal changes
└── components/
    └── debug-panel.tsx                # Rebuilt: audit logs, stock recalc, raw records
```

### Pattern 1: useLiveQuery for Reads (replaces useQuery)
**What:** Replace React Query `useQuery` with Dexie's `useLiveQuery` for all database reads
**When to use:** Every hook that reads from IndexedDB
**Example:**
```typescript
// BEFORE (React Query):
export function usePrescriptions() {
  return useQuery({
    queryKey: ["prescriptions"],
    queryFn: async () => unwrap(await getPrescriptions()),
  });
}

// AFTER (useLiveQuery):
import { useLiveQuery } from "dexie-react-hooks";

export function usePrescriptions() {
  return useLiveQuery(
    () => getPrescriptions(), // service returns T directly now
    [] // deps array
  );
}
```

**Key difference:** `useLiveQuery` returns `T | undefined` (undefined while loading). Components must handle the undefined case. There is no `isLoading`, `isError`, `data` object -- just the value or undefined.

### Pattern 2: useMutation Kept for Writes (no invalidation)
**What:** Keep `useMutation` for writes but remove all `queryClient.invalidateQueries()` calls
**When to use:** All mutation hooks
**Example:**
```typescript
// AFTER: no invalidation needed, useLiveQuery auto-reacts
export function useAddPrescription() {
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) =>
      unwrap(await addPrescription(input)),
    // NO onSuccess invalidation -- useLiveQuery handles it
  });
}
```

### Pattern 3: Atomic Dose Transactions
**What:** Wrap dose log + stock adjustment + audit log in a single `db.transaction()`
**When to use:** takeDose, skipDose, untakeDose, rescheduleDose
**Example:**
```typescript
export async function takeDose(input: TakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const result = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs],
      async () => {
        // 1. Upsert dose log
        const log = await upsertDoseLog(/* ... */, "taken");

        // 2. Deduct fractional pills from active inventory (if exists)
        const inventory = await db.inventoryItems
          .where({ prescriptionId: input.prescriptionId, isActive: 1 })
          .first();
        if (inventory) {
          const pillsConsumed = input.dosageMg / inventory.strength;
          const newStock = (inventory.currentStock ?? 0) - pillsConsumed;
          await db.inventoryItems.update(inventory.id, {
            currentStock: newStock,
            updatedAt: Date.now(),
          });
          await db.inventoryTransactions.add(
            buildTransaction(inventory.id, -pillsConsumed, "consumed", Date.now())
          );
        }

        // 3. Write audit log
        await db.auditLogs.add(buildAuditEntry("dose_taken", { /* details */ }));

        return log;
      }
    );
    return ok(result);
  } catch (e) {
    return err("Failed to take dose", e);
  }
}
```

### Pattern 4: UTC Schedule Time Storage
**What:** Store schedule times as minutes-from-midnight-UTC integer
**When to use:** PhaseSchedule creation and display
**Example:**
```typescript
// src/lib/timezone.ts
export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localTimeToUTCMinutes(localHH: number, localMM: number, timezone: string): number {
  // Create a reference date in the given timezone, extract UTC offset
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  // Parse offset and convert
  const parts = formatter.formatToParts(now);
  const offsetPart = parts.find(p => p.type === "timeZoneName");
  // ... calculate UTC minutes from local time + offset
  const localMinutes = localHH * 60 + localMM;
  const offsetMinutes = parseOffsetToMinutes(offsetPart?.value ?? "GMT");
  return ((localMinutes - offsetMinutes) % 1440 + 1440) % 1440;
}

export function utcMinutesToLocalTime(utcMinutes: number, timezone: string): string {
  // Reverse conversion for display
  // Create a Date at that UTC time today, format in target timezone
  const now = new Date();
  now.setUTCHours(Math.floor(utcMinutes / 60), utcMinutes % 60, 0, 0);
  return now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
```

### Pattern 5: Derive-at-Read Dose Schedule (Recommended Discretion Choice)
**What:** Derive expected doses from schedule at query time rather than pre-creating pending records
**Why:** Avoids write-ahead records that can become orphaned if schedule changes. More predictable state. Past dates naturally show "missed" (no dose log exists for that schedule slot).
**Example:**
```typescript
export function getDailyDoseSchedule(date: string, timezone: string): DoseSlot[] {
  // 1. Get active prescriptions + phases + schedules
  // 2. For the given date, check which schedules apply (day-of-week match)
  // 3. For each schedule slot, look up existing dose log
  // 4. Return merged view: { schedule, existingLog?, status: "taken"|"skipped"|"pending"|"missed" }
}
```

### Anti-Patterns to Avoid
- **Calling adjustStock outside a transaction in dose operations:** This is the current bug. Stock adjustment and dose log must be in the same transaction
- **Using `toArray().filter()` on indexed fields:** Use Dexie's `where()` clause instead. Found in `getActivePrescriptions`, `getInactivePrescriptions`, `getAllActiveInventoryItems`, `getDailySchedule`
- **Storing timezone offset instead of IANA name:** Offsets change with DST. Always store "Europe/Berlin", never "+01:00"
- **Using floating point equality for pill fractions:** Compare with tolerance (e.g., `Math.abs(a - b) < 0.001`) or round to fixed precision
- **Removing React Query entirely:** Keep QueryClientProvider for useMutation. Only reads move to useLiveQuery

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IANA timezone detection | Manual navigator.language parsing | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Browser standard, always correct |
| UTC offset calculation | Manual hour math with DST tables | `Intl.DateTimeFormat` with `timeZone` option | Handles DST transitions automatically |
| Reactive database queries | Custom event emitter + polling | `useLiveQuery` from dexie-react-hooks | Already handles multi-tab sync, IndexedDB observation |
| Atomic multi-table writes | try/catch with manual rollback | `db.transaction("rw", [...tables])` | Dexie handles rollback on error automatically |
| Fractional precision | BigDecimal library | `Math.round(value * 10000) / 10000` | Only need 4 decimal places for pill fractions |

**Key insight:** The stack already has everything needed. No new libraries required. The challenge is restructuring existing code, not adding dependencies.

## Common Pitfalls

### Pitfall 1: useLiveQuery Returns Undefined During Load
**What goes wrong:** Components crash with "cannot read property of undefined" because `useLiveQuery` returns `undefined` (not `{ data, isLoading }`) while the query runs.
**Why it happens:** Unlike React Query which returns `{ data: T | undefined, isLoading: boolean }`, useLiveQuery returns just `T | undefined`.
**How to avoid:** Every component consuming useLiveQuery data must handle undefined. Use the second overload `useLiveQuery(query, deps, defaultValue)` where sensible (e.g., `[]` for arrays).
**Warning signs:** Runtime crashes after hook migration; TypeScript won't catch this unless components destructure properly.

### Pitfall 2: useLiveQuery + SSR in Next.js
**What goes wrong:** Server-side rendering attempts to run useLiveQuery which requires IndexedDB.
**Why it happens:** Next.js App Router renders components on the server first.
**How to avoid:** All hook files already have `"use client"` directive. Ensure `useLiveQuery` is only in client components. The default return value (undefined or provided default) is used during SSR.
**Warning signs:** Hydration mismatch errors.

### Pitfall 3: Transaction Scope Must Include All Accessed Tables
**What goes wrong:** `db.transaction("rw", [db.doseLogs, db.inventoryTransactions], ...)` fails if the callback also reads from `db.inventoryItems` -- that table wasn't declared.
**Why it happens:** Dexie requires all tables accessed within a transaction to be declared upfront.
**How to avoid:** List every table touched inside the transaction callback, even for reads.
**Warning signs:** "Table X not in transaction scope" error at runtime.

### Pitfall 4: Nested Transactions in Dexie
**What goes wrong:** Calling a function that starts its own `db.transaction()` from within another transaction can cause issues.
**Why it happens:** Dexie supports nested transactions by reusing the parent transaction's scope, but only if the nested transaction's tables are a subset of the parent's.
**How to avoid:** The dose operations currently call `adjustStock()` which has its own transaction. In the rebuild, the stock adjustment logic must be inlined into the parent transaction (not called as a separate function with its own transaction wrapper).
**Warning signs:** "SubTransaction table mismatch" errors.

### Pitfall 5: Migration Running at Wrong Timezone
**What goes wrong:** Schedule time "HH:MM" to UTC minutes conversion uses the device's current timezone at migration time, which could be wrong if the user migrates while traveling.
**Why it happens:** The v11 migration runs on app load. If the user is in a different timezone than when they set the schedule, the conversion will be off.
**How to avoid:** The migration backfill rules specify: records before 2026-02-12 use "Africa/Johannesburg", after use "Europe/Berlin". The migration must hardcode these timezones for conversion, not rely on device timezone.
**Warning signs:** Doses appearing at wrong times after migration.

### Pitfall 6: Floating Point Accumulation in Stock
**What goes wrong:** Taking 0.25 pills four times doesn't equal exactly 1.0 due to IEEE 754.
**Why it happens:** `0.1 + 0.2 !== 0.3` in JavaScript.
**How to avoid:** Round stock values to 4 decimal places after each operation: `Math.round(value * 10000) / 10000`. The event-sourced recalculation on app launch also serves as a correction mechanism.
**Warning signs:** Stock showing values like `9.999999999999998` instead of `10`.

### Pitfall 7: Optimistic Updates Lost with useLiveQuery
**What goes wrong:** The current `useAddWeight` and `useAddBloodPressure` hooks use React Query's `onMutate` for optimistic updates. This pattern doesn't work with useLiveQuery.
**Why it happens:** useLiveQuery subscribes directly to IndexedDB changes. Optimistic cache manipulation via `queryClient.setQueryData` has no effect.
**How to avoid:** Accept that useLiveQuery provides near-instant reactivity (IndexedDB writes are fast), making optimistic updates unnecessary. If there's perceived lag, use local component state for the optimistic display.
**Warning signs:** Optimistic update code being written that has no effect.

## Code Examples

### useLiveQuery Hook Pattern
```typescript
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

// Simple query - returns T | undefined
export function usePrescriptions() {
  return useLiveQuery(
    () => db.prescriptions.orderBy("createdAt").reverse().toArray(),
    []
  );
}

// Query with dependency - re-runs when prescriptionId changes
export function useInventoryForPrescription(prescriptionId: string | undefined) {
  return useLiveQuery(
    () => prescriptionId
      ? db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray()
      : [],
    [prescriptionId],
    [] // default while loading
  );
}

// Query calling service function (service returns T directly)
export function useDoseScheduleForDate(date: string) {
  return useLiveQuery(
    () => getDailyDoseSchedule(date),
    [date]
  );
}
```

### Mutation Hook Without Invalidation
```typescript
import { useMutation } from "@tanstack/react-query";

export function useTakeDose() {
  return useMutation({
    mutationFn: async (input: TakeDoseInput) =>
      unwrap(await takeDose(input)),
    // NO onSuccess / invalidation -- useLiveQuery auto-detects the DB change
  });
}
```

### Timezone Utility Functions
```typescript
export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Convert "08:00" in "Europe/Berlin" to UTC minutes
export function localHHMMtoUTCMinutes(timeStr: string, timezone: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  // Create a date at that local time today in the given timezone
  // Use Intl to get the UTC offset for that timezone
  const now = new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = now.toLocaleString("en-US", { timeZone: timezone });
  const offsetMs = new Date(utcStr).getTime() - new Date(localStr).getTime();
  const offsetMinutes = offsetMs / 60000;
  const localMinutes = hh * 60 + mm;
  return ((localMinutes + offsetMinutes) % 1440 + 1440) % 1440;
}
```

### Fractional Pill Depletion
```typescript
function calculatePillsConsumed(doseMg: number, pillStrengthMg: number): number {
  const raw = doseMg / pillStrengthMg;
  return Math.round(raw * 10000) / 10000; // Avoid floating point issues
}

function isCleanFraction(pillsConsumed: number): boolean {
  const cleanFractions = [0.25, 0.333, 0.5, 0.667, 0.75, 1.0];
  const fractionalPart = pillsConsumed % 1;
  if (fractionalPart === 0) return true;
  return cleanFractions.some(f => Math.abs(fractionalPart - f) < 0.01);
}
```

### Audit Log Entry Builder
```typescript
export function buildAuditEntry(
  action: AuditAction,
  details: Record<string, unknown>
): AuditLog {
  const sf = syncFields();
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    action,
    details: JSON.stringify(details),
    timezone: getDeviceTimezone(),
    ...sf,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Query for reads | useLiveQuery for reads | This phase | No manual invalidation; auto-reactive to DB changes |
| `ServiceResult<T>` for reads | Direct `T` return (throw on error) | This phase | Simpler call sites; useLiveQuery expects direct returns |
| `adjustStock` as separate call | Inline stock math in dose transaction | This phase | Atomicity guaranteed; no partial state |
| `time: "HH:MM"` string | `scheduleTimeUTC: number` (minutes) | This phase (v11 migration) | Clean math for recurrence, timezone-independent storage |
| No timezone on records | `timezone: string` on all records | This phase (v11 migration) | Cross-domain analysis across travel locations |

**Deprecated/outdated:**
- `currentStock` on InventoryItem as primary source: Deprecated in Phase 1, but still read by services. Phase 3 makes it a write-only cache derived from transactions
- `ServiceResult<T>` on read functions: Being removed for reads, kept only for mutations
- `queryClient.invalidateQueries()` in mutation hooks: Being removed entirely

## Open Questions

1. **useLiveQuery with complex joins (getDoseLogsWithDetailsForDate)**
   - What we know: useLiveQuery can call any async function that reads from Dexie. The current `getDoseLogsWithDetailsForDate` reads from 5 tables. useLiveQuery will observe all tables accessed during the query.
   - What's unclear: Performance of observing 5 tables -- will every write to any of these tables trigger a re-query?
   - Recommendation: Accept the re-query cost. IndexedDB reads are fast (<10ms). If it becomes a performance issue, split into multiple useLiveQuery calls that each observe fewer tables.

2. **graphKeys invalidation removal**
   - What we know: Several mutation hooks invalidate `graphKeys.all` for chart data. If reads move to useLiveQuery, charts also need to use useLiveQuery.
   - What's unclear: Whether `use-graph-data.ts` reads from Dexie or from React Query cache.
   - Recommendation: Check `use-graph-data.ts` during planning. If it reads from Dexie, convert to useLiveQuery. If it reads from React Query cache, it needs restructuring.

3. **Rolling 24h window queries in intake hooks**
   - What we know: Current intake hooks use `setInterval` to invalidate queries every 60 seconds for the rolling 24h window. useLiveQuery won't auto-refresh on a timer since no DB write occurs.
   - What's unclear: Whether to keep the timer pattern or switch to a different approach.
   - Recommendation: Keep a lightweight timer that sets a state variable (e.g., `currentMinute`), making it a dep of useLiveQuery so the query re-runs. Or accept that the 24h window is approximate and re-runs on any DB write naturally.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/lib/db.ts`, `src/lib/medication-service.ts`, `src/lib/dose-log-service.ts`, all hook files -- direct code inspection
- `node_modules/dexie-react-hooks/dist/useLiveQuery.d.ts` -- verified type signature: `useLiveQuery<T>(querier, deps?, defaultResult?)`
- `node_modules/dexie/package.json` -- confirmed version 4.2.1
- `dexie-react-hooks` package -- confirmed version 1.1.7, already installed

### Secondary (MEDIUM confidence)
- [useLiveQuery documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery()) -- fetched but page shell only; API verified from type definitions instead
- [liveQuery documentation](https://dexie.org/docs/liveQuery()) -- change observation behavior verified from training data + type definitions

### Tertiary (LOW confidence)
- Timezone conversion approach using `Intl.DateTimeFormat` -- well-known pattern but UTC offset extraction via string formatting is fragile. Consider using `date-fns` `getTimezoneOffset()` or a more robust approach during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, versions verified from package.json and node_modules
- Architecture: HIGH - patterns derived from existing codebase analysis; useLiveQuery API verified from type definitions
- Pitfalls: HIGH - most pitfalls identified from analyzing current code bugs (non-atomic dose operations, nested transactions)
- Timezone strategy: MEDIUM - Intl API is standard but the specific implementation for UTC-minutes conversion needs validation during implementation

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable libraries, no breaking changes expected)
