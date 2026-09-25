/**
 * Time-framed deletion (audit dates-timezones#9 / C5).
 *
 * "Older than N days" must only touch time-series records, judged by when the
 * event happened (`timestamp`, or a dose's `scheduledDate`) rather than when
 * the row was written. Configuration (prescriptions, phases, schedules,
 * inventory, titration plans) is never deleted by age.
 */

import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { db } from "@/lib/db";
import {
  deleteRecordsInRange,
  olderThanDays,
  ALL_TIME,
} from "@/lib/data-deletion-service";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
  makeSubstanceRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
  makeTitrationPlan,
  makeDailyNote,
  makeAuditLog,
  makeUserProfile,
} from "@/__tests__/fixtures/db-fixtures";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): number {
  return Date.now() - n * DAY;
}

function dateDaysAgo(n: number): string {
  return format(new Date(daysAgo(n)), "yyyy-MM-dd");
}

async function seedConfiguration(createdAt: number) {
  const rx = makePrescription({ id: "rx", createdAt, updatedAt: createdAt });
  const phase = makeMedicationPhase(rx.id, { id: "ph", createdAt, updatedAt: createdAt });
  const schedule = makePhaseSchedule(phase.id, { id: "sch", createdAt, updatedAt: createdAt });
  const inv = makeInventoryItem(rx.id, { id: "inv", createdAt, updatedAt: createdAt });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(
    makeInventoryTransaction(inv.id, { id: "tx", timestamp: createdAt, createdAt, updatedAt: createdAt }),
  );
  await db.titrationPlans.add(makeTitrationPlan({ id: "tp", createdAt, updatedAt: createdAt }));
  await db.dailyNotes.add(makeDailyNote({ id: "note", createdAt, updatedAt: createdAt }));
  await db.auditLogs.add(makeAuditLog({ id: "audit", timestamp: createdAt, createdAt, updatedAt: createdAt }));
  await db.userProfile.add(makeUserProfile({ id: "profile", createdAt, updatedAt: createdAt }));
}

describe("data-deletion-service: olderThanDays", () => {
  it("never deletes configuration or its history by age", async () => {
    await seedConfiguration(daysAgo(200));

    const res = await deleteRecordsInRange(olderThanDays(90));
    expect(res.success).toBe(true);

    expect((await db.prescriptions.get("rx"))?.deletedAt).toBeNull();
    expect((await db.medicationPhases.get("ph"))?.deletedAt).toBeNull();
    expect((await db.phaseSchedules.get("sch"))?.deletedAt).toBeNull();
    expect((await db.inventoryItems.get("inv"))?.deletedAt).toBeNull();
    expect((await db.inventoryTransactions.get("tx"))?.deletedAt).toBeNull();
    expect((await db.titrationPlans.get("tp"))?.deletedAt).toBeNull();
    expect((await db.dailyNotes.get("note"))?.deletedAt).toBeNull();
    expect((await db.auditLogs.get("audit"))?.deletedAt).toBeNull();
    expect((await db.userProfile.get("profile"))?.deletedAt).toBeNull();
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("judges age by the event timestamp, not by createdAt", async () => {
    const now = Date.now();
    // Backdated entry: happened 200 days ago, written today.
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "backdated", timestamp: daysAgo(200), createdAt: now, updatedAt: now }),
    );
    // Recent event on a row that was (re)created long ago.
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "recent", timestamp: daysAgo(1), createdAt: daysAgo(200), updatedAt: daysAgo(200) }),
    );

    const res = await deleteRecordsInRange(olderThanDays(90));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toBe(1);

    expect((await db.intakeRecords.get("backdated"))?.deletedAt).not.toBeNull();
    expect((await db.intakeRecords.get("recent"))?.deletedAt).toBeNull();
  });

  it("deletes old rows from every time-series table and enqueues each for sync", async () => {
    const old = daysAgo(200);
    await db.intakeRecords.add(makeIntakeRecord({ id: "i", timestamp: old }));
    await db.weightRecords.add(makeWeightRecord({ id: "w", timestamp: old }));
    await db.bloodPressureRecords.add(makeBloodPressureRecord({ id: "bp", timestamp: old }));
    await db.eatingRecords.add(makeEatingRecord({ id: "e", timestamp: old }));
    await db.urinationRecords.add(makeUrinationRecord({ id: "u", timestamp: old }));
    await db.defecationRecords.add(makeDefecationRecord({ id: "d", timestamp: old }));
    await db.substanceRecords.add(makeSubstanceRecord({ id: "s", timestamp: old }));

    const res = await deleteRecordsInRange(olderThanDays(90));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toBe(7);

    const queued = await db._syncQueue.toArray();
    expect(queued).toHaveLength(7);
    expect(queued.every((q) => q.op === "delete")).toBe(true);
  });

  it("deletes dose logs by scheduledDate", async () => {
    await db.doseLogs.bulkAdd([
      makeDoseLog("rx", "ph", "sch", { id: "old-dose", scheduledDate: dateDaysAgo(200), createdAt: Date.now() }),
      makeDoseLog("rx", "ph", "sch", { id: "new-dose", scheduledDate: dateDaysAgo(1), createdAt: daysAgo(200) }),
    ]);

    const res = await deleteRecordsInRange(olderThanDays(90));
    expect(res.success).toBe(true);

    expect((await db.doseLogs.get("old-dose"))?.deletedAt).not.toBeNull();
    expect((await db.doseLogs.get("new-dose"))?.deletedAt).toBeNull();
  });

  it("leaves already-deleted rows untouched", async () => {
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "gone", timestamp: daysAgo(200), deletedAt: 123, updatedAt: 123 }),
    );

    const res = await deleteRecordsInRange(olderThanDays(90));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toBe(0);
    expect((await db.intakeRecords.get("gone"))?.deletedAt).toBe(123);
  });
});

describe("data-deletion-service: ALL_TIME", () => {
  it("wipes records and configuration but keeps the user profile", async () => {
    await seedConfiguration(daysAgo(10));
    await db.intakeRecords.add(makeIntakeRecord({ id: "i", timestamp: daysAgo(1) }));

    const res = await deleteRecordsInRange(ALL_TIME);
    expect(res.success).toBe(true);

    expect((await db.intakeRecords.get("i"))?.deletedAt).not.toBeNull();
    expect((await db.prescriptions.get("rx"))?.deletedAt).not.toBeNull();
    expect((await db.phaseSchedules.get("sch"))?.deletedAt).not.toBeNull();
    expect((await db.userProfile.get("profile"))?.deletedAt).toBeNull();
  });
});
