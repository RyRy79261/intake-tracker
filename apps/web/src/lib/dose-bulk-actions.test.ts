import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makeInventoryItem,
  makeInventoryTransaction,
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import {
  revertDoseChanges,
  setSkipReason,
  skipDoses,
  takeDose,
  takeDoses,
  unskipDoses,
  untakeDoses,
  type DoseKey,
} from "@/lib/dose-log-service";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import { withLiveStatus } from "@/hooks/use-medication-queries";
import { doseStatusLine } from "@/lib/medication-ui-utils";
import { toLocalDateKey } from "@/lib/date-utils";
import type * as TimezoneModule from "@/lib/timezone";

/**
 * PR 1 acceptance checks for the dose actions: takes record an instant,
 * bulk actions are all-or-nothing and change only the open doses, a take on
 * a taken dose is a no-op, and undo restores the exact previous state.
 */

// Use the process zone for the device zone too, as a real device does.
vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimezoneModule>()),
  getDeviceTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const TODAY = toLocalDateKey(at(12, 0));

/** `n` medicines with one daily 08:30 dose each, 30 pills of 50 mg. */
async function seedSlot(n: number) {
  const keys: (DoseKey & { inventoryId: string })[] = [];
  for (let i = 0; i < n; i++) {
    const rx = makePrescription({ genericName: `Med ${i + 1}`, createdAt: at(0, 0, -30) });
    const phase = makeMedicationPhase(rx.id, { startDate: at(0, 0, -30) });
    const schedule = makePhaseSchedule(phase.id, {
      time: "08:30",
      anchorTimezone: TZ,
      dosage: 50,
      createdAt: at(0, 0, -30),
    });
    const inv = makeInventoryItem(rx.id, { brandName: `Brand ${i + 1}`, strength: 50, currentStock: 30 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(inv);
    await db.inventoryTransactions.add(makeInventoryTransaction(inv.id, { amount: 30 }));
    keys.push({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: TODAY,
      time: "08:30",
      dosageMg: 50,
      inventoryId: inv.id,
    });
  }
  return keys;
}

async function logOf(key: DoseKey) {
  return db.doseLogs.where("[scheduleId+scheduledDate]").equals([key.scheduleId, key.date]).first();
}

async function stockOf(key: { inventoryId: string }) {
  return (await db.inventoryItems.get(key.inventoryId))?.currentStock;
}

function setNow(ms: number) {
  vi.setSystemTime(ms);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: at(9, 0) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("taking a dose records an instant", () => {
  it("an early take at 07:30 records 07:30", async () => {
    const [key] = await seedSlot(1);
    setNow(at(7, 30));
    const result = await takeDoses([key!]);
    expect(result.success).toBe(true);
    expect((await logOf(key!))?.actionTimestamp).toBe(at(7, 30));
  });

  it('"Take at a specific time" accepts 3 days before the dose and a time after now', async () => {
    const [a, b] = await seedSlot(2);
    const threeDaysBefore = at(8, 30, -3);
    expect((await takeDoses([a!], { takenAt: threeDaysBefore })).success).toBe(true);
    expect((await logOf(a!))?.actionTimestamp).toBe(threeDaysBefore);

    const afterNow = at(11, 0); // now is 09:00: only a warning in the sheet
    expect((await takeDoses([b!], { takenAt: afterNow })).success).toBe(true);
    expect((await logOf(b!))?.actionTimestamp).toBe(afterNow);
  });

  it("still refuses a dose of a future day", async () => {
    const [key] = await seedSlot(1);
    const tomorrow = { ...key!, date: toLocalDateKey(at(12, 0, 1)) };
    const result = await takeDoses([tomorrow], { takenAt: at(9, 0) });
    expect(result.success).toBe(false);
    expect(await db.doseLogs.count()).toBe(0);
    expect(await stockOf(key!)).toBe(30);
  });

  it("Take on a taken dose keeps its actionTimestamp and debits no stock", async () => {
    const [key] = await seedSlot(1);
    setNow(at(8, 35));
    await takeDose(key!);
    expect(await stockOf(key!)).toBe(29);

    setNow(at(9, 30));
    const again = await takeDose(key!);
    expect(again.success && again.data.actionTimestamp).toBe(at(8, 35));
    expect((await logOf(key!))?.actionTimestamp).toBe(at(8, 35));
    expect(await stockOf(key!)).toBe(29);
    const consumed = (await db.inventoryTransactions.toArray()).filter((t) => t.type === "consumed");
    expect(consumed).toHaveLength(1);
  });
});

describe("bulk take is all-or-nothing", () => {
  it("a failure on dose 3 of 4 leaves every dose and every stock unchanged", async () => {
    const keys = await seedSlot(4);
    const table = db.phaseSchedules;
    const realGet = table.get.bind(table);
    let calls = 0;
    vi.spyOn(table, "get").mockImplementation(((...args: Parameters<typeof table.get>) => {
      calls++;
      if (calls === 3) throw new Error("disk full");
      return realGet(...args);
    }) as typeof table.get);

    const result = await takeDoses(keys);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Could not save. No dose changed.");
    expect(calls).toBe(3);
    expect(await db.doseLogs.count()).toBe(0);
    for (const key of keys) expect(await stockOf(key)).toBe(30);
    expect((await db.inventoryTransactions.toArray()).filter((t) => t.type === "consumed")).toHaveLength(0);
  });
});

describe("bulk take changes only open doses", () => {
  it("dose 1 taken at 08:35 and dose 2 skipped: at 09:00 only doses 3 and 4 change; undo restores them only", async () => {
    const [d1, d2, d3, d4] = await seedSlot(4);
    setNow(at(8, 35));
    await takeDose(d1!);
    await skipDoses([d2!], { reason: "Cost" });
    const before1 = await logOf(d1!);
    const before2 = await logOf(d2!);

    setNow(at(9, 0));
    const result = await takeDoses([d1!, d2!, d3!, d4!]);
    expect(result.success).toBe(true);
    const changes = result.success ? result.data : [];
    expect(changes.map((c) => c.key.scheduleId)).toEqual([d3!.scheduleId, d4!.scheduleId]);

    expect(await logOf(d1!)).toEqual(before1);
    expect((await logOf(d1!))?.actionTimestamp).toBe(at(8, 35));
    expect(await logOf(d2!)).toEqual(before2);
    expect((await logOf(d2!))?.status).toBe("skipped");
    expect((await logOf(d3!))).toMatchObject({ status: "taken", actionTimestamp: at(9, 0) });
    expect((await logOf(d4!))).toMatchObject({ status: "taken", actionTimestamp: at(9, 0) });
    expect(await stockOf(d3!)).toBe(29);

    const undo = await revertDoseChanges(changes);
    expect(undo.success && undo.data).toEqual({ reverted: 2, stale: 0 });
    expect((await logOf(d3!))?.status).toBe("pending");
    expect((await logOf(d4!))?.status).toBe("pending");
    expect(await stockOf(d3!)).toBe(30);
    expect(await stockOf(d4!)).toBe(30);
    // Doses 1 and 2 are untouched by the undo.
    expect((await logOf(d1!))?.actionTimestamp).toBe(at(8, 35));
    expect(await stockOf(d1!)).toBe(29);
    expect((await logOf(d2!))).toMatchObject({ status: "skipped", skipReason: "Cost" });
  });

  it("Skip all skips only open doses and leaves a taken dose taken", async () => {
    const [d1, d2] = await seedSlot(2);
    setNow(at(8, 35));
    await takeDose(d1!);
    const result = await skipDoses([d1!, d2!]);
    expect(result.success && result.data.map((c) => c.key.scheduleId)).toEqual([d2!.scheduleId]);
    expect((await logOf(d1!))?.status).toBe("taken");
    expect(await stockOf(d1!)).toBe(29);
  });
});

describe("Untake all, Unskip all and their undo", () => {
  it("Untake all refunds the pills; its undo debits them again and restores the taken time", async () => {
    const [d1, d2, d3] = await seedSlot(3);
    setNow(at(8, 35));
    await takeDoses([d1!, d2!]);
    await skipDoses([d3!], { reason: "Cost" });

    setNow(at(9, 0));
    const result = await untakeDoses([d1!, d2!, d3!]);
    const changes = result.success ? result.data : [];
    expect(changes).toHaveLength(2);
    expect(await stockOf(d1!)).toBe(30);
    expect((await logOf(d1!))?.status).toBe("pending");
    expect((await logOf(d3!))?.status).toBe("skipped");

    await revertDoseChanges(changes);
    expect(await logOf(d1!)).toMatchObject({ status: "taken", actionTimestamp: at(8, 35), pillsConsumed: 1 });
    expect(await stockOf(d1!)).toBe(29);
    expect(await stockOf(d2!)).toBe(29);
  });

  it("Unskip all opens the skipped doses and clears the reason; undo restores the reason", async () => {
    const [d1, d2] = await seedSlot(2);
    await skipDoses([d1!, d2!], { reason: "Cost" });
    const result = await unskipDoses([d1!, d2!]);
    const changes = result.success ? result.data : [];
    expect(changes).toHaveLength(2);
    expect(await logOf(d1!)).toMatchObject({ status: "pending" });
    expect((await logOf(d1!))?.skipReason).toBeUndefined();

    await revertDoseChanges(changes);
    expect(await logOf(d1!)).toMatchObject({ status: "skipped", skipReason: "Cost" });
  });

  it("a reason picked after the skip goes on every skipped dose, and Undo still works", async () => {
    const [d1, d2] = await seedSlot(2);
    const result = await skipDoses([d1!, d2!]);
    const changes = result.success ? result.data : [];
    await setSkipReason(changes.map((c) => c.after.id), "Forgot / busy / asleep");
    expect((await logOf(d2!))?.skipReason).toBe("Forgot / busy / asleep");

    const undo = await revertDoseChanges(changes);
    expect(undo.success && undo.data.reverted).toBe(2);
    expect((await logOf(d2!))?.status).toBe("pending");
  });

  it("undo leaves a dose alone that changed since", async () => {
    const [d1] = await seedSlot(1);
    setNow(at(8, 35));
    const result = await takeDoses([d1!]);
    const changes = result.success ? result.data : [];
    await untakeDoses([d1!]);
    await skipDoses([d1!]);

    const undo = await revertDoseChanges(changes);
    expect(undo.success && undo.data).toEqual({ reverted: 0, stale: 1 });
    expect((await logOf(d1!))?.status).toBe("skipped");
  });
});

describe("Missed during the day", () => {
  it("a missed dose can still be taken and then shows Taken at …", async () => {
    const [key] = await seedSlot(1);
    setNow(at(9, 1));
    const [slot] = withLiveStatus(await getDailyDoseSchedule(TODAY), Date.now(), 30)!;
    expect(slot?.status).toBe("missed");
    expect(doseStatusLine(slot!)).toBe("Missed");

    setNow(at(9, 20));
    await takeDoses([key!]);
    const [after] = withLiveStatus(await getDailyDoseSchedule(TODAY), Date.now(), 30)!;
    expect(after?.status).toBe("taken");
    expect(doseStatusLine(after!)).toMatch(/^Taken at /);
  });
});
