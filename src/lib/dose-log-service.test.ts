import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  calculatePillsConsumed,
  isCleanFraction,
  getDoseLogsForDate,
  getDoseLog,
  getDoseLogsWithDetailsForDate,
  takeDose,
  untakeDose,
  skipDose,
  rescheduleDose,
  takeAllDoses,
  skipAllDoses,
} from "@/lib/dose-log-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

// ---------------------------------------------------------------------------
// Fractional pill math (pure functions — no DB needed)
// ---------------------------------------------------------------------------

describe("calculatePillsConsumed", () => {
  it("returns 1.0 for equal dose and pill strength", () => {
    expect(calculatePillsConsumed(50, 50)).toBe(1);
  });

  it("returns 0.5 for half-dose", () => {
    expect(calculatePillsConsumed(25, 50)).toBe(0.5);
  });

  it("returns 0.25 for quarter-dose", () => {
    expect(calculatePillsConsumed(12.5, 50)).toBe(0.25);
  });

  it("returns 0.75 for three-quarter dose", () => {
    expect(calculatePillsConsumed(37.5, 50)).toBe(0.75);
  });

  it("returns 1.5 for 75mg from 50mg pill", () => {
    expect(calculatePillsConsumed(75, 50)).toBe(1.5);
  });

  it("returns 0 when pill strength is 0", () => {
    expect(calculatePillsConsumed(50, 0)).toBe(0);
  });

  it("handles very small fractions without floating-point noise", () => {
    // 1/3 pill: 16.667mg from 50mg = 0.3333
    const result = calculatePillsConsumed(16.667, 50);
    expect(result).toBeCloseTo(0.3333, 3);
  });
});

describe("isCleanFraction", () => {
  it("returns true for whole number (1.0)", () => {
    expect(isCleanFraction(1.0)).toBe(true);
  });

  it("returns true for 0.5", () => {
    expect(isCleanFraction(0.5)).toBe(true);
  });

  it("returns true for 0.25", () => {
    expect(isCleanFraction(0.25)).toBe(true);
  });

  it("returns true for 0.75", () => {
    expect(isCleanFraction(0.75)).toBe(true);
  });

  it("returns true for 0.333 (within tolerance)", () => {
    expect(isCleanFraction(0.333)).toBe(true);
  });

  it("returns true for 0.33 (within 0.01 tolerance of 0.333)", () => {
    // |0.33 - 0.333| = 0.003 < 0.01 tolerance
    expect(isCleanFraction(0.33)).toBe(true);
  });

  it("returns false for 0.17 (no matching clean fraction)", () => {
    expect(isCleanFraction(0.17)).toBe(false);
  });

  it("returns true for 2.5 (whole + 0.5)", () => {
    expect(isCleanFraction(2.5)).toBe(true);
  });

  it("returns false for 0.13 (no matching clean fraction)", () => {
    expect(isCleanFraction(0.13)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Seeding helpers
// ---------------------------------------------------------------------------

const DATE = "2023-11-14"; // Tuesday — matches BASE_TS in fixtures
const TIME = "08:00";

async function seedFullPrescription(overrides?: {
  prescriptionId?: string;
  strength?: number;
  dosage?: number;
  initialStock?: number;
}) {
  const rx = makePrescription({
    ...(overrides?.prescriptionId && { id: overrides.prescriptionId }),
  });
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, {
    scheduleTimeUTC: 480, // 08:00 UTC
    anchorTimezone: "UTC",
    ...(overrides?.dosage !== undefined && { dosage: overrides.dosage }),
  });
  const inv = makeInventoryItem(rx.id, {
    strength: overrides?.strength ?? 50,
    currentStock: overrides?.initialStock ?? 30,
    // Dexie indexes booleans as 0/1; the service queries isActive: 1
    // fake-indexeddb needs the numeric value to match .where({ isActive: 1 })
    isActive: 1 as unknown as boolean,
  });
  const txn = makeInventoryTransaction(inv.id, {
    amount: overrides?.initialStock ?? 30,
  });

  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  await db.inventoryItems.add(inv);
  await db.inventoryTransactions.add(txn);

  return { rx, phase, schedule, inv, txn };
}

// ---------------------------------------------------------------------------
// getDoseLogsForDate
// ---------------------------------------------------------------------------

describe("getDoseLogsForDate", () => {
  it("returns logs matching the scheduled date", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: DATE,
      scheduledTime: TIME,
      status: "taken",
    });
    await db.doseLogs.add(log);

    const result = await getDoseLogsForDate(DATE);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(log.id);
  });

  it("excludes logs for other dates", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: "2023-11-15",
      scheduledTime: TIME,
    });
    await db.doseLogs.add(log);

    const result = await getDoseLogsForDate(DATE);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDoseLog
// ---------------------------------------------------------------------------

describe("getDoseLog", () => {
  it("returns the specific log by prescription + phase + schedule + date + time", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: DATE,
      scheduledTime: TIME,
      status: "taken",
    });
    await db.doseLogs.add(log);

    const found = await getDoseLog(rx.id, phase.id, schedule.id, DATE, TIME);
    expect(found).toBeDefined();
    expect(found!.id).toBe(log.id);
  });

  it("returns undefined when no log exists", async () => {
    const found = await getDoseLog("no-rx", "no-phase", "no-sched", DATE, TIME);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDoseLogsWithDetailsForDate
// ---------------------------------------------------------------------------

describe("getDoseLogsWithDetailsForDate", () => {
  it("returns logs with related prescription, phase, and schedule", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: DATE,
      scheduledTime: TIME,
      status: "taken",
    });
    await db.doseLogs.add(log);

    const result = await getDoseLogsWithDetailsForDate(DATE);
    expect(result).toHaveLength(1);
    expect(result[0]!.prescription.id).toBe(rx.id);
    expect(result[0]!.phase.id).toBe(phase.id);
    expect(result[0]!.schedule.id).toBe(schedule.id);
  });

  it("includes inventory item when active and non-archived", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription();
    const log = makeDoseLog(rx.id, phase.id, schedule.id, {
      scheduledDate: DATE,
      scheduledTime: TIME,
      status: "taken",
    });
    await db.doseLogs.add(log);

    const result = await getDoseLogsWithDetailsForDate(DATE);
    expect(result[0]!.inventory).toBeDefined();
    expect(result[0]!.inventory!.id).toBe(inv.id);
  });
});

