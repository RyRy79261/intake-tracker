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
import type { GraphData } from "@/hooks/use-graph-data";
import { COLORS, TOOLTIP_STYLE, CHART_MARGIN, formatTimeLabel } from "./chart-utils";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

type WeightPoint = {
  time: number;
  weight: number;
};

interface LegendToggle {
  key: string;
  label: string;
  color: string;
  enabled: boolean;
}

export function WeightChart({ data, now }: { data: GraphData; now: number }) {
  const { weightRecords, eatingRecords, urinationRecords, defecationRecords, waterRecords, scope } = data;
  const settings = useSettings();

  // Toggle states initialized from settings
  const [showEating, setShowEating] = useState(settings.weightGraphShowEating);
  const [showUrination, setShowUrination] = useState(settings.weightGraphShowUrination);
  const [showDefecation, setShowDefecation] = useState(settings.weightGraphShowDefecation);
  const [showDrinking, setShowDrinking] = useState(settings.weightGraphShowDrinking);

  const points: WeightPoint[] = useMemo(
    () =>
      [...weightRecords]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((r) => ({ time: r.timestamp, weight: r.weight })),
    [weightRecords]
  );

  // Filter water records to visible range for drinking lines
  const visibleWaterRecords = useMemo(
    () => waterRecords.filter((r) => r.timestamp >= data.startTime && r.timestamp <= now),
    [waterRecords, data.startTime, now]
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

  const toggles: LegendToggle[] = [
    { key: "eating", label: "Eating", color: COLORS.eating, enabled: showEating },
    { key: "urination", label: "Urination", color: COLORS.urination, enabled: showUrination },
    { key: "defecation", label: "Defecation", color: COLORS.defecation, enabled: showDefecation },
    { key: "drinking", label: "Drinking", color: COLORS.drinking, enabled: showDrinking },
  ];

  const handleToggle = (key: string) => {
    switch (key) {
      case "eating": setShowEating((v) => !v); break;
      case "urination": setShowUrination((v) => !v); break;
      case "defecation": setShowDefecation((v) => !v); break;
      case "drinking": setShowDrinking((v) => !v); break;
    }
  };

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
          {showEating && eatingRecords.map((r) => (
            <ReferenceLine key={`eat-${r.id}`} x={r.timestamp} stroke={COLORS.eating} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {showUrination && urinationRecords.map((r) => (
            <ReferenceLine key={`urine-${r.id}`} x={r.timestamp} stroke={COLORS.urination} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {showDefecation && defecationRecords.map((r) => (
            <ReferenceLine key={`defec-${r.id}`} x={r.timestamp} stroke={COLORS.defecation} strokeWidth={1.5} strokeDasharray="4 2" />
          ))}
          {showDrinking && visibleWaterRecords.map((r) => (
            <ReferenceLine key={`drink-${r.id}`} x={r.timestamp} stroke={COLORS.drinking} strokeWidth={1} strokeDasharray="2 3" />
          ))}
          <Line type="monotone" dataKey="weight" name="Weight" stroke={COLORS.weight} strokeWidth={2} dot={{ r: 4, fill: COLORS.weight }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {/* Clickable legend toggles */}
      <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
        {toggles.map((t) => (
          <button
            key={t.key}
            onClick={() => handleToggle(t.key)}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-all border",
              t.enabled
                ? "border-border bg-muted/50 text-foreground"
                : "border-transparent bg-transparent text-muted-foreground/50 line-through"
            )}
          >
            <span
              className="w-3 h-0.5 inline-block rounded-full"
              style={{ backgroundColor: t.enabled ? t.color : "currentColor" }}
            />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
