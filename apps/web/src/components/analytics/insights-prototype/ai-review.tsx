"use client";

/**
 * PROTOTYPE — throwaway. The Analysis tab of the Metrics report.
 *
 * One place for the AI analyses: start a Health report or Food analysis
 * (Quick, or Deep with cited sources), read the open one, and manage every
 * past one (open, delete; health reports can also be compared with each
 * other). Findings link to the chapter section they are about; appointment
 * questions can be added to the on-screen Report; food swaps feed the Food
 * tab.
 *
 * The model calls are STUBBED: results come from fixed templates over the
 * engine's numbers. Deep does not search the web: it attaches preselected
 * references (real ones found in this prototype's research). The seeded
 * history is EXAMPLE data, labelled as such, and is kept out of comparisons
 * with real runs and out of what the Food tab and the tab badge read.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { PROTOTYPES_ENABLED } from "@/components/prototype/prototype-switcher";
import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { Section, col, fmtNum, mono, muted, pct, shortDate, signed } from "@/components/analytics/insights-prototype/ui";

export type Chapter = "vitals" | "fluid" | "food" | "meds";
export type Level = "discuss" | "watch" | "good";
export type Mode = "quick" | "deep";
export type Kind = "health" | "food";

export interface Finding {
  id: string;
  level: Level;
  chapter: Chapter;
  title: string;
  detail: string;
  basis: { label: string; tab: Chapter; anchor: string }[];
  at?: string[];
  evidence?: string;
  sources?: number[];
}

/** Fewest logged days before a share of days is rated (as the chapters do). */
const MIN_DAYS = 7;

export interface Swap {
  name: string;
  swap: string;
  perDay: number;
}

export interface Review {
  mode: Mode;
  at: number;
  period: number;
  /** The resolved window it read: first and last logical day (YYYY-MM-DD). */
  startKey: string;
  endKey: string;
  headline: string;
  findings: Finding[];
  questions: string[];
  sources: { n: number; title: string; url: string }[];
  swaps: Swap[];
}

export interface Analysis extends Review {
  id: string;
  kind: Kind;
  focus: string[];
  foodNotes: { label: string; text: string }[];
  /** Seeded example, not a run over the user's records. */
  example?: true;
}