// ---------------------------------------------------------------------------
// takeDose
// ---------------------------------------------------------------------------

describe("takeDose", () => {
  it("creates a dose log with status 'taken'", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    const result = await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("taken");
      expect(result.data.prescriptionId).toBe(rx.id);
    }
  });

  it("creates an inventory transaction with negative amount equal to pills consumed", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });

    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // pills consumed = 50 / 50 = 1.0
    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();

    // Initial + consumed
    expect(transactions).toHaveLength(2);
    const consumedTxn = transactions.find((t) => t.type === "consumed");
    expect(consumedTxn).toBeDefined();
    expect(consumedTxn!.amount).toBe(-1);
  });

  it("decrements stock correctly for whole pill dose", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });

    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    const updatedInv = await db.inventoryItems.get(inv.id);
    expect(updatedInv!.currentStock).toBe(29);
  });

  it("handles fractional dose (25mg from 50mg pill): transaction amount is -0.5", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({
      strength: 50,
      dosage: 25,
      initialStock: 30,
    });

    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 25,
    });

    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();
    const consumedTxn = transactions.find((t) => t.type === "consumed");
    expect(consumedTxn!.amount).toBe(-0.5);

    const updatedInv = await db.inventoryItems.get(inv.id);
    expect(updatedInv!.currentStock).toBe(29.5);
  });

  it("uses takenAtTime override for actionTimestamp (retroactive logging)", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    const result = await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
      takenAtTime: "07:30",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // The actionTimestamp should be 07:30 on 2023-11-14
      const expected = new Date("2023-11-14T00:00:00");
      expected.setHours(7, 30, 0, 0);
      expect(result.data.actionTimestamp).toBe(expected.getTime());
    }
  });

  it("does not double-deduct stock if dose is already taken", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });
    const input = {
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    };

    await takeDose(input);
    await takeDose(input); // second call

    const updatedInv = await db.inventoryItems.get(inv.id);
    // Only deducted once
    expect(updatedInv!.currentStock).toBe(29);
  });

  it("creates an audit log entry", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    const audits = await db.auditLogs.toArray();
    const doseTakenAudit = audits.find((a) => a.action === "dose_taken");
    expect(doseTakenAudit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// untakeDose
// ---------------------------------------------------------------------------

describe("untakeDose", () => {
  it("resets dose status from 'taken' to 'pending'", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    // First take the dose
    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // Then untake it
    const result = await untakeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("pending");
    }
  });

  it("creates a reverse inventory transaction (positive amount) to restore stock", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });

    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    await untakeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // Stock should be restored to 30
    const updatedInv = await db.inventoryItems.get(inv.id);
    expect(updatedInv!.currentStock).toBe(30);

    // Should have: initial (30) + consumed (-1) + restored (+1)
    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();
    expect(transactions).toHaveLength(3);
    const reverseTxn = transactions.find((t) => t.amount > 0 && t.type === "consumed");
    expect(reverseTxn).toBeDefined();
    expect(reverseTxn!.amount).toBe(1);
  });

  it("untaking a non-taken dose still returns ok (sets to pending)", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    // No prior takeDose — just untake directly
    const result = await untakeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // Service creates a pending log even if there was no prior log
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("pending");
    }
  });
});

