import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makeInventoryItem,
  makeInventoryTransaction,
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import { loadVoiceMedicationContext } from "@/hooks/use-voice-medication";
import {
  describePlan,
  matchMedicine,
  medicationDates,
  medicationsForParse,
  planMedicationItem,
  saveMedicationPlan,
  type MedicationPlan,
} from "@/lib/voice-medication";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import { getDoseLogsForDate } from "@/lib/dose-log-service";
import { toLocalDateKey } from "@/lib/date-utils";
import type { MedicationItem } from "@/lib/voice-types";
import type * as TimezoneModule from "@/lib/timezone";

// The node environment has no window, so the app would read the device's zone
// as UTC while Date works on the process zone. Use the process zone for both,
// as a real device does.
vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimezoneModule>()),
  getDeviceTimezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}));

// 2026-10-19 10:00 on the device's clock.
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const TODAY = toLocalDateKey(NOW);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const local = (h: number, m: number, dayOffset = 0) => new Date(2026, 9, 19 + dayOffset, h, m).getTime();

/** A prescription with one daily dose time on the device's clock and 30 pills. */
async function seed(name: string, brand: string, time: string, dosage = 50) {
  const rx = makePrescription({ genericName: name, createdAt: local(0, 0, -30) });
  const phase = makeMedicationPhase(rx.id, { startDate: local(0, 0, -30) });
  const schedule = makePhaseSchedule(phase.id, {
    time,
    anchorTimezone: TZ,
    dosage,
    createdAt: local(0, 0, -30),
  });
  const inv = makeInventoryItem(rx.id, { brandName: brand, strength: 50, currentStock: 30 });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(makeInventoryTransaction(inv.id, { amount: 30 }));
  return { rx, inv };
}

async function context() {
  return loadVoiceMedicationContext(medicationDates([], NOW));
}

async function plan(item: MedicationItem, takenAt = NOW, timeSaid = false): Promise<MedicationPlan> {
  const result = planMedicationItem(item, await context(), takenAt, timeSaid);
  if (!result.ok) throw new Error(result.problem);
  return result.plan;
}

async function problem(item: MedicationItem, takenAt = NOW, timeSaid = false): Promise<string> {
  const result = planMedicationItem(item, await context(), takenAt, timeSaid);
  if (result.ok) throw new Error("expected a problem");
  return result.problem;
}

