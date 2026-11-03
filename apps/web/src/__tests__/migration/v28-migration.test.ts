import { describe, it, expect, afterEach } from "vitest";
import { db, DB_SCHEMA_VERSION } from "@/lib/db";

/**
 * v28 adds the journalEntries store (the medical journal). It migrates no
 * data: a device on v27 keeps every row and gains an empty journal.
 */

/** Seed a v27 database (IDB version 270) with one intake row. */
async function seedAtV27(): Promise<void> {
  await db.close();
  await db.delete();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("IntakeTrackerDB", 270);
    request.onupgradeneeded = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
    };
    request.onsuccess = (event) => {
      const rawDb = (event.target as IDBOpenDBRequest).result;
      const tx = rawDb.transaction(["intakeRecords"], "readwrite");
      tx.objectStore("intakeRecords").add({
        id: "water-1",
        type: "water",
        amount: 250,
        timestamp: 1_700_000_000_000,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        deletedAt: null,
        deviceId: "test-device",
        timezone: "Europe/Berlin",
      });
      tx.oncomplete = () => {
        rawDb.close();
        resolve();
      };
      tx.onerror = reject;
    };
    request.onerror = reject;
  });

  await db.open();
}

afterEach(async () => {
  await db.close();
  await db.delete();
  await db.open();
});

describe("v28 schema", () => {
  it("is the current version", () => {
    expect(DB_SCHEMA_VERSION).toBe(28);
    expect(db.verno).toBe(28);
  });

  it("indexes journalEntries by timestamp and updatedAt", () => {
    const names = db.journalEntries.schema.indexes.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["timestamp", "updatedAt"]));
  });
});

describe("v28 migration", () => {
  it("keeps existing rows and adds an empty journal", async () => {
    await seedAtV27();
    expect(await db.intakeRecords.get("water-1")).toMatchObject({ amount: 250 });
    expect(await db.journalEntries.count()).toBe(0);
  });
});
