import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makeDoseLog,
  makeInventoryItem,
  makeInventoryTransaction,
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import {
  cancelReschedule,
  rescheduleDose,
  rescheduleDoses,
  revertDoseChanges,
  skipDoses,
  takeDose,
  takeDoses,
  untakeDose,
  unskipDoses,
  type DoseKey,
} from "@/lib/dose-log-service";
import { getCarriedOverDoses, getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import { withLiveStatus } from "@/hooks/use-medication-queries";
import { doseStatusLine } from "@/lib/medication-ui-utils";
import { resolveDoseStatus } from "@/lib/dose-status";
import { toLocalDateKey } from "@/lib/date-utils";
import type * as TimezoneModule from "@/lib/timezone";

/**
 * PR 2 acceptance checks for rescheduling: a reschedule moves one dose's
 * reminder to any instant (warnings only), never un-takes a dose, keeps the
 * dose under its original time, restarts the missed timer from the new time
 * and carries a dose into a later day ("From earlier days").
 */

vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimezoneModule>()),
  getDeviceTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A local instant on 2026-10-19 (or `day` days later). */
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const TODAY = toLocalDateKey(at(12, 0));
const TOMORROW = toLocalDateKey(at(12, 0, 1));
const PERIOD = 30;

type Key = DoseKey & { inventoryId: string };

/** One medicine per entry of `times` ("HH:MM", or several for one medicine), 30 pills of 50 mg. */
/** Each medicine's dose keys, in seed order (typed for destructuring up to four). */
type Seeded = [Key[], Key[], Key[], Key[]];

