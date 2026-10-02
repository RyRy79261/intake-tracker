"use client";

import { useState } from "react";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";
import {
  logicalDayKey,
  logicalDayStart,
  logicalDaysRange,
  shiftDayKey,
} from "@intake/core/logical-day";
import type { TimeScope, TimeRange } from "@intake/types/analytics";

// The "24h" scope is the current logical day, not a rolling 24 hours (the
// dashboard's "24h" figures are rolling), so it is labelled "Today".
const SCOPE_OPTIONS: { value: TimeScope; label: string }[] = [
  { value: "24h", label: "Today" },
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

export function TimeRangeSelector({
  scope,
  onScopeChange,
  customRange,
  onCustomRangeChange,
}: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(customRange !== null);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tz = getDeviceTimezone();

  // Custom dates are whole logical days, like the presets. The picker's
  // "YYYY-MM-DD" is split into parts rather than passed to `new Date()`, which
  // parses a date-only string as UTC and lands a day early west of UTC.
  const toDateInputValue = (ms: number): string => logicalDayKey(ms, dayStartHour, tz);
  const fromDateInputValue = (val: string, endOfDay: boolean): number =>
    endOfDay
      ? logicalDayStart(shiftDayKey(val, 1), dayStartHour, tz) - 1
      : logicalDayStart(val, dayStartHour, tz);

  const handleScopeClick = (s: TimeScope) => {
    setShowCustom(false);
    onCustomRangeChange(null);
    onScopeChange(s);
  };

  const handleCustomClick = () => {
    setShowCustom(true);
    // Initialize with the last 7 whole days if no custom range set
    if (!customRange) {
      onCustomRangeChange(logicalDaysRange(Date.now(), 7, dayStartHour, tz));
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

  // A fragment: the range row and the custom dates wrap inside the Metrics
  // top bar, ahead of the export buttons (the prototype's `.an-top`).
  return (
    <>
      <div className="wm-range" role="group" aria-label="Time range">
        {SCOPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={!showCustom && scope === opt.value}
            onClick={() => handleScopeClick(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <button type="button" aria-pressed={showCustom} onClick={handleCustomClick}>
          Custom
        </button>
      </div>

      {showCustom && customRange && (
        <div className="wm-custom">
          <input
            type="date"
            aria-label="Start date"
            value={toDateInputValue(customRange.start)}
            onChange={(e) => handleStartChange(e.target.value)}
            className="wm-field"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="End date"
            value={toDateInputValue(customRange.end)}
            onChange={(e) => handleEndChange(e.target.value)}
            className="wm-field"
          />
        </div>
      )}
    </>
  );
}

