import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makeInventoryItem,
  makeInventoryTransaction,
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import { updatePhase } from "@/lib/phase-service";
import { createTitrationPlan, updateTitrationPlan } from "@/lib/titration-service";
import { rescheduleDose, takeDose } from "@/lib/dose-log-service";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import {
  buildReminderOccurrences,
  buildWeeklyPushEntries,
  loadReminderDoses,
  loadReminderOccurrences,
} from "@/lib/medication-reminder-builder";
import { adherenceRate } from "@/lib/analytics-service";
import { buildMedicationSummary } from "@/lib/analytics-snapshot";
import { getLatestSchedulesForPhase, getPendingScheduleChange, getSchedulesForPhase } from "@/lib/medication-schedule-service";
import { toLocalDateKey } from "@/lib/date-utils";
import type * as TimezoneModule from "@/lib/timezone";

/**
 * PR 2b acceptance checks: an "Apply from" schedule edit keeps every day
 * before its date (time, dose and weekdays), shows the new schedule from it
 * (Today screen, reminders, analytics), and does not reopen a dose already
 * logged on the change day.
 */

vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimezoneModule>()),
  getDeviceTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A local instant on 2026-10-19 (or `day` days later). */
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const dayKey = (day: number) => toLocalDateKey(at(12, 0, day));
const TODAY = dayKey(0);
const YESTERDAY = dayKey(-1);
const TOMORROW = dayKey(1);

const ALL = [0, 1, 2, 3, 4, 5, 6];

/** One medicine with a daily 08:30 dose of 5 mg, running for 30 days. */
async function seedMed(type: "maintenance" | "titration" = "maintenance") {
  const rx = makePrescription({ genericName: "Bisoprolol", createdAt: at(0, 0, -30) });
  const phase = makeMedicationPhase(rx.id, {
    type,
    startDate: at(0, 0, -30),
    createdAt: at(0, 0, -30),
  });
  const schedule = makePhaseSchedule(phase.id, {
    time: "08:30",
    dosage: 5,
    anchorTimezone: TZ,
    createdAt: at(0, 0, -30),
  });
  const inv = makeInventoryItem(rx.id, { brandName: "Concor", strength: 5, currentStock: 30 });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(makeInventoryTransaction(inv.id, { amount: 30 }));
  return { rx, phase, schedule, inv };
}

/** The doses of a day as the Today screen lists them: "time dose status". */
async function day(dateKey: string): Promise<string[]> {
  const slots = await getDailyDoseSchedule(dateKey);
  return slots.map((s) => `${s.localTime} ${s.dosageMg}${s.unit} ${s.status}`);
}

/** The reminder times of each day in the next `days` days, from now. */
async function reminderTimes(days: number): Promise<Record<string, string[]>> {
  const occ = buildReminderOccurrences(await loadReminderDoses(), { from: Date.now(), days, deviceTz: TZ });
  const out: Record<string, string[]> = {};
  for (const o of occ) (out[o.dateKey] ??= []).push(`${o.localTime} ${o.dose.dosageText}`);
  return out;
}

const edit = (phaseId: string, schedules: { id?: string; time: string; dosage: number }[], extra = {}) =>
  updatePhase({
    id: phaseId,
    schedules: schedules.map((s) => ({ ...s, daysOfWeek: ALL })),
    ...extra,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: at(8, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Apply from today", () => {
  it("keeps yesterday's time and dose, and shows the new ones from today", async () => {
    const { phase, schedule } = await seedMed();

    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }]);
    expect(res).toMatchObject({ success: true, data: { scheduleChange: { applyFrom: TODAY } } });

    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual(["09:00 10mg pending"]);
    expect(await day(TOMORROW)).toEqual(["09:00 10mg pending"]);

    // The old row is history, not deleted: yesterday still knows it.
    expect(await db.phaseSchedules.get(schedule.id)).toMatchObject({
      time: "08:30",
      dosage: 5,
      effectiveTo: TODAY,
      deletedAt: null,
    });
  });

  it("keeps yesterday's weekdays when the weekdays change", async () => {
    const { phase, schedule } = await seedMed();
    // Only on the weekday of tomorrow from today on.
    const tomorrowDow = new Date(at(12, 0, 1)).getDay();
    await updatePhase({
      id: phase.id,
      schedules: [{ id: schedule.id, time: "08:30", dosage: 5, daysOfWeek: [tomorrowDow] }],
    });
    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual([]);
    expect(await day(TOMORROW)).toEqual(["08:30 5mg pending"]);
  });

  it("a removed time keeps its past days and drops from today", async () => {
    const { phase } = await seedMed();
    await edit(phase.id, []);
    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual([]);
  });

  it("is one atomic write: a failure leaves every row as it was", async () => {
    const { phase, schedule } = await seedMed();
    const before = await db.phaseSchedules.toArray();
    // The new row's id is drawn after the old row is closed.
    const spy = vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }]);
    spy.mockRestore();
    expect(res.success).toBe(false);
    expect(await db.phaseSchedules.toArray()).toEqual(before);
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
  });

  it("refuses a date before today (it would rewrite logged history)", async () => {
    const { phase, schedule } = await seedMed();
    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: YESTERDAY });
    expect(res).toMatchObject({ success: false, error: "Pick today or a later date." });
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
  });
});