async function seed(meds: string[][], date = TODAY): Promise<Seeded> {
  const out: Key[][] = [];
  for (const [i, times] of meds.entries()) {
    const rx = makePrescription({ genericName: `Med ${i + 1}`, createdAt: at(0, 0, -30) });
    const phase = makeMedicationPhase(rx.id, { startDate: at(0, 0, -30) });
    const inv = makeInventoryItem(rx.id, { brandName: `Brand ${i + 1}`, strength: 50, currentStock: 30 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.inventoryItems.add(inv);
    await db.inventoryTransactions.add(makeInventoryTransaction(inv.id, { amount: 30 }));
    const keys: Key[] = [];
    for (const time of times) {
      const schedule = makePhaseSchedule(phase.id, {
        time,
        anchorTimezone: TZ,
        dosage: 50,
        createdAt: at(0, 0, -30),
      });
      await db.phaseSchedules.add(schedule);
      keys.push({
        prescriptionId: rx.id,
        phaseId: phase.id,
        scheduleId: schedule.id,
        date,
        time,
        dosageMg: 50,
        inventoryId: inv.id,
      });
    }
    out.push(keys);
  }
  return out as Seeded;
}

async function logOf(key: DoseKey) {
  return db.doseLogs.where("[scheduleId+scheduledDate]").equals([key.scheduleId, key.date]).first();
}

async function stockOf(key: { inventoryId: string }) {
  return (await db.inventoryItems.get(key.inventoryId))?.currentStock;
}

/** The live slot of `key` on its day, as the Today screen sees it now. */
async function liveSlot(key: DoseKey) {
  const slots = withLiveStatus(await getDailyDoseSchedule(key.date), Date.now(), PERIOD)!;
  return slots.find((s) => s.scheduleId === key.scheduleId)!;
}

const setNow = (ms: number) => vi.setSystemTime(ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: at(8, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("no time limit: warnings only", () => {
  it("saves at now + 1 min with no warning", async () => {
    const [[key]] = await seed([["08:30"]]);
    const res = await rescheduleDose({ ...key!, remindAt: at(8, 1) });
    expect(res).toMatchObject({ success: true, data: { warnings: [] } });
    expect(await logOf(key!)).toMatchObject({ status: "rescheduled", remindAt: at(8, 1) });
  });

  it('saves at now - 1 hour with the warning "This time has passed"', async () => {
    const [[key]] = await seed([["08:30"]]);
    const res = await rescheduleDose({ ...key!, remindAt: at(7, 0) });
    expect(res.success).toBe(true);
    expect(res.success && res.data.warnings.map((w) => w.kind)).toEqual(["past"]);
    expect((await logOf(key!))?.remindAt).toBe(at(7, 0));
  });

  it("saves at the original time + 3 days (no 24-hour limit)", async () => {
    const [[key]] = await seed([["08:30"]]);
    const res = await rescheduleDose({ ...key!, remindAt: at(8, 30, 3) });
    expect(res.success).toBe(true);
    expect((await logOf(key!))?.remindAt).toBe(at(8, 30, 3));
  });

  it("a future day's dose can be rescheduled", async () => {
    const [[key]] = await seed([["08:30"]], TOMORROW);
    expect((await rescheduleDose({ ...key!, remindAt: at(9, 0, 1) })).success).toBe(true);
  });

  it("a future day's dose cannot move to a day before its own (it could not be taken there)", async () => {
    const [[key]] = await seed([["08:30"]], TOMORROW);
    const res = await rescheduleDose({ ...key!, remindAt: at(20, 0) });
    expect(res).toMatchObject({ success: false, error: "Pick the dose's own day or a later day." });
    expect(await logOf(key!)).toBeUndefined();
    // The bulk path refuses it too, and changes nothing.
    const bulk = await rescheduleDoses([key!], at(20, 0));
    expect(bulk.success).toBe(false);
    expect(await db.doseLogs.count()).toBe(0);
    // Its own day at an earlier time is fine.
    expect((await rescheduleDose({ ...key!, remindAt: at(0, 30, 1) })).success).toBe(true);
  });

  it("today's dose cannot move to yesterday", async () => {
    const [[key]] = await seed([["08:30"]]);
    expect((await rescheduleDose({ ...key!, remindAt: at(22, 0, -1) })).success).toBe(false);
    expect(await logOf(key!)).toBeUndefined();
  });

  it("after the next dose of the same med: the warning shows and the save still happens", async () => {
    const [[morning]] = await seed([["08:30", "20:30"]]);
    const res = await rescheduleDose({ ...morning!, remindAt: at(21, 0) });
    expect(res.success).toBe(true);
    expect(res.success && res.data.warnings).toEqual([
      { kind: "after-next-dose", nextDoseAt: at(20, 30), prescriptionId: morning!.prescriptionId },
    ]);
    expect((await logOf(morning!))?.remindAt).toBe(at(21, 0));
  });

  it("before the next dose of the same med: no warning", async () => {
    const [[morning]] = await seed([["08:30", "20:30"]]);
    const res = await rescheduleDose({ ...morning!, remindAt: at(12, 0) });
    expect(res.success && res.data.warnings).toEqual([]);
  });
});

describe("a taken dose is never rescheduled", () => {
  it('is refused with "Untake the dose first." and keeps its time and stock', async () => {
    const [[key]] = await seed([["08:30"]]);
    await takeDose({ ...key!, takenAt: at(8, 35) });
    const res = await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    expect(res).toMatchObject({ success: false, error: "Untake the dose first." });
    expect(await logOf(key!)).toMatchObject({ status: "taken", actionTimestamp: at(8, 35) });
    expect(await stockOf(key!)).toBe(29);
  });
});

describe("the dose stays under its original time", () => {
  it("rescheduled to 10:00: shown under 08:30 with \"Rescheduled for 10:00\"; due at 10:00", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    const slot = await liveSlot(key!);
    expect(slot).toMatchObject({ localTime: "08:30", scheduledAt: at(8, 30), remindAt: at(10, 0), dueAt: at(10, 0) });
    expect(doseStatusLine(slot)).toMatch(/^Rescheduled for 10:00$/);
  });

  it("a 22:00 dose rescheduled to 00:30 says \"tomorrow\", then \"today\" after midnight", async () => {
    const [[key]] = await seed([["22:00"]]);
    setNow(at(22, 5));
    await rescheduleDose({ ...key!, remindAt: at(0, 30, 1) });
    const before = await liveSlot(key!);
    expect(before.localTime).toBe("22:00");
    expect(doseStatusLine(before)).toBe("Rescheduled for 00:30, tomorrow");

    setNow(at(0, 10, 1));
    const after = await liveSlot(key!);
    expect(after.status).toBe("pending");
    expect(doseStatusLine(after)).toBe("Rescheduled for 00:30, today");
  });
});

describe("missed restarts from the new time", () => {
  it("a dose rescheduled to 10:00 with no action is missed after 10:30, not after 09:00", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    setNow(at(9, 1));
    expect((await liveSlot(key!)).status).toBe("pending");
    setNow(at(10, 30));
    expect((await liveSlot(key!)).status).toBe("pending");
    setNow(at(10, 31));
    expect((await liveSlot(key!)).status).toBe("missed");
  });
});

describe("untake and unskip after a reschedule", () => {
  it("remindAt in the future: the dose goes back to rescheduled", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    setNow(at(9, 0));
    await takeDose(key!);
    await untakeDose(key!);
    expect(await logOf(key!)).toMatchObject({ status: "rescheduled", remindAt: at(10, 0) });
    expect(doseStatusLine(await liveSlot(key!))).toBe("Rescheduled for 10:00");
    expect(await stockOf(key!)).toBe(30);
  });

  it("remindAt in the past: pending, due at the original time, then missed after the period", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(8, 15) });
    setNow(at(8, 20));
    await takeDose(key!);
    setNow(at(8, 40));
    await untakeDose(key!);
    expect((await logOf(key!))?.status).toBe("pending");
    const slot = await liveSlot(key!);
    expect(slot).toMatchObject({ status: "pending", dueAt: at(8, 30) });
    expect(slot.remindAt).toBeUndefined();
    setNow(at(9, 1));
    expect((await liveSlot(key!)).status).toBe("missed");
  });

  it("unskip goes back to rescheduled while remindAt is ahead", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    await skipDoses([key!], { onlyOpen: false });
    expect((await logOf(key!))?.status).toBe("skipped");
    await unskipDoses([key!]);
    expect(await logOf(key!)).toMatchObject({ status: "rescheduled", remindAt: at(10, 0) });
  });
});

