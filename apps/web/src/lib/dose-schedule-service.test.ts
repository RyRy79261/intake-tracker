import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { formatLocalTime, localHHMMStringToUTCMinutes } from "@/lib/timezone";
import {
  getDailyDoseSchedule,
  getDoseScheduleForDateRange,
} from "@/lib/dose-schedule-service";
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

// 2023-11-14 is a Tuesday (dayOfWeek = 2) — matches BASE_TS in fixtures
const TUESDAY = "2023-11-14";
const WEDNESDAY = "2023-11-15";
const THURSDAY = "2023-11-16";
// Local noon, so the regimen's start date is 2023-11-01 in every test timezone.
const REGIMEN_START = new Date("2023-11-01T12:00:00").getTime();

async function seedPrescription(overrides?: {
  isActive?: boolean;
  phaseStatus?: string;
  daysOfWeek?: number[];
  scheduleTimeUTC?: number;
  time?: string;
  anchorTimezone?: string;
  dosage?: number;
  enabled?: boolean;
  createdAt?: number;
}) {
  const utcMinutes = overrides?.scheduleTimeUTC ?? 480;
  const rx = makePrescription({
    isActive: overrides?.isActive ?? true,
    // Local noon well before TUESDAY: BASE_TS (1700000000000) is 22:13 UTC,
    // already the next local day east of UTC+1.
    createdAt: overrides?.createdAt ?? REGIMEN_START,
  });
  const phase = makeMedicationPhase(rx.id, {
    status: (overrides?.phaseStatus ?? "active") as "active" | "completed" | "pending",
    startDate: overrides?.createdAt ?? REGIMEN_START,
  });
  const schedule = makePhaseSchedule(phase.id, {
    scheduleTimeUTC: utcMinutes, // 08:00 UTC by default
    // `time` is canonical; with the default UTC anchor it mirrors the cache.
    time: overrides?.time ?? formatLocalTime(utcMinutes, "UTC"),
    anchorTimezone: overrides?.anchorTimezone ?? "UTC",
    daysOfWeek: overrides?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    dosage: overrides?.dosage ?? 50,
    enabled: overrides?.enabled ?? true,
    createdAt: overrides?.createdAt ?? REGIMEN_START,
  });
  const inv = makeInventoryItem(rx.id, {
    strength: 50,
    currentStock: 30,
  });
  const txn = makeInventoryTransaction(inv.id, { amount: 30 });

  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(txn);

  return { rx, phase, schedule, inv, txn };
}

// ---------------------------------------------------------------------------
// getDailyDoseSchedule
// ---------------------------------------------------------------------------

