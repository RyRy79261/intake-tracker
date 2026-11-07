"use client";

/**
 * PROTOTYPE — throwaway. The Analysis tab of the Metrics report.
 *
 * One place for the AI analyses: start a Health report or Food analysis
 * (Quick, or Deep with web search and cited sources), read the open one,
 * and manage every past one (open, compare with the latest, delete).
 * Findings link to the chapter section they are about; appointment
 * questions can be added to the report; food swaps feed the Food tab.
 *
 * The model calls are STUBBED: results come from fixed templates over the
 * engine's numbers. Sources are the real ones found in this prototype's
 * research.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { Section, col, fmtNum, mono, muted, pct, shortDate } from "@/components/analytics/insights-prototype/ui";

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

export interface Swap {
  name: string;
  swap: string;
  perDay: number;
}

export interface Review {
  mode: Mode;
  at: number;
  period: number;
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

const SWAPS: Record<string, { swap: string; perServing: number }> = {
  ham: { swap: "fresh roast chicken", perServing: 450 },
  "ham sandwich": { swap: "chicken salad on low-salt bread", perServing: 700 },
  bread: { swap: "low-salt bread", perServing: 150 },
  toast: { swap: "low-salt bread", perServing: 150 },
  cheese: { swap: "fresh mozzarella or ricotta", perServing: 250 },
  soup: { swap: "home-made, no stock cube", perServing: 700 },
  crisps: { swap: "unsalted nuts", perServing: 200 },
  pizza: { swap: "home-made, half the cheese", perServing: 600 },
  pasta: { swap: "no salt in the water", perServing: 250 },
};

export function foodSwaps(d: Insights): Swap[] {
  const days = Math.max(1, d.food.daysLogged);
  return d.food.topFoods
    .flatMap((f) => {
      const s = SWAPS[f.name];
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
  ahaHbpm: { title: "AHA: Self-measured blood pressure monitoring at home (2019)", url: "https://www.ahajournals.org/doi/10.1161/HYP.0000000000000087" },
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

  const dizzy = d.symptoms.patterns.find((p) => /dizz|light/i.test(p.finding));
  if (dizzy)
    add({
      id: "dizzy-dose", level: "discuss", chapter: "meds",
      title: `Dizziness follows your doses`,
      detail: `${dizzy.finding} was logged ${dizzy.n} times; ${dizzy.text}. Morning systolic was ${fmtNum(d.bp.sysP10)}–${fmtNum(d.bp.sysP90)} on most days, so the drop happens after the reading, not at it.`,
      basis: [
        { label: "Morning blood pressure", tab: "vitals", anchor: "sec-bp" },
        { label: "Dose timing", tab: "meds", anchor: "sec-adherence" },
      ],
      evidence: "Symptomatic hypotension is a known effect of beta-blockers and ARNIs, especially on standing. Guidelines advise reviewing timing and dose spacing with the prescriber rather than stopping.",
      cites: ["escHf"],
    });

  if (!d.bp.meetsProtocol)
    add({
      id: "bp-protocol", level: "watch", chapter: "vitals",
      title: "Blood pressure is only measured in the morning",
      detail: `${d.bp.amN} morning and ${d.bp.pmN} evening readings this week. The home average of ${fmtNum(d.bp.sys)}/${fmtNum(d.bp.dia)} misses the evening, which is when your later doses are working.`,
      basis: [{ label: "Home blood pressure", tab: "vitals", anchor: "sec-bp" }],
      evidence: "The standard home protocol is two readings morning and evening for 7 days, discarding day 1 and averaging the rest (at least 12 readings).",
      cites: ["esh", "ahaHbpm", "racgp"],
    });
  else
    add({
      id: "bp-protocol", level: "good", chapter: "vitals",
      title: "Home blood pressure follows the standard protocol",
      detail: `${d.bp.amN} morning and ${d.bp.pmN} evening readings this week, average ${fmtNum(d.bp.sys)}/${fmtNum(d.bp.dia)}.`,
      basis: [{ label: "Home blood pressure", tab: "vitals", anchor: "sec-bp" }],
      cites: ["esh"],
    });

  const inBand = d.bp.tir.in / Math.max(1, d.bp.tirN);
  add({
    id: "bp-range", level: inBand >= 0.7 ? "good" : "watch", chapter: "vitals",
    title: `${pct(inBand)} of readings in the 100–134 band`,
    detail: `${d.bp.tir.low} readings below 100 systolic and ${d.bp.tir.high} at or above 135/85 over ${d.period} days.`,
    basis: [{ label: "Readings by band", tab: "vitals", anchor: "sec-bp" }],
    evidence: "Time in target range predicts outcomes beyond the average reading, so the share of readings in range is worth tracking alongside it.",
    cites: ["tir"],
  });

  const alcHr = d.effects.find((e) => e.id === "alc-hr");
  if (alcHr && (alcHr.confidence === "consistent" || alcHr.confidence === "possible"))
    add({
      id: "alcohol-hr", level: "discuss", chapter: "fluid",
      title: `Heart rate is ${fmtNum(alcHr.est)} bpm higher the morning after 3+ drinks`,
      detail: `Seen across ${alcHr.nExposed} drinking days against ${alcHr.nOther} other days (likely ${fmtNum(alcHr.lo)} to ${fmtNum(alcHr.hi)} bpm). You drank on ${d.alcohol.drinkDays} of ${d.alcohol.n} days, ${fmtNum(d.alcohol.perWeek, 1)} standard drinks a week.`,
      basis: [
        { label: "Alcohol", tab: "fluid", anchor: "sec-alcohol" },
        { label: "Heart rate chart", tab: "vitals", anchor: "sec-bp" },
      ],
      evidence: "Heart-failure guidelines advise limiting alcohol, and a raised resting heart rate works against the rate control a beta-blocker is there for.",
      cites: ["escHf"],
    });

  add({
    id: "fluid-limit", level: d.water.p < 0.5 ? "discuss" : d.water.p < 0.8 ? "watch" : "good", chapter: "fluid",
    title: `Within your fluid limit on ${pct(d.water.p)} of days`,
    detail: `A typical day is ${fmtNum(d.water.median)} ml against a ${fmtNum(d.limits.water)} ml limit; ${pct(d.fluidClock.slice(6).reduce((s, v) => s + v, 0))} of it comes after 18:00.`,
    basis: [{ label: "Fluid", tab: "fluid", anchor: "sec-fluid" }],
    evidence: "Strict fluid restriction is now advised mainly for people with low sodium or congestion, so whether your limit still fits is a question for your care team.",
    cites: ["escHf"],
  });

  add({
    id: "sodium-limit", level: d.sodium.p < 0.5 ? "discuss" : "watch", chapter: "food",
    title: `Sodium within your limit on ${pct(d.sodium.p)} of days`,
    detail: `A typical day is ${fmtNum(d.sodium.median)} mg against ${fmtNum(d.limits.sodium)} mg. ${d.sodiumSources[0] ? `The biggest single source is ${d.sodiumSources[0].label} (${pct(d.sodiumSources[0].share)}).` : ""}`,
    basis: [{ label: "Sodium", tab: "food", anchor: "sec-sodium" }],
    evidence: "Guidelines recommend avoiding high salt intake in heart failure; trials of strict restriction have not shown a clear benefit, so a realistic target matters more than a very low one.",
    cites: ["escHf"],
  });

  const a = d.adherence;
  if (a.due)
    add({
      id: "adherence", level: a.taken / a.due >= 0.9 ? "good" : "watch", chapter: "meds",
      title: `${pct(a.taken / a.due)} of doses taken, ${pct(a.onTime / Math.max(1, a.taken))} within an hour`,
      detail: `Typically ${fmtNum(a.medianDelay)} minutes late; ${a.slots.length ? `the ${[...a.slots].sort((x, y) => y.median - x.median)[0]!.time} dose runs latest.` : ""}`,
      basis: [{ label: "Taking your medicines", tab: "meds", anchor: "sec-adherence" }],
    });

  const change = d.changes.find((c) => c.responses.some((r) => r.label === "Morning heart rate" && (r.confidence === "consistent" || r.confidence === "possible")));
  if (change) {
    const hr = change.responses.find((r) => r.label === "Morning heart rate")!;
    add({
      id: "change-hr", level: "good", chapter: "meds",
      title: `${change.medicine} change on ${shortDate(change.date)}: heart rate ${fmtNum(hr.est)} bpm`,
      detail: `4 weeks before against 4 weeks from ${change.lag} days after (${hr.nBefore} and ${hr.nAfter} readings).`,
      basis: [{ label: "Before and after", tab: "meds", anchor: "sec-changes" }],
    });
  }

  const swaps = foodSwaps(d);
  if (swaps.length >= 2) {
    const saved = swaps[0]!.perDay + swaps[1]!.perDay;
    add({
      id: "food-swaps", level: "watch", chapter: "food",
      title: `Two swaps would cut about ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day`,
      detail: `${cap(swaps[0]!.name)} → ${swaps[0]!.swap}, and ${swaps[1]!.name} → ${swaps[1]!.swap}. That takes a typical day from ${fmtNum(d.sodium.median)} to about ${fmtNum(Math.round((d.sodium.median - saved) / 10) * 10)} mg.`,
      basis: [{ label: "Most logged foods", tab: "food", anchor: "sec-meals" }],
      evidence: mode === "deep" ? "Sodium per serving checked against nutrition databases found by web search." : undefined,
    });
  }

  for (const x of f) x.at = [...new Set([...x.basis.map((b) => b.anchor), REPORT_AT[x.id] ?? ""].filter(Boolean))];
  const order: Record<Level, number> = { discuss: 0, watch: 1, good: 2 };
  f.sort((x, y) => order[x.level] - order[y.level]);
  const discuss = f.filter((x) => x.level === "discuss");
  const headline = discuss.length
    ? `${discuss.length} things to raise with your care team: ${discuss.map((x) => x.title.charAt(0).toLowerCase() + x.title.slice(1)).slice(0, 2).join("; ")}.`
    : "Nothing that needs your care team's attention; a few things to keep an eye on.";

  const questions = [
    dizzy && "Could the timing or spacing of my doses be causing the dizziness after I take them?",
    !d.bp.meetsProtocol && "Should I add evening blood-pressure readings?",
    d.water.p < 0.5 && `Is ${fmtNum(d.limits.water)} ml still the right fluid limit for me?`,
    alcHr && "How much alcohol is safe with my heart medicines?",
    d.sodium.p < 0.5 && "Which sodium target is realistic for me?",
  ].filter((q): q is string => !!q);

  return {
    mode,
    at: Date.now(),
    period: d.period,
    headline,
    findings: f,
    questions,
    sources: used.map((k, i) => ({ n: i + 1, ...SOURCES[k] })),
    swaps,
  };
}

// ---------------------------------------------------------------------------
// Food analysis (stub)
// ---------------------------------------------------------------------------

export const FOCUS = ["Sodium", "Potassium", "Fluid in food", "Fibre", "Sugar"] as const;

function buildFood(d: Insights, mode: Mode, focus: string[], at = Date.now()): Analysis {
  const swaps = foodSwaps(d);
  const saved = swaps.slice(0, 2).reduce((s, x) => s + x.perDay, 0);
  const notes: Analysis["foodNotes"] = [];
  if (focus.includes("Sodium"))
    notes.push({
      label: "Sodium",
      text: `${d.sodiumSources[0] ? `${cap(d.sodiumSources[0].label)} carries ${pct(d.sodiumSources[0].share)} of your logged sodium. ` : ""}Bread, cheese and cured meat appear almost daily, and together they make up most of the rest.`,
    });
  if (focus.includes("Fluid in food"))
    notes.push({ label: "Fluid in food", text: `Soups, fruit and yoghurt count toward your ${fmtNum(d.limits.water)} ml limit. Days with soup add roughly 200–300 ml you may not be logging as fluid.` });
  if (focus.includes("Potassium"))
    notes.push({ label: "Potassium", text: `Logged on ${d.food.potassium.n} days, too few to judge. Avoid potassium-based salt substitutes unless your care team agrees.` });
  if (focus.includes("Fibre"))
    notes.push({ label: "Fibre", text: "Vegetables appear on few days; most meals are bread, pasta and cheese. Diuretics and a fluid limit make constipation more likely." });
  if (focus.includes("Sugar"))
    notes.push({ label: "Sugar", text: `A typical day is ${fmtNum(d.food.sugar.median)} g${d.food.sugar.limit ? ` against your ${fmtNum(d.food.sugar.limit)} g limit` : ""}.` });
  return {
    id: `food-${at}`,
    kind: "food",
    mode,
    at,
    period: 30,
    focus,
    headline: swaps.length >= 2
      ? `Two swaps would cut about ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day, taking a typical day from ${fmtNum(d.sodium.median)} to about ${fmtNum(Math.round((d.sodium.median - saved) / 10) * 10)} mg.`
      : "Your sodium is spread across many foods; no single swap moves it much.",
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

/** Example history so the list, compare and delete have something to show. */
function seedHistory(d: Insights): Analysis[] {
  const DAY = 86_400_000;
  const older = health(d, "deep", Date.now() - 16 * DAY);
  older.findings = older.findings
    .filter((f) => !["weight-gain", "dizzy-dose", "food-swaps"].includes(f.id))
    .concat({ id: "missed-evening", level: "watch", chapter: "meds", title: "Evening doses are often missed", detail: "6 of 30 evening doses were not logged as taken.", basis: [{ label: "Taking your medicines", tab: "meds", anchor: "sec-adherence" }] });
  older.headline = "2 things to raise with your care team: fluid over the limit most days, and heart rate after drinking.";
  const food = buildFood(d, "quick", ["Sodium", "Fluid in food"], Date.now() - 21 * DAY);
  const first = health(d, "quick", Date.now() - 34 * DAY);
  first.findings = first.findings.filter((f) => ["bp-protocol", "fluid-limit", "sodium-limit"].includes(f.id));
  first.headline = "Fluid and sodium are over your limits on most days.";
  return [older, food, first];
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
    deep: ["Reading the report", "Searching guidelines", "Checking your medicines", "Comparing with last time", "Writing findings with sources"],
  },
  food: {
    quick: ["Reading your food log", "Working out swaps"],
    deep: ["Reading your food log", "Looking up sodium per food", "Working out swaps", "Writing notes with sources"],
  },
};

