import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";

/**
 * v22 backfills `groupId` onto drink pairs written by the old implicit
 * auto-water path (issue #322).
 *
 * Those pairs were linked only by the water row's `source: "substance:<id>"`
 * string. `syncLiquidEntrySubstances` keys exclusively on `groupId`, so editing
 * one of these entries found no substance in the (nonexistent) group and
 * created a *second* one — a deterministic duplicate needing no AI misbehaviour.
 * Without this backfill, every drink already on disk stays that trap.
 */

const SYNC_FIELDS = {
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  deletedAt: null,
  deviceId: "test-device",
  timezone: "UTC",
};

/** Seed a pre-v22 database (IDB version 210) with the given rows. */
async function seedAtV21(
  substances: Record<string, unknown>[],
  intakes: Record<string, unknown>[],
): Promise<void> {
  await db.close();
  await db.delete();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 210);
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      for (const store of ["intakeRecords", "substanceRecords"]) {
        if (!rawDb.objectStoreNames.contains(store)) {
          rawDb.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      const tx = rawDb.transaction(
        ["intakeRecords", "substanceRecords"],
        "readwrite",
      );
      for (const record of substances) {
        tx.objectStore("substanceRecords").add(record);
      }
      for (const record of intakes) {
        tx.objectStore("intakeRecords").add(record);
      }
      tx.oncomplete = () => {
        rawDb.close();
        resolve();
      };
      tx.onerror = reject;
    };
    request.onerror = reject;
  });

  // Opening through db.ts runs the v22 upgrade.
  await db.open();
}

afterEach(async () => {
  await db.close();
  await db.delete();
  await db.open();
});

