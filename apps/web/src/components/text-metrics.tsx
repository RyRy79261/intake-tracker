"use client";

import { Fragment, useMemo } from "react";
import {
  useDailyIntakeTotal,
  getDayStartTimestamp,
  useIntakeRecordsByDateRange,
} from "@/hooks/use-intake-queries";
import {
  useSubstanceRecordsByDateRange,
  useSubstanceRecordsSince,
} from "@/hooks/use-substance-queries";
import { useNowTick } from "@intake/ui/use-now-tick";
import { useSettingsStore } from "@/stores/settings-store";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { CARD_THEMES } from "@/lib/card-themes";
import { Progress, progressStatusTextClass } from "@intake/ui/progress";
import { computeTwoStageProgress, getProgressStatus } from "@intake/core/progress";
import { Droplets, Sparkles, Coffee, Wine, Candy, Banana } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalDateKey, weekDayOrder, weekDayPosition } from "@/lib/date-utils";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const DAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The calendar date a timestamp's logical day (starting at dayStartHour) belongs to. */
function logicalDate(timestamp: number, dayStartHour: number): Date {
  const d = new Date(timestamp);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * The logical week containing `now`, starting on `weekStartsOn` (0-6, JS
 * getDay): its seven day keys, the [start, end) timestamps to query, and
 * today's column. Days are calendar dates shifted by dayStartHour, and the end
 * is the next logical day start rather than start + 7 × 24h, so 23h/25h DST
 * days don't drop or borrow an hour.
 */
export function getLogicalWeek(now: Date, dayStartHour: number, weekStartsOn: number) {
  const today = logicalDate(now.getTime(), dayStartHour);
  const todayIndex = weekDayPosition(today.getDay(), weekStartsOn);

  const first = new Date(today);
  first.setDate(today.getDate() - todayIndex);
  first.setHours(dayStartHour, 0, 0, 0);

  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    dayKeys.push(toLocalDateKey(d));
  }

  const next = new Date(first);
  next.setDate(first.getDate() + 7);
  next.setHours(dayStartHour, 0, 0, 0);

  return { start: first.getTime(), end: next.getTime(), dayKeys, todayIndex };
}

function formatValue(value: number): string {
  // Summed totals can carry float noise (0.1 + 0.2); show at most one decimal.
  return (Math.round(value * 10) / 10).toLocaleString();
}

/** One-letter column headers for a week starting on `weekStartsOn`. */
function dayHeaders(weekStartsOn: number): string[] {
  return weekDayOrder(weekStartsOn).map((d) => DAY_LETTERS[d]!);
}

/** "Mon-Sun" for a week starting on `weekStartsOn`. */
function weekLabel(weekStartsOn: number): string {
  const order = weekDayOrder(weekStartsOn);
  return `${DAY_ABBREVIATIONS[order[0]!]}-${DAY_ABBREVIATIONS[order[6]!]}`;
}

/** Sum records into the week's columns by the logical day each belongs to. */
export function bucketByLogicalDay<T extends { timestamp: number }>(
  records: T[], dayKeys: string[], dayStartHour: number, accessor: (r: T) => number
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const r of records) {
    const i = dayKeys.indexOf(toLocalDateKey(logicalDate(r.timestamp, dayStartHour)));
    if (i >= 0) buckets[i] = (buckets[i] ?? 0) + accessor(r);
  }
  return buckets;
}

