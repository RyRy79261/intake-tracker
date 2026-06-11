import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
  makeDailyNote,
  makeAuditLog,
} from "@/__tests__/fixtures/db-fixtures";

describe("SCHM-04: sync-readiness fields", () => {
  it("intakeRecord can be stored and retrieved with all sync fields", async () => {
    const record = makeIntakeRecord({ id: "test-intake-1" });
    await db.intakeRecords.add(record);
    const retrieved = await db.intakeRecords.get("test-intake-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.createdAt).toBeTypeOf("number");
    expect(retrieved!.updatedAt).toBeTypeOf("number");
    expect(retrieved!.deletedAt).toBeNull();
    expect(retrieved!.deviceId).toBeTypeOf("string");
  });

  it("prescription can be stored with all sync fields", async () => {
    const rx = makePrescription({ id: "test-rx-1" });
    await db.prescriptions.add(rx);
    const retrieved = await db.prescriptions.get("test-rx-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.createdAt).toBeTypeOf("number");
    expect(retrieved!.updatedAt).toBeTypeOf("number");
    expect(retrieved!.deletedAt).toBeNull();
    expect(retrieved!.deviceId).toBeTypeOf("string");
  });

  it("doseLog has timezone field available", async () => {
    const rx = makePrescription({ id: "rx-tz-1" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-tz-1" });
    const schedule = makePhaseSchedule(phase.id, { id: "sched-tz-1" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      id: "dose-tz-1",
      timezone: "Africa/Johannesburg",
    });
    await db.doseLogs.add(log);
    const retrieved = await db.doseLogs.get("dose-tz-1");
    expect(retrieved!.timezone).toBe("Africa/Johannesburg");
  });

  it("inventoryTransaction has doseLogId field available", async () => {
    const rx = makePrescription({ id: "rx-txn-1" });
    const item = makeInventoryItem(rx.id, { id: "item-txn-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const txn = makeInventoryTransaction(item.id, {
      id: "txn-1",
      type: "consumed",
      doseLogId: "dose-ref-123",
    });
    await db.inventoryTransactions.add(txn);
    const retrieved = await db.inventoryTransactions.get("txn-1");
    expect(retrieved!.doseLogId).toBe("dose-ref-123");
  });
});

describe("SCHM-03: event-sourced inventory", () => {
  it("inventoryItem can be stored without currentStock field", async () => {
    const rx = makePrescription({ id: "rx-stock-1" });
    const item = makeInventoryItem(rx.id, { id: "item-stock-1" });
    // Ensure currentStock is not set
    const { currentStock, ...itemWithoutStock } = item as any;
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(itemWithoutStock);
    const retrieved = await db.inventoryItems.get("item-stock-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.currentStock).toBeUndefined();
  });

  it("computed stock equals sum of all transactions for an item", async () => {
    const rx = makePrescription({ id: "rx-sum-1" });
    const item = makeInventoryItem(rx.id, { id: "item-sum-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { id: "txn-init", type: "initial", amount: 30 }),
      makeInventoryTransaction(item.id, { id: "txn-refill", type: "refill", amount: 28 }),
      makeInventoryTransaction(item.id, { id: "txn-consume-1", type: "consumed", amount: 1 }),
      makeInventoryTransaction(item.id, { id: "txn-consume-2", type: "consumed", amount: 1 }),
    ]);

    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(item.id)
      .toArray();

    const computedStock = transactions.reduce((sum, tx) => {
      if (tx.type === "consumed") return sum - tx.amount;
      return sum + tx.amount;
    }, 0);

    expect(computedStock).toBe(56); // 30 + 28 - 1 - 1
  });

  it("initial transaction type is accepted by the schema", async () => {
    const rx = makePrescription({ id: "rx-init-type-1" });
    const item = makeInventoryItem(rx.id, { id: "item-init-type-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const txn = makeInventoryTransaction(item.id, { type: "initial", amount: 100 });
    await expect(db.inventoryTransactions.add(txn)).resolves.toBeDefined();
  });

  it("consumed transaction linked to doseLogId is queryable", async () => {
    const rx = makePrescription({ id: "rx-link-1" });
    const item = makeInventoryItem(rx.id, { id: "item-link-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const doseLogId = "dose-link-ref-1";
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "consumed", amount: 1, doseLogId })
    );
    const all = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(item.id)
      .toArray();
    const linked = all.find((tx) => tx.doseLogId === doseLogId);
    expect(linked).toBeDefined();
    expect(linked!.type).toBe("consumed");
  });
});

describe("SCHM-01: compound indexes are queryable", () => {
  it("[type+timestamp] on intakeRecords supports range queries", async () => {
    const base = 1700000000000;
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ id: "r1", type: "water", timestamp: base + 1000, amount: 250 }),
      makeIntakeRecord({ id: "r2", type: "water", timestamp: base + 2000, amount: 500 }),
      makeIntakeRecord({ id: "r3", type: "salt", timestamp: base + 1500, amount: 100 }),
      makeIntakeRecord({ id: "r4", type: "water", timestamp: base + 3000, amount: 300 }),
    ]);

    // Query water records in a timestamp range using the compound index
    const waterInRange = await db.intakeRecords
      .where("[type+timestamp]")
      .between(["water", base + 1000], ["water", base + 2500], true, true)
      .toArray();

    expect(waterInRange).toHaveLength(2);
    expect(waterInRange.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    // r3 is salt (excluded), r4 is outside range (excluded)
  });

  it("[prescriptionId+scheduledDate] on doseLogs supports per-prescription date queries", async () => {
    const rx = makePrescription({ id: "rx-dl-1" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-dl-1" });
    const schedule = makePhaseSchedule(phase.id, { id: "sched-dl-1" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    await db.doseLogs.bulkAdd([
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "dl-1", scheduledDate: "2023-11-13" }),
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "dl-2", scheduledDate: "2023-11-14" }),
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "dl-3", scheduledDate: "2023-11-15" }),
    ]);

    // Query dose logs for this prescription within a date range
    const inRange = await db.doseLogs
      .where("[prescriptionId+scheduledDate]")
      .between([rx.id, "2023-11-13"], [rx.id, "2023-11-14"], true, true)
      .toArray();

    expect(inRange).toHaveLength(2);
    expect(inRange.map((d) => d.id).sort()).toEqual(["dl-1", "dl-2"]);
  });

  it("[inventoryItemId+timestamp] on inventoryTransactions supports per-item time queries", async () => {
    const rx = makePrescription({ id: "rx-txn-idx-1" });
    const item = makeInventoryItem(rx.id, { id: "item-txn-idx-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const base = 1700000000000;
    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { id: "t1", timestamp: base + 1000, type: "initial", amount: 30 }),
      makeInventoryTransaction(item.id, { id: "t2", timestamp: base + 2000, type: "consumed", amount: 1 }),
      makeInventoryTransaction(item.id, { id: "t3", timestamp: base + 3000, type: "consumed", amount: 1 }),
    ]);

    const recent = await db.inventoryTransactions
      .where("[inventoryItemId+timestamp]")
      .between([item.id, base + 1500], [item.id, base + 3000], true, true)
      .toArray();

    expect(recent).toHaveLength(2); // t2 and t3
    expect(recent.map((t) => t.id).sort()).toEqual(["t2", "t3"]);
  });
});

