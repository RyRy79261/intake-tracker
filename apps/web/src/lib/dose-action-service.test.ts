import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { logPrnDose, takeDose } from "@/lib/dose-log-service";
import {
  getDoseLogById,
  getPrnDoseLogs,
  undoPrnDose,
} from "@/lib/dose-action-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

async function seedPrn(stock = 30) {
  const rx = makePrescription({ genericName: "Furosemide" });
  const inv = makeInventoryItem(rx.id, { strength: 40, currentStock: stock });
  await db.prescriptions.add(rx);
  await db.inventoryItems.add(inv);
  return { rx, inv };
}

describe("getPrnDoseLogs", () => {
  it("returns live PRN logs on/after the since date, newest first", async () => {
    const { rx } = await seedPrn();
    const a = await logPrnDose({ prescriptionId: rx.id, date: "2026-09-20", time: "08:00" });
    const b = await logPrnDose({ prescriptionId: rx.id, date: "2026-09-24", time: "09:00" });
    const c = await logPrnDose({ prescriptionId: rx.id, date: "2026-09-24", time: "18:30" });
    await logPrnDose({ prescriptionId: rx.id, date: "2026-09-10", time: "08:00" });
    expect(a.success && b.success && c.success).toBe(true);
    if (!a.success) return;
    await db.doseLogs.update(a.data.id, { deletedAt: Date.now() });

    const logs = await getPrnDoseLogs(rx.id, "2026-09-18");
    expect(logs.map((l) => l.scheduledTime)).toEqual(["18:30", "09:00"]);
  });

  it("excludes scheduled (non-PRN) logs", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const sched = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(sched);
    await takeDose({
      prescriptionId: rx.id, phaseId: phase.id, scheduleId: sched.id,
      date: "2026-09-24", time: "08:00", dosageMg: 50,
    });

    expect(await getPrnDoseLogs(rx.id, "2026-09-01")).toEqual([]);
  });
});

describe("undoPrnDose", () => {
  it("soft-deletes the PRN log, reverses its consumed transaction and restores stock", async () => {
    const { rx, inv } = await seedPrn(30);
    const logged = await logPrnDose({
      prescriptionId: rx.id, date: "2026-09-24", time: "08:00", dosageMg: 40, doseMg: 40,
    });
    if (!logged.success) throw new Error("setup failed");
    expect((await db.inventoryItems.get(inv.id))?.currentStock).toBe(29);

    const result = await undoPrnDose(logged.data.id);
    expect(result.success).toBe(true);

    const log = await db.doseLogs.get(logged.data.id);
    expect(log?.deletedAt).not.toBeNull();
    expect((await db.inventoryItems.get(inv.id))?.currentStock).toBe(30);
    const txs = await db.inventoryTransactions.where("inventoryItemId").equals(inv.id).toArray();
    const linked = txs.filter((t) => t.doseLogId === logged.data.id);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.deletedAt).not.toBeNull();
    expect(await getPrnDoseLogs(rx.id, "2026-09-01")).toEqual([]);
  });

  it("undoes a PRN dose that had no tracked inventory", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const logged = await logPrnDose({ prescriptionId: rx.id, date: "2026-09-24", time: "08:00" });
    if (!logged.success) throw new Error("setup failed");

    expect((await undoPrnDose(logged.data.id)).success).toBe(true);
    expect((await db.doseLogs.get(logged.data.id))?.deletedAt).not.toBeNull();
  });

  it("refuses a second undo so stock is never restored twice", async () => {
    const { rx, inv } = await seedPrn(30);
    const logged = await logPrnDose({
      prescriptionId: rx.id, date: "2026-09-24", time: "08:00", dosageMg: 40,
    });
    if (!logged.success) throw new Error("setup failed");

    await undoPrnDose(logged.data.id);
    const again = await undoPrnDose(logged.data.id);
    expect(again.success).toBe(false);
    expect((await db.inventoryItems.get(inv.id))?.currentStock).toBe(30);
  });

  it("refuses to undo a scheduled dose log", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const sched = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(sched);
    const taken = await takeDose({
      prescriptionId: rx.id, phaseId: phase.id, scheduleId: sched.id,
      date: "2026-09-24", time: "08:00", dosageMg: 50,
    });
    if (!taken.success) throw new Error("setup failed");

    expect((await undoPrnDose(taken.data.id)).success).toBe(false);
    expect((await db.doseLogs.get(taken.data.id))?.deletedAt).toBeNull();
  });
});

describe("getDoseLogById", () => {
  it("returns the live log and undefined for a tombstone", async () => {
    const { rx } = await seedPrn();
    const logged = await logPrnDose({ prescriptionId: rx.id, date: "2026-09-24", time: "08:00" });
    if (!logged.success) throw new Error("setup failed");
    expect((await getDoseLogById(logged.data.id))?.id).toBe(logged.data.id);
    await db.doseLogs.update(logged.data.id, { deletedAt: Date.now() });
    expect(await getDoseLogById(logged.data.id)).toBeUndefined();
  });
});