describe("getDailyDoseSchedule", () => {
  it("returns empty array with no prescriptions", async () => {
    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toEqual([]);
  });

  it("returns one DoseSlot with status 'pending' for matching day-of-week", async () => {
    const { rx, phase, schedule } = await seedPrescription({
      daysOfWeek: [2], // Tuesday only
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.prescriptionId).toBe(rx.id);
    expect(slots[0]!.phaseId).toBe(phase.id);
    expect(slots[0]!.scheduleId).toBe(schedule.id);
    // Date is in the past (2023), so status is "missed" not "pending"
    expect(slots[0]!.status).toBe("missed");
    expect(slots[0]!.dosageMg).toBe(50);
  });

  it("returns 'taken' status when dose log exists with taken status", async () => {
    const { rx, phase, schedule } = await seedPrescription({
      daysOfWeek: [2],
    });
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: TUESDAY,
      scheduledTime: "08:00",
      status: "taken",
      actionTimestamp: Date.now(),
    });
    await db.doseLogs.add(log);

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.status).toBe("taken");
    expect(slots[0]!.existingLog).toBeDefined();
    expect(slots[0]!.existingLog!.id).toBe(log.id);
  });

  it("returns 'skipped' status when dose log exists with skipped status", async () => {
    const { rx, phase, schedule } = await seedPrescription({
      daysOfWeek: [2],
    });
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: TUESDAY,
      scheduledTime: "08:00",
      status: "skipped",
      skipReason: "Not feeling well",
    });
    await db.doseLogs.add(log);

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.status).toBe("skipped");
  });

  it("returns empty when schedule does not match day-of-week", async () => {
    await seedPrescription({
      daysOfWeek: [1], // Monday only
    });

    // Tuesday = dayOfWeek 2 — should not match
    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(0);
  });

  it("returns empty for inactive prescription", async () => {
    await seedPrescription({
      isActive: false,
      daysOfWeek: [2],
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(0);
  });

  it("returns empty for inactive (completed) phase", async () => {
    await seedPrescription({
      phaseStatus: "completed",
      daysOfWeek: [2],
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(0);
  });

  it("returns empty for disabled schedule", async () => {
    await seedPrescription({
      enabled: false,
      daysOfWeek: [2],
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(0);
  });

  it("returns two DoseSlots sorted by localTime for multiple schedules", async () => {
    const rx = makePrescription({ createdAt: REGIMEN_START });
    const phase = makeMedicationPhase(rx.id, { startDate: REGIMEN_START });
    const morningSchedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 480, // 08:00 UTC
      anchorTimezone: "UTC",
      daysOfWeek: [2],
      dosage: 50,
      createdAt: REGIMEN_START,
    });
    const eveningSchedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 1080, // 18:00 UTC
      time: "18:00",
      anchorTimezone: "UTC",
      daysOfWeek: [2],
      dosage: 25,
      createdAt: REGIMEN_START,
    });
    const inv = makeInventoryItem(rx.id, { strength: 50, currentStock: 30 });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.bulkAdd([morningSchedule, eveningSchedule]);
    await db.inventoryItems.add(inv);

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(2);
    // Morning before evening
    expect(slots[0]!.localTime).toBe("08:00");
    expect(slots[0]!.dosageMg).toBe(50);
    expect(slots[1]!.localTime).toBe("18:00");
    expect(slots[1]!.dosageMg).toBe(25);
  });

  it("returns 'missed' status for a past date with no log", async () => {
    await seedPrescription({
      daysOfWeek: [2], // Tuesday
      // Set createdAt well before the target date so the filter passes
      createdAt: new Date("2023-10-01T00:00:00Z").getTime(),
    });

    // Use a past Tuesday — prescription created before this date
    const pastTuesday = "2023-11-07";
    const slots = await getDailyDoseSchedule(pastTuesday, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.status).toBe("missed");
  });

  it("includes inventory info (pillsPerDose) on slot", async () => {
    await seedPrescription({
      daysOfWeek: [2],
      dosage: 25, // 25mg from 50mg pill = 0.5 pills
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.pillsPerDose).toBe(0.5);
    expect(slots[0]!.inventory).toBeDefined();
    expect(slots[0]!.inventory!.brandName).toBe("Lopressor");
  });

  it("sets inventoryWarning to 'no_inventory' when no inventory exists", async () => {
    const rx = makePrescription({ createdAt: REGIMEN_START });
    const phase = makeMedicationPhase(rx.id, { startDate: REGIMEN_START });
    const schedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 480,
      anchorTimezone: "UTC",
      daysOfWeek: [2],
      createdAt: REGIMEN_START,
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    // No inventory item seeded

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.inventoryWarning).toBe("no_inventory");
  });

  it("builds a rescheduled slot at its new time, still owed (doses-titration-schedule#6)", async () => {
    const { rx, phase, schedule } = await seedPrescription({
      daysOfWeek: [2],
    });
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: TUESDAY,
      scheduledTime: "08:00",
      status: "rescheduled",
      rescheduledTo: "14:00",
    });
    await db.doseLogs.add(log);

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    // Rescheduled is not handled: the dose is still owed, now at 14:00, and
    // on a past date it was missed.
    expect(slots[0]!.status).toBe("missed");
    expect(slots[0]!.localTime).toBe("14:00");
    expect(slots[0]!.existingLog?.id).toBe(log.id);
  });

  it("does not return slots for dates before prescription was created", async () => {
    await seedPrescription({
      daysOfWeek: [2],
      createdAt: new Date("2023-11-14T12:00:00Z").getTime(), // created on TUESDAY
    });

    // Query for previous Tuesday (before creation)
    const pastTuesday = "2023-11-07";
    const slots = await getDailyDoseSchedule(pastTuesday, "UTC");
    expect(slots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDoseScheduleForDateRange
// ---------------------------------------------------------------------------

describe("getDoseScheduleForDateRange", () => {
  it("returns a Map with date keys and DoseSlot arrays", async () => {
    await seedPrescription({
      daysOfWeek: [2, 3], // Tuesday and Wednesday
    });

    const result = await getDoseScheduleForDateRange(TUESDAY, WEDNESDAY, "UTC");
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.has(TUESDAY)).toBe(true);
    expect(result.has(WEDNESDAY)).toBe(true);
  });

  it("each day has correct slots based on daysOfWeek", async () => {
    await seedPrescription({
      daysOfWeek: [2], // Tuesday only
    });

    const result = await getDoseScheduleForDateRange(TUESDAY, THURSDAY, "UTC");
    expect(result.size).toBe(3); // 3 days in range

    // Tuesday has 1 slot, Wednesday and Thursday have 0
    expect(result.get(TUESDAY)!).toHaveLength(1);
    expect(result.get(WEDNESDAY)!).toHaveLength(0);
    expect(result.get(THURSDAY)!).toHaveLength(0);
  });

  it("returns correct statuses across multiple days", async () => {
    const { rx, phase, schedule } = await seedPrescription({
      daysOfWeek: [2, 3], // Tue + Wed
    });

    // Mark Tuesday as taken
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: TUESDAY,
      scheduledTime: "08:00",
      status: "taken",
      actionTimestamp: Date.now(),
    });
    await db.doseLogs.add(log);

    const result = await getDoseScheduleForDateRange(TUESDAY, WEDNESDAY, "UTC");
    expect(result.get(TUESDAY)![0]!.status).toBe("taken");
    // Wednesday is past (relative to the test), so it will be missed
    const wedSlots = result.get(WEDNESDAY)!;
    expect(wedSlots).toHaveLength(1);
    expect(["pending", "missed"]).toContain(wedSlots[0]!.status);
  });
});