describe("bulk reschedule", () => {
  it("moves only the open doses: taken and skipped doses stay unchanged", async () => {
    const [[a], [b], [c], [d]] = await seed([["08:30"], ["08:30"], ["08:30"], ["08:30"]]);
    await takeDose({ ...a!, takenAt: at(8, 35) });
    await skipDoses([b!], { reason: "Cost" });
    const res = await rescheduleDoses([a!, b!, c!, d!], at(10, 0));
    expect(res.success && res.data.changes.map((ch) => ch.key.scheduleId)).toEqual([c!.scheduleId, d!.scheduleId]);
    expect(await logOf(a!)).toMatchObject({ status: "taken", actionTimestamp: at(8, 35) });
    expect(await logOf(b!)).toMatchObject({ status: "skipped", skipReason: "Cost" });
    expect(await logOf(c!)).toMatchObject({ status: "rescheduled", remindAt: at(10, 0) });
    expect(await logOf(d!)).toMatchObject({ status: "rescheduled", remindAt: at(10, 0) });
  });

  it("is all-or-nothing: a failure on dose 3 of 4 changes none", async () => {
    const keys = (await seed([["08:30"], ["08:30"], ["08:30"], ["08:30"]])).map(([k]) => k!);
    const table = db.doseLogs;
    const realAdd = table.add.bind(table);
    let calls = 0;
    const spy = vi.spyOn(table, "add").mockImplementation(((...args: Parameters<typeof table.add>) => {
      calls++;
      if (calls === 3) throw new Error("disk full");
      return realAdd(...args);
    }) as typeof table.add);
    const res = await rescheduleDoses(keys, at(10, 0));
    spy.mockRestore();
    expect(res).toMatchObject({ success: false, error: "Could not save. No dose changed." });
    for (const key of keys) expect(await logOf(key)).toBeUndefined();
  });

  it("Undo restores each dose's previous state exactly, also an earlier reschedule", async () => {
    const [[a], [b]] = await seed([["08:30"], ["08:30"]]);
    await rescheduleDose({ ...a!, remindAt: at(9, 0) });
    const res = await rescheduleDoses([a!, b!], at(10, 0));
    expect(res.success).toBe(true);
    const changes = res.success ? res.data.changes : [];
    const undo = await revertDoseChanges(changes);
    expect(undo).toMatchObject({ success: true, data: { reverted: 2, stale: 0 } });
    expect(await logOf(a!)).toMatchObject({ status: "rescheduled", remindAt: at(9, 0) });
    const bLog = await logOf(b!);
    expect(bLog?.status).toBe("pending");
    expect(bLog?.remindAt).toBeUndefined();
  });

  it("Undo leaves a dose alone when it was rescheduled again since", async () => {
    const [[a]] = await seed([["08:30"]]);
    const res = await rescheduleDoses([a!], at(10, 0));
    await rescheduleDose({ ...a!, remindAt: at(11, 0) });
    const undo = await revertDoseChanges(res.success ? res.data.changes : []);
    expect(undo).toMatchObject({ success: true, data: { reverted: 0, stale: 1 } });
    expect((await logOf(a!))?.remindAt).toBe(at(11, 0));
  });

  it("Take all takes a rescheduled dose with the other open doses", async () => {
    const [[a], [b]] = await seed([["08:30"], ["08:30"]]);
    await rescheduleDose({ ...a!, remindAt: at(10, 0) });
    setNow(at(9, 0));
    const res = await takeDoses([a!, b!]);
    expect(res.success && res.data).toHaveLength(2);
  });
});

