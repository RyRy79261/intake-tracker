/**
 * Builds the numeric analytics snapshot POSTed to `/api/analytics/insights`.
 *
 * Runs the predefined analytics queries against local IndexedDB data and
 * reduces them to the aggregate-only shape the insights endpoint accepts —
 * no raw records or free text leave the device.
 */

import {
  bpTrend,
  weightTrend,
  fluidBalance,
  saltVsWeight,
  sugarVsWeight,
  potassiumVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  getRecordsByDomain,
} from "@/lib/analytics-service";
import { db, type DoseLog, type PhaseSchedule } from "@/lib/db";
import { getActivePrescriptions } from "@/lib/prescription-service";
import { toLocalDateKey } from "@/lib/date-utils";
import { resolveDoseStatus } from "@/lib/dose-status";
import { isLive } from "@intake/core/lifecycle";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import type { DataPoint, TimeRange, TrendDirection } from "@intake/types/analytics";
import {
  MAX_MEDICATION_NAME_CHARS,
  MAX_MEDICATION_DOSE_CHARS,
  MAX_MEDICATION_FREQUENCY_CHARS,
  type AnalyticsInsightsRequest,
} from "@intake/ai-prompts/analytics-insights";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Weekdays in the order regimens are described (Mon first). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

type MedicationSnapshot = NonNullable<
  NonNullable<AnalyticsInsightsRequest["profile"]>["medications"]
>;

/** Local midnight at or before `ts`. */
function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatAmount(amount: number, unit: string): string {
  return `${Math.round(amount * 1000) / 1000} ${unit}`;
}