export function TextMetrics() {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
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

  // Today's substance totals (end bound is "now" at query time, so a new
  // entry shows immediately rather than after the next minute tick)
  const caffeineRecords = useSubstanceRecordsSince(dayStart, "caffeine");
  const alcoholRecords = useSubstanceRecordsSince(dayStart, "alcohol");

  const caffeineTotal = useMemo(
    () => caffeineRecords.reduce((sum, r) => sum + (r.amountMg ?? 0), 0),
    [caffeineRecords]
  );
  const alcoholTotal = useMemo(
    () => alcoholRecords.reduce((sum, r) => sum + (r.amountStandardDrinks ?? 0), 0),
    [alcoholRecords]
  );

  // Weekly data
  const week = useMemo(
    () => getLogicalWeek(new Date(), dayStartHour, weekStartsOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayStartHour, weekStartsOn, tick]
  );
  const dayHeaderLetters = useMemo(() => dayHeaders(weekStartsOn), [weekStartsOn]);
  const { start: weekStart, end: weekEnd, dayKeys, todayIndex } = week;

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
  const weeklyWater = useMemo(() => bucketByLogicalDay(weeklyWaterRecords, dayKeys, dayStartHour, (r) => r.amount), [weeklyWaterRecords, dayKeys, dayStartHour]);
  const weeklySalt = useMemo(() => bucketByLogicalDay(weeklySaltRecords, dayKeys, dayStartHour, (r) => r.amount), [weeklySaltRecords, dayKeys, dayStartHour]);
  const weeklySugar = useMemo(() => bucketByLogicalDay(weeklySugarRecords, dayKeys, dayStartHour, (r) => r.amount), [weeklySugarRecords, dayKeys, dayStartHour]);
  const weeklyPotassium = useMemo(() => bucketByLogicalDay(weeklyPotassiumRecords, dayKeys, dayStartHour, (r) => r.amount), [weeklyPotassiumRecords, dayKeys, dayStartHour]);
  const weeklyCaffeine = useMemo(() => bucketByLogicalDay(weeklyCaffeineRecords, dayKeys, dayStartHour, (r) => r.amountMg ?? 0), [weeklyCaffeineRecords, dayKeys, dayStartHour]);
  const weeklyAlcohol = useMemo(() => bucketByLogicalDay(weeklyAlcoholRecords, dayKeys, dayStartHour, (r) => r.amountStandardDrinks ?? 0), [weeklyAlcoholRecords, dayKeys, dayStartHour]);

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
                    "text-sm font-semibold num",
                    progressStatusTextClass(
                      waterProgress.status,
                      CARD_THEMES.water.latestValueColor
                    )
                  )}
                >
                  {formatValue(waterTotal)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(waterLimit)} ml
                </span>
              </div>
              {waterProgress.isOverTarget && (
                <span
                  className={cn(
                    "text-xs num",
                    progressStatusTextClass(waterProgress.status, "text-muted-foreground")
                  )}
                >
                  {waterProgress.extendedTotal > 0 ? (
                    <>
                      {formatValue(waterProgress.extendedCurrent)} /{" "}
                      {formatValue(waterProgress.extendedTotal)} ml
                    </>
                  ) : (
                    <>{formatValue(waterProgress.extendedCurrent)} ml over</>
                  )}
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
                  data-testid="today-sodium-value"
                  className={cn(
                    "text-sm font-semibold num",
                    progressStatusTextClass(
                      saltProgress.status,
                      CARD_THEMES.salt.latestValueColor
                    )
                  )}
                >
                  {formatValue(saltTotal)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(saltLimit)} mg
                </span>
              </div>
              {saltProgress.isOverTarget && (
                <span
                  className={cn(
                    "text-xs num",
                    progressStatusTextClass(saltProgress.status, "text-muted-foreground")
                  )}
                >
                  {saltProgress.extendedTotal > 0 ? (
                    <>
                      {formatValue(saltProgress.extendedCurrent)} /{" "}
                      {formatValue(saltProgress.extendedTotal)} mg
                    </>
                  ) : (
                    <>{formatValue(saltProgress.extendedCurrent)} mg over</>
                  )}
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
                    "text-sm font-semibold num",
                    progressStatusTextClass(
                      sugarProgress.status,
                      CARD_THEMES.sugar.latestValueColor
                    )
                  )}
                >
                  {formatValue(sugarTotal)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {formatValue(sugarLimit)} g
                </span>
              </div>
              {sugarProgress.isOverTarget && (
                <span
                  className={cn(
                    "text-xs num",
                    progressStatusTextClass(sugarProgress.status, "text-muted-foreground")
                  )}
                >
                  {sugarProgress.extendedTotal > 0 ? (
                    <>
                      {formatValue(sugarProgress.extendedCurrent)} /{" "}
                      {formatValue(sugarProgress.extendedTotal)} g
                    </>
                  ) : (
                    <>{formatValue(sugarProgress.extendedCurrent)} g over</>
                  )}
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
                "text-sm font-semibold num",
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
                "text-sm font-semibold num",
                caffeineTotal === 0
                  ? "text-muted-foreground"
                  : CARD_THEMES.caffeine.latestValueColor
              )}
            >
              {formatValue(caffeineTotal)} mg
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
                "text-sm font-semibold num",
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
          {`This Week (${weekLabel(weekStartsOn)})`}
        </h2>
        <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-x-1 gap-y-1">
          {/* Day headers row */}
          <div /> {/* Empty first cell */}
          {dayHeaderLetters.map((day, i) => (
            <div
              key={`header-${i}`}
              data-testid="week-day-header"
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
                const status = getProgressStatus(val, row.limit, row.buffer);
                const hasData = val > 0;
                return (
                  <div
                    key={`${row.key}-${i}`}
                    className={cn(
                      "text-xs num text-center",
                      isFuture && "text-muted-foreground/50",
                      isToday && "font-semibold",
                      !isFuture && hasData && progressStatusTextClass(status, row.theme.latestValueColor),
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
