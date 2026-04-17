# Phase 43: Sync Engine Core - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 12 (9 new, 3 modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/sync-engine.ts` (NEW) | service module | event-driven + batch | `src/lib/intake-service.ts` (module shape); `src/lib/backup-service.ts` (bulk + transactions) | role-match |
| `src/lib/sync-queue.ts` (NEW) | service module | op-log CRUD over Dexie | `src/lib/intake-service.ts` (Dexie CRUD helpers + `ServiceResult`) | exact shape |
| `src/lib/sync-topology.ts` (NEW) | utility (static data) | pure function | `src/lib/quick-nav-defaults.ts` (static exported array) / `src/lib/constants.ts` | role-match |
| `src/stores/sync-status-store.ts` (NEW) | zustand store | in-memory state + persist subset | `src/stores/settings-store.ts` | exact |
| `src/app/api/sync/push/route.ts` (NEW) | route handler | request-response (POST) | `src/app/api/push/subscribe/route.ts` | exact |
| `src/app/api/sync/pull/route.ts` (NEW) | route handler | request-response (POST) | `src/app/api/push/subscribe/route.ts` | exact |
| `scripts/seed-dev-db.ts` (NEW) | script | one-shot data transform | `scripts/reset-neon-db.ts` (tsx + env check + CLI shape) | role-match |
| `<SyncLifecycleMount />` component + hook (NEW; path: planner picks, probably `src/components/sync/sync-lifecycle-mount.tsx` + `src/hooks/use-sync-lifecycle.ts`) | provider / effect hook | event-driven mount | `src/app/providers.tsx` `TimezoneGuard` + `initStockRecalculation` effect | role-match |
| `src/__tests__/migration/dexie-v16.test.ts` (NEW) | unit test (migration) | structural CI gate | `src/__tests__/migration/v15-migration.test.ts` | exact |
| `src/__tests__/sync-queue.test.ts` + `sync-topology.test.ts` + `sync-engine.test.ts` (NEW) | unit tests | structural CI gate | `src/__tests__/schema-parity.test.ts` (logic-gating); `src/__tests__/bundle-security.test.ts` (env-aware skip) | role-match |
| `e2e/sync-engine.spec.ts` (NEW) | e2e test | full flow | `e2e/dashboard.spec.ts` (storageState-seeded) | exact |
| `src/lib/db.ts` (MOD — v16 bump) | migration | schema evolution | itself — v10..v15 blocks inside the same file | exact |
| `src/lib/intake-service.ts` (MOD — pilot wiring) | service module | adds enqueue call after write | itself — extract existing write-path shape | exact |

---

## Pattern Assignments

### `src/lib/sync-queue.ts` (service module, op-log over Dexie)

**Analog:** `src/lib/intake-service.ts` (small async helpers that touch Dexie and return `ServiceResult`).

**Imports pattern** (from `src/lib/intake-service.ts:1-4`):
```typescript
import { z } from "zod";
import { db, type IntakeRecord } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { generateId, syncFields } from "./utils";
```
Planner should mirror: import `db` from `./db`, reuse `ok` / `err` / `ServiceResult` from `./service-result`, reuse `syncFields()` / `getDeviceId()` from `./utils` when op-log rows need device attribution.

**Coalesce/enqueue primitive shape** — mirrors the Dexie `.update()` + index-based lookup pattern in `intake-service.ts:56-63`:
```typescript
export async function deleteIntakeRecord(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.intakeRecords.update(id, { deletedAt: now, updatedAt: now });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete intake record", e);
  }
}
```
Translate: coalesce = `db._syncQueue.where("[tableName+recordId]").equals([t, id]).first()` → if found, `update(found.id, { enqueuedAt: now })`; else `add({...})`. All wrapped in `try/catch → ok/err`.

**Primary-key idiom:** string UUIDs via `crypto.randomUUID()` (see `db.ts:385` and `utils.ts:31`). The `queueId` on `_syncQueue` rows must follow suit.