describe("SCHM-02: v10 upgrade migrates currentStock to initial transaction", () => {
  it("creates initial transaction from legacy currentStock during upgrade", async () => {
    // Close the clean v10 db opened by beforeEach
    await db.close();
    await db.delete();

    // Seed a v9-style database using raw IDB
    // We open at version 9 (Dexie doesn't interfere when we use raw IDBFactory)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 9);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        // Create the v9 stores manually
        if (!rawDb.objectStoreNames.contains("inventoryItems")) {
          rawDb.createObjectStore("inventoryItems", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("inventoryTransactions")) {
          rawDb.createObjectStore("inventoryTransactions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["inventoryItems"], "readwrite");
        const store = tx.objectStore("inventoryItems");
        // Insert a legacy inventory item with currentStock
        store.add({
          id: "legacy-item-1",
          prescriptionId: "legacy-rx-1",
          brandName: "TestBrand",
          currentStock: 42,
          strength: 50,
          unit: "mg",
          pillShape: "round",
          pillColor: "#FFFFFF",
          isActive: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        });
        tx.oncomplete = () => {
          rawDb.close();
          resolve();
        };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    // Now open via db.ts — this triggers the v10 upgrade
    await db.open();

    // Assert: an "initial" transaction was created for the legacy item
    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals("legacy-item-1")
      .toArray();

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.type).toBe("initial");
    expect(transactions[0]!.amount).toBe(42);

    // Assert: the legacy item still exists (not deleted)
    const item = await db.inventoryItems.get("legacy-item-1");
    expect(item).toBeDefined();
  });

  it("does not create initial transaction for item with currentStock of 0", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 9);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("inventoryItems")) {
          rawDb.createObjectStore("inventoryItems", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("inventoryTransactions")) {
          rawDb.createObjectStore("inventoryTransactions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["inventoryItems"], "readwrite");
        tx.objectStore("inventoryItems").add({
          id: "empty-item-1",
          prescriptionId: "rx-2",
          brandName: "EmptyBrand",
          currentStock: 0,
          strength: 10,
          unit: "mg",
          pillShape: "oval",
          pillColor: "#FF0000",
          isActive: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals("empty-item-1")
      .toArray();

    expect(transactions).toHaveLength(0);
  });

  it("backfills deletedAt: null on records that lack the field", async () => {
    await db.close();
    await db.delete();

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("IntakeTrackerDB", 9);
      request.onupgradeneeded = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        if (!rawDb.objectStoreNames.contains("intakeRecords")) {
          rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("inventoryItems")) {
          rawDb.createObjectStore("inventoryItems", { keyPath: "id" });
        }
        if (!rawDb.objectStoreNames.contains("inventoryTransactions")) {
          rawDb.createObjectStore("inventoryTransactions", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        const rawDb = (event.target as IDBOpenDBRequest).result;
        const tx = rawDb.transaction(["intakeRecords"], "readwrite");
        // Insert record WITHOUT deletedAt field
        tx.objectStore("intakeRecords").add({
          id: "old-record-no-deleted-at",
          type: "water",
          amount: 250,
          timestamp: 1700000000000,
          source: "manual",
        });
        tx.oncomplete = () => { rawDb.close(); resolve(); };
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

    await db.open();

    const record = await db.intakeRecords.get("old-record-no-deleted-at");
    expect(record).toBeDefined();
    expect(record!.deletedAt).toBeNull(); // must be null, NOT undefined
  });
});

describe("SCHM-02: existing records survive upgrade intact", () => {
  it("all health record tables are writable and readable in v10", async () => {
    // Write one record per table and verify round-trip
    const rx = makePrescription({ id: "integrity-rx-1" });
    const phase = makeMedicationPhase(rx.id, { id: "integrity-phase-1" });
    const schedule = makePhaseSchedule(phase.id, { id: "integrity-sched-1" });
    const item = makeInventoryItem(rx.id, { id: "integrity-item-1" });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(item);

    await db.intakeRecords.add(makeIntakeRecord({ id: "integrity-intake-1" }));
    await db.weightRecords.add(makeWeightRecord({ id: "integrity-weight-1" }));
    await db.bloodPressureRecords.add(makeBloodPressureRecord({ id: "integrity-bp-1" }));
    await db.eatingRecords.add(makeEatingRecord({ id: "integrity-eating-1" }));
    await db.urinationRecords.add(makeUrinationRecord({ id: "integrity-urination-1" }));
    await db.defecationRecords.add(makeDefecationRecord({ id: "integrity-defecation-1" }));
    await db.dailyNotes.add(makeDailyNote({ id: "integrity-note-1" }));
    await db.auditLogs.add(makeAuditLog({ id: "integrity-audit-1" }));

    // Verify all records are retrievable
    expect(await db.prescriptions.get("integrity-rx-1")).toBeDefined();
    expect(await db.medicationPhases.get("integrity-phase-1")).toBeDefined();
    expect(await db.phaseSchedules.get("integrity-sched-1")).toBeDefined();
    expect(await db.inventoryItems.get("integrity-item-1")).toBeDefined();
    expect(await db.intakeRecords.get("integrity-intake-1")).toBeDefined();
    expect(await db.weightRecords.get("integrity-weight-1")).toBeDefined();
    expect(await db.bloodPressureRecords.get("integrity-bp-1")).toBeDefined();
    expect(await db.eatingRecords.get("integrity-eating-1")).toBeDefined();
    expect(await db.urinationRecords.get("integrity-urination-1")).toBeDefined();
    expect(await db.defecationRecords.get("integrity-defecation-1")).toBeDefined();
    expect(await db.dailyNotes.get("integrity-note-1")).toBeDefined();
    expect(await db.auditLogs.get("integrity-audit-1")).toBeDefined();
  });
});
