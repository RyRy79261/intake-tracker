import { describe, it, expect, afterEach } from "vitest";
import { db, DB_SCHEMA_VERSION } from "@/lib/db";

/**
 * v27 repairs what three write-path bugs may have left on a device:
 *  1. tombstones a backup restore (replace mode) wrote without switching off
 *     their lifecycle flag — the v23 repair runs again;
 *  2. audit rows `logAudit` wrote without a sync-queue entry are queued;
 *  3. queued "upsert" ops that stand for a tombstone become "delete".
 */

const DELETED_AT = 1_700_000_500_000;
const SYNC = {
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deviceId: "test-device",
};

const STORES = [
  "prescriptions",
  "medicationPhases",
  "intakeRecords",
  "auditLogs",
  "_syncQueue",
] as const;
type Seed = Partial<Record<(typeof STORES)[number], Record<string, unknown>[]>>;

/** Seed a pre-v27 database (IDB version 260) with the given rows. */
async function seedAtV26(seed: Seed): Promise<void> {
  await db.close();
  await db.delete();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 260);
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      for (const store of STORES) {
        if (store === "_syncQueue") {
          const q = rawDb.createObjectStore(store, { keyPath: "id", autoIncrement: true });
          q.createIndex("[tableName+recordId]", ["tableName", "recordId"]);
        } else {
          rawDb.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      const tx = rawDb.transaction([...STORES], "readwrite");
      for (const store of STORES) {
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

  // Opening through db.ts runs the v27 upgrade.
  await db.open();
}

afterEach(async () => {
  await db.close();
  await db.delete();
  await db.open();
});

async function ops(): Promise<Record<string, string>> {
  const rows = await db._syncQueue.toArray();
  return Object.fromEntries(rows.map((q) => [`${q.tableName}:${q.recordId}`, q.op]));
}

describe("v27 schema", () => {
  it("is the current version and changes no store", () => {
    expect(DB_SCHEMA_VERSION).toBe(27);
    expect(db.verno).toBe(27);
  });
});

describe("v27 migration", () => {
  it("switches off tombstones that still read live and queues them as deletes", async () => {
    await seedAtV26({
      prescriptions: [
        { id: "rx-del", genericName: "A", indication: "", isActive: true, ...SYNC, deletedAt: DELETED_AT },
        { id: "rx-live", genericName: "B", indication: "", isActive: true, ...SYNC, deletedAt: null },
      ],
      medicationPhases: [
        { id: "ph-del", prescriptionId: "rx-del", type: "maintenance", unit: "mg", startDate: 0, foodInstruction: "none", status: "active", ...SYNC, deletedAt: DELETED_AT },
      ],
    });

    const rx = (await db.prescriptions.get("rx-del"))!;
    expect(rx.isActive).toBe(false);
    expect(rx.deletedAt).toBe(DELETED_AT);
    expect(rx.updatedAt).toBeGreaterThan(SYNC.updatedAt);
    expect((await db.medicationPhases.get("ph-del"))!.status).toBe("cancelled");
    expect((await db.prescriptions.get("rx-live"))!).toMatchObject({ isActive: true, updatedAt: SYNC.updatedAt });

    expect(await ops()).toEqual({
      "prescriptions:rx-del": "delete",
      "medicationPhases:ph-del": "delete",
    });
  });

  it("queues logAudit rows unchanged, and leaves other audit rows alone", async () => {
    const audit = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      timestamp: SYNC.createdAt,
      action: "ai_parse_request",
      ...SYNC,
      deletedAt: null,
      timezone: "UTC",
      ...extra,
    });
    await seedAtV26({
      auditLogs: [
        // Written by logAudit: never queued.
        audit("1700000000000-abc1234"),
        // Written by writeAuditLog/buildAuditEntry: queued and synced already.
        audit("4f7d0c2e-1d1b-4a33-9a62-0c8f3b8e2a11"),
        // A logAudit row the push route would reject (no timezone): stays local.
        audit("1700000000001-def5678", { timezone: undefined }),
      ],
    });

    expect(await ops()).toEqual({ "auditLogs:1700000000000-abc1234": "upsert" });
    const row = (await db.auditLogs.get("1700000000000-abc1234"))!;
    expect(row.updatedAt).toBe(SYNC.updatedAt);
  });

  it("turns a queued upsert for a tombstone into a delete, and nothing else", async () => {
    await seedAtV26({
      intakeRecords: [
        { id: "gone", type: "water", amount: 200, timestamp: 1, ...SYNC, deletedAt: DELETED_AT },
        { id: "live", type: "water", amount: 200, timestamp: 1, ...SYNC, deletedAt: null },
      ],
      _syncQueue: [
        { tableName: "intakeRecords", recordId: "gone", op: "upsert", enqueuedAt: 5, attempts: 2 },
        { tableName: "intakeRecords", recordId: "live", op: "upsert", enqueuedAt: 6, attempts: 0 },
        // The record is gone entirely: an upsert stays an upsert (push drops it).
        { tableName: "intakeRecords", recordId: "missing", op: "upsert", enqueuedAt: 7, attempts: 0 },
      ],
    });

    expect(await ops()).toEqual({
      "intakeRecords:gone": "delete",
      "intakeRecords:live": "upsert",
      "intakeRecords:missing": "upsert",
    });
    // Nothing else about the queue row changes.
    const gone = (await db._syncQueue.toArray()).find((q) => q.recordId === "gone")!;
    expect(gone).toMatchObject({ enqueuedAt: 5, attempts: 2 });
    expect((await db.intakeRecords.get("gone"))!.updatedAt).toBe(SYNC.updatedAt);
  });
});