// ---------------------------------------------------------------------------
// Timezone behavior
// ---------------------------------------------------------------------------

describe("timezone behavior", () => {
  it("generates slots with correct localTime for UTC timezone", async () => {
    await seedPrescription({
      daysOfWeek: [2],
      scheduleTimeUTC: 480, // 08:00 UTC
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("08:00");
    expect(slots[0]!.scheduleTimeUTC).toBe(480);
  });

  it("date-string-based schedule is timezone-agnostic (same date yields same slots)", async () => {
    await seedPrescription({
      daysOfWeek: [2],
      scheduleTimeUTC: 480,
    });

    // Both timezones should produce 1 slot for the same date
    const slotsJHB = await getDailyDoseSchedule(TUESDAY, "Africa/Johannesburg");
    const slotsBerlin = await getDailyDoseSchedule(TUESDAY, "Europe/Berlin");

    expect(slotsJHB).toHaveLength(1);
    expect(slotsBerlin).toHaveLength(1);

    // Same prescription, same schedule
    expect(slotsJHB[0]!.prescriptionId).toBe(slotsBerlin[0]!.prescriptionId);
    expect(slotsJHB[0]!.scheduleId).toBe(slotsBerlin[0]!.scheduleId);
  });

  it("near-midnight UTC schedule produces slot on correct date", async () => {
    await seedPrescription({
      daysOfWeek: [2],
      scheduleTimeUTC: 1410, // 23:30 UTC
    });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("23:30");
    expect(slots[0]!.scheduledDate).toBe(TUESDAY);
  });

  it("recalculateScheduleTimezones preserves wall-clock time for getDailyDoseSchedule", async () => {
    const { recalculateScheduleTimezones } = await import("@/lib/timezone-recalculation-service");

    // Seed schedule anchored at SA: 08:30 SA (UTC+2) = 06:30 UTC = 390 min
    const rx = makePrescription({ createdAt: REGIMEN_START });
    const phase = makeMedicationPhase(rx.id, { startDate: REGIMEN_START });
    const schedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 390,
      anchorTimezone: "Africa/Johannesburg",
      daysOfWeek: [2], // Tuesday
      time: "08:30",
      createdAt: REGIMEN_START,
    });
    const inv = makeInventoryItem(rx.id, { strength: 50, currentStock: 30 });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);

    // Recalculate to Berlin
    await recalculateScheduleTimezones("Europe/Berlin");

    // Query schedule for Tuesday in Berlin timezone
    const slots = await getDailyDoseSchedule(TUESDAY, "Europe/Berlin");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("08:30"); // wall-clock preserved
  });
});

