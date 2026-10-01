"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { CorrelationResult, DataPoint } from "@intake/types/analytics";
import { toLocalDateKey } from "@/lib/date-utils";
import {
  AXIS_PROPS,
  AXIS_TICK,
  CHART_COLOR,
  GRID_PROPS,
  TOOLTIP_PROPS,
  squareDot,
} from "@/components/analytics/chart-theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CorrelationChartProps {
  result: CorrelationResult;
  labelA: string;
  labelB: string;
  unitA: string;
  unitB: string;
}

// Minimum overlapping days for a Pearson coefficient to be meaningful.
const MIN_PAIRED_DAYS = 3;

/** Y axis width for "1234mmHg"-style ticks (10px mono is ~6px a glyph), so they never wrap. */
const axisWidth = (unit: string) => Math.round(32 + unit.trim().length * 6.5);

const SERIES_DOT = squareDot(6);
const ACTIVE_DOT = squareDot(8);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strengthLabel(
  coefficient: number,
  strength: CorrelationResult["strength"],
): string {
  const direction = coefficient >= 0 ? "positive" : "negative";
  if (strength === "none") return "No correlation";
  return `${strength.charAt(0).toUpperCase()}${strength.slice(1)} ${direction}`;
}

function coefficientColor(
  coefficient: number,
  strength: CorrelationResult["strength"],
): string {
  if (strength === "none" || strength === "weak") return CHART_COLOR.muted;
  if (coefficient > 0) return CHART_COLOR.weight;
  return CHART_COLOR.bp;
}

function dayKey(ts: number): string {
  return toLocalDateKey(ts);
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Time-series overlay of two health domains on dual Y-axes. Both series are
 * aggregated to one value per calendar day (mean) so a day with several events
 * is represented once — consistent with the day-aligned Pearson coefficient.
 */
export function CorrelationChart({
  result,
  labelA,
  labelB,
  unitA,
  unitB,
}: CorrelationChartProps) {
  // Aggregate each series to a daily mean, then merge on the day key.
  const merged = useMemo(() => {
    const dailyMean = (points: DataPoint[]) => {
      const groups = new Map<string, { time: number; vals: number[] }>();
      for (const p of points) {
        const key = dayKey(p.timestamp);
        const g = groups.get(key);
        if (g) {
          g.vals.push(p.value);
        } else {
          groups.set(key, { time: p.timestamp, vals: [p.value] });
        }
      }
      return groups;
    };

    const mapA = dailyMean(result.seriesA);
    const mapB = dailyMean(result.seriesB);
    const keys = new Set([...mapA.keys(), ...mapB.keys()]);

    const rows = Array.from(keys).map((key) => {
      const a = mapA.get(key);
      const b = mapB.get(key);
      const time = a?.time ?? b?.time ?? 0;
      const avg = (g?: { vals: number[] }) =>
        g ? g.vals.reduce((s, v) => s + v, 0) / g.vals.length : undefined;
      return { date: shortDate(time), time, a: avg(a), b: avg(b) };
    });

    return rows.sort((x, y) => x.time - y.time);
  }, [result.seriesA, result.seriesB]);

  if (result.seriesA.length === 0 || result.seriesB.length === 0) {
    return <div className="wm-nodata">Not enough data to compare</div>;
  }

  const insufficient = result.pairedDays < MIN_PAIRED_DAYS;

  return (
    <>
      <div className="wm-chart">
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={merged} margin={{ top: 8, right: 2, left: 2, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="date" {...AXIS_PROPS} padding={{ left: 12, right: 12 }} />
            <YAxis
              yAxisId="left"
              {...AXIS_PROPS}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: CHART_COLOR.water }}
              width={axisWidth(unitA)}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v}${unitA.trim()}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              {...AXIS_PROPS}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: CHART_COLOR.bp }}
              width={axisWidth(unitB)}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v}${unitB.trim()}`}
            />
            <Tooltip {...TOOLTIP_PROPS} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="a"
              name={labelA}
              stroke={CHART_COLOR.water}
              strokeWidth={2}
              dot={SERIES_DOT}
              activeDot={ACTIVE_DOT}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="b"
              name={labelB}
              stroke={CHART_COLOR.bp}
              strokeWidth={2}
              dot={SERIES_DOT}
              activeDot={ACTIVE_DOT}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Correlation stats */}
      <div className="wm-stats">
        {insufficient ? (
          <span className="text-muted-foreground">
            Not enough overlapping days to correlate ({result.pairedDays}/{MIN_PAIRED_DAYS})
          </span>
        ) : (
          <>
            <span
              className="num font-semibold"
              style={{ color: coefficientColor(result.coefficient, result.strength) }}
            >
              r = {result.coefficient.toFixed(2)}
            </span>
            <span>{strengthLabel(result.coefficient, result.strength)}</span>
            <span className="text-muted-foreground">· {result.pairedDays} days</span>
          </>
        )}
        {result.lagDays > 0 && (
          <span className="lag">with {result.lagDays}-day lag</span>
        )}
      </div>
    </>
  );
}
