"use client";

/**
 * PROTOTYPE — throwaway. Round 3: the Metrics window as a doctor-style report
 * (layout A won round 2: Report · Vitals · Fluid · Food · Meds). The question
 * now is how the AI analysis fits in without taking over the screen; three
 * treatments, switchable via `?variant=` (see ai-review.tsx):
 *
 *   1  Notes   — slim analyse row; findings as one-line notes in their section
 *   2  Strip   — a row of finding chips per tab, details in a sheet
 *   3  Line    — one summary line, counts on tabs, dots on sections, a sheet
 *
 * Round 2's B (one document) and C (visit pack) live in this branch's history.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import type { TimeRange, TimeScope } from "@intake/types/analytics";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { FluidChapter, FoodChapter, MedsChapter, VitalsChapter } from "@/components/analytics/insights-prototype/chapters";
import { VariantReport } from "@/components/analytics/insights-prototype/variant-report";
import { EngineState } from "@/components/analytics/insights-prototype/ui";
import { AiProvider, AnalyseBar, FindingsStrip, SummaryLine, TabCount, useAi, type Chapter, type Treatment } from "@/components/analytics/insights-prototype/ai-review";

const SCOPE_DAYS: Record<string, number> = { "24h": 7, "7d": 7, "30d": 30, "90d": 90, all: 180 };
const DAY = 86_400_000;

export const METRICS_VARIANTS = [
  { key: "1", name: "Notes in the report" },
  { key: "2", name: "Findings strip" },
  { key: "3", name: "Summary line" },
] as const;

const TREATMENT: Record<string, Treatment> = { "1": "notes", "2": "strip", "3": "line" };

const TABS: { value: "report" | Chapter; label: string }[] = [
  { value: "report", label: "Report" },
  { value: "vitals", label: "Vitals" },
  { value: "fluid", label: "Fluid" },
  { value: "food", label: "Food" },
  { value: "meds", label: "Meds" },
];

/** Scroll only the window's own scroller (scrollIntoView would also move the page). */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  let box = el?.parentElement ?? null;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!el || !box) return;
  box.scrollBy({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top - 56, behavior: "smooth" });
}

export function MetricsPrototype({
  variant,
  useInsights,
  exportSlot,
}: {
  variant: string;
  useInsights: (period: number) => Insights | null;
  exportSlot?: (range: TimeRange) => ReactNode;
}) {
  const [scope, setScope] = useState<TimeScope>("30d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);
  const period = customRange ? Math.max(7, Math.round((customRange.end - customRange.start) / DAY)) : SCOPE_DAYS[scope] ?? 30;
  const data = useInsights(period);
  const range: TimeRange = customRange ?? { start: Date.now() - period * DAY, end: Date.now() };
  const [tab, setTab] = useState<string>("report");
  const jump = useCallback((next: string, anchor?: string) => {
    setTab(next);
    if (anchor) requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(anchor)));
  }, []);

  const body = (
    <div className="wm" data-testid="metrics-body">
      <div className="wm-top">
        <TimeRangeSelector scope={scope} onScopeChange={setScope} customRange={customRange} onCustomRangeChange={setCustomRange} />
        {exportSlot?.(range)}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Metrics" className="wm-tabs sticky top-0 z-[2] flex h-auto w-full overflow-hidden bg-panel">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-w-0 flex-1 px-1">
              {t.label}
              <TabCount chapter={t.value} />
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            {!data ? (
              <p className="wm-p" style={{ padding: 14 }}>Loading…</p>
            ) : (
              <>
                <TabTop tab={t.value} />
                {t.value === "report" ? (
                  <VariantReport data={data} printable={false} />
                ) : (
                  <div className="wm-stack">
                    {t.value === "vitals" && <VitalsChapter data={data} />}
                    {t.value === "fluid" && <FluidChapter data={data} />}
                    {t.value === "food" && <FoodChapter data={data} />}
                    {t.value === "meds" && <MedsChapter data={data} />}
                    <EngineState counts={data.counts} days={data.period} />
                    <div style={{ height: 96 }} />
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );

  return data ? (
    <AiProvider data={data} treatment={TREATMENT[variant] ?? "notes"} jump={jump}>
      {body}
    </AiProvider>
  ) : (
    body
  );
}

/** What sits directly under the tabs, per treatment. */
function TabTop({ tab }: { tab: "report" | Chapter }) {
  const ai = useAi();
  if (!ai) return null;
  if (ai.treatment === "line") return <SummaryLine />;
  if (ai.treatment === "strip") return tab === "report" ? <FindingsStrip /> : <FindingsStrip chapter={tab} />;
  return tab === "report" ? <AnalyseBar /> : null;
}
