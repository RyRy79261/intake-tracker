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
import type { TimeScope, TimeRange } from "@intake/types/analytics";

export type AnalyticsTab = "summary" | "correlations" | "records" | "titration";

const TAB_VALUES: AnalyticsTab[] = ["summary", "correlations", "records", "titration"];

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
}

/**
 * The Analytics screen (Metrics): range, export, and the Summary,
 * Correlations, Records and Titration tabs. Rendered by the `/analytics`
 * route and by the Metrics window.
 */
export function AnalyticsPageBody({ activeTab, onTabChange }: AnalyticsPageBodyProps) {
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);

  const scopeRange = useTimeScopeRange(scope);
  const effectiveRange = customRange ?? scopeRange;

  return (
    <div className="space-y-4">
        <AnalyticsIntroDialog />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <TimeRangeSelector
            scope={scope}
            onScopeChange={setScope}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
          <ExportControls range={effectiveRange} />
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => onTabChange(v as AnalyticsTab)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="summary" className="flex-1 text-xs">
              Summary
            </TabsTrigger>
            <TabsTrigger value="correlations" className="flex-1 text-xs">
              Correlations
            </TabsTrigger>
            <TabsTrigger value="records" className="flex-1 text-xs">
              Records
            </TabsTrigger>
            <TabsTrigger value="titration" className="flex-1 text-xs">
              Titration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="correlations">
            <CorrelationsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="records">
            <RecordsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="titration">
            <TitrationTab range={effectiveRange} />
          </TabsContent>
        </Tabs>
    </div>
  );
}
