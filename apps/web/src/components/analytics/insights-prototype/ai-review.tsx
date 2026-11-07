"use client";

/**
 * PROTOTYPE — throwaway. The AI analysis layer of the Metrics report.
 *
 * One analysis run (Quick, or Deep with web search and cited sources) reads
 * the report's numbers and returns findings, appointment questions, food
 * swaps and references. Three ways to show it, compared with `?variant=`:
 *
 *   1  Notes      — one slim analyse row; findings sit as one-line notes in
 *                   the section they are about; questions join the report's
 *                   questions; sources become References.
 *   2  Strip      — a row of finding chips per tab; tap one for a sheet.
 *   3  Line       — one summary line under the tabs, counts on the tabs,
 *                   dots on flagged sections; everything else in a sheet.
 *
 * The model calls are STUBBED: findings come from fixed templates over the
 * engine's numbers. Sources are the real ones found in this prototype's
 * research.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Info, Plus, Sparkles, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@intake/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@intake/ui/popover";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { col, fmtNum, mono, muted, pct, shortDate } from "@/components/analytics/insights-prototype/ui";

export type Chapter = "vitals" | "fluid" | "food" | "meds";
export type Level = "discuss" | "watch" | "good";
export type Mode = "quick" | "deep";
export type Treatment = "notes" | "strip" | "line";

export interface Finding {
  id: string;
  level: Level;
  chapter: Chapter;
  title: string;
  detail: string;
  basis: { label: string; tab: Chapter; anchor: string }[];
  /** Places it is shown: chapter section ids and report section keys. */
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
// Shared state: the current analysis, the run, the sheet
// ---------------------------------------------------------------------------

interface Running {
  mode: Mode;
  step: number;
  steps: string[];
}

interface AiState {
  treatment: Treatment;
  review: Review | null;
  previous: Review | null;
  running: Running | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  run: () => void;
  share: { profile: boolean; meds: boolean; compare: boolean };
  setShare: (s: AiState["share"]) => void;
  addedQuestions: string[];
  toggleQuestion: (q: string) => void;
  sheet: { open: boolean; focus?: string };
  openSheet: (focus?: string) => void;
  closeSheet: () => void;
  jump: (tab: string, anchor?: string) => void;
  data: Insights;
}

const Ctx = createContext<AiState | null>(null);
export const useAi = () => useContext(Ctx);

const QUICK_STEPS = ["Reading the report", "Writing findings"];
const DEEP_STEPS = ["Reading the report", "Searching guidelines", "Checking your medicines", "Comparing with last time", "Writing findings with sources"];