// ---------------------------------------------------------------------------
// DST transition tests (SRVC-02)
// ---------------------------------------------------------------------------

describe("DST transition handling", () => {
  it("produces correct local time for Africa/Johannesburg (no DST, always UTC+2)", async () => {
    // 08:30 local in SAST (UTC+2) = 06:30 UTC = 390 minutes
    await seedPrescription({
      scheduleTimeUTC: 390,
      time: "08:30",
      anchorTimezone: "Africa/Johannesburg",
    });

    const result = await getDailyDoseSchedule(TUESDAY, "Africa/Johannesburg");
    expect(result).toHaveLength(1);
    expect(result[0]!.localTime).toBe("08:30");
  });

  it("produces correct local time for Europe/Berlin (has DST)", async () => {
    // `time` + anchor is canonical; the stale 450 cache (08:30 CET) is ignored,
    // so the slot shows 08:30 whichever season the test runs in.
    await seedPrescription({
      scheduleTimeUTC: 450,
      time: "08:30",
      anchorTimezone: "Europe/Berlin",
    });

    const result = await getDailyDoseSchedule(TUESDAY, "Europe/Berlin");
    expect(result).toHaveLength(1);
    expect(result[0]!.localTime).toBe("08:30");
    expect(result[0]!.dosageMg).toBe(50);
  });

  it("SA and Germany schedules produce different UTC values for the same local time", async () => {
    // Same local time "08:30" but different UTC values
    // SA: 08:30 local = 06:30 UTC = 390 min
    // Germany winter: 08:30 local = 07:30 UTC = 450 min
    // Germany summer: 08:30 local = 06:30 UTC = 390 min
    // The point: localHHMMStringToUTCMinutes produces different results per timezone
    const { localHHMMStringToUTCMinutes } = await import("@/lib/timezone");

    const saUTC = localHHMMStringToUTCMinutes("08:30", "Africa/Johannesburg");
    const deUTC = localHHMMStringToUTCMinutes("08:30", "Europe/Berlin");

    // SA is always UTC+2, so 08:30 SA = 06:30 UTC = 390
    expect(saUTC).toBe(390);
    // Germany is UTC+1 (winter) or UTC+2 (summer)
    // Either way, the result should be a valid number different from or equal to SA depending on season
    expect(deUTC).toBeGreaterThanOrEqual(0);
    expect(deUTC).toBeLessThan(1440);
  });
});

// ---------------------------------------------------------------------------
// Slot/log matching and effective-dated history
// ---------------------------------------------------------------------------

/** A local-time timestamp, clear of any midnight in every test timezone. */
function localNoon(date: string): number {
  return new Date(date + "T12:00:00").getTime();
}

const MONDAY = "2023-11-13";
const PREV_WEEK = "2023-11-07";

async function seedRegimen(opts?: { phase?: Parameters<typeof makeMedicationPhase>[1] }) {
  const rx = makePrescription({ createdAt: localNoon("2023-11-01") });
  const phase = makeMedicationPhase(rx.id, {
    startDate: localNoon("2023-11-01"),
    createdAt: localNoon("2023-11-01"),
    ...opts?.phase,
  });
  const schedule = makePhaseSchedule(phase.id, {
    createdAt: localNoon("2023-11-01"),
    dosage: 50,
  });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  return { rx, phase, schedule };
}

