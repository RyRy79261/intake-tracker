import { describe, it, expect } from "vitest";
import { db, type InventoryItem } from "@/lib/db";
import {
  computeRefillStatus,
  getRefillStatuses,
  reconcileRefillNotifications,
  type RefillStatus,
} from "@/lib/refill-status";
import {
  makePrescription,
  makeInventoryItem,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

// 50mg pills, 100mg/day under the phase → 2 pills/day.
function fixture(itemOverrides = {}) {
  const phase = makeMedicationPhase("rx-1", { unit: "mg" });
  const schedules = [
    makePhaseSchedule(phase.id, { dosage: 50, time: "08:00" }),
    makePhaseSchedule(phase.id, { dosage: 50, time: "20:00" }),
  ];
  const item = { ...withoutThresholds(makeInventoryItem("rx-1", { strength: 50, unit: "mg", currentStock: 40 })), ...itemOverrides };
  return { phase, schedules, item };
}

/** The fixture sets both refill thresholds; most cases start with none. */
function withoutThresholds(item: InventoryItem): InventoryItem {
  const { refillAlertDays: _days, refillAlertPills: _pills, ...rest } = item;
  return rest;
}

describe("computeRefillStatus", () => {
  it("derives daily pills and whole days of supply from the effective phase", () => {
    const { phase, schedules, item } = fixture({ currentStock: 41 });
    const status = computeRefillStatus(item, phase, schedules);
    expect(status.dailyPills).toBe(2);
    expect(status.daysLeft).toBe(20);
    expect(status.needsRefill).toBe(false);
    expect(status.reason).toBeNull();
  });

  it("flags low stock on the days threshold, not only the pill threshold", () => {
    const { phase, schedules, item } = fixture({ currentStock: 10, refillAlertDays: 7 });
    const status = computeRefillStatus(item, phase, schedules);
    expect(status.daysLeft).toBe(5);
    expect(status.isLow).toBe(true);
    expect(status.reason).toBe("days");
    expect(status.needsRefill).toBe(true);
  });

  it("flags low stock on the pill threshold", () => {
    const { phase, schedules, item } = fixture({ currentStock: 14, refillAlertPills: 14 });
    const status = computeRefillStatus(item, phase, schedules);
    expect(status.isLow).toBe(true);
    expect(status.reason).toBe("pills");
  });

  it("treats a null threshold (pulled row) as unset", () => {
    const { phase, schedules, item } = fixture({
      currentStock: 1,
      refillAlertDays: null as unknown as undefined,
      refillAlertPills: null as unknown as undefined,
    });
    expect(computeRefillStatus(item, phase, schedules).isLow).toBe(false);
  });

  it("reports negative stock separately and clamps days to zero", () => {
    const { phase, schedules, item } = fixture({ currentStock: -7, refillAlertPills: 14 });
    const status = computeRefillStatus(item, phase, schedules);
    expect(status.isNegative).toBe(true);
    expect(status.isLow).toBe(false);
    expect(status.reason).toBe("negative");
    expect(status.needsRefill).toBe(true);
    expect(status.daysLeft).toBe(0);
  });

  it("has no days estimate without an effective phase", () => {
    const { item } = fixture({ refillAlertDays: 7 });
    const status = computeRefillStatus(item, undefined, []);
    expect(status.daysLeft).toBeNull();
    expect(status.dailyPills).toBe(0);
    expect(status.isLow).toBe(false);
  });

  it("ignores deleted, disabled and other-phase schedules", () => {
    const { phase, schedules, item } = fixture();
    const noise = [
      makePhaseSchedule(phase.id, { dosage: 500, deletedAt: 1 }),
      makePhaseSchedule(phase.id, { dosage: 500, enabled: false }),
      makePhaseSchedule("other-phase", { dosage: 500 }),
    ];
    expect(computeRefillStatus(item, phase, [...schedules, ...noise]).dailyPills).toBe(2);
  });

  it("weights schedules by the days of the week they run", () => {
    const { phase, item } = fixture({ currentStock: 10 });
    const schedules = [makePhaseSchedule(phase.id, { dosage: 70, daysOfWeek: [1, 3, 5] })];
    // 70mg × 3/7 = 30mg/day → 0.6 pills/day → 16 days
    expect(computeRefillStatus(item, phase, schedules).daysLeft).toBe(16);
  });

  it("gives no days estimate when the phase unit differs from the pill unit", () => {
    const { phase, schedules, item } = fixture({ unit: "mcg", refillAlertDays: 365 });
    const status = computeRefillStatus(item, phase, schedules);
    expect(status.daysLeft).toBeNull();
    expect(status.isLow).toBe(false);
  });
});

describe("getRefillStatuses", () => {
  it("uses the plan-linked titration phase over a still-active maintenance phase", async () => {
    const rx = makePrescription();
    // Maintenance 50mg/day would give 20 days; titration 200mg/day gives 5.
    const maintenance = makeMedicationPhase(rx.id, { type: "maintenance" });
    const titration = makeMedicationPhase(rx.id, { type: "titration", titrationPlanId: "plan-1" });
    const item = makeInventoryItem(rx.id, {
      strength: 50,
      unit: "mg",
      currentStock: 20,
      isActive: true,
      refillAlertDays: 7,
      refillAlertPills: 1,
    });
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([maintenance, titration]);
    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(maintenance.id, { dosage: 50 }),
      makePhaseSchedule(titration.id, { dosage: 200 }),
    ]);
    await db.inventoryItems.add(item);

    const [entry] = await getRefillStatuses();
    expect(entry?.inventory.id).toBe(item.id);
    expect(entry?.status.daysLeft).toBe(5);
    expect(entry?.status.reason).toBe("days");
  });

  it("skips deleted, inactive, phaseless and brandless prescriptions", async () => {
    const deleted = makePrescription({ deletedAt: 1 });
    const inactive = makePrescription({ isActive: false });
    const phaseless = makePrescription();
    const brandless = makePrescription();
    await db.prescriptions.bulkAdd([deleted, inactive, phaseless, brandless]);
    for (const rx of [deleted, inactive, brandless]) {
      await db.medicationPhases.add(makeMedicationPhase(rx.id));
    }
    for (const rx of [deleted, inactive, phaseless]) {
      await db.inventoryItems.add(makeInventoryItem(rx.id, { isActive: true }));
    }
    // An archived or deleted brand is not the active brand.
    await db.inventoryItems.bulkAdd([
      makeInventoryItem(brandless.id, { isActive: true, isArchived: true }),
      makeInventoryItem(brandless.id, { isActive: true, deletedAt: 1 }),
    ]);

    expect(await getRefillStatuses()).toEqual([]);
  });
});

describe("reconcileRefillNotifications", () => {
  const status = (needsRefill: boolean) => ({ needsRefill }) as RefillStatus;

  it("notifies a prescription once while it stays low", () => {
    const first = reconcileRefillNotifications([], [{ prescriptionId: "rx-1", status: status(true) }]);
    expect(first).toEqual({ toNotify: ["rx-1"], notified: ["rx-1"] });

    const second = reconcileRefillNotifications(first.notified, [{ prescriptionId: "rx-1", status: status(true) }]);
    expect(second).toEqual({ toNotify: [], notified: ["rx-1"] });
  });

  it("re-arms after a refill takes stock back above the threshold", () => {
    const refilled = reconcileRefillNotifications(["rx-1"], [{ prescriptionId: "rx-1", status: status(false) }]);
    expect(refilled).toEqual({ toNotify: [], notified: [] });

    const lowAgain = reconcileRefillNotifications(refilled.notified, [{ prescriptionId: "rx-1", status: status(true) }]);
    expect(lowAgain.toNotify).toEqual(["rx-1"]);
  });
});
