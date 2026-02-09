"use client";

import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { GraphData } from "@/hooks/use-graph-data";
import type { IntakeRecord } from "@/lib/db";
import { COLORS, TOOLTIP_STYLE, CHART_MARGIN, MS_PER_DAY, formatTimeLabel } from "./chart-utils";

type IntakePoint = {
  time: number;
  waterPct: number | null;
  saltPct: number | null;
};

function buildIntakeChartData(
  data: GraphData,
  waterLimit: number,
  saltLimit: number
): IntakePoint[] {
  const { waterRecords, saltRecords, displayStartTime } = data;

  const allEvents: (IntakeRecord & { _kind: "water" | "salt" })[] = [
    ...waterRecords.map((r) => ({ ...r, _kind: "water" as const })),
    ...saltRecords.map((r) => ({ ...r, _kind: "salt" as const })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const visibleEvents = allEvents.filter((e) => e.timestamp >= displayStartTime);
  if (visibleEvents.length === 0) return [];

  function rolling24h(records: IntakeRecord[], atTime: number): number {
    const cutoff = atTime - MS_PER_DAY;
    return records
      .filter((r) => r.timestamp > cutoff && r.timestamp <= atTime)
      .reduce((s, r) => s + r.amount, 0);
  }

  const points: IntakePoint[] = [];

  for (const event of visibleEvents) {
    const ts = event.timestamp;
    const waterBefore = rolling24h(waterRecords.filter((r) => r.timestamp < ts), ts);
    const saltBefore = rolling24h(saltRecords.filter((r) => r.timestamp < ts), ts);
    const waterAfter = rolling24h(waterRecords, ts);
    const saltAfter = rolling24h(saltRecords, ts);

    points.push({
      time: ts - 1,
      waterPct: waterLimit > 0 ? (waterBefore / waterLimit) * 100 : 0,
      saltPct: saltLimit > 0 ? (saltBefore / saltLimit) * 100 : 0,
    });
    points.push({
      time: ts,
      waterPct: waterLimit > 0 ? (waterAfter / waterLimit) * 100 : 0,
      saltPct: saltLimit > 0 ? (saltAfter / saltLimit) * 100 : 0,
    });
  }

  return points;
}

const INTAKE_TOGGLE_OPTIONS = [
  { key: "water", label: "Water", color: COLORS.water },
  { key: "salt", label: "Salt", color: COLORS.salt },
  { key: "eating", label: "Eating", color: COLORS.eating },
  { key: "urination", label: "Urination", color: COLORS.urination },
] as const;

type IntakeToggleKey = (typeof INTAKE_TOGGLE_OPTIONS)[number]["key"];

export function IntakeChart({
  data,
  waterLimit,
  saltLimit,
  now,
}: {
  data: GraphData;
  waterLimit: number;
  saltLimit: number;
  now: number;
}) {
  const [toggles, setToggles] = useState<Record<IntakeToggleKey, boolean>>({
    water: true,
    salt: true,
    eating: true,
    urination: true,
  });

  const points = useMemo(
    () => buildIntakeChartData(data, waterLimit, saltLimit),
    [data, waterLimit, saltLimit]
  );

  const { eatingRecords, urinationRecords, scope } = data;

  // Full-scope X-axis: left edge = scope start, right edge = live "now"
  const xMin = data.startTime;
  const xMax = now;

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        No intake data in this range
      </div>
    );
  }

  const maxPct = Math.max(
    100,
    ...points.map((p) => p.waterPct ?? 0),
    ...points.map((p) => p.saltPct ?? 0)
  );
  const yMax = maxPct > 100 ? Math.ceil(maxPct / 10) * 10 + 10 : 100;

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
            domain={[0, yMax]}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            ticks={
              yMax <= 100
                ? [0, 25, 50, 75, 100]
                : [0, 25, 50, 75, 100, ...Array.from(
                    { length: Math.floor((yMax - 100) / 25) },
                    (_, i) => 125 + i * 25
                  )]
            }
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(ts) => formatTimeLabel(ts as number, scope)}
            formatter={(value: number, name: string) => [`${value.toFixed(0)}%`, name]}
          />
          <ReferenceLine
            y={100}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: "Target", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          {toggles.eating && eatingRecords.map((r) => (
            <ReferenceLine key={`eat-${r.id}`} x={r.timestamp} stroke={COLORS.eating} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {toggles.urination && urinationRecords.map((r) => (
            <ReferenceLine key={`urine-${r.id}`} x={r.timestamp} stroke={COLORS.urination} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {toggles.water && (
            <Line type="stepAfter" dataKey="waterPct" name="Water" stroke={COLORS.water} strokeWidth={2} dot={{ r: 3, fill: COLORS.water }} connectNulls isAnimationActive={false} />
          )}
          {toggles.salt && (
            <Line type="stepAfter" dataKey="saltPct" name="Salt" stroke={COLORS.salt} strokeWidth={2} dot={{ r: 3, fill: COLORS.salt }} connectNulls isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-2 mt-2">
        {INTAKE_TOGGLE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setToggles((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
            className={cn(
              "h-6 px-2 rounded text-[10px] font-medium transition-all border",
              toggles[opt.key]
                ? "text-white border-transparent"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            )}
            style={toggles[opt.key] ? { backgroundColor: opt.color } : undefined}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
