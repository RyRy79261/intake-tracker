"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceDot,
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
import { ChevronDown, Loader2, BarChart3 } from "lucide-react";
import { useGraphData, type GraphScope, type GraphData } from "@/hooks/use-graph-data";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

type ChartPoint = {
  time: number;
  timeLabel: string;
  waterCumulative: number;
  saltCumulative: number;
  weight: number | null;
  systolic: number | null;
  diastolic: number | null;
};

function buildChartData(data: GraphData): {
  points: ChartPoint[];
  eatingTimestamps: number[];
  urinationTimestamps: number[];
} {
  const { startTime, endTime, scope, waterRecords, saltRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords } = data;

  const bucketMs =
    scope === "24h"
      ? MS_PER_HOUR
      : MS_PER_DAY;
  const points: ChartPoint[] = [];
  let runningWater = 0;
  let runningSalt = 0;
  let t = startTime;
  while (t <= endTime) {
    const bucketEnd = t + bucketMs;
    const waterInBucket = waterRecords
      .filter((r) => r.timestamp >= t && r.timestamp < bucketEnd)
      .reduce((s, r) => s + r.amount, 0);
    const saltInBucket = saltRecords
      .filter((r) => r.timestamp >= t && r.timestamp < bucketEnd)
      .reduce((s, r) => s + r.amount, 0);
    runningWater += waterInBucket;
    runningSalt += saltInBucket;
    const weightsInBucket = weightRecords.filter(
      (r) => r.timestamp >= t && r.timestamp < bucketEnd
    );
    const bpInBucket = bloodPressureRecords.filter(
      (r) => r.timestamp >= t && r.timestamp < bucketEnd
    );
    const weight =
      weightsInBucket.length > 0
        ? weightsInBucket[weightsInBucket.length - 1].weight
        : null;
    const lastBP = bpInBucket[bpInBucket.length - 1];
    const systolic = lastBP ? lastBP.systolic : null;
    const diastolic = lastBP ? lastBP.diastolic : null;

    const date = new Date(t);
    const timeLabel =
      scope === "24h"
        ? date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        : date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

    points.push({
      time: t,
      timeLabel,
      waterCumulative: runningWater,
      saltCumulative: runningSalt,
      weight,
      systolic,
      diastolic,
    });
    t = bucketEnd;
  }

  const eatingTimestamps = eatingRecords.map((r) => r.timestamp);
  const urinationTimestamps = urinationRecords.map((r) => r.timestamp);

  return { points, eatingTimestamps, urinationTimestamps };
}

const COLORS = {
  water: "hsl(199 89% 48%)",
  salt: "hsl(38 92% 50%)",
  weight: "hsl(160 84% 39%)",
  systolic: "hsl(346 77% 50%)",
  diastolic: "hsl(346 77% 60%)",
  eating: "hsl(25 95% 53%)",
  urination: "hsl(263 70% 50%)",
} as const;

function ChartInner({ data }: { data: GraphData }) {
  const { points, eatingTimestamps, urinationTimestamps } = useMemo(
    () => buildChartData(data),
    [data]
  );

  const maxWater = Math.max(1, ...points.map((p) => p.waterCumulative));
  const maxSalt = Math.max(1, ...points.map((p) => p.saltCumulative));
  const maxLeft = Math.max(maxWater, maxSalt / 10);

  const weightValues = points.map((p) => p.weight).filter((w): w is number => w != null);
  const bpValues = points.flatMap((p) =>
    [p.systolic, p.diastolic].filter((v): v is number => v != null)
  );
  const minWeight = weightValues.length ? Math.min(...weightValues) : 0;
  const maxWeight = weightValues.length ? Math.max(...weightValues) : 100;
  const weightRange = Math.max(1, maxWeight - minWeight);
  const minBP = bpValues.length ? Math.min(...bpValues) : 0;
  const maxBP = bpValues.length ? Math.max(...bpValues) : 120;
  const bpRange = Math.max(1, maxBP - minBP);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart
        data={points}
        margin={{ top: 10, right: 50, left: 10, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="timeLabel"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="left"
          orientation="left"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))}
          domain={[0, maxLeft]}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={[Math.max(0, minBP - 10), maxBP + 10]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelFormatter={(_, payload) =>
            payload[0]?.payload?.timeLabel ?? ""
          }
          formatter={(value: number, name: string) => {
            if (name === "Water (ml)") return [value, "Water (ml)"];
            if (name === "Salt (mg)") return [value, "Salt (mg)"];
            if (name === "Weight (kg)") return [value, "Weight (kg)"];
            if (name === "Systolic") return [value, "Systolic"];
            if (name === "Diastolic") return [value, "Diastolic"];
            return [value, name];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => value}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="waterCumulative"
          name="Water (ml)"
          stroke={COLORS.water}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="saltCumulative"
          name="Salt (mg)"
          stroke={COLORS.salt}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        {weightValues.length > 0 && (
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="weight"
            name="Weight (kg)"
            stroke={COLORS.weight}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        )}
        {bpValues.length > 0 && (
          <>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="systolic"
              name="Systolic"
              stroke={COLORS.systolic}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="diastolic"
              name="Diastolic"
              stroke={COLORS.diastolic}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          </>
        )}
        {eatingTimestamps.map((ts) => {
          const bucketMs = data.scope === "24h" ? MS_PER_HOUR : MS_PER_DAY;
          const point = points.find(
            (p) => ts >= p.time && ts < p.time + bucketMs
          ) ?? points[points.length - 1];
          if (!point) return null;
          return (
            <ReferenceDot
              key={`eat-${ts}`}
              x={point.timeLabel}
              y={0}
              yAxisId="left"
              r={4}
              fill={COLORS.eating}
              stroke="none"
            />
          );
        })}
        {urinationTimestamps.map((ts) => {
          const bucketMs = data.scope === "24h" ? MS_PER_HOUR : MS_PER_DAY;
          const point = points.find(
            (p) => ts >= p.time && ts < p.time + bucketMs
          ) ?? points[points.length - 1];
          if (!point) return null;
          return (
            <ReferenceDot
              key={`urine-${ts}`}
              x={point.timeLabel}
              y={maxLeft * 0.1}
              yAxisId="left"
              r={4}
              fill={COLORS.urination}
              stroke="none"
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function MetricsSection({ data }: { data: GraphData }) {
  const { metrics } = data;
  const hasAny =
    metrics.avgWeight != null ||
    metrics.avgBPSitting != null ||
    metrics.avgBPStanding != null;

  if (!hasAny) {
    return (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-muted-foreground group"
          >
            <span>Metrics</span>
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-sm text-muted-foreground py-2">
            No metrics in this range. Log weight and blood pressure to see averages.
          </p>
        </CollapsibleContent>
      </Collapsible>
    );
  }

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
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function HistoricalGraph() {
  const [scope, setScope] = useState<GraphScope>("24h");
  const { data, isLoading, error } = useGraphData(scope);

  return (
    <Card className="overflow-hidden bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
            <BarChart3 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </div>
          <CardTitle className="text-lg">History</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as GraphScope)}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="24h">24 hours</TabsTrigger>
            <TabsTrigger value="7d">Week</TabsTrigger>
            <TabsTrigger value="30d">Month</TabsTrigger>
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
            {data && !isLoading && (
              <ChartInner data={data} />
            )}
          </TabsContent>
        </Tabs>
        {data && <MetricsSection data={data} />}
      </CardContent>
    </Card>
  );
}