describe("v22 migration: groupId backfill for legacy drink pairs", () => {
  it("stamps a shared groupId on an ungrouped substance + water pair", async () => {
    await seedAtV21(
      [
        {
          id: "sub-1",
          type: "alcohol",
          abvPercent: 5,
          amountStandardDrinks: 2.2,
          volumeMl: 568,
          description: "Pint of lager",
          source: "standalone",
          timestamp: 1700000000000,
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-1",
          type: "water",
          amount: 568,
          timestamp: 1700000000000,
          source: "substance:sub-1",
          note: "Pint of lager",
          ...SYNC_FIELDS,
        },
      ],
    );

    const substance = await db.substanceRecords.get("sub-1");
    const water = await db.intakeRecords.get("water-1");

    expect(substance!.groupId).toBeTruthy();
    expect(water!.groupId).toBe(substance!.groupId);
  });

  it("derives the group id from the substance id so every device converges", async () => {
    // The upgrade runs per device and its writes are never pushed. A random id
    // would have each device invent a different group for the same pair, and
    // the first sync would split the halves apart again.
    await seedAtV21(
      [
        {
          id: "sub-det",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-det",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-det",
          ...SYNC_FIELDS,
        },
      ],
    );

    expect((await db.substanceRecords.get("sub-det"))!.groupId).toBe("sub-det");
    expect((await db.intakeRecords.get("water-det"))!.groupId).toBe("sub-det");
  });

  it("keeps unrelated pairs in separate groups", async () => {
    await seedAtV21(
      [
        {
          id: "sub-a",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          ...SYNC_FIELDS,
        },
        {
          id: "sub-b",
          type: "caffeine",
          amountMg: 47,
          volumeMl: 250,
          description: "Tea",
          source: "standalone",
          timestamp: 1700000001000,
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-a",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-a",
          ...SYNC_FIELDS,
        },
        {
          id: "water-b",
          type: "water",
          amount: 250,
          timestamp: 1700000001000,
          source: "substance:sub-b",
          ...SYNC_FIELDS,
        },
      ],
    );

    const a = await db.substanceRecords.get("sub-a");
    const b = await db.substanceRecords.get("sub-b");
    expect(a!.groupId).toBeTruthy();
    expect(b!.groupId).toBeTruthy();
    expect(a!.groupId).not.toBe(b!.groupId);
    expect((await db.intakeRecords.get("water-a"))!.groupId).toBe(a!.groupId);
    expect((await db.intakeRecords.get("water-b"))!.groupId).toBe(b!.groupId);
  });

  it("converges a half-grouped pair onto the existing group", async () => {
    await seedAtV21(
      [
        {
          id: "sub-2",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          groupId: "existing-group",
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-2",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-2",
          ...SYNC_FIELDS,
        },
      ],
    );

    // No second group is minted — both halves land on the one that existed.
    expect((await db.intakeRecords.get("water-2"))!.groupId).toBe("existing-group");
    expect((await db.substanceRecords.get("sub-2"))!.groupId).toBe("existing-group");
  });

  it("leaves an already-grouped pair untouched", async () => {
    await seedAtV21(
      [
        {
          id: "sub-3",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          groupId: "group-3",
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-3",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-3",
          groupId: "group-3",
          ...SYNC_FIELDS,
        },
      ],
    );

    expect((await db.substanceRecords.get("sub-3"))!.groupId).toBe("group-3");
    expect((await db.intakeRecords.get("water-3"))!.groupId).toBe("group-3");
  });

  it("ignores a water row whose referenced substance no longer exists", async () => {
    await seedAtV21(
      [],
      [
        {
          id: "orphan-water",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:deleted-substance",
          ...SYNC_FIELDS,
        },
      ],
    );

    const water = await db.intakeRecords.get("orphan-water");
    expect(water).toBeDefined();
    expect(water!.groupId).toBeUndefined();
  });

  it("does not touch plain water rows or their amounts", async () => {
    await seedAtV21(
      [],
      [
        {
          id: "plain-water",
          type: "water",
          amount: 500,
          timestamp: 1700000000000,
          source: "manual",
          ...SYNC_FIELDS,
        },
        {
          id: "food-water",
          type: "water",
          amount: 240,
          timestamp: 1700000000000,
          source: "manual:food_water_content",
          groupId: "meal-group",
          ...SYNC_FIELDS,
        },
      ],
    );

    const plain = await db.intakeRecords.get("plain-water");
    expect(plain!.groupId).toBeUndefined();
    expect(plain!.amount).toBe(500);

    const foodWater = await db.intakeRecords.get("food-water");
    expect(foodWater!.groupId).toBe("meal-group");
    expect(foodWater!.amount).toBe(240);
  });

  it("enqueues the repaired rows so the fix reaches the server", async () => {
    // Push selects from `_syncQueue`. An un-enqueued repair is invisible to it,
    // and a later pull overwrites the row with the server's ungrouped version.
    await seedAtV21(
      [
        {
          id: "sub-q",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-q",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-q",
          ...SYNC_FIELDS,
        },
      ],
    );

    const queued = await db._syncQueue.toArray();
    const byId = new Map(queued.map((r) => [r.recordId, r]));
    expect(byId.get("water-q")?.tableName).toBe("intakeRecords");
    expect(byId.get("water-q")?.op).toBe("upsert");
    expect(byId.get("sub-q")?.tableName).toBe("substanceRecords");
    expect(byId.get("sub-q")?.op).toBe("upsert");
  });

  it("does not enqueue rows it did not change", async () => {
    await seedAtV21(
      [
        {
          id: "sub-nq",
          type: "caffeine",
          amountMg: 95,
          volumeMl: 250,
          description: "Coffee",
          source: "standalone",
          timestamp: 1700000000000,
          groupId: "group-nq",
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-nq",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "substance:sub-nq",
          groupId: "group-nq",
          ...SYNC_FIELDS,
        },
      ],
    );

    expect(await db._syncQueue.count()).toBe(0);
  });

  it("does not create or delete any rows", async () => {
    await seedAtV21(
      [
        {
          id: "sub-4",
          type: "alcohol",
          abvPercent: 5,
          volumeMl: 500,
          description: "Beer",
          source: "standalone",
          timestamp: 1700000000000,
          ...SYNC_FIELDS,
        },
      ],
      [
        {
          id: "water-4",
          type: "water",
          amount: 500,
          timestamp: 1700000000000,
          source: "substance:sub-4",
          ...SYNC_FIELDS,
        },
      ],
    );

    // The backfill is a relink, not a repair of the counts — the historical
    // hydration total must not move.
    expect(await db.intakeRecords.count()).toBe(1);
    expect(await db.substanceRecords.count()).toBe(1);
    expect((await db.intakeRecords.get("water-4"))!.amount).toBe(500);
  });
});
