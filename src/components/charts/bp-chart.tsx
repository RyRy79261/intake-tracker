"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphData, GraphScope } from "@/hooks/use-graph-data";
import type { BloodPressureRecord } from "@/lib/db";
import { COLORS, TOOLTIP_STYLE, CHART_MARGIN, formatTimeLabel } from "./chart-utils";

// ── BP Toggle types ──────────────────────────────────────────

type BPToggleKey = `${"left" | "right"}-${"sitting" | "standing"}-${"systolic" | "diastolic" | "heartRate"}`;

const BP_DEFAULTS: Record<BPToggleKey, boolean> = {
  "left-sitting-systolic": true,
  "left-sitting-diastolic": true,
  "left-sitting-heartRate": false,
  "left-standing-systolic": false,
  "left-standing-diastolic": false,
  "left-standing-heartRate": false,
  "right-sitting-systolic": false,
  "right-sitting-diastolic": false,
  "right-sitting-heartRate": false,
  "right-standing-systolic": false,
  "right-standing-diastolic": false,
  "right-standing-heartRate": false,
};

const BP_STORAGE_KEY = "intake-tracker-bp-toggles";

function loadBPToggles(): Record<BPToggleKey, boolean> {
  try {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(BP_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const result = { ...BP_DEFAULTS };
        for (const key of Object.keys(BP_DEFAULTS) as BPToggleKey[]) {
          if (key in parsed && typeof parsed[key] === "boolean") {
            result[key] = parsed[key];
          }
        }
        return result;
      }
    }
  } catch { /* ignore */ }
  return { ...BP_DEFAULTS };
}

function saveBPToggles(toggles: Record<BPToggleKey, boolean>) {
  try { localStorage.setItem(BP_STORAGE_KEY, JSON.stringify(toggles)); } catch { /* ignore */ }
}

function getBPLineColor(metric: "systolic" | "diastolic" | "heartRate", position: "sitting" | "standing"): string {
  if (position === "sitting") {
    if (metric === "systolic") return COLORS.systolic;
    if (metric === "diastolic") return COLORS.diastolicColor;
    return COLORS.heartRate;
  }
  if (metric === "systolic") return COLORS.systolicLight;
  if (metric === "diastolic") return COLORS.diastolicLight;
  return COLORS.heartRateLight;
}

function getBPLineDash(arm: "left" | "right"): string | undefined {
  return arm === "right" ? "6 3" : undefined;
}

// ── BP chart data builder ────────────────────────────────────

type BPPoint = {
  time: number;
  timeLabel: string;
  [key: string]: number | string | null;
};

function buildBPChartData(
  records: BloodPressureRecord[],
  toggles: Record<BPToggleKey, boolean>,
  scope: GraphScope
): { points: BPPoint[]; activeKeys: { key: string; color: string; dash?: string; label: string }[] } {
  const activeToggles = (Object.entries(toggles) as [BPToggleKey, boolean][]).filter(([, v]) => v);
  if (activeToggles.length === 0) return { points: [], activeKeys: [] };

  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const activeKeys: { key: string; color: string; dash?: string; label: string }[] = [];

  for (const [toggleKey] of activeToggles) {
    const [arm, position, metric] = toggleKey.split("-") as ["left" | "right", "sitting" | "standing", "systolic" | "diastolic" | "heartRate"];
    const armLabel = arm === "left" ? "L" : "R";
    const posLabel = position === "sitting" ? "Sit" : "Stand";
    const metricLabel = metric === "systolic" ? "Sys" : metric === "diastolic" ? "Dia" : "HR";
    const dash = getBPLineDash(arm);
    activeKeys.push({
      key: toggleKey,
      color: getBPLineColor(metric, position),
      ...(dash !== undefined && { dash }),
      label: `${armLabel} ${posLabel} ${metricLabel}`,
    });
  }

  const points: BPPoint[] = sorted.map((r) => {
    const p: BPPoint = { time: r.timestamp, timeLabel: formatTimeLabel(r.timestamp, scope) };
    for (const [toggleKey] of activeToggles) {
      const [arm, position, metric] = toggleKey.split("-") as ["left" | "right", "sitting" | "standing", "systolic" | "diastolic" | "heartRate"];
      if (r.arm === arm && r.position === position) {
        p[toggleKey] = metric === "heartRate" ? (r.heartRate ?? null) : r[metric];
      } else {
        p[toggleKey] = null;
      }
    }
    return p;
  });

  return { points, activeKeys };
}