describe("Apply from today after today's dose is taken", () => {
  async function seedTaken() {
    const seeded = await seedMed();
    vi.setSystemTime(at(8, 35));
    const taken = await takeDose({
      prescriptionId: seeded.rx.id,
      phaseId: seeded.phase.id,
      scheduleId: seeded.schedule.id,
      date: TODAY,
      time: "08:30",
      dosageMg: 5,
    });
    expect(taken.success).toBe(true);
    vi.setSystemTime(at(10, 0));
    return seeded;
  }

  const stock = async (invId: string) => (await db.inventoryItems.get(invId))?.currentStock;

  it("rule start-next-day (the product rule): today keeps the taken dose, the change starts tomorrow", async () => {
    const { phase, schedule, inv } = await seedTaken();
    const stockBefore = await stock(inv.id);

    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }]);
    expect(res).toMatchObject({
      success: true,
      data: { scheduleChange: { applyFrom: TODAY, deferredTo: TOMORROW } },
    });

    // Not open again: one dose today, the taken one, at its own time.
    expect(await day(TODAY)).toEqual(["08:30 5mg taken"]);
    expect(await day(TOMORROW)).toEqual(["09:00 10mg pending"]);
    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await stock(inv.id)).toBe(stockBefore);

    // The drawer then says a change is pending.
    expect(await getPendingScheduleChange(phase.id, TODAY)).toMatchObject({
      startsOn: TOMORROW,
      until: [expect.objectContaining({ id: schedule.id, time: "08:30" })],
    });
  });

  it("rule move-logs: the change starts today and the taken log moves to the new row", async () => {
    const { phase, schedule, inv } = await seedTaken();
    const stockBefore = await stock(inv.id);
    const log = await db.doseLogs.where("scheduleId").equals(schedule.id).first();

    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], {
      changeDayRule: "move-logs",
    });
    expect(res).toMatchObject({ success: true, data: { scheduleChange: { applyFrom: TODAY } } });

    // Still one dose today and it is taken (its 5 mg snapshot), not open.
    expect(await day(TODAY)).toEqual(["09:00 5mg taken"]);
    const moved = await db.doseLogs.get(log!.id);
    expect(moved!.scheduleId).not.toBe(schedule.id);
    expect(moved!.status).toBe("taken");
    expect(await day(TOMORROW)).toEqual(["09:00 10mg pending"]);
    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await stock(inv.id)).toBe(stockBefore);
  });

  it("an untouched second time of the same medicine changes today under both rules", async () => {
    for (const rule of ["start-next-day", "move-logs"] as const) {
      await db.delete();
      await db.open();
      const { phase, schedule } = await seedTaken();
      const evening = makePhaseSchedule(phase.id, {
        time: "20:00",
        dosage: 5,
        anchorTimezone: TZ,
        createdAt: at(0, 0, -30),
      });
      await db.phaseSchedules.add(evening);
      await edit(
        phase.id,
        [
          { id: schedule.id, time: "08:30", dosage: 5 },
          { id: evening.id, time: "21:00", dosage: 5 },
        ],
        { changeDayRule: rule },
      );
      expect(await day(TODAY)).toEqual(["08:30 5mg taken", "21:00 5mg pending"]);
    }
  });
});