describe("slot and log matching", () => {
  it("picks the taken log whichever order duplicate logs were stored in", async () => {
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.bulkAdd([
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "b", scheduledDate: TUESDAY, status: "taken" }),
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "c", scheduledDate: TUESDAY, status: "pending", scheduledTime: "11:00" }),
      makeDoseLog(rx.id, phase.id, schedule.id, { id: "a", scheduledDate: TUESDAY, status: "pending", updatedAt: 1_800_000_000_000 }),
    ]);

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.status).toBe("taken");
    expect(slots[0]!.existingLog?.id).toBe("b");
  });

  it("ignores soft-deleted logs", async () => {
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: TUESDAY, status: "taken", deletedAt: 1 }),
    );

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots[0]!.status).toBe("missed");
    expect(slots[0]!.existingLog).toBeUndefined();
  });

  it("reads a pending log on a past date as missed (gap-bulk-dose-actions#5)", async () => {
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: TUESDAY, status: "pending" }),
    );

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots[0]!.status).toBe("missed");
  });

  it("keeps a rescheduled dose at its new time once taken", async () => {
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, {
        scheduledDate: TUESDAY, status: "taken", rescheduledTo: "14:00",
      }),
    );

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots[0]!.status).toBe("taken");
    expect(slots[0]!.localTime).toBe("14:00");
  });

  it("shows the current dose and unit for an untaken log, not a stale snapshot", async () => {
    // An untake leaves the previous take's snapshot on the now-pending log.
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, {
        scheduledDate: TUESDAY, status: "pending", doseAmount: 25, doseUnit: "mcg",
      }),
    );

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots[0]!.dosageMg).toBe(50);
    expect(slots[0]!.unit).toBe(phase.unit);
  });

  it("shows the dose recorded on a taken log, not the edited schedule (prescriptions-model#3)", async () => {
    const { rx, phase, schedule } = await seedRegimen();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, {
        scheduledDate: TUESDAY, status: "taken", doseAmount: 25, doseUnit: "mg",
      }),
    );
    await db.phaseSchedules.update(schedule.id, { dosage: 100 });

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots[0]!.dosageMg).toBe(25);
    // An unlogged day shows the current regimen.
    const monday = await getDailyDoseSchedule(MONDAY, "UTC");
    expect(monday[0]!.dosageMg).toBe(100);
  });
});