async function slotStatus(date: string, name: string) {
  const slots = await getDailyDoseSchedule(date);
  return slots.find((s) => s.prescription.genericName === name);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("scheduled doses by voice", () => {
  it("marks every dose of a dose time taken at the time said", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await seed("Spironolactone", "Aldactone", "20:00");

    const p = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(9, 10), true);
    expect(describePlan(p).sort()).toEqual([
      "Furosemide 50 mg: mark taken at 09:10",
      "Sacubitril/Valsartan 50 mg: mark taken at 09:10",
    ]);
    await saveMedicationPlan(p);

    for (const name of ["Furosemide", "Sacubitril/Valsartan"]) {
      const slot = await slotStatus(TODAY, name);
      expect(slot?.status).toBe("taken");
      expect(slot?.existingLog?.actionTimestamp).toBe(local(9, 10));
    }
    expect((await slotStatus(TODAY, "Spironolactone"))?.status).toBe("pending");
    // One pill each came out of stock.
    const lasix = (await db.inventoryItems.toArray()).find((i) => i.brandName === "Lasix");
    expect(lasix?.currentStock).toBe(29);
  });

  it("corrects the time of a taken dose the user names, and moves no stock again", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(8, 35), true),
    );

    const p = await plan(
      { kind: "scheduled_dose", slotTime: "08:30", medicine: "Lasix", action: "taken" },
      local(9, 15),
      true,
    );
    expect(describePlan(p)).toEqual(["Furosemide 50 mg: change time 08:35 → 09:15"]);
    await saveMedicationPlan(p);

    const slot = await slotStatus(TODAY, "Furosemide");
    expect(slot?.existingLog?.actionTimestamp).toBe(local(9, 15));
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(29);
  });

  it("a whole dose time with every dose taken changes nothing: taken doses keep their time", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "Lasix", action: "taken" }, local(8, 35), true),
    );
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "Vymada", action: "taken" }, local(8, 40), true),
    );

    // "Log all my remaining 08:30 meds as taken at 09:00."
    expect(
      await problem({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(9, 0), true),
    ).toBe("Nothing to change: Furosemide already taken at 08:35, Sacubitril/Valsartan already taken at 08:40.");
    expect((await slotStatus(TODAY, "Furosemide"))?.existingLog?.actionTimestamp).toBe(local(8, 35));
    expect((await slotStatus(TODAY, "Sacubitril/Valsartan"))?.existingLog?.actionTimestamp).toBe(local(8, 40));
  });

  it("a stated taken time after now is saved as said", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    // Now is 10:00; the user says 11:00.
    const p = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(11, 0), true);
    expect(describePlan(p)).toEqual(["Furosemide 50 mg: mark taken at 11:00"]);
    await saveMedicationPlan(p);
    expect((await slotStatus(TODAY, "Furosemide"))?.existingLog?.actionTimestamp).toBe(local(11, 0));
  });

  it("refuses a dose of a future day", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const ctx = await loadVoiceMedicationContext(medicationDates([local(9, 0, 1)], NOW));
    const result = planMedicationItem(
      { kind: "scheduled_dose", slotTime: "08:30", action: "taken" },
      ctx,
      local(9, 0, 1),
      true,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(/not due yet/);
  });

  it("saves a row all or nothing: a failure on the second dose leaves the first open", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    const p = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(9, 10), true);

    const table = db.phaseSchedules;
    const realGet = table.get.bind(table);
    let calls = 0;
    const spy = vi.spyOn(table, "get").mockImplementation(((...args: Parameters<typeof table.get>) => {
      calls++;
      if (calls === 2) throw new Error("disk full");
      return realGet(...args);
    }) as typeof table.get);
    await expect(saveMedicationPlan(p)).rejects.toThrow(/No dose changed/);
    spy.mockRestore();

    expect(calls).toBe(2);
    expect(await db.doseLogs.count()).toBe(0);
    for (const item of await db.inventoryItems.toArray()) expect(item.currentStock).toBe(30);
  });

  it("the time choice's Skip saves the open doses as skipped and leaves a taken one", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await seed("Spironolactone", "Aldactone", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "Lasix", action: "taken" }, local(8, 35), true),
    );
    const late = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" });
    expect(late.kind === "scheduled_dose" && late.needsTimeChoice).toBe(true);

    // Skip turns the row into a skip of the same dose time.
    await saveMedicationPlan(await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "skipped" }));
    expect((await slotStatus(TODAY, "Furosemide"))?.existingLog?.actionTimestamp).toBe(local(8, 35));
    expect((await slotStatus(TODAY, "Furosemide"))?.status).toBe("taken");
    expect((await slotStatus(TODAY, "Sacubitril/Valsartan"))?.status).toBe("skipped");
    expect((await slotStatus(TODAY, "Spironolactone"))?.status).toBe("skipped");
  });

  it("a whole dose time said with one dose already taken changes only the open doses", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "Lasix", action: "taken" }, local(8, 35), true),
    );

    // "Log all my remaining 08:30 meds as taken at 09:00."
    const p = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(9, 0), true);
    expect(describePlan(p).sort()).toEqual([
      "Furosemide 50 mg: no change (already taken at 08:35)",
      "Sacubitril/Valsartan 50 mg: mark taken at 09:00",
    ]);
    await saveMedicationPlan(p);
    expect((await slotStatus(TODAY, "Furosemide"))?.existingLog?.actionTimestamp).toBe(local(8, 35));
    expect((await slotStatus(TODAY, "Sacubitril/Valsartan"))?.existingLog?.actionTimestamp).toBe(local(9, 0));
    // One pill came out of Lasix, once.
    const lasix = (await db.inventoryItems.toArray()).find((i) => i.brandName === "Lasix");
    expect(lasix?.currentStock).toBe(29);
  });

  it("a dose time skipped as a whole leaves its taken doses taken", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "Lasix", action: "taken" }, local(8, 35), true),
    );
    await saveMedicationPlan(await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "skipped" }));
    expect((await slotStatus(TODAY, "Furosemide"))?.status).toBe("taken");
    expect((await slotStatus(TODAY, "Sacubitril/Valsartan"))?.status).toBe("skipped");
  });

  it("asks when a late dose was taken if no time was said (the late window)", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const item = { kind: "scheduled_dose", slotTime: "08:30", action: "taken" } as const;

    // 10:00 is past 08:30 + 40 minutes.
    const late = await plan(item);
    expect(late.kind === "scheduled_dose" && late.needsTimeChoice).toBe(true);
    expect(late.kind === "scheduled_dose" && late.dueAt).toBe(local(8, 30));
    await expect(saveMedicationPlan(late)).rejects.toThrow("Pick when you took them first.");

    // "Take now" picked: no choice left, and the save records now.
    const ctx = await context();
    const now = planMedicationItem(item, ctx, NOW, false, { takeNow: true });
    expect(now.ok && now.plan.kind === "scheduled_dose" && now.plan.needsTimeChoice).toBe(false);
    if (now.ok) await saveMedicationPlan(now.plan);
    expect((await slotStatus(TODAY, "Furosemide"))?.existingLog?.actionTimestamp).toBe(NOW);
  });

  it("records now with no choice inside the late window, and when a time is said", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const item = { kind: "scheduled_dose", slotTime: "08:30", action: "taken" } as const;
    const ctx = await context();

    const inWindow = planMedicationItem(item, ctx, local(8, 45), false, { now: local(8, 45) });
    expect(inWindow.ok && inWindow.plan.kind === "scheduled_dose" && inWindow.plan.needsTimeChoice).toBe(false);

    const said = await plan(item, local(9, 30), true);
    expect(said.kind === "scheduled_dose" && said.needsTimeChoice).toBe(false);

    const never = planMedicationItem(item, ctx, NOW, false, { lateWindowMinutes: -1 });
    expect(never.ok && never.plan.kind === "scheduled_dose" && never.plan.needsTimeChoice).toBe(false);
  });

  it("refuses a take that changes nothing", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(8, 35), true),
    );
    expect(await problem({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" })).toBe(
      "Nothing to change: Furosemide already taken at 08:35.",
    );
  });

  it("undoes a taken dose and puts its pill back", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(8, 35), true),
    );
    await saveMedicationPlan(await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "not_taken" }));
    expect((await slotStatus(TODAY, "Furosemide"))?.status).toBe("pending");
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(30);
  });

  it("skips one named medicine of a dose time and leaves the rest", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", medicine: "lasix", action: "skipped" }),
    );
    expect((await slotStatus(TODAY, "Furosemide"))?.status).toBe("skipped");
    expect((await slotStatus(TODAY, "Sacubitril/Valsartan"))?.status).toBe("pending");
  });

  it("finds a named medicine's dose time when none was said", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const p = await plan({ kind: "scheduled_dose", medicine: "Furosemide", action: "taken" });
    expect(p.kind === "scheduled_dose" && p.slotTime).toBe("08:30");
  });

  it("puts doses taken after midnight on the day before", async () => {
    await seed("Spironolactone", "Aldactone", "22:00");
    // 00:30 today: the 22:00 doses are yesterday's.
    const p = await plan({ kind: "scheduled_dose", slotTime: "22:00", action: "taken" }, local(0, 30), true);
    expect(p.kind === "scheduled_dose" && p.date).toBe(toLocalDateKey(local(12, 0, -1)));
  });

  it("refuses a dose time the user does not have", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    expect(await problem({ kind: "scheduled_dose", slotTime: "07:00", action: "taken" })).toBe(
      `You have no doses at 07:00 on ${TODAY}.`,
    );
  });
});

