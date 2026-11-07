"use client";

/**
 * PROTOTYPE — throwaway. Round 4: the Metrics window as a doctor-style report
 * (layout A: Report · Vitals · Fluid · Food · Meds) plus an Analysis tab that
 * holds every AI analysis: start a health or food analysis (Quick or Deep),
 * read it, and manage past ones (see ai-review.tsx). Earlier rounds' layouts
 * and AI treatments live in this branch's history.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import type { TimeRange, TimeScope } from "@intake/types/analytics";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import type { Insights } from "@/components/analytics/insights-prototype/engine";
import { FluidChapter, FoodChapter, MedsChapter, VitalsChapter } from "@/components/analytics/insights-prototype/chapters";
import { VariantReport } from "@/components/analytics/insights-prototype/variant-report";
import { EngineState } from "@/components/analytics/insights-prototype/ui";
import { AiProvider, AnalysisTab, AnalysisTabCount, type Chapter } from "@/components/analytics/insights-prototype/ai-review";

const SCOPE_DAYS: Record<string, number> = { "24h": 7, "7d": 7, "30d": 30, "90d": 90, all: 180 };
const DAY = 86_400_000;

export const METRICS_VARIANTS = [{ key: "1", name: "Analysis tab" }] as const;

const TABS: { value: "report" | Chapter | "analysis"; label: string }[] = [
  { value: "report", label: "Report" },
  { value: "vitals", label: "Vitals" },
  { value: "fluid", label: "Fluid" },
  { value: "food", label: "Food" },
  { value: "meds", label: "Meds" },
  { value: "analysis", label: "Analysis" },
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
  useInsights,
  exportSlot,
}: {
  /** Kept so callers can key the window by variant. */
  variant?: string;
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
              {t.value === "analysis" && <AnalysisTabCount />}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            {!data ? (
              <p className="wm-p" style={{ padding: 14 }}>Loading…</p>
            ) : (
              <>
                {t.value === "report" ? (
                  <VariantReport data={data} printable={false} />
                ) : (
                  <div className="wm-stack">
                    {t.value === "vitals" && <VitalsChapter data={data} />}
                    {t.value === "fluid" && <FluidChapter data={data} />}
                    {t.value === "food" && <FoodChapter data={data} />}
                    {t.value === "meds" && <MedsChapter data={data} />}
                    {t.value === "analysis" && <AnalysisTab />}
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
    <AiProvider data={data} jump={jump}>
      {body}
    </AiProvider>
  ) : (
    body
  );
}