export function AiProvider({ data, jump, children }: { data: Insights; jump: (tab: string, anchor?: string) => void; children: ReactNode }) {
  const [analyses, setAnalyses] = useState<Analysis[]>(() => seedHistory(data));
  const [openId, setOpenId] = useState<string | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [addedQuestions, setAdded] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const run = useCallback((kind: Kind, mode: Mode, focus: string[]) => {
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
        const next = kind === "health" ? health(dataRef.current, mode) : buildFood(dataRef.current, mode, focus);
        setAnalyses((xs) => [next, ...xs]);
        setOpenId(next.id);
        setRunning(null);
      }
    };
    timer.current = setTimeout(tick, wait);
  }, []);

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
  const open = ai.analyses.find((a) => a.id === ai.openId) ?? ai.analyses[0] ?? null;
  return (
    <>
      <NewAnalysis />
      {open && <OpenAnalysis a={open} />}
      <PastAnalyses openId={open?.id ?? null} />
    </>
  );
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
        <Seg label="Depth" value={mode} set={setMode} options={[{ v: "quick", label: "Quick", hint: "Seconds" }, { v: "deep", label: "Deep", hint: "Minutes, with sources" }]} />
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
            ? `The numbers in this report for ${d.period} days: ${d.bp.tirN} blood pressure readings, ${d.water.n} days of fluid, ${d.sodium.n} of sodium, ${d.adherence.due} scheduled doses and ${d.symptoms.entries.length} journal findings, plus your conditions and medicines. Never your raw entries or notes.`
            : `The names and grams of the foods you logged in the last 30 days (${d.food.daysLogged} days) and your limits. Nothing else.`}
          {mode === "deep" && " Deep also searches guideline, research and nutrition sites; your data never goes into a search."}
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
          {r.mode === "deep" && <div style={{ ...muted, fontSize: 11 }}>Takes a few minutes in the app. It keeps going if you leave and appears below when ready.</div>}
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
  const same = ai.analyses.filter((x) => x.kind === a.kind && x.id !== a.id);
  const [againstId, setAgainstId] = useState<string>(() => same.find((x) => x.at < a.at)?.id ?? same[0]?.id ?? "");
  const [show, setShow] = useState(false);
  const b = same.find((x) => x.id === againstId);
  if (!same.length || a.kind !== "health") return null;
  const flagged = (x: Analysis) => x.findings.filter((f) => f.level !== "good");
  const [newer, older] = b && b.at > a.at ? [b, a] : [a, b];
  const added = b ? flagged(newer).filter((f) => !older!.findings.some((p) => p.id === f.id)) : [];
  const still = b ? flagged(newer).filter((f) => flagged(older!).some((p) => p.id === f.id)) : [];
  const gone = b ? flagged(older!).filter((p) => !flagged(newer).some((f) => f.id === p.id)) : [];
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
          <select id="compare-with" value={againstId} onChange={(e) => setAgainstId(e.target.value)} style={{ minHeight: 32, border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 12 }}>
            {same.map((x) => (
              <option key={x.id} value={x.id}>
                {when(x.at)} · {x.mode}
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
            {gone.map((f) => (
              <li key={`g${f.id}`}>
                <b style={{ color: col("weight") }}>Resolved</b> {f.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OpenAnalysis({ a }: { a: Analysis }) {
  const ai = useAi()!;
  const latest = ai.analyses[0]?.id === a.id;
  return (
    <Section
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {kindLabel(a.kind)} <Pill>{a.mode}</Pill>
        </span>
      }
      aside={<span style={{ ...muted, fontSize: 11, fontWeight: 400 }}>{latest ? "Latest" : "Past"} · {when(a.at)}</span>}
      color={col("ai")}
    >
      {!latest && (
        <button type="button" onClick={() => ai.setOpenId(ai.analyses[0]!.id)} style={{ ...linkBtn, marginTop: -6, marginBottom: 6 }}>
          ‹ Back to the latest
        </button>
      )}
      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, textWrap: "pretty" } as CSSProperties}>{a.headline}</p>
      <p style={{ ...muted, fontSize: 11, marginTop: 2 }}>
        Last {a.period} days, analysed {rel(a.at)}
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
                    <th style={{ textAlign: "right", fontWeight: 500, paddingLeft: 8 }}>Saves a day</th>
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
          <div style={{ ...muted, fontSize: 11 }}>Added questions appear in the Report and its PDF.</div>
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
        Not medical advice. It never suggests changing a dose; warning signs use fixed wording. PROTOTYPE: results come from fixed templates over your numbers.
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
  const latest = ai?.analyses.find((a) => a.kind === "health");
  const n = latest ? counts(latest).discuss : 0;
  if (!n) return null;
  return (
    <span aria-label={`${n} to discuss`} style={{ display: "inline-grid", placeItems: "center", minWidth: 15, height: 15, marginLeft: 3, padding: "0 3px", background: col("bp"), color: col("panel"), font: "700 9px/1 var(--font-plex-mono), monospace", verticalAlign: "1px" }}>
      {n}
    </span>
  );
}

/** The latest food analysis, for the Food tab's swap column. */
export function useLatestFood() {
  return useAi()?.analyses.find((a) => a.kind === "food") ?? null;
}

export function SwapCell({ name }: { name: string }) {
  const s = useLatestFood()?.swaps.find((x) => x.name === name);
  if (!s) return <span style={muted}>—</span>;
  return (
    <span style={{ display: "block", textAlign: "left", fontFamily: "var(--font-plex-sans), sans-serif", fontSize: 11.5, lineHeight: 1.35 }}>
      {s.swap}
      <span style={{ ...mono, display: "block", color: col("weight") }}>−{fmtNum(Math.round(s.perDay / 10) * 10)} mg/day</span>
    </span>
  );
}


const linkBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 4, marginTop: 8, padding: 0, minHeight: 32, background: "none", border: 0, color: col("muted-fg"), fontSize: 12, cursor: "pointer" };
const smallBtn: CSSProperties = { minHeight: 34, padding: "0 12px", border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 12, cursor: "pointer" };
