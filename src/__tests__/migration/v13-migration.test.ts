import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

describe("v13 migration: createdAt index on prescriptions", () => {
  it("allows orderBy createdAt on prescriptions after upgrade", async () => {
    await db.close();
    await db.delete();

    // Seed at v12 level (IDB version 120)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 120);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("prescriptions")) {
          rawDb.createObjectStore("prescriptions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["prescriptions"], "readwrite");
        const store = tx.objectStore("prescriptions");
        store.add({
          id: "rx-old",
          genericName: "Metoprolol",
          isActive: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test",
        });
        store.add({
          id: "rx-new",
          genericName: "Amlodipine",
          isActive: true,
          createdAt: 1700100000000,
          updatedAt: 1700100000000,
          deletedAt: null,
          deviceId: "test",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v13 + v14 upgrades
    await db.open();

    // Verify createdAt index works (orderBy requires an index in Dexie)
    const ordered = await db.prescriptions.orderBy("createdAt").toArray();
    expect(ordered).toHaveLength(2);
    expect(ordered[0].id).toBe("rx-old");
    expect(ordered[1].id).toBe("rx-new");
  });

  it("preserves existing prescription data after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 120);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("prescriptions")) {
          rawDb.createObjectStore("prescriptions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["prescriptions"], "readwrite");
        tx.objectStore("prescriptions").add({
          id: "rx-preserve",
          genericName: "Lisinopril",
          indication: "Hypertension",
          isActive: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "dev-1",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const rx = await db.prescriptions.get("rx-preserve");
    expect(rx).toBeDefined();
    expect(rx!.genericName).toBe("Lisinopril");
    expect(rx!.indication).toBe("Hypertension");
    expect(rx!.isActive).toBe(true);
  });
});
