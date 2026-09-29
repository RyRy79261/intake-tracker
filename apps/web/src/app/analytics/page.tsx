"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AnalyticsPageBody,
  isAnalyticsTab,
  type AnalyticsTab,
} from "@/components/analytics/analytics-page-body";

function AnalyticsContent() {
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const initialTab: AnalyticsTab = isAnalyticsTab(tabParam) ? tabParam : "summary";

  const [activeTab, setActiveTab] = useState<AnalyticsTab>(initialTab);

  // Sync tab with URL param changes
  useEffect(() => {
    if (isAnalyticsTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return <AnalyticsPageBody activeTab={activeTab} onTabChange={setActiveTab} />;
}

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsContent />
    </Suspense>
  );
}
