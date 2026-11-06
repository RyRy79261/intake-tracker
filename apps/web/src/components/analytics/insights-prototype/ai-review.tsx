"use client";

/**
 * PROTOTYPE — throwaway. The AI layer of the Metrics report (variant A).
 *
 * - <AiReview> on the Report tab: "Claude's review" of the report, Quick or
 *   Deep (web search, cited sources, runs in the background), with an inline
 *   "what Claude sees" panel, structured findings that link to the chapter
 *   section they are about, a diff against the last review, and drafted
 *   appointment questions that can be added to the exported report.
 * - <ChapterNotes> in each chapter: that review's findings, next to the data.
 * - <FoodAnalysis> in the Food tab: hidden sodium per food, swaps, gaps.
 *
 * The model calls are STUBBED: the review is assembled from the engine's
 * numbers by fixed templates so the layout can be judged. Sources are the
 * real ones found during the research for this prototype.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Eye, Loader2, Plus, Sparkles, Telescope, Zap } from "lucide-react";
import { Button } from "@intake/ui/button";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { col, fmtNum, mono, muted, pct, shortDate } from "@/components/analytics/insights-prototype/ui";

// ---------------------------------------------------------------------------
// Types and shared state
// ---------------------------------------------------------------------------

export type Chapter = "vitals" | "fluid" | "food" | "meds";
type Level = "discuss" | "watch" | "good";
type Mode = "quick" | "deep";

interface Finding {
  id: string;
  level: Level;
  chapter: Chapter;
  title: string;
  detail: string;
  basis: { label: string; tab: Chapter; anchor: string }[];
  evidence?: string;
  sources?: number[];
}

interface Review {
  mode: Mode;
  at: number;
  period: number;
  headline: string;
  findings: Finding[];
  questions: string[];
  sources: { n: number; title: string; url: string }[];
}

interface AiState {
  review: Review | null;
  previous: Review | null;
  setReview: (r: Review) => void;
  addedQuestions: string[];
  toggleQuestion: (q: string) => void;
  jump: (tab: string, anchor?: string) => void;
}

const Ctx = createContext<AiState | null>(null);

export function AiProvider({ jump, children }: { jump: (tab: string, anchor?: string) => void; children: ReactNode }) {
  const [review, setReviewState] = useState<Review | null>(null);
  const [previous, setPrevious] = useState<Review | null>(EARLIER_REVIEW);
  const [addedQuestions, setAdded] = useState<string[]>([]);
  const value = useMemo<AiState>(
    () => ({
      review,
      previous,
      setReview: (r) => {
        if (review) setPrevious(review);
        setReviewState(r);
      },
      addedQuestions,
      toggleQuestion: (q) => setAdded((xs) => (xs.includes(q) ? xs.filter((x) => x !== q) : [...xs, q])),
      jump,
    }),
    [review, previous, addedQuestions, jump],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAi = () => useContext(Ctx);

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

function buildReview(d: Insights, mode: Mode): Review {
  const used: SourceKey[] = [];
  const cite = (...keys: SourceKey[]) =>
    mode === "deep"
      ? keys.map((k) => {
          if (!used.includes(k)) used.push(k);
          return used.indexOf(k) + 1;
        })
      : undefined;
  const f: Finding[] = [];
  const add = (x: Omit<Finding, "sources" | "evidence"> & { evidence?: string; cites?: SourceKey[] }) => {
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
        { label: "Symptoms in the report", tab: "vitals", anchor: "sec-bp" },
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
  findings: [
    { id: "bp-protocol", level: "watch", chapter: "vitals", title: "Blood pressure is only measured in the morning", detail: "", basis: [] },
    { id: "fluid-limit", level: "discuss", chapter: "fluid", title: "Over the fluid limit most days", detail: "", basis: [] },
    { id: "missed-evening", level: "watch", chapter: "meds", title: "Evening doses often missed", detail: "", basis: [] },
  ],
};

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

const LEVEL: Record<Level, { label: string; c: string }> = {
  discuss: { label: "Discuss with your care team", c: "bp" },
  watch: { label: "Keep an eye on", c: "caffeine" },
  good: { label: "Going well", c: "weight" },
};

const card = (c: string): CSSProperties => ({ "--c": col(c) } as CSSProperties);
const rel = (ts: number) => {
  const days = Math.round((Date.now() - ts) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

function ModeTile({ active, onClick, icon, title, lines }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; lines: string[] }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        textAlign: "left",
        padding: "10px 10px 10px 12px",
        border: `1px solid ${active ? col("ai") : col("line")}`,
        boxShadow: active ? `inset 0 0 0 1px ${col("ai")}` : "none",
        background: active ? "hsl(var(--ai) / .08)" : col("panel"),
        cursor: "pointer",
        color: col("fg"),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
        {icon}
        {title}
      </div>
      {lines.map((l) => (
        <div key={l} style={{ ...muted, fontSize: 11, marginTop: 2 }}>
          {l}
        </div>
      ))}
    </button>
  );
}

function Basis({ b }: { b: Finding["basis"][number] }) {
  const ai = useAi();
  return (
    <button
      type="button"
      onClick={() => ai?.jump(b.tab, b.anchor)}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, minHeight: 28, padding: "0 8px", border: `1px solid ${col("line")}`, background: col("panel"), color: col("fg"), fontSize: 11, cursor: "pointer" }}
    >
      <Eye size={12} /> {b.label}
    </button>
  );
}

function FindingCard({ f, compact }: { f: Finding; compact?: boolean }) {
  const lv = LEVEL[f.level];
  return (
    <div style={{ borderTop: `1px solid ${col("line")}`, paddingTop: 10, marginTop: 10, boxShadow: `inset 3px 0 0 ${col(lv.c)}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: col(lv.c) }}>{lv.label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, textWrap: "balance" } as CSSProperties}>{f.title}</div>
      <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>{f.detail}</p>
      {f.evidence && (
        <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6, padding: "6px 8px", background: "hsl(var(--ai) / .07)" }}>
          <BookOpen size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4, color: col("ai") }} />
          {f.evidence} {f.sources?.map((n) => <sup key={n} style={{ color: col("ai"), fontWeight: 600 }}>[{n}]</sup>)}
        </p>
      )}
      {!compact && f.basis.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {f.basis.map((b) => (
            <Basis key={b.label} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_STEPS = ["Reading your report", "Writing the review"];
const DEEP_STEPS = ["Reading your report", "Searching heart-failure and hypertension guidelines", "Checking your medicines against the findings", "Cross-checking against your last review", "Writing the review with sources"];

// ---------------------------------------------------------------------------
// Report tab: Claude's review
// ---------------------------------------------------------------------------

export function AiReview({ data }: { data: Insights }) {
  const ai = useAi()!;
  const [mode, setMode] = useState<Mode>("quick");
  const [showSees, setShowSees] = useState(false);
  const [profile, setProfile] = useState(true);
  const [meds, setMeds] = useState(true);
  const [compare, setCompare] = useState(true);
  const [step, setStep] = useState<number | null>(null);
  const [showGood, setShowGood] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const steps = mode === "deep" ? DEEP_STEPS : QUICK_STEPS;
  const run = () => {
    let i = 0;
    setStep(0);
    const tick = () => {
      i++;
      if (i < steps.length) {
        setStep(i);
        timer.current = setTimeout(tick, mode === "deep" ? 1400 : 700);
      } else {
        setStep(null);
        ai.setReview(buildReview(data, mode));
      }
    };
    timer.current = setTimeout(tick, mode === "deep" ? 1400 : 700);
  };

  const r = ai.review;
  const prev = ai.previous;
  const diff = r && prev && compare
    ? {
        added: r.findings.filter((f) => f.level !== "good" && !prev.findings.some((p) => p.id === f.id)),
        still: r.findings.filter((f) => f.level !== "good" && prev.findings.some((p) => p.id === f.id)),
        resolved: prev.findings.filter((p) => !r.findings.some((f) => f.id === p.id && f.level !== "good")),
      }
    : null;

  return (
    <section className="wm-card" style={card("ai")} aria-label="Claude's review">
      <h3 className="wm-ct" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Sparkles size={16} style={{ color: col("ai") }} /> Claude&apos;s review
        </span>
        {r && (
          <span style={{ ...muted, fontWeight: 400, fontSize: 11 }}>
            {r.mode === "deep" ? "Deep" : "Quick"} · {rel(r.at)}
          </span>
        )}
      </h3>

      {/* ------------------------------------------------ result */}
      {r && step === null && (
        <>
          <p style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 600, textWrap: "pretty" } as CSSProperties}>{r.headline}</p>
          {r.findings
            .filter((f) => f.level !== "good")
            .map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          <button type="button" onClick={() => setShowGood((v) => !v)} style={linkBtn}>
            {showGood ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {r.findings.filter((f) => f.level === "good").length} going well
          </button>
          {showGood && r.findings.filter((f) => f.level === "good").map((f) => <FindingCard key={f.id} f={f} />)}

          {diff && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Since your last review ({rel(prev!.at)})</div>
              <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", fontSize: 12, display: "grid", gap: 3 }}>
                {diff.added.map((f) => (
                  <li key={f.id}>
                    <b style={{ color: col("bp") }}>New</b> {f.title}
                  </li>
                ))}
                {diff.still.map((f) => (
                  <li key={f.id}>
                    <b style={{ color: col("caffeine") }}>Still</b> {f.title}
                  </li>
                ))}
                {diff.resolved.map((f) => (
                  <li key={f.id}>
                    <b style={{ color: col("weight") }}>Resolved</b> {f.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.questions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Questions for your appointment</div>
              <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {r.questions.map((q) => {
                  const on = ai.addedQuestions.includes(q);
                  return (
                    <li key={q} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={on ? "Remove from report" : "Add to report"}
                        onClick={() => ai.toggleQuestion(q)}
                        style={{ flex: "none", display: "grid", placeItems: "center", width: 28, height: 28, border: `1px solid ${on ? col("ai") : col("line")}`, background: on ? col("ai") : col("panel"), color: on ? col("panel") : col("fg"), cursor: "pointer" }}
                      >
                        {on ? <Check size={14} /> : <Plus size={14} />}
                      </button>
                      <span style={{ paddingTop: 4 }}>{q}</span>
                    </li>
                  );
                })}
              </ul>
              <p style={{ ...muted, fontSize: 11, marginTop: 4 }}>Added questions go into the report and the PDF export.</p>
            </div>
          )}

          {r.sources.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Sources</div>
              <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, display: "grid", gap: 2 }}>
                {r.sources.map((s) => (
                  <li key={s.n}>
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: col("ai") }}>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p style={{ ...muted, fontSize: 11, marginTop: 10 }}>
            Not medical advice. Claude never suggests changing a dose; warning signs use fixed wording.
            <br />
            PROTOTYPE: this review is built from your numbers by fixed templates so the layout can be judged.
          </p>
          <div style={{ height: 1, background: col("line"), margin: "12px 0" }} />
        </>
      )}

      {/* ------------------------------------------------ running */}
      {step !== null && (
        <div aria-live="polite">
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {steps.map((s, i) => (
              <li key={s} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: i > step ? col("muted-fg") : col("fg") }}>
                {i < step ? <Check size={14} style={{ color: col("weight") }} /> : i === step ? <Loader2 size={14} className="animate-spin" /> : <span style={{ width: 14 }} />}
                {s}
              </li>
            ))}
          </ol>
          {mode === "deep" && <p style={{ ...muted, marginTop: 8 }}>Deep analysis takes a few minutes in the app. You can close Metrics; it finishes in the background and tells you when it&apos;s ready.</p>}
        </div>
      )}

      {/* ------------------------------------------------ start */}
      {step === null && (
        <>
          {!r && (
            <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
              Claude reads this report the way a clinician would: what needs raising, what to watch, what&apos;s going well, each linked to the numbers behind it.
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <ModeTile active={mode === "quick"} onClick={() => setMode("quick")} icon={<Zap size={14} />} title="Quick review" lines={["About 10 seconds", "Your report's numbers"]} />
            <ModeTile active={mode === "deep"} onClick={() => setMode("deep")} icon={<Telescope size={14} />} title="Deep analysis" lines={["A few minutes", "Checks guidelines and research, cites sources"]} />
          </div>
          <button type="button" onClick={() => setShowSees((v) => !v)} style={linkBtn}>
            {showSees ? <ChevronDown size={14} /> : <ChevronRight size={14} />} What Claude sees
          </button>
          {showSees && (
            <div style={{ fontSize: 12, display: "grid", gap: 6, padding: "6px 0 4px" }}>
              <div>
                <b>Always:</b> the numbers in this report for {data.period} days: {data.bp.tirN} blood pressure readings summarised, {data.water.n} days of fluid, {data.sodium.n} of sodium, {data.adherence.due} scheduled doses, {data.symptoms.entries.length} journal entries (findings and times, not your words). Never your raw entries.
              </div>
              <Toggle id="ai-profile" on={profile} set={setProfile} label="Your medical profile (conditions)" />
              <Toggle id="ai-meds" on={meds} set={setMeds} label="Your medicines and doses" />
              <Toggle id="ai-compare" on={compare} set={setCompare} label={`Compare with your last review (${rel(ai.previous?.at ?? Date.now())})`} />
              {mode === "deep" && <div style={muted}>Deep analysis also lets Claude search guideline and research sites. Your data is never put into a search.</div>}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Button onClick={run} style={{ width: "100%" }}>
              {mode === "deep" ? <Telescope /> : <Sparkles />}
              {r ? `Run a new ${mode === "deep" ? "deep analysis" : "quick review"}` : mode === "deep" ? "Start deep analysis" : "Review my report"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function Toggle({ id, on, set, label }: { id: string; on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 32, cursor: "pointer" }}>
      <input id={id} type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} style={{ width: 18, height: 18, accentColor: col("ai") }} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Chapter notes: the review's findings beside the data they are about
// ---------------------------------------------------------------------------

export function ChapterNotes({ chapter }: { chapter: Chapter }) {
  const ai = useAi();
  const notes = ai?.review?.findings.filter((f) => f.chapter === chapter) ?? [];
  if (!ai) return null;
  if (!ai.review)
    return (
      <button
        type="button"
        onClick={() => ai.jump("report", "ai-review")}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, padding: "0 12px", border: `1px dashed ${col("ai")}`, background: "hsl(var(--ai) / .05)", color: col("fg"), fontSize: 13, cursor: "pointer", textAlign: "left" }}
      >
        <Sparkles size={14} style={{ color: col("ai") }} /> Ask Claude to review this report — its notes on this chapter appear here
      </button>
    );
  if (notes.length === 0) return null;
  return (
    <section className="wm-card" style={card("ai")} aria-label="Claude's notes on this chapter">
      <h3 className="wm-ct" style={{ marginBottom: 0 }}>
        <Sparkles size={14} style={{ color: col("ai") }} /> Claude&apos;s notes
        <span style={{ ...muted, fontWeight: 400, fontSize: 11 }}>
          {ai.review.mode === "deep" ? "Deep" : "Quick"} review · {rel(ai.review.at)}
        </span>
      </h3>
      {notes.map((f) => (
        <FindingCard key={f.id} f={f} compact />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Food tab: food analysis
// ---------------------------------------------------------------------------

const FOCUS = ["Sodium", "Potassium", "Fluid in food", "Fibre", "Sugar"] as const;

const SWAPS: Record<string, { swap: string; perServing: number }> = {
  ham: { swap: "fresh roast chicken or turkey", perServing: 450 },
  "ham sandwich": { swap: "chicken and salad sandwich on low-salt bread", perServing: 700 },
  bread: { swap: "low-salt bread", perServing: 150 },
  toast: { swap: "low-salt bread", perServing: 150 },
  cheese: { swap: "fresh mozzarella or ricotta", perServing: 250 },
  soup: { swap: "home-made soup with no stock cube", perServing: 700 },
  crisps: { swap: "unsalted nuts or plain popcorn", perServing: 200 },
  pizza: { swap: "home-made pizza with half the cheese", perServing: 600 },
  pasta: { swap: "pasta cooked without salt in the water", perServing: 250 },
};

export function FoodAnalysis({ data: d }: { data: Insights }) {
  const [focus, setFocus] = useState<string[]>(["Sodium", "Fluid in food"]);
  const [mode, setMode] = useState<Mode>("quick");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [ranMode, setRanMode] = useState<Mode>("quick");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const run = () => {
    setState("running");
    setRanMode(mode);
    timer.current = setTimeout(() => setState("done"), mode === "deep" ? 2600 : 1200);
  };

  const days = Math.max(1, d.food.daysLogged);
  const swaps = d.food.topFoods
    .map((f) => ({ ...f, s: SWAPS[f.name] }))
    .filter((f) => f.s)
    .map((f) => ({ name: f.name, swap: f.s!.swap, perDay: (f.s!.perServing * f.n) / days }))
    .sort((a, b) => b.perDay - a.perDay)
    .slice(0, 4);
  const saved = swaps.slice(0, 2).reduce((s, x) => s + x.perDay, 0);

  return (
    <section className="wm-card" style={card("ai")} aria-label="Food analysis" id="sec-food-ai">
      <h3 className="wm-ct">
        <Sparkles size={16} style={{ color: col("ai") }} /> Food analysis
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.5 }}>
        Claude reads the foods you logged ({d.food.daysLogged} days, food names and grams) and works out where the hidden sodium is, what&apos;s missing, and the swaps that would move your numbers most.
      </p>
      <div role="group" aria-label="Focus" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
        {FOCUS.map((f) => {
          const on = focus.includes(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setFocus((xs) => (on ? xs.filter((x) => x !== f) : [...xs, f]))}
              style={{ minHeight: 32, padding: "0 10px", border: `1px solid ${on ? col("ai") : col("line")}`, background: on ? "hsl(var(--ai) / .1)" : col("panel"), color: col("fg"), fontSize: 12, cursor: "pointer" }}
            >
              {f}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <ModeTile active={mode === "quick"} onClick={() => setMode("quick")} icon={<Zap size={14} />} title="Quick" lines={["Seconds"]} />
        <ModeTile active={mode === "deep"} onClick={() => setMode("deep")} icon={<Telescope size={14} />} title="Deep" lines={["Looks up real sodium values for your foods"]} />
      </div>
      <div style={{ marginTop: 8 }}>
        <Button onClick={run} disabled={state === "running" || focus.length === 0} style={{ width: "100%" }}>
          {state === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {state === "running" ? "Analysing your food…" : state === "done" ? "Analyse again" : "Analyse my food"}
        </Button>
      </div>

      {state === "done" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
            {swaps.length
              ? `Two swaps would cut about ${fmtNum(Math.round(saved / 10) * 10)} mg of sodium a day, enough to bring a typical day from ${fmtNum(d.sodium.median)} mg to about ${fmtNum(d.sodium.median - saved)} mg.`
              : `Your sodium is spread across many foods; there is no single swap that moves it much.`}
          </p>
          {focus.includes("Sodium") && swaps.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={muted}>
                    <th style={{ textAlign: "left", fontWeight: 500 }}>Instead of</th>
                    <th style={{ textAlign: "left", fontWeight: 500, paddingLeft: 8 }}>Try</th>
                    <th style={{ textAlign: "right", fontWeight: 500 }}>Saves a day</th>
                  </tr>
                </thead>
                <tbody>
                  {swaps.map((s) => (
                    <tr key={s.name} style={{ borderTop: `1px solid ${col("line")}` }}>
                      <td style={{ padding: "5px 0", textTransform: "capitalize" }}>{s.name}</td>
                      <td style={{ paddingLeft: 8 }}>{s.swap}</td>
                      <td style={{ ...mono, textAlign: "right" }}>~{fmtNum(Math.round(s.perDay / 10) * 10)} mg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 13, display: "grid", gap: 4 }}>
            {focus.includes("Fluid in food") && (
              <li>
                <b>Fluid in food:</b> soups, fruit and yoghurt count toward your {fmtNum(d.limits.water)} ml limit. Your logged soups add roughly 200–300 ml on the days you have them.
              </li>
            )}
            {focus.includes("Potassium") && (
              <li>
                <b>Potassium:</b> logged on only {d.food.potassium.n} days, so it can&apos;t be judged. If your care team watches it, log it with food; avoid potassium-based salt substitutes unless they say otherwise.
              </li>
            )}
            {focus.includes("Fibre") && (
              <li>
                <b>Fibre:</b> vegetables appear in the log on few days; most meals are bread, pasta and cheese. Diuretics and fluid limits make constipation more likely.
              </li>
            )}
            {focus.includes("Sugar") && (
              <li>
                <b>Sugar:</b> a typical day is {fmtNum(d.food.sugar.median)} g{d.food.sugar.limit ? ` against ${fmtNum(d.food.sugar.limit)} g` : ""}.
              </li>
            )}
          </ul>
          {ranMode === "deep" && (
            <p style={{ ...muted, fontSize: 11, marginTop: 8 }}>
              Deep mode checks each food&apos;s sodium against nutrition databases found by web search and lists them as sources.
            </p>
          )}
          <p style={{ ...muted, fontSize: 11, marginTop: 6 }}>PROTOTYPE: example analysis built from your logged foods by fixed templates.</p>
        </div>
      )}
    </section>
  );
}

const linkBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 10,
  padding: 0,
  minHeight: 32,
  background: "none",
  border: 0,
  color: col("muted-fg"),
  fontSize: 12,
  cursor: "pointer",
};