// ── BP Filter Panel ──────────────────────────────────────────

function BPFilterPanel({
  toggles,
  onToggle,
}: {
  toggles: Record<BPToggleKey, boolean>;
  onToggle: (key: BPToggleKey) => void;
}) {
  const arms: ("left" | "right")[] = ["left", "right"];
  const positions: ("standing" | "sitting")[] = ["standing", "sitting"];
  const metrics: ("systolic" | "diastolic" | "heartRate")[] = ["systolic", "diastolic", "heartRate"];

  function metricIcon(m: "systolic" | "diastolic" | "heartRate") {
    if (m === "systolic") return <span className="font-bold text-[10px]">S</span>;
    if (m === "diastolic") return <span className="font-bold text-[10px]">D</span>;
    return <HeartPulse className="w-3 h-3" />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      {arms.map((arm) => (
        <div key={arm} className="space-y-1.5">
          <p className="text-[10px] font-semibold text-center text-muted-foreground uppercase tracking-wider">
            {arm === "left" ? "Left Arm" : "Right Arm"}
          </p>
          {positions.map((pos) => (
            <div key={pos} className="flex items-center gap-1">
              <span className="text-[9px] w-8 text-muted-foreground shrink-0">
                {pos === "standing" ? "Stand" : "Sit"}
              </span>
              <div className="flex gap-1">
                {metrics.map((m) => {
                  const k = `${arm}-${pos}-${m}` as BPToggleKey;
                  const active = toggles[k];
                  const lineColor = getBPLineColor(m, pos);
                  return (
                    <button
                      key={k}
                      onClick={() => onToggle(k)}
                      className={cn(
                        "w-7 h-7 rounded flex items-center justify-center transition-all border",
                        active ? "text-white border-transparent" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      )}
                      style={active ? { backgroundColor: lineColor } : undefined}
                      title={`${arm} ${pos} ${m}`}
                    >
                      {metricIcon(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── BPChart ──────────────────────────────────────────────────

export function BPChart({ data, now }: { data: GraphData; now: number }) {
  const [toggles, setToggles] = useState<Record<BPToggleKey, boolean>>({ ...BP_DEFAULTS });

  useEffect(() => {
    setToggles(loadBPToggles());
  }, []);

  const handleToggle = useCallback((key: BPToggleKey) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveBPToggles(next);
      return next;
    });
  }, []);

  const { points, activeKeys } = useMemo(
    () => buildBPChartData(data.bloodPressureRecords, toggles, data.scope),
    [data.bloodPressureRecords, toggles, data.scope]
  );

  const yDomain = useMemo<[number, number]>(() => {
    const allValues = points.flatMap((p) =>
      activeKeys.map((k) => p[k.key]).filter((v): v is number => typeof v === "number")
    );
    if (allValues.length === 0) return [40, 120];
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    return [Math.min(40, dataMin - 5), Math.max(120, dataMax + 5)];
  }, [points, activeKeys]);

  // Full-scope X-axis: left edge = scope start, right edge = live "now"
  const xMin = data.startTime;
  const xMax = now;

  const hasActiveToggles = activeKeys.length > 0;
  const hasData = data.bloodPressureRecords.length > 0;

  return (
    <div>
      {!hasData ? (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          No blood pressure data in this range
        </div>
      ) : !hasActiveToggles ? (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          Toggle metrics below to display
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[xMin, xMax]}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(ts) => formatTimeLabel(ts, data.scope)}
            />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={yDomain} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(ts) => formatTimeLabel(ts as number, data.scope)}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {activeKeys.map(({ key, color, dash, label }) => (
              <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2} strokeDasharray={dash} dot={{ r: 3, fill: color }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <BPFilterPanel toggles={toggles} onToggle={handleToggle} />
    </div>
  );
}
