/**
 * PROTOTYPE — throwaway. Insights engine for the Metrics "insights" redesign.
 *
 * Question this prototype answers: "What should the insights screen show so it
 * is useful beyond averages?" Three layout variants (variant-*.tsx) render the
 * same output of this module.
 *
 * Pure functions only (no DOM, no Dexie, no React): the variants feed it the
 * raw records, so the validated parts can be lifted into @intake/core later.
 *
 * Rules every insight follows (from the research in this branch's PR notes):
 * - compare to the user's own baseline, with medians and ranges, not means;
 * - say how many days or readings it rests on, and stay hidden below a minimum;
 * - a fixed list of questions asked in advance — no mining every pair;
 * - "pattern, not proof"; safety messages are fixed text, never advice on doses.
 */

import { logicalDayKey, logicalDayStart, shiftDayKey } from "@intake/core/logical-day";
import type {
  BloodPressureRecord,
  DefecationRecord,
  DoseLog,
  EatingRecord,
  IntakeRecord,
  JournalEntry,
  MedicationPhase,
  PhaseSchedule,
  Prescription,
  SubstanceRecord,
  UrinationRecord,
  WeightRecord,
} from "@intake/types/records";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface EngineInput {
  now: number;
  tz: string;
  dayStartHour: number;
  waterLimit: number; // ml
  saltLimit: number; // mg sodium
  sugarLimit?: number; // g
  potassiumLimit?: number; // mg
  intake: IntakeRecord[];
  eating?: EatingRecord[];
  weight: WeightRecord[];
  bp: BloodPressureRecord[];
  urination: UrinationRecord[];
  defecation: DefecationRecord[];
  substance: SubstanceRecord[];
  doseLogs: DoseLog[];
  phases: MedicationPhase[];
  schedules: PhaseSchedule[];
  prescriptions: Prescription[];
  journal: JournalEntry[];
}

// ---------------------------------------------------------------------------
// What the report covers
// ---------------------------------------------------------------------------

/**
 * The days a report covers: the last `days` complete logical days (ending
 * yesterday, or today with `includeToday`), or the logical days a custom
 * range [start, end] (ms) touches. A bare number means `{ days: n }`.
 */
export type Selection = { days: number; includeToday?: boolean } | { start: number; end: number };

export interface ReportWindow {
  /** First and last selected logical day ("YYYY-MM-DD", inclusive). */
  startKey: string;
  endKey: string;
  /** Number of selected days. */
  period: number;
  /** The day after `endKey`: the last row of `days`, read only for next-morning outcomes. */
  anchorKey: string;
  /** First row of `days`: earlier days feed baselines and comparisons, never the period. */
  firstKey: string;
  nDays: number;
  /** The selected logical days in ms (inclusive), for exports. */
  range: { start: number; end: number };
  /** Every record the engine reads lies in [start, end] ms; doses in [firstKey, lastKey]. */
  load: { start: number; end: number; firstKey: string; lastKey: string };
}

export function resolveSelection(
  ctx: Pick<EngineInput, "now" | "tz" | "dayStartHour">,
  sel: Selection | number,
): ReportWindow {
  const { tz, dayStartHour: dsh } = ctx;
  const today = logicalDayKey(ctx.now, dsh, tz);
  const s: Selection = typeof sel === "number" ? { days: sel } : sel;
  let startKey: string;
  let endKey: string;
  if ("days" in s) {
    endKey = s.includeToday ? today : shiftDayKey(today, -1);
    startKey = shiftDayKey(endKey, -(Math.max(1, Math.round(s.days)) - 1));
  } else {
    endKey = logicalDayKey(s.end, dsh, tz);
    if (endKey > today) endKey = today; // nothing is logged after today
    startKey = logicalDayKey(s.start, dsh, tz);
    if (startKey > endKey) startKey = endKey;
  }
  const period = dateDiffDays(startKey, endKey) + 1;
  const anchorKey = shiftDayKey(endKey, 1);
  const nDays = Math.max(90, 2 * period + 2);
  const firstKey = shiftDayKey(anchorKey, -(nDays - 1));
  return {
    startKey,
    endKey,
    period,
    anchorKey,
    firstKey,
    nDays,
    range: { start: logicalDayStart(startKey, dsh, tz), end: logicalDayStart(anchorKey, dsh, tz) - 1 },
    load: {
      start: logicalDayStart(firstKey, dsh, tz),
      end: logicalDayStart(shiftDayKey(anchorKey, 1), dsh, tz) - 1,
      firstKey,
      lastKey: anchorKey,
    },
  };
}

// ---------------------------------------------------------------------------
// Small stats helpers
// ---------------------------------------------------------------------------

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
export const median = (xs: number[]) => quantile(xs, 0.5);

function mad(xs: number[]): number {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Deterministic RNG so a bootstrap gives the same answer on every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Difference of medians (b − a) with a 90% percentile-bootstrap interval. */
export function medianDiff(a: number[], b: number[], iters = 800) {
  const est = median(b) - median(a);
  const r = rng(a.length * 7919 + b.length * 104729);
  const pick = (xs: number[]) => xs.map(() => xs[Math.floor(r() * xs.length)]!);
  const boots: number[] = [];
  for (let i = 0; i < iters; i++) boots.push(median(pick(b)) - median(pick(a)));
  return { est, lo: quantile(boots, 0.05), hi: quantile(boots, 0.95) };
}

/** Wilson 90% interval for a proportion. */
function wilson(k: number, n: number) {
  if (n === 0) return { p: NaN, lo: NaN, hi: NaN };
  const z = 1.645;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - w), hi: Math.min(1, c + w) };
}

/** Theil–Sen slope (per day) over (x=day index, y). */
function theilSen(pts: { x: number; y: number }[]) {
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      if (pts[j]!.x !== pts[i]!.x) slopes.push((pts[j]!.y - pts[i]!.y) / (pts[j]!.x - pts[i]!.x));
  return median(slopes);
}

export type Confidence = "consistent" | "possible" | "unclear" | "too-little-data";