describe("Cancel reschedule", () => {
  it("puts the dose back to its original time", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(10, 0) });
    const res = await cancelReschedule(key!);
    expect(res.success && res.data?.before?.remindAt).toBe(at(10, 0));
    const log = await logOf(key!);
    expect(log?.status).toBe("pending");
    expect(log?.remindAt).toBeUndefined();
    expect((await liveSlot(key!)).dueAt).toBe(at(8, 30));
  });
});

describe("legacy rescheduledTo", () => {
  it('a legacy "00:30" log for a 22:00 dose today converts to 00:30 tomorrow', async () => {
    const [[key]] = await seed([["22:00"]]);
    await db.doseLogs.add(
      makeDoseLog(key!.prescriptionId, key!.phaseId, key!.scheduleId, {
        scheduledDate: TODAY,
        scheduledTime: "22:00",
        status: "rescheduled",
        rescheduledTo: "00:30",
        timezone: TZ,
      }),
    );
    const slot = await liveSlot(key!);
    expect(slot).toMatchObject({ localTime: "22:00", remindAt: at(0, 30, 1), dueAt: at(0, 30, 1) });
  });

  it("a legacy log of a past day is ignored and follows the past-day rule", async () => {
    const [[key]] = await seed([["08:30"]], toLocalDateKey(at(12, 0, -1)));
    await db.doseLogs.add(
      makeDoseLog(key!.prescriptionId, key!.phaseId, key!.scheduleId, {
        scheduledDate: key!.date,
        status: "rescheduled",
        rescheduledTo: "10:00",
        timezone: TZ,
      }),
    );
    const slot = await liveSlot(key!);
    expect(slot.remindAt).toBeUndefined();
    expect(slot.status).toBe("missed");
  });
});

