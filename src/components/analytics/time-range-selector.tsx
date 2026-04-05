"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimeScope, TimeRange } from "@/lib/analytics-types";

const SCOPE_OPTIONS: { value: TimeScope; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

interface TimeRangeSelectorProps {
  scope: TimeScope;
  onScopeChange: (scope: TimeScope) => void;
  customRange: TimeRange | null;
  onCustomRangeChange: (range: TimeRange | null) => void;
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(val: string, endOfDay: boolean): number {
  const d = new Date(val);
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

export function TimeRangeSelector({
  scope,
  onScopeChange,
  customRange,
  onCustomRangeChange,
}: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(customRange !== null);

  const handleScopeClick = (s: TimeScope) => {
    setShowCustom(false);
    onCustomRangeChange(null);
    onScopeChange(s);
  };

  const handleCustomClick = () => {
    setShowCustom(true);
    // Initialize with a 7d range if no custom range set
    if (!customRange) {
      const end = Date.now();
      const start = end - 7 * 24 * 60 * 60 * 1000;
      onCustomRangeChange({ start, end });
    }
  };

  const handleStartChange = (val: string) => {
    if (!val) return;
    const start = fromDateInputValue(val, false);
    const end = customRange?.end ?? Date.now();
    onCustomRangeChange({ start, end: Math.max(start, end) });
  };

  const handleEndChange = (val: string) => {
    if (!val) return;
    const end = fromDateInputValue(val, true);
    const start = customRange?.start ?? 0;
    onCustomRangeChange({ start: Math.min(start, end), end });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {SCOPE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={!showCustom && scope === opt.value ? "default" : "outline"}
            size="sm"
            className="text-xs flex-1 min-w-[3rem]"
            onClick={() => handleScopeClick(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
        <Button
          variant={showCustom ? "default" : "outline"}
          size="sm"
          className="text-xs flex-1 min-w-[3rem]"
          onClick={handleCustomClick}
        >
          Custom
        </Button>
      </div>

      {showCustom && customRange && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={toDateInputValue(customRange.start)}
            onChange={(e) => handleStartChange(e.target.value)}
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={toDateInputValue(customRange.end)}
            onChange={(e) => handleEndChange(e.target.value)}
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          />
        </div>
      )}
    </div>
  );
}