**`ServiceResult` contract** (from `src/lib/service-result.ts`):
```typescript
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };
```
Sync-queue helpers that can fail should return `ServiceResult<T>`. Pure queries (e.g. `getQueueDepth()`) can return raw `T` — matches `intake-service.ts:101-104` `getTotalInLast24Hours`.

---

### `src/lib/sync-engine.ts` (service module, event-driven push + pull loop)

**Analog:** hybrid — `intake-service.ts` for module shape and Dexie access; `backup-service.ts:634-666` for the `Promise.all([db.x.clear(), …])` bulk-table pattern that the pull path's `bulkPut` transaction resembles.

**Module-level constants pattern** (from `intake-service.ts:6`):
```typescript
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
```
Apply to: `DEBOUNCE_AFTER_WRITE_MS`, `BACKOFF_CAP_MS`, `JITTER_RATIO`, `PULL_SOFT_CAP` — top-of-file `const` block.

**Transaction scope pattern** (coordinated bulk write, from `backup-service.ts:634-651`):
```typescript
await Promise.all([
  db.intakeRecords.clear(),
  db.weightRecords.clear(),
  // ... all 16 tables
]);
```
For pull-apply: use `db.transaction('rw', [db.intakeRecords, db._syncMeta], async () => { await db.intakeRecords.bulkPut(rows); await db._syncMeta.put({tableName, lastPulledUpdatedAt: lastTs}); })`. Single atomic cursor advance.

**Lifecycle-detection pattern** (from `src/app/providers.tsx:71-77`):
```typescript
const stockInitRef = useRef(false);
useEffect(() => {
  if (!stockInitRef.current) {
    stockInitRef.current = true;
    initStockRecalculation();
  }
}, []);
```
Mirror this in the `useSyncLifecycle()` hook — idempotent start guard via `useRef`; start engine once on first mount; no cleanup needed for singleton module.

---

### `src/lib/sync-topology.ts` (utility, static data)

**Analog:** `src/lib/constants.ts` (pure exported constants, imported by other modules as static config).

**Exported-static-array pattern** — declare the ordered table list as a `readonly` tuple and a `Map` for child→parent lookup, both `as const` to preserve literal types:
```typescript
// Derived from Phase 42 FK graph (src/db/schema.ts).
export const TABLE_PUSH_ORDER = [
  "prescriptions",        // parent
  "medicationPhases",     // FK → prescriptions
  "phaseSchedules",       // FK → medicationPhases
  "inventoryItems",       // FK → prescriptions
  "inventoryTransactions",// FK → inventoryItems, doseLogs
  "doseLogs",             // FK → prescriptions, medicationPhases, phaseSchedules, inventoryItems
  "dailyNotes",           // FK → prescriptions, doseLogs
  "titrationPlans",       // parent
  "intakeRecords",        // parent
  "substanceRecords",     // FK → intakeRecords
  "eatingRecords",
  "weightRecords",
  "bloodPressureRecords",
  "urinationRecords",
  "defecationRecords",
  "auditLogs",
] as const;
```
This mirrors the ordering rationale encoded in `scripts/reset-neon-db.ts:49-77` (children-before-parents for deletes; invert for pushes).

---

### `src/stores/sync-status-store.ts` (Zustand, persist subset)

**Analog:** `src/stores/settings-store.ts` — exact template for the `create + persist + createJSONStorage(() => localStorage) + version + migrate` shape.

**Imports pattern** (from `settings-store.ts:1-2`):
```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
```

**State + actions interface pattern** (from `settings-store.ts:14-119`): separate `interface Settings` (state) and `interface SettingsActions` (mutations), then `create<Settings & SettingsActions>()(persist(…))`. Apply:
```typescript
interface SyncStatus {
  lastPushedAt: number | null;  // persisted
  lastPulledAt: number | null;  // persisted
  queueDepth: number;           // in-memory
  isOnline: boolean;            // in-memory
  isSyncing: boolean;           // in-memory
  lastError: string | null;     // in-memory
}
interface SyncStatusActions {
  setOnline: (v: boolean) => void;
  setSyncing: (v: boolean) => void;
  setQueueDepth: (n: number) => void;
  setLastError: (e: string | null) => void;
  markPushed: () => void;       // writes lastPushedAt = Date.now()
  markPulled: () => void;
}
```

