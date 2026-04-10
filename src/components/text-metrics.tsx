"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useDailyIntakeTotal,
  getDayStartTimestamp,
  useIntakeRecordsByDateRange,
} from "@/hooks/use-intake-queries";
import { useSubstanceRecordsByDateRange } from "@/hooks/use-substance-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { CARD_THEMES } from "@/lib/card-themes";
import { Progress } from "@/components/ui/progress";
import { Droplets, Sparkles, Coffee, Wine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Get the Monday 00:00 (adjusted for dayStartHour) of the current week.
 */
function getWeekStartTimestamp(dayStartHour: number): number {
  const now = new Date();
  // Adjust for day boundary: if before dayStartHour, we're still in "yesterday"
  const adjusted = new Date(now);
  if (now.getHours() < dayStartHour) {
    adjusted.setDate(adjusted.getDate() - 1);
  }

  // Get day of week (0=Sun, 1=Mon, ..., 6=Sat)
  const dow = adjusted.getDay();
  // Days since Monday: Mon=0, Tue=1, ..., Sun=6
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;

  const monday = new Date(adjusted);
  monday.setDate(adjusted.getDate() - daysSinceMonday);
  monday.setHours(dayStartHour, 0, 0, 0);
  return monday.getTime();
}

/**
 * Get the "logical day index" (0=Mon through 6=Sun) for today,
 * accounting for dayStartHour boundary.
 */
function getTodayDayIndex(dayStartHour: number): number {
  const now = new Date();
  const adjusted = new Date(now);
  if (now.getHours() < dayStartHour) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  const dow = adjusted.getDay();
  return dow === 0 ? 6 : dow - 1;
}

function formatValue(value: number): string {
  return value.toLocaleString();
}

const DAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function TextMetrics() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);

  // 60-second tick for day boundary refresh
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Today's totals
  const waterTotal = useDailyIntakeTotal("water");
  const saltTotal = useDailyIntakeTotal("salt");

  // Day start timestamp for substance queries
  const dayStart = useMemo(
    () => getDayStartTimestamp(dayStartHour),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, tick]
  );
  const now = Date.now();

  // Today's substance totals
  const caffeineRecords = useSubstanceRecordsByDateRange(
    dayStart,
    now,
    "caffeine"
  );
  const alcoholRecords = useSubstanceRecordsByDateRange(
    dayStart,
    now,
    "alcohol"
  );

  const caffeineTotal = useMemo(
    () => caffeineRecords.reduce((sum, r) => sum + (r.amountMg ?? 0), 0),
    [caffeineRecords]
  );
  const alcoholTotal = useMemo(
    () =>
      caffeineRecords.length >= 0
        ? alcoholRecords.reduce(
            (sum, r) => sum + (r.amountStandardDrinks ?? 0),
            0
          )
        : 0,
    [alcoholRecords, caffeineRecords.length]
  );

  // Weekly data
  const weekStart = useMemo(
    () => getWeekStartTimestamp(dayStartHour),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, tick]
  );
  const weekEnd = weekStart + 7 * ONE_DAY_MS;
  const todayIndex = useMemo(
    () => getTodayDayIndex(dayStartHour),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, tick]
  );

  const weeklyWaterRecords = useIntakeRecordsByDateRange(
    weekStart,
    weekEnd,
    "water"
  );
  const weeklySaltRecords = useIntakeRecordsByDateRange(
    weekStart,
    weekEnd,
    "salt"
  );

  const weeklyCaffeineRecords = useSubstanceRecordsByDateRange(
    weekStart,
    weekEnd,
    "caffeine"
  );
  const weeklyAlcoholRecords = useSubstanceRecordsByDateRange(
    weekStart,
    weekEnd,
    "alcohol"
  );

  // Bucket records into 7 days
  const weeklyWater = useMemo(() => {
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const record of weeklyWaterRecords) {
      const dayOffset = Math.floor(
        (record.timestamp - weekStart) / ONE_DAY_MS
      );
      if (dayOffset >= 0 && dayOffset < 7) {
        buckets[dayOffset] = (buckets[dayOffset] ?? 0) + record.amount;
      }
    }
    return buckets;
  }, [weeklyWaterRecords, weekStart]);

  const weeklySalt = useMemo(() => {
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const record of weeklySaltRecords) {
      const dayOffset = Math.floor(
        (record.timestamp - weekStart) / ONE_DAY_MS
      );
      if (dayOffset >= 0 && dayOffset < 7) {
        buckets[dayOffset] = (buckets[dayOffset] ?? 0) + record.amount;
      }
    }
    return buckets;
  }, [weeklySaltRecords, weekStart]);

  const weeklyCaffeine = useMemo(() => {
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const record of weeklyCaffeineRecords) {
      const dayOffset = Math.floor(
        (record.timestamp - weekStart) / ONE_DAY_MS
      );
      if (dayOffset >= 0 && dayOffset < 7) {
        buckets[dayOffset] = (buckets[dayOffset] ?? 0) + (record.amountMg ?? 0);
      }
    }
    return buckets;
  }, [weeklyCaffeineRecords, weekStart]);

  const weeklyAlcohol = useMemo(() => {
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const record of weeklyAlcoholRecords) {
      const dayOffset = Math.floor(
        (record.timestamp - weekStart) / ONE_DAY_MS
      );
      if (dayOffset >= 0 && dayOffset < 7) {
        buckets[dayOffset] = (buckets[dayOffset] ?? 0) + (record.amountStandardDrinks ?? 0);
      }
    }
    return buckets;
  }, [weeklyAlcoholRecords, weekStart]);

  // Over limit checks
  const waterOverLimit = waterLimit > 0 && waterTotal > waterLimit;
  const saltOverLimit = saltLimit > 0 && saltTotal > saltLimit;
  const waterPct =
    waterLimit > 0 ? Math.min(100, (waterTotal / waterLimit) * 100) : 0;
  const saltPct =
    saltLimit > 0 ? Math.min(100, (saltTotal / saltLimit) * 100) : 0;

  return (
    <section aria-label="Daily intake summary">
      <div className="rounded-lg bg-muted/50 border p-4">
        {/* Today's Metrics */}
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Today
        </h2>
        <div className="space-y-2">
          {/* Water */}
          <div className="flex items-center gap-3">
            <Droplets
              className={cn("w-4 h-4", CARD_THEMES.water.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Water</span>
            <Progress
              value={waterPct}
              className="h-2 flex-1"
              indicatorClassName={
                waterOverLimit
                  ? "bg-red-500"
                  : CARD_THEMES.water.progressGradient
              }
              aria-label="Water intake progress"
            />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                waterOverLimit
                  ? "text-red-600 dark:text-red-400"
                  : CARD_THEMES.water.latestValueColor
              )}
            >
              {formatValue(waterTotal)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatValue(waterLimit)} ml
            </span>
          </div>

          {/* Salt */}
          <div className="flex items-center gap-3">
            <Sparkles
              className={cn("w-4 h-4", CARD_THEMES.salt.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Sodium</span>
            <Progress
              value={saltPct}
              className="h-2 flex-1"
              indicatorClassName={
                saltOverLimit
                  ? "bg-red-500"
                  : CARD_THEMES.salt.progressGradient
              }
              aria-label="Sodium intake progress"
            />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                saltOverLimit
                  ? "text-red-600 dark:text-red-400"
                  : CARD_THEMES.salt.latestValueColor
              )}
            >
              {formatValue(saltTotal)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatValue(saltLimit)} mg
            </span>
          </div>

          {/* Caffeine */}
          <div className="flex items-center gap-3">
            <Coffee
              className={cn("w-4 h-4", CARD_THEMES.caffeine.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Caffeine</span>
            <span className="flex-1" />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                caffeineTotal === 0
                  ? "text-muted-foreground"
                  : CARD_THEMES.caffeine.latestValueColor
              )}
            >
              {caffeineTotal} mg
            </span>
          </div>

          {/* Alcohol */}
          <div className="flex items-center gap-3">
            <Wine
              className={cn("w-4 h-4", CARD_THEMES.alcohol.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Alcohol</span>
            <span className="flex-1" />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                alcoholTotal === 0
                  ? "text-muted-foreground"
                  : CARD_THEMES.alcohol.latestValueColor
              )}
            >
              {alcoholTotal.toFixed(1)} std drinks
            </span>
          </div>
        </div>

        {/* Weekly Summary */}
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mt-4 mb-2">
          This Week (Mon-Sun)
        </h2>
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-x-1 gap-y-1">
          {/* Day headers row */}
          <div /> {/* Empty first cell */}
          {DAY_HEADERS.map((day, i) => (
            <div
              key={`header-${i}`}
              className={cn(
                "text-xs text-muted-foreground text-center font-medium",
                i === todayIndex && "font-semibold"
              )}
            >
              {day}
            </div>
          ))}

          {/* Water row */}
          <div className="text-xs text-muted-foreground">Water</div>
          {weeklyWater.map((val, i) => {
            const isFuture = i > todayIndex;
            const isToday = i === todayIndex;
            const isOverLimit = waterLimit > 0 && val > waterLimit;
            const hasData = val > 0;
            return (
              <div
                key={`water-${i}`}
                className={cn(
                  "text-xs tabular-nums text-center",
                  isFuture && "text-muted-foreground/50",
                  isToday && "font-semibold",
                  !isFuture &&
                    !isOverLimit &&
                    hasData &&
                    CARD_THEMES.water.latestValueColor,
                  !isFuture && isOverLimit && "text-red-600 dark:text-red-400",
                  !isFuture && !hasData && "text-muted-foreground/50"
                )}
              >
                {isFuture ? "---" : formatValue(val)}
              </div>
            );
          })}

          {/* Sodium row */}
          <div className="text-xs text-muted-foreground">Na</div>
          {weeklySalt.map((val, i) => {
            const isFuture = i > todayIndex;
            const isToday = i === todayIndex;
            const isOverLimit = saltLimit > 0 && val > saltLimit;
            const hasData = val > 0;
            return (
              <div
                key={`salt-${i}`}
                className={cn(
                  "text-xs tabular-nums text-center",
                  isFuture && "text-muted-foreground/50",
                  isToday && "font-semibold",
                  !isFuture &&
                    !isOverLimit &&
                    hasData &&
                    CARD_THEMES.salt.latestValueColor,
                  !isFuture && isOverLimit && "text-red-600 dark:text-red-400",
                  !isFuture && !hasData && "text-muted-foreground/50"
                )}
              >
                {isFuture ? "---" : formatValue(val)}
              </div>
            );
          })}

          {/* Caffeine row */}
          <div className="text-xs text-muted-foreground">Caf</div>
          {weeklyCaffeine.map((val, i) => {
            const isFuture = i > todayIndex;
            const isToday = i === todayIndex;
            const hasData = val > 0;
            return (
              <div
                key={`caf-${i}`}
                className={cn(
                  "text-xs tabular-nums text-center",
                  isFuture && "text-muted-foreground/50",
                  isToday && "font-semibold",
                  !isFuture && hasData && CARD_THEMES.caffeine.latestValueColor,
                  !isFuture && !hasData && "text-muted-foreground/50"
                )}
              >
                {isFuture ? "---" : formatValue(Math.round(val))}
              </div>
            );
          })}

          {/* Alcohol row */}
          <div className="text-xs text-muted-foreground">Alc</div>
          {weeklyAlcohol.map((val, i) => {
            const isFuture = i > todayIndex;
            const isToday = i === todayIndex;
            const hasData = val > 0;
            return (
              <div
                key={`alc-${i}`}
                className={cn(
                  "text-xs tabular-nums text-center",
                  isFuture && "text-muted-foreground/50",
                  isToday && "font-semibold",
                  !isFuture && hasData && CARD_THEMES.alcohol.latestValueColor,
                  !isFuture && !hasData && "text-muted-foreground/50"
                )}
              >
                {isFuture ? "---" : val.toFixed(1)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
