import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeSubstanceRecord } from "@/__tests__/fixtures/db-fixtures";

describe("v12 migration: substanceRecords table", () => {
  it("v12 migration creates substanceRecords table that is writable and readable", async () => {
    const record = makeSubstanceRecord({ id: "sub-readwrite-1" });
    await db.substanceRecords.add(record);
    const retrieved = await db.substanceRecords.get("sub-readwrite-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.type).toBe("caffeine");
    expect(retrieved!.amountMg).toBe(95);
    expect(retrieved!.description).toBe("Coffee");
  });

  it("[type+timestamp] compound index supports range queries", async () => {
    const base = 1700000000000;
    await db.substanceRecords.bulkAdd([
      makeSubstanceRecord({ id: "s1", type: "caffeine", timestamp: base + 1000 }),
      makeSubstanceRecord({ id: "s2", type: "caffeine", timestamp: base + 2000 }),
      makeSubstanceRecord({ id: "s3", type: "alcohol", timestamp: base + 1500, amountStandardDrinks: 1 }),
      makeSubstanceRecord({ id: "s4", type: "caffeine", timestamp: base + 3000 }),
    ]);

    const caffeineInRange = await db.substanceRecords
      .where("[type+timestamp]")
      .between(["caffeine", base + 1000], ["caffeine", base + 2500], true, true)
      .toArray();

    expect(caffeineInRange).toHaveLength(2);
    expect(caffeineInRange.map((r) => r.id).sort()).toEqual(["s1", "s2"]);
  });
});

describe("v12 migration: keyword extraction from intake records", () => {
  it("intake record with 'coffee' note creates caffeine substance record with 95mg", async () => {
    await db.close();
    await db.delete();

    // Seed a v11-style database using raw IDB (Dexie v11 = IDB version 110)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 110);
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
          id: "intake-coffee-1",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "manual",
          note: "Morning coffee",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts — triggers v12 upgrade
    await db.open();

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(1);
    expect(substances[0]!.type).toBe("caffeine");
    expect(substances[0]!.amountMg).toBe(95);
    expect(substances[0]!.source).toBe("water_intake");
    expect(substances[0]!.sourceRecordId).toBe("intake-coffee-1");
  });

  it("intake record with 'beer' note creates alcohol substance record with 1 standard drink", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 110);
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
          id: "intake-beer-1",
          type: "water",
          amount: 330,
          timestamp: 1700000000000,
          source: "manual",
          note: "Cold beer after work",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(1);
    expect(substances[0]!.type).toBe("alcohol");
    expect(substances[0]!.amountStandardDrinks).toBe(1);
    expect(substances[0]!.source).toBe("water_intake");
    expect(substances[0]!.sourceRecordId).toBe("intake-beer-1");
  });

  it("intake record with no matching keywords creates no substance record", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 110);
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
          id: "intake-water-1",
          type: "water",
          amount: 500,
          timestamp: 1700000000000,
          source: "manual",
          note: "Plain glass of water",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(0);
  });

  it("intake record with caffeine keyword gets correct sourceRecordId linking", async () => {
    await db.close();
    await db.delete();

    const intakeId = "intake-latte-link-1";

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 110);
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
          id: intakeId,
          type: "water",
          amount: 350,
          timestamp: 1700000000000,
          source: "manual",
          note: "Large latte",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(1);
    expect(substances[0]!.sourceRecordId).toBe(intakeId);
    expect(substances[0]!.amountMg).toBe(95); // latte default
    expect(substances[0]!.volumeMl).toBe(350); // latte default volume
  });

  it("migrated records have aiEnriched=false (awaiting Pass 2)", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 110);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["intakeRecords"], "readwrite");
        const store = tx.objectStore("intakeRecords");
        store.add({
          id: "intake-espresso-1",
          type: "water",
          amount: 30,
          timestamp: 1700000000000,
          source: "manual",
          note: "Double espresso",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        store.add({
          id: "intake-wine-1",
          type: "water",
          amount: 150,
          timestamp: 1700001000000,
          source: "manual",
          note: "Glass of wine",
          createdAt: 1700001000000,
          updatedAt: 1700001000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "Europe/Berlin",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const substances = await db.substanceRecords.toArray();
    expect(substances).toHaveLength(2);
    for (const sub of substances) {
      expect(sub.aiEnriched).toBe(false);
    }
  });
});