// ---------------------------------------------------------------------------
// skipDose
// ---------------------------------------------------------------------------

describe("skipDose", () => {
  it("creates a dose log with status 'skipped' and reason", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    const result = await skipDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
      reason: "Feeling dizzy",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("skipped");
      expect(result.data.skipReason).toBe("Feeling dizzy");
    }
  });

  it("does not create an inventory transaction when skipping", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });

    await skipDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // Should only have the initial transaction
    const transactions = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.type).toBe("initial");

    // Stock unchanged
    const updatedInv = await db.inventoryItems.get(inv.id);
    expect(updatedInv!.currentStock).toBe(30);
  });

  it("reverses stock if previously taken, then sets to skipped", async () => {
    const { rx, phase, schedule, inv } = await seedFullPrescription({ initialStock: 30 });

    // Take first
    await takeDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    // Then skip — should reverse stock
    await skipDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      dosageMg: 50,
    });

    const updatedInv = await db.inventoryItems.get(inv.id);
    expect(updatedInv!.currentStock).toBe(30); // restored

    const log = await getDoseLog(rx.id, phase.id, schedule.id, DATE, TIME);
    expect(log!.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// rescheduleDose
// ---------------------------------------------------------------------------

describe("rescheduleDose", () => {
  it("marks old slot as rescheduled and creates new pending slot", async () => {
    const { rx, phase, schedule } = await seedFullPrescription();

    const result = await rescheduleDose({
      prescriptionId: rx.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date: DATE,
      time: TIME,
      newTime: "14:00",
      dosageMg: 50,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // The returned log is the new slot (pending at 14:00)
      expect(result.data.status).toBe("pending");
      expect(result.data.scheduledTime).toBe("14:00");
    }

    // Old slot should be marked as rescheduled
    const oldLog = await getDoseLog(rx.id, phase.id, schedule.id, DATE, TIME);
    expect(oldLog).toBeDefined();
    expect(oldLog!.status).toBe("rescheduled");
    expect(oldLog!.rescheduledTo).toBe("14:00");
  });
});

// ---------------------------------------------------------------------------
// takeAllDoses
// ---------------------------------------------------------------------------

describe("takeAllDoses", () => {
  it("processes multiple entries, each gets its own dose log", async () => {
    const seed1 = await seedFullPrescription();
    const seed2 = await seedFullPrescription();

    const result = await takeAllDoses(
      [
        {
          prescriptionId: seed1.rx.id,
          phaseId: seed1.phase.id,
          scheduleId: seed1.schedule.id,
          dosageMg: 50,
        },
        {
          prescriptionId: seed2.rx.id,
          phaseId: seed2.phase.id,
          scheduleId: seed2.schedule.id,
          dosageMg: 50,
        },
      ],
      DATE,
      TIME,
    );

    expect(result.success).toBe(true);

    const log1 = await getDoseLog(seed1.rx.id, seed1.phase.id, seed1.schedule.id, DATE, TIME);
    const log2 = await getDoseLog(seed2.rx.id, seed2.phase.id, seed2.schedule.id, DATE, TIME);
    expect(log1!.status).toBe("taken");
    expect(log2!.status).toBe("taken");
  });
});

// ---------------------------------------------------------------------------
// skipAllDoses
// ---------------------------------------------------------------------------

describe("skipAllDoses", () => {
  it("processes multiple entries, each gets skipped status", async () => {
    const seed1 = await seedFullPrescription();
    const seed2 = await seedFullPrescription();

    const result = await skipAllDoses(
      [
        {
          prescriptionId: seed1.rx.id,
          phaseId: seed1.phase.id,
          scheduleId: seed1.schedule.id,
          dosageMg: 50,
        },
        {
          prescriptionId: seed2.rx.id,
          phaseId: seed2.phase.id,
          scheduleId: seed2.schedule.id,
          dosageMg: 50,
        },
      ],
      DATE,
      TIME,
      "Vacation",
    );

    expect(result.success).toBe(true);

    const log1 = await getDoseLog(seed1.rx.id, seed1.phase.id, seed1.schedule.id, DATE, TIME);
    const log2 = await getDoseLog(seed2.rx.id, seed2.phase.id, seed2.schedule.id, DATE, TIME);
    expect(log1!.status).toBe("skipped");
    expect(log2!.status).toBe("skipped");
    expect(log1!.skipReason).toBe("Vacation");
  });
});
