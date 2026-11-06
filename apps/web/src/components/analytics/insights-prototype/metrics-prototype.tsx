"use client";

/**
 * PROTOTYPE — throwaway. The whole Metrics window in the doctor-report style
 * (the direction picked from round 1). Three ways to organise it:
 *
 *   A  Chapters      — tabs: Report · Vitals · Fluid · Food · Meds (Records lives behind
 *                      the History button and entries in the Journal window)
 *   B  One document  — tabs: Report · Records; the report is one long page with a jump index
 *   C  Visit pack    — tabs: Since last visit · Trends · Records; the period runs from your last appointment
 *
 * The range selector sets the period every block reports on. Summary,
 * Correlations and Titration are gone: their jobs live inside the chapters
 * (fixed questions replace correlations; before/after per change replaces
 * titration).
 */

import { useCallback, useState, type ReactNode } from "react";
import {
  AiProvider,
  AiReview,
} from "@/components/analytics/insights-prototype/ai-review";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import type { TimeRange, TimeScope } from "@intake/types/analytics";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import {
  FluidChapter,
  FoodChapter,
  IntakeChapter,
  JournalChapter,
  MedsChapter,
  VitalsChapter,
  ChangeCard,
} from "@/components/analytics/insights-prototype/chapters";
import {
  VariantReport,
  buildQuestions,
} from "@/components/analytics/insights-prototype/variant-report";
import {
  ConfidenceChip,
  EngineState,
  Section,
  col,
  fmtNum,
  muted,
  shortDate,
  signed,
} from "@/components/analytics/insights-prototype/ui";
import { Table } from "@/components/analytics/insights-prototype/charts";

const SCOPE_DAYS: Record<string, number> = {
  "24h": 7,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: 180,
};
const DAY = 86_400_000;

export const METRICS_VARIANTS = [
  { key: "A", name: "Chapters" },
  { key: "B", name: "One document" },
  { key: "C", name: "Visit pack" },
] as const;