**Persist partial-state pattern** — `settings-store.ts` persists the whole state. Sync store must persist only `lastPushedAt` + `lastPulledAt`. Add `partialize` to the `persist` config (not shown in settings-store because it persists everything):
```typescript
export const useSyncStatusStore = create<SyncStatus & SyncStatusActions>()(
  persist(
    (set) => ({
      lastPushedAt: null,
      lastPulledAt: null,
      queueDepth: 0,
      isOnline: true,
      isSyncing: false,
      lastError: null,
      // actions …
      markPushed: () => set({ lastPushedAt: Date.now() }),
    }),
    {
      name: "intake-tracker-sync-status",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        lastPushedAt: state.lastPushedAt,
        lastPulledAt: state.lastPulledAt,
      }),
    }
  )
);
```
`name` follows the `intake-tracker-*` namespace convention (`settings-store.ts:249`).

**`version + migrate` contract** (from `settings-store.ts:251-295`): include even if v1 has no migrations — matches existing convention and frees future-you from a breaking bump. Start at `version: 1`.

---

### `src/app/api/sync/push/route.ts` + `src/app/api/sync/pull/route.ts` (route handler, POST)

**Analog:** `src/app/api/push/subscribe/route.ts` — exact template for `withAuth` + `zod.safeParse` + `NextResponse.json` + try/catch.

