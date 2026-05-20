"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { RecordsTab } from "@/components/analytics/records-tab";
import { SummaryTab } from "@/components/analytics/summary-tab";
import { CorrelationsTab } from "@/components/analytics/correlations-tab";
import { TitrationTab } from "@/components/analytics/titration-tab";
import { ExportControls } from "@/components/analytics/export-controls";
import { AnalyticsIntroDialog } from "@/components/analytics/analytics-intro-dialog";
import { useTimeScopeRange } from "@/hooks/use-analytics-queries";
import type { TimeScope, TimeRange } from "@/lib/analytics-types";

type AnalyticsTab = "records" | "summary" | "correlations" | "titration";

const TAB_VALUES: AnalyticsTab[] = ["records", "summary", "correlations", "titration"];

function isAnalyticsTab(value: string | null): value is AnalyticsTab {
  return value !== null && (TAB_VALUES as string[]).includes(value);
}

function AnalyticsContent() {
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab: AnalyticsTab = isAnalyticsTab(tabParam) ? tabParam : "records";

  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);

  // Sync tab with URL param changes
  useEffect(() => {
    if (isAnalyticsTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);

  const scopeRange = useTimeScopeRange(scope);
  const effectiveRange = customRange ?? scopeRange;

  return (
    <div className="space-y-4">
        <AnalyticsIntroDialog />

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
            <TabsTrigger value="summary" className="flex-1 text-xs">
              Summary
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

          <TabsContent value="summary">
            <SummaryTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="correlations">
            <CorrelationsTab range={effectiveRange} />
          </TabsContent>

          <TabsContent value="titration">
            <TitrationTab range={effectiveRange} />
          </TabsContent>
        </Tabs>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsContent />
    </Suspense>
  );
}
