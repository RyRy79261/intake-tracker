import { describe, it, expect } from "vitest";
import {
  getMaintenancePhase,
  getActiveTitrationPhase,
  getPendingTitrationPhase,
  getEffectivePhase,
  formatPillCount,
  formatDoseAmount,
  computeProgress,
  daysOfSupply,
  formatSupplyRemaining,
  averageDailyDosage,
} from "@/lib/medication-ui-utils";
import type { MedicationPhase } from "@/lib/db";
import type { DoseSlot, DoseSlotStatus } from "@/lib/dose-schedule-service";

function phase(overrides: Partial<MedicationPhase>): MedicationPhase {
  return {
    id: "p",
    prescriptionId: "rx",
    type: "maintenance",
    status: "active",
    ...overrides,
  } as MedicationPhase;
}

const maintenanceActive = phase({ id: "m1", type: "maintenance", status: "active" });
const maintenanceInactive = phase({ id: "m2", type: "maintenance", status: "completed" });
const titrationActive = phase({
  id: "t1",
  type: "titration",
  status: "active",
  titrationPlanId: "plan-1",
});
const titrationPending = phase({
  id: "t2",
  type: "titration",
  status: "pending",
  titrationPlanId: "plan-2",
});

describe("getMaintenancePhase", () => {
  it("prefers the active maintenance phase", () => {
    expect(
      getMaintenancePhase([maintenanceInactive, maintenanceActive])?.id,
    ).toBe("m1");
  });

  it("falls back to any maintenance phase", () => {
    expect(getMaintenancePhase([maintenanceInactive])?.id).toBe("m2");
  });

  it("returns undefined when there is none", () => {
    expect(getMaintenancePhase([titrationActive])).toBeUndefined();
  });
});

describe("getActiveTitrationPhase", () => {
  it("finds an active titration phase with a plan", () => {
    expect(getActiveTitrationPhase([titrationActive])?.id).toBe("t1");
  });

  it("ignores a titration phase without a plan id", () => {
    const noPlan = phase({ id: "x", type: "titration", status: "active" });
    expect(getActiveTitrationPhase([noPlan])).toBeUndefined();
  });
});

describe("getPendingTitrationPhase", () => {
  it("finds a pending titration phase with a plan", () => {
    expect(getPendingTitrationPhase([titrationPending])?.id).toBe("t2");
  });

  it("returns undefined when none is pending", () => {
    expect(getPendingTitrationPhase([titrationActive])).toBeUndefined();
  });
});

describe("getEffectivePhase", () => {
  it("prefers an active titration over maintenance", () => {
    expect(
      getEffectivePhase([maintenanceActive, titrationActive])?.id,
    ).toBe("t1");
  });

  it("falls back to maintenance when no titration is active", () => {
    expect(getEffectivePhase([maintenanceActive])?.id).toBe("m1");
  });

  it("falls back to any active phase", () => {
    const otherActive = phase({ id: "o", type: "titration", status: "active" });
    expect(getEffectivePhase([otherActive])?.id).toBe("o");
  });

  it("returns undefined for an empty list", () => {
    expect(getEffectivePhase([])).toBeUndefined();
  });
});

describe("formatPillCount", () => {
  it("formats common single fractions", () => {
    expect(formatPillCount(0.25)).toBe("¼ tablet");
    expect(formatPillCount(0.5)).toBe("½ tablet");
    expect(formatPillCount(0.75)).toBe("¾ tablet");
  });

  it("formats one whole tablet", () => {
    expect(formatPillCount(1)).toBe("1 tablet");
  });

  it("formats multiple whole tablets", () => {
    expect(formatPillCount(3)).toBe("3 tablets");
  });

  it("formats a whole-plus-fraction combo with a space", () => {
    expect(formatPillCount(1.5)).toBe("1 ½ tablets");
    expect(formatPillCount(2.25)).toBe("2 ¼ tablets");
  });

  it("formats an uncommon fraction numerically", () => {
    expect(formatPillCount(0.1)).toBe("0.1 tablets");
  });

  it("never glues the whole part onto a decimal fraction", () => {
    expect(formatPillCount(1.3333)).toBe("1.33 tablets");
    expect(formatPillCount(66.6667)).toBe("66.67 tablets");
    expect(formatPillCount(12.3333)).toBe("12.33 tablets");
  });

  it("carries a fraction that rounds up into the whole part", () => {
    expect(formatPillCount(2.996)).toBe("3 tablets");
  });

  it("drops float noise below a hundredth", () => {
    expect(formatPillCount(12.0001)).toBe("12 tablets");
  });

  it("keeps the sign and whole part of negative stock", () => {
    expect(formatPillCount(-2.5)).toBe("-2 ½ tablets");
    expect(formatPillCount(-0.5)).toBe("-½ tablet");
    expect(formatPillCount(-7)).toBe("-7 tablets");
    expect(formatPillCount(-1.3333)).toBe("-1.33 tablets");
  });

  it("formats zero as plural", () => {
    expect(formatPillCount(0)).toBe("0 tablets");
  });

  it("accepts a noun for stock counts", () => {
    expect(formatPillCount(1, "pill")).toBe("1 pill");
    expect(formatPillCount(12.5, "pill")).toBe("12 ½ pills");
  });

  it("does not print NaN or Infinity", () => {
    expect(formatPillCount(NaN)).not.toMatch(/NaN|Infinity/);
    expect(formatPillCount(-Infinity)).not.toMatch(/NaN|Infinity/);
  });
});