**Full file to copy from** (`src/app/api/push/subscribe/route.ts`, all 37 lines):
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { savePushSubscription } from "@/lib/push-db";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await savePushSubscription(auth.userId!, parsed.data);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[push/subscribe] Error:", error);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
});
```

**Apply to push route:**
- Swap `SubscribeSchema` for a `drizzle-zod`-derived discriminated union:
  `PushBodySchema = z.object({ ops: z.array(z.discriminatedUnion("tableName", [IntakeUpsertOp, IntakeDeleteOp, ...])) })`. Each variant wraps `createInsertSchema(intakeRecords).omit({userId: true})` from `drizzle-zod`.
- Swap `savePushSubscription` for a new `applyPushBatch(userId, ops)` helper in `src/lib/sync-server.ts` (planner's choice of filename) that does LWW merge.
- Log prefix `[sync/push]` matching the `[push/subscribe]` convention at line 30.
- `auth.userId!` non-null assertion is the established convention (see `auth-middleware.ts:6-9` which explicitly documents preserving this destructure shape).

**Neon SQL client pattern** (from `src/lib/push-db.ts:1-5`):
```typescript
import { neon } from "@neondatabase/serverless";
function getSQL() {
  return neon(process.env.DATABASE_URL!);
}
```
For the sync routes: prefer Drizzle (`drizzle-orm/neon-http`) since Phase 42 already exposes `src/db/schema.ts`. If a thin `src/lib/drizzle.ts` helper is added, it should follow the `getSQL()` lazy-init shape (do NOT eagerly construct at module-load — keeps imports test-safe the same way `push-db.ts` does).

**User scoping** — every Drizzle query must include `.where(eq(table.userId, auth.userId!))`. Precedent: `push-db.ts:27` (`WHERE user_id = ${userId}`).

---

### `src/lib/db.ts` (MOD — v16 migration)

**Analog:** the same file, lines 320–633, six prior `db.version(N).stores({...})` blocks.

**v15 pattern to copy verbatim for v16 base** (`db.ts:616-633`):
```typescript
db.version(15).stores({
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  // ... all 16 tables repeated in full
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
});
```

**v16 pattern to write:**
```typescript
// Version 16: Add _syncQueue (op-log) and _syncMeta (cursor map) tables
// to support the bidirectional sync engine (Phase 43). No changes to the
// 16 data tables — their existing sync scaffolding (createdAt/updatedAt/
// deletedAt/deviceId) is already sufficient.
db.version(16).stores({
  // Repeat all v15 store definitions verbatim (Dexie requires full schema per version)
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  // ... all 16 tables ...
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  // New tables
  _syncQueue:              "id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
});
```
Index choice notes:
- Compound `[tableName+recordId]` is required by D-04's coalesce lookup (`.where("[tableName+recordId]").equals([t, id])`).
- No `.upgrade()` needed — both new tables start empty. Matches `v14` precedent (`db.ts:590-610`) where new tables were added without upgrade.
- The table name prefix `_` is new to this file; planner should document the convention in a comment.

**EntityTable typing** — add to the Dexie interface block at `db.ts:282-314`:
```typescript
_syncQueue: EntityTable<SyncQueueRow, "id">;
_syncMeta: EntityTable<SyncMetaRow, "tableName">;
```
Mirrors the existing 16 table typings at `db.ts:299-313`.

---

### `src/lib/intake-service.ts` (MOD — pilot enqueue wiring)

**Analog:** itself. Extract the three write-path shapes and specify minimal inserts.

**Write path 1 — `addIntakeRecord` (lines 29-53):**
```typescript
await db.intakeRecords.add(record);
return ok(record);
```
After: wrap the `.add()` in `db.transaction('rw', [db.intakeRecords, db._syncQueue], async () => { await db.intakeRecords.add(record); await syncQueue.enqueueUpsert("intakeRecords", record.id); })`. Then trigger debounced push (planner decides: fire-and-forget module-side `scheduleAfterWritePush()` call OR returned-from-enqueue Promise).

**Write path 2 — `deleteIntakeRecord` (lines 55-63):**
```typescript
await db.intakeRecords.update(id, { deletedAt: now, updatedAt: now });
```
After: wrap in `db.transaction('rw', [db.intakeRecords, db._syncQueue], async () => { ...update...; await syncQueue.enqueueDelete("intakeRecords", id); })`. Delete-supersedes-upsert coalesce rule (D-04) lives inside `syncQueue.enqueueDelete`, NOT inlined here.

**Write path 3 — `updateIntakeRecord` (lines 75-87):**
```typescript
const existing = await db.intakeRecords.get(id);
if (!existing) return err("Record not found");
await db.intakeRecords.update(id, updates);
```
After: same transaction wrap; enqueue as `upsert` (update-is-upsert in the queue because push reads current Dexie row at flush time — D-04).

**Write path 4 — `importData` (lines 261-332) and `clearAllData` (line 352):**
- `importData` writes a batch — enqueue each row as upsert in the same loop; wrap the loop body in a single transaction, or batch-enqueue at the end.
- `clearAllData` is a test-only escape hatch — planner can either skip sync (adds a comment) or enqueue deletes for all existing records before clear. D-13 says pilot is intake-service; this is an edge case worth calling out in the plan but the safe call is skip.

**What NOT to change:** the `syncFields()` pattern at `intake-service.ts:45` already stamps `createdAt/updatedAt/deletedAt/deviceId` — the sync engine consumes these as-is. Do NOT modify `syncFields()`.

---

### `scripts/seed-dev-db.ts` (NEW script)

**Analog:** `scripts/reset-neon-db.ts` — tsx-shebang, env-var gated, top-level `main().catch()`.

**Shebang + imports pattern** (from `reset-neon-db.ts:1-47`):
```typescript
#!/usr/bin/env tsx
/**
 * Seed dev Dexie with a real user backup JSON export.
 * Usage: DEV_SEED_JSON=.private-fixtures/intake-tracker-backup-2026-04-17.json pnpm db:seed
 */