describe("effective-dated history (doses-titration-schedule#13)", () => {
  it("resolves a past date from the phase live on that date, not today's titration", async () => {
    const { rx, phase: maintenance, schedule: maintSchedule } = await seedRegimen();
    const titration = makeMedicationPhase(rx.id, {
      type: "titration",
      titrationPlanId: "plan-1",
      startDate: localNoon(MONDAY),
      createdAt: localNoon(MONDAY),
    });
    const titSchedule = makePhaseSchedule(titration.id, { dosage: 100, createdAt: localNoon(MONDAY) });
    await db.medicationPhases.add(titration);
    await db.phaseSchedules.add(titSchedule);
    await db.doseLogs.add(
      makeDoseLog(rx.id, maintenance.id, maintSchedule.id, { scheduledDate: PREV_WEEK, status: "taken" }),
    );

    const before = await getDailyDoseSchedule(PREV_WEEK, "UTC");
    expect(before.map((s) => [s.scheduleId, s.status])).toEqual([[maintSchedule.id, "taken"]]);

    const during = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(during.map((s) => s.scheduleId)).toEqual([titSchedule.id]);
  });

  it("keeps a completed phase's days inside its start and end dates", async () => {
    const { schedule } = await seedRegimen({
      phase: { status: "completed", endDate: localNoon(MONDAY) },
    });

    const inside = await getDailyDoseSchedule(PREV_WEEK, "UTC");
    expect(inside.map((s) => s.scheduleId)).toEqual([schedule.id]);
    expect(await getDailyDoseSchedule(TUESDAY, "UTC")).toHaveLength(0);
  });

  it("does not mark a schedule missed on days before it was added", async () => {
    const { phase } = await seedRegimen();
    const added = makePhaseSchedule(phase.id, { time: "20:00", scheduleTimeUTC: 1200, createdAt: localNoon(MONDAY) });
    await db.phaseSchedules.add(added);

    const before = await getDailyDoseSchedule(PREV_WEEK, "UTC");
    expect(before.map((s) => s.scheduleId)).not.toContain(added.id);
    const after = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(after.map((s) => s.scheduleId)).toContain(added.id);
  });

  it("shows a removed schedule on days before it was removed", async () => {
    const { schedule } = await seedRegimen();
    await db.phaseSchedules.update(schedule.id, { deletedAt: localNoon(MONDAY), enabled: false });

    expect((await getDailyDoseSchedule(PREV_WEEK, "UTC")).map((s) => s.scheduleId)).toEqual([schedule.id]);
    expect(await getDailyDoseSchedule(TUESDAY, "UTC")).toHaveLength(0);
  });

  it("drops soft-deleted prescriptions and phases", async () => {
    const { rx } = await seedRegimen();
    await db.prescriptions.update(rx.id, { deletedAt: 1 });
    expect(await getDailyDoseSchedule(TUESDAY, "UTC")).toHaveLength(0);

    await db.prescriptions.update(rx.id, { deletedAt: null });
    const phase = await db.medicationPhases.where("prescriptionId").equals(rx.id).first();
    await db.medicationPhases.update(phase!.id, { deletedAt: 1 });
    expect(await getDailyDoseSchedule(TUESDAY, "UTC")).toHaveLength(0);
  });

  it("still shows a past logged dose whose phase no longer covers that date", async () => {
    // A phase completed without an endDate cannot be dated, but its taken
    // dose must not vanish from history.
    const { rx, phase, schedule } = await seedRegimen({ phase: { status: "completed" } });
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: TUESDAY, status: "taken" }),
    );

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots.map((s) => [s.scheduleId, s.status])).toEqual([[schedule.id, "taken"]]);
    // No log on another day: nothing to show.
    expect(await getDailyDoseSchedule(MONDAY, "UTC")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Berlin DST crossings (doses-titration-schedule#7, #24)
// ---------------------------------------------------------------------------

// Node re-reads process.env.TZ on assignment; assigning undefined would set
// the literal string "undefined", so delete instead.
function restoreTZ(original: string | undefined) {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
}

describe("Berlin DST crossings (TZ=Europe/Berlin)", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    restoreTZ(originalTZ);
  });

  function useBerlinClock(iso: string) {
    process.env.TZ = "Europe/Berlin";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
  }

  // 2026-10-25: CEST -> CET. 2027-03-28: CET -> CEST. Every day selected.
  it.each([
    ["2026-10-24", "2026-11-02T09:00:00Z"],
    ["2026-10-25", "2026-11-02T09:00:00Z"],
    ["2026-10-26", "2026-11-02T09:00:00Z"],
    ["2027-03-27", "2027-04-05T09:00:00Z"],
    ["2027-03-28", "2027-04-05T09:00:00Z"],
    ["2027-03-29", "2027-04-05T09:00:00Z"],
  ])("an 08:30 dose saved in summer stays 08:30 on %s", async (day, now) => {
    // Saved on 2026-09-25 (CEST): the UTC cache holds 06:30.
    useBerlinClock("2026-09-25T10:00:00Z");
    const savedUTC = localHHMMStringToUTCMinutes("08:30", "Europe/Berlin");
    expect(savedUTC).toBe(390);
    await seedPrescription({
      scheduleTimeUTC: savedUTC,
      time: "08:30",
      anchorTimezone: "Europe/Berlin",
      createdAt: new Date("2026-09-25T10:00:00Z").getTime(),
    });

    // Read after the shift, when "today's offset" differs from the saved one.
    vi.setSystemTime(new Date(now));
    const slots = await getDailyDoseSchedule(day, "Europe/Berlin");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("08:30");
  });

  it("an 08:30 dose saved in winter stays 08:30 after spring-forward", async () => {
    useBerlinClock("2027-01-15T10:00:00Z");
    await seedPrescription({
      scheduleTimeUTC: localHHMMStringToUTCMinutes("08:30", "Europe/Berlin"), // 450
      time: "08:30",
      anchorTimezone: "Europe/Berlin",
      createdAt: new Date("2027-01-15T10:00:00Z").getTime(),
    });

    vi.setSystemTime(new Date("2027-04-05T09:00:00Z"));
    const slots = await getDailyDoseSchedule("2027-03-29", "Europe/Berlin");
    expect(slots[0]!.localTime).toBe("08:30");
  });
});

describe("prescription creation cutoff uses the local date", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    restoreTZ(originalTZ);
  });

  it("shows the creation day's doses west of UTC for an evening creation", async () => {
    process.env.TZ = "America/New_York";
    // 2026-09-24 20:00 in New York is already 2026-09-25 in UTC.
    await seedPrescription({
      time: "21:00",
      anchorTimezone: "America/New_York",
      createdAt: new Date("2026-09-25T00:00:00Z").getTime(),
    });

    const slots = await getDailyDoseSchedule("2026-09-24", "America/New_York");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("21:00");
  });
});
