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
import type { CorrelationResult, DataPoint } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

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

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

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
  if (strength === "none" || strength === "weak") return "text-muted-foreground";
  if (coefficient > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-rose-600 dark:text-rose-400";
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    return (
      <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
        Not enough data to compare
      </div>
    );
  }

  const insufficient = result.pairedDays < MIN_PAIRED_DAYS;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={merged} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}${unitA}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}${unitB}`}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="a"
            name={labelA}
            stroke="hsl(199 89% 48%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="b"
            name={labelB}
            stroke="hsl(346 77% 50%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Correlation stats */}
      <div className="flex items-center justify-between px-1 text-xs">
        {insufficient ? (
          <span className="text-muted-foreground">
            Not enough overlapping days to correlate ({result.pairedDays}/{MIN_PAIRED_DAYS})
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-mono font-medium",
                coefficientColor(result.coefficient, result.strength),
              )}
            >
              r = {result.coefficient.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              {strengthLabel(result.coefficient, result.strength)}
            </span>
            <span className="text-muted-foreground">· {result.pairedDays} days</span>
          </div>
        )}
        {result.lagDays > 0 && (
          <span className="text-muted-foreground">with {result.lagDays}-day lag</span>
        )}
      </div>
    </div>
  );
}