import { importBackup } from "@/lib/backup-service";
```
**CAVEAT:** `importBackup()` runs in a browser (writes to IndexedDB). Node-side `tsx` cannot execute it directly. Planner has two options:
1. Dev-seed runs in the browser via a `/dev/seed` route or console helper; the script file is a stub that prints instructions.
2. Dev-seed generates a JSON payload in Node that the user drops into the app's existing Import UI.
Option 2 is simpler and leverages the existing Settings → Import flow; option 1 requires a new dev-only page. The research document's architectural responsibility map (line 92) calls this out: "IndexedDB only exists in browsers; seed must run via dev UI or console, not Node."

**Env-var gate + safety check pattern** (from `reset-neon-db.ts:88-100`):
```typescript
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set — export it or add it to .env.local");
}
if (/prod/i.test(url) && process.env.ALLOW_PROD_RESET !== "1") {
  throw new Error("DATABASE_URL appears to point at production. Refusing to wipe.");
}
```
Adapt: `DEV_SEED_JSON` env var check; refuse if path contains `prod` or lives outside `.private-fixtures/`.

**Main block pattern** (from `reset-neon-db.ts:119-122`):
```typescript
main().catch((err) => {
  console.error("reset-neon-db failed:", err);
  process.exit(1);
});
```

---

### `<SyncLifecycleMount />` + `useSyncLifecycle()` hook

**Analog:** `src/app/providers.tsx:42-65` (`TimezoneGuard`) + `initStockRecalculation` effect at lines 71-77.

**TimezoneGuard as mount-once-on-tree component pattern:**
```typescript
function TimezoneGuard({ children }: { children: React.ReactNode }) {
  const { dialogOpen, /* … */ } = useTimezoneDetection();
  return (
    <>
      {children}
      <TimezoneChangeDialog /* … */ />
    </>
  );
}
```
Apply: `SyncLifecycleMount` takes no children (it's a sibling inside the provider tree, not a wrapper). It renders nothing; the hook sets up event listeners on mount:
```typescript
export function SyncLifecycleMount() {
  useSyncLifecycle();
  return null;
}
```

**Integration in `providers.tsx` (lines 79-87):**
```typescript
return (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TimezoneGuard>{children}</TimezoneGuard>
        <SyncLifecycleMount />   {/* ← NEW, sibling of TimezoneGuard */}
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);
```

**Hook body pattern** — mirrors the `useRef + useEffect([])` lifecycle guard at `providers.tsx:71-77`:
```typescript
export function useSyncLifecycle() {
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Wire triggers (D-09, D-10): online, visibilitychange, startup
    const onOnline = () => { /* schedule push + pull */ };
    const onVisible = () => { if (document.visibilityState === "visible") { /* schedule push */ } };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    // Startup pull
    syncEngine.pullAll();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
```

---

### `src/__tests__/migration/dexie-v16.test.ts` (unit test, migration)

**Analog:** `src/__tests__/migration/v15-migration.test.ts` — exact template.

**Test structure pattern** (from `v15-migration.test.ts:9-54`):
```typescript
describe("v16 migration: _syncQueue + _syncMeta tables added", () => {
  it("existing v15 intakeRecords survive v16 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    // Seed at v15 level (IDB version 150 — Dexie multiplies by 10)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 150);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["intakeRecords"], "readwrite");
        tx.objectStore("intakeRecords").add({ /* … v15-shape record … */ });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();  // triggers v16 upgrade

    const record = await db.intakeRecords.get("intake-v15-1");
    expect(record).toBeDefined();
    // assert all fields intact
  });
});
```

**Additional tests v16 must add beyond the v15 template:**
1. `_syncQueue` table exists and is empty after upgrade.
2. `_syncMeta` table exists and is empty after upgrade.
3. Round-trip: insert a queue row, fetch by `[tableName+recordId]` compound index.
4. Round-trip: put a cursor in `_syncMeta`, fetch by primary key `tableName`.

**Key constant to use:** **Dexie multiplies version by 10** (from MEMORY: `db.version(10)` = IDB version 100). So v15 = IDB 150, v16 = IDB 160. Same as `v15-migration.test.ts:16`.

**Fixture helpers** (exist already in `src/__tests__/fixtures/db-fixtures.ts` — imported at `v15-migration.test.ts:3-7`): use `makeIntakeRecord()`, `makeEatingRecord()`, etc. for v15-shape seed data.

---

### `src/__tests__/sync-queue.test.ts` + `sync-topology.test.ts` + `sync-engine.test.ts` (unit tests, structural CI gate)

**Analog:** `src/__tests__/schema-parity.test.ts` — same shape: plain vitest `describe/it/expect`, no React, no Dexie mocking beyond what fake-indexeddb provides globally via `src/__tests__/setup.ts`.

**Imports pattern** (from `schema-parity.test.ts:20-24`):
```typescript
import { describe, it, expect } from "vitest";
```

**Skip-if-env-missing pattern** (from `bundle-security.test.ts:12-13, 38`):
```typescript
const hasBuildArtifacts = fs.existsSync(staticDir);
describe.skipIf(!hasBuildArtifacts)("client bundle security", () => { /* … */ });
```
Sync tests don't need this — they run against fake-indexeddb in every CI run. But if any test hits a live Neon branch (e.g. an integration test of the `/api/sync/push` route), use `describe.skipIf(!process.env.DATABASE_URL)` to match the pattern.

**Topo-sort test coverage** — per CONTEXT `Claude's Discretion` line: since pilot service has no inner FKs, dedicate a unit test that asserts ordering:
```typescript
describe("sync-topology", () => {
  it("places prescriptions before medicationPhases before phaseSchedules before doseLogs", () => {
    const idx = (t: string) => TABLE_PUSH_ORDER.indexOf(t);
    expect(idx("prescriptions")).toBeLessThan(idx("medicationPhases"));
    expect(idx("medicationPhases")).toBeLessThan(idx("phaseSchedules"));
    expect(idx("phaseSchedules")).toBeLessThan(idx("doseLogs"));
    expect(idx("intakeRecords")).toBeLessThan(idx("substanceRecords"));
  });
  it("contains exactly 16 tables", () => {
    expect(TABLE_PUSH_ORDER).toHaveLength(16);
  });
});
```

