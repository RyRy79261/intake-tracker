"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { GraphData } from "@/hooks/use-graph-data";
import { COLORS, TOOLTIP_STYLE, CHART_MARGIN, formatTimeLabel } from "./chart-utils";

type WeightPoint = {
  time: number;
  weight: number;
};

export function WeightChart({ data, now }: { data: GraphData; now: number }) {
  const { weightRecords, eatingRecords, urinationRecords, scope } = data;

  const points: WeightPoint[] = useMemo(
    () =>
      [...weightRecords]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((r) => ({ time: r.timestamp, weight: r.weight })),
    [weightRecords]
  );

  // Full-scope X-axis: left edge = scope start, right edge = live "now"
  const xMin = data.startTime;
  const xMax = now;

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        No weight data in this range
      </div>
    );
  }

  const weights = points.map((p) => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const yMin = Math.floor(minW) - 1;
  const yMax = Math.ceil(maxW) + 1;
  const yTicks = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i);

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="time"
            type="number"
            domain={[xMin, xMax]}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(ts) => formatTimeLabel(ts, scope)}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}kg`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(ts) => formatTimeLabel(ts as number, scope)}
            formatter={(value: number) => [`${value} kg`, "Weight"]}
          />
          {eatingRecords.map((r) => (
            <ReferenceLine key={`eat-${r.id}`} x={r.timestamp} stroke={COLORS.eating} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {urinationRecords.map((r) => (
            <ReferenceLine key={`urine-${r.id}`} x={r.timestamp} stroke={COLORS.urination} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          <Line type="monotone" dataKey="weight" name="Weight" stroke={COLORS.weight} strokeWidth={2} dot={{ r: 4, fill: COLORS.weight }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: COLORS.eating }} />
          Eating
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: COLORS.urination }} />
          Urination
        </span>
      </div>
    </div>
  );
}