describe("start-next-day: the whole change starts on one day", () => {
  async function seedTaken() {
    const seeded = await seedMed();
    vi.setSystemTime(at(8, 35));
    await takeDose({
      prescriptionId: seeded.rx.id,
      phaseId: seeded.phase.id,
      scheduleId: seeded.schedule.id,
      date: TODAY,
      time: "08:30",
      dosageMg: 5,
    });
    vi.setSystemTime(at(10, 0));
    return seeded;
  }

  it("a dose split in two after today's dose is taken adds nothing today", async () => {
    const { phase, schedule } = await seedTaken();
    await edit(phase.id, [
      { id: schedule.id, time: "08:30", dosage: 2.5 },
      { time: "20:00", dosage: 2.5 },
    ]);
    expect(await day(TODAY)).toEqual(["08:30 5mg taken"]);
    expect(await day(TOMORROW)).toEqual(["08:30 2.5mg pending", "20:00 2.5mg pending"]);
  });

  it("a second edit the same day adds to the pending change, not to today", async () => {
    const { phase, schedule } = await seedTaken();
    await edit(phase.id, [{ id: schedule.id, time: "20:00", dosage: 5 }]);
    const [pending] = await getLatestSchedulesForPhase(phase.id);
    await edit(phase.id, [
      { id: pending!.id, time: "20:00", dosage: 5 },
      { time: "12:00", dosage: 5 },
    ]);
    expect(await day(TODAY)).toEqual(["08:30 5mg taken"]);
    expect(await day(TOMORROW)).toEqual(["12:00 5mg pending", "20:00 5mg pending"]);
  });
});

describe("a second edit while a change is pending", () => {
  it("keeps a dose of the pending row that was moved in and taken", async () => {
    const { rx, phase, schedule, inv } = await seedMed();
    await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: TOMORROW });
    const [b] = await getLatestSchedulesForPhase(phase.id);
    // Tomorrow's 09:00 dose moved to today 20:00 and taken at 20:05.
    const key = { prescriptionId: rx.id, phaseId: phase.id, scheduleId: b!.id, date: TOMORROW, time: "09:00", dosageMg: 10 };
    expect((await rescheduleDose({ ...key, remindAt: at(20, 0) })).success).toBe(true);
    vi.setSystemTime(at(20, 5));
    expect((await takeDose(key)).success).toBe(true);
    const stock = (await db.inventoryItems.get(inv.id))?.currentStock;
    expect(await day(TOMORROW)).toEqual(["09:00 10mg taken"]);

    const res = await edit(phase.id, [{ id: b!.id, time: "10:00", dosage: 10 }]);
    expect(res).toMatchObject({ success: true, data: { scheduleChange: { deferredTo: dayKey(2) } } });
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
    expect(await day(TOMORROW)).toEqual(["09:00 10mg taken"]);
    expect(await day(dayKey(2))).toEqual(["10:00 10mg pending"]);
    expect(await db.phaseSchedules.get(b!.id)).toMatchObject({ deletedAt: null, effectiveTo: dayKey(2) });
    expect((await db.inventoryItems.get(inv.id))?.currentStock).toBe(stock);
  });

  it("an earlier date for a pending unit change keeps the old days in the old unit", async () => {
    const { phase, schedule } = await seedMed();
    const IN_3 = dayKey(3);
    await edit(phase.id, [{ id: schedule.id, time: "08:30", dosage: 5000 }], { unit: "mcg", applyFrom: IN_3 });
    const [b] = await getLatestSchedulesForPhase(phase.id);
    await edit(phase.id, [{ id: b!.id, time: "09:00", dosage: 5000 }], { unit: "mcg", applyFrom: TOMORROW });

    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
    expect(await day(TOMORROW)).toEqual(["09:00 5000mcg pending"]);
    expect(await db.phaseSchedules.get(schedule.id)).toMatchObject({ unit: "mg", effectiveTo: TOMORROW });
  });

  it("a save of the shown schedule (no change) keeps the pending change on its date", async () => {
    const { phase, schedule } = await seedMed();
    const IN_3 = dayKey(3);
    await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: IN_3 });
    const [b] = await getLatestSchedulesForPhase(phase.id);
    const res = await edit(phase.id, [{ id: b!.id, time: "09:00", dosage: 10 }], { applyFrom: IN_3 });
    expect(res).toMatchObject({ success: true, data: { scheduleChange: { unchanged: true } } });
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
    expect(await day(IN_3)).toEqual(["09:00 10mg pending"]);
  });

  it("lists every pending change, also one that only removes a time", async () => {
    const { phase, schedule } = await seedMed();
    const evening = makePhaseSchedule(phase.id, { time: "20:00", dosage: 5, anchorTimezone: TZ, createdAt: at(0, 0, -30) });
    await db.phaseSchedules.add(evening);
    await edit(phase.id, [{ id: schedule.id, time: "08:30", dosage: 5 }], { applyFrom: dayKey(2) });
    const pending = await getPendingScheduleChange(phase.id, TODAY);
    expect(pending?.startsOn).toBe(dayKey(2));
    expect(pending?.until.map((s) => s.time).sort()).toEqual(["08:30", "20:00"]);
    expect(pending?.steps.map((st) => [st.startsOn, st.schedules.map((s) => s.time)])).toEqual([
      [dayKey(2), ["08:30"]],
    ]);

    await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 5 }], { applyFrom: dayKey(4) });
    const two = await getPendingScheduleChange(phase.id, TODAY);
    expect(two?.steps.map((st) => [st.startsOn, st.schedules.map((s) => s.time)])).toEqual([
      [dayKey(2), ["08:30"]],
      [dayKey(4), ["09:00"]],
    ]);
  });
});