function confidenceOf(lo: number, hi: number, nMin: number, need: number): Confidence {
  if (nMin < need) return "too-little-data";
  const excludesZero = lo > 0 || hi < 0;
  if (!excludesZero) return "unclear";
  return nMin >= need * 2 ? "consistent" : "possible";
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(tz, f);
  }
  return f;
}
export function localParts(ts: number, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(ts).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}
function dateDiffDays(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Daily table: one row per logical day
// ---------------------------------------------------------------------------

export interface Day {
  key: string;
  water?: number;
  sodium?: number;
  sugar?: number;
  potassium?: number;
  foodItems?: number;
  meals?: number;
  firstMeal?: number; // minutes after midnight
  lastMeal?: number;
  waterAfter18?: number;
  caffeine?: number;
  alcohol?: number; // standard drinks
  urination?: number;
  nightUrination?: number; // 00:00–06:00 on this calendar date (the night before this day)
  defecation?: number;
  weight?: number; // first weight of the day
  amSys?: number; // first BP before 12:00
  amDia?: number;
  amHr?: number;
  pmSys?: number;
  bpCount: number;
  dosesDue: number;
  dosesTaken: number;
  dosesOnTime: number;
  journal: JournalEntry[];
}

/** `nDays` logical days ending with `lastKey` (today by default). */
export function buildDays(inp: EngineInput, nDays: number, lastKey = logicalDayKey(inp.now, inp.dayStartHour, inp.tz)): Day[] {
  const { tz, dayStartHour: dsh } = inp;
  const keys: string[] = [];
  for (let i = nDays - 1; i >= 0; i--) keys.push(shiftDayKey(lastKey, -i));
  const map = new Map<string, Day>(
    keys.map((k) => [
      k,
      { key: k, bpCount: 0, dosesDue: 0, dosesTaken: 0, dosesOnTime: 0, journal: [] },
    ]),
  );
  const dayOf = (ts: number) => map.get(logicalDayKey(ts, dsh, tz));
  const add = (d: Day, k: "water" | "sodium" | "waterAfter18" | "caffeine" | "alcohol" | "urination" | "nightUrination" | "defecation", v: number) => {
    d[k] = (d[k] ?? 0) + v;
  };

  for (const r of inp.intake) {
    const d = dayOf(r.timestamp);
    if (!d) continue;
    if (r.type === "water") {
      add(d, "water", r.amount);
      const h = localParts(r.timestamp, tz).hour;
      if (h >= 18 || h < dsh) add(d, "waterAfter18", r.amount);
    } else if (r.type === "salt") add(d, "sodium", r.amount);
    else if (r.type === "sugar") d.sugar = (d.sugar ?? 0) + r.amount;
    else if (r.type === "potassium") d.potassium = (d.potassium ?? 0) + r.amount;
  }
  // Meals: eating rows more than 90 min apart start a new meal.
  const byDayEat = new Map<string, number[]>();
  for (const r of inp.eating ?? []) {
    const d = dayOf(r.timestamp);
    if (!d) continue;
    d.foodItems = (d.foodItems ?? 0) + 1;
    byDayEat.set(d.key, [...(byDayEat.get(d.key) ?? []), r.timestamp]);
  }
  for (const [k, ts] of byDayEat) {
    const d = map.get(k)!;
    ts.sort((a, b) => a - b);
    let meals = 1;
    for (let i = 1; i < ts.length; i++) if (ts[i]! - ts[i - 1]! > 90 * 60_000) meals++;
    d.meals = meals;
    const mins = (t: number) => {
      const p = localParts(t, tz);
      return (p.hour < dsh ? p.hour + 24 : p.hour) * 60 + p.minute;
    };
    d.firstMeal = mins(ts[0]!);
    d.lastMeal = mins(ts[ts.length - 1]!);
  }
  for (const r of inp.substance) {
    const d = dayOf(r.timestamp);
    if (!d) continue;
    if (r.type === "caffeine") add(d, "caffeine", r.amountMg ?? 0);
    else add(d, "alcohol", r.amountStandardDrinks ?? 0);
  }
  for (const r of inp.urination) {
    const d = dayOf(r.timestamp);
    if (!d) continue;
    add(d, "urination", 1);
  }
  // Night urinations go to the calendar date of their 00:00–06:00 interval,
  // whatever the day start, so one row holds one whole night: the night
  // after day D's evening is on D+1's row.
  for (const r of inp.urination) {
    const p = localParts(r.timestamp, tz);
    if (p.hour >= 6) continue;
    const n = map.get(p.date);
    if (n) add(n, "nightUrination", 1);
  }
  for (const r of inp.defecation) {
    const d = dayOf(r.timestamp);
    if (d) add(d, "defecation", 1);
  }
  for (const r of [...inp.weight].sort((a, b) => a.timestamp - b.timestamp)) {
    const d = dayOf(r.timestamp);
    if (d && d.weight === undefined) d.weight = r.weight;
  }
  for (const r of [...inp.bp].sort((a, b) => a.timestamp - b.timestamp)) {
    const d = dayOf(r.timestamp);
    if (!d) continue;
    d.bpCount++;
    const h = localParts(r.timestamp, tz).hour;
    if (h < 12 && d.amSys === undefined) {
      d.amSys = r.systolic;
      d.amDia = r.diastolic;
      if (r.heartRate) d.amHr = r.heartRate;
    }
    if (h >= 17) d.pmSys = r.systolic;
  }
  for (const l of inp.doseLogs) {
    if (l.kind === "prn" || l.status === "pending") continue;
    const d = map.get(l.scheduledDate);
    if (!d) continue;
    d.dosesDue++;
    if (l.status === "taken") {
      d.dosesTaken++;
      const delay = doseDelayMin(l);
      if (delay !== null && Math.abs(delay) <= 60) d.dosesOnTime++;
    }
  }
  for (const j of inp.journal) {
    const d = dayOf(j.timestamp);
    if (d) d.journal.push(j);
  }
  // A day with no water rows at all is "not logged", not "zero".
  return keys.map((k) => map.get(k)!);
}

/** The instant a scheduled dose was due: its date and time on the log's own clock. */
export function scheduledAt(l: DoseLog): number | null {
  const [hh, mm] = (l.scheduledTime ?? "").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return logicalDayStart(l.scheduledDate, hh!, l.timezone || "UTC") + mm! * 60_000;
}

/** Minutes elapsed from the scheduled instant to the action (so a clock change counts real time). */
export function doseDelayMin(l: DoseLog): number | null {
  if (!l.actionTimestamp) return null;
  const due = scheduledAt(l);
  return due === null ? null : Math.round((l.actionTimestamp - due) / 60_000);
}

/** A dose's display name: its prescription's, else the unlisted medicine's own. */
function doseName(l: DoseLog, rxName: Map<string, string>, fallback: string): string {
  return (l.prescriptionId ? rxName.get(l.prescriptionId) : undefined) ?? l.medicineName ?? fallback;
}
function rxNames(inp: EngineInput) {
  return new Map(inp.prescriptions.map((p) => [p.id, p.genericName]));
}

/**
 * Caffeine or alcohol on a day: the logged amount when there is a record;
 * none logged counts as zero only on a day the user was logging fluid;
 * otherwise unknown.
 */
export function substanceOn(d: Day, k: "caffeine" | "alcohol"): number | undefined {
  return d[k] ?? (d.water !== undefined ? 0 : undefined);
}

// ---------------------------------------------------------------------------
// 1. This week vs your usual (baseline diff)
// ---------------------------------------------------------------------------

export interface MetricDef {
  id: string;
  label: string;
  unit: string;
  get: (d: Day) => number | undefined;
  digits?: number;
  /** Which direction is worth a look. "both" for vitals. */
  watch: "up" | "down" | "both";
  domain: string; // css colour var
}

export const METRICS: MetricDef[] = [
  { id: "amSys", label: "Morning systolic", unit: "mmHg", get: (d) => d.amSys, watch: "both", domain: "bp" },
  { id: "amDia", label: "Morning diastolic", unit: "mmHg", get: (d) => d.amDia, watch: "both", domain: "bp" },
  { id: "amHr", label: "Morning heart rate", unit: "bpm", get: (d) => d.amHr, watch: "both", domain: "bp" },
  { id: "weight", label: "Weight (first of day)", unit: "kg", get: (d) => d.weight, digits: 1, watch: "up", domain: "weight" },
  { id: "water", label: "Fluid", unit: "ml", get: (d) => d.water, watch: "up", domain: "water" },
  { id: "late", label: "Fluid after 18:00", unit: "%", get: (d) => (d.water ? (100 * (d.waterAfter18 ?? 0)) / d.water : undefined), watch: "up", domain: "water" },
  { id: "sodium", label: "Sodium", unit: "mg", get: (d) => d.sodium, watch: "up", domain: "sodium" },
  { id: "caffeine", label: "Caffeine", unit: "mg", get: (d) => substanceOn(d, "caffeine"), watch: "up", domain: "caffeine" },
  { id: "alcohol", label: "Alcohol", unit: "drinks", get: (d) => substanceOn(d, "alcohol"), digits: 1, watch: "up", domain: "alcohol" },
  { id: "urination", label: "Urinations", unit: "/day", get: (d) => d.urination, watch: "both", domain: "water" },
  { id: "night", label: "Night urinations", unit: "/night", get: (d) => nightOn(d), watch: "up", domain: "water" },
  { id: "onTime", label: "Doses on time (±60 min)", unit: "%", get: (d) => (d.dosesDue ? (100 * d.dosesOnTime) / d.dosesDue : undefined), watch: "down", domain: "meds" },
];

/** Night urinations on a row's night, or unknown when no urination was logged around it. */
function nightOn(d: Day): number | undefined {
  return d.urination || d.nightUrination !== undefined ? d.nightUrination ?? 0 : undefined;
}

export interface BaselineRow {
  metric: MetricDef;
  weekMedian: number;
  weekN: number;
  baseMedian: number;
  baseLo: number; // P10
  baseHi: number; // P90
  baseN: number;
  delta: number;
  z: number;
  status: "above" | "below" | "usual" | "too-little-data";
  spark: (number | undefined)[]; // last 35 days
}

/** Last 7 complete logical days against the 28 before them. */
export function baselineDiff(days: Day[]): BaselineRow[] {
  const complete = days.slice(0, -1); // today is still being logged
  const week = complete.slice(-7);
  const base = complete.slice(-35, -7);
  return METRICS.map((m) => {
    const w = week.map(m.get).filter((v): v is number => v !== undefined && Number.isFinite(v));
    const b = base.map(m.get).filter((v): v is number => v !== undefined && Number.isFinite(v));
    const weekMedian = median(w);
    const baseMedian = median(b);
    const spread = Math.max(mad(b), 1e-9);
    const z = (weekMedian - baseMedian) / spread;
    const baseLo = quantile(b, 0.1);
    const baseHi = quantile(b, 0.9);
    let status: BaselineRow["status"] = "usual";
    if (w.length < 4 || b.length < 10) status = "too-little-data";
    else if (weekMedian > baseHi && z > 1) status = "above";
    else if (weekMedian < baseLo && z < -1) status = "below";
    return {
      metric: m,
      weekMedian,
      weekN: w.length,
      baseMedian,
      baseLo,
      baseHi,
      baseN: b.length,
      delta: weekMedian - baseMedian,
      z,
      status,
      spark: complete.slice(-35).map(m.get),
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Safety flags (fixed text, population defaults)
// ---------------------------------------------------------------------------

export interface Flag {
  level: "red" | "amber";
  title: string;
  detail: string;
  when: string; // day key
}

export function safetyFlags(inp: EngineInput, days: Day[]): Flag[] {
  const flags: Flag[] = [];
  const recent = days.slice(-14);
  const rxName = rxNames(inp);
  // Rapid weight gain on first-of-day weights (the first day compares with the one before the window).
  for (let i = 0; i < recent.length; i++) {
    const d = recent[i]!;
    if (d.weight === undefined) continue;
    const back = (n: number) => {
      const idx = days.indexOf(d) - n;
      return idx >= 0 ? days[idx]!.weight : undefined;
    };
    const w1 = back(1);
    const w3 = back(3) ?? back(2);
    if (w1 !== undefined && d.weight - w1 > 1)
      flags.push({ level: "amber", when: d.key, title: `Weight up ${(d.weight - w1).toFixed(1)} kg overnight`, detail: "Heart-failure guidance treats more than 1 kg in a day as a warning sign of fluid build-up. Check the plan your care team gave you." });
    else if (w3 !== undefined && d.weight - w3 > 2)
      flags.push({ level: "amber", when: d.key, title: `Weight up ${(d.weight - w3).toFixed(1)} kg in 3 days`, detail: "Heart-failure guidance treats more than 2 kg in 3 days as a warning sign of fluid build-up. Check the plan your care team gave you." });
  }
  // The same 14 logical days as the weight check.
  const twoWeeksAgo = logicalDayStart(recent[0]!.key, inp.dayStartHour, inp.tz);
  const until = logicalDayStart(shiftDayKey(recent[recent.length - 1]!.key, 1), inp.dayStartHour, inp.tz);
  for (const r of inp.bp) {
    if (r.timestamp < twoWeeksAgo || r.timestamp >= until) continue;
    const when = logicalDayKey(r.timestamp, inp.dayStartHour, inp.tz);
    if (r.systolic >= 180 || r.diastolic >= 120)
      flags.push({ level: "red", when, title: `Reading of ${r.systolic}/${r.diastolic}`, detail: "A reading of 180/120 or more needs prompt medical advice, urgently if you have symptoms such as chest pain, breathlessness or confusion." });
    else if (r.systolic < 90)
      flags.push({ level: "amber", when, title: `Low reading of ${r.systolic}/${r.diastolic}`, detail: "Systolic below 90 is low. Worth mentioning to your care team, especially with dizziness." });
    if (r.heartRate !== undefined && r.heartRate < 50)
      flags.push({ level: "amber", when, title: `Heart rate ${r.heartRate} bpm`, detail: "A resting heart rate under 50 on a beta-blocker is worth mentioning to your care team." });
  }
  // Dizziness or light-headedness within 4 h of a taken dose.
  const dizzy = inp.journal.filter((j) => j.timestamp >= twoWeeksAgo && j.timestamp < until && /dizz|light.?head|faint|vertigo|swimmy/i.test(j.finding));
  for (const j of dizzy) {
    const dose = inp.doseLogs.find((l) => l.status === "taken" && l.actionTimestamp && j.timestamp - l.actionTimestamp >= 0 && j.timestamp - l.actionTimestamp <= 4 * 3_600_000);
    if (dose)
      flags.push({ level: "amber", when: logicalDayKey(j.timestamp, inp.dayStartHour, inp.tz), title: `${j.finding} within 4 h of ${doseName(dose, rxName, "a dose")}`, detail: "Dizziness soon after blood-pressure medicines can mean BP is dropping. Note it for your care team; don't change doses on your own." });
  }
  return flags.sort((a, b) => (a.when < b.when ? 1 : -1));
}

// ---------------------------------------------------------------------------
// 3. Weight: trend and drift
// ---------------------------------------------------------------------------

export function weightTrend(allDays: Day[]) {
  const days = allDays.slice(0, -1); // the last row is after the selection (or today, still being logged)
  const last28 = days.slice(-28);
  const pts = last28.flatMap((d, i) => (d.weight !== undefined ? [{ x: i, y: d.weight }] : []));
  const m7 = median(days.slice(-7).flatMap((d) => (d.weight !== undefined ? [d.weight] : [])));
  const prev = median(days.slice(-35, -7).flatMap((d) => (d.weight !== undefined ? [d.weight] : [])));
  if (pts.length < 10) return { enough: false as const, n: pts.length, m7, prev };
  const slope = theilSen(pts) * 7; // kg/week
  // Bootstrap the slope.
  const r = rng(pts.length);
  const boots: number[] = [];
  for (let i = 0; i < 300; i++) boots.push(theilSen(pts.map(() => pts[Math.floor(r() * pts.length)]!)) * 7);
  return { enough: true as const, n: pts.length, m7, prev, slope, lo: quantile(boots, 0.05), hi: quantile(boots, 0.95) };
}

// ---------------------------------------------------------------------------
// 4. Home BP in the guideline format
// ---------------------------------------------------------------------------

export function homeBp(inp: EngineInput, win: ReportWindow) {
  const dayKey = (r: BloodPressureRecord) => logicalDayKey(r.timestamp, inp.dayStartHour, inp.tz);
  // The protocol week: the last 7 selected days.
  const days7 = new Set<string>();
  for (let i = 0; i < 7; i++) days7.add(shiftDayKey(win.endKey, -i));
  const rows = inp.bp.filter((r) => days7.has(dayKey(r))).sort((a, b) => a.timestamp - b.timestamp);
  const rowDays = new Set(rows.map(dayKey)).size;
  const am = rows.filter((r) => localParts(r.timestamp, inp.tz).hour < 12);
  const pm = rows.filter((r) => localParts(r.timestamp, inp.tz).hour >= 17);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const all90 = inp.bp
    .filter((r) => {
      const k = dayKey(r);
      return k >= win.startKey && k <= win.endKey;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  const band = (r: BloodPressureRecord) =>
    r.systolic < 100 ? "low" : r.systolic >= 135 || r.diastolic >= 85 ? "high" : "in";
  const tir = { low: 0, in: 0, high: 0 };
  for (const r of all90) tir[band(r)]++;
  const sys = all90.map((r) => r.systolic);
  // Average real variability: mean absolute change between consecutive readings.
  let arv = 0;
  for (let i = 1; i < all90.length; i++) arv += Math.abs(all90[i]!.systolic - all90[i - 1]!.systolic);
  arv = all90.length > 1 ? arv / (all90.length - 1) : NaN;
  return {
    n: rows.length,
    amN: am.length,
    pmN: pm.length,
    sys: rows.length ? mean(rows.map((r) => r.systolic)) : NaN,
    dia: rows.length ? mean(rows.map((r) => r.diastolic)) : NaN,
    hr: mean(rows.flatMap((r) => (r.heartRate ? [r.heartRate] : []))),
    amSys: am.length ? mean(am.map((r) => r.systolic)) : NaN,
    pmSys: pm.length ? mean(pm.map((r) => r.systolic)) : NaN,
    meetsProtocol: am.length >= 6 && pm.length >= 6 && rowDays >= 3,
    protocolDays: rowDays,
    tir,
    tirN: all90.length,
    sysP10: quantile(sys, 0.1),
    sysP90: quantile(sys, 0.9),
    arv,
    standingN: all90.filter((r) => r.position === "standing").length,
    pulsePressure: median(all90.map((r) => r.systolic - r.diastolic)),
    map: median(all90.map((r) => r.diastolic + (r.systolic - r.diastolic) / 3)),
    hrP10: quantile(all90.flatMap((r) => (r.heartRate ? [r.heartRate] : [])), 0.1),
    hrP90: quantile(all90.flatMap((r) => (r.heartRate ? [r.heartRate] : [])), 0.9),
    irregular: all90.filter((r) => r.irregularHeartbeat).length,
    lows: all90.filter((r) => r.systolic < 100).map((r) => ({ ts: r.timestamp, sys: r.systolic, dia: r.diastolic })),
    highs: all90.filter((r) => r.systolic >= 135 || r.diastolic >= 85).map((r) => ({ ts: r.timestamp, sys: r.systolic, dia: r.diastolic })),
  };
}

// ---------------------------------------------------------------------------
// 5. Limits: share of days within, how far over
// ---------------------------------------------------------------------------

export function limitAdherence(days: Day[], limit: number, key: "water" | "sodium", period = 30) {
  const logged = days.slice(-(period + 1), -1).filter((d) => d[key] !== undefined);
  const vals = logged.map((d) => d[key]!);
  const within = vals.filter((v) => v <= limit).length;
  const over = vals.filter((v) => v > limit).map((v) => v - limit);
  return {
    n: logged.length,
    coverage: logged.length / period,
    within,
    ...wilson(within, logged.length),
    median: median(vals),
    p10: quantile(vals, 0.1),
    p90: quantile(vals, 0.9),
    medianOver: median(over),
  };
}

/** Share of each 3-hour block of the (calendar) day, across the selected days. */
export function timeOfDay(inp: EngineInput, pick: (r: IntakeRecord) => boolean, inSel: (ts: number) => boolean) {
  const bins = new Array(8).fill(0) as number[];
  let total = 0;
  for (const r of inp.intake) {
    if (!pick(r) || !inSel(r.timestamp)) continue;
    bins[Math.floor(localParts(r.timestamp, inp.tz).hour / 3)]! += r.amount;
    total += r.amount;
  }
  return bins.map((b) => (total ? b / total : 0));
}

/** Biggest sodium sources in the selected days, by the record's food label. */
export function sodiumSources(inp: EngineInput, inSel: (ts: number) => boolean) {
  const by = new Map<string, number>();
  let total = 0;
  for (const r of inp.intake) {
    if (r.type !== "salt" || !inSel(r.timestamp)) continue;
    const label = (r.source?.startsWith("food:") ? r.source.slice(5) : r.note || r.source || "Logged by hand").trim() || "Logged by hand";
    by.set(label, (by.get(label) ?? 0) + r.amount);
    total += r.amount;
  }
  return [...by.entries()]
    .map(([label, mg]) => ({ label, mg, share: total ? mg / total : 0 }))
    .sort((a, b) => b.mg - a.mg)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// 6. Next-morning effects — a fixed list of questions, asked in advance
// ---------------------------------------------------------------------------

export interface Effect {
  id: string;
  question: string;
  exposure: string;
  outcome: string;
  unit: string;
  nExposed: number;
  nOther: number;
  est: number;
  lo: number;
  hi: number;
  confidence: Confidence;
  need: number;
  sentence: string;
}

interface Hypothesis {
  id: string;
  question: string;
  exposure: string;
  exposed: (d: Day, limits: EngineInput) => boolean | undefined;
  outcome: string;
  unit: string;
  digits: number;
  /** Outcome for day D measured on day D+1 (or a change D→D+1). */
  measure: (d: Day, next: Day) => number | undefined;
}

const alcoholExposed = (d: Day) => {
  const a = substanceOn(d, "alcohol");
  return a === undefined ? undefined : a >= 3;
};

const HYPOTHESES: Hypothesis[] = [
  {
    id: "alc-hr",
    question: "Does drinking raise my heart rate the next morning?",
    exposure: "3+ drinks",
    exposed: (d) => alcoholExposed(d),
    outcome: "next-morning heart rate",
    unit: "bpm",
    digits: 0,
    measure: (_d, n) => n.amHr,
  },
  {
    id: "alc-sys",
    question: "Does drinking change my blood pressure the next morning?",
    exposure: "3+ drinks",
    exposed: (d) => alcoholExposed(d),
    outcome: "next-morning systolic",
    unit: "mmHg",
    digits: 0,
    measure: (_d, n) => n.amSys,
  },
  {
    id: "na-sys",
    question: "Do salty days raise my blood pressure the next morning?",
    exposure: "sodium over your limit",
    exposed: (d, i) => (d.sodium === undefined ? undefined : d.sodium > i.saltLimit),
    outcome: "next-morning systolic",
    unit: "mmHg",
    digits: 0,
    measure: (_d, n) => n.amSys,
  },
  {
    id: "na-wt",
    question: "Do salty days put weight on overnight?",
    exposure: "sodium over your limit",
    exposed: (d, i) => (d.sodium === undefined ? undefined : d.sodium > i.saltLimit),
    outcome: "weight change to next morning",
    unit: "kg",
    digits: 2,
    measure: (d, n) => (d.weight !== undefined && n.weight !== undefined ? n.weight - d.weight : undefined),
  },
  {
    id: "fl-wt",
    question: "Do days over my fluid limit put weight on overnight?",
    exposure: "fluid over your limit",
    exposed: (d, i) => (d.water === undefined ? undefined : d.water > i.waterLimit),
    outcome: "weight change to next morning",
    unit: "kg",
    digits: 2,
    measure: (d, n) => (d.weight !== undefined && n.weight !== undefined ? n.weight - d.weight : undefined),
  },
  {
    id: "late-night",
    question: "Does drinking late make me get up at night?",
    exposure: "40%+ of fluid after 18:00",
    exposed: (d) => (d.water ? (d.waterAfter18 ?? 0) / d.water >= 0.4 : undefined),
    outcome: "night urinations",
    unit: "",
    digits: 1,
    // The next row's night is the 00:00–06:00 after this day's evening.
    measure: (_d, n) => nightOn(n),
  },
];

/**
 * Exposure days are the selected days only (the last `period` rows before the
 * final one). The outcome is read on the following day, which for the last
 * selected day is the row just after the selection.
 */
export function nextMorningEffects(inp: EngineInput, days: Day[], period: number): Effect[] {
  const NEED = 5;
  return HYPOTHESES.map((h) => {
    const ex: number[] = [];
    const ot: number[] = [];
    for (let i = Math.max(0, days.length - 1 - period); i < days.length - 1; i++) {
      const e = h.exposed(days[i]!, inp);
      const y = h.measure(days[i]!, days[i + 1]!);
      if (e === undefined || y === undefined) continue;
      (e ? ex : ot).push(y);
    }
    const nMin = Math.min(ex.length, ot.length);
    const { est, lo, hi } = nMin >= 3 ? medianDiff(ot, ex) : { est: NaN, lo: NaN, hi: NaN };
    const confidence = confidenceOf(lo, hi, nMin, NEED);
    const f = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(h.digits)}${h.unit ? ` ${h.unit}` : ""}`;
    const sentence =
      confidence === "too-little-data"
        ? `Needs ${Math.max(0, NEED - ex.length)} more ${h.exposure} days and ${Math.max(0, NEED - ot.length)} more other days with a reading.`
        : confidence === "unclear"
          ? `No clear difference in ${h.outcome} after ${h.exposure} days (${f(est)}, could be ${f(lo)} to ${f(hi)}).`
          : `After ${h.exposure} days, your ${h.outcome} was ${f(est)} (likely ${f(lo)} to ${f(hi)}) compared with other days.`;
    return { id: h.id, question: h.question, exposure: h.exposure, outcome: h.outcome, unit: h.unit, nExposed: ex.length, nOther: ot.length, est, lo, hi, confidence, need: NEED, sentence };
  });
}

// ---------------------------------------------------------------------------
// 7. Adherence and timing
// ---------------------------------------------------------------------------

/** Doses scheduled on the selected days, by `scheduledDate` (the same mapping as the daily rows). */
export function adherence(inp: EngineInput, win: ReportWindow) {
  const inWin = (l: DoseLog) => l.scheduledDate >= win.startKey && l.scheduledDate <= win.endKey;
  const rxName = rxNames(inp);
  // Group by prescription; an unlisted medicine by its own name.
  const group = (l: DoseLog) => (l.prescriptionId ? `rx:${l.prescriptionId}` : `name:${l.medicineName ?? "Unknown"}`);
  const logs = inp.doseLogs.filter((l) => l.kind !== "prn" && l.status !== "pending" && inWin(l));
  const taken = logs.filter((l) => l.status === "taken");
  const delays = taken.map(doseDelayMin).filter((d): d is number => d !== null);
  const bySlot = new Map<string, number[]>();
  for (const l of taken) {
    const d = doseDelayMin(l);
    if (d === null) continue;
    const arr = bySlot.get(l.scheduledTime) ?? [];
    arr.push(d);
    bySlot.set(l.scheduledTime, arr);
  }
  const byDay = new Map<string, { due: number; taken: number }>();
  for (const l of logs) {
    const v = byDay.get(l.scheduledDate) ?? { due: 0, taken: 0 };
    v.due++;
    if (l.status === "taken") v.taken++;
    byDay.set(l.scheduledDate, v);
  }
  const fullDays = [...byDay.values()].filter((v) => v.taken === v.due).length;
  const missed = new Map<string, { name: string; n: number }>();
  for (const l of logs) {
    if (l.status === "taken") continue;
    const v = missed.get(group(l)) ?? { name: doseName(l, rxName, "Unknown"), n: 0 };
    v.n++;
    missed.set(group(l), v);
  }
  const groups = new Map<string, DoseLog[]>();
  for (const l of logs) groups.set(group(l), [...(groups.get(group(l)) ?? []), l]);
  return {
    due: logs.length,
    taken: taken.length,
    days: byDay.size,
    fullDays,
    onTime: delays.filter((d) => Math.abs(d) <= 60).length,
    medianDelay: median(delays),
    p90Delay: quantile(delays, 0.9),
    slots: [...bySlot.entries()]
      .map(([time, ds]) => ({ time, n: ds.length, median: median(ds), p90: quantile(ds, 0.9) }))
      .sort((a, b) => (a.time < b.time ? -1 : 1)),
    missed: [...missed.values()].sort((a, b) => b.n - a.n),
    byMedicine: [...groups.values()]
      .map((mine) => {
        const name = doseName(mine[0]!, rxName, "Unknown");
        const tk = mine.filter((l) => l.status === "taken");
        const ds = tk.map(doseDelayMin).filter((d): d is number => d !== null);
        return { name, due: mine.length, taken: tk.length, onTime: ds.filter((d) => Math.abs(d) <= 60).length, medianDelay: median(ds) };
      })
      .sort((a, b) => a.taken / a.due - b.taken / b.due),
    prn: inp.doseLogs.filter((l) => l.kind === "prn" && l.status === "taken" && inWin(l)).map((l) => ({ name: doseName(l, rxName, "As needed"), ts: l.actionTimestamp ?? 0 })),
  };
}

// ---------------------------------------------------------------------------
// 8. Medication changes and before/after response
// ---------------------------------------------------------------------------

/** Days before a change is expected to show, by a rough guess at drug class. */
function lagDays(name: string): { lag: number; why: string } {
  const n = name.toLowerCase();
  if (/furosemide|torasemide|torsemide|bumetanide/.test(n)) return { lag: 2, why: "loop diuretic: hours to days" };
  if (/carvedilol|bisoprolol|metoprolol|nebivolol|olol\b/.test(n)) return { lag: 7, why: "beta-blocker: heart rate within days" };
  if (/gliflozin/.test(n)) return { lag: 7, why: "SGLT2 inhibitor: about a week" };
  if (/sacubitril|sartan|pril\b|spironolactone|eplerenone|finerenone/.test(n)) return { lag: 14, why: "ACEi/ARB/ARNI/MRA: 2–4 weeks" };
  return { lag: 14, why: "unknown class: 2 weeks assumed" };
}

export interface ChangeEvent {
  date: string;
  medicine: string;
  what: string;
  lag: number;
  lagWhy: string;
  caveat?: string;
  overlaps: string[];
  responses: {
    label: string;
    unit: string;
    nBefore: number;
    nAfter: number;
    est: number;
    lo: number;
    hi: number;
    confidence: Confidence;
    afterNeedsUntil?: string;
  }[];
}

export function medicationChanges(inp: EngineInput, days: Day[]): ChangeEvent[] {
  const rxName = new Map(inp.prescriptions.map((p) => [p.id, p.genericName]));
  const phaseRx = new Map(inp.phases.map((p) => [p.id, p.prescriptionId]));
  const events: { date: string; medicine: string; what: string; caveat?: string }[] = [];

  for (const ph of inp.phases) {
    if (ph.status === "cancelled") continue;
    const date = logicalDayKey(ph.startDate, inp.dayStartHour, inp.tz);
    events.push({
      date,
      medicine: rxName.get(ph.prescriptionId) ?? "Medicine",
      what: ph.type === "titration" ? "titration step started" : "started (or first entered in the app)",
      caveat: "If this is when you entered it rather than started it, the before/after compares tracking periods, not the drug.",
    });
  }
  for (const s of inp.schedules) {
    if (!s.effectiveFrom) continue;
    const prev = inp.schedules.find((o) => o.phaseId === s.phaseId && o.time === s.time && o.effectiveTo === s.effectiveFrom);
    events.push({
      date: s.effectiveFrom,
      medicine: rxName.get(phaseRx.get(s.phaseId) ?? "") ?? "Medicine",
      what: prev ? `${s.time} dose ${prev.dosage} → ${s.dosage}${s.unit ?? ""}` : `${s.time} dose set to ${s.dosage}${s.unit ?? ""}`,
    });
  }

  // Same day + same medicine → one event.
  const uniq = new Map<string, (typeof events)[number]>();
  for (const e of events) {
    const k = `${e.date}|${e.medicine}`;
    const had = uniq.get(k);
    if (had) had.what = had.what === e.what ? had.what : `${had.what}; ${e.what}`;
    else uniq.set(k, { ...e });
  }
  const list = [...uniq.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = days[days.length - 1]!.key;

  const OUT: { label: string; unit: string; get: (d: Day) => number | undefined; digits: number }[] = [
    { label: "Morning systolic", unit: "mmHg", get: (d) => d.amSys, digits: 0 },
    { label: "Morning heart rate", unit: "bpm", get: (d) => d.amHr, digits: 0 },
    { label: "Weight", unit: "kg", get: (d) => d.weight, digits: 1 },
    { label: "Urinations / day", unit: "", get: (d) => d.urination, digits: 1 },
  ];

  return list.map((e) => {
    const { lag, why } = lagDays(e.medicine);
    const inRange = (from: string, to: string) => days.filter((d) => d.key >= from && d.key < to);
    const beforeStart = shiftDayKey(e.date, -28);
    const before = inRange(beforeStart, e.date);
    const afterStart = shiftDayKey(e.date, lag);
    const afterEnd = shiftDayKey(afterStart, 28);
    const after = inRange(afterStart, afterEnd).filter((d) => d.key < today);
    // Any other change from the start of the before sample to the end of the
    // after sample (the lag between them included) can move the comparison.
    const overlaps = list
      .filter((o) => o !== e && o.date >= beforeStart && o.date < afterEnd)
      .map((o) => `${o.medicine} (${o.date.slice(5)})`);
    return {
      ...e,
      lag,
      lagWhy: why,
      overlaps,
      responses: OUT.map((o) => {
        const b = before.map(o.get).filter((v): v is number => v !== undefined);
        const a = after.map(o.get).filter((v): v is number => v !== undefined);
        const nMin = Math.min(a.length, b.length);
        const r = nMin >= 3 ? medianDiff(b, a) : { est: NaN, lo: NaN, hi: NaN };
        const confidence = confidenceOf(r.lo, r.hi, nMin, 8);
        return {
          label: o.label,
          unit: o.unit,
          nBefore: b.length,
          nAfter: a.length,
          ...r,
          confidence,
          ...(afterStart > today ? { afterNeedsUntil: shiftDayKey(afterStart, 8) } : {}),
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// 9. Symptom context: what came before each journal entry
// ---------------------------------------------------------------------------

export interface SymptomContext {
  entry: JournalEntry;
  lastBp?: { sys: number; dia: number; hr?: number; hoursBefore: number };
  weightVsUsual?: number; // kg vs 28-day median
  alcohol24h: number;
  sodiumDayBefore?: number;
  lateOrMissed24h: string[];
  hoursSinceDose?: { name: string; h: number };
}

export function symptomContext(inp: EngineInput, days: Day[], inSel: (ts: number) => boolean): { entries: SymptomContext[]; patterns: { finding: string; n: number; text: string }[]; counts: { finding: string; n: number; severity: number }[] } {
  const rxName = rxNames(inp);
  const H24 = 24 * 3_600_000;
  const entries = inp.journal
    .filter((j) => j.kind !== "event" && inSel(j.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((j): SymptomContext => {
      const t = j.timestamp;
      const bp = inp.bp.filter((r) => r.timestamp <= t && t - r.timestamp <= 72 * 3_600_000).sort((a, b) => b.timestamp - a.timestamp)[0];
      const key = logicalDayKey(t, inp.dayStartHour, inp.tz);
      const idx = days.findIndex((d) => d.key === key);
      // The day's first weight, only if it was measured by the time of the entry.
      const w = inp.weight
        .filter((r) => r.timestamp <= t && logicalDayKey(r.timestamp, inp.dayStartHour, inp.tz) === key)
        .sort((a, b) => a.timestamp - b.timestamp)[0]?.weight;
      const usualW = median(days.slice(Math.max(0, idx - 28), Math.max(0, idx)).flatMap((d) => (d.weight !== undefined ? [d.weight] : [])));
      const alcohol24h = inp.substance
        .filter((s) => s.type === "alcohol" && s.timestamp <= t && t - s.timestamp <= H24)
        .reduce((s, r) => s + (r.amountStandardDrinks ?? 0), 0);
      // Doses due in the 24 h before the entry that were skipped, or taken
      // more than 120 min late where that lateness had begun by the entry.
      const lateOrMissed24h = inp.doseLogs
        .filter((l) => {
          if (l.kind === "prn") return false;
          const due = scheduledAt(l);
          if (due === null || due > t || t - due > H24) return false;
          if (l.status === "skipped") return true;
          return l.status === "taken" && (doseDelayMin(l) ?? 0) > 120 && due + 120 * 60_000 <= t;
        })
        .map((l) => `${doseName(l, rxName, "dose")} ${l.scheduledTime} ${l.status === "skipped" ? "skipped" : "late"}`);
      const lastDose = inp.doseLogs
        .filter((l) => l.status === "taken" && l.actionTimestamp && l.actionTimestamp <= t)
        .sort((a, b) => b.actionTimestamp! - a.actionTimestamp!)[0];
      return {
        entry: j,
        ...(bp ? { lastBp: { sys: bp.systolic, dia: bp.diastolic, ...(bp.heartRate ? { hr: bp.heartRate } : {}), hoursBefore: (t - bp.timestamp) / 3_600_000 } } : {}),
        ...(w !== undefined && Number.isFinite(usualW) ? { weightVsUsual: w - usualW } : {}),
        alcohol24h,
        ...(idx > 0 && days[idx - 1]!.sodium !== undefined ? { sodiumDayBefore: days[idx - 1]!.sodium! } : {}),
        lateOrMissed24h,
        ...(lastDose ? { hoursSinceDose: { name: doseName(lastDose, rxName, "dose"), h: (t - lastDose.actionTimestamp!) / 3_600_000 } } : {}),
      };
    });
  // Patterns only once a finding has 5+ entries.
  const groups = new Map<string, SymptomContext[]>();
  for (const e of entries) {
    const k = e.entry.finding.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const patterns = [...groups.entries()]
    .filter(([, g]) => g.length >= 5)
    .map(([, g]) => {
      const withinDose = g.filter((e) => e.hoursSinceDose && e.hoursSinceDose.h <= 3).length;
      const afterDrink = g.filter((e) => e.alcohol24h >= 3).length;
      const bits = [
        withinDose ? `${withinDose} of ${g.length} came within 3 h of a dose` : "",
        afterDrink ? `${afterDrink} of ${g.length} followed 3+ drinks in the previous 24 h` : "",
      ].filter(Boolean);
      return { finding: g[0]!.entry.finding, n: g.length, text: bits.join("; ") || "no common pattern among the things tracked" };
    });
  const counts = [...groups.values()]
    .map((g) => ({ finding: g[0]!.entry.finding, n: g.length, severity: median(g.flatMap((e) => (e.entry.severity !== null ? [e.entry.severity] : []))) }))
    .sort((a, b) => b.n - a.n);
  return { entries, patterns, counts };
}

// ---------------------------------------------------------------------------
// Everything at once
// ---------------------------------------------------------------------------

export interface WeekRow {
  start: string;
  end: string;
  days: number;
  amSys: number;
  amDia: number;
  hr: number;
  weight: number;
  water: number;
  sodium: number;
  alcohol: number;
  urination: number;
  dosesPct: number;
}

/** One row per 7-day block, newest first, covering the selected days only (the oldest row may be short). */
export function weekly(days: Day[], period: number): WeekRow[] {
  const complete = days.slice(-(period + 1), -1);
  const weeks = Math.max(1, Math.min(13, Math.ceil(period / 7)));
  const rows: WeekRow[] = [];
  const pick = (ds: Day[], f: (d: Day) => number | undefined) => median(ds.map(f).filter((v): v is number => v !== undefined));
  for (let w = 0; w < weeks; w++) {
    const ds = complete.slice(Math.max(0, complete.length - 7 * (w + 1)), complete.length - 7 * w);
    if (ds.length === 0) break;
    const due = ds.reduce((s, d) => s + d.dosesDue, 0);
    rows.push({
      start: ds[0]!.key,
      end: ds[ds.length - 1]!.key,
      days: ds.filter((d) => d.water !== undefined || d.amSys !== undefined || d.weight !== undefined).length,
      amSys: pick(ds, (d) => d.amSys),
      amDia: pick(ds, (d) => d.amDia),
      hr: pick(ds, (d) => d.amHr),
      weight: pick(ds, (d) => d.weight),
      water: pick(ds, (d) => d.water),
      sodium: pick(ds, (d) => d.sodium),
      alcohol: ds.reduce((s, d) => s + (d.alcohol ?? 0), 0),
      urination: pick(ds, (d) => d.urination),
      dosesPct: due ? ds.reduce((s, d) => s + d.dosesTaken, 0) / due : NaN,
    });
  }
  return rows;
}

/** Food: meals, timing, top foods, sugar and potassium, over the period. */
export function foodSummary(inp: EngineInput, days: Day[], period: number, inSel: (ts: number) => boolean) {
  const inPeriod = days.slice(-(period + 1), -1);
  const ate = inPeriod.filter((d) => d.foodItems);
  const foods = new Map<string, { n: number; grams: number }>();
  let late = 0;
  let total = 0;
  for (const r of inp.eating ?? []) {
    if (!inSel(r.timestamp)) continue;
    total++;
    const h = localParts(r.timestamp, inp.tz).hour;
    if (h >= 21 || h < inp.dayStartHour) late++;
    const name = (r.note ?? "").trim().toLowerCase();
    if (!name) continue;
    const v = foods.get(name) ?? { n: 0, grams: 0 };
    v.n++;
    v.grams += r.grams ?? 0;
    foods.set(name, v);
  }
  const sug = inPeriod.filter((d) => d.sugar !== undefined).map((d) => d.sugar!);
  const pot = inPeriod.filter((d) => d.potassium !== undefined).map((d) => d.potassium!);
  return {
    daysLogged: ate.length,
    mealsPerDay: median(ate.map((d) => d.meals ?? 0)),
    itemsPerDay: median(ate.map((d) => d.foodItems ?? 0)),
    firstMeal: median(ate.map((d) => d.firstMeal!).filter(Number.isFinite)),
    lastMeal: median(ate.map((d) => d.lastMeal!).filter(Number.isFinite)),
    lateShare: total ? late / total : NaN,
    topFoods: [...foods.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n).slice(0, 8),
    sugar: { n: sug.length, median: median(sug), within: inp.sugarLimit ? sug.filter((v) => v <= inp.sugarLimit!).length : NaN, limit: inp.sugarLimit },
    potassium: { n: pot.length, median: median(pot), limit: inp.potassiumLimit },
  };
}

export interface CompareRow {
  metric: MetricDef;
  now: number;
  before: number;
  nNow: number;
  nBefore: number;
  est: number;
  lo: number;
  hi: number;
  confidence: Confidence;
}

/** This period against the same length of time just before it. */
export function periodCompare(days: Day[], period: number): CompareRow[] {
  const complete = days.slice(0, -1);
  const now = complete.slice(-period);
  const before = complete.slice(-2 * period, -period);
  return METRICS.map((m) => {
    const a = before.map(m.get).filter((v): v is number => v !== undefined && Number.isFinite(v));
    const b = now.map(m.get).filter((v): v is number => v !== undefined && Number.isFinite(v));
    const nMin = Math.min(a.length, b.length);
    const r = nMin >= 3 ? medianDiff(a, b) : { est: NaN, lo: NaN, hi: NaN };
    return { metric: m, now: median(b), before: median(a), nNow: b.length, nBefore: a.length, ...r, confidence: confidenceOf(r.lo, r.hi, nMin, 5) };
  });
}

/**
 * The report for a selection. `days` ends with the day after the selection
 * (today for the default "last N complete days"); `inPeriod` is the `period`
 * rows before it. Earlier rows feed baselines and comparisons only, never a
 * figure for the period.
 */
export function runEngine(inp: EngineInput, sel: Selection | number = 30) {
  const win = resolveSelection(inp, sel);
  const { period } = win;
  const days = buildDays(inp, win.nDays, win.anchorKey);
  const inPeriod = days.slice(-(period + 1), -1);
  const inSel = (ts: number) => {
    const k = logicalDayKey(ts, inp.dayStartHour, inp.tz);
    return k >= win.startKey && k <= win.endKey;
  };
  return {
    period,
    /** First and last selected logical day, and the same days in ms (what an export should cover). */
    startKey: win.startKey,
    endKey: win.endKey,
    range: win.range,
    days,
    inPeriod,
    weeks: weekly(days, period),
    compare: periodCompare(days, period),
    baseline: baselineDiff(days),
    flags: safetyFlags(inp, days),
    weight: weightTrend(days),
    bp: homeBp(inp, win),
    water: limitAdherence(days, inp.waterLimit, "water", period),
    sodium: limitAdherence(days, inp.saltLimit, "sodium", period),
    fluidClock: timeOfDay(inp, (r) => r.type === "water", inSel),
    sodiumClock: timeOfDay(inp, (r) => r.type === "salt", inSel),
    sodiumSources: sodiumSources(inp, inSel),
    food: foodSummary(inp, days, period, inSel),
    effects: nextMorningEffects(inp, days, period),
    adherence: adherence(inp, win),
    changes: medicationChanges(inp, days),
    symptoms: symptomContext(inp, days, inSel),
    urine: (() => {
      const u = inPeriod.filter((d) => d.urination !== undefined);
      const nights = inPeriod.map(nightOn).filter((v): v is number => v !== undefined);
      const bowelN = inPeriod.reduce((s, d) => s + (d.defecation ?? 0), 0);
      return {
        n: u.length,
        perDay: median(u.map((d) => d.urination!)),
        nightPerNight: median(nights),
        nightsWith2: nights.filter((v) => v >= 2).length,
        /** Recorded bowel movements per week; NaN (no data) when none was recorded in the period. */
        bowelPerWeek: bowelN ? (bowelN / Math.max(1, inPeriod.length)) * 7 : NaN,
        bowelN,
      };
    })(),
    caffeine: (() => {
      const c = inPeriod.map((d) => substanceOn(d, "caffeine")).filter((v): v is number => v !== undefined);
      return { median: median(c), max: Math.max(0, ...c), over400: c.filter((v) => v > 400).length, n: c.length };
    })(),
    alcohol: (() => {
      const last = inPeriod.filter((d) => substanceOn(d, "alcohol") !== undefined);
      const drinkDays = last.filter((d) => (d.alcohol ?? 0) > 0);
      return {
        n: last.length,
        drinkDays: drinkDays.length,
        heavyDays: drinkDays.filter((d) => (d.alcohol ?? 0) >= 5).length,
        perWeek: (last.reduce((s, d) => s + (d.alcohol ?? 0), 0) / Math.max(1, last.length)) * 7,
        maxDay: Math.max(0, ...last.map((d) => d.alcohol ?? 0)),
      };
    })(),
    limits: { water: inp.waterLimit, sodium: inp.saltLimit },
    counts: {
      intake: inp.intake.length,
      bp: inp.bp.length,
      weight: inp.weight.length,
      doses: inp.doseLogs.length,
      journal: inp.journal.length,
    },
  };
}

export type Insights = ReturnType<typeof runEngine>;
