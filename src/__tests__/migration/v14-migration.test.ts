import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeTitrationPlan } from "@/__tests__/fixtures/db-fixtures";

describe("v14 migration: titrationPlans table", () => {
  it("titrationPlans table is accessible after upgrade from v13", async () => {
    await db.close();
    await db.delete();

    // Seed at v13 level (IDB version 130)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 130);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("prescriptions")) {
          rawDb.createObjectStore("prescriptions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        rawDb.close();
        resolve();
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v14 upgrade
    await db.open();

    // Verify the titrationPlans table exists and is writable
    const plan = makeTitrationPlan({ id: "tp-1", title: "BP Titration", conditionLabel: "Hypertension" });
    await db.titrationPlans.add(plan);

    const retrieved = await db.titrationPlans.get("tp-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe("BP Titration");
    expect(retrieved!.conditionLabel).toBe("Hypertension");
    expect(retrieved!.status).toBe("planned");
  });

  it("medicationPhases gains titrationPlanId index after upgrade", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 130);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("medicationPhases")) {
          rawDb.createObjectStore("medicationPhases", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("prescriptions")) {
          rawDb.createObjectStore("prescriptions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["medicationPhases"], "readwrite");
        tx.objectStore("medicationPhases").add({
          id: "phase-tp-1",
          prescriptionId: "rx-1",
          type: "titration",
          unit: "mg",
          startDate: 1700000000000,
          status: "active",
          foodInstruction: "none",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          deletedAt: null,
          deviceId: "test",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Open via db.ts -- triggers v14 upgrade
    await db.open();

    // Verify existing phase data preserved
    const phase = await db.medicationPhases.get("phase-tp-1");
    expect(phase).toBeDefined();
    expect(phase!.prescriptionId).toBe("rx-1");
    expect(phase!.type).toBe("titration");

    // Verify titrationPlanId index is queryable (even if undefined on existing records)
    const byPlan = await db.medicationPhases.where("titrationPlanId").equals("tp-999").toArray();
    expect(byPlan).toHaveLength(0); // no matches, but query works without error
  });
});