export function MetricsPrototype({
  variant,
  useInsights,
  records,
  exportSlot,
  aiInsights,
  nutrientAnalysis,
}: {
  variant: string;
  useInsights: (period: number) => Insights | null;
  records: (range: TimeRange) => ReactNode;
  exportSlot?: (range: TimeRange) => ReactNode;
  aiInsights?: ReactNode;
  nutrientAnalysis?: ReactNode;
}) {
  const [scope, setScope] = useState<TimeScope>("30d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);
  const [lastVisit, setLastVisit] = useState(() =>
    new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10),
  );
  const visitDays = Math.max(
    7,
    Math.min(
      180,
      Math.round((Date.now() - Date.parse(`${lastVisit}T12:00:00`)) / DAY),
    ),
  );
  const period =
    variant === "C"
      ? visitDays
      : customRange
        ? Math.max(7, Math.round((customRange.end - customRange.start) / DAY))
        : (SCOPE_DAYS[scope] ?? 30);
  const data = useInsights(period);
  const range: TimeRange = customRange ?? {
    start: Date.now() - period * DAY,
    end: Date.now(),
  };

  const tabs: {
    value: string;
    label: string;
    body: (d: Insights) => ReactNode;
    raw?: boolean;
  }[] =
    variant === "B"
      ? [
          {
            value: "report",
            label: "Report",
            body: (d) => (
              <OneDocument
                data={d}
                nutrientAnalysis={nutrientAnalysis}
                aiInsights={aiInsights}
              />
            ),
            raw: true,
          },
          { value: "records", label: "Records", body: () => records(range) },
        ]
      : variant === "C"
        ? [
            {
              value: "visit",
              label: "Since last visit",
              body: (d) => (
                <SinceLastVisit
                  data={d}
                  lastVisit={lastVisit}
                  onLastVisit={setLastVisit}
                />
              ),
            },
            {
              value: "trends",
              label: "Trends",
              body: (d) => (
                <Chapters data={d} nutrientAnalysis={nutrientAnalysis} />
              ),
            },
            { value: "records", label: "Records", body: () => records(range) },
          ]
        : [
            {
              value: "report",
              label: "Report",
              raw: true,
              body: (d) => (
                <>
                  <div
                    id="ai-review"
                    className="wm-stack"
                    style={{ paddingBottom: 0, scrollMarginTop: 96 }}
                  >
                    {aiInsights ?? <AiReview data={d} />}
                  </div>
                  <VariantReport data={d} printable={false} />
                </>
              ),
            },
            {
              value: "vitals",
              label: "Vitals",
              body: (d) => <VitalsChapter data={d} />,
            },
            {
              value: "fluid",
              label: "Fluid",
              body: (d) => <FluidChapter data={d} />,
            },
            {
              value: "food",
              label: "Food",
              body: (d) => (
                <FoodChapter data={d} nutrientAnalysis={nutrientAnalysis} />
              ),
            },
            {
              value: "meds",
              label: "Meds",
              body: (d) => <MedsChapter data={d} />,
            },
          ];

  const [tab, setTab] = useState(tabs[0]!.value);
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0]!.value;
  const jump = useCallback((next: string, anchor?: string) => {
    setTab(next);
    if (anchor)
      requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(anchor)));
  }, []);

  return (
    <AiProvider jump={jump}>
      <div className="wm" data-testid="metrics-body">
        {variant !== "C" && (
          <div className="wm-top">
            <TimeRangeSelector
              scope={scope}
              onScopeChange={setScope}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
            {exportSlot?.(range)}
          </div>
        )}
        <Tabs value={active} onValueChange={setTab}>
          <TabsList
            aria-label="Metrics"
            className="wm-tabs sticky top-0 z-[2] flex h-auto w-full overflow-hidden bg-panel"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="min-w-0 flex-1 px-1"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent
              key={t.value}
              value={t.value}
              className={t.raw ? "mt-0" : "wm-stack mt-0"}
            >
              {t.value === "records" ? (
                t.body(null as never)
              ) : !data ? (
                <p className="wm-p" style={{ padding: 14 }}>
                  Loading…
                </p>
              ) : t.raw ? (
                t.body(data)
              ) : (
                <>
                  {t.body(data)}
                  <EngineState counts={data.counts} days={data.period} />
                  <div style={{ height: 96 }} />
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AiProvider>
  );
}

// ---------------------------------------------------------------------------

function Chapters({
  data,
  nutrientAnalysis,
}: {
  data: Insights;
  nutrientAnalysis?: ReactNode;
}) {
  return (
    <>
      <VitalsChapter data={data} />
      <IntakeChapter data={data} nutrientAnalysis={nutrientAnalysis} />
      <MedsChapter data={data} />
      <JournalChapter data={data} />
    </>
  );
}

const SECTIONS = [
  { id: "proto-sec-report", label: "Summary" },
  { id: "proto-sec-vitals", label: "Vitals" },
  { id: "proto-sec-intake", label: "Intake" },
  { id: "proto-sec-meds", label: "Meds" },
  { id: "proto-sec-journal", label: "Journal" },
];

/** Scroll only the window's own scroller (scrollIntoView would also move the page). */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  let box = el?.parentElement ?? null;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY))
    box = box.parentElement;
  if (!el || !box) return;
  box.scrollBy({
    top: el.getBoundingClientRect().top - box.getBoundingClientRect().top - 96,
    behavior: "smooth",
  });
}

