"use client";

import { Fragment, useMemo } from "react";
import {
  useDailyIntakeTotal,
  getDayStartTimestamp,
  useIntakeRecordsByDateRange,
} from "@/hooks/use-intake-queries";
import { useSubstanceRecordsByDateRange } from "@/hooks/use-substance-queries";
import { useNowTick } from "@intake/ui/use-now-tick";
import { useSettingsStore } from "@/stores/settings-store";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { CARD_THEMES } from "@/lib/card-themes";
import { Progress } from "@intake/ui/progress";
import { computeTwoStageProgress } from "@intake/core/progress";
import { Droplets, Sparkles, Coffee, Wine, Candy, Banana } from "lucide-react";
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

function bucketByDay<T extends { timestamp: number }>(
  records: T[], weekStart: number, accessor: (r: T) => number
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const r of records) {
    const i = Math.floor((r.timestamp - weekStart) / ONE_DAY_MS);
    if (i >= 0 && i < 7) buckets[i] = (buckets[i] ?? 0) + accessor(r);
  }
  return buckets;
}

export function TextMetrics() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const waterLimit = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const waterExtendedBuffer = useSettingsStore((s) => s.waterExtendedBuffer);
  const saltExtendedBuffer = useSettingsStore((s) => s.saltExtendedBuffer);
  const sugarExtendedBuffer = useSettingsStore((s) => s.sugarExtendedBuffer);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");

  // 60-second tick for day boundary refresh
  const tick = useNowTick();

  // Today's totals
  const waterTotal = useDailyIntakeTotal("water");
  const saltTotal = useDailyIntakeTotal("salt");
  const sugarTotal = useDailyIntakeTotal("sugar");
  const potassiumTotal = useDailyIntakeTotal("potassium");

  // Day start timestamp for substance queries
  const dayStart = useMemo(
    () => getDayStartTimestamp(dayStartHour),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, tick]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [tick]);

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
    () => alcoholRecords.reduce((sum, r) => sum + (r.amountStandardDrinks ?? 0), 0),
    [alcoholRecords]
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
  const weeklySugarRecords = useIntakeRecordsByDateRange(
    weekStart,
    weekEnd,
    "sugar"
  );
  const weeklyPotassiumRecords = useIntakeRecordsByDateRange(
    weekStart,
    weekEnd,
    "potassium"
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
  const weeklyWater = useMemo(() => bucketByDay(weeklyWaterRecords, weekStart, (r) => r.amount), [weeklyWaterRecords, weekStart]);
  const weeklySalt = useMemo(() => bucketByDay(weeklySaltRecords, weekStart, (r) => r.amount), [weeklySaltRecords, weekStart]);
  const weeklySugar = useMemo(() => bucketByDay(weeklySugarRecords, weekStart, (r) => r.amount), [weeklySugarRecords, weekStart]);
  const weeklyPotassium = useMemo(() => bucketByDay(weeklyPotassiumRecords, weekStart, (r) => r.amount), [weeklyPotassiumRecords, weekStart]);
  const weeklyCaffeine = useMemo(() => bucketByDay(weeklyCaffeineRecords, weekStart, (r) => r.amountMg ?? 0), [weeklyCaffeineRecords, weekStart]);
  const weeklyAlcohol = useMemo(() => bucketByDay(weeklyAlcoholRecords, weekStart, (r) => r.amountStandardDrinks ?? 0), [weeklyAlcoholRecords, weekStart]);

  // Two-stage progress: primary fill up to the daily limit, then a
  // second-tone segment up to (limit + extendedBuffer), then red when
  // beyond the extended zone.
  const waterProgress = computeTwoStageProgress(
    waterTotal,
    waterLimit,
    waterExtendedBuffer
  );
  const saltProgress = computeTwoStageProgress(
    saltTotal,
    saltLimit,
    saltExtendedBuffer
  );
  const sugarProgress = computeTwoStageProgress(
    sugarTotal,
    sugarLimit,
    sugarExtendedBuffer
  );
  // Potassium is a soft target — single-stage, no buffer, no red over-limit.
  const potassiumPct =
    potassiumLimit > 0
      ? Math.min(100, (potassiumTotal / potassiumLimit) * 100)
      : 0;

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
              value={waterProgress.isOverExtended ? 100 : waterProgress.primaryPct}
              extendedValue={waterProgress.isOverExtended ? 0 : waterProgress.extendedPct}
              targetMarkerPct={waterProgress.isOverExtended ? 0 : waterProgress.targetPct}
              className="h-2 flex-1"
              indicatorClassName={
                waterProgress.isOverExtended
                  ? "bg-red-500"
                  : CARD_THEMES.water.progressGradient
              }
              extendedIndicatorClassName={CARD_THEMES.water.progressExtended}
              aria-label="Water intake progress"
            />
            <div className="flex flex-col items-end leading-tight">
              <div className="flex items-baseline gap-1">
                <span
                  data-testid="today-water-value"
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    waterProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : CARD_THEMES.water.latestValueColor
                  )}
                >
                  {formatValue(Math.min(waterTotal, waterLimit))}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(waterLimit)} ml
                </span>
              </div>
              {waterProgress.isOverTarget && waterProgress.extendedTotal > 0 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    waterProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {formatValue(waterProgress.extendedCurrent)} /{" "}
                  {formatValue(waterProgress.extendedTotal)} ml extra
                </span>
              )}
            </div>
          </div>

          {/* Salt */}
          <div className="flex items-center gap-3">
            <Sparkles
              className={cn("w-4 h-4", CARD_THEMES.salt.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Sodium</span>
            <Progress
              value={saltProgress.isOverExtended ? 100 : saltProgress.primaryPct}
              extendedValue={saltProgress.isOverExtended ? 0 : saltProgress.extendedPct}
              targetMarkerPct={saltProgress.isOverExtended ? 0 : saltProgress.targetPct}
              className="h-2 flex-1"
              indicatorClassName={
                saltProgress.isOverExtended
                  ? "bg-red-500"
                  : CARD_THEMES.salt.progressGradient
              }
              extendedIndicatorClassName={CARD_THEMES.salt.progressExtended}
              aria-label="Sodium intake progress"
            />
            <div className="flex flex-col items-end leading-tight">
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    saltProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : CARD_THEMES.salt.latestValueColor
                  )}
                >
                  {formatValue(Math.min(saltTotal, saltLimit))}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(saltLimit)} mg
                </span>
              </div>
              {saltProgress.isOverTarget && saltProgress.extendedTotal > 0 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    saltProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {formatValue(saltProgress.extendedCurrent)} /{" "}
                  {formatValue(saltProgress.extendedTotal)} mg extra
                </span>
              )}
            </div>
          </div>

          {/* Sugar — optional tracker */}
          {sugarEnabled && (
          <div className="flex items-center gap-3" data-testid="metrics-sugar-row">
            <Candy
              className={cn("w-4 h-4", CARD_THEMES.sugar.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Sugar</span>
            <Progress
              value={sugarProgress.isOverExtended ? 100 : sugarProgress.primaryPct}
              extendedValue={sugarProgress.isOverExtended ? 0 : sugarProgress.extendedPct}
              targetMarkerPct={sugarProgress.isOverExtended ? 0 : sugarProgress.targetPct}
              className="h-2 flex-1"
              indicatorClassName={
                sugarProgress.isOverExtended
                  ? "bg-red-500"
                  : CARD_THEMES.sugar.progressGradient
              }
              extendedIndicatorClassName={CARD_THEMES.sugar.progressExtended}
              aria-label="Sugar intake progress"
            />
            <div className="flex flex-col items-end leading-tight">
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    sugarProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : CARD_THEMES.sugar.latestValueColor
                  )}
                >
                  {formatValue(Math.min(sugarTotal, sugarLimit))}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(sugarLimit)} g
                </span>
              </div>
              {sugarProgress.isOverTarget && sugarProgress.extendedTotal > 0 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    sugarProgress.isOverExtended
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {formatValue(sugarProgress.extendedCurrent)} /{" "}
                  {formatValue(sugarProgress.extendedTotal)} g extra
                </span>
              )}
            </div>
          </div>
          )}

          {/* Potassium — soft target, never reds out, optional tracker */}
          {potassiumEnabled && (
          <div className="flex items-center gap-3" data-testid="metrics-potassium-row">
            <Banana
              className={cn("w-4 h-4", CARD_THEMES.potassium.iconColor)}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground w-16">Potassium</span>
            <Progress
              value={potassiumPct}
              className="h-2 flex-1"
              indicatorClassName={CARD_THEMES.potassium.progressGradient}
              aria-label="Potassium intake progress"
            />
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                CARD_THEMES.potassium.latestValueColor
              )}
            >
              {formatValue(potassiumTotal)}
            </span>
            <span className="text-xs text-muted-foreground">
              / {formatValue(potassiumLimit)} mg
            </span>
          </div>
          )}

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

          {[
            { key: "water", label: "Water", data: weeklyWater, theme: CARD_THEMES.water, limit: waterLimit, buffer: waterExtendedBuffer, fmt: formatValue, show: true },
            { key: "salt", label: "Na", data: weeklySalt, theme: CARD_THEMES.salt, limit: saltLimit, buffer: saltExtendedBuffer, fmt: formatValue, show: true },
            { key: "sugar", label: "Sug", data: weeklySugar, theme: CARD_THEMES.sugar, limit: sugarLimit, buffer: sugarExtendedBuffer, fmt: formatValue, show: sugarEnabled },
            { key: "potassium", label: "K", data: weeklyPotassium, theme: CARD_THEMES.potassium, limit: 0, buffer: 0, fmt: formatValue, show: potassiumEnabled },
            { key: "caf", label: "Caf", data: weeklyCaffeine, theme: CARD_THEMES.caffeine, limit: 0, buffer: 0, fmt: (v: number) => formatValue(Math.round(v)), show: true },
            { key: "alc", label: "Alc", data: weeklyAlcohol, theme: CARD_THEMES.alcohol, limit: 0, buffer: 0, fmt: (v: number) => v.toFixed(1), show: true },
          ].filter((row) => row.show).map((row) => (
            <Fragment key={row.key}>
              <div className="text-xs text-muted-foreground">{row.label}</div>
              {row.data.map((val, i) => {
                const isFuture = i > todayIndex;
                const isToday = i === todayIndex;
                const isOverTarget = row.limit > 0 && val > row.limit;
                const isOverExtended =
                  row.limit > 0 && val > row.limit + row.buffer;
                const isInExtendedZone = isOverTarget && !isOverExtended;
                const hasData = val > 0;
                return (
                  <div
                    key={`${row.key}-${i}`}
                    className={cn(
                      "text-xs tabular-nums text-center",
                      isFuture && "text-muted-foreground/50",
                      isToday && "font-semibold",
                      !isFuture && hasData && !isOverTarget && row.theme.latestValueColor,
                      !isFuture && isInExtendedZone && "text-orange-600 dark:text-orange-400",
                      !isFuture && isOverExtended && "text-red-600 dark:text-red-400",
                      !isFuture && !hasData && "text-muted-foreground/50"
                    )}
                  >
                    {isFuture ? "---" : row.fmt(val)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
