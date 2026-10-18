import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
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

describe("medication deletes retire what they tombstone", () => {
  it("deletePrescription queues deletes and switches every row off", async () => {
    const { rx, maint, pending, sched } = await seedRx();
    await deletePrescription(rx.id);

    expect(await db.prescriptions.get(rx.id)).toMatchObject({ isActive: false });
    expect((await db.prescriptions.get(rx.id))!.deletedAt).toBeTypeOf("number");
    expect((await db.medicationPhases.get(maint.id))!.status).toBe("cancelled");
    expect((await db.medicationPhases.get(pending.id))!.status).toBe("cancelled");
    expect((await db.phaseSchedules.get(sched.id))!.enabled).toBe(false);
    const ops = (await db._syncQueue.toArray())
      .filter((q) => q.tableName !== "auditLogs")
      .map((q) => q.op);
    expect(ops.length).toBeGreaterThan(0);
    expect(new Set(ops)).toEqual(new Set(["delete"]));
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
