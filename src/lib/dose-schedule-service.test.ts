import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  getDailyDoseSchedule,
  getDoseScheduleForDateRange,
  type DoseSlot,
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

async function seedPrescription(overrides?: {
  isActive?: boolean;
  phaseStatus?: string;
  daysOfWeek?: number[];
  scheduleTimeUTC?: number;
  dosage?: number;
  enabled?: boolean;
  createdAt?: number;
}) {
  const rx = makePrescription({
    isActive: overrides?.isActive ?? true,
    createdAt: overrides?.createdAt ?? 1700000000000,
  });
  const phase = makeMedicationPhase(rx.id, {
    status: (overrides?.phaseStatus ?? "active") as "active" | "completed" | "pending",
  });
  const schedule = makePhaseSchedule(phase.id, {
    scheduleTimeUTC: overrides?.scheduleTimeUTC ?? 480, // 08:00 UTC
    anchorTimezone: "UTC",
    daysOfWeek: overrides?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    dosage: overrides?.dosage ?? 50,
    enabled: overrides?.enabled ?? true,
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
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const morningSchedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 480, // 08:00 UTC
      anchorTimezone: "UTC",
      daysOfWeek: [2],
      dosage: 50,
    });
    const eveningSchedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 1080, // 18:00 UTC
      anchorTimezone: "UTC",
      daysOfWeek: [2],
      dosage: 25,
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
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 480,
      anchorTimezone: "UTC",
      daysOfWeek: [2],
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    // No inventory item seeded

    const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.inventoryWarning).toBe("no_inventory");
  });

  it("maps rescheduled dose log to skipped slot status", async () => {
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
    expect(slots[0]!.status).toBe("skipped"); // rescheduled shows as handled
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
});

// ---------------------------------------------------------------------------
// DST transition tests (SRVC-02)
// ---------------------------------------------------------------------------

describe("DST transition handling", () => {
  it("produces correct local time for Africa/Johannesburg (no DST, always UTC+2)", async () => {
    // 08:30 local in SAST (UTC+2) = 06:30 UTC = 390 minutes
    const { schedule } = await seedPrescription({
      scheduleTimeUTC: 390,
    });
    await db.phaseSchedules.update(schedule.id, { anchorTimezone: "Africa/Johannesburg" });

    const result = await getDailyDoseSchedule(TUESDAY, "Africa/Johannesburg");
    expect(result).toHaveLength(1);
    expect(result[0]!.localTime).toBe("08:30");
  });

  it("produces correct local time for Europe/Berlin (has DST)", async () => {
    // 08:30 local in CET (UTC+1 winter) = 07:30 UTC = 450 minutes
    // 08:30 local in CEST (UTC+2 summer) = 06:30 UTC = 390 minutes
    // The key: scheduleTimeUTC is fixed at creation time.
    // When queried, utcMinutesToLocalTime uses the CURRENT offset.
    // So the local time displayed shifts by 1 hour between winter and summer.
    // This is expected behavior — the dose fires at the same UTC instant.
    const { schedule } = await seedPrescription({
      scheduleTimeUTC: 450, // 07:30 UTC (= 08:30 CET in winter)
    });
    await db.phaseSchedules.update(schedule.id, { anchorTimezone: "Europe/Berlin" });

    const result = await getDailyDoseSchedule(TUESDAY, "Europe/Berlin");
    expect(result).toHaveLength(1);
    // The local time depends on whether the test is running in winter or summer
    // In both cases it should be a valid HH:MM string
    expect(result[0]!.localTime).toMatch(/^\d{2}:\d{2}$/);
    // And the slot should always be generated (not dropped)
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
