import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

// NOTE: This test uses the raw indexedDB.open() API to seed at a specific
// version, then opens the Dexie-managed DB to trigger the v16 upgrade.
// Pattern mirrors src/__tests__/migration/v15-migration.test.ts exactly.
// Dexie multiplies db.version(N) by 10 for the IDB version — so v15 = IDB 150.

/**
 * All v15 store definitions, used when seeding via raw indexedDB.open() to
 * pre-create stores before Dexie opens and drives the v15 → v16 upgrade.
 * Mirrors the stores block at src/lib/db.ts `db.version(15).stores({...})`.
 */
const V15_STORES: ReadonlyArray<string> = [
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "inventoryItems",
  "inventoryTransactions",
  "doseLogs",
  "dailyNotes",
  "auditLogs",
  "substanceRecords",
  "titrationPlans",
];

async function seedAtV15(seed?: (rawDb: IDBDatabase) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 150); // Dexie v15 = IDB 150
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      for (const name of V15_STORES) {
        if (!rawDb.objectStoreNames.contains(name)) {
          rawDb.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      if (seed) seed(rawDb);
      // If seed opened a transaction it will close the DB when done. Otherwise
      // close immediately so Dexie can re-open cleanly.
      if (!seed) {
        rawDb.close();
        resolve();
      } else {
        // seed() is expected to close rawDb and resolve via transaction oncomplete
        // so we bind resolve/reject through the seed callback pattern below
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

describe("v16 migration: _syncQueue + _syncMeta tables added", () => {
  it("existing v15 intakeRecords survive v16 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    // Seed 3 intakeRecords at v15 via raw indexedDB.open()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 150);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        for (const name of V15_STORES) {
          if (!rawDb.objectStoreNames.contains(name)) {
            rawDb.createObjectStore(name, { keyPath: "id" });
          }
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["intakeRecords"], "readwrite");
        const store = tx.objectStore("intakeRecords");
        store.add({
          id: "intake-v15-1",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "manual",
          note: "morning glass",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "seed-device",
          timezone: "UTC",
        });
        store.add({
          id: "intake-v15-2",
          type: "salt",
          amount: 500,
          timestamp: 1700000100000,
          source: "manual",
          createdAt: 1700000100000,
          updatedAt: 1700000100000,
          deletedAt: null,
          deviceId: "seed-device",
          timezone: "UTC",
        });
        store.add({
          id: "intake-v15-3",
          type: "water",
          amount: 500,
          timestamp: 1700000200000,
          source: "manual",
          createdAt: 1700000200000,
          updatedAt: 1700000200000,
          deletedAt: null,
          deviceId: "seed-device",
          timezone: "UTC",
        });
        tx.oncomplete = () => {
          rawDb.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    // Open via db.ts — triggers v15 → v16 upgrade
    await db.open();

    // All 3 records survive
    expect(await db.intakeRecords.count()).toBe(3);

    // Field-by-field equality on one seeded record
    const r = await db.intakeRecords.get("intake-v15-1");
    expect(r).toBeDefined();
    expect(r!.type).toBe("water");
    expect(r!.amount).toBe(250);
    expect(r!.timestamp).toBe(1700000000000);
    expect(r!.source).toBe("manual");
    expect(r!.note).toBe("morning glass");
    expect(r!.createdAt).toBe(1700000000000);
    expect(r!.updatedAt).toBe(1700000000000);
    expect(r!.deletedAt).toBeNull();
    expect(r!.deviceId).toBe("seed-device");
    expect(r!.timezone).toBe("UTC");
  });

  it("_syncQueue table exists and is empty after upgrade", async () => {
    await db.close();
    await db.delete();

    await seedAtV15();
    await db.open();

    expect(await db._syncQueue.count()).toBe(0);
    // Auto-increment primary key (++id)
    expect(db._syncQueue.schema.primKey.auto).toBe(true);
  });

  it("_syncMeta table exists and is empty after upgrade", async () => {
    await db.close();
    await db.delete();

    await seedAtV15();
    await db.open();

    expect(await db._syncMeta.count()).toBe(0);
    // Primary key keyPath === "tableName"
    expect(db._syncMeta.schema.primKey.keyPath).toBe("tableName");
  });

  it("round-trip: coalesce lookup by [tableName+recordId] compound index", async () => {
    await db.close();
    await db.delete();

    await seedAtV15();
    await db.open();

    const id = await db._syncQueue.add({
      tableName: "intakeRecords",
      recordId: "x1",
      op: "upsert",
      enqueuedAt: 1000,
      attempts: 0,
    });

    expect(typeof id).toBe("number");

    const found = await db._syncQueue
      .where("[tableName+recordId]")
      .equals(["intakeRecords", "x1"])
      .first();

    expect(found).toBeDefined();
    expect(found!.tableName).toBe("intakeRecords");
    expect(found!.recordId).toBe("x1");
    expect(found!.op).toBe("upsert");
    expect(found!.enqueuedAt).toBe(1000);
    expect(found!.attempts).toBe(0);
    expect(found!.id).toBe(id);

    // Negative case: wrong (tableName, recordId) tuple finds nothing
    const miss = await db._syncQueue
      .where("[tableName+recordId]")
      .equals(["intakeRecords", "x2"])
      .first();
    expect(miss).toBeUndefined();
  });

  it("round-trip: _syncMeta put+get by tableName primary key", async () => {
    await db.close();
    await db.delete();

    await seedAtV15();
    await db.open();

    await db._syncMeta.put({
      tableName: "intakeRecords",
      lastPulledUpdatedAt: 5000,
    });

    const row = await db._syncMeta.get("intakeRecords");
    expect(row).toBeDefined();
    expect(row!.tableName).toBe("intakeRecords");
    expect(row!.lastPulledUpdatedAt).toBe(5000);

    // Update via put (upsert semantics on primary key)
    await db._syncMeta.put({
      tableName: "intakeRecords",
      lastPulledUpdatedAt: 9000,
    });
    const updated = await db._syncMeta.get("intakeRecords");
    expect(updated!.lastPulledUpdatedAt).toBe(9000);
    expect(await db._syncMeta.count()).toBe(1);
  });

  it("all 16 data tables retained (none dropped by omission)", async () => {
    await db.close();
    await db.delete();

    await seedAtV15();
    await db.open();

    const tableNames = db.tables.map((t) => t.name).sort();

    // 16 v15 data tables + 2 new v16 tables = 18 total
    const expected = [
      ...V15_STORES,
      "_syncQueue",
      "_syncMeta",
    ].sort();

    expect(tableNames).toEqual(expected);
    expect(tableNames).toHaveLength(18);

    // Explicitly assert each v15 data table is still accessible
    for (const name of V15_STORES) {
      expect(tableNames).toContain(name);
    }
  });
});
