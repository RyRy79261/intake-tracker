import { describe, it, expect } from "vitest";
import { isLive } from "@intake/core/lifecycle";
import {
  selectEffectivePhase,
  selectEffectivePhases,
} from "@intake/core/effective-phase";
import type { MedicationPhase, PhaseSchedule } from "@/lib/db";

function phase(overrides: Partial<MedicationPhase> & { id: string }): MedicationPhase {
  return {
    prescriptionId: "rx-1",
    type: "maintenance",
    unit: "mg",
    startDate: 0,
    foodInstruction: "none",
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    deviceId: "d",
    ...overrides,
  };
}

function schedule(
  overrides: Partial<PhaseSchedule> & { id: string; phaseId: string },
): PhaseSchedule {
  return {
    time: "08:00",
    scheduleTimeUTC: 360,
    anchorTimezone: "Europe/Berlin",
    dosage: 5,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    deviceId: "d",
    ...overrides,
  };
}

describe("isLive", () => {
  it("treats null and undefined deletedAt as live", () => {
    expect(isLive({ deletedAt: null })).toBe(true);
    expect(isLive({ deletedAt: undefined })).toBe(true);
    expect(isLive({})).toBe(true);
  });

  it("treats any numeric deletedAt (including 0) as deleted", () => {
    expect(isLive({ deletedAt: 1 })).toBe(false);
    expect(isLive({ deletedAt: 0 })).toBe(false);
  });
});

describe("selectEffectivePhase", () => {
  it("returns undefined when there is no live active phase", () => {
    expect(selectEffectivePhase([])).toBeUndefined();
    expect(
      selectEffectivePhase([
        phase({ id: "p1", status: "completed" }),
        phase({ id: "p2", status: "pending" }),
        phase({ id: "p3", deletedAt: 5 }),
      ]),
    ).toBeUndefined();
  });

  it("prefers a plan-linked titration phase over maintenance", () => {
    const chosen = selectEffectivePhase([
      phase({ id: "maint" }),
      phase({ id: "tit", type: "titration", titrationPlanId: "plan-1" }),
    ]);
    expect(chosen?.id).toBe("tit");
  });

  it("prefers titration regardless of input order", () => {
    const chosen = selectEffectivePhase([
      phase({ id: "tit", type: "titration", titrationPlanId: "plan-1" }),
      phase({ id: "maint" }),
    ]);
    expect(chosen?.id).toBe("tit");
  });

  it("does not let an unlinked titration phase override maintenance", () => {
    const chosen = selectEffectivePhase([
      phase({ id: "maint" }),
      phase({ id: "tit", type: "titration" }),
    ]);
    expect(chosen?.id).toBe("maint");
  });

  it("ignores a soft-deleted active titration phase", () => {
    const chosen = selectEffectivePhase([
      phase({ id: "maint" }),
      phase({
        id: "tit",
        type: "titration",
        titrationPlanId: "plan-1",
        deletedAt: 10,
      }),
    ]);
    expect(chosen?.id).toBe("maint");
  });

  it("accepts server-shaped rows with null optional fields", () => {
    const chosen = selectEffectivePhase([
      { id: "a", prescriptionId: "rx", type: "maintenance", status: "active", titrationPlanId: null, deletedAt: null },
    ]);
    expect(chosen?.id).toBe("a");
  });
});

describe("selectEffectivePhases", () => {
  it("chooses one phase per prescription and returns its live, enabled schedules", () => {
    const phases = [
      phase({ id: "a-maint", prescriptionId: "rx-a" }),
      phase({
        id: "a-tit",
        prescriptionId: "rx-a",
        type: "titration",
        titrationPlanId: "plan",
      }),
      phase({ id: "b-maint", prescriptionId: "rx-b" }),
      phase({ id: "c-done", prescriptionId: "rx-c", status: "completed" }),
    ];
    const schedules = [
      schedule({ id: "s-a-maint", phaseId: "a-maint" }),
      schedule({ id: "s-a-tit", phaseId: "a-tit" }),
      schedule({ id: "s-a-tit-off", phaseId: "a-tit", enabled: false }),
      schedule({ id: "s-a-tit-del", phaseId: "a-tit", deletedAt: 3 }),
      schedule({ id: "s-b", phaseId: "b-maint" }),
      schedule({ id: "s-c", phaseId: "c-done" }),
    ];

    const result = selectEffectivePhases(phases, schedules);
    const byRx = new Map(result.map((r) => [r.prescriptionId, r]));

    expect(result).toHaveLength(2);
    expect(byRx.get("rx-a")?.phase.id).toBe("a-tit");
    expect(byRx.get("rx-a")?.schedules.map((s) => s.id)).toEqual(["s-a-tit"]);
    expect(byRx.get("rx-b")?.phase.id).toBe("b-maint");
    expect(byRx.get("rx-b")?.schedules.map((s) => s.id)).toEqual(["s-b"]);
    expect(byRx.has("rx-c")).toBe(false);
  });

  it("keeps a chosen phase even when it has no schedules", () => {
    const result = selectEffectivePhases([phase({ id: "p" })], []);
    expect(result).toHaveLength(1);
    expect(result[0]!.schedules).toEqual([]);
  });
});
