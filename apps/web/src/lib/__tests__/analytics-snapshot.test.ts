import { describe, it, expect } from "vitest";
import {
  insightsRange,
  snapshotIsEmpty,
  buildAnalyticsSnapshot,
  buildMedicationSummary,
  INSIGHTS_WINDOW_DAYS,
  type IntakeGoals,
} from "@/lib/analytics-snapshot";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";
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
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import { toLocalDateKey } from "@/lib/date-utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TS = 1700000000000;

const GOALS: IntakeGoals = {
  waterLimitMl: 2000,
  sodiumLimitMg: 2300,
  sugarLimitG: 50,
  potassiumLimitMg: 3500,
};

function fullRange(): { start: number; end: number } {
  return { start: BASE_TS - DAY_MS, end: BASE_TS + 10 * DAY_MS };
}

describe("insightsRange", () => {
  it("covers the last whole days and excludes the in-progress day", () => {
    const now = new Date(2023, 10, 14, 15, 30).getTime();
    const range = insightsRange(now);

    // Ends just before today's local midnight, so today's partial bucket
    // never enters per-day counts.
    expect(range.end + 1).toBe(new Date(2023, 10, 14).getTime());
    // Starts on a local midnight exactly INSIGHTS_WINDOW_DAYS days earlier.
    expect(range.start).toBe(
      new Date(2023, 10, 14 - INSIGHTS_WINDOW_DAYS).getTime(),
    );
    expect(Math.round((range.end - range.start) / DAY_MS)).toBe(
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

  it("includes an intake metric with averages over the days each type was logged", async () => {
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
    // Water was logged on 2 days, salt and sugar on 1.
    expect(snapshot.metrics.intake!.avgWaterMl).toBeCloseTo(1500 / 2);
    expect(snapshot.metrics.intake!.waterLoggedDays).toBe(2);
    expect(snapshot.metrics.intake!.avgSodiumMg).toBeCloseTo(800);
    expect(snapshot.metrics.intake!.sodiumLoggedDays).toBe(1);
    expect(snapshot.metrics.intake!.avgSugarG).toBeCloseTo(30);
    expect(snapshot.metrics.intake!.sugarLoggedDays).toBe(1);
    expect(snapshot.metrics.intake!.waterLimitMl).toBe(GOALS.waterLimitMl);
    expect(snapshot.metrics.intake!.waterGoalMl).toBeUndefined();
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

  it("omits limits that are not configured but keeps the logged averages", async () => {
    await db.intakeRecords.bulkAdd([
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), {
      waterLimitMl: 0,
      sodiumLimitMg: 0,
      sugarLimitG: 0,
      potassiumLimitMg: 0,
    });

    expect(snapshot.metrics.intake).toEqual({
      avgWaterMl: 1000,
      waterLoggedDays: 1,
    });
  });

  it("reads the legacy waterGoalMl goal as the fluid limit", async () => {
    await db.intakeRecords.add(
      makeIntakeRecord({ type: "water", amount: 1000, timestamp: BASE_TS }),
    );

    const snapshot = await buildAnalyticsSnapshot(fullRange(), {
      waterGoalMl: 1500,
      sodiumLimitMg: 2000,
      sugarLimitG: 0,
      potassiumLimitMg: 0,
    });

    expect(snapshot.metrics.intake!.waterLimitMl).toBe(1500);
    expect(snapshot.metrics.intake!.waterGoalMl).toBeUndefined();
  });

  it("sends only the intake types that were logged, never zero-filled ones", async () => {
    await db.intakeRecords.add(
      makeIntakeRecord({ type: "sugar", amount: 40, timestamp: BASE_TS }),
    );

    const snapshot = await buildAnalyticsSnapshot(
      fullRange(),
      GOALS,
      undefined,
      undefined,
      BOTH_ON,
    );

    const intake = snapshot.metrics.intake!;
    expect(intake.avgSugarG).toBe(40);
    expect(intake.sugarLoggedDays).toBe(1);
    expect(intake.avgWaterMl).toBeUndefined();
    expect(intake.avgSodiumMg).toBeUndefined();
    expect(intake.waterLimitMl).toBeUndefined();
    expect(intake.sodiumLimitMg).toBeUndefined();
  });

  it("adds caffeine and alcohol daily averages", async () => {
    await db.substanceRecords.bulkAdd([
      makeSubstanceRecord({ type: "caffeine", amountMg: 100, timestamp: BASE_TS }),
      makeSubstanceRecord({ type: "caffeine", amountMg: 100, timestamp: BASE_TS + 60_000 }),
      makeSubstanceRecord({ type: "caffeine", amountMg: 100, timestamp: BASE_TS + DAY_MS }),
      makeSubstanceRecord({
        type: "alcohol",
        amountStandardDrinks: 4,
        timestamp: BASE_TS,
      }),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    const intake = snapshot.metrics.intake!;
    expect(intake.avgCaffeineMg).toBeCloseTo(150);
    expect(intake.caffeineLoggedDays).toBe(2);
    expect(intake.avgAlcoholStdDrinks).toBeCloseTo(4);
    expect(intake.alcoholLoggedDays).toBe(1);
    expect(snapshotIsEmpty(snapshot)).toBe(false);
  });

  it("fits the BP trend slope per day over daily means, not per reading", async () => {
    // A reading of 120 on day 0 and 130 on day 5, then a burst of four more
    // 130 readings on day 5. Per reading index the burst dominates.
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ systolic: 120, diastolic: 80, timestamp: BASE_TS }),
      ...[0, 1, 2, 3, 4].map((i) =>
        makeBloodPressureRecord({
          systolic: 130,
          diastolic: 80,
          timestamp: BASE_TS + 5 * DAY_MS + i * 60_000,
        }),
      ),
    ]);

    const snapshot = await buildAnalyticsSnapshot(fullRange(), GOALS);

    // Two daily means (120, 130) five days apart: +2 mmHg/day.
    expect(snapshot.metrics.bp!.systolicTrend.slope).toBeCloseTo(2, 1);
    expect(snapshot.metrics.bp!.systolicTrend.direction).toBe("rising");
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

describe("buildMedicationSummary", () => {
  // A fixed "now" keeps the window, phase ages and weekdays deterministic.
  const NOW = new Date(2023, 10, 15, 10, 0).getTime(); // Wed 15 Nov 2023
  const RANGE = insightsRange(NOW);

  async function addScheduledRx(
    genericName: string,
    schedules: Array<{ dosage: number; daysOfWeek: number[]; time?: string }>,
    phaseOverrides: Parameters<typeof makeMedicationPhase>[1] = {},
  ) {
    const rx = makePrescription({ genericName, createdAt: NOW - 300 * DAY_MS });
    await db.prescriptions.add(rx);
    const phase = makeMedicationPhase(rx.id, {
      startDate: NOW - 200 * DAY_MS,
      ...phaseOverrides,
    });
    await db.medicationPhases.add(phase);
    const rows = schedules.map((s) => makePhaseSchedule(phase.id, s));
    await db.phaseSchedules.bulkAdd(rows);
    return { rx, phase, schedules: rows };
  }

  it("reports the titration phase over a still-active maintenance phase", async () => {
    const rx = makePrescription({ genericName: "Bisoprolol" });
    await db.prescriptions.add(rx);
    // The maintenance id sorts first, so a naive find() would pick it.
    const maintenance = makeMedicationPhase(rx.id, {
      id: "00000000-0000-4000-8000-000000000001",
      type: "maintenance",
      startDate: NOW - 200 * DAY_MS,
    });
    const titration = makeMedicationPhase(rx.id, {
      id: "ffffffff-0000-4000-8000-000000000001",
      type: "titration",
      titrationPlanId: "plan-1",
      startDate: NOW - 3 * DAY_MS,
    });
    await db.medicationPhases.bulkAdd([maintenance, titration]);
    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(maintenance.id, { dosage: 2.5 }),
      makePhaseSchedule(titration.id, { dosage: 5 }),
    ]);

    const [med] = await buildMedicationSummary(RANGE, NOW);

    expect(med!.phaseType).toBe("titration");
    expect(med!.dose).toBe("5 mg");
    expect(med!.daysOnPhase).toBe(3);
  });

  it("skips soft-deleted prescriptions", async () => {
    const { rx } = await addScheduledRx("Warfarin", [
      { dosage: 5, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    ]);
    await db.prescriptions.update(rx.id, { deletedAt: NOW - DAY_MS });

    expect(await buildMedicationSummary(RANGE, NOW)).toEqual([]);
  });

  it("describes alternate-day doses per weekday instead of 'twice daily'", async () => {
    await addScheduledRx("Warfarin", [
      { dosage: 5, daysOfWeek: [1, 3, 5] },
      { dosage: 2.5, daysOfWeek: [0, 2, 4, 6] },
    ]);

    const [med] = await buildMedicationSummary(RANGE, NOW);

    expect(med!.frequency).toBe("once daily");
    expect(med!.dose).toBe("Mon, Wed, Fri: 5 mg; Tue, Thu, Sat, Sun: 2.5 mg");
  });

  it("describes an extra weekly dose with a per-day total", async () => {
    await addScheduledRx("Furosemide", [
      { dosage: 40, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], time: "08:00" },
      { dosage: 40, daysOfWeek: [1], time: "14:00" },
    ]);

    const [med] = await buildMedicationSummary(RANGE, NOW);

    expect(med!.frequency).toBe(
      "twice a day on Mon; once a day on Tue, Wed, Thu, Fri, Sat, Sun",
    );
    expect(med!.dose).toBe(
      "Mon: 40 mg + 40 mg (80 mg/day); Tue, Wed, Thu, Fri, Sat, Sun: 40 mg",
    );
  });

  it("includes PRN prescriptions with the as-needed doses logged in the window", async () => {
    const rx = makePrescription({
      genericName: "Furosemide",
      createdAt: NOW - 90 * DAY_MS,
    });
    await db.prescriptions.add(rx);
    const prn = (daysAgo: number, overrides: Record<string, unknown> = {}) => {
      const log = makeDoseLog(rx.id, "", "", {
        kind: "prn",
        status: "taken",
        scheduledDate: toLocalDateKey(NOW - daysAgo * DAY_MS),
        doseAmount: 40,
        doseUnit: "mg",
        ...overrides,
      });
      // PRN doses carry no phase or schedule.
      delete log.phaseId;
      delete log.scheduleId;
      return log;
    };
    await db.doseLogs.bulkAdd([
      prn(2),
      prn(5),
      prn(9),
      // Outside the window, and today's (in-progress) dose: not counted.
      prn(60),
      prn(0),
      // Deleted logs never count.
      prn(3, { deletedAt: NOW }),
    ]);

    const [med] = await buildMedicationSummary(RANGE, NOW);

    expect(med).toMatchObject({
      name: "Furosemide",
      phaseType: "prn",
      dose: "40 mg",
      frequency: "as needed",
      prnDoses: 3,
      daysOnPhase: 90,
    });
  });

  it("reports adherence as taken of due doses on completed days of the current phase", async () => {
    // Phase started 5 days ago: 5 completed days (today excluded) of one
    // daily dose are due.
    const { rx, phase, schedules } = await addScheduledRx(
      "Bisoprolol",
      [{ dosage: 5, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }],
      { startDate: NOW - 5 * DAY_MS },
    );
    const taken = (daysAgo: number) =>
      makeDoseLog(rx.id, phase.id, schedules[0]!.id, {
        status: "taken",
        scheduledDate: toLocalDateKey(NOW - daysAgo * DAY_MS),
      });
    // Taken on 3 of the 5 due days, plus today's dose, which is not counted.
    await db.doseLogs.bulkAdd([taken(1), taken(2), taken(4), taken(0)]);

    const [med] = await buildMedicationSummary(RANGE, NOW);

    expect(med!.dosesDue).toBe(5);
    expect(med!.dosesTaken).toBe(3);
  });
});
