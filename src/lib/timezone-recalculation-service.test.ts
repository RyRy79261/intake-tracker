import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import { recalculateScheduleTimezones } from "./timezone-recalculation-service";
import { utcMinutesToLocalTime, localTimeToUTCMinutes } from "./timezone";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedSchedule(overrides?: {
  anchorTimezone?: string;
  scheduleTimeUTC?: number;
  enabled?: boolean;
  daysOfWeek?: number[];
  time?: string;
}) {
  const rx = makePrescription();
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, {
    scheduleTimeUTC: overrides?.scheduleTimeUTC ?? 390,
    anchorTimezone: overrides?.anchorTimezone ?? "Africa/Johannesburg",
    daysOfWeek: overrides?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    enabled: overrides?.enabled ?? true,
    time: overrides?.time ?? "08:30",
  });

  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);

  return { rx, phase, schedule };
}

// ---------------------------------------------------------------------------
// recalculateScheduleTimezones
// ---------------------------------------------------------------------------

describe("recalculateScheduleTimezones", () => {
  it("Test 1: SA->Berlin recalculation preserves wall-clock 08:30", async () => {
    // 08:30 SA (UTC+2) = 06:30 UTC = 390 minutes
    const { schedule } = await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
      time: "08:30",
    });

    const count = await recalculateScheduleTimezones("Europe/Berlin");
    expect(count).toBe(1);

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated).toBeDefined();
    expect(updated!.anchorTimezone).toBe("Europe/Berlin");

    // Verify wall-clock time is preserved at 08:30
    const local = utcMinutesToLocalTime(updated!.scheduleTimeUTC, "Europe/Berlin");
    expect(local.hours).toBe(8);
    expect(local.minutes).toBe(30);

    // Verify the new scheduleTimeUTC is what localTimeToUTCMinutes would produce
    const expectedUTC = localTimeToUTCMinutes(8, 30, "Europe/Berlin");
    expect(updated!.scheduleTimeUTC).toBe(expectedUTC);
  });

  it("Test 2: Berlin->SA recalculation reverses", async () => {
    // Berlin 08:30 local -> UTC depends on current DST
    const berlinUTC = localTimeToUTCMinutes(8, 30, "Europe/Berlin");
    const { schedule } = await seedSchedule({
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: berlinUTC,
      time: "08:30",
    });

    const count = await recalculateScheduleTimezones("Africa/Johannesburg");
    expect(count).toBe(1);

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated).toBeDefined();
    expect(updated!.anchorTimezone).toBe("Africa/Johannesburg");

    // Wall-clock preserved at 08:30 in SA (UTC+2) = 390 UTC minutes
    expect(updated!.scheduleTimeUTC).toBe(390);
    const local = utcMinutesToLocalTime(updated!.scheduleTimeUTC, "Africa/Johannesburg");
    expect(local.hours).toBe(8);
    expect(local.minutes).toBe(30);
  });

  it("Test 3: schedule already at target timezone is skipped", async () => {
    const { schedule } = await seedSchedule({
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: 450,
    });

    const count = await recalculateScheduleTimezones("Europe/Berlin");
    expect(count).toBe(0);

    // Verify schedule was not modified
    const unchanged = await db.phaseSchedules.get(schedule.id);
    expect(unchanged!.scheduleTimeUTC).toBe(450);
  });

  it("Test 4: disabled schedules are NOT updated", async () => {
    const { schedule } = await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
      enabled: false,
    });

    const count = await recalculateScheduleTimezones("Europe/Berlin");
    expect(count).toBe(0);

    const unchanged = await db.phaseSchedules.get(schedule.id);
    expect(unchanged!.scheduleTimeUTC).toBe(390);
    expect(unchanged!.anchorTimezone).toBe("Africa/Johannesburg");
  });

  it("Test 5: audit log entry with timezone_adjusted action is created", async () => {
    await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
    });

    await recalculateScheduleTimezones("Europe/Berlin");

    const logs = await db.auditLogs.toArray();
    const tzLog = logs.find((l) => l.action === "timezone_adjusted");
    expect(tzLog).toBeDefined();

    const details = JSON.parse(tzLog!.details ?? "{}");
    expect(details.newTimezone).toBe("Europe/Berlin");
    expect(details.schedulesUpdated).toBe(1);
  });

  it("Test 5b: no audit log when zero schedules updated", async () => {
    // Schedule already at target timezone
    await seedSchedule({
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: 450,
    });

    await recalculateScheduleTimezones("Europe/Berlin");

    const logs = await db.auditLogs.toArray();
    const tzLog = logs.find((l) => l.action === "timezone_adjusted");
    expect(tzLog).toBeUndefined();
  });

  it("Test 6: deprecated time field is updated to match wall-clock time", async () => {
    const { schedule } = await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
      time: "08:30",
    });

    await recalculateScheduleTimezones("Europe/Berlin");

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated!.time).toBe("08:30"); // wall-clock preserved
  });

  it("Test 7: getDailyDoseSchedule returns correct slots after recalculation (integration)", async () => {
    // Import getDailyDoseSchedule
    const { getDailyDoseSchedule } = await import("./dose-schedule-service");
    const { makeInventoryItem } = await import("@/__tests__/fixtures/db-fixtures");

    const rx = makePrescription({ createdAt: 1700000000000 });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 390, // 08:30 SA = 06:30 UTC
      anchorTimezone: "Africa/Johannesburg",
      daysOfWeek: [2], // Tuesday
      time: "08:30",
    });
    const inv = makeInventoryItem(rx.id, { strength: 50, currentStock: 30 });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);

    // Recalculate to Berlin
    await recalculateScheduleTimezones("Europe/Berlin");

    // 2023-11-14 is Tuesday
    const TUESDAY = "2023-11-14";
    const slots = await getDailyDoseSchedule(TUESDAY, "Europe/Berlin");
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localTime).toBe("08:30"); // wall-clock preserved
  });

  it("Test 8: multiple schedules at different times are all recalculated", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);

    // Morning: 08:30 SA = 390 UTC
    const morning = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 390,
      anchorTimezone: "Africa/Johannesburg",
      time: "08:30",
    });

    // Evening: 20:00 SA (UTC+2) = 18:00 UTC = 1080 minutes
    const evening = makePhaseSchedule(phase.id, {
      scheduleTimeUTC: 1080,
      anchorTimezone: "Africa/Johannesburg",
      time: "20:00",
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.bulkAdd([morning, evening]);

    const count = await recalculateScheduleTimezones("Europe/Berlin");
    expect(count).toBe(2);

    const updatedMorning = await db.phaseSchedules.get(morning.id);
    const updatedEvening = await db.phaseSchedules.get(evening.id);

    // Both should now be anchored to Berlin
    expect(updatedMorning!.anchorTimezone).toBe("Europe/Berlin");
    expect(updatedEvening!.anchorTimezone).toBe("Europe/Berlin");

    // Wall-clock times preserved
    const morningLocal = utcMinutesToLocalTime(updatedMorning!.scheduleTimeUTC, "Europe/Berlin");
    expect(morningLocal.hours).toBe(8);
    expect(morningLocal.minutes).toBe(30);

    const eveningLocal = utcMinutesToLocalTime(updatedEvening!.scheduleTimeUTC, "Europe/Berlin");
    expect(eveningLocal.hours).toBe(20);
    expect(eveningLocal.minutes).toBe(0);
  });

  it("Test 9: doseLogs table is unmodified after recalculation (D-03 invariant)", async () => {
    const { schedule, rx, phase } = await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
    });

    // Seed a dose log
    const doseLog = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: "2023-11-14",
      scheduledTime: "08:30",
      status: "taken",
      actionTimestamp: 1700000100000,
      timezone: "Africa/Johannesburg",
    });
    await db.doseLogs.add(doseLog);

    // Run recalculation
    await recalculateScheduleTimezones("Europe/Berlin");

    // Verify dose logs are completely untouched
    const logsAfter = await db.doseLogs.toArray();
    expect(logsAfter).toHaveLength(1);
    expect(logsAfter[0]!.id).toBe(doseLog.id);
    expect(logsAfter[0]!.timezone).toBe("Africa/Johannesburg");
    expect(logsAfter[0]!.scheduledTime).toBe("08:30");
    expect(logsAfter[0]!.actionTimestamp).toBe(1700000100000);
    expect(logsAfter[0]!.status).toBe("taken");
    expect(logsAfter[0]!.scheduledDate).toBe("2023-11-14");
  });
});