---

### `e2e/sync-engine.spec.ts` (e2e, full flow)

**Analog:** `e2e/dashboard.spec.ts` — Playwright spec that uses the pre-seeded `storageState` from `e2e/global-setup.ts`.

**File header pattern** (from `dashboard.spec.ts:1-3`):
```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should allow adding water and salt logs', async ({ page }) => {
    await page.goto('/');
    // ...
  });
});
```

**Route mocking pattern** (from `dashboard.spec.ts:34-42`) — for sync tests this becomes mocking `/api/sync/push` and `/api/sync/pull`:
```typescript
await page.route('/api/sync/push', async route => {
  const body = await route.request().postDataJSON();
  await route.fulfill({
    json: { accepted: body.ops.map((o: any) => ({ queueId: o.queueId, updatedAt: Date.now() })) },
  });
});
```

**Auth state** — the Playwright config uses `storageState: 'playwright/.auth/user.json'` seeded by `e2e/global-setup.ts:74`. Sync specs inherit this automatically; no extra sign-in needed.

**Offline/online simulation** — use Playwright's `context.setOffline(true)` / `setOffline(false)` (standard Playwright API; not yet used elsewhere in this repo but is the canonical way to exercise D-09/D-10 triggers).

---

## Shared Patterns

### Authentication on server routes
**Source:** `src/lib/auth-middleware.ts:58-97`
**Apply to:** both `/api/sync/push` and `/api/sync/pull`
```typescript
export const POST = withAuth(async ({ request, auth }) => {
  // auth.userId! is guaranteed on success (see auth-middleware.ts:92)
});
```
`withAuth` handles session validation and `ALLOWED_EMAILS` whitelist. The destructure `{ request, auth }` and the `auth.userId!` non-null assertion are the established convention (documented at `auth-middleware.ts:4-9`).

### Error handling — route handlers
**Source:** `src/app/api/push/subscribe/route.ts:29-35`
**Apply to:** both sync routes
```typescript
} catch (error) {
  console.error("[sync/push] Error:", error);
  return NextResponse.json({ error: "Failed to push batch" }, { status: 500 });
}
```
`console.error` prefix matches `[modulename]` convention. Never leak `error.message` or `error.stack` to the client response body.

