import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";

/**
 * v25 raises each already-logged drink's water row to the drink's full
 * volume. `logDrink` used to book only a "water content" share as fluid
 * (95% of a typed 5% beer, 60% of a spirit), while clinical intake/output
 * charts and fluid restrictions count every drink at its whole volume.
 *
 * Only drinks written since that reduction shipped are corrected. The drink
 * volume comes from the group's caffeine/alcohol record. Meals,
 * groups with no single live water row, and rows already at or above the
 * volume are left alone.
 */

// Written after the water-content reduction shipped (2026-09-26 23:05 UTC).
const AFTER_CHANGE = 1_790_500_000_000;

const SYNC = {
  createdAt: AFTER_CHANGE,
  updatedAt: AFTER_CHANGE,
  deletedAt: null,
  deviceId: "test-device",
  timezone: "UTC",
};

type Seed = Partial<Record<
  "intakeRecords" | "substanceRecords" | "eatingRecords" | "_syncQueue",
  Record<string, unknown>[]
>>;

/** Seed a pre-v25 database (IDB version 240) with the given rows. */
async function seedAtV24(seed: Seed): Promise<void> {
  await db.close();
  await db.delete();

  const stores = ["intakeRecords", "substanceRecords", "eatingRecords", "_syncQueue"] as const;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 240);
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      for (const store of stores) {
        if (rawDb.objectStoreNames.contains(store)) continue;
        if (store === "_syncQueue") {
          const q = rawDb.createObjectStore(store, { keyPath: "id", autoIncrement: true });
          q.createIndex("[tableName+recordId]", ["tableName", "recordId"]);
        } else {
          const t = rawDb.createObjectStore(store, { keyPath: "id" });
          t.createIndex("groupId", "groupId");
        }
      }
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      const tx = rawDb.transaction([...stores], "readwrite");
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

  // Opening through db.ts runs the v25 upgrade.
  await db.open();
}

afterEach(async () => {
  await db.close();
  await db.delete();
  await db.open();
});

function drink(groupId: string, volumeMl: number, waterMl: number, extra: Seed = {}): Seed {
  return {
    substanceRecords: [
      {
        id: `${groupId}-sub`,
        type: "alcohol",
        abvPercent: 5,
        amountStandardDrinks: 3.95,
        volumeMl,
        description: "Beer",
        source: "standalone",
        timestamp: 1_700_000_000_000,
        groupId,
        ...SYNC,
      },
      ...(extra.substanceRecords ?? []),
    ],
    intakeRecords: [
      {
        id: `${groupId}-water`,
        type: "water",
        amount: waterMl,
        timestamp: 1_700_000_000_000,
        source: "preset:default-beer",
        groupId,
        ...SYNC,
      },
      ...(extra.intakeRecords ?? []),
    ],
    ...(extra.eatingRecords && { eatingRecords: extra.eatingRecords }),
  };
}

describe("v25 migration: drinks count at full volume", () => {
  it("raises a reduced beer water row to the drink volume and queues it for sync", async () => {
    await seedAtV24(drink("g1", 1000, 950));

    const water = await db.intakeRecords.get("g1-water");
    expect(water!.amount).toBe(1000);
    expect(water!.updatedAt).toBeGreaterThan(SYNC.updatedAt);

    const queued = await db._syncQueue.toArray();
    expect(queued.map((q) => [q.tableName, q.recordId])).toEqual([
      ["intakeRecords", "g1-water"],
    ]);
  });

  it("leaves a drink logged before the reduction shipped untouched", async () => {
    const seed = drink("g0", 1000, 950);
    seed.intakeRecords![0]!.createdAt = 1_790_000_000_000;
    await seedAtV24(seed);

    expect((await db.intakeRecords.get("g0-water"))!.amount).toBe(950);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("leaves a drink already booked at full volume untouched", async () => {
    await seedAtV24(drink("g2", 330, 330));

    const water = await db.intakeRecords.get("g2-water");
    expect(water!.amount).toBe(330);
    expect(water!.updatedAt).toBe(SYNC.updatedAt);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("skips a meal group, whose water row is food water", async () => {
    await seedAtV24(
      drink("g3", 250, 100, {
        eatingRecords: [
          { id: "g3-eat", timestamp: 1_700_000_000_000, groupId: "g3", ...SYNC },
        ],
      }),
    );

    expect((await db.intakeRecords.get("g3-water"))!.amount).toBe(100);
  });

  it("skips a group with more than one live water row", async () => {
    await seedAtV24(
      drink("g4", 500, 200, {
        intakeRecords: [
          {
            id: "g4-water-2",
            type: "water",
            amount: 200,
            timestamp: 1_700_000_000_000,
            groupId: "g4",
            ...SYNC,
          },
        ],
      }),
    );

    expect((await db.intakeRecords.get("g4-water"))!.amount).toBe(200);
    expect((await db.intakeRecords.get("g4-water-2"))!.amount).toBe(200);
  });

  it("ignores a deleted substance's volume", async () => {
    const seed = drink("g5", 1000, 950);
    seed.substanceRecords![0]!.deletedAt = 1_700_000_500_000;
    await seedAtV24(seed);

    expect((await db.intakeRecords.get("g5-water"))!.amount).toBe(950);
  });
});