function OneDocument({
  data,
  nutrientAnalysis,
  aiInsights,
}: {
  data: Insights;
  nutrientAnalysis?: ReactNode;
  aiInsights?: ReactNode;
}) {
  return (
    <>
      <nav
        aria-label="Jump to section"
        style={{
          position: "sticky",
          top: 44,
          zIndex: 1,
          display: "flex",
          gap: 4,
          overflowX: "auto",
          padding: "8px 14px",
          background: col("panel"),
          borderBottom: `1px solid ${col("line")}`,
        }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jumpTo(s.id)}
            style={{
              flex: "none",
              minHeight: 32,
              padding: "0 10px",
              border: `1px solid ${col("line")}`,
              background: col("bg"),
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div id="proto-sec-report" style={{ scrollMarginTop: 96 }}>
        {aiInsights && (
          <div className="wm-stack" style={{ paddingBottom: 0 }}>
            {aiInsights}
          </div>
        )}
        <VariantReport data={data} printable={false} />
      </div>
      <div className="wm-stack" style={{ paddingTop: 0 }}>
        <ChapterHead id="proto-sec-vitals">Vitals in detail</ChapterHead>
        <VitalsChapter data={data} />
        <ChapterHead id="proto-sec-intake">Intake in detail</ChapterHead>
        <IntakeChapter data={data} nutrientAnalysis={nutrientAnalysis} />
        <ChapterHead id="proto-sec-meds">Medicines in detail</ChapterHead>
        <MedsChapter data={data} />
        <ChapterHead id="proto-sec-journal">Journal in detail</ChapterHead>
        <JournalChapter data={data} />
        <div style={{ height: 96 }} />
      </div>
    </>
  );
}

function ChapterHead({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      style={{
        scrollMarginTop: 96,
        fontSize: 15,
        fontWeight: 700,
        margin: "12px 2px 0",
      }}
    >
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------

function SinceLastVisit({
  data: d,
  lastVisit,
  onLastVisit,
}: {
  data: Insights;
  lastVisit: string;
  onLastVisit: (v: string) => void;
}) {
  const since = d.inPeriod[0]?.key ?? lastVisit;
  const moved = d.compare.filter(
    (r) => r.confidence === "consistent" || r.confidence === "possible",
  );
  const steady = d.compare.filter(
    (r) => !(r.confidence === "consistent" || r.confidence === "possible"),
  );
  const changes = d.changes.filter((c) => c.date >= since);
  const questions = buildQuestions(d);
  return (
    <>
      <Section title="Last appointment" color={col("ai")}>
        <label
          htmlFor="proto-last-visit"
          style={{ ...muted, display: "block" }}
        >
          Everything below covers the time since this date ({d.period} days),
          compared with the {d.period} days before it.
        </label>
        <input
          id="proto-last-visit"
          type="date"
          value={lastVisit}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => e.target.value && onLastVisit(e.target.value)}
          style={{
            marginTop: 8,
            minHeight: 40,
            padding: "0 8px",
            border: `1px solid ${col("line")}`,
            background: col("panel"),
            color: col("fg"),
            fontSize: 14,
          }}
        />
      </Section>

      {d.flags.length > 0 && (
        <Section
          title="Warning signs in the last 2 weeks"
          color={col("destructive")}
        >
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {d.flags.slice(0, 6).map((f, i) => (
              <li key={i}>
                <b>{f.title}</b>{" "}
                <span style={muted}>({shortDate(f.when)})</span>
                <div style={muted}>{f.detail}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title={
          moved.length
            ? `${moved.length} things changed since your last visit`
            : "Nothing clearly changed since your last visit"
        }
        color={col("ai")}
      >
        {moved.length > 0 && (
          <Table
            head={["", "Before", "Since", "Change", ""]}
            rows={moved.map((r) => [
              r.metric.label,
              fmtNum(r.before, r.metric.digits ?? 0),
              fmtNum(r.now, r.metric.digits ?? 0),
              `${signed(r.est, r.metric.digits ?? 0)} ${r.metric.unit}`,
              <ConfidenceChip key="c" c={r.confidence} />,
            ])}
          />
        )}
        <details style={{ marginTop: 10 }}>
          <summary style={{ ...muted, cursor: "pointer", minHeight: 32 }}>
            {steady.length} measures with no clear change
          </summary>
          <Table
            head={["", "Before", "Since", "Days"]}
            rows={steady.map((r) => [
              r.metric.label,
              fmtNum(r.before, r.metric.digits ?? 0),
              fmtNum(r.now, r.metric.digits ?? 0),
              `${r.nBefore}/${r.nNow}`,
            ])}
          />
        </details>
        <p style={{ ...muted, marginTop: 6 }}>
          Medians of daily values. A change is shown when the likely range of
          the difference doesn&apos;t include zero.
        </p>
      </Section>

      <Section title="Medicine changes since then" color={col("meds")}>
        {changes.length === 0 ? (
          <p style={muted}>None recorded.</p>
        ) : (
          changes.map((c, i) => <ChangeCard key={i} c={c} />)
        )}
      </Section>

      <Section title="Symptoms since then" color={col("journal")}>
        {d.symptoms.counts.length === 0 ? (
          <p style={muted}>None in the journal.</p>
        ) : (
          <Table
            head={["Finding", "Times", "Typical severity"]}
            rows={d.symptoms.counts.map((c) => [
              c.finding,
              String(c.n),
              Number.isFinite(c.severity) ? `${fmtNum(c.severity)}/10` : "—",
            ])}
          />
        )}
        {d.symptoms.patterns.map((p) => (
          <p key={p.finding} style={{ fontSize: 13, marginTop: 8 }}>
            <b>{p.finding}</b> ×{p.n}: {p.text}.
          </p>
        ))}
      </Section>

      {questions.length > 0 && (
        <Section title="Things to ask about" color={col("ai")}>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              fontSize: 13,
              display: "grid",
              gap: 4,
            }}
          >
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p style={{ ...muted, marginTop: 6 }}>
            Generated from fixed rules on your numbers, not medical advice.
          </p>
        </Section>
      )}
    </>
  );
}
