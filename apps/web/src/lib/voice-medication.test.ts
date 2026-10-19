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

  it("corrects the time of doses already taken, and moves no stock again", async () => {
    await seed("Furosemide", "Lasix", "08:30");
    await saveMedicationPlan(
      await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(8, 35), true),
    );

    const p = await plan({ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }, local(9, 15), true);
    expect(describePlan(p)).toEqual(["Furosemide 50 mg: change time 08:35 → 09:15"]);
    await saveMedicationPlan(p);

    const slot = await slotStatus(TODAY, "Furosemide");
    expect(slot?.existingLog?.actionTimestamp).toBe(local(9, 15));
    expect((await db.inventoryItems.toArray())[0]?.currentStock).toBe(29);
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
