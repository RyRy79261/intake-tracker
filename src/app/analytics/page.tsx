"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { RecordsTab } from "@/components/analytics/records-tab";
import { AppHeader } from "@/components/app-header";
import { AuthGuard } from "@/components/auth-guard";
import { useTimeScopeRange } from "@/hooks/use-analytics-queries";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { useSettings } from "@/hooks/use-settings";
import type { TimeScope, TimeRange } from "@/lib/analytics-types";

type AnalyticsTab = "records" | "insights" | "correlations" | "titration";

function AnalyticsContent() {
  const settings = useSettings();
  const barTransitionSec = settings.barTransitionDurationMs / 1000;
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("records");
  const [scope, setScope] = useState<TimeScope>("7d");
  const [customRange, setCustomRange] = useState<TimeRange | null>(null);

  const scopeRange = useTimeScopeRange(scope);
  const effectiveRange = customRange ?? scopeRange;

  return (
    <>
      <AppHeader headerHidden={isHidden} transitionDuration={barTransitionSec} />

      <div className="space-y-4">
        <TimeRangeSelector
          scope={scope}
          onScopeChange={setScope}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />

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
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Insights</p>
              <p className="text-sm mt-1">Coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="correlations">
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Correlations</p>
              <p className="text-sm mt-1">Coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="titration">
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Titration</p>
              <p className="text-sm mt-1">Coming soon</p>
            </div>
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