/** Which report section each finding belongs to. */
const REPORT_AT: Record<string, string> = {
  "weight-gain": "report-weight",
  "dizzy-dose": "report-symptoms",
  "bp-protocol": "report-bp",
  "bp-range": "report-bp",
  "alcohol-hr": "report-alcohol",
  "fluid-limit": "report-fluid",
  "sodium-limit": "report-fluid",
  "food-swaps": "report-fluid",
  adherence: "report-meds",
  "change-hr": "report-meds",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fixed per-serving sodium savings (estimates, not looked up). */
const SWAPS = new Map<string, { swap: string; perServing: number }>([
  ["ham", { swap: "fresh roast chicken", perServing: 450 }],
  ["ham sandwich", { swap: "chicken salad on low-salt bread", perServing: 700 }],
  ["bread", { swap: "low-salt bread", perServing: 150 }],
  ["toast", { swap: "low-salt bread", perServing: 150 }],
  ["cheese", { swap: "fresh mozzarella or ricotta", perServing: 250 }],
  ["soup", { swap: "home-made, no stock cube", perServing: 700 }],
  ["crisps", { swap: "unsalted nuts", perServing: 200 }],
  ["pizza", { swap: "home-made, half the cheese", perServing: 600 }],
  ["pasta", { swap: "no salt in the water", perServing: 250 }],
]);

export function foodSwaps(d: Insights): Swap[] {
  const days = Math.max(1, d.food.daysLogged);
  return d.food.topFoods
    .flatMap((f) => {
      const s = SWAPS.get(f.name);
      return s ? [{ name: f.name, swap: s.swap, perDay: (s.perServing * f.n) / days }] : [];
    })
    .sort((a, b) => b.perDay - a.perDay)
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Sources (real, from the research behind this prototype)
// ---------------------------------------------------------------------------

const SOURCES = {
  escHf: { title: "ESC 2021 Guidelines for heart failure", url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045" },
  esh: { title: "2023 ESH Guidelines for the management of arterial hypertension", url: "https://journals.lww.com/jhypertension/fulltext/2023/12000/2023_esh_guidelines_for_the_management_of_arterial.2.aspx" },
  ahaHbpm: { title: "AHA: Measurement of blood pressure in humans (2019 scientific statement)", url: "https://www.ahajournals.org/doi/10.1161/HYP.0000000000000087" },
  racgp: { title: "RACGP: How to measure home blood pressure", url: "https://www.racgp.org.au/afp/2016/january-february/how-to-measure-home-blood-pressure-recommendations" },
  hfm: { title: "Heart Failure Matters: rapid weight gain", url: "https://www.heartfailurematters.org/warning-signs/rapid-weight-gain/" },
  ahaTracker: { title: "AHA heart failure symptom tracker", url: "https://u1-cd-cpr.sc.heart.org/-/media/Files/Health-Topics/Heart-Failure/HF-Symptom-Tracker.pdf" },
  tir: { title: "Blood pressure time in target range (review)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11461595/" },
  hse: { title: "HSE heart failure traffic-light guide", url: "https://www.hse.ie/eng/about/who/healthwellbeing/selfmanagement/resources-for-people-living-with-a-long-term-health-condition/heart-failure-traffic-light-guide.pdf" },
} as const;
type SourceKey = keyof typeof SOURCES;

// ---------------------------------------------------------------------------
// The stub "model": fixed templates over the engine's numbers
// ---------------------------------------------------------------------------

export function buildReview(d: Insights, mode: Mode): Review {
  const used: SourceKey[] = [];
  const cite = (...keys: SourceKey[]) =>
    mode === "deep"
      ? keys.map((k) => {
          if (!used.includes(k)) used.push(k);
          return used.indexOf(k) + 1;
        })
      : undefined;
  const f: Finding[] = [];
  const add = (x: Omit<Finding, "sources" | "evidence" | "at"> & { evidence?: string | undefined; cites?: SourceKey[] }) => {
    const { cites, evidence, ...rest } = x;
    const s = cites ? cite(...cites) : undefined;
    f.push({ ...rest, ...(mode === "deep" && evidence ? { evidence } : {}), ...(s ? { sources: s } : {}) });
  };

  const weightFlag = d.flags.find((x) => x.title.startsWith("Weight"));
  if (weightFlag)
    add({
      id: "weight-gain", level: "discuss", chapter: "vitals",
      title: `${weightFlag.title} on ${shortDate(weightFlag.when)}`,
      detail: `Your 7-day median is ${fmtNum(d.weight.m7, 1)} kg. One jump can be a heavy salty meal, but it is the pattern heart-failure plans ask you to report.`,
      basis: [{ label: "Weight chart", tab: "vitals", anchor: "sec-weight" }],
      evidence: "Heart-failure guidance treats a gain of more than 2 kg in 3 days, or about 1 kg overnight, as a sign of fluid build-up to act on with your care team.",
      cites: ["hfm", "ahaTracker", "hse"],
    });

  // Dizziness: report only the dose timing the engine measured, never a cause.
  const dizzy = d.symptoms.patterns.find((p) => /dizz|light/i.test(p.finding));
  const dizzyNear = dizzy
    ? d.symptoms.entries.filter((e) => e.entry.finding.trim().toLowerCase() === dizzy.finding.trim().toLowerCase() && e.hoursSinceDose && e.hoursSinceDose.h <= 3).length
    : 0;
  if (dizzy)
    add({
      id: "dizzy-dose", level: dizzyNear ? "discuss" : "watch", chapter: "meds",
      title: dizzyNear ? `${cap(dizzy.finding)}: ${dizzyNear} of ${dizzy.n} entries came within 3 h of a dose` : `${cap(dizzy.finding)} logged ${dizzy.n} times`,
      detail: `${cap(dizzy.text)}. This is timing in your log only; it does not show what causes it.`,
      basis: [{ label: "Dose timing", tab: "meds", anchor: "sec-adherence" }],
      evidence: "Symptomatic hypotension is a known effect of beta-blockers and ARNIs, especially on standing. Guidelines advise reviewing it with the prescriber rather than stopping a medicine.",
      cites: ["escHf"],
    });

  // Home BP: report the counts; never certify the protocol from counts alone.
  const week = d.days.slice(-8, -1);
  const bothDays = week.filter((x) => x.amSys !== undefined && x.pmSys !== undefined).length;
  const protocolNote = "The standard home protocol is two readings morning and evening for 7 days, discarding day 1 and averaging the rest (at least 12 readings).";
  if (d.bp.tirN === 0)
    add({
      id: "bp-protocol", level: "watch", chapter: "vitals",
      title: `No blood pressure readings in the last ${d.period} days`,
      detail: "Nothing to average or put in bands yet.",
      basis: [{ label: "Home blood pressure", tab: "vitals", anchor: "sec-bp" }],
      evidence: protocolNote,
      cites: ["esh", "ahaHbpm", "racgp"],
    });
  else {
    const counts = `${d.bp.amN} morning and ${d.bp.pmN} evening readings in the last 7 days, with both on ${bothDays} of the 7 days`;
    const avg = d.bp.n ? `, average ${fmtNum(d.bp.sys)}/${fmtNum(d.bp.dia)}` : "";
    const full = d.bp.amN >= 6 && d.bp.pmN >= 6 && bothDays >= 6;
    add({
      id: "bp-protocol", level: full ? "good" : "watch", chapter: "vitals",
      title:
        d.bp.n === 0
          ? "No blood pressure readings in the last 7 days"
          : d.bp.pmN === 0 && d.bp.amN > 0
            ? "Blood pressure is only measured in the morning"
            : d.bp.amN === 0 && d.bp.pmN > 0
              ? "Blood pressure is only measured in the evening"
              : full
                ? `Morning and evening readings on ${bothDays} of the last 7 days`
                : "Fewer home readings than the standard protocol asks for",
      detail: `${counts}${avg}.${d.bp.pmN === 0 && d.bp.amN > 0 ? " The average misses the evening, when later doses are working." : ""}`,
      basis: [{ label: "Home blood pressure", tab: "vitals", anchor: "sec-bp" }],
      evidence: protocolNote,
      cites: ["esh", "ahaHbpm", "racgp"],
    });

    const inBand = d.bp.tir.in / d.bp.tirN;
    add({
      id: "bp-range", level: inBand >= 0.7 ? "good" : "watch", chapter: "vitals",
      title: `${pct(inBand)} of readings in the 100–134 band`,
      detail: `${d.bp.tir.in} of ${d.bp.tirN} readings over ${d.period} days; ${d.bp.tir.low} below 100 systolic and ${d.bp.tir.high} at or above 135/85.`,
      basis: [{ label: "Readings by band", tab: "vitals", anchor: "sec-bp" }],
      evidence: "Time in target range predicts outcomes beyond the average reading, so the share of readings in range is worth tracking alongside it.",
      cites: ["tir"],
    });
  }

  const alcHr = d.effects.find((e) => e.id === "alc-hr");
  const alcShown = !!alcHr && (alcHr.confidence === "consistent" || alcHr.confidence === "possible");
  if (alcHr && alcShown)
    add({
      id: "alcohol-hr", level: alcHr.est > 0 ? "discuss" : "watch", chapter: "fluid",
      title: `Next-morning heart rate is ${fmtNum(Math.abs(alcHr.est))} bpm ${alcHr.est > 0 ? "higher" : "lower"} after 3+ drinks than after other days`,
      detail: `${alcHr.nExposed} days with 3+ drinks against ${alcHr.nOther} other days; the difference is likely ${signed(alcHr.lo)} to ${signed(alcHr.hi)} bpm. You drank on ${d.alcohol.drinkDays} of ${d.alcohol.n} days, ${fmtNum(d.alcohol.perWeek, 1)} standard drinks a week. This is a pattern in your log, not proof that drinking causes it.`,
      basis: [
        { label: "Alcohol", tab: "fluid", anchor: "sec-alcohol" },
        { label: "Heart rate chart", tab: "vitals", anchor: "sec-bp" },
      ],
      evidence: "Heart-failure guidelines advise limiting alcohol, and a raised resting heart rate works against the rate control a beta-blocker is there for.",
      cites: ["escHf"],
    });

  // Limits: rate a share of days only once enough days are logged.
  const fluidOk = d.water.n >= MIN_DAYS;
  add({
    id: "fluid-limit", level: !fluidOk ? "watch" : d.water.p < 0.5 ? "discuss" : d.water.p < 0.8 ? "watch" : "good", chapter: "fluid",
    title: fluidOk ? `Within your fluid limit on ${d.water.within} of ${d.water.n} logged days (${pct(d.water.p)})` : `Fluid logged on ${d.water.n} of ${d.period} days, too few to rate`,
    detail: fluidOk
      ? `A typical day is ${fmtNum(d.water.median)} ml against a ${fmtNum(d.limits.water)} ml limit; ${pct(d.lateFluid.share)} of it between 18:00 and midnight.`
      : `At least ${MIN_DAYS} logged days are needed before the share of days within your ${fmtNum(d.limits.water)} ml limit means much.`,
    basis: [{ label: "Fluid", tab: "fluid", anchor: "sec-fluid" }],
    evidence: "Strict fluid restriction is now advised mainly for people with low sodium or congestion, so whether your limit still fits is a question for your care team.",
    cites: ["escHf"],
  });

  const sodiumOk = d.sodium.n >= MIN_DAYS;
  add({
    id: "sodium-limit", level: !sodiumOk ? "watch" : d.sodium.p < 0.5 ? "discuss" : "watch", chapter: "food",
    title: sodiumOk ? `Sodium within your limit on ${d.sodium.within} of ${d.sodium.n} logged days (${pct(d.sodium.p)})` : `Sodium logged on ${d.sodium.n} of ${d.period} days, too few to rate`,
    detail: sodiumOk
      ? `A typical day is ${fmtNum(d.sodium.median)} mg against ${fmtNum(d.limits.sodium)} mg. ${d.sodiumSources[0] ? `The biggest single source is ${d.sodiumSources[0].label} (${pct(d.sodiumSources[0].share)}).` : ""}`
      : `At least ${MIN_DAYS} logged days are needed before the share of days within your ${fmtNum(d.limits.sodium)} mg limit means much.`,
    basis: [{ label: "Sodium", tab: "food", anchor: "sec-sodium" }],
    evidence: "Guidelines recommend avoiding high salt intake in heart failure; trials of strict restriction have not shown a clear benefit, so a realistic target matters more than a very low one.",
    cites: ["escHf"],
  });

  const a = d.adherence;
  if (a.due) {
    // Timed doses are the ones with a delay; their count is the slots' total.
    const timed = a.slots.reduce((s, x) => s + x.n, 0);
    const late = [...a.slots].sort((x, y) => y.median - x.median)[0];
    const delay = a.medianDelay;
    add({
      id: "adherence", level: a.taken / a.due >= 0.9 ? "good" : "watch", chapter: "meds",
      title: `${pct(a.taken / a.due)} of doses taken${timed ? `, ${pct(a.onTime / timed)} within an hour` : ""}`,
      detail: `${a.taken} of ${a.due} scheduled doses taken.${
        timed && Number.isFinite(delay)
          ? ` Typically ${Math.round(delay) === 0 ? "on time" : `${fmtNum(Math.abs(delay))} minutes ${delay > 0 ? "late" : "early"}`} (${timed} timed doses).${late && late.median > 0 ? ` The ${late.time} dose runs latest.` : ""}`
          : " No dose times to judge timing from."
      }`,
      basis: [{ label: "Taking your medicines", tab: "meds", anchor: "sec-adherence" }],
    });
  }

  const change = d.changes.find((c) => c.responses.some((r) => r.label === "Morning heart rate" && (r.confidence === "consistent" || r.confidence === "possible")));
  if (change) {
    const hr = change.responses.find((r) => r.label === "Morning heart rate")!;
    add({
      id: "change-hr", level: "watch", chapter: "meds",
      title: `Morning heart rate ${signed(hr.est)} bpm after the ${change.medicine} change recorded on ${shortDate(change.date)}`,
      detail: `${change.what}. ${hr.nBefore} readings in the 4 weeks before against ${hr.nAfter} from ${change.lag} days after (likely ${signed(hr.lo)} to ${signed(hr.hi)} bpm). A before-and-after difference, not proof the change caused it.${change.caveat ? ` ${change.caveat}` : ""}`,
      basis: [{ label: "Before and after", tab: "meds", anchor: "sec-changes" }],
    });
  }

  const swaps = foodSwaps(d);
  if (swaps.length >= 2) {
    const saved = swaps[0]!.perDay + swaps[1]!.perDay;
    add({
      id: "food-swaps", level: "watch", chapter: "food",
      title: `Two swaps could cut an estimated ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day`,
      detail: `${cap(swaps[0]!.name)} → ${swaps[0]!.swap}, and ${swaps[1]!.name} → ${swaps[1]!.swap}. The saving is a fixed per-serving estimate times how often you logged each food, not taken from your logged sodium (typically ${fmtNum(d.sodium.median)} mg a day).`,
      basis: [{ label: "Most logged foods", tab: "food", anchor: "sec-meals" }],
      evidence: mode === "deep" ? "Per-serving savings are fixed estimates from this prototype's own list; nothing was looked up." : undefined,
    });
  }

  // Warning signs keep the engine's fixed wording and always lead.
  const red = d.flags.filter((x) => x.level === "red");
  if (red.length)
    add({
      id: "warning-signs", level: "discuss", chapter: "vitals",
      title: red.length === 1 ? `Warning sign: ${red[0]!.title} on ${shortDate(red[0]!.when)}` : `${red.length} warning signs in the last 2 weeks`,
      detail: red.map((x) => `${x.title} (${shortDate(x.when)}). ${x.detail}`).join(" "),
      basis: [{ label: "Blood pressure readings", tab: "vitals", anchor: "sec-bp" }],
    });

  for (const x of f) x.at = [...new Set([...x.basis.map((b) => b.anchor), REPORT_AT[x.id] ?? ""].filter(Boolean))];
  const order: Record<Level, number> = { discuss: 0, watch: 1, good: 2 };
  f.sort((x, y) => (x.id === "warning-signs" ? -1 : y.id === "warning-signs" ? 1 : order[x.level] - order[y.level]));

  const questions = [
    dizzyNear > 0 && "Could the timing or spacing of my doses be linked to the dizziness after I take them?",
    d.bp.amN > 0 && d.bp.pmN === 0 && "Should I add evening blood-pressure readings?",
    fluidOk && d.water.p < 0.5 && `Is ${fmtNum(d.limits.water)} ml still the right fluid limit for me?`,
    alcShown && "How much alcohol is safe with my heart medicines?",
    sodiumOk && d.sodium.p < 0.5 && "Which sodium target is realistic for me?",
  ].filter((q): q is string => !!q);

  return {
    mode,
    at: Date.now(),
    period: d.period,
    startKey: d.startKey,
    endKey: d.endKey,
    headline: headlineFor(f, d.flags),
    findings: f,
    questions,
    sources: used.map((k, i) => ({ n: i + 1, ...SOURCES[k] })),
    swaps,
  };
}

/** Never reassures while a warning sign is showing. */
function headlineFor(f: Finding[], flags: Insights["flags"]): string {
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const warn = f.find((x) => x.id === "warning-signs");
  const discuss = f.filter((x) => x.level === "discuss" && x !== warn);
  const list = discuss.length
    ? `${discuss.length} ${discuss.length === 1 ? "thing" : "things"} to raise with your care team: ${discuss.map((x) => lower(x.title)).slice(0, 2).join("; ")}.`
    : "";
  if (warn) return `${warn.title}. It is listed under Warning signs in the Report.${list ? ` Also ${lower(list)}` : ""}`;
  if (list) return list;
  const amber = flags.filter((x) => x.level === "amber").length;
  if (amber) return `${amber} warning ${amber === 1 ? "sign" : "signs"} from the last 2 weeks ${amber === 1 ? "is" : "are"} listed under Warning signs in the Report.`;
  return "Nothing that needs your care team's attention; a few things to keep an eye on.";
}

// ---------------------------------------------------------------------------
// Food analysis (stub)
// ---------------------------------------------------------------------------

export const FOCUS = ["Sodium", "Potassium", "Fluid in food", "Fibre", "Sugar"] as const;

function buildFood(d: Insights, mode: Mode, focus: string[], at = Date.now()): Analysis {
  const swaps = foodSwaps(d);
  const saved = swaps.slice(0, 2).reduce((s, x) => s + x.perDay, 0);
  const notes: Analysis["foodNotes"] = [];
  const top = d.food.topFoods;
  const logged = (names: string[]) => top.filter((x) => names.some((n) => x.name.includes(n)));
  const times = (xs: typeof top) => xs.map((x) => `${x.name} (${x.n} times)`).join(", ");
  if (focus.includes("Sodium")) {
    const salty = top.filter((x) => SWAPS.has(x.name));
    notes.push({
      label: "Sodium",
      text: `${d.sodiumSources[0] ? `${cap(d.sodiumSources[0].label)} carries ${pct(d.sodiumSources[0].share)} of your logged sodium. ` : ""}${
        salty.length ? `Among your most logged foods, usually salty ones are ${times(salty)} over ${d.food.daysLogged} days with food logged.` : "None of your most logged foods are on this prototype's list of usually salty foods."
      }`,
    });
  }
  if (focus.includes("Fluid in food")) {
    const wet = logged(["soup", "yoghurt", "yogurt", "fruit", "melon", "jelly", "ice cream"]);
    notes.push({
      label: "Fluid in food",
      text: `${wet.length ? `Watery foods in your log: ${times(wet)}. ` : ""}General information: soups, fruit and yoghurt are mostly water, and many heart-failure plans count them toward the fluid limit. Ask your care team whether your ${fmtNum(d.limits.water)} ml limit includes them.`,
    });
  }
  if (focus.includes("Potassium")) {
    const k = d.food.potassium;
    notes.push({
      label: "Potassium",
      text: `${
        k.n < MIN_DAYS ? `Logged on ${k.n} days, too few to judge.` : `A typical day is ${fmtNum(k.median)} mg over ${k.n} logged days${k.limit ? ` against your ${fmtNum(k.limit)} mg limit` : ""}.`
      } General information: potassium-based salt substitutes are best avoided unless your care team agrees.`,
    });
  }
  if (focus.includes("Fibre"))
    notes.push({ label: "Fibre", text: "Fibre is not tracked in your food log, so it is not judged here. General information: diuretics and a fluid limit make constipation more likely." });
  if (focus.includes("Sugar"))
    notes.push({
      label: "Sugar",
      text: d.food.sugar.n ? `A typical day is ${fmtNum(d.food.sugar.median)} g over ${d.food.sugar.n} logged days${d.food.sugar.limit ? ` against your ${fmtNum(d.food.sugar.limit)} g limit` : ""}.` : "No sugar logged in this period.",
    });
  return {
    id: `food-${at}`,
    kind: "food",
    mode,
    at,
    period: d.period,
    startKey: d.startKey,
    endKey: d.endKey,
    focus,
    headline: swaps.length >= 2
      ? `Two swaps could cut an estimated ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day (fixed per-serving estimates, not your logged sodium).`
      : swaps.length === 1
        ? `One swap could cut an estimated ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day (a fixed per-serving estimate, not your logged sodium).`
        : "None of your most logged foods has a swap on this prototype's list.",
    findings: [],
    questions: [],
    swaps,
    foodNotes: notes,
    sources: mode === "deep" ? [{ n: 1, title: "ESC 2021 Guidelines for heart failure (salt intake)", url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045" }] : [],
  };
}

function health(d: Insights, mode: Mode, at = Date.now()): Analysis {
  return { ...buildReview(d, mode), at, id: `health-${at}`, kind: "health", focus: [], foodNotes: [] };
}

/**
 * EXAMPLE history so the list, compare and delete have something to show.
 * Built from the current numbers with some findings left out, so it is not
 * a record of past runs: each is marked `example`, labelled in the UI, and
 * kept out of comparisons with real runs, the Food tab and the tab badge.
 */
function seedHistory(d: Insights): Analysis[] {
  const DAY = 86_400_000;
  const older = health(d, "deep", Date.now() - 16 * DAY);
  older.findings = older.findings.filter((f) => !["weight-gain", "dizzy-dose", "food-swaps"].includes(f.id));
  older.headline = headlineFor(older.findings, []);
  const food = buildFood(d, "quick", ["Sodium", "Fluid in food"], Date.now() - 21 * DAY);
  const first = health(d, "quick", Date.now() - 34 * DAY);
  first.findings = first.findings.filter((f) => ["bp-protocol", "fluid-limit", "sodium-limit"].includes(f.id));
  first.headline = headlineFor(first.findings, []);
  return [older, food, first].map((x) => ({ ...x, id: `example-${x.id}`, example: true as const }));
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface Running {
  kind: Kind;
  mode: Mode;
  step: number;
  steps: string[];
}

interface AiState {
  analyses: Analysis[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  running: Running | null;
  run: (kind: Kind, mode: Mode, focus: string[]) => void;
  remove: (id: string) => void;
  addedQuestions: string[];
  toggleQuestion: (q: string) => void;
  jump: (tab: string, anchor?: string) => void;
  data: Insights;
}

const Ctx = createContext<AiState | null>(null);
export const useAi = () => useContext(Ctx);

const STEPS: Record<Kind, Record<Mode, string[]>> = {
  health: {
    quick: ["Reading the report", "Writing findings"],
    deep: ["Reading the report", "Attaching preselected guidelines", "Checking your medicines", "Writing findings with sources"],
  },
  food: {
    quick: ["Reading your food log", "Working out swaps"],
    deep: ["Reading your food log", "Matching foods to fixed estimates", "Working out swaps", "Writing notes with sources"],
  },
};

export function AiProvider({ data, jump, children }: { data: Insights; jump: (tab: string, anchor?: string) => void; children: ReactNode }) {
  // Example history only in development and previews; the released app starts empty.
  const [analyses, setAnalyses] = useState<Analysis[]>(() => (PROTOTYPES_ENABLED ? seedHistory(data) : []));
  const [openId, setOpenId] = useState<string | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [addedQuestions, setAdded] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const run = useCallback((kind: Kind, mode: Mode, focus: string[]) => {
    // The input is the data as it was when the run started, whatever range is picked meanwhile.
    const input = data;
    const steps = STEPS[kind][mode];
    const wait = mode === "deep" ? 1000 : 600;
    let i = 0;
    setRunning({ kind, mode, step: 0, steps });
    const tick = () => {
      i++;
      if (i < steps.length) {
        setRunning({ kind, mode, step: i, steps });
        timer.current = setTimeout(tick, wait);
      } else {
        const next = kind === "health" ? health(input, mode) : buildFood(input, mode, focus);
        setAnalyses((xs) => [next, ...xs]);
        setOpenId(next.id);
        setRunning(null);
      }
    };
    timer.current = setTimeout(tick, wait);
  }, [data]);

  const value = useMemo<AiState>(
    () => ({
      analyses,
      openId,
      setOpenId,
      running,
      run,
      remove: (id) => {
        setAnalyses((xs) => xs.filter((x) => x.id !== id));
        setOpenId((o) => (o === id ? null : o));
      },
      addedQuestions,
      toggleQuestion: (q) => setAdded((xs) => (xs.includes(q) ? xs.filter((x) => x !== q) : [...xs, q])),
      jump,
      data,
    }),
    [analyses, openId, running, run, addedQuestions, jump, data],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------------------------------------------------------------------------
// Visual language
// ---------------------------------------------------------------------------

export const LEVEL: Record<Level, { short: string; long: string; c: string }> = {
  discuss: { short: "Discuss", long: "Discuss with your care team", c: "bp" },
  watch: { short: "Watch", long: "Keep an eye on", c: "caffeine" },
  good: { short: "Going well", long: "Going well", c: "weight" },
};

const when = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const rel = (ts: number) => {
  const days = Math.round((Date.now() - ts) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};
const kindLabel = (k: Kind) => (k === "health" ? "Health report" : "Food");

function counts(a: Analysis) {
  return { discuss: a.findings.filter((f) => f.level === "discuss").length, watch: a.findings.filter((f) => f.level === "watch").length };
}

function Spark({ size = 14 }: { size?: number }) {
  return <Sparkles size={size} aria-hidden="true" style={{ color: col("ai"), flex: "none" }} />;
}

function Pill({ children, c = "ai" }: { children: ReactNode; c?: string }) {
  return (
    <span className="wm-pill" style={{ "--c": col(c), color: col(c) } as CSSProperties}>
      {children}
    </span>
  );
}

function Seg<T extends string>({ value, set, options, label }: { value: T; set: (v: T) => void; options: { v: T; label: string; hint: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", border: `1px solid ${col("line")}` }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            onClick={() => set(o.v)}
            style={{ flex: "1 1 0", minWidth: 0, minHeight: 44, padding: "4px 8px", border: 0, borderLeft: o.v === options[0]!.v ? 0 : `1px solid ${col("line")}`, background: on ? col("fg") : col("panel"), color: on ? col("panel") : col("fg"), textAlign: "left", cursor: "pointer" }}
          >
            <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{o.label}</span>
            <span style={{ display: "block", fontSize: 11, opacity: 0.75 }}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export function AnalysisTab() {
  const ai = useAi()!;
  const open = ai.analyses.find((a) => a.id === ai.openId) ?? ai.analyses.find((a) => !a.example) ?? ai.analyses[0] ?? null;
  return (
    <>
      {/* The real AI summary (Fast and Deep), carried over from the old Summary tab. */}
      <AiInsightsCard />
      <NewAnalysis />
      {open && <OpenAnalysis a={open} />}
      <PastAnalyses openId={open?.id ?? null} />
    </>
  );
}

/** Everything buildFood reads for this focus, so the disclosure matches the result. */
function foodReads(d: Insights, focus: string[]): string {
  const extra = [
    focus.includes("Sodium") && "the label and share of your biggest sodium source (a label can be a note you typed)",
    focus.includes("Fluid in food") && "your fluid limit",
    focus.includes("Potassium") && "your typical daily potassium, how many days it was logged and your potassium limit",
    focus.includes("Sugar") && "your typical daily sugar, how many days it was logged and your sugar limit",
  ].filter((x): x is string => !!x);
  const list = extra.length > 1 ? `${extra.slice(0, -1).join("; ")}; and ${extra[extra.length - 1]}` : extra[0];
  return `The food names you logged in the last ${d.period} days (${d.food.daysLogged} days with food), which come from your meal notes, and how often each appears${list ? `; ${list}` : ""}. Nothing else.`;
}

function NewAnalysis() {
  const ai = useAi()!;
  const d = ai.data;
  const [kind, setKind] = useState<Kind>("health");
  const [mode, setMode] = useState<Mode>("quick");
  const [focus, setFocus] = useState<string[]>(["Sodium", "Fluid in food"]);
  const [showReads, setShowReads] = useState(false);
  const r = ai.running;
  return (
    <Section title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Spark />New analysis</span>} color={col("ai")}>
      <div style={{ display: "grid", gap: 6 }}>
        <Seg label="What to analyse" value={kind} set={setKind} options={[{ v: "health", label: "Health report", hint: "Everything in this report" }, { v: "food", label: "Food", hint: "Your logged meals" }]} />
        <Seg label="Depth" value={mode} set={setMode} options={[{ v: "quick", label: "Quick", hint: "Seconds" }, { v: "deep", label: "Deep", hint: "Adds preselected sources" }]} />
      </div>
      {kind === "food" && (
        <div role="group" aria-label="Focus" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {FOCUS.map((f) => {
            const on = focus.includes(f);
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => setFocus((xs) => (on ? xs.filter((x) => x !== f) : [...xs, f]))} style={{ minHeight: 32, padding: "0 10px", border: `1px solid ${on ? col("ai") : col("line")}`, background: on ? "hsl(var(--ai) / .1)" : col("panel"), color: col("fg"), fontSize: 12, cursor: "pointer" }}>
                {on && <Check size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 3 }} />}
                {f}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" aria-expanded={showReads} onClick={() => setShowReads((v) => !v)} style={linkBtn}>
        {showReads ? <ChevronDown size={14} /> : <ChevronRight size={14} />} What it reads
      </button>
      {showReads && (
        <p style={{ ...muted, fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
          {kind === "health"
            ? `The numbers in this report for ${d.period} days: ${d.bp.tirN} blood pressure readings, ${d.water.n} days of fluid, ${d.sodium.n} of sodium, ${d.adherence.due} scheduled doses and ${d.symptoms.entries.length} journal findings, plus your medicines' names and the labels of your biggest sodium sources. A label can be the note you typed on a sodium entry, and the text can quote it; no other notes or raw entries.`
            : foodReads(d, focus)}
          {" In this prototype the text is built on this device and nothing is sent anywhere."}
          {mode === "deep" && " Deep does not search the web here: it attaches preselected guideline references, and swap savings are fixed estimates."}
        </p>
      )}
      {r ? (
        <div aria-live="polite" style={{ marginTop: 6 }}>
          <div style={{ height: 3, background: col("line") }}>
            <div style={{ height: 3, width: `${((r.step + 1) / r.steps.length) * 100}%`, background: col("ai"), transition: "width .4s" }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {kindLabel(r.kind)}, {r.mode}: {r.steps[r.step]}…
          </div>
          {r.mode === "deep" && <div style={{ ...muted, fontSize: 11 }}>Takes a few minutes in the app. It keeps going if you switch tabs in this window and appears below when ready; switching to Current Metrics or closing the window stops it.</div>}
        </div>
      ) : (
        <button
          type="button"
          disabled={kind === "food" && focus.length === 0}
          onClick={() => ai.run(kind, mode, focus)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 44, marginTop: 4, border: 0, background: col("ai"), color: col("panel"), fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          <Sparkles size={16} /> Run {mode === "deep" ? "deep" : "quick"} {kind === "health" ? "health analysis" : "food analysis"}
        </button>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The open analysis
// ---------------------------------------------------------------------------

function FindingRow({ f }: { f: Finding }) {
  const ai = useAi()!;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ minWidth: 0, boxShadow: `inset 2px 0 0 ${col(LEVEL[f.level].c)}`, padding: "0 4px 0 10px", marginTop: 6 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "flex-start", gap: 6, width: "100%", minHeight: 40, padding: "8px 0", border: 0, background: "transparent", color: col("fg"), textAlign: "left", cursor: "pointer" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{f.title}</span>
        {open ? <ChevronDown size={16} style={{ flex: "none", marginTop: 1 }} /> : <ChevronRight size={16} style={{ flex: "none", marginTop: 1 }} />}
      </button>
      {open && (
        <div style={{ paddingBottom: 10 }}>
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{f.detail}</p>
          {f.evidence && (
            <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6, color: col("muted-fg") }}>
              <BookOpen size={12} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4, color: col("ai") }} />
              {f.evidence}
              {f.sources?.length ? <sup style={{ color: col("ai"), fontWeight: 600, marginLeft: 2 }}>[{f.sources.join(",")}]</sup> : null}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            {f.basis.map((b) => (
              <button key={b.label} type="button" onClick={() => ai.jump(b.tab, b.anchor)} style={{ minHeight: 30, padding: "0 8px", border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 11.5, cursor: "pointer" }}>
                {b.label} ›
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Compare({ a }: { a: Analysis }) {
  const ai = useAi()!;
  // Real runs compare only with real runs, examples only with examples.
  const same = ai.analyses.filter((x) => x.kind === a.kind && x.id !== a.id && !x.example === !a.example);
  const fallback = () => same.find((x) => x.at < a.at) ?? same[0];
  const [againstId, setAgainstId] = useState<string>(() => fallback()?.id ?? "");
  const [show, setShow] = useState(false);
  // If the chosen one was deleted, fall back to one that is still there.
  const b = same.find((x) => x.id === againstId) ?? fallback();
  if (!same.length) return null;
  if (a.kind !== "health") return <p style={{ ...muted, fontSize: 11, marginTop: 14 }}>Comparing analyses is for health reports only in this prototype.</p>;
  const flagged = (x: Analysis) => x.findings.filter((f) => f.level !== "good");
  const [newer, older] = b && b.at > a.at ? [b, a] : [a, b];
  const added = b ? flagged(newer).filter((f) => !flagged(older!).some((p) => p.id === f.id)) : [];
  const still = b ? flagged(newer).filter((f) => flagged(older!).some((p) => p.id === f.id)) : [];
  const gone = b ? flagged(older!).filter((p) => !flagged(newer).some((f) => f.id === p.id)) : [];
  // Resolved only when the newer analysis measured the same thing and rated it well.
  const resolved = (p: Finding) => newer.findings.some((f) => f.id === p.id && f.level === "good");
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" aria-expanded={show} onClick={() => setShow((v) => !v)} style={{ ...linkBtn, color: col("fg"), fontWeight: 600 }}>
        {show ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Compare with another analysis
      </button>
      {show && (
        <div style={{ fontSize: 12 }}>
          <label htmlFor="compare-with" style={muted}>
            Compare with
          </label>{" "}
          <select id="compare-with" value={b?.id ?? ""} onChange={(e) => setAgainstId(e.target.value)} style={{ minHeight: 32, border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 12 }}>
            {same.map((x) => (
              <option key={x.id} value={x.id}>
                {when(x.at)} · {x.mode}
                {x.example ? " · example" : ""}
              </option>
            ))}
          </select>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {added.map((f) => (
              <li key={`a${f.id}`}>
                <b style={{ color: col("bp") }}>New</b> {f.title}
              </li>
            ))}
            {still.map((f) => (
              <li key={`s${f.id}`}>
                <b style={{ color: col("caffeine") }}>Still</b> {f.title}
              </li>
            ))}
            {gone.map((f) =>
              resolved(f) ? (
                <li key={`g${f.id}`}>
                  <b style={{ color: col("weight") }}>Resolved</b> {f.title}
                </li>
              ) : (
                <li key={`g${f.id}`}>
                  <b style={{ color: col("muted-fg") }}>Not flagged in the newer analysis</b> {f.title}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function OpenAnalysis({ a }: { a: Analysis }) {
  const ai = useAi()!;
  const latestReal = ai.analyses.find((x) => !x.example);
  const latest = latestReal?.id === a.id;
  return (
    <Section
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {kindLabel(a.kind)} <Pill>{a.mode}</Pill>
          {a.example && <Pill c="muted-fg">example</Pill>}
        </span>
      }
      aside={<span style={{ ...muted, fontSize: 11, fontWeight: 400 }}>{a.example ? "Example" : latest ? "Latest" : "Past"} · {when(a.at)}</span>}
      color={col("ai")}
    >
      {a.example && (
        <p style={{ ...muted, fontSize: 11, marginBottom: 6 }}>
          Example data: made from your current numbers to show what history looks like, not an analysis that was run on {when(a.at)}.
        </p>
      )}
      {!latest && latestReal && (
        <button type="button" onClick={() => ai.setOpenId(latestReal.id)} style={{ ...linkBtn, marginTop: -6, marginBottom: 6 }}>
          ‹ Back to the latest
        </button>
      )}
      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, textWrap: "pretty" } as CSSProperties}>{a.headline}</p>
      <p style={{ ...muted, fontSize: 11, marginTop: 2 }}>
        {shortDate(a.startKey)} – {shortDate(a.endKey)} ({a.period} days), analysed {rel(a.at)}
        {a.kind === "food" && a.focus.length ? ` · ${a.focus.join(", ")}` : ""}
      </p>

      {a.kind === "health" &&
        (["discuss", "watch", "good"] as const).map((lv) => {
          const fs = a.findings.filter((f) => f.level === lv);
          if (!fs.length) return null;
          return (
            <div key={lv} style={{ marginTop: 14 }}>
              <div style={{ font: "700 11px/1 var(--font-plex-sans), sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", color: col(LEVEL[lv].c) }}>
                {LEVEL[lv].long} · {fs.length}
              </div>
              {fs.map((f) => (
                <FindingRow key={f.id} f={f} />
              ))}
            </div>
          );
        })}

      {a.kind === "food" && (
        <>
          {a.swaps.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={muted}>
                    <th style={{ textAlign: "left", fontWeight: 500, paddingBottom: 4 }}>Instead of</th>
                    <th style={{ textAlign: "left", fontWeight: 500, paddingLeft: 8 }}>Try</th>
                    <th style={{ textAlign: "right", fontWeight: 500, paddingLeft: 8 }}>Est. saving a day</th>
                  </tr>
                </thead>
                <tbody>
                  {a.swaps.map((s) => (
                    <tr key={s.name} style={{ borderTop: `1px solid ${col("line")}` }}>
                      <td style={{ padding: "6px 0", textTransform: "capitalize" }}>{s.name}</td>
                      <td style={{ paddingLeft: 8 }}>{s.swap}</td>
                      <td style={{ ...mono, textAlign: "right", paddingLeft: 8, color: col("weight") }}>−{fmtNum(Math.round(s.perDay / 10) * 10)} mg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl style={{ margin: "12px 0 0", display: "grid", gap: 8 }}>
            {a.foodNotes.map((n) => (
              <div key={n.label}>
                <dt style={{ fontSize: 12, fontWeight: 600 }}>{n.label}</dt>
                <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{n.text}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => ai.jump("food", "sec-meals")} style={{ ...linkBtn, color: col("fg") }}>
            Most logged foods ›
          </button>
        </>
      )}

      {a.questions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Questions for your appointment</div>
          <div style={{ ...muted, fontSize: 11 }}>Added questions appear in the on-screen Report under Things to ask about. The PDF export does not include them yet.</div>
          {a.questions.map((q) => {
            const on = ai.addedQuestions.includes(q);
            return (
              <button key={q} type="button" aria-pressed={on} onClick={() => ai.toggleQuestion(q)} style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", minHeight: 36, padding: "6px 0", border: 0, background: "transparent", color: on ? col("fg") : col("muted-fg"), fontSize: 13, textAlign: "left", cursor: "pointer" }}>
                <span style={{ flex: "none", display: "grid", placeItems: "center", width: 20, height: 20, border: `1px solid ${on ? col("ai") : col("line")}`, background: on ? col("ai") : "transparent", color: col("panel") }}>{on ? <Check size={13} /> : <Plus size={13} style={{ color: col("muted-fg") }} />}</span>
                <span>{q}</span>
              </button>
            );
          })}
        </div>
      )}

      <Compare key={a.id} a={a} />

      {a.sources.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Sources</div>
          <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, display: "grid", gap: 3 }}>
            {a.sources.map((s) => (
              <li key={s.n}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: col("ai") }}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p style={{ ...muted, fontSize: 11, marginTop: 14 }}>
        Not medical advice. It never suggests changing a dose; warning signs use fixed wording. These results are written from your numbers by fixed rules, not by the AI (AI Insights above is the AI summary), and Deep attaches preselected references rather than searching.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Past analyses
// ---------------------------------------------------------------------------

function PastAnalyses({ openId }: { openId: string | null }) {
  const ai = useAi()!;
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Section title={`Past analyses · ${ai.analyses.length}`} color={col("line")}>
      {ai.analyses.length === 0 && <p style={muted}>None yet.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {ai.analyses.map((a) => {
          const c = counts(a);
          const isOpen = a.id === openId;
          return (
            <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 4, borderTop: `1px solid ${col("line")}`, minHeight: 52, background: isOpen ? "hsl(var(--ai) / .06)" : "transparent" }}>
              {confirm === a.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 0", fontSize: 13 }}>
                  <span style={{ flex: 1 }}>Delete this analysis?</span>
                  <button type="button" onClick={() => setConfirm(null)} style={smallBtn}>
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ai.remove(a.id);
                      setConfirm(null);
                    }}
                    style={{ ...smallBtn, background: col("bp"), color: col("panel"), borderColor: col("bp") }}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => ai.setOpenId(a.id)} aria-current={isOpen} style={{ flex: 1, minWidth: 0, display: "grid", gap: 2, padding: "8px 6px", border: 0, background: "transparent", color: col("fg"), textAlign: "left", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                      {kindLabel(a.kind)} <Pill>{a.mode}</Pill>
                      {a.example && <Pill c="muted-fg">example</Pill>}
                      <span style={{ ...muted, fontWeight: 400, fontSize: 12, marginLeft: "auto" }}>{when(a.at)}</span>
                    </span>
                    <span style={{ ...muted, fontSize: 12 }}>
                      {a.kind === "health" ? (
                        <>
                          <b style={{ color: col("bp") }}>{c.discuss} discuss</b> · <b style={{ color: col("caffeine") }}>{c.watch} watch</b> · {a.period} days
                        </>
                      ) : (
                        `${a.swaps.length} swaps · ${a.focus.join(", ")}`
                      )}
                    </span>
                  </button>
                  <button type="button" aria-label={`Delete the ${kindLabel(a.kind).toLowerCase()} analysis from ${when(a.at)}`} onClick={() => setConfirm(a.id)} style={{ flex: "none", display: "grid", placeItems: "center", width: 40, height: 40, border: 0, background: "transparent", color: col("muted-fg"), cursor: "pointer" }}>
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Used elsewhere in the window
// ---------------------------------------------------------------------------

/** Count of things to discuss in the latest health analysis, for the tab label. */
export function AnalysisTabCount() {
  const ai = useAi();
  const latest = ai?.analyses.find((a) => a.kind === "health" && !a.example);
  const n = latest ? counts(latest).discuss : 0;
  if (!n) return null;
  return (
    <span aria-label={`${n} to discuss`} style={{ display: "inline-grid", placeItems: "center", minWidth: 15, height: 15, marginLeft: 3, padding: "0 3px", background: col("bp"), color: col("panel"), font: "700 9px/1 var(--font-plex-mono), monospace", verticalAlign: "1px" }}>
      {n}
    </span>
  );
}

/** The latest real food analysis (never an example), for the Food tab's swap column. */
export function useLatestFood() {
  return useAi()?.analyses.find((a) => a.kind === "food" && !a.example) ?? null;
}

export function SwapCell({ name }: { name: string }) {
  const ai = useAi();
  const food = useLatestFood();
  const s = food?.swaps.find((x) => x.name === name);
  if (!food || !s) return <span style={muted}>—</span>;
  // The saved rate is over the analysis' own window, which may not be the range shown now.
  const other = !!ai && (food.startKey !== ai.data.startKey || food.endKey !== ai.data.endKey);
  return (
    <span style={{ display: "block", textAlign: "left", fontFamily: "var(--font-plex-sans), sans-serif", fontSize: 11.5, lineHeight: 1.35 }}>
      {s.swap}
      <span style={{ ...mono, display: "block", color: col("weight") }}>
        est. −{fmtNum(Math.round(s.perDay / 10) * 10)} mg/day
        {other && (
          <span style={{ color: col("muted-fg") }}>
            {" "}· over {shortDate(food.startKey)} – {shortDate(food.endKey)}
          </span>
        )}
      </span>
    </span>
  );
}


const linkBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 4, marginTop: 8, padding: 0, minHeight: 32, background: "none", border: 0, color: col("muted-fg"), fontSize: 12, cursor: "pointer" };
const smallBtn: CSSProperties = { minHeight: 34, padding: "0 12px", border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 12, cursor: "pointer" };
