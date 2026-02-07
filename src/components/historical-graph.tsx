"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Loader2,
  BarChart3,
  Droplets,
  Scale,
  Heart,
  HeartPulse,
} from "lucide-react";
import { useGraphData, type GraphScope, type GraphData } from "@/hooks/use-graph-data";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type { IntakeRecord, BloodPressureRecord } from "@/lib/db";

// ============================================================================
// Shared constants
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ViewType = "intake" | "weight" | "bp";

const COLORS = {
  water: "hsl(199 89% 48%)",
  salt: "hsl(38 92% 50%)",
  weight: "hsl(160 84% 39%)",
  eating: "hsl(25 95% 53%)",
  urination: "hsl(263 70% 50%)",
  // BP color matrix
  systolic: "hsl(346 77% 50%)",
  diastolicColor: "hsl(330 65% 55%)",
  heartRate: "hsl(15 80% 50%)",
  // lighter variants for standing
  systolicLight: "hsl(346 77% 65%)",
  diastolicLight: "hsl(330 65% 70%)",
  heartRateLight: "hsl(15 80% 65%)",
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

/** Shared left/right/top/bottom margins for all charts */
const CHART_MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };

function formatTimeLabel(ts: number, scope: GraphScope): string {
  const d = new Date(ts);
  if (scope === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ============================================================================
// 1. Intake Chart — buzz-saw, normalized 0-100% with toggles
// ============================================================================

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

  // Merge all intake records, tagged by type — but only plot events in the
  // visible range. The full records (including lookback) are used for rolling totals.
  const allEvents: (IntakeRecord & { _kind: "water" | "salt" })[] = [
    ...waterRecords.map((r) => ({ ...r, _kind: "water" as const })),
    ...saltRecords.map((r) => ({ ...r, _kind: "salt" as const })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Only plot events within the visible display range
  const visibleEvents = allEvents.filter((e) => e.timestamp >= displayStartTime);

  if (visibleEvents.length === 0) return [];

  // Helper: rolling 24h total at a given moment for a type
  function rolling24h(records: IntakeRecord[], atTime: number): number {
    const cutoff = atTime - MS_PER_DAY;
    return records
      .filter((r) => r.timestamp > cutoff && r.timestamp <= atTime)
      .reduce((s, r) => s + r.amount, 0);
  }

  const points: IntakePoint[] = [];

  for (const event of visibleEvents) {
    const ts = event.timestamp;

    // Point BEFORE this event (rolling total excluding this record)
    const waterBefore = rolling24h(
      waterRecords.filter((r) => r.timestamp < ts),
      ts
    );
    const saltBefore = rolling24h(
      saltRecords.filter((r) => r.timestamp < ts),
      ts
    );

    // Point AFTER this event (rolling total including this record)
    const waterAfter = rolling24h(waterRecords, ts);
    const saltAfter = rolling24h(saltRecords, ts);

    // "Before" point
    points.push({
      time: ts - 1,
      waterPct: waterLimit > 0 ? (waterBefore / waterLimit) * 100 : 0,
      saltPct: saltLimit > 0 ? (saltBefore / saltLimit) * 100 : 0,
    });

    // "After" point (the step up)
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

function IntakeChart({
  data,
  waterLimit,
  saltLimit,
}: {
  data: GraphData;
  waterLimit: number;
  saltLimit: number;
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

  // Compute X domain from intake points + event timestamps
  const allTimestamps = [
    ...points.map((p) => p.time),
    ...(toggles.eating ? eatingRecords.map((r) => r.timestamp) : []),
    ...(toggles.urination ? urinationRecords.map((r) => r.timestamp) : []),
  ];
  const xMin = Math.min(...allTimestamps);
  const xMax = Math.max(...allTimestamps);

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
          {/* Eating event vertical lines */}
          {toggles.eating && eatingRecords.map((r) => (
            <ReferenceLine
              key={`eat-${r.id}`}
              x={r.timestamp}
              stroke={COLORS.eating}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          ))}
          {/* Urination event vertical lines */}
          {toggles.urination && urinationRecords.map((r) => (
            <ReferenceLine
              key={`urine-${r.id}`}
              x={r.timestamp}
              stroke={COLORS.urination}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          ))}
          {toggles.water && (
            <Line
              type="stepAfter"
              dataKey="waterPct"
              name="Water"
              stroke={COLORS.water}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.water }}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {toggles.salt && (
            <Line
              type="stepAfter"
              dataKey="saltPct"
              name="Salt"
              stroke={COLORS.salt}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.salt }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {/* Toggle panel */}
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

// ============================================================================
// 2. Weight Chart — weight line + eating/urination vertical lines
//    Uses numeric X-axis so ReferenceLines can be drawn at arbitrary timestamps
// ============================================================================

type WeightPoint = {
  time: number;
  weight: number;
};

function WeightChart({ data }: { data: GraphData }) {
  const { weightRecords, eatingRecords, urinationRecords, scope } = data;

  const points: WeightPoint[] = useMemo(
    () =>
      [...weightRecords]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((r) => ({
          time: r.timestamp,
          weight: r.weight,
        })),
    [weightRecords]
  );

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
  const yDomain: [number, number] = [
    Math.floor(minW - 1),
    Math.ceil(maxW + 1),
  ];

  // Compute X domain from all timestamps (weight, eating, urination)
  const allTimestamps = [
    ...points.map((p) => p.time),
    ...eatingRecords.map((r) => r.timestamp),
    ...urinationRecords.map((r) => r.timestamp),
  ];
  const xMin = Math.min(...allTimestamps);
  const xMax = Math.max(...allTimestamps);

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
            domain={yDomain}
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
          {/* Eating event vertical lines */}
          {eatingRecords.map((r) => (
            <ReferenceLine
              key={`eat-${r.id}`}
              x={r.timestamp}
              stroke={COLORS.eating}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          ))}
          {/* Urination event vertical lines */}
          {urinationRecords.map((r) => (
            <ReferenceLine
              key={`urine-${r.id}`}
              x={r.timestamp}
              stroke={COLORS.urination}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          ))}
          <Line
            type="monotone"
            dataKey="weight"
            name="Weight"
            stroke={COLORS.weight}
            strokeWidth={2}
            dot={{ r: 4, fill: COLORS.weight }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {/* Legend for event lines */}
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

// ============================================================================
// 3. Blood Pressure Chart + Filter Panel
// ============================================================================

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
      if (stored) return { ...BP_DEFAULTS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...BP_DEFAULTS };
}

function saveBPToggles(toggles: Record<BPToggleKey, boolean>) {
  try {
    localStorage.setItem(BP_STORAGE_KEY, JSON.stringify(toggles));
  } catch {
    // ignore storage errors
  }
}

function getBPLineColor(metric: "systolic" | "diastolic" | "heartRate", position: "sitting" | "standing"): string {
  if (position === "sitting") {
    if (metric === "systolic") return COLORS.systolic;
    if (metric === "diastolic") return COLORS.diastolicColor;
    return COLORS.heartRate;
  }
  // Standing = lighter variants
  if (metric === "systolic") return COLORS.systolicLight;
  if (metric === "diastolic") return COLORS.diastolicLight;
  return COLORS.heartRateLight;
}

function getBPLineDash(arm: "left" | "right"): string | undefined {
  return arm === "right" ? "6 3" : undefined;
}

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
  const activeToggles = (Object.entries(toggles) as [BPToggleKey, boolean][]).filter(
    ([, v]) => v
  );
  if (activeToggles.length === 0) return { points: [], activeKeys: [] };

  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const activeKeys: { key: string; color: string; dash?: string; label: string }[] = [];

  for (const [toggleKey] of activeToggles) {
    const [arm, position, metric] = toggleKey.split("-") as ["left" | "right", "sitting" | "standing", "systolic" | "diastolic" | "heartRate"];
    const dataKey = toggleKey;
    const armLabel = arm === "left" ? "L" : "R";
    const posLabel = position === "sitting" ? "Sit" : "Stand";
    const metricLabel = metric === "systolic" ? "Sys" : metric === "diastolic" ? "Dia" : "HR";
    activeKeys.push({
      key: dataKey,
      color: getBPLineColor(metric, position),
      dash: getBPLineDash(arm),
      label: `${armLabel} ${posLabel} ${metricLabel}`,
    });
  }

  const points: BPPoint[] = sorted.map((r) => {
    const p: BPPoint = {
      time: r.timestamp,
      timeLabel: formatTimeLabel(r.timestamp, scope),
    };
    for (const [toggleKey] of activeToggles) {
      const [arm, position, metric] = toggleKey.split("-") as ["left" | "right", "sitting" | "standing", "systolic" | "diastolic" | "heartRate"];
      if (r.arm === arm && r.position === position) {
        if (metric === "heartRate") {
          p[toggleKey] = r.heartRate ?? null;
        } else {
          p[toggleKey] = r[metric];
        }
      } else {
        p[toggleKey] = null;
      }
    }
    return p;
  });

  return { points, activeKeys };
}

function BPFilterPanel({
  toggles,
  onToggle,
}: {
  toggles: Record<BPToggleKey, boolean>;
  onToggle: (key: BPToggleKey) => void;
}) {
  const arms: ("left" | "right")[] = ["left", "right"];
  const positions: ("standing" | "sitting")[] = ["standing", "sitting"];
  const metrics: ("systolic" | "diastolic" | "heartRate")[] = [
    "systolic",
    "diastolic",
    "heartRate",
  ];

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
                        active
                          ? "text-white border-transparent"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
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

function BPChart({ data }: { data: GraphData }) {
  const [toggles, setToggles] = useState<Record<BPToggleKey, boolean>>({ ...BP_DEFAULTS });

  // Hydrate from localStorage after mount to avoid SSR hydration mismatch
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

  // Compute Y-axis domain: minimum 40-120, expanding if data exceeds bounds
  const yDomain = useMemo<[number, number]>(() => {
    const allValues = points.flatMap((p) =>
      activeKeys.map((k) => p[k.key]).filter((v): v is number => typeof v === "number")
    );
    if (allValues.length === 0) return [40, 120];
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    return [Math.min(40, dataMin - 5), Math.max(120, dataMax + 5)];
  }, [points, activeKeys]);

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
              dataKey="timeLabel"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={yDomain}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {activeKeys.map(({ key, color, dash, label }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
                dot={{ r: 3, fill: color }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <BPFilterPanel toggles={toggles} onToggle={handleToggle} />
    </div>
  );
}

// ============================================================================
// Metrics Section
// ============================================================================

function MetricsSection({ data }: { data: GraphData }) {
  const { metrics } = data;
  const hasAny =
    metrics.avgWeight != null ||
    metrics.avgBPSitting != null ||
    metrics.avgBPStanding != null ||
    metrics.avgHeartRate != null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground hover:text-foreground group"
        >
          <span>Metrics</span>
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {!hasAny ? (
          <p className="text-sm text-muted-foreground py-2">
            No metrics in this range.
          </p>
        ) : (
          <ul className="space-y-2 py-2 text-sm">
            {metrics.avgWeight != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. weight</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {metrics.avgWeight.toFixed(1)} kg
                </span>
              </li>
            )}
            {metrics.avgBPSitting != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. BP (sitting)</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {metrics.avgBPSitting.systolic.toFixed(0)}/
                  {metrics.avgBPSitting.diastolic.toFixed(0)} mmHg
                </span>
              </li>
            )}
            {metrics.avgBPStanding != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. BP (standing)</span>
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {metrics.avgBPStanding.systolic.toFixed(0)}/
                  {metrics.avgBPStanding.diastolic.toFixed(0)} mmHg
                </span>
              </li>
            )}
            {metrics.avgHeartRate != null && (
              <li className="flex justify-between">
                <span className="text-muted-foreground">Avg. heart rate</span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {metrics.avgHeartRate.toFixed(0)} bpm
                </span>
              </li>
            )}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Main HistoricalGraph component
// ============================================================================

const VIEW_ACTIVE_COLORS: Record<ViewType, string> = {
  intake: "bg-green-600 hover:bg-green-700 text-white",
  weight: "bg-emerald-600 hover:bg-emerald-700 text-white",
  bp: "bg-rose-600 hover:bg-rose-700 text-white",
};

const VIEW_OPTIONS: { value: ViewType; label: string; icon: React.ReactNode }[] = [
  { value: "intake", label: "Intake", icon: <Droplets className="w-3.5 h-3.5" /> },
  { value: "weight", label: "Weight", icon: <Scale className="w-3.5 h-3.5" /> },
  { value: "bp", label: "BP", icon: <Heart className="w-3.5 h-3.5" /> },
];

export function HistoricalGraph() {
  const [view, setView] = useState<ViewType>("intake");
  const [scope, setScope] = useState<GraphScope>("24h");
  const { data, isLoading, error } = useGraphData(scope);
  const settings = useSettings();

  return (
    <Card className="overflow-hidden bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-2 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              <BarChart3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <CardTitle className="text-base">History</CardTitle>
          </div>
          {/* View selector with per-view colors */}
          <div className="flex gap-1">
            {VIEW_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  view === opt.value
                    ? cn(VIEW_ACTIVE_COLORS[opt.value], "shadow-sm")
                    : "text-muted-foreground"
                )}
                onClick={() => setView(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <Tabs value={scope} onValueChange={(v) => setScope(v as GraphScope)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="24h" className="text-xs">24 hours</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">Week</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">Month</TabsTrigger>
          </TabsList>
          <TabsContent value={scope} className="mt-2">
            {isLoading && (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center h-[280px] text-sm text-destructive">
                Failed to load graph data
              </div>
            )}
            {data && !isLoading && view === "intake" && (
              <IntakeChart
                data={data}
                waterLimit={settings.waterLimit}
                saltLimit={settings.saltLimit}
              />
            )}
            {data && !isLoading && view === "weight" && (
              <WeightChart data={data} />
            )}
            {data && !isLoading && view === "bp" && (
              <BPChart data={data} />
            )}
          </TabsContent>
        </Tabs>
        {data && <MetricsSection data={data} />}
      </CardContent>
    </Card>
  );
}