describe("a unit change", () => {
  it("from today keeps yesterday in the old unit", async () => {
    const { phase, schedule } = await seedMed();
    await edit(phase.id, [{ id: schedule.id, time: "08:30", dosage: 5 }], { unit: "mcg" });
    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual(["08:30 5mcg pending"]);
  });

  it("from a future date keeps the old unit until then", async () => {
    const { phase, schedule } = await seedMed();
    await edit(phase.id, [{ id: schedule.id, time: "08:30", dosage: 5 }], { unit: "mcg", applyFrom: dayKey(3) });
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
    expect(await day(dayKey(2))).toEqual(["08:30 5mg pending"]);
    expect(await day(dayKey(3))).toEqual(["08:30 5mcg pending"]);
  });
});

describe("Apply from a future date", () => {
  const IN_3 = dayKey(3);

  it("the Today screen shows the old time until that date and the new time from it", async () => {
    const { phase, schedule } = await seedMed();
    const res = await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: IN_3 });
    expect(res).toMatchObject({ success: true, data: { scheduleChange: { applyFrom: IN_3 } } });

    expect(await day(YESTERDAY)).toEqual(["08:30 5mg missed"]);
    expect(await day(TODAY)).toEqual(["08:30 5mg pending"]);
    expect(await day(dayKey(2))).toEqual(["08:30 5mg pending"]);
    expect(await day(IN_3)).toEqual(["09:00 10mg pending"]);
    expect(await day(dayKey(4))).toEqual(["09:00 10mg pending"]);

    // Cards and refill math use today's regimen; the drawer edits the newest.
    expect((await getSchedulesForPhase(phase.id, TODAY)).map((s) => s.time)).toEqual(["08:30"]);
    expect((await getLatestSchedulesForPhase(phase.id)).map((s) => s.time)).toEqual(["09:00"]);
  });

  it("leaves the reminders before that date unchanged", async () => {
    const { phase, schedule } = await seedMed();
    const before = await reminderTimes(7);

    await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: IN_3 });
    const after = await reminderTimes(7);

    for (const k of [TODAY, dayKey(1), dayKey(2)]) {
      expect(after[k]).toEqual(before[k]);
      expect(after[k]).toEqual(["08:30 5mg"]);
    }
    for (const k of [IN_3, dayKey(4), dayKey(5), dayKey(6)]) expect(after[k]).toEqual(["09:00 10mg"]);

    // The repeat-reminder path (after dose logs) agrees.
    const occ = await loadReminderOccurrences(await loadReminderDoses(), { from: Date.now(), days: 7, deviceTz: TZ });
    expect(occ.filter((o) => o.dateKey < IN_3).every((o) => o.localTime === "08:30")).toBe(true);
    expect(occ.filter((o) => o.dateKey >= IN_3).every((o) => o.localTime === "09:00")).toBe(true);

    // The weekly push template (one week from today's midnight) holds each
    // weekday once: the old time before the date, the new time from it.
    const push = buildWeeklyPushEntries(await loadReminderDoses(), TZ, Date.now());
    expect(push).toHaveLength(7);
  });

  it("analytics count one dose a day, at the old dose before the date and the new one after", async () => {
    const { rx, phase, schedule } = await seedMed();
    await edit(phase.id, [{ id: schedule.id, time: "09:00", dosage: 10 }], { applyFrom: IN_3 });

    // Five days later every day from yesterday to day 4 is over.
    vi.setSystemTime(at(12, 0, 5));
    const range = { start: at(0, 0, -1), end: at(23, 59, 4) };
    const rate = await adherenceRate(range, rx.id);
    // Days -1..4: one missed dose each, never two on one day.
    expect(rate.value.total).toBe(6);
    expect(rate.value.daily.map((d) => d.total)).toEqual([1, 1, 1, 1, 1, 1]);

    const [summary] = await buildMedicationSummary(range, Date.now());
    expect(summary).toMatchObject({ dosesDue: 6, dosesMissed: 6, dose: expect.stringContaining("10") });
  });
});

