"use client";

import { useState } from "react";
import { Info, AlertTriangle, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/analytics-types";

interface InsightBannerProps {
  insight: Insight;
  onDismiss: (id: string) => void;
}

const severityConfig = {
  info: {
    border: "border-l-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: Info,
    iconColor: "text-blue-500",
  },
  warning: {
    border: "border-l-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  alert: {
    border: "border-l-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: AlertCircle,
    iconColor: "text-red-500",
  },
} as const;

export function InsightBanner({ insight, onDismiss }: InsightBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const config = severityConfig[insight.severity];
  const Icon = config.icon;

  function handleDismiss() {
    setDismissed(true);
    // Let the opacity transition complete before calling onDismiss
    setTimeout(() => onDismiss(insight.id), 200);
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border-l-4 shadow-sm p-4 transition-opacity duration-200",
        config.border,
        config.bg,
        dismissed && "opacity-0"
      )}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss insight"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", config.iconColor)} />
        <div className="min-w-0">
          <h4 className="font-semibold text-sm leading-tight">
            {insight.title}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {insight.description}
          </p>
        </div>
      </div>
    </div>
  );
}