export function AiProvider({ data, treatment, jump, children }: { data: Insights; treatment: Treatment; jump: (tab: string, anchor?: string) => void; children: ReactNode }) {
  const [review, setReview] = useState<Review | null>(null);
  const [previous, setPrevious] = useState<Review | null>(EARLIER_REVIEW);
  const [running, setRunning] = useState<Running | null>(null);
  const [mode, setMode] = useState<Mode>("quick");
  const [share, setShare] = useState({ profile: true, meds: true, compare: true });
  const [addedQuestions, setAdded] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; focus?: string }>({ open: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewRef = useRef<Review | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const run = useCallback(() => {
    const steps = mode === "deep" ? DEEP_STEPS : QUICK_STEPS;
    const wait = mode === "deep" ? 1100 : 650;
    let i = 0;
    setRunning({ mode, step: 0, steps });
    const tick = () => {
      i++;
      if (i < steps.length) {
        setRunning({ mode, step: i, steps });
        timer.current = setTimeout(tick, wait);
      } else {
        setRunning(null);
        if (reviewRef.current) setPrevious(reviewRef.current);
        const next = buildReview(dataRef.current, mode);
        reviewRef.current = next;
        setReview(next);
      }
    };
    timer.current = setTimeout(tick, wait);
  }, [mode]);

  const value = useMemo<AiState>(
    () => ({
      treatment,
      review,
      previous,
      running,
      mode,
      setMode,
      run,
      share,
      setShare,
      addedQuestions,
      toggleQuestion: (q) => setAdded((xs) => (xs.includes(q) ? xs.filter((x) => x !== q) : [...xs, q])),
      sheet,
      openSheet: (focus) => setSheet(focus ? { open: true, focus } : { open: true }),
      closeSheet: () => setSheet({ open: false }),
      jump,
      data,
    }),
    [treatment, review, previous, running, mode, run, share, addedQuestions, sheet, jump, data],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {treatment !== "notes" && <AnalysisSheet />}
    </Ctx.Provider>
  );
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

/** A pretend earlier review, so "since your last review" has something to diff. */
const EARLIER_REVIEW: Review = {
  mode: "quick",
  at: Date.now() - 16 * 86_400_000,
  period: 30,
  headline: "",
  questions: [],
  sources: [],
  swaps: [],
  findings: [
    { id: "bp-protocol", level: "watch", chapter: "vitals", title: "Blood pressure is only measured in the morning", detail: "", basis: [] },
    { id: "fluid-limit", level: "discuss", chapter: "fluid", title: "Over the fluid limit most days", detail: "", basis: [] },
    { id: "missed-evening", level: "watch", chapter: "meds", title: "Evening doses often missed", detail: "", basis: [] },
  ],
};

// ---------------------------------------------------------------------------
// Visual language: level colours, small helpers
// ---------------------------------------------------------------------------

export const LEVEL: Record<Level, { short: string; long: string; c: string }> = {
  discuss: { short: "Discuss", long: "Discuss with your care team", c: "bp" },
  watch: { short: "Watch", long: "Keep an eye on", c: "caffeine" },
  good: { short: "Going well", long: "Going well", c: "weight" },
};

const rel = (ts: number) => {
  const days = Math.round((Date.now() - ts) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

const isNew = (ai: AiState, f: Finding) => f.level !== "good" && !!ai.previous && !ai.previous.findings.some((p) => p.id === f.id);

function counts(r: Review) {
  return {
    discuss: r.findings.filter((f) => f.level === "discuss").length,
    watch: r.findings.filter((f) => f.level === "watch").length,
  };
}

function Spark({ size = 14 }: { size?: number }) {
  return <Sparkles size={size} aria-hidden="true" style={{ color: col("ai"), flex: "none" }} />;
}

function Sup({ ns }: { ns?: number[] | undefined }) {
  if (!ns?.length) return null;
  return <sup style={{ color: col("ai"), fontWeight: 600, marginLeft: 2 }}>[{ns.join(",")}]</sup>;
}

// ---------------------------------------------------------------------------
// The analyse row: status, Quick/Deep, run, what's sent
// ---------------------------------------------------------------------------

function Seg() {
  const ai = useAi()!;
  return (
    <div role="group" aria-label="Depth" style={{ display: "flex", border: `1px solid ${col("line")}`, flex: "none" }}>
      {(["quick", "deep"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={ai.mode === m}
          onClick={() => ai.setMode(m)}
          title={m === "quick" ? "Seconds. Reads the report's numbers." : "A few minutes. Also checks guidelines and research, and cites sources."}
          style={{
            minHeight: 30,
            padding: "0 6px",
            border: 0,
            background: ai.mode === m ? col("fg") : "transparent",
            color: ai.mode === m ? col("panel") : col("fg"),
            font: "600 10px/1 var(--font-plex-sans), sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: "pointer",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function WhatsSent() {
  const ai = useAi()!;
  const d = ai.data;
  const row = (id: keyof AiState["share"], label: string) => (
    <label htmlFor={`share-${id}`} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 32, cursor: "pointer" }}>
      <input id={`share-${id}`} type="checkbox" checked={ai.share[id]} onChange={(e) => ai.setShare({ ...ai.share, [id]: e.target.checked })} style={{ width: 16, height: 16, accentColor: col("ai") }} />
      {label}
    </label>
  );
  return (
    <div style={{ fontSize: 12, lineHeight: 1.45, display: "grid", gap: 4 }}>
      <div style={{ fontWeight: 600 }}>What the analysis reads</div>
      <div style={muted}>
        The numbers in this report ({d.period} days): {d.bp.tirN} blood pressure readings, {d.water.n} days of fluid, {d.sodium.n} of sodium, your {d.food.topFoods.length} most logged foods, {d.adherence.due} scheduled doses and {d.symptoms.entries.length} journal findings. Never your raw entries or notes.
      </div>
      {row("profile", "Medical profile (conditions)")}
      {row("meds", "Medicines and doses")}
      {row("compare", "Last analysis, to compare")}
      {ai.mode === "deep" && <div style={muted}>Deep also searches guideline and research sites. Your data never goes into a search.</div>}
    </div>
  );
}

function statusLine(ai: AiState): ReactNode {
  if (ai.running) return `${ai.running.steps[ai.running.step]}…`;
  if (!ai.review) return "Analyse this report for things to raise, watch and keep doing";
  const c = counts(ai.review);
  const fresh = ai.review.findings.filter((f) => isNew(ai, f)).length;
  return (
    <>
      <b style={{ color: col("bp") }}>{c.discuss} discuss</b> · <b style={{ color: col("caffeine") }}>{c.watch} watch</b>
      {fresh ? <span style={muted}> · {fresh} new</span> : null}
    </>
  );
}

export function AnalyseBar({ inSheet }: { inSheet?: boolean }) {
  const ai = useAi()!;
  const r = ai.running;
  return (
    <div style={{ position: "relative", borderBlock: inSheet ? 0 : `1px solid ${col("line")}`, background: inSheet ? "transparent" : "hsl(var(--ai) / .045)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: inSheet ? 0 : "0 14px" }}>
        <Spark />
        <div aria-live="polite" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.3 }}>
          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusLine(ai)}</div>
          {ai.review && !r && !inSheet && (
            <div style={{ ...muted, fontSize: 11 }}>
              {ai.review.mode === "deep" ? "Deep" : "Quick"} analysis · {rel(ai.review.at)}
            </div>
          )}
        </div>
        <Seg />
        <button
          type="button"
          onClick={ai.run}
          disabled={!!r}
          style={{ flex: "none", minHeight: 32, padding: "0 10px", border: 0, background: col("ai"), color: col("panel"), font: "600 12px/1 var(--font-plex-sans), sans-serif", cursor: r ? "default" : "pointer", opacity: r ? 0.6 : 1 }}
        >
          {ai.review ? "Re-run" : "Analyse"}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="What the analysis reads" style={{ flex: "none", display: "grid", placeItems: "center", width: 32, height: 32, border: 0, background: "transparent", color: col("muted-fg"), cursor: "pointer" }}>
              <Info size={16} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" style={{ width: 300 }}>
            <WhatsSent />
          </PopoverContent>
        </Popover>
      </div>
      {r && (
        <div style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: `${((r.step + 1) / r.steps.length) * 100}%`, background: col("ai"), transition: "width .4s" }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One finding, collapsed to a line or opened
// ---------------------------------------------------------------------------

function BasisLinks({ f, onGo }: { f: Finding; onGo?: () => void }) {
  const ai = useAi()!;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {f.basis.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={() => {
            onGo?.();
            ai.jump(b.tab, b.anchor);
          }}
          style={{ minHeight: 28, padding: "0 8px", border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 11, cursor: "pointer" }}
        >
          {b.label} ›
        </button>
      ))}
    </div>
  );
}

function FindingBody({ f, onGo }: { f: Finding; onGo?: () => void }) {
  return (
    <>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{f.detail}</p>
      {f.evidence && (
        <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6, color: col("muted-fg") }}>
          <BookOpen size={12} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4, color: col("ai") }} />
          {f.evidence}
          <Sup ns={f.sources} />
        </p>
      )}
      <BasisLinks f={f} {...(onGo ? { onGo } : {})} />
    </>
  );
}

function LevelTag({ level, fresh }: { level: Level; fresh?: boolean }) {
  return (
    <span style={{ flex: "none", font: "700 10px/1 var(--font-plex-sans), sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", color: col(LEVEL[level].c) }}>
      {LEVEL[level].short}
      {fresh && <span style={{ color: col("ai"), marginLeft: 4 }}>· new</span>}
    </span>
  );
}

/** Variant 1: a finding as a one-line note inside the section it is about. */
function NoteRow({ f }: { f: Finding }) {
  const ai = useAi()!;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ minWidth: 0, boxShadow: `inset 2px 0 0 ${col(LEVEL[f.level].c)}`, background: "hsl(var(--ai) / .045)", padding: "0 8px 0 10px" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 36, padding: 0, border: 0, background: "transparent", color: col("fg"), textAlign: "left", cursor: "pointer" }}
      >
        <Spark size={12} />
        <LevelTag level={f.level} fresh={isNew(ai, f)} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: open ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div style={{ paddingBottom: 10 }}>
          <FindingBody f={f} />
        </div>
      )}
    </div>
  );
}