describe("formatDoseAmount", () => {
  function slot(overrides: Partial<DoseSlot>): DoseSlot {
    return {
      dosageMg: 100,
      unit: "mg",
      ...overrides,
    } as DoseSlot;
  }

  const inv = (strength: number, extra: Record<string, unknown> = {}) =>
    ({ strength, unit: "mg", ...extra }) as unknown as NonNullable<DoseSlot["inventory"]>;
  const combo49 = [
    { name: "A", strength: 49 },
    { name: "B", strength: 51 },
  ];

  it("formats a single-tablet dose with the tablet strength", () => {
    expect(
      formatDoseAmount(slot({ dosageMg: 50, pillsPerDose: 1, inventory: inv(50) })),
    ).toBe("1 tablet of 50mg");
  });

  it("formats a single-compound dose without pill count", () => {
    expect(formatDoseAmount(slot({ dosageMg: 50 }))).toBe("50mg");
  });

  it("names the per-tablet strength, not the total, for multiple tablets", () => {
    expect(
      formatDoseAmount(slot({ dosageMg: 200, pillsPerDose: 2, inventory: inv(100) })),
    ).toBe("2 tablets of 100mg (= 200mg)");
  });

  it("names the per-tablet strength for a half tablet", () => {
    expect(
      formatDoseAmount(slot({ dosageMg: 25, pillsPerDose: 0.5, inventory: inv(50) })),
    ).toBe("½ tablet of 50mg (= 25mg)");
  });

  it("uses the inventory compound split for a combo with inventory", () => {
    const s = slot({
      pillsPerDose: 2,
      inventory: inv(100, { compounds: combo49 }),
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("2 tablets of 49/51mg (= 98/102mg)");
  });

  it("scales the active brand's per-pill compounds, not the Rx reference", () => {
    const s = slot({
      dosageMg: 100,
      pillsPerDose: 2,
      inventory: inv(50, {
        compounds: [
          { name: "A", strength: 24 },
          { name: "B", strength: 26 },
        ],
      }),
      prescription: { compounds: combo49 },
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("2 tablets of 24/26mg (= 48/52mg)");
  });

  it("shows the summed dose, not an invented split, for a combo Rx without a brand", () => {
    const s = slot({
      dosageMg: 200,
      prescription: { compounds: combo49 },
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("200mg");
  });

  it("keeps the tablet count when a combo Rx's brand has no compounds", () => {
    const s = slot({
      dosageMg: 100,
      pillsPerDose: 2,
      inventory: inv(50),
      prescription: { compounds: combo49 },
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("2 tablets of 50mg (= 100mg)");
  });

  it("flags a dose that cannot be split cleanly", () => {
    expect(
      formatDoseAmount(slot({ dosageMg: 37, pillsPerDose: 0.37, inventory: inv(100) })),
    ).toBe("0.37 tablets of 100mg (= 37mg) · uneven split");
  });

  it("flags a brand whose tablet strength is unusable instead of counting tablets", () => {
    expect(
      formatDoseAmount(
        slot({ dosageMg: 100, inventory: inv(0), inventoryWarning: "invalid_strength" }),
      ),
    ).toBe("100mg · tablet strength missing");
  });
});

describe("daysOfSupply", () => {
  it("floors stock over daily pills", () => {
    expect(daysOfSupply(10, 3)).toBe(3);
  });

  it("clamps negative stock at 0 days", () => {
    expect(daysOfSupply(-7, 2)).toBe(0);
  });

  it("is infinite when nothing is consumed", () => {
    expect(daysOfSupply(10, 0)).toBe(Infinity);
  });
});

describe("formatSupplyRemaining", () => {
  it("describes positive stock with days left", () => {
    expect(formatSupplyRemaining(10, 5)).toBe("10 pills left (~5 days)");
  });

  it("describes negative stock as out of stock instead of negative days", () => {
    expect(formatSupplyRemaining(-7, 0)).toBe("Out of stock (7 pills over)");
  });

  it("describes zero stock as out of stock", () => {
    expect(formatSupplyRemaining(0, 0)).toBe("Out of stock");
  });
});

describe("averageDailyDosage", () => {
  it("weights each schedule by the weekdays it runs", () => {
    const avg = averageDailyDosage([
      { dosage: 100, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      { dosage: 100, daysOfWeek: [1, 3, 5] },
    ]);
    expect(avg).toBeCloseTo(142.86, 2);
  });

  it("equals the plain sum for every-day schedules", () => {
    expect(
      averageDailyDosage([
        { dosage: 50, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        { dosage: 50, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      ]),
    ).toBe(100);
  });
});

describe("computeProgress", () => {
  function slots(statuses: DoseSlotStatus[]): DoseSlot[] {
    return statuses.map((status) => ({ status }) as DoseSlot);
  }

  it("returns zeros for an empty slot list", () => {
    expect(computeProgress([])).toEqual({
      total: 0,
      taken: 0,
      skipped: 0,
      pending: 0,
      pct: 0,
      allDone: false,
    });
  });

  it("counts taken, skipped, and pending slots", () => {
    const result = computeProgress(
      slots(["taken", "taken", "skipped", "pending"]),
    );
    expect(result.total).toBe(4);
    expect(result.taken).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.pending).toBe(1);
  });

  it("treats missed slots as pending", () => {
    const result = computeProgress(slots(["missed"]));
    expect(result.pending).toBe(1);
    expect(result.allDone).toBe(false);
  });

  it("computes the handled percentage", () => {
    expect(computeProgress(slots(["taken", "skipped", "pending"])).pct).toBe(67);
  });

  it("reports allDone when nothing is pending", () => {
    const result = computeProgress(slots(["taken", "skipped"]));
    expect(result.pct).toBe(100);
    expect(result.allDone).toBe(true);
  });
});
