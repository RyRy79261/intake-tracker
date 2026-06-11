import { describe, it, expect } from "vitest";
import {
  insightsRange,
  snapshotIsEmpty,
  buildAnalyticsSnapshot,
  INSIGHTS_WINDOW_DAYS,
  type IntakeGoals,
} from "@/lib/analytics-snapshot";
import type { AnalyticsInsightsRequest } from "@/lib/analytics-insights";
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeUrinationRecord,
  makeSubstanceRecord,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TS = 1700000000000;

const GOALS: IntakeGoals = {
  waterGoalMl: 2000,
  sodiumLimitMg: 2300,
  sugarLimitG: 50,
  potassiumLimitMg: 3500,
};

function fullRange(): { start: number; end: number } {
  return { start: BASE_TS - DAY_MS, end: BASE_TS + 10 * DAY_MS };
}

describe("insightsRange", () => {
  it("spans exactly the rolling window ending at the given time", () => {
    const now = 1_700_000_000_000;
    const range = insightsRange(now);
    expect(range.end).toBe(now);
    expect((range.end - range.start) / (24 * 60 * 60 * 1000)).toBe(
      INSIGHTS_WINDOW_DAYS,
    );
  });
});

describe("snapshotIsEmpty", () => {
  const range = { start: 0, end: 1000 };

  it("is true when no metric group is present", () => {
    expect(snapshotIsEmpty({ range, metrics: {} })).toBe(true);
  });

  it("is true when correlations is present but empty", () => {
    expect(snapshotIsEmpty({ range, metrics: { correlations: [] } })).toBe(
      true,
    );
  });

  it("is false when at least one metric group has data", () => {
    const req: AnalyticsInsightsRequest = {
      range,
      metrics: {
        fluidBalance: { avgBalanceMl: 200, daysOnTarget: 4, daysTotal: 7 },
      },
    };
    expect(snapshotIsEmpty(req)).toBe(false);
  });

  it("is false when bp metric is present", () => {
    const req: AnalyticsInsightsRequest = {
      range,
      metrics: {
        bp: {
          avgSystolic: 120,
          avgDiastolic: 80,
          readingCount: 3,
          systolicTrend: { direction: "stable", slope: 0, confidence: 0 },
          diastolicTrend: { direction: "stable", slope: 0, confidence: 0 },
        },
      },
    };
    expect(snapshotIsEmpty(req)).toBe(false);
  });
});

const BOTH_ON = { sugar: true, potassium: true } as const;

