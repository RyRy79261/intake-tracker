"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { useInsights, useTimeScopeRange } from "@/hooks/use-analytics-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/navigation";

const severityColors = {
  alert: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
} as const;

export function InsightBadge() {
  const router = useRouter();
  const range = useTimeScopeRange("7d");
  const insights = useInsights(range);
  const isDismissed = useSettingsStore((s) => s.isDismissed);

  const activeInsights = useMemo(
    () => insights.filter((i) => !isDismissed(i.id, i.value)),
    [insights, isDismissed]
  );

  if (activeInsights.length === 0) return null;

  // Highest severity among active insights
  const highestSeverity = activeInsights.reduce<"info" | "warning" | "alert">(
    (highest, i) => {
      const order = { alert: 2, warning: 1, info: 0 } as const;
      return order[i.severity] > order[highest] ? i.severity : highest;
    },
    "info"
  );

  const hasAlert = highestSeverity === "alert";

  return (
    <button
      onClick={() => navigateTo("/analytics?tab=insights", router)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        severityColors[highestSeverity],
        hasAlert && "animate-pulse"
      )}
    >
      <Lightbulb className="w-3.5 h-3.5" />
      {activeInsights.length} insight{activeInsights.length !== 1 ? "s" : ""}
    </button>
  );
}
