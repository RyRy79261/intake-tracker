import { describe, it, expect, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import {
  findMismatchedAnchors,
  recalculateScheduleTimezones,
} from "@/lib/timezone-recalculation-service";
import {
  utcMinutesToLocalTime,
  localTimeToUTCMinutes,
  localHHMMStringToUTCMinutes,
} from "@/lib/timezone";

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
    const { getDailyDoseSchedule } = await import("@/lib/dose-schedule-service");
    const { makeInventoryItem } = await import("@/__tests__/fixtures/db-fixtures");

    // Local noon well before the Tuesday queried below, in every test zone.
    const created = new Date("2023-11-01T12:00:00").getTime();
    const rx = makePrescription({ createdAt: created });
    const phase = makeMedicationPhase(rx.id, { startDate: created, createdAt: created });
    const schedule = makePhaseSchedule(phase.id, {
      createdAt: created,
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

// ---------------------------------------------------------------------------
// `time` is canonical: recalculation never decodes the UTC cache
// (gap-timezone-travel-recalc#0)
// ---------------------------------------------------------------------------

describe("recalculateScheduleTimezones keeps `time` across DST", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("an 08:00 Berlin dose encoded in summer stays 08:00 when re-anchored after 2026-10-25", async () => {
    // Saved on 2026-09-25 (CEST, +120): the UTC cache holds 06:00.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-25T10:00:00Z") });
    const { schedule } = await seedSchedule({
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: localHHMMStringToUTCMinutes("08:00", "Europe/Berlin"),
      time: "08:00",
    });
    expect(schedule.scheduleTimeUTC).toBe(360);

    // Accept the prompt in London after the shift, when Berlin is +60.
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    await recalculateScheduleTimezones("Europe/London");

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated!.time).toBe("08:00");
    expect(updated!.anchorTimezone).toBe("Europe/London");
    expect(updated!.scheduleTimeUTC).toBe(480); // 08:00 GMT
  });

  it("a London round trip across the DST change comes home at 08:00", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-25T10:00:00Z") });
    const { schedule } = await seedSchedule({
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: localHHMMStringToUTCMinutes("08:00", "Europe/Berlin"),
      time: "08:00",
    });

    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    await recalculateScheduleTimezones("Europe/London");
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    await recalculateScheduleTimezones("Europe/Berlin");

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated!.time).toBe("08:00");
    expect(updated!.anchorTimezone).toBe("Europe/Berlin");
    expect(updated!.scheduleTimeUTC).toBe(420); // 08:00 CET
  });

  it("falls back to decoding the UTC cache only for a legacy record without a usable time", async () => {
    const { schedule } = await seedSchedule({
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390, // 08:30 SAST (no DST)
      time: "",
    });

    await recalculateScheduleTimezones("Europe/Berlin");

    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated!.time).toBe("08:30");
    expect(updated!.anchorTimezone).toBe("Europe/Berlin");
  });
});

// ---------------------------------------------------------------------------
// Only live schedules of live active/pending phases travel
// (gap-timezone-travel-recalc#6)
// ---------------------------------------------------------------------------