describe("refills by voice", () => {
  it("adds pills to the stock of a medicine on the list", async () => {
    await seed("Sacubitril/Valsartan", "Vymada", "08:30");
    const p = await plan({ kind: "stock_refill", medicine: "Vymada", pills: 100 });
    expect(describePlan(p)).toEqual(["Vymada: add 100 pills (stock 30 → 130)"]);
    await saveMedicationPlan(p);
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(130);
    const refill = (await db.inventoryTransactions.toArray()).find((t) => t.type === "refill");
    expect(refill?.amount).toBe(100);
  });

  it("never creates a medicine or a stock item", async () => {
    expect(await problem({ kind: "stock_refill", medicine: "Atorvastatin", pills: 30 })).toBe(
      '"Atorvastatin" is not on your medication list.',
    );
    expect(await db.prescriptions.count()).toBe(0);
    expect(await db.inventoryItems.count()).toBe(0);
  });
});

describe("extra medicines by voice", () => {
  it("saves a medicine not on the list by name only, with no prescription or stock", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const p = await plan({ kind: "extra_medicine", medicine: "Paracetamol", amount: 1, unit: "tablet" }, local(9, 0), true);
    expect(describePlan(p)).toEqual([
      "Paracetamol 1 tablet: not on your medication list. Saved by name, no stock.",
    ]);
    await saveMedicationPlan(p);

    const [log] = (await getDoseLogsForDate(TODAY)).filter((l) => l.medicineName);
    expect(log).toMatchObject({
      medicineName: "Paracetamol",
      kind: "prn",
      status: "taken",
      doseAmount: 1,
      doseUnit: "tablet",
      actionTimestamp: local(9, 0),
    });
    expect(log?.prescriptionId).toBeUndefined();
    expect(await db.prescriptions.count()).toBe(1);
    expect(await db.inventoryItems.count()).toBe(1);
  });

  it("does not take an extra dose from a medicine whose name only contains the one said", async () => {
    await seed("Paracetamol/Codeine", "Co-codamol", "08:30");
    const p = await plan({ kind: "extra_medicine", medicine: "Paracetamol", amount: 1, unit: "tablet" });
    expect(p.kind === "extra_medicine" && p.prescription).toBeUndefined();
    await saveMedicationPlan(p);
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(30);
  });

  it("logs an extra dose of a medicine on the list from its stock", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    const p = await plan({ kind: "extra_medicine", medicine: "furosemide", amount: 2, unit: "tablet" });
    expect(describePlan(p)).toEqual(["Furosemide 2 tablet: extra dose, 2 pills from Lasix"]);
    await saveMedicationPlan(p);
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(28);
  });
});

describe("matching a spoken name", () => {
  it("matches generic and brand names, loosely, and refuses an ambiguous one", async () => {
    await seed("Metoprolol succinate", "Beloc", "08:00");
    await seed("Metoprolol tartrate", "Lopresor", "20:00");
    const ctx = await context();
    expect(matchMedicine("beloc", ctx)).toMatchObject({ found: true });
    expect(matchMedicine("Metoprolol tartrate", ctx)).toMatchObject({ found: true });
    expect(matchMedicine("metoprolol", ctx)).toEqual({
      found: false,
      ambiguous: expect.arrayContaining(["Metoprolol succinate", "Metoprolol tartrate"]),
    });
  });
});

describe("what the parser is told", () => {
  it("lists each medicine with its brands and today's dose times", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    expect(medicationsForParse(await context(), TODAY)).toEqual([
      { name: "Furosemide", brands: ["Lasix"], doseTimes: ["08:30"] },
    ]);
  });
});
