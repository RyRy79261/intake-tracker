import { describe, it, expect, afterEach } from "vitest";
import { db, DB_SCHEMA_VERSION, createPreviewDatabase } from "@/lib/db";

/**
 * v23:
 *  - adds the `[scheduleId+scheduledDate]` compound index on doseLogs;
 *  - drops the dead boolean indexes (prescriptions.isActive,
 *    inventoryItems.isActive, phaseSchedules.enabled) — booleans are not valid
 *    IndexedDB keys, so those indexes never held an entry (dexie-schema#8);
 *  - repairs tombstones whose lifecycle flag still says "live": a soft-deleted
 *    prescription with `isActive: true`, a deleted phase still `active`, etc.
 *    Readers that filter on the flag alone keep treating those rows as live.
 *
 * The repair only flips flags on rows that are already soft-deleted. It never
 * touches a live row and never deletes anything.
 */

const DELETED_AT = 1_700_000_500_000;

const SYNC = {
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deviceId: "test-device",
};

type Seed = Partial<Record<
  | "prescriptions"
  | "inventoryItems"
  | "phaseSchedules"
  | "medicationPhases"
  | "titrationPlans"
  | "doseLogs"
  | "_syncQueue",
  Record<string, unknown>[]
>>;

/** Seed a pre-v23 database (IDB version 220) with the given rows. */
async function seedAtV22(seed: Seed): Promise<void> {
  await db.close();
  await db.delete();

  const stores = Object.keys(seed) as (keyof Seed)[];
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 220);
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      for (const store of stores) {
        if (rawDb.objectStoreNames.contains(store)) continue;
        if (store === "_syncQueue") {
          const q = rawDb.createObjectStore(store, {
            keyPath: "id",
            autoIncrement: true,
          });
          q.createIndex("[tableName+recordId]", ["tableName", "recordId"]);
        } else {
          rawDb.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      if (stores.length === 0) {
        rawDb.close();
        resolve();
        return;
      }
      const tx = rawDb.transaction(stores, "readwrite");
      for (const store of stores) {
        for (const row of seed[store] ?? []) tx.objectStore(store).add(row);
      }
      tx.oncomplete = () => {
        rawDb.close();
        resolve();
      };
      tx.onerror = reject;
    };
    request.onerror = reject;
  });

  // Opening through db.ts runs the v23 upgrade.
  await db.open();
}

afterEach(async () => {
  await db.close();
  await db.delete();
  await db.open();
});

function queuedIds(): Promise<string[]> {
  return db._syncQueue.toArray().then((rows) => rows.map((r) => r.recordId).sort());
}

describe("v23 schema", () => {
  it("is superseded only by v24 (adds a table) and v25 (data repair), which change no v23 store", () => {
    expect(DB_SCHEMA_VERSION).toBe(25);
    expect(db.verno).toBe(25);
  });

  it("indexes doseLogs by [scheduleId+scheduledDate] and keeps scheduledTime", () => {
    const names = db.doseLogs.schema.indexes.map((i) => i.name);
    expect(names).toContain("[scheduleId+scheduledDate]");
    expect(names).toContain("scheduledTime");
    expect(names).toContain("[prescriptionId+scheduledDate]");
  });

  it("drops the dead boolean indexes but keeps phaseSchedules.time", () => {
    const idx = (t: { schema: { indexes: { name: string }[] } }) =>
      t.schema.indexes.map((i) => i.name);
    expect(idx(db.prescriptions)).not.toContain("isActive");
    expect(idx(db.prescriptions)).toContain("createdAt");
    expect(idx(db.inventoryItems)).not.toContain("isActive");
    expect(idx(db.inventoryItems)).toContain("prescriptionId");
    expect(idx(db.phaseSchedules)).not.toContain("enabled");
    expect(idx(db.phaseSchedules)).toContain("time");
  });

  it("preview databases get the same stores", () => {
    const preview = createPreviewDatabase();
    expect(preview.verno).toBe(DB_SCHEMA_VERSION);
    const names = preview.tables.map((t) => t.name).sort();
    expect(names).toEqual(db.tables.map((t) => t.name).sort());
    const doseIdx = preview.tables
      .find((t) => t.name === "doseLogs")!
      .schema.indexes.map((i) => i.name);
    expect(doseIdx).toContain("[scheduleId+scheduledDate]");
  });

  it("the compound index answers slot lookups", async () => {
    await db.doseLogs.bulkAdd([
      {
        id: "d1",
        prescriptionId: "rx",
        phaseId: "ph",
        scheduleId: "s1",
        scheduledDate: "2026-09-01",
        scheduledTime: "08:00",
        status: "taken",
        timezone: "UTC",
        ...SYNC,
        deletedAt: null,
      },
      {
        id: "d2",
        prescriptionId: "rx",
        phaseId: "ph",
        scheduleId: "s1",
        scheduledDate: "2026-09-02",
        scheduledTime: "08:00",
        status: "taken",
        timezone: "UTC",
        ...SYNC,
        deletedAt: null,
      },
    ]);
    const hits = await db.doseLogs
      .where("[scheduleId+scheduledDate]")
      .equals(["s1", "2026-09-02"])
      .toArray();
    expect(hits.map((h) => h.id)).toEqual(["d2"]);
  });
});

