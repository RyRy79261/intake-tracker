"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { RecordsTab } from "@/components/analytics/records-tab";
import { InsightsTab } from "@/components/analytics/insights-tab";
import { CorrelationsTab } from "@/components/analytics/correlations-tab";
import { TitrationTab } from "@/components/analytics/titration-tab";
import { ExportControls } from "@/components/analytics/export-controls";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth-guard";
import { useTimeScopeRange } from "@/hooks/use-analytics-queries";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { TimeScope, TimeRange } from "@/lib/analytics-types";

type AnalyticsTab = "records" | "insights" | "correlations" | "titration";

function AnalyticsContent() {
  const settings = useSettings();
  const searchParams = useSearchParams();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const tabParam = searchParams.get("tab");
  const initialTab: AnalyticsTab =
    tabParam && ["records", "insights", "correlations", "titration"].includes(tabParam)
      ? (tabParam as AnalyticsTab)
      : "records";

  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);

  // Sync tab with URL param changes
  useEffect(() => {
    if (tabParam && ["records", "insights", "correlations", "titration"].includes(tabParam)) {
      setActiveTab(tabParam as AnalyticsTab);
    }
  }, [tabParam]);
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);

  const scopeRange = useTimeScopeRange(scope);
  const effectiveRange = customRange ?? scopeRange;

  return (
    <>
      <AppHeader headerHidden={isHidden} transitionDuration={barTransitionSec} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
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
          onValueChange={(v) => setActiveTab(v as AnalyticsTab)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="records" className="flex-1 text-xs">
              Records
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex-1 text-xs">
              Insights
            </TabsTrigger>
            <TabsTrigger value="correlations" className="flex-1 text-xs">
              Correlations
            </TabsTrigger>
            <TabsTrigger value="titration" className="flex-1 text-xs">
              Titration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records">
            <RecordsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="insights">
            <InsightsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="correlations">
            <CorrelationsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="titration">
            <TitrationTab range={effectiveRange} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <AuthGuard>
      <AnalyticsContent />
    </AuthGuard>
  );
}