describe("a running titration phase", () => {
  async function seedRunningTitration() {
    vi.setSystemTime(at(8, 0, -10));
    const rx = makePrescription({ genericName: "Sacubitril", createdAt: at(0, 0, -30) });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(
      makeMedicationPhase(rx.id, { startDate: at(0, 0, -30), createdAt: at(0, 0, -30) }),
    );
    const plan = await createTitrationPlan({
      title: "Step 2",
      conditionLabel: "HF",
      startImmediately: true,
      entries: [{ prescriptionId: rx.id, unit: "mg", schedules: [{ time: "08:30", daysOfWeek: ALL, dosage: 50 }] }],
    });
    if (!plan.success) throw new Error("plan");
    vi.setSystemTime(at(8, 0));
    return { rx, plan: plan.data };
  }

  const entries = (rxId: string, time: string, dosage: number) => [
    { prescriptionId: rxId, unit: "mg", schedules: [{ time, daysOfWeek: ALL, dosage }] },
  ];

  it("an edit applied from a future date keeps the old dose until it (Today and reminders)", async () => {
    const { rx, plan } = await seedRunningTitration();
    const IN_2 = dayKey(2);
    const res = await updateTitrationPlan({ planId: plan.id, entries: entries(rx.id, "09:00", 100), applyFrom: IN_2 });
    expect(res.success).toBe(true);

    expect(await day(YESTERDAY)).toEqual(["08:30 50mg missed"]);
    expect(await day(TODAY)).toEqual(["08:30 50mg pending"]);
    expect(await day(dayKey(1))).toEqual(["08:30 50mg pending"]);
    expect(await day(IN_2)).toEqual(["09:00 100mg pending"]);

    const r = await reminderTimes(4);
    expect(r[dayKey(1)]).toEqual(["08:30 50mg"]);
    expect(r[IN_2]).toEqual(["09:00 100mg"]);
  });

  it("a save with the same entries keeps a pending change on its date", async () => {
    const { rx, plan } = await seedRunningTitration();
    const IN_2 = dayKey(2);
    await updateTitrationPlan({ planId: plan.id, entries: entries(rx.id, "09:00", 100), applyFrom: IN_2 });
    // The drawer re-sends every entry with the date of today (a notes edit).
    await updateTitrationPlan({ planId: plan.id, notes: "Check BP", entries: entries(rx.id, "09:00", 100) });
    expect(await day(TODAY)).toEqual(["08:30 50mg pending"]);
    expect(await day(IN_2)).toEqual(["09:00 100mg pending"]);
  });

  it("an edit applied from today keeps yesterday's dose", async () => {
    const { rx, plan } = await seedRunningTitration();
    await updateTitrationPlan({ planId: plan.id, entries: entries(rx.id, "08:30", 100) });
    expect(await day(YESTERDAY)).toEqual(["08:30 50mg missed"]);
    expect(await day(TODAY)).toEqual(["08:30 100mg pending"]);
  });

  it("a plan that has not started is edited in place", async () => {
    const rx = makePrescription({ createdAt: at(0, 0, -30) });
    await db.prescriptions.add(rx);
    const plan = await createTitrationPlan({
      title: "Later",
      conditionLabel: "HF",
      recommendedStartDate: at(0, 0, 5),
      entries: entries(rx.id, "08:30", 50),
    });
    if (!plan.success) throw new Error("plan");
    const [before] = await db.phaseSchedules.toArray();
    await updateTitrationPlan({ planId: plan.data.id, entries: entries(rx.id, "09:00", 50) });
    const rows = await db.phaseSchedules.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: before!.id, time: "09:00" });
    expect(rows[0]!.effectiveFrom).toBeUndefined();
  });
});

describe("rows written before Apply from", () => {
  it("keep their createdAt/deletedAt dating with no migration", async () => {
    const rx = makePrescription({ createdAt: at(0, 0, -30) });
    const phase = makeMedicationPhase(rx.id, { startDate: at(0, 0, -30) });
    // Replaced two days ago by an in-place era edit: old row tombstoned, new row added.
    const old = makePhaseSchedule(phase.id, {
      time: "08:30",
      anchorTimezone: TZ,
      createdAt: at(0, 0, -30),
      deletedAt: at(9, 0, -2),
      enabled: false,
    });
    const now = makePhaseSchedule(phase.id, { time: "10:00", anchorTimezone: TZ, createdAt: at(9, 0, -2) });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.bulkAdd([old, now]);

    expect(await day(dayKey(-3))).toEqual(["08:30 50mg missed"]);
    expect(await day(dayKey(-1))).toEqual(["10:00 50mg missed"]);
    expect(await day(TODAY)).toEqual(["10:00 50mg pending"]);
  });
});
