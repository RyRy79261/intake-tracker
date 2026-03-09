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
  ScatterChart,
  Scatter,
} from "recharts";
import type { CorrelationResult } from "@/lib/analytics-types";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Chart modes
// ---------------------------------------------------------------------------

/**
 * Time-series overlay: two lines on dual Y-axes.
 * Used when both series have timestamps that align to dates.
 */
function TimeSeriesOverlay({
  result,
  labelA,
  labelB,
  unitA,
  unitB,
}: CorrelationChartProps) {
  const merged = useMemo(() => {
    const map = new Map<string, { date: string; time: number; a?: number; b?: number }>();

    for (const pt of result.seriesA) {
      const key = formatDate(pt.timestamp);
      const existing = map.get(key);
      if (existing) {
        existing.a = pt.value;
      } else {
        map.set(key, { date: key, time: pt.timestamp, a: pt.value });
      }
    }
    for (const pt of result.seriesB) {
      const key = formatDate(pt.timestamp);
      const existing = map.get(key);
      if (existing) {
        existing.b = pt.value;
      } else {
        map.set(key, { date: key, time: pt.timestamp, b: pt.value });
      }
    }

    return Array.from(map.values()).sort((x, y) => x.time - y.time);
  }, [result.seriesA, result.seriesB]);

  return (
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
  );
}

/**
 * Scatter plot: seriesA values as X, seriesB values as Y.
 * Used when data doesn't align well to time-series overlay.
 */
function ScatterPlot({
  result,
  labelA,
  labelB,
  unitA,
  unitB,
}: CorrelationChartProps) {
  const points = useMemo(() => {
    const len = Math.min(result.seriesA.length, result.seriesB.length);
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < len; i++) {
      const a = result.seriesA[i];
      const b = result.seriesB[i];
      if (a && b) {
        pts.push({ x: a.value, y: b.value });
      }
    }
    return pts;
  }, [result.seriesA, result.seriesB]);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="x"
          type="number"
          name={labelA}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}${unitA}`}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={labelB}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}${unitB}`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [
            `${value} ${name === labelA ? unitA : unitB}`,
            name,
          ]}
        />
        <Scatter
          name={`${labelA} vs ${labelB}`}
          data={points}
          fill="hsl(199 89% 48%)"
          opacity={0.7}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CorrelationChart(props: CorrelationChartProps) {
  const { result } = props;

  // Empty state
  if (result.seriesA.length < 2 || result.seriesB.length < 2) {
    return (
      <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
        Insufficient data for correlation
      </div>
    );
  }

  // Choose chart type: time-series overlay when lag is used or series are time-aligned
  const useOverlay = result.lagDays > 0 || result.seriesA.length > 5;

  return (
    <div className="space-y-2">
      {useOverlay ? (
        <TimeSeriesOverlay {...props} />
      ) : (
        <ScatterPlot {...props} />
      )}

      {/* Correlation stats */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn("font-mono font-medium", coefficientColor(result.coefficient, result.strength))}>
            r = {result.coefficient.toFixed(2)}
          </span>
          <span className="text-muted-foreground">
            {strengthLabel(result.coefficient, result.strength)}
          </span>
        </div>
        {result.lagDays > 0 && (
          <span className="text-muted-foreground">
            with {result.lagDays}-day lag
          </span>
        )}
      </div>
    </div>
  );
}