describe("recalculateScheduleTimezones scope", () => {
  async function seedWith(opts: {
    phaseStatus?: "active" | "pending" | "completed" | "cancelled";
    phaseDeletedAt?: number | null;
    scheduleDeletedAt?: number | null;
  }) {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id, {
      status: opts.phaseStatus ?? "active",
      deletedAt: opts.phaseDeletedAt ?? null,
    });
    const schedule = makePhaseSchedule(phase.id, {
      anchorTimezone: "Africa/Johannesburg",
      scheduleTimeUTC: 390,
      time: "08:30",
      deletedAt: opts.scheduleDeletedAt ?? null,
    });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    return schedule;
  }

  it("leaves tombstoned schedules alone and does not requeue them", async () => {
    const schedule = await seedWith({ scheduleDeletedAt: 1000 });

    const count = await recalculateScheduleTimezones("Europe/Berlin");
    expect(count).toBe(0);

    const unchanged = await db.phaseSchedules.get(schedule.id);
    expect(unchanged!.anchorTimezone).toBe("Africa/Johannesburg");
    expect(unchanged!.updatedAt).toBe(schedule.updatedAt);
    const queued = await db._syncQueue.toArray();
    expect(queued.filter((r) => r.recordId === schedule.id)).toHaveLength(0);
  });

  it("leaves schedules of completed and deleted phases alone", async () => {
    const completed = await seedWith({ phaseStatus: "completed" });
    const deletedPhase = await seedWith({ phaseDeletedAt: 1000 });

    expect(await recalculateScheduleTimezones("Europe/Berlin")).toBe(0);
    expect((await db.phaseSchedules.get(completed.id))!.anchorTimezone).toBe("Africa/Johannesburg");
    expect((await db.phaseSchedules.get(deletedPhase.id))!.anchorTimezone).toBe("Africa/Johannesburg");
  });

  it("re-anchors schedules of pending phases", async () => {
    const pending = await seedWith({ phaseStatus: "pending" });

    expect(await recalculateScheduleTimezones("Europe/Berlin")).toBe(1);
    expect((await db.phaseSchedules.get(pending.id))!.anchorTimezone).toBe("Europe/Berlin");
  });
});

// ---------------------------------------------------------------------------
// findMismatchedAnchors (gap-timezone-travel-recalc#6, #7)
// ---------------------------------------------------------------------------

describe("findMismatchedAnchors", () => {
  it("lists every distinct mismatched anchor with before/after times", async () => {
    const rxA = makePrescription({ genericName: "Alpha" });
    const rxB = makePrescription({ genericName: "Beta" });
    const phaseA = makeMedicationPhase(rxA.id);
    const phaseB = makeMedicationPhase(rxB.id);
    await db.prescriptions.bulkAdd([rxA, rxB]);
    await db.medicationPhases.bulkAdd([phaseA, phaseB]);
    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(phaseA.id, { time: "08:30", anchorTimezone: "Africa/Johannesburg" }),
      makePhaseSchedule(phaseB.id, { time: "20:00", anchorTimezone: "Asia/Tokyo" }),
      makePhaseSchedule(phaseB.id, { time: "07:00", anchorTimezone: "UTC" }),
    ]);

    const groups = await findMismatchedAnchors("UTC");
    const byAnchor = new Map(groups.map((g) => [g.anchorTimezone, g.doses]));
    expect([...byAnchor.keys()].sort()).toEqual(["Africa/Johannesburg", "Asia/Tokyo"]);
    // SAST and JST have no DST, so "before" is fixed: +2h and +9h ahead of UTC.
    expect(byAnchor.get("Africa/Johannesburg")).toEqual([
      expect.objectContaining({ name: "Alpha", before: "06:30", after: "08:30" }),
    ]);
    expect(byAnchor.get("Asia/Tokyo")).toEqual([
      expect.objectContaining({ name: "Beta", before: "11:00", after: "20:00" }),
    ]);
  });

  it("ignores tombstones and completed phases, and skips dismissed anchors", async () => {
    const rx = makePrescription();
    const done = makeMedicationPhase(rx.id, { status: "completed" });
    const live = makeMedicationPhase(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([done, live]);
    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(done.id, { anchorTimezone: "Africa/Johannesburg" }),
      makePhaseSchedule(live.id, { anchorTimezone: "Asia/Tokyo", deletedAt: 1000 }),
      makePhaseSchedule(live.id, { anchorTimezone: "America/New_York" }),
    ]);

    const groups = await findMismatchedAnchors("Europe/Berlin");
    expect(groups.map((g) => g.anchorTimezone)).toEqual(["America/New_York"]);

    expect(await findMismatchedAnchors("Europe/Berlin", new Set(["America/New_York"]))).toEqual([]);
  });
});
