"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Droplets,
  Heart,
  Scale,
  Candy,
  Banana,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBPTrend,
  useWeightTrend,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import { useRecordsTabData } from "@/hooks/use-records-tab-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { NutrientAnalysisCard } from "@/components/analytics/nutrient-analysis-card";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import type { TimeRange, TrendDirection } from "@/lib/analytics-types";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

const CHART_MARGIN = { top: 5, right: 5, left: -20, bottom: 0 };
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FLUID_TARGET_ML = 500;

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function TrendArrow({ direction }: { direction: TrendDirection["direction"] }) {
  if (direction === "rising") {
    return <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />;
  }
  if (direction === "falling") {
    return <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />;
  }
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: TrendDirection["direction"];
}) {
  return (
    <div className="rounded-lg border p-3 bg-white/80 dark:bg-slate-900/50">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-lg font-semibold font-mono">{value}</span>
        {trend && <TrendArrow direction={trend} />}
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export function SummaryTab({ range }: { range: TimeRange }) {
  const bp = useBPTrend(range);
  const weight = useWeightTrend(range);
  const fluid = useFluidBalance(range);
  const { data: records } = useRecordsTabData(range);
  const waterGoal = useSettingsStore((s) => s.waterLimit);
  const saltLimit = useSettingsStore((s) => s.saltLimit);
  const sugarLimit = useSettingsStore((s) => s.sugarLimit);
  const potassiumLimit = useSettingsStore((s) => s.potassiumLimit);
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");

  // Aggregate the unified record list into intake totals and event counts.
  const totals = useMemo(() => {
    let waterMl = 0;
    let saltMg = 0;
    let sugarG = 0;
    let potassiumMg = 0;
    let meals = 0;
    let urination = 0;
    let defecation = 0;
    let caffeineMg = 0;
    let alcoholDrinks = 0;
    const activeDays = new Set<string>();

    for (const r of records) {
      activeDays.add(new Date(r.record.timestamp).toDateString());
      if (r.type === "intake" && r.record.type === "water") waterMl += r.record.amount;
      else if (r.type === "intake" && r.record.type === "salt") saltMg += r.record.amount;
      else if (r.type === "intake" && r.record.type === "sugar") sugarG += r.record.amount;
      else if (r.type === "intake" && r.record.type === "potassium") potassiumMg += r.record.amount;
      else if (r.type === "eating") meals += 1;
      else if (r.type === "urination") urination += 1;
      else if (r.type === "defecation") defecation += 1;
      else if (r.type === "caffeine") caffeineMg += r.record.amountMg ?? 0;
      else if (r.type === "alcohol") alcoholDrinks += r.record.amountStandardDrinks ?? 0;
    }

    return {
      waterMl,
      saltMg,
      sugarG,
      potassiumMg,
      meals,
      urination,
      defecation,
      caffeineMg,
      alcoholDrinks,
      activeDays: activeDays.size,
    };
  }, [records]);

  // Per-day divisor: span of the range, or active days for the "all" preset.
  const rangeDays =
    range.start > 0
      ? Math.max(1, Math.round((range.end - range.start) / MS_PER_DAY))
      : Math.max(1, totals.activeDays);

  const bpReadings = bp.value.readings;
  const weightReadings = weight.value.readings;
  const hasAnyData =
    records.length > 0 || bpReadings.length > 0 || weightReadings.length > 0;

  // Rule-based observations — factual statements, never medical advice.
  const observations = useMemo(() => {
    const out: string[] = [];

    if (bpReadings.length >= 2) {
      const t = bp.value.trend.systolic;
      if (t.direction === "rising") {
        out.push("Systolic blood pressure is trending upward over this period.");
      } else if (t.direction === "falling") {
        out.push("Systolic blood pressure is trending downward over this period.");
      }
    }

    if (weightReadings.length >= 2) {
      const change =
        weightReadings[weightReadings.length - 1]!.value - weightReadings[0]!.value;
      if (Math.abs(change) >= 0.1) {
        out.push(
          `Weight ${change > 0 ? "increased" : "decreased"} by ${Math.abs(change).toFixed(1)} kg across the period.`,
        );
      }
    }

    if (fluid.value.daysTotal > 0) {
      const below = fluid.value.daysTotal - fluid.value.daysAboveTarget;
      if (below > 0) {
        out.push(
          `Fluid intake was below the +${FLUID_TARGET_ML} ml target on ${below} of ${fluid.value.daysTotal} day${fluid.value.daysTotal !== 1 ? "s" : ""}.`,
        );
      }
    }

    const avgWater = totals.waterMl / rangeDays;
    if (totals.waterMl > 0 && avgWater < waterGoal) {
      out.push(
        `Average daily water (${Math.round(avgWater)} ml) is below your ${waterGoal} ml goal.`,
      );
    }

    const avgSalt = totals.saltMg / rangeDays;
    if (totals.saltMg > 0 && avgSalt > saltLimit) {
      out.push(
        `Average daily sodium (${Math.round(avgSalt)} mg) is above your ${saltLimit} mg limit.`,
      );
    }

    if (sugarEnabled) {
      const avgSugar = totals.sugarG / rangeDays;
      if (totals.sugarG > 0 && avgSugar > sugarLimit) {
        out.push(
          `Average daily sugar (${Math.round(avgSugar)} g) is above your ${sugarLimit} g limit.`,
        );
      }
    }

    if (potassiumEnabled) {
      // Potassium is a soft target — no over-limit warning, just a "below
      // target" observation since the deficit case is what usually matters.
      const avgPotassium = totals.potassiumMg / rangeDays;
      if (totals.potassiumMg > 0 && potassiumLimit > 0 && avgPotassium < potassiumLimit) {
        out.push(
          `Average daily potassium (${Math.round(avgPotassium)} mg) is below your ${potassiumLimit} mg target — note potassium estimates are rough.`,
        );
      }
    }

    return out;
  }, [bp, bpReadings, weightReadings, fluid, totals, rangeDays, waterGoal, saltLimit, sugarLimit, potassiumLimit, sugarEnabled, potassiumEnabled]);

  if (!hasAnyData) {
    // The nutrient card uses a fixed 30-day window pinned at its mount,
    // independent of the parent `range` selector — so it can still have
    // food entries to analyse even when the selected range is empty.
    return (
      <div className="space-y-4">
        <div className="py-12 text-center text-muted-foreground">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No data for this period</p>
          <p className="text-sm mt-1 max-w-xs mx-auto">
            Log entries or widen the time range to see your summary.
          </p>
        </div>
        <NutrientAnalysisCard />
      </div>
    );
  }

  // BP / weight chart series
  const bpChart = bpReadings.map((r) => ({
    time: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    systolic: r.systolic,
    diastolic: r.diastolic,
  }));
  const weightChart = weightReadings.map((r) => ({
    time: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    weight: r.value,
  }));
  const fluidChart = fluid.value.daily.map((d) => ({
    date: d.date.slice(5),
    balance: Math.round(d.balance),
  }));

  const weightChange =
    weightReadings.length >= 2
      ? weightReadings[weightReadings.length - 1]!.value - weightReadings[0]!.value
      : 0;

  return (
    <div className="space-y-4">
      <AiInsightsCard />
      <NutrientAnalysisCard />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Avg Blood Pressure"
          value={
            bpReadings.length > 0
              ? `${Math.round(bp.value.avg.systolic)}/${Math.round(bp.value.avg.diastolic)}`
              : "—"
          }
          sub={
            bpReadings.length > 0
              ? `${bpReadings.length} reading${bpReadings.length !== 1 ? "s" : ""}`
              : "No readings"
          }
          {...(bpReadings.length >= 2 && {
            trend: bp.value.trend.systolic.direction,
          })}
        />
        <KpiCard
          icon={<Scale className="w-3.5 h-3.5" />}
          label="Avg Weight"
          value={weightReadings.length > 0 ? `${weight.value.avg.toFixed(1)} kg` : "—"}
          sub={
            weightReadings.length >= 2
              ? `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg over period`
              : weightReadings.length === 1
                ? "1 reading"
                : "No readings"
          }
          {...(weightReadings.length >= 2 && {
            trend: weight.value.trend.direction,
          })}
        />
        <KpiCard
          icon={<Droplets className="w-3.5 h-3.5" />}
          label="Fluid Balance"
          value={`${Math.round(fluid.value.avgBalance)} ml`}
          sub={
            fluid.value.daysTotal > 0
              ? `${fluid.value.daysAboveTarget}/${fluid.value.daysTotal} days on target`
              : "avg / day"
          }
        />
        <KpiCard
          icon={<Droplets className="w-3.5 h-3.5" />}
          label="Water Intake"
          value={`${Math.round(totals.waterMl / rangeDays)} ml`}
          sub={`${(totals.waterMl / 1000).toFixed(1)} L total · avg/day`}
        />
        <KpiCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Sodium Intake"
          value={`${Math.round(totals.saltMg / rangeDays)} mg`}
          sub={`${totals.saltMg} mg total · avg/day`}
        />
        {sugarEnabled && (
          <KpiCard
            icon={<Candy className="w-3.5 h-3.5" />}
            label="Sugar Intake"
            value={`${Math.round(totals.sugarG / rangeDays)} g`}
            sub={`${totals.sugarG} g total · avg/day`}
          />
        )}
        {potassiumEnabled && (
          <KpiCard
            icon={<Banana className="w-3.5 h-3.5" />}
            label="Potassium Intake"
            value={`${Math.round(totals.potassiumMg / rangeDays)} mg`}
            sub={`${totals.potassiumMg} mg total · avg/day`}
          />
        )}
        <KpiCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Activity"
          value={`${totals.meals} meals`}
          sub={`${totals.urination} urination · ${totals.defecation} defecation`}
        />
        {totals.caffeineMg > 0 && (
          <KpiCard
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Caffeine"
            value={`${Math.round(totals.caffeineMg)} mg`}
            sub={`${Math.round(totals.caffeineMg / rangeDays)} mg avg/day`}
          />
        )}
        {totals.alcoholDrinks > 0 && (
          <KpiCard
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Alcohol"
            value={`${totals.alcoholDrinks.toFixed(1)} drinks`}
            sub={`${(totals.alcoholDrinks / rangeDays).toFixed(1)} avg/day`}
          />
        )}
      </div>

      {/* Observations */}
      {observations.length > 0 && (
        <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
          <CardHeader className="pt-3 pb-1 px-3">
            <CardTitle className="text-sm font-medium">Observations</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ul className="space-y-1.5">
              {observations.map((o, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/60">•</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {bpChart.length > 0 && (
        <ChartSection title="Blood Pressure">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bpChart} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line dataKey="systolic" stroke="hsl(346 77% 50%)" strokeWidth={2} dot={false} />
              <Line dataKey="diastolic" stroke="hsl(330 65% 55%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {weightChart.length > 0 && (
        <ChartSection title="Weight">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightChart} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
              />
              <Line dataKey="weight" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {fluidChart.length > 0 && (
        <ChartSection title="Daily Fluid Balance">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fluidChart} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [`${v} ml`, "Balance"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <ReferenceLine
                y={FLUID_TARGET_ML}
                stroke="hsl(160 84% 39%)"
                strokeDasharray="4 4"
              />
              <Bar dataKey="balance" fill="hsl(199 89% 48%)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
      )}
    </div>
  );
}
