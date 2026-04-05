import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

describe("v11 migration: timezone backfill", () => {
  it("backfills timezone field on existing DoseLog records", async () => {
    await db.close();
    await db.delete();

    // Seed a v10-style database using raw IDB (Dexie v10 = IDB version 100)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 100);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("doseLogs")) {
          rawDb.createObjectStore("doseLogs", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["doseLogs", "intakeRecords"], "readwrite");
        // Add a DoseLog WITHOUT timezone field (pre-v11)
        tx.objectStore("doseLogs").add({
          id: "dose-v10-1",
          prescriptionId: "rx-1",
          phaseId: "phase-1",
          scheduleId: "sched-1",
          scheduledDate: "2026-01-15",
          scheduledTime: "08:00",
          status: "taken",
          actionTimestamp: 1736946000000, // 2025-01-15 ~12:00 UTC
          createdAt: 1736946000000,
          updatedAt: 1736946000000,
          deletedAt: null,
          deviceId: "test-device",
        });
        // Add an intakeRecord WITHOUT timezone
        tx.objectStore("intakeRecords").add({
          id: "intake-v10-1",
          type: "water",
          amount: 250,
          timestamp: 1736946000000,
          source: "manual",
          createdAt: 1736946000000,
          updatedAt: 1736946000000,
          deletedAt: null,
          deviceId: "test-device",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v11 upgrade (and v12, v13, v14)
    await db.open();

    const doseLog = await db.doseLogs.get("dose-v10-1");
    expect(doseLog).toBeDefined();
    expect(doseLog!.timezone).toBeDefined();
    expect(typeof doseLog!.timezone).toBe("string");
    // Timestamp 1736946000000 is 2025-01-15 which is before 2026-02-12
    // so timezone should be "Africa/Johannesburg"
    expect(doseLog!.timezone).toBe("Africa/Johannesburg");

    const intake = await db.intakeRecords.get("intake-v10-1");
    expect(intake).toBeDefined();
    expect(intake!.timezone).toBeDefined();
    expect(intake!.timezone).toBe("Africa/Johannesburg");
  });

  it("preserves all existing data fields after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 100);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("doseLogs")) {
          rawDb.createObjectStore("doseLogs", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["doseLogs"], "readwrite");
        tx.objectStore("doseLogs").add({
          id: "dose-preserve-1",
          prescriptionId: "rx-p1",
          phaseId: "phase-p1",
          scheduleId: "sched-p1",
          scheduledDate: "2026-03-01",
          scheduledTime: "09:00",
          status: "pending",
          createdAt: 1740787200000, // 2025-02-28
          updatedAt: 1740787200000,
          deletedAt: null,
          deviceId: "dev-1",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const log = await db.doseLogs.get("dose-preserve-1");
    expect(log).toBeDefined();
    expect(log!.prescriptionId).toBe("rx-p1");
    expect(log!.scheduledDate).toBe("2026-03-01");
    expect(log!.status).toBe("pending");
    expect(log!.deletedAt).toBeNull();
  });
});
