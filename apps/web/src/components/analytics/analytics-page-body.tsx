"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@intake/ui/tabs";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { RecordsTab } from "@/components/analytics/records-tab";
import { SummaryTab } from "@/components/analytics/summary-tab";
import { CorrelationsTab } from "@/components/analytics/correlations-tab";
import { TitrationTab } from "@/components/analytics/titration-tab";
import { ExportControls } from "@/components/analytics/export-controls";
import { AnalyticsIntroDialog } from "@/components/analytics/analytics-intro-dialog";
import { useTimeScopeRange } from "@/hooks/use-analytics-queries";
import type { FilterType } from "@/lib/history-types";
import type { TimeScope, TimeRange } from "@intake/types/analytics";

export type AnalyticsTab = "summary" | "correlations" | "records" | "titration";

const TAB_VALUES: AnalyticsTab[] = ["summary", "correlations", "records", "titration"];

const TAB_LABELS: Record<AnalyticsTab, string> = {
  summary: "Summary",
  correlations: "Correlations",
  records: "Records",
  titration: "Titration",
};

export function isAnalyticsTab(value: unknown): value is AnalyticsTab {
  return typeof value === "string" && (TAB_VALUES as string[]).includes(value);
}

interface AnalyticsPageBodyProps {
  /**
   * The open tab. The route keeps it in step with `?tab=`; the Metrics
   * window keeps it in the window's state.
   */
  activeTab: AnalyticsTab;
  onTabChange: (tab: AnalyticsTab) => void;
  /**
   * The Records domain filter, when the owner keeps it (the Metrics window,
   * so Home's Today rows can open Records filtered). Left out, Records keeps
   * its own.
   */
  recordsFilter?: FilterType | undefined;
  onRecordsFilterChange?: ((filter: FilterType) => void) | undefined;
}

/**
 * The Analytics screen (Metrics): range, export, and the Summary,
 * Correlations, Records and Titration tabs. Rendered by the `/analytics`
 * route and by the Metrics window.
 */
export function AnalyticsPageBody({
  activeTab,
  onTabChange,
  recordsFilter,
  onRecordsFilterChange,
}: AnalyticsPageBodyProps) {
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);

  const scopeRange = useTimeScopeRange(scope);
  const effectiveRange = customRange ?? scopeRange;

  return (
    <div className="wm" data-testid="metrics-body">
      <AnalyticsIntroDialog />

      <div className="wm-top">
        <TimeRangeSelector
          scope={scope}
          onScopeChange={setScope}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
        <ExportControls range={effectiveRange} />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as AnalyticsTab)}>
        <TabsList
          aria-label="Metrics"
          className="wm-tabs sticky top-0 z-[2] flex h-auto w-full overflow-hidden bg-panel"
        >
          {TAB_VALUES.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="min-w-0 flex-1 px-1">
              {TAB_LABELS[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" className="wm-stack mt-0">
          <SummaryTab range={effectiveRange} />
        </TabsContent>

        <TabsContent value="correlations" className="wm-stack mt-0">
          <CorrelationsTab range={effectiveRange} />
        </TabsContent>

        <TabsContent value="records" className="wm-stack mt-0">
          <RecordsTab
            range={effectiveRange}
            filter={recordsFilter}
            onFilterChange={onRecordsFilterChange}
          />
        </TabsContent>

        <TabsContent value="titration" className="wm-stack mt-0">
          <TitrationTab range={effectiveRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