describe('"From earlier days"', () => {
  it("a 22:00 dose rescheduled to 00:30 shows after midnight and is not missed", async () => {
    const [[key]] = await seed([["22:00"]]);
    setNow(at(22, 5));
    await rescheduleDose({ ...key!, remindAt: at(0, 30, 1) });

    setNow(at(0, 40, 1));
    const carried = withLiveStatus(await getCarriedOverDoses(TOMORROW), Date.now(), PERIOD)!;
    expect(carried.map((s) => [s.scheduleId, s.scheduledDate, s.localTime, s.status])).toEqual([
      [key!.scheduleId, TODAY, "22:00", "pending"],
    ]);
    // History agrees: the past-day dose is not missed while it waits.
    const log = (await logOf(key!))!;
    expect(resolveDoseStatus(log.status, log.scheduledDate, TOMORROW, { remindAt: log.remindAt, now: Date.now() }))
      .toBe("pending");
    // The original day still shows it as waiting too.
    expect((await liveSlot(key!)).status).toBe("pending");
  });

  it("a dose rescheduled 2 days ahead shows on that day and not before", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(9, 0, 2) });
    expect(await getCarriedOverDoses(TOMORROW)).toEqual([]);
    setNow(at(7, 0, 2));
    const carried = await getCarriedOverDoses(toLocalDateKey(at(12, 0, 2)));
    expect(carried.map((s) => s.scheduleId)).toEqual([key!.scheduleId]);
    expect(withLiveStatus(carried, Date.now(), PERIOD)![0]!.status).toBe("pending");
  });

  it("an action on the carried-over dose writes the same log", async () => {
    const [[key]] = await seed([["22:00"]]);
    setNow(at(22, 5));
    await rescheduleDose({ ...key!, remindAt: at(0, 30, 1) });
    setNow(at(0, 35, 1));
    const [slot] = await getCarriedOverDoses(TOMORROW);
    await takeDose({
      prescriptionId: slot!.prescriptionId,
      phaseId: slot!.phaseId,
      scheduleId: slot!.scheduleId,
      date: slot!.scheduledDate,
      time: slot!.localTime,
      dosageMg: slot!.dosageMg,
    });
    expect(await db.doseLogs.count()).toBe(1);
    expect(await logOf(key!)).toMatchObject({ status: "taken", actionTimestamp: at(0, 35, 1) });
    expect(await getCarriedOverDoses(TOMORROW)).toEqual([]);
  });

  it("a dose moved to 23:50 still shows after midnight while it waits, then leaves after its period", async () => {
    const [[key]] = await seed([["08:30"]]);
    await rescheduleDose({ ...key!, remindAt: at(23, 50) });

    setNow(at(0, 5, 1));
    const carried = withLiveStatus(await getCarriedOverDoses(TOMORROW, undefined, PERIOD), Date.now(), PERIOD)!;
    expect(carried.map((s) => [s.scheduleId, s.scheduledDate, s.status])).toEqual([
      [key!.scheduleId, TODAY, "pending"],
    ]);

    // 00:21: the period after 23:50 has ended. The read may still list it;
    // the live status is missed, so the group (pending only) drops it.
    setNow(at(0, 21, 1));
    const later = withLiveStatus(await getCarriedOverDoses(TOMORROW, undefined, PERIOD), Date.now(), PERIOD)!;
    expect(later.filter((s) => s.status === "pending")).toEqual([]);
    // A dose moved to 23:00 never reaches into the next day with a 30-minute period.
    await rescheduleDose({ ...key!, remindAt: at(23, 0) });
    expect(await getCarriedOverDoses(TOMORROW, undefined, PERIOD)).toEqual([]);
  });

  it("is missed (and leaves the group) after the period from remindAt", async () => {
    const [[key]] = await seed([["22:00"]]);
    setNow(at(22, 5));
    await rescheduleDose({ ...key!, remindAt: at(0, 30, 1) });
    setNow(at(1, 1, 1));
    const carried = withLiveStatus(await getCarriedOverDoses(TOMORROW), Date.now(), PERIOD)!;
    expect(carried.map((s) => s.status)).toEqual(["missed"]);
    const log = (await logOf(key!))!;
    expect(resolveDoseStatus(log.status, log.scheduledDate, TOMORROW, { remindAt: log.remindAt, now: Date.now() }))
      .toBe("missed");
  });
});