function timesPerDay(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n}x`;
}

function listDays(days: readonly number[]): string {
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

/**
 * Describe a schedule set per weekday. Schedules are grouped by the doses
 * that fall on each day, so an alternate-day regimen (5 mg Mon/Wed/Fri,
 * 2.5 mg the other days) reads as "once daily" with a per-day dose instead
 * of "twice daily" with an unpaired dose list. Days with several doses carry
 * their daily total.
 */
function describeRegimen(
  schedules: PhaseSchedule[],
  unit: string,
): { dose: string; frequency: string } {
  if (schedules.length === 0) {
    return { dose: "no active schedule", frequency: "no active schedule" };
  }

  const doseGroups = new Map<string, number[]>();
  const countGroups = new Map<number, number[]>();
  for (const day of WEEK_ORDER) {
    const doses = schedules
      .filter((s) => s.daysOfWeek.includes(day))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((s) => s.dosage);
    if (doses.length === 0) continue;

    const total = doses.reduce((sum, d) => sum + d, 0);
    const signature =
      doses.length === 1
        ? formatAmount(doses[0]!, unit)
        : `${doses.map((d) => formatAmount(d, unit)).join(" + ")} (${formatAmount(total, unit)}/day)`;
    doseGroups.set(signature, [...(doseGroups.get(signature) ?? []), day]);
    countGroups.set(doses.length, [...(countGroups.get(doses.length) ?? []), day]);
  }

  const dose =
    doseGroups.size === 1
      ? [...doseGroups.keys()][0]!
      : [...doseGroups]
          .map(([signature, days]) => `${listDays(days)}: ${signature}`)
          .join("; ");

  const countEntries = [...countGroups];
  const frequency =
    countEntries.length === 1 && countEntries[0]![1].length === 7
      ? `${timesPerDay(countEntries[0]![0])} daily`
      : countEntries
          .map(([n, days]) => `${timesPerDay(n)} a day on ${listDays(days)}`)
          .join("; ");

  return { dose, frequency };
}

/** How the logged as-needed doses were sized, e.g. "40 mg" or "20 mg, 40 mg". */
function describePrnDose(logs: DoseLog[]): string {
  const amounts = new Set<string>();
  for (const log of logs) {
    if (log.doseAmount !== undefined && log.doseUnit) {
      amounts.add(formatAmount(log.doseAmount, log.doseUnit));
    } else if (log.doseMg !== undefined) {
      amounts.add(formatAmount(log.doseMg, "mg"));
    }
  }
  return amounts.size > 0 ? [...amounts].sort().join(", ") : "dose not logged";
}

/** Local timestamp of a schedule's "HH:MM" on the given day. */
function slotTime(day: Date, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const slot = new Date(day);
  slot.setHours(h || 0, m || 0, 0, 0);
  return slot.getTime();
}

/**
 * Scheduled doses due on the completed days of the current phase inside the
 * window, split into taken, skipped and missed. A due dose with no taken or
 * skipped log is missed (resolveDoseStatus: every day counted here is past).
 * The phase's schedules only describe the current regimen, so days before
 * the phase started are not counted. Each slot counts once, so duplicate
 * logs can't lift the rate; a taken log beats a skipped one.
 */
function scheduledAdherence(
  phaseId: string,
  phaseStart: number,
  schedules: PhaseSchedule[],
  logs: DoseLog[],
  range: TimeRange,
  now: number,
): { dosesTaken: number; dosesDue: number; dosesSkipped: number; dosesMissed: number } {
  // Per date, the best status logged for each schedule slot.
  const statusByDate = new Map<string, Map<string, string>>();
  for (const log of logs) {
    if (log.kind === "prn" || (log.status !== "taken" && log.status !== "skipped")) continue;
    if (log.phaseId !== phaseId || !log.scheduleId) continue;
    const bySlot = statusByDate.get(log.scheduledDate) ?? new Map<string, string>();
    if (bySlot.get(log.scheduleId) !== "taken") bySlot.set(log.scheduleId, log.status);
    statusByDate.set(log.scheduledDate, bySlot);
  }

  // Only completed days: never today, whose doses are not missed yet.
  const todayKey = toLocalDateKey(now);
  const lastDay = Math.min(range.end, startOfLocalDay(now) - 1);
  let dosesDue = 0;
  let dosesTaken = 0;
  let dosesSkipped = 0;
  let dosesMissed = 0;
  const day = new Date(startOfLocalDay(Math.max(range.start, phaseStart)));
  while (day.getTime() <= lastDay) {
    const dow = day.getDay();
    const dateKey = toLocalDateKey(day);
    // On the day the phase started (phases activate at "now", mid-day), a
    // slot that was already past belonged to the previous phase.
    // A schedule added later has no slot on the days before it (the rule
    // the schedule screen applies), so it can't be missed there.
    const due = schedules.filter(
      (s) =>
        s.daysOfWeek.includes(dow) &&
        slotTime(day, s.time) >= phaseStart &&
        toLocalDateKey(s.createdAt) <= dateKey,
    );
    const logged = statusByDate.get(dateKey);
    for (const s of due) {
      const status = resolveDoseStatus(logged?.get(s.id), dateKey, todayKey);
      dosesDue += 1;
      if (status === "taken") dosesTaken += 1;
      else if (status === "skipped") dosesSkipped += 1;
      else dosesMissed += 1;
    }
    day.setDate(day.getDate() + 1);
  }
  return { dosesTaken, dosesDue, dosesSkipped, dosesMissed };
}

/**
 * Summarise active prescriptions for the insights snapshot. Scheduled
 * prescriptions report their effective phase (a plan-linked titration phase
 * beats a still-active maintenance phase, as on the Medications screen), its
 * per-weekday dose and frequency, how long it has run, and scheduled-dose
 * adherence over the window. As-needed prescriptions with no phase are
 * reported as `prn` with the doses logged in the window.
 */
export async function buildMedicationSummary(
  range: TimeRange = insightsRange(),
  now: number = Date.now(),
): Promise<MedicationSnapshot> {
  const prescriptions = (await getActivePrescriptions()).filter(isLive);
  if (prescriptions.length === 0) return [];

  const ids = prescriptions.map((rx) => rx.id);
  const [phases, logs] = await Promise.all([
    db.medicationPhases.where("prescriptionId").anyOf(ids).toArray(),
    db.doseLogs.where("prescriptionId").anyOf(ids).toArray(),
  ]);
  const schedules = await db.phaseSchedules
    .where("phaseId")
    .anyOf(phases.map((p) => p.id))
    .toArray();

  const firstKey = toLocalDateKey(range.start);
  const lastKey = toLocalDateKey(Math.min(range.end, startOfLocalDay(now) - 1));
  const liveLogsInRange = logs.filter(
    (l) =>
      isLive(l) && l.scheduledDate >= firstKey && l.scheduledDate <= lastKey,
  );

  const meds: MedicationSnapshot = [];

  for (const rx of prescriptions) {
    // genericName is unbounded at entry; the insights/nutrient request
    // schemas require 1-120 chars, so skip nameless prescriptions and clamp
    // the rest rather than letting one record 400 the whole request.
    const name = rx.genericName.trim().slice(0, MAX_MEDICATION_NAME_CHARS);
    if (!name) continue;

    const rxPhases = phases.filter((p) => p.prescriptionId === rx.id);
    const rxLogs = liveLogsInRange.filter((l) => l.prescriptionId === rx.id);
    const prnLogs = rxLogs.filter(
      (l) => l.kind === "prn" && l.status === "taken",
    );
    const phase = selectEffectivePhase(rxPhases);

    if (!phase) {
      // PRN prescriptions are created without a phase. A prescription whose
      // phases have all ended is only reported if it is being used as-needed.
      if (rxPhases.some(isLive) && prnLogs.length === 0) continue;
      meds.push({
        name,
        phaseType: "prn",
        dose: describePrnDose(prnLogs).slice(0, MAX_MEDICATION_DOSE_CHARS),
        frequency: "as needed",
        daysOnPhase: Math.max(0, Math.floor((now - rx.createdAt) / MS_PER_DAY)),
        prnDoses: prnLogs.length,
      });
    } else {
      const phaseSchedules = schedules.filter(
        (s) => s.phaseId === phase.id && s.enabled === true && isLive(s),
      );
      const { dose, frequency } = describeRegimen(phaseSchedules, phase.unit);
      meds.push({
        name,
        phaseType: phase.type,
        dose: dose.slice(0, MAX_MEDICATION_DOSE_CHARS),
        frequency: frequency.slice(0, MAX_MEDICATION_FREQUENCY_CHARS),
        daysOnPhase: Math.max(0, Math.floor((now - phase.startDate) / MS_PER_DAY)),
        ...scheduledAdherence(
          phase.id,
          phase.startDate,
          phaseSchedules,
          rxLogs,
          range,
          now,
        ),
        ...(prnLogs.length > 0 && { prnDoses: prnLogs.length }),
      });
    }
    if (meds.length >= 40) break;
  }

  return meds;
}

/** Insights always analyse a rolling window of this many days. */
export const INSIGHTS_WINDOW_DAYS = 30;

export interface IntakeGoals {
  /** The Settings "Daily Limit (ml)": a fluid ceiling, not a target. */
  waterLimitMl?: number;
  /** @deprecated Old name for `waterLimitMl`; the value was always the limit. */
  waterGoalMl?: number;
  sodiumLimitMg: number;
  sugarLimitG: number;
  potassiumLimitMg: number;
}

/** Which optional trackers are enabled — passed from the client so the
 *  snapshot only includes data and correlations the user actually tracks. */
export interface EnabledOptionalTrackers {
  sugar: boolean;
  potassium: boolean;
}

/**
 * The analysis window: the last INSIGHTS_WINDOW_DAYS whole local days,
 * ending just before today's midnight. Snapping to midnight matches the
 * calendar-day buckets the analytics queries use, so the first and last
 * buckets are full days, and the in-progress day never counts as a missed
 * fluid-balance day or a missed dose.
 */
export function insightsRange(now: number = Date.now()): TimeRange {
  const end = new Date(startOfLocalDay(now));
  const start = new Date(end);
  start.setDate(start.getDate() - INSIGHTS_WINDOW_DAYS);
  return { start: start.getTime(), end: end.getTime() - 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Matches the core `trend()` gates: R² below this reads as 'stable'. */
const MIN_TREND_CONFIDENCE = 0.3;
/** Minimum |slope| per day to call a direction. */
const MIN_TREND_SLOPE_PER_DAY = 0.01;

/**
 * Trend over daily means, regressed on elapsed days, so the slope is in
 * units per day and a burst of readings on one day carries no more weight
 * than a single reading on another. The core `trend()` regresses on reading
 * index, which lets irregular logging distort both direction and confidence.
 */
function dailyTrend(points: DataPoint[]): TrendDirection {
  const byDay = new Map<string, { sumT: number; sumV: number; n: number }>();
  for (const p of points) {
    const key = toLocalDateKey(p.timestamp);
    const acc = byDay.get(key) ?? { sumT: 0, sumV: 0, n: 0 };
    acc.sumT += p.timestamp;
    acc.sumV += p.value;
    acc.n += 1;
    byDay.set(key, acc);
  }
  const pairs = [...byDay.values()].map(
    (a) => [a.sumT / a.n / MS_PER_DAY, a.sumV / a.n] as const,
  );
  if (pairs.length < 2) return { slope: 0, direction: "stable", confidence: 0 };

  const n = pairs.length;
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const confidence = sxx === 0 || syy === 0 ? 0 : clamp((sxy * sxy) / (sxx * syy), 0, 1);
  const direction =
    confidence < MIN_TREND_CONFIDENCE
      ? "stable"
      : slope > MIN_TREND_SLOPE_PER_DAY
        ? "rising"
        : slope < -MIN_TREND_SLOPE_PER_DAY
          ? "falling"
          : "stable";
  return { slope, direction, confidence };
}

function toTrend(t: TrendDirection) {
  return {
    direction: t.direction,
    slope: t.slope,
    confidence: clamp(t.confidence, 0, 1),
  };
}

/** Per-logged-day average and the number of days the domain was logged. */
function loggedDayAverage(
  points: DataPoint[],
): { avg: number; days: number } | null {
  if (points.length === 0) return null;
  const days = new Set(points.map((p) => toLocalDateKey(p.timestamp))).size;
  const total = points.reduce((acc, p) => acc + p.value, 0);
  return { avg: total / days, days };
}

/**
 * Assemble the analytics snapshot for the given range. Metric groups with no
 * underlying data are omitted; `snapshotIsEmpty` reports when nothing remains.
 * Within the intake group, each intake type is present only when it was
 * logged in the range — an absent type means "not logged", never zero.
 *
 * `conditions` and `includeMedications` carry the user-reported medical
 * context, included only when the caller has confirmed the user opted in to
 * sharing each one.
 */
export async function buildAnalyticsSnapshot(
  range: TimeRange,
  goals: IntakeGoals,
  conditions?: string[],
  includeMedications?: boolean,
  enabledTrackers: EnabledOptionalTrackers = { sugar: true, potassium: true },
): Promise<AnalyticsInsightsRequest> {
  const [
    bp,
    weight,
    fluid,
    water,
    salt,
    sugar,
    potassium,
    caffeine,
    alcohol,
    saltWeight,
    sugarWeight,
    potassiumWeight,
    caffBp,
    alcBp,
  ] = await Promise.all([
    bpTrend(range),
    weightTrend(range),
    fluidBalance(range),
    getRecordsByDomain("water", range),
    getRecordsByDomain("salt", range),
    // Skip disabled optional trackers entirely — no point reading data we
    // won't surface, and it keeps the prompt focused on what the user tracks.
    enabledTrackers.sugar ? getRecordsByDomain("sugar", range) : Promise.resolve([]),
    enabledTrackers.potassium ? getRecordsByDomain("potassium", range) : Promise.resolve([]),
    getRecordsByDomain("caffeine", range),
    getRecordsByDomain("alcohol", range),
    saltVsWeight(range),
    enabledTrackers.sugar ? sugarVsWeight(range) : Promise.resolve(null),
    enabledTrackers.potassium ? potassiumVsWeight(range) : Promise.resolve(null),
    caffeineVsBP(range),
    alcoholVsBP(range),
  ]);

  const metrics: AnalyticsInsightsRequest["metrics"] = {};

  if (bp.value.readings.length > 0) {
    const readings = bp.value.readings;
    metrics.bp = {
      avgSystolic: bp.value.avg.systolic,
      avgDiastolic: bp.value.avg.diastolic,
      readingCount: readings.length,
      systolicTrend: toTrend(
        dailyTrend(readings.map((r) => ({ timestamp: r.timestamp, value: r.systolic }))),
      ),
      diastolicTrend: toTrend(
        dailyTrend(readings.map((r) => ({ timestamp: r.timestamp, value: r.diastolic }))),
      ),
    };
  }

  if (weight.value.readings.length > 0) {
    const sorted = [...weight.value.readings].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    metrics.weight = {
      avg: weight.value.avg,
      min: weight.value.min,
      max: weight.value.max,
      changeKg: sorted[sorted.length - 1]!.value - sorted[0]!.value,
      readingCount: sorted.length,
      trend: toTrend(dailyTrend(sorted)),
    };
  }

  if (fluid.value.daysTotal > 0) {
    metrics.fluidBalance = {
      avgBalanceMl: fluid.value.avgBalance,
      daysOnTarget: fluid.value.daysAboveTarget,
      daysTotal: fluid.value.daysTotal,
    };
  }

  const waterLimitMl = goals.waterLimitMl ?? goals.waterGoalMl ?? 0;
  const waterAvg = loggedDayAverage(water);
  const sodiumAvg = loggedDayAverage(salt);
  // Optional trackers are only fetched (and so only present) when enabled.
  const sugarAvg = loggedDayAverage(sugar);
  const potassiumAvg = loggedDayAverage(potassium);
  const caffeineAvg = loggedDayAverage(caffeine);
  const alcoholAvg = loggedDayAverage(alcohol);
  if (waterAvg || sodiumAvg || sugarAvg || potassiumAvg || caffeineAvg || alcoholAvg) {
    metrics.intake = {
      ...(waterAvg && {
        avgWaterMl: waterAvg.avg,
        waterLoggedDays: waterAvg.days,
        ...(waterLimitMl > 0 && { waterLimitMl }),
      }),
      ...(sodiumAvg && {
        avgSodiumMg: sodiumAvg.avg,
        sodiumLoggedDays: sodiumAvg.days,
        ...(goals.sodiumLimitMg > 0 && { sodiumLimitMg: goals.sodiumLimitMg }),
      }),
      ...(sugarAvg && {
        avgSugarG: sugarAvg.avg,
        sugarLoggedDays: sugarAvg.days,
        ...(goals.sugarLimitG > 0 && { sugarLimitG: goals.sugarLimitG }),
      }),
      ...(potassiumAvg && {
        avgPotassiumMg: potassiumAvg.avg,
        potassiumLoggedDays: potassiumAvg.days,
        ...(goals.potassiumLimitMg > 0 && {
          potassiumLimitMg: goals.potassiumLimitMg,
        }),
      }),
      ...(caffeineAvg && {
        avgCaffeineMg: caffeineAvg.avg,
        caffeineLoggedDays: caffeineAvg.days,
      }),
      ...(alcoholAvg && {
        avgAlcoholStdDrinks: alcoholAvg.avg,
        alcoholLoggedDays: alcoholAvg.days,
      }),
    };
  }

  // Optional-tracker correlations are present only when enabled (their
  // upstream queries returned `null` otherwise).
  type CorrEntry = {
    domainA: "salt" | "sugar" | "potassium" | "caffeine" | "alcohol";
    domainB: "weight" | "bp";
    result: { pairedDays: number; coefficient: number; strength: "strong" | "moderate" | "weak" | "none" };
  };
  const correlationCandidates: CorrEntry[] = [
    { domainA: "salt", domainB: "weight", result: saltWeight.value },
    ...(sugarWeight
      ? [{ domainA: "sugar" as const, domainB: "weight" as const, result: sugarWeight.value }]
      : []),
    ...(potassiumWeight
      ? [{ domainA: "potassium" as const, domainB: "weight" as const, result: potassiumWeight.value }]
      : []),
    { domainA: "caffeine", domainB: "bp", result: caffBp.value },
    { domainA: "alcohol", domainB: "bp", result: alcBp.value },
  ];
  const correlations = correlationCandidates
    .filter(
      (c) => c.result.pairedDays > 0 && Number.isFinite(c.result.coefficient),
    )
    .map((c) => ({
      domainA: c.domainA,
      domainB: c.domainB,
      coefficient: clamp(c.result.coefficient, -1, 1),
      strength: c.result.strength,
      pairedDays: c.result.pairedDays,
    }));
  if (correlations.length > 0) {
    metrics.correlations = correlations;
  }

  const snapshot: AnalyticsInsightsRequest = { range, metrics };

  const sharedConditions =
    conditions && conditions.length > 0 ? conditions : [];
  const medications = includeMedications
    ? await buildMedicationSummary(range)
    : [];
  if (sharedConditions.length > 0 || medications.length > 0) {
    snapshot.profile = {
      conditions: sharedConditions,
      ...(medications.length > 0 && { medications }),
    };
  }
  return snapshot;
}

/** True when no metric group survived — there is nothing to summarise. */
export function snapshotIsEmpty(req: AnalyticsInsightsRequest): boolean {
  const m = req.metrics;
  return (
    !m.bp &&
    !m.weight &&
    !m.fluidBalance &&
    !m.intake &&
    !(m.correlations && m.correlations.length > 0)
  );
}
