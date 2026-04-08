import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

// D-13: Dexie v16 migration test
// v16 adds compound-level fields (drugClass, mechanismOfAction, pillShape,
// pillDescription, visualIdentification) to prescriptions. No upgrade()
// function — existing prescriptions survive with all original data intact
// because no schema change removes or transforms existing fields.
//
// Pattern: seed at IDB version 150 (Dexie v15), open via db.ts to trigger
// v16 upgrade (IDB 160), verify data survives.

describe("v16 migration: compound fields added to Prescription (D-13)", () => {
  it("existing v15 prescription survives v16 upgrade with all data intact", async () => {
    await db.close();
    await db.delete();

    // Seed at v15 level (IDB version 150)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 150);
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
          id: "rx-v15-1",
          genericName: "Carvedilol",
          indication: "Heart failure",
          notes: "Take with food",
          contraindications: ["asthma"],
          warnings: ["dizziness"],
          isActive: true,
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

    // Open via db.ts — triggers v16 upgrade (IDB 160)
    await db.open();

    const record = await db.prescriptions.get("rx-v15-1");
    expect(record).toBeDefined();
    expect(record!.genericName).toBe("Carvedilol");
    expect(record!.indication).toBe("Heart failure");
    expect(record!.notes).toBe("Take with food");
    expect(record!.contraindications).toEqual(["asthma"]);
    expect(record!.warnings).toEqual(["dizziness"]);
    expect(record!.isActive).toBe(true);
    expect(record!.createdAt).toBe(1700000000000);
    expect(record!.deletedAt).toBeNull();
    expect(record!.deviceId).toBe("test-device");
  });

  it("new prescription with compound fields can be written and read after v16 upgrade", async () => {
    await db.close();
    await db.delete();
    await db.open();

    await db.prescriptions.add({
      id: "rx-v16-compound",
      genericName: "Metoprolol",
      indication: "Hypertension",
      isActive: true,
      drugClass: "Beta-blocker",
      mechanismOfAction: "Blocks beta-1 adrenergic receptors to reduce heart rate and blood pressure",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      deviceId: "test-device",
      timezone: "UTC",
    });

    const record = await db.prescriptions.get("rx-v16-compound");
    expect(record).toBeDefined();
    expect(record!.genericName).toBe("Metoprolol");
    expect(record!.drugClass).toBe("Beta-blocker");
    expect(record!.mechanismOfAction).toBe(
      "Blocks beta-1 adrenergic receptors to reduce heart rate and blood pressure"
    );
  });

  it("v15 prescription without compound fields returns undefined for new optional fields", async () => {
    await db.close();
    await db.delete();

    // Seed at v15 without any compound fields
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 150);
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
          id: "rx-v15-no-compound",
          genericName: "Lisinopril",
          indication: "Hypertension",
          isActive: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test-device",
          timezone: "UTC",
          // no drugClass, mechanismOfAction, pillShape, pillDescription, visualIdentification
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const record = await db.prescriptions.get("rx-v15-no-compound");
    expect(record).toBeDefined();
    expect(record!.genericName).toBe("Lisinopril");
    // New optional fields are absent (undefined) — no migration error
    expect(record!.drugClass).toBeUndefined();
    expect(record!.mechanismOfAction).toBeUndefined();
  });
});
