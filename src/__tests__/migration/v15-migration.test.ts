import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeEatingRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";

describe("v15 migration: groupId index on intakeRecords, eatingRecords, substanceRecords", () => {
  it("existing v14 intakeRecords survive v15 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    // Seed at v14 level (IDB version 140)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
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
          id: "intake-v14-1",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "manual",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "UTC",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v15 upgrade
    await db.open();

    const record = await db.intakeRecords.get("intake-v14-1");
    expect(record).toBeDefined();
    expect(record!.type).toBe("water");
    expect(record!.amount).toBe(250);
    expect(record!.timestamp).toBe(1700000000000);
    expect(record!.source).toBe("manual");
    expect(record!.deletedAt).toBeNull();
  });

  it("existing v14 eatingRecords survive v15 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("eatingRecords")) {
          rawDb.createObjectStore("eatingRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["eatingRecords"], "readwrite");
        tx.objectStore("eatingRecords").add({
          id: "eating-v14-1",
          timestamp: 1700000000000,
          grams: 300,
          note: "Lunch",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "UTC",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const record = await db.eatingRecords.get("eating-v14-1");
    expect(record).toBeDefined();
    expect(record!.timestamp).toBe(1700000000000);
    expect(record!.grams).toBe(300);
    expect(record!.note).toBe("Lunch");
  });

  it("existing v14 substanceRecords survive v15 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("substanceRecords")) {
          rawDb.createObjectStore("substanceRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["substanceRecords"], "readwrite");
        tx.objectStore("substanceRecords").add({
          id: "substance-v14-1",
          type: "caffeine",
          amountMg: 95,
          description: "Morning coffee",
          source: "standalone",
          aiEnriched: false,
          timestamp: 1700000000000,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "UTC",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const record = await db.substanceRecords.get("substance-v14-1");
    expect(record).toBeDefined();
    expect(record!.type).toBe("caffeine");
    expect(record!.amountMg).toBe(95);
    expect(record!.description).toBe("Morning coffee");
  });

  it("groupId index is queryable on intakeRecords after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        (event.target as IDBOpenDBRequest).result.close();
        resolve();
      };
      request.onerror = reject;
    });

    await db.open();

    // groupId index should be queryable (returns empty array, no error)
    const results = await db.intakeRecords.where("groupId").equals("test-group").toArray();
    expect(results).toHaveLength(0);
  });

  it("groupId index is queryable on eatingRecords after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("eatingRecords")) {
          rawDb.createObjectStore("eatingRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        (event.target as IDBOpenDBRequest).result.close();
        resolve();
      };
      request.onerror = reject;
    });

    await db.open();

    const results = await db.eatingRecords.where("groupId").equals("test-group").toArray();
    expect(results).toHaveLength(0);
  });

  it("groupId index is queryable on substanceRecords after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 140);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("substanceRecords")) {
          rawDb.createObjectStore("substanceRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        (event.target as IDBOpenDBRequest).result.close();
        resolve();
      };
      request.onerror = reject;
    });

    await db.open();

    const results = await db.substanceRecords.where("groupId").equals("test-group").toArray();
    expect(results).toHaveLength(0);
  });

  it("records without groupId are not returned by groupId index queries", async () => {
    // Add records without groupId, verify they are excluded from groupId queries
    const record = makeIntakeRecord({ id: "no-group-1" });
    await db.intakeRecords.add(record);

    const results = await db.intakeRecords.where("groupId").equals("any-group").toArray();
    expect(results).toHaveLength(0);

    // Verify the record itself exists
    const exists = await db.intakeRecords.get("no-group-1");
    expect(exists).toBeDefined();
  });

  it("can add a new record WITH groupId and query it back via the index", async () => {
    const record = makeIntakeRecord({
      id: "grouped-1",
      groupId: "grp-1",
      originalInputText: "200ml coffee",
      groupSource: "ai_food_parse",
    });
    await db.intakeRecords.add(record);

    const results = await db.intakeRecords.where("groupId").equals("grp-1").toArray();
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("grouped-1");
    expect(results[0]!.groupId).toBe("grp-1");
    expect(results[0]!.originalInputText).toBe("200ml coffee");
    expect(results[0]!.groupSource).toBe("ai_food_parse");
  });
});