export function Annot({ at }: { at: string }) {
  const ai = useAi();
  if (!ai || ai.treatment !== "notes" || !ai.review) return null;
  const fs = ai.review.findings.filter((f) => f.at?.includes(at) && (f.level !== "good" || at.startsWith("report-")));
  if (!fs.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, margin: "-2px 0 10px" }}>
      {fs.map((f) => (
        <NoteRow key={f.id} f={f} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant 3: dots on sections, counts on tabs, one summary line
// ---------------------------------------------------------------------------

export function FlagDot({ at }: { at: string }) {
  const ai = useAi();
  if (!ai || ai.treatment !== "line" || !ai.review) return null;
  const fs = ai.review.findings.filter((f) => f.at?.includes(at) && f.level !== "good");
  if (!fs.length) return null;
  const top = fs.some((f) => f.level === "discuss") ? "discuss" : "watch";
  return (
    <button
      type="button"
      onClick={() => ai.openSheet(fs[0]!.id)}
      aria-label={`${fs.length} finding${fs.length > 1 ? "s" : ""} here`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 28, padding: "0 6px", border: `1px solid ${col(LEVEL[top].c)}`, background: "transparent", color: col(LEVEL[top].c), font: "700 10px/1 var(--font-plex-sans), sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer" }}
    >
      <Spark size={11} />
      {fs.length}
    </button>
  );
}

export function TabCount({ chapter }: { chapter: Chapter | "report" }) {
  const ai = useAi();
  if (!ai || ai.treatment !== "line" || !ai.review) return null;
  const fs = ai.review.findings.filter((f) => f.level !== "good" && (chapter === "report" || f.chapter === chapter));
  if (!fs.length) return null;
  const top = fs.some((f) => f.level === "discuss") ? "discuss" : "watch";
  return (
    <span aria-label={`${fs.length} findings`} style={{ display: "inline-grid", placeItems: "center", minWidth: 15, height: 15, marginLeft: 3, padding: "0 3px", background: col(LEVEL[top].c), color: col("panel"), font: "700 9px/1 var(--font-plex-mono), monospace", verticalAlign: "1px" }}>
      {fs.length}
    </span>
  );
}

export function SummaryLine() {
  const ai = useAi();
  if (!ai || ai.treatment !== "line") return null;
  const r = ai.running;
  return (
    <button
      type="button"
      onClick={() => ai.openSheet()}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, padding: "0 14px", border: 0, borderBottom: `1px solid ${col("line")}`, background: "hsl(var(--ai) / .045)", color: col("fg"), textAlign: "left", cursor: "pointer" }}
    >
      <Spark />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{statusLine(ai)}</span>
      {ai.review && !r && <span style={{ ...muted, fontSize: 11, flex: "none" }}>{ai.review.mode === "deep" ? "Deep" : "Quick"} · {rel(ai.review.at)}</span>}
      <ChevronRight size={16} style={{ flex: "none" }} />
      {r && <span style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: `${((r.step + 1) / r.steps.length) * 100}%`, background: col("ai"), transition: "width .4s" }} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Variant 2: a strip of finding chips
// ---------------------------------------------------------------------------

export function FindingsStrip({ chapter }: { chapter?: Chapter }) {
  const ai = useAi();
  if (!ai || ai.treatment !== "strip") return null;
  const fs = (ai.review?.findings ?? []).filter((f) => !chapter || f.chapter === chapter);
  if (chapter && !fs.length) return null;
  return (
    <div style={{ borderBottom: `1px solid ${col("line")}` }}>
      {!chapter && <AnalyseBar />}
      {fs.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 14px", scrollSnapType: "x mandatory" }}>
          {fs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => ai.openSheet(f.id)}
              style={{ flex: "0 0 auto", width: 188, minHeight: 64, padding: "7px 8px 7px 10px", border: `1px solid ${col("line")}`, boxShadow: `inset 3px 0 0 ${col(LEVEL[f.level].c)}`, background: col("bg"), color: col("fg"), textAlign: "left", cursor: "pointer", scrollSnapAlign: "start" }}
            >
              <LevelTag level={f.level} fresh={isNew(ai, f)} />
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12, fontWeight: 600, lineHeight: 1.3, marginTop: 4 } as CSSProperties}>{f.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sheet (variants 2 and 3)
// ---------------------------------------------------------------------------

function AnalysisSheet() {
  const ai = useAi()!;
  const r = ai.review;
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ai.sheet.open && ai.sheet.focus) setTimeout(() => focusRef.current?.scrollIntoView({ block: "center" }), 250);
  }, [ai.sheet]);
  const resolved = r && ai.previous ? ai.previous.findings.filter((p) => !r.findings.some((f) => f.id === p.id && f.level !== "good")) : [];
  return (
    <Drawer open={ai.sheet.open} onOpenChange={(o) => (o ? ai.openSheet() : ai.closeSheet())}>
      <DrawerContent style={{ maxHeight: "88%" }}>
        <div style={{ overflowY: "auto", padding: "4px 16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
            <Spark size={16} />
            <DrawerTitle style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Analysis</DrawerTitle>
            <button type="button" aria-label="Close" onClick={ai.closeSheet} style={{ display: "grid", placeItems: "center", width: 36, height: 36, border: 0, background: "transparent", color: col("fg"), cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>
          <DrawerDescription style={{ ...muted, fontSize: 12 }}>
            {r ? `${r.mode === "deep" ? "Deep" : "Quick"} analysis of the last ${r.period} days · ${rel(r.at)}` : "Reads this report and sorts what it finds into things to raise, watch and keep doing."}
          </DrawerDescription>
          <div style={{ margin: "10px 0", borderBlock: `1px solid ${col("line")}`, padding: "2px 0" }}>
            <AnalyseBar inSheet />
          </div>
          {r && (
            <>
              <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, textWrap: "pretty" } as CSSProperties}>{r.headline}</p>
              {(["discuss", "watch", "good"] as const).map((lv) => {
                const fs = r.findings.filter((f) => f.level === lv);
                if (!fs.length) return null;
                return (
                  <div key={lv} style={{ marginTop: 14 }}>
                    <div style={{ font: "700 11px/1 var(--font-plex-sans), sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", color: col(LEVEL[lv].c) }}>{LEVEL[lv].long}</div>
                    {fs.map((f) => (
                      <div
                        key={f.id}
                        ref={ai.sheet.focus === f.id ? focusRef : undefined}
                        style={{ marginTop: 8, padding: "8px 0 8px 10px", boxShadow: `inset 2px 0 0 ${col(LEVEL[lv].c)}`, background: ai.sheet.focus === f.id ? "hsl(var(--ai) / .07)" : "transparent" }}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {f.title}
                          {isNew(ai, f) && <span style={{ ...muted, color: col("ai"), fontSize: 11, fontWeight: 600 }}> · new</span>}
                        </div>
                        <FindingBody f={f} onGo={ai.closeSheet} />
                      </div>
                    ))}
                  </div>
                );
              })}
              {resolved.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>No longer flagged since {shortDate(new Date(ai.previous!.at).toISOString().slice(0, 10))}</div>
                  {resolved.map((p) => (
                    <div key={p.id} style={muted}>
                      <Check size={12} style={{ display: "inline", verticalAlign: "-2px", color: col("weight") }} /> {p.title}
                    </div>
                  ))}
                </div>
              )}
              <SheetQuestions />
              {r.sources.length > 0 && <SourceList r={r} />}
              <Disclaimer />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SheetQuestions() {
  const ai = useAi()!;
  const qs = ai.review?.questions ?? [];
  if (!qs.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Questions for your appointment</div>
      <div style={{ ...muted, fontSize: 11 }}>Added questions go into the report and the PDF.</div>
      <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
        {qs.map((q) => (
          <QuestionRow key={q} q={q} />
        ))}
      </div>
    </div>
  );
}

function QuestionRow({ q }: { q: string }) {
  const ai = useAi()!;
  const on = ai.addedQuestions.includes(q);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => ai.toggleQuestion(q)}
      style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", minHeight: 36, padding: "6px 0", border: 0, background: "transparent", color: on ? col("fg") : col("muted-fg"), fontSize: 13, textAlign: "left", cursor: "pointer" }}
    >
      <span style={{ flex: "none", display: "grid", placeItems: "center", width: 20, height: 20, border: `1px solid ${on ? col("ai") : col("line")}`, background: on ? col("ai") : "transparent", color: col("panel") }}>{on ? <Check size={13} /> : <Plus size={13} style={{ color: col("muted-fg") }} />}</span>
      <span>{q}</span>
    </button>
  );
}

function SourceList({ r }: { r: Review }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Sources</div>
      <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, display: "grid", gap: 3 }}>
        {r.sources.map((s) => (
          <li key={s.n}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ color: col("ai") }}>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Disclaimer() {
  return (
    <p style={{ ...muted, fontSize: 11, marginTop: 14 }}>
      Not medical advice. It never suggests changing a dose; warning signs use fixed wording. PROTOTYPE: findings come from fixed templates over your numbers.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Report pieces used by every variant
// ---------------------------------------------------------------------------

/** Suggested questions inside the report's questions section (variant 1). */
export function SuggestedQuestions() {
  const ai = useAi();
  if (!ai || ai.treatment !== "notes" || !ai.review) return null;
  const qs = ai.review.questions.filter((q) => !ai.addedQuestions.includes(q));
  if (!qs.length) return null;
  return (
    <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${col("line")}` }}>
      <div style={{ ...muted, fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
        <Spark size={11} /> Suggested from the analysis
      </div>
      {qs.map((q) => (
        <QuestionRow key={q} q={q} />
      ))}
    </div>
  );
}

/** Numbered references at the end of the report, once a deep analysis ran. */
export function References() {
  const ai = useAi();
  const r = ai?.review;
  if (!r || !r.sources.length) return null;
  return (
    <section className="wm-card" style={{ "--c": col("ai") } as CSSProperties} aria-label="References">
      <h3 className="wm-ct">References</h3>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: "grid", gap: 3 }}>
        {r.sources.map((s) => (
          <li key={s.n}>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ color: col("ai") }}>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
      <Disclaimer />
    </section>
  );
}

/** Swap suggestion for a food, once an analysis ran. */
export function useSwap(name: string): Swap | undefined {
  const ai = useAi();
  return ai?.review?.swaps.find((s) => s.name === name);
}

export function SwapCell({ name }: { name: string }) {
  const s = useSwap(name);
  if (!s) return <span style={muted}>—</span>;
  return (
    <span style={{ display: "block", textAlign: "left", fontFamily: "var(--font-plex-sans), sans-serif", fontSize: 11.5, lineHeight: 1.35 }}>
      {s.swap}
      <span style={{ ...mono, display: "block", color: col("weight") }}>−{fmtNum(Math.round(s.perDay / 10) * 10)} mg/day</span>
    </span>
  );
}

