import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  addPrescription,
  deletePrescription,
  getActivePrescriptions,
  getInactivePrescriptions,
  type CreatePrescriptionInput,
} from "@/lib/prescription-service";
import { getActivePhaseForPrescription } from "@/lib/phase-service";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function auditsByAction(action: string) {
  const all = await db.auditLogs.toArray();
  return all.filter((a) => a.action === action);
}

async function syncRowsFor(tableName: string, recordId: string) {
  return db._syncQueue
    .where("[tableName+recordId]")
    .equals([tableName, recordId])
    .toArray();
}

function makeInput(overrides?: Partial<CreatePrescriptionInput>): CreatePrescriptionInput {
  return {
    genericName: "Metoprolol",
    indication: "Hypertension",
    unit: "mg",
    foodInstruction: "none",
    brandName: "Lopressor",
    currentStock: 30,
    strength: 50,
    pillShape: "round",
    pillColor: "#FFFFFF",
    schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 50 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addPrescription — transactional fan-out
// ---------------------------------------------------------------------------

describe("addPrescription", () => {
  it("creates prescription, phase, schedules, inventory and an initial stock transaction when stock > 0", async () => {
    const result = await addPrescription(makeInput({ currentStock: 30 }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { prescription, phase, inventory, schedules } = result.data;
    expect(await db.prescriptions.get(prescription.id)).toBeDefined();
    expect(phase).not.toBeNull();
    expect(await db.medicationPhases.get(phase!.id)).toBeDefined();
    expect(await db.inventoryItems.get(inventory.id)).toBeDefined();
    expect(schedules).toHaveLength(1);

    const txns = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inventory.id)
      .toArray();
    expect(txns).toHaveLength(1);
    expect(txns[0]!.type).toBe("initial");
    expect(txns[0]!.amount).toBe(30);
  });

  it("does NOT create an inventory transaction when currentStock is 0", async () => {
    const result = await addPrescription(makeInput({ currentStock: 0 }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const txns = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(result.data.inventory.id)
      .toArray();
    expect(txns).toHaveLength(0);
  });

  it("shares one timestamp across all fanned-out writes (createdAt parity)", async () => {
    const result = await addPrescription(makeInput({ currentStock: 30 }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { prescription, phase, inventory, schedules } = result.data;
    const txns = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inventory.id)
      .toArray();

    const ts = prescription.createdAt;
    expect(phase!.createdAt).toBe(ts);
    expect(inventory.createdAt).toBe(ts);
    expect(schedules[0]!.createdAt).toBe(ts);
    expect(txns[0]!.createdAt).toBe(ts);
    expect(txns[0]!.timestamp).toBe(ts);
  });

  it("enqueues sync upserts for every written row plus the audit", async () => {
    const result = await addPrescription(makeInput({ currentStock: 30 }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { prescription, phase, inventory, schedules } = result.data;

    expect((await syncRowsFor("prescriptions", prescription.id))[0]!.op).toBe("upsert");
    expect((await syncRowsFor("medicationPhases", phase!.id))[0]!.op).toBe("upsert");
    expect((await syncRowsFor("inventoryItems", inventory.id))[0]!.op).toBe("upsert");
    expect((await syncRowsFor("phaseSchedules", schedules[0]!.id))[0]!.op).toBe("upsert");

    const added = await auditsByAction("prescription_added");
    expect(added).toHaveLength(1);
    expect((await syncRowsFor("auditLogs", added[0]!.id))[0]!.op).toBe("upsert");
  });

  it("creates no phase or schedules for a PRN med (empty schedule list)", async () => {
    const result = await addPrescription(makeInput({ schedules: [] }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.phase).toBeNull();
    expect(result.data.schedules).toHaveLength(0);
    const phases = await db.medicationPhases
      .where("prescriptionId")
      .equals(result.data.prescription.id)
      .toArray();
    expect(phases).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deletePrescription — cascade across coupled tables
// ---------------------------------------------------------------------------

describe("deletePrescription", () => {
  it("cascades: soft-deletes rx/phases/schedules/inventory, dose logs + inventory txns", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    const inv = makeInventoryItem(rx.id);
    const txn = makeInventoryTransaction(inv.id);
    const dose = makeDoseLog(rx.id, phase.id, schedule.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);
    await db.inventoryTransactions.add(txn);
    await db.doseLogs.add(dose);

    const result = await deletePrescription(rx.id);
    expect(result.success).toBe(true);

    // Soft-deleted: row remains but deletedAt is set.
    expect((await db.prescriptions.get(rx.id))!.deletedAt).not.toBeNull();
    expect((await db.medicationPhases.get(phase.id))!.deletedAt).not.toBeNull();
    expect((await db.phaseSchedules.get(schedule.id))!.deletedAt).not.toBeNull();
    expect((await db.inventoryItems.get(inv.id))!.deletedAt).not.toBeNull();

    // History rows are tombstoned too (a hard delete never reaches the
    // server, which would keep them live forever).
    expect((await db.doseLogs.get(dose.id))!.deletedAt).not.toBeNull();
    expect((await db.inventoryTransactions.get(txn.id))!.deletedAt).not.toBeNull();
    expect((await syncRowsFor("doseLogs", dose.id))[0]!.op).toBe("delete");
    expect((await syncRowsFor("inventoryTransactions", txn.id))[0]!.op).toBe("delete");
  });

  it("retires the lifecycle flags so no reader keeps treating it as live", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id, { status: "active" });
    const schedule = makePhaseSchedule(phase.id);
    const inv = makeInventoryItem(rx.id, { isActive: true });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);

    await deletePrescription(rx.id);

    expect((await db.prescriptions.get(rx.id))!.isActive).toBe(false);
    expect((await db.medicationPhases.get(phase.id))!.status).toBe("cancelled");
    expect((await db.phaseSchedules.get(schedule.id))!.enabled).toBe(false);
    expect((await db.inventoryItems.get(inv.id))!.isActive).toBe(false);

    expect(await getActivePrescriptions()).toHaveLength(0);
    expect(await getInactivePrescriptions()).toHaveLength(0);
    expect(await getActivePhaseForPrescription(rx.id)).toBeUndefined();
    expect(await getDailyDoseSchedule("2023-11-14", "UTC")).toHaveLength(0);
  });

  it("keeps a completed phase's status (only running/pending phases are cancelled)", async () => {
    const rx = makePrescription();
    const done = makeMedicationPhase(rx.id, { status: "completed" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(done);

    await deletePrescription(rx.id);

    expect((await db.medicationPhases.get(done.id))!.status).toBe("completed");
  });

  it("enqueues delete ops for cascaded soft-deleted tables + a prescription_deleted audit", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    const inv = makeInventoryItem(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);

    await deletePrescription(rx.id);

    expect((await syncRowsFor("prescriptions", rx.id))[0]!.op).toBe("delete");
    expect((await syncRowsFor("medicationPhases", phase.id))[0]!.op).toBe("delete");
    expect((await syncRowsFor("phaseSchedules", schedule.id))[0]!.op).toBe("delete");
    expect((await syncRowsFor("inventoryItems", inv.id))[0]!.op).toBe("delete");

    expect(await auditsByAction("prescription_deleted")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Reads — tombstones are never live, active or inactive
// ---------------------------------------------------------------------------

describe("prescription reads", () => {
  it("active/inactive lists skip soft-deleted rows even when their flag is stale", async () => {
    const live = makePrescription({ isActive: true });
    const paused = makePrescription({ isActive: false });
    // Tombstone written by an older client: deletedAt set, isActive left true.
    const ghost = makePrescription({ isActive: true, deletedAt: 1700000000001 });
    const pausedGhost = makePrescription({ isActive: false, deletedAt: 1700000000001 });
    await db.prescriptions.bulkAdd([live, paused, ghost, pausedGhost]);

    expect((await getActivePrescriptions()).map((p) => p.id)).toEqual([live.id]);
    expect((await getInactivePrescriptions()).map((p) => p.id)).toEqual([paused.id]);
  });
});