describe("v23 migration: tombstone lifecycle-flag repair", () => {
  it("flips isActive/enabled off on soft-deleted prescriptions, inventory items and schedules", async () => {
    await seedAtV22({
      prescriptions: [
        { id: "rx-del", genericName: "A", indication: "", isActive: true, ...SYNC, deletedAt: DELETED_AT },
      ],
      inventoryItems: [
        { id: "inv-del", prescriptionId: "rx-del", brandName: "A", strength: 5, unit: "mg", pillShape: "round", pillColor: "#fff", isActive: true, timezone: "UTC", ...SYNC, deletedAt: DELETED_AT },
      ],
      phaseSchedules: [
        { id: "sch-del", phaseId: "ph", time: "08:00", scheduleTimeUTC: 360, anchorTimezone: "UTC", dosage: 5, daysOfWeek: [1], enabled: true, ...SYNC, deletedAt: DELETED_AT },
      ],
    });

    const rx = await db.prescriptions.get("rx-del");
    const inv = await db.inventoryItems.get("inv-del");
    const sch = await db.phaseSchedules.get("sch-del");
    expect(rx!.isActive).toBe(false);
    expect(inv!.isActive).toBe(false);
    expect(sch!.enabled).toBe(false);

    // Stamped newer so the pushed repair wins last-write-wins on the server.
    for (const row of [rx!, inv!, sch!]) {
      expect(row.updatedAt).toBeGreaterThan(SYNC.updatedAt);
      // The tombstone itself is preserved exactly.
      expect(row.deletedAt).toBe(DELETED_AT);
    }
  });

  it("cancels soft-deleted phases and plans that still claim to be running", async () => {
    await seedAtV22({
      medicationPhases: [
        { id: "ph-active", prescriptionId: "rx", type: "maintenance", unit: "mg", startDate: 0, foodInstruction: "none", status: "active", ...SYNC, deletedAt: DELETED_AT },
        { id: "ph-pending", prescriptionId: "rx", type: "titration", unit: "mg", startDate: 0, foodInstruction: "none", status: "pending", ...SYNC, deletedAt: DELETED_AT },
        { id: "ph-done", prescriptionId: "rx", type: "maintenance", unit: "mg", startDate: 0, foodInstruction: "none", status: "completed", ...SYNC, deletedAt: DELETED_AT },
      ],
      titrationPlans: [
        { id: "tp-active", title: "T", conditionLabel: "HF", status: "active", ...SYNC, deletedAt: DELETED_AT },
        { id: "tp-draft", title: "T", conditionLabel: "HF", status: "draft", ...SYNC, deletedAt: DELETED_AT },
        { id: "tp-done", title: "T", conditionLabel: "HF", status: "completed", ...SYNC, deletedAt: DELETED_AT },
      ],
    });

    expect((await db.medicationPhases.get("ph-active"))!.status).toBe("cancelled");
    expect((await db.medicationPhases.get("ph-pending"))!.status).toBe("cancelled");
    // A finished phase keeps its history.
    const done = (await db.medicationPhases.get("ph-done"))!;
    expect(done.status).toBe("completed");
    expect(done.updatedAt).toBe(SYNC.updatedAt);

    expect((await db.titrationPlans.get("tp-active"))!.status).toBe("cancelled");
    expect((await db.titrationPlans.get("tp-draft"))!.status).toBe("cancelled");
    expect((await db.titrationPlans.get("tp-done"))!.status).toBe("completed");
  });

  it("never touches live rows", async () => {
    await seedAtV22({
      prescriptions: [
        { id: "rx-live", genericName: "A", indication: "x", isActive: true, ...SYNC, deletedAt: null },
        // Key absent entirely (older pulled rows) — still live.
        { id: "rx-live-2", genericName: "B", indication: "x", isActive: true, ...SYNC },
      ],
      medicationPhases: [
        { id: "ph-live", prescriptionId: "rx-live", type: "maintenance", unit: "mg", startDate: 0, foodInstruction: "none", status: "active", ...SYNC, deletedAt: null },
      ],
      phaseSchedules: [
        { id: "sch-live", phaseId: "ph-live", time: "08:00", scheduleTimeUTC: 360, anchorTimezone: "UTC", dosage: 5, daysOfWeek: [1], enabled: true, ...SYNC, deletedAt: null },
      ],
    });

    const rx = (await db.prescriptions.get("rx-live"))!;
    expect(rx.isActive).toBe(true);
    expect(rx.updatedAt).toBe(SYNC.updatedAt);
    expect((await db.prescriptions.get("rx-live-2"))!.isActive).toBe(true);
    expect((await db.medicationPhases.get("ph-live"))!.status).toBe("active");
    expect((await db.phaseSchedules.get("sch-live"))!.enabled).toBe(true);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("enqueues each repaired row once, and nothing it left alone", async () => {
    await seedAtV22({
      prescriptions: [
        { id: "rx-del", genericName: "A", indication: "", isActive: true, ...SYNC, deletedAt: DELETED_AT },
        // Already consistent — no repair, no enqueue.
        { id: "rx-ok", genericName: "B", indication: "", isActive: false, ...SYNC, deletedAt: DELETED_AT },
      ],
      medicationPhases: [
        { id: "ph-del", prescriptionId: "rx-del", type: "maintenance", unit: "mg", startDate: 0, foodInstruction: "none", status: "active", ...SYNC, deletedAt: DELETED_AT },
      ],
      _syncQueue: [
        // An op already queued for this record carries the new flag on its
        // own (push reads the live row), so no second op is added.
        { tableName: "medicationPhases", recordId: "ph-del", op: "upsert", enqueuedAt: 1, attempts: 0 },
      ],
    });

    expect(await queuedIds()).toEqual(["ph-del", "rx-del"]);
    const rxOp = (await db._syncQueue.toArray()).find((r) => r.recordId === "rx-del")!;
    expect(rxOp.tableName).toBe("prescriptions");
    expect(rxOp.op).toBe("upsert");
    expect((await db.prescriptions.get("rx-ok"))!.updatedAt).toBe(SYNC.updatedAt);
  });

  it("does not create or delete any rows", async () => {
    await seedAtV22({
      prescriptions: [
        { id: "rx-del", genericName: "A", indication: "", isActive: true, ...SYNC, deletedAt: DELETED_AT },
        { id: "rx-live", genericName: "B", indication: "", isActive: true, ...SYNC, deletedAt: null },
      ],
      inventoryItems: [
        { id: "inv-del", prescriptionId: "rx-del", brandName: "A", strength: 5, unit: "mg", pillShape: "round", pillColor: "#fff", isActive: true, timezone: "UTC", ...SYNC, deletedAt: DELETED_AT },
      ],
    });

    expect(await db.prescriptions.count()).toBe(2);
    expect(await db.inventoryItems.count()).toBe(1);
  });
});
