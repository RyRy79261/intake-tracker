import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { updateSyncedInsideTx, softDeleteInsideTx } from "@/lib/synced-update";
import { activatePhase, startNewPhase, updatePhase, deletePhase } from "@/lib/phase-service";
import { deletePrescription, updatePrescription } from "@/lib/prescription-service";
import { deleteSchedule, updateSchedule } from "@/lib/medication-schedule-service";
import {
  createTitrationPlan,
  updateTitrationPlan,
  activateTitrationPlan,
  completeTitrationPlan,
  cancelTitrationPlan,
  deleteTitrationPlan,
} from "@/lib/titration-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

// Every fixture row is stamped with this; a synced write must move past it.
const BASE_TS = 1700000000000;

/**
 * The server applies an upsert only when the pushed `updatedAt` is strictly
 * newer than its copy, so an enqueued row whose `updatedAt` never moved is a
 * write the server silently drops. Assert that for every queued op.
 */
async function expectEveryQueuedRowStamped() {
  const queue = await db._syncQueue.toArray();
  expect(queue.length).toBeGreaterThan(0);
  const stale: string[] = [];
  for (const q of queue) {
    const row = (await db.table(q.tableName).get(q.recordId)) as { updatedAt?: number } | undefined;
    if (!row || !(typeof row.updatedAt === "number" && row.updatedAt > BASE_TS)) {
      stale.push(`${q.tableName}:${q.recordId}:${q.op}`);
    }
  }
  expect(stale).toEqual([]);
}

async function seedRx() {
  const rx = makePrescription();
  const maint = makeMedicationPhase(rx.id, { status: "active" });
  const pending = makeMedicationPhase(rx.id, { status: "pending" });
  const sched = makePhaseSchedule(maint.id);
  const inv = makeInventoryItem(rx.id);
  const txn = makeInventoryTransaction(inv.id);
  const dose = makeDoseLog(rx.id, maint.id, sched.id);
  await db.prescriptions.add(rx);
  await db.medicationPhases.bulkAdd([maint, pending]);
  await db.phaseSchedules.add(sched);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(txn);
  await db.doseLogs.add(dose);
  return { rx, maint, pending, sched };
}

describe("updateSyncedInsideTx", () => {
  it("stamps updatedAt and enqueues the row in one step", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    await db.transaction("rw", [db.prescriptions, db._syncQueue], () =>
      updateSyncedInsideTx("prescriptions", rx.id, { notes: "x" }, { now: BASE_TS + 5 }),
    );

    const row = await db.prescriptions.get(rx.id);
    expect(row!.notes).toBe("x");
    expect(row!.updatedAt).toBe(BASE_TS + 5);
    const q = await db._syncQueue.toArray();
    expect(q.map((r) => [r.tableName, r.recordId, r.op])).toEqual([["prescriptions", rx.id, "upsert"]]);
  });
});

describe("softDeleteInsideTx", () => {
  it("tombstones, retires the lifecycle flag and enqueues a delete", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id, { status: "pending" });
    const sched = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(sched);

    await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.phaseSchedules, db._syncQueue], async () => {
      await softDeleteInsideTx("prescriptions", rx, BASE_TS + 9);
      await softDeleteInsideTx("medicationPhases", phase, BASE_TS + 9);
      await softDeleteInsideTx("phaseSchedules", sched, BASE_TS + 9);
    });

    const r = await db.prescriptions.get(rx.id);
    expect(r).toMatchObject({ deletedAt: BASE_TS + 9, updatedAt: BASE_TS + 9, isActive: false });
    expect(await db.medicationPhases.get(phase.id)).toMatchObject({ status: "cancelled" });
    expect(await db.phaseSchedules.get(sched.id)).toMatchObject({ enabled: false });
    const ops = (await db._syncQueue.toArray()).map((q) => q.op);
    expect(ops).toEqual(["delete", "delete", "delete"]);
  });
});

describe("every medication mutation stamps updatedAt on what it enqueues", () => {
  it("activatePhase", async () => {
    const { pending } = await seedRx();
    await activatePhase(pending.id);
    await expectEveryQueuedRowStamped();
  });

  it("startNewPhase (completes the running phase)", async () => {
    const { rx } = await seedRx();
    await startNewPhase({
      prescriptionId: rx.id,
      type: "maintenance",
      unit: "mg",
      startDate: Date.now() - 1000,
      foodInstruction: "none",
      schedules: [{ time: "09:00", daysOfWeek: [1], dosage: 10 }],
    });
    await expectEveryQueuedRowStamped();
  });

  it("updatePhase (fields + schedule add/update/remove)", async () => {
    const { maint, sched } = await seedRx();
    const extra = makePhaseSchedule(maint.id, { time: "20:00" });
    await db.phaseSchedules.add(extra);
    await updatePhase({
      id: maint.id,
      unit: "mcg",
      foodInstruction: "after",
      schedules: [
        { id: sched.id, time: "08:30", daysOfWeek: [1], dosage: 75 },
        { time: "12:00", daysOfWeek: [2], dosage: 5 },
      ],
    });
    await expectEveryQueuedRowStamped();
    expect((await db.medicationPhases.get(maint.id))!.unit).toBe("mcg");
  });

  it("deletePhase", async () => {
    const { maint } = await seedRx();
    await deletePhase(maint.id);
    await expectEveryQueuedRowStamped();
  });

  it("deletePrescription", async () => {
    const { rx } = await seedRx();
    await deletePrescription(rx.id);
    await expectEveryQueuedRowStamped();
  });

  it("updatePrescription", async () => {
    const { rx } = await seedRx();
    await updatePrescription(rx.id, { isActive: false });
    await expectEveryQueuedRowStamped();
  });

  it("updateSchedule / deleteSchedule", async () => {
    const { sched, maint } = await seedRx();
    const other = makePhaseSchedule(maint.id, { time: "21:00" });
    await db.phaseSchedules.add(other);
    await updateSchedule(sched.id, { dosage: 10 });
    await deleteSchedule(other.id);
    await expectEveryQueuedRowStamped();
  });

  it("titration plan lifecycle: create, edit, activate, complete", async () => {
    const { rx } = await seedRx();
    const plan = await createTitrationPlan({
      title: "t",
      conditionLabel: "c",
      entries: [{ prescriptionId: rx.id, unit: "mg", schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 100 }] }],
    });
    if (!plan.success) throw new Error("setup");
    await updateTitrationPlan({
      planId: plan.data.id,
      entries: [{ prescriptionId: rx.id, unit: "mg", schedules: [{ time: "09:00", daysOfWeek: [1, 2], dosage: 150 }] }],
    });
    await activateTitrationPlan(plan.data.id);
    await completeTitrationPlan(plan.data.id);
    await expectEveryQueuedRowStamped();
  });

  it("titration plan cancel and delete", async () => {
    const { rx } = await seedRx();
    const plan = await createTitrationPlan({
      title: "t",
      conditionLabel: "c",
      startImmediately: true,
      entries: [{ prescriptionId: rx.id, unit: "mg", schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 100 }] }],
    });
    if (!plan.success) throw new Error("setup");
    await cancelTitrationPlan(plan.data.id);
    await deleteTitrationPlan(plan.data.id);
    await expectEveryQueuedRowStamped();
  });
});
