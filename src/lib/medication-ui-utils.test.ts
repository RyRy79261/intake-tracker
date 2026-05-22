import { describe, it, expect } from "vitest";
import {
  getMaintenancePhase,
  getActiveTitrationPhase,
  getPendingTitrationPhase,
  getEffectivePhase,
  formatPillCount,
  formatDoseAmount,
  computeProgress,
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

  it("formats a whole-plus-fraction combo", () => {
    expect(formatPillCount(1.5)).toBe("1½ tablets");
    expect(formatPillCount(2.25)).toBe("2¼ tablets");
  });

  it("formats an uncommon fraction numerically", () => {
    expect(formatPillCount(0.1)).toBe("0.1 tablets");
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

  it("formats a single-compound dose with pill count", () => {
    expect(formatDoseAmount(slot({ dosageMg: 50, pillsPerDose: 1 }))).toBe(
      "1 tablet of 50mg",
    );
  });

  it("formats a single-compound dose without pill count", () => {
    expect(formatDoseAmount(slot({ dosageMg: 50 }))).toBe("50mg");
  });

  it("uses the inventory compound split for a combo with inventory", () => {
    const s = slot({
      pillsPerDose: 2,
      inventory: {
        compounds: [
          { name: "A", strength: 49 },
          { name: "B", strength: 51 },
        ],
      },
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("2 tablets of 49/51mg");
  });

  it("uses a split dose for a combo prescription without inventory", () => {
    const s = slot({
      dosageMg: 200,
      prescription: {
        compounds: [
          { name: "A", strength: 49 },
          { name: "B", strength: 51 },
        ],
      },
    } as Partial<DoseSlot>);
    expect(formatDoseAmount(s)).toBe("98/102mg");
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
