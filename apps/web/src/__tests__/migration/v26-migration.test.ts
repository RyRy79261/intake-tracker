import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";

/**
 * v26 finishes the v25 repair: it raises the water row of every drink to the
 * drink's full volume, whatever its age. v25 skipped drinks logged before
 * 2026-09-26, but the preset tab also booked a reduced "water content" share
 * from 2026-03-24 to 2026-04-09.
 *
 * The drink volume comes from the group's caffeine/alcohol record. Meals,
 * groups with no single live water row, rows already at or above the volume,
 * and water rows edited after the volume was stored are left alone.
 */

// Before the v25 cutoff, so v25 left these rows as they were.
const OLD = 1_775_000_000_000;

const SYNC = {
  createdAt: OLD,
  updatedAt: OLD,
  deletedAt: null,
  deviceId: "test-device",
  timezone: "UTC",
};

type Seed = Partial<Record<
  "intakeRecords" | "substanceRecords" | "eatingRecords" | "_syncQueue",
  Record<string, unknown>[]
>>;

/** Seed a pre-v26 database (IDB version 250) with the given rows. */
async function seedAtV25(seed: Seed): Promise<void> {
  await db.close();
  await db.delete();

  const stores = ["intakeRecords", "substanceRecords", "eatingRecords", "_syncQueue"] as const;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 250);
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

  // Opening through db.ts runs the v26 upgrade.
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
        type: "caffeine",
        amountMg: 95,
        volumeMl,
        description: "Coffee",
        source: "standalone",
        timestamp: OLD,
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
        timestamp: OLD,
        source: "preset:default-coffee",
        groupId,
        ...SYNC,
      },
      ...(extra.intakeRecords ?? []),
    ],
    ...(extra.eatingRecords && { eatingRecords: extra.eatingRecords }),
  };
}

describe("v26 migration: every drink counts at full volume", () => {
  it("raises an old reduced water row to the drink volume and queues it for sync", async () => {
    await seedAtV25(drink("g1", 250, 245));

    const water = await db.intakeRecords.get("g1-water");
    expect(water!.amount).toBe(250);
    expect(water!.updatedAt).toBeGreaterThan(SYNC.updatedAt);

    const queued = await db._syncQueue.toArray();
    expect(queued.map((q) => [q.tableName, q.recordId])).toEqual([
      ["intakeRecords", "g1-water"],
    ]);
  });

  it("does not queue a second op when the row is already queued", async () => {
    const seed = drink("g1q", 250, 245);
    seed._syncQueue = [
      { tableName: "intakeRecords", recordId: "g1q-water", op: "upsert", enqueuedAt: OLD, attempts: 0 },
    ];
    await seedAtV25(seed);

    expect((await db.intakeRecords.get("g1q-water"))!.amount).toBe(250);
    expect(await db._syncQueue.count()).toBe(1);
  });

  it("uses the largest live volume in the group", async () => {
    await seedAtV25(
      drink("g6", 250, 200, {
        substanceRecords: [
          {
            id: "g6-alc",
            type: "alcohol",
            amountStandardDrinks: 1,
            volumeMl: 330,
            timestamp: OLD,
            groupId: "g6",
            ...SYNC,
          },
        ],
      }),
    );

    expect((await db.intakeRecords.get("g6-water"))!.amount).toBe(330);
  });

  it("leaves a water row edited after the volume was stored", async () => {
    const seed = drink("g7", 500, 250);
    seed.intakeRecords![0]!.updatedAt = OLD + 60_000;
    await seedAtV25(seed);

    expect((await db.intakeRecords.get("g7-water"))!.amount).toBe(250);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("leaves a drink already booked at full volume untouched", async () => {
    await seedAtV25(drink("g2", 330, 330));

    const water = await db.intakeRecords.get("g2-water");
    expect(water!.amount).toBe(330);
    expect(water!.updatedAt).toBe(SYNC.updatedAt);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("skips a meal group, whose water row is food water", async () => {
    await seedAtV25(
      drink("g3", 250, 100, {
        eatingRecords: [{ id: "g3-eat", timestamp: OLD, groupId: "g3", ...SYNC }],
      }),
    );

    expect((await db.intakeRecords.get("g3-water"))!.amount).toBe(100);
  });

  it("skips a group with more than one live water row", async () => {
    await seedAtV25(
      drink("g4", 500, 200, {
        intakeRecords: [
          { id: "g4-water-2", type: "water", amount: 200, timestamp: OLD, groupId: "g4", ...SYNC },
        ],
      }),
    );

    expect((await db.intakeRecords.get("g4-water"))!.amount).toBe(200);
    expect((await db.intakeRecords.get("g4-water-2"))!.amount).toBe(200);
  });

  it("ignores a deleted substance's volume", async () => {
    const seed = drink("g5", 250, 245);
    seed.substanceRecords![0]!.deletedAt = OLD + 1;
    await seedAtV25(seed);

    expect((await db.intakeRecords.get("g5-water"))!.amount).toBe(245);
  });

  it("leaves a substance with no group alone (v12 guessed its volume)", async () => {
    const seed = drink("g8", 250, 100);
    delete seed.substanceRecords![0]!.groupId;
    delete seed.intakeRecords![0]!.groupId;
    await seedAtV25(seed);

    expect((await db.intakeRecords.get("g8-water"))!.amount).toBe(100);
  });
});