describe("buildAnalyticsSnapshot", () => {
  it("produces an empty snapshot when no data is seeded", async () => {
    const range = fullRange();
    const snapshot = await buildAnalyticsSnapshot(range, GOALS);

    expect(snapshot.range).toEqual(range);
    expect(snapshot.metrics).toEqual({});
    expect(snapshot.profile).toBeUndefined();
    expect(snapshotIsEmpty(snapshot)).toBe(true);
  });

  it("includes the bp metric group from seeded blood pressure records", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ systolic: 118, diastolic: 78, timestamp: BASE_TS }),
      makeBloodPressureRecord({
        systolic: 122,
        diastolic: 82,
        timestamp: BASE_TS + DAY_MS,
      }),
      makeBloodPressureRecord({
        systolic: 130,
        diastolic: 86,
        timestamp: BASE_TS + 2 * DAY_MS,
      }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    expect(snapshot.metrics.bp).toBeDefined();
    expect(snapshot.metrics.bp!.readingCount).toBe(3);
    expect(snapshot.metrics.bp!.avgSystolic).toBeCloseTo((118 + 122 + 130) / 3);
    expect(snapshot.metrics.bp!.avgDiastolic).toBeCloseTo((78 + 82 + 86) / 3);
    expect(snapshotIsEmpty(snapshot)).toBe(false);
  });

  it("includes a weight metric with changeKg between first and last reading", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ weight: 80, timestamp: BASE_TS }),
      makeWeightRecord({ weight: 79, timestamp: BASE_TS + DAY_MS }),
      makeWeightRecord({ weight: 77, timestamp: BASE_TS + 2 * DAY_MS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    expect(snapshot.metrics.weight).toBeDefined();
    expect(snapshot.metrics.weight!.readingCount).toBe(3);
    expect(snapshot.metrics.weight!.min).toBe(77);
    expect(snapshot.metrics.weight!.max).toBe(80);
    expect(snapshot.metrics.weight!.changeKg).toBe(-3); // 77 - 80
  });

  it("includes an intake metric with daily averages over the window", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
      makeIntakeRecord({
        type: "water",
        amount: 500,
        timestamp: BASE_TS + DAY_MS,
      }),
      makeIntakeRecord({ type: "salt", amount: 800, timestamp: BASE_TS }),
      makeIntakeRecord({ type: "sugar", amount: 30, timestamp: BASE_TS }),
    ]);

    const range = fullRange();
    const snapshot = await buildAnalyticsSnapshot(
      range,
      GOALS,
      undefined,
      undefined,
      BOTH_ON,
    );

    expect(snapshot.metrics.intake).toBeDefined();
    const days = Math.max(
      1,
      Math.round((range.end - range.start) / DAY_MS),
    );
    expect(snapshot.metrics.intake!.avgWaterMl).toBeCloseTo(1500 / days);
    expect(snapshot.metrics.intake!.avgSodiumMg).toBeCloseTo(800 / days);
    expect(snapshot.metrics.intake!.avgSugarG).toBeCloseTo(30 / days);
    expect(snapshot.metrics.intake!.waterGoalMl).toBe(GOALS.waterGoalMl);
    expect(snapshot.metrics.intake!.sodiumLimitMg).toBe(GOALS.sodiumLimitMg);
    expect(snapshot.metrics.intake!.sugarLimitG).toBe(GOALS.sugarLimitG);
  });

  it("omits sugar from the intake metric when the tracker is disabled", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
      makeIntakeRecord({ type: "salt", amount: 800, timestamp: BASE_TS }),
      // Pre-existing sugar data — must NOT leak into the snapshot when the
      // user has subsequently disabled the sugar tracker.
      makeIntakeRecord({ type: "sugar", amount: 30, timestamp: BASE_TS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(
      fullRange(),
      GOALS,
      undefined,
      undefined,
      { sugar: false, potassium: false },
    );

    expect(snapshot.metrics.intake).toBeDefined();
    expect(snapshot.metrics.intake!.avgSugarG).toBeUndefined();
    expect(snapshot.metrics.intake!.sugarLimitG).toBeUndefined();
    expect(snapshot.metrics.intake!.avgPotassiumMg).toBeUndefined();
    expect(snapshot.metrics.intake!.potassiumLimitMg).toBeUndefined();
    // Core fields still present.
    expect(snapshot.metrics.intake!.avgWaterMl).toBeGreaterThan(0);
    expect(snapshot.metrics.intake!.avgSodiumMg).toBeGreaterThan(0);
  });

  it("includes potassium in the intake metric only when explicitly enabled", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
      makeIntakeRecord({ type: "salt", amount: 800, timestamp: BASE_TS }),
      makeIntakeRecord({ type: "potassium", amount: 2000, timestamp: BASE_TS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(
      fullRange(),
      GOALS,
      undefined,
      undefined,
      { sugar: false, potassium: true },
    );

    expect(snapshot.metrics.intake!.avgPotassiumMg).toBeGreaterThan(0);
    expect(snapshot.metrics.intake!.potassiumLimitMg).toBe(
      GOALS.potassiumLimitMg,
    );
    expect(snapshot.metrics.intake!.avgSugarG).toBeUndefined();
  });

  it("omits the intake metric when goals are zero", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), {
      waterGoalMl: 0,
      sodiumLimitMg: 0,
      sugarLimitG: 0,
      potassiumLimitMg: 0,
    });

    expect(snapshot.metrics.intake).toBeUndefined();
  });

  it("includes a fluidBalance metric from water intake and urination data", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 2000, timestamp: BASE_TS }),
    ]);
    await db.urinationRecords.bulkAdd([
      makeUrinationRecord({ amountEstimate: "medium", timestamp: BASE_TS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    expect(snapshot.metrics.fluidBalance).toBeDefined();
    expect(snapshot.metrics.fluidBalance!.daysTotal).toBeGreaterThan(0);
  });

  it("attaches conditions to the profile only when provided", async () => {
    const withConditions = await buildAnalyticsSnapshot(
      fullRange(),
      GOALS,
      ["hypertension"],
      false,
    );
    expect(withConditions.profile).toBeDefined();
    expect(withConditions.profile!.conditions).toEqual(["hypertension"]);
    expect(withConditions.profile!.medications).toBeUndefined();

    const withoutConditions = await buildAnalyticsSnapshot(
      fullRange(),
      GOALS,
      [],
      false,
    );
    expect(withoutConditions.profile).toBeUndefined();
  });

  it("includes a correlations group from seeded caffeine and bp records", async () => {
    // Caffeine and systolic BP both rising day over day -> positive coefficient.
    for (let i = 0; i < 6; i++) {
      await db.substanceRecords.add(
        makeSubstanceRecord({
          type: "caffeine",
          amountMg: 100 + i * 50,
          timestamp: BASE_TS + i * DAY_MS,
        }),
      );
      await db.bloodPressureRecords.add(
        makeBloodPressureRecord({
          systolic: 115 + i * 4,
          diastolic: 75 + i * 2,
          timestamp: BASE_TS + i * DAY_MS,
        }),
      );
    }

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    expect(snapshot.metrics.correlations).toBeDefined();
    const caffBp = snapshot.metrics.correlations!.find(
      (c) => c.domainA === "caffeine" && c.domainB === "bp",
    );
    expect(caffBp).toBeDefined();
    expect(caffBp!.pairedDays).toBeGreaterThan(0);
    expect(caffBp!.coefficient).toBeGreaterThanOrEqual(-1);
    expect(caffBp!.coefficient).toBeLessThanOrEqual(1);
    expect(snapshotIsEmpty(snapshot)).toBe(false);
  });

  it("includes medication summary in the profile when includeMedications is true", async () => {
    const rx = makePrescription({ genericName: "Lisinopril" });
    await db.prescriptions.add(rx);
    const phase = makeMedicationPhase(rx.id, {
      type: "maintenance",
      unit: "mg",
      startDate: BASE_TS - 10 * DAY_MS,
    });
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(
      makePhaseSchedule(phase.id, { dosage: 10, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
    );

    const snapshot = await buildAnalyticsSnapshot(
      insightsRange(BASE_TS),
      GOALS,
      [],
      true,
    );

    expect(snapshot.profile).toBeDefined();
    expect(snapshot.profile!.medications).toBeDefined();
    const med = snapshot.profile!.medications!.find(
      (m) => m.name === "Lisinopril",
    );
    expect(med).toBeDefined();
    expect(med!.phaseType).toBe("maintenance");
    expect(med!.dose).toBe("10 mg");
    expect(med!.frequency).toBe("once daily");
    expect(med!.daysOnPhase).toBeGreaterThanOrEqual(9);
  });

  it("omits medications from the profile when includeMedications is false", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const phase = makeMedicationPhase(rx.id);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(makePhaseSchedule(phase.id));

    const snapshot = await buildAnalyticsSnapshot(
      insightsRange(BASE_TS),
      GOALS,
      ["hypertension"],
      false,
    );

    expect(snapshot.profile!.medications).toBeUndefined();
  });
});