### Error handling — service modules
**Source:** `src/lib/service-result.ts` (full file)
**Apply to:** `sync-queue.ts`, `sync-engine.ts` helpers that can fail
```typescript
import { ok, err, type ServiceResult } from "./service-result";
// on success:
return ok(data);
// on failure:
return err("Human-readable message", caughtError);
```

### Zod validation — request bodies
**Source:** `src/app/api/push/subscribe/route.ts:6-24`
**Apply to:** both sync routes
```typescript
const parsed = MySchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json(
    { error: "Invalid request", details: parsed.error.flatten() },
    { status: 400 }
  );
}
```
Schema source for push/pull: `drizzle-zod` `createInsertSchema()` from `src/db/schema.ts`. `.omit({userId: true})` because the client never sends `userId` — the server derives it from `auth.userId!`.

### Dexie transactional write
**Source:** `src/lib/backup-service.ts:634-651` (multi-table bulk within `Promise.all`) and `intake-service.ts:48` (single-row `.add`)
**Apply to:** pull-apply path in `sync-engine.ts` and the pilot wiring in `intake-service.ts`
```typescript
await db.transaction('rw', [db.intakeRecords, db._syncMeta, db._syncQueue], async () => {
  await db.intakeRecords.bulkPut(rows);
  await db._syncMeta.put({ tableName: "intakeRecords", lastPulledUpdatedAt: lastTs });
});
```
Dexie's `transaction()` wraps all reads/writes in one IndexedDB transaction — atomic commit or full rollback.

### ID generation
**Source:** `src/lib/utils.ts:17-19` and `src/lib/utils.ts:39-42`
**Apply to:** every new row (queue rows, meta rows)
- `generateId()` = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}` — used for domain records.
- Alternatively `crypto.randomUUID()` — used for migrations (see `db.ts:385`) and device IDs (`utils.ts:31`).
- `syncFields()` stamps the four sync-scaffolding fields: `{ createdAt, updatedAt, deletedAt: null, deviceId, timezone }`.

### localStorage key namespacing
**Source:** `src/stores/settings-store.ts:249` (`"intake-tracker-settings"`) and `src/lib/utils.ts:26` (`"intake-tracker-device-id"`)
**Apply to:** `sync-status-store` persist key
```typescript
name: "intake-tracker-sync-status",
```

### Env var access
**Source:** `src/lib/auth-middleware.ts:35` and `src/lib/push-db.ts:4`
**Apply to:** sync server code
```typescript
process.env.DATABASE_URL!   // server-only, non-null asserted
process.env.ALLOWED_EMAILS  // may be unset — handle with ?? ""
```
Per user feedback (`feedback_env_vars.md`): use Vercel-Neon integration env names, not custom ones. `DATABASE_URL` is the Vercel-Neon standard.

---

## No Analog Found

None. Every new file in Phase 43 has at least a role-match analog in the codebase.

One caveat worth surfacing to the planner:

| File | Notes |
|------|-------|
| `scripts/seed-dev-db.ts` | IndexedDB only exists in browsers. Pure-Node tsx script cannot run `importBackup()`. Planner must decide: browser-side seed route, console helper, or CLI that writes a JSON payload for manual Settings → Import. The `scripts/reset-neon-db.ts` analog covers the CLI ergonomics but not the IndexedDB-in-Node constraint. |

---

## Metadata

**Analog search scope:**
- `src/lib/` (services, utilities, Dexie, auth, backup, push-db)
- `src/stores/` (Zustand)
- `src/app/api/**` (all 13 route handlers)
- `src/app/providers.tsx` (provider stack)
- `src/db/schema.ts` (Drizzle source of truth)
- `src/__tests__/` (17 test files, with deep inspection of schema-parity, bundle-security, v15-migration)
- `scripts/` (6 scripts)
- `e2e/` (5 specs + global-setup)

**Files scanned:** ~40 source files + 6 migration tests + 5 e2e specs.

**Pattern extraction date:** 2026-04-17.
