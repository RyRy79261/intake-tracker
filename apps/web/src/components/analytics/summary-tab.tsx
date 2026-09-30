"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
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
import {
  useBPTrend,
  useWeightTrend,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import { useRecordsTabData } from "@/hooks/use-records-tab-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { NutrientAnalysisCard } from "@/components/analytics/nutrient-analysis-card";
import {
  AXIS_PROPS,
  CHART_COLOR,
  GRID_PROPS,
  TOOLTIP_PROPS,
  roundDomain,
  squareDot,
} from "@/components/analytics/chart-theme";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { getDeviceTimezone } from "@/lib/timezone";
import { averagePerLoggedDay } from "@intake/core/logical-day";
import type { DataPoint, TimeRange, TrendDirection } from "@intake/types/analytics";

const CHART_MARGIN = { top: 8, right: 16, left: -14, bottom: 0 };
const FLUID_TARGET_ML = 500;
const WEIGHT_DOT = squareDot(6);

const int = (v: number) => Math.round(v).toLocaleString("en-US");

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function TrendArrow({ direction }: { direction: TrendDirection["direction"] }) {
  const Icon =
    direction === "rising" ? TrendingUp : direction === "falling" ? TrendingDown : Minus;
  return (
    <span className="wm-tr" title={direction} aria-label={`trend ${direction}`} role="img">
      <Icon />
    </span>
  );
}

/** A KPI tile: domain stripe, label with icon, mono value in the domain colour. */
function KpiCard({
  color,
  icon,
  label,
  value,
  unit,
  sub,
  trend,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  trend?: TrendDirection["direction"];
}) {
  return (
    <div
      className="wm-kpi"
      style={{ "--c": color } as CSSProperties}
      data-testid="kpi"
    >
      <div className="wm-kl">
        {icon}
        <span>{label}</span>
      </div>
      <div className="wm-kv" data-testid="kpi-value">
        <span>
          {value}
          {unit && <small> {unit}</small>}
        </span>
        {trend && <TrendArrow direction={trend} />}
      </div>
      {sub && <p className="wm-kd">{sub}</p>}
    </div>
  );
}

function ChartSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <section className="wm-card" style={{ "--c": color } as CSSProperties}>
      <h3 className="wm-ct">{title}</h3>
      <div className="wm-chart">{children}</div>
    </section>
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

  const dayStartHour = useSettingsStore((s) => s.dayStartHour);

  // Aggregate the unified record list into intake totals and event counts.
  // Daily averages divide each domain's total by the logical days on which
  // that domain was logged, leaving out the unfinished current day, so
  // unlogged days and a half-logged today don't drag the average down.
  const totals = useMemo(() => {
    const series = {
      water: [] as DataPoint[],
      salt: [] as DataPoint[],
      sugar: [] as DataPoint[],
      potassium: [] as DataPoint[],
      caffeine: [] as DataPoint[],
      alcohol: [] as DataPoint[],
    };
    let meals = 0;
    let urination = 0;
    let defecation = 0;

    for (const r of records) {
      const timestamp = r.record.timestamp;
      if (r.type === "intake") series[r.record.type].push({ timestamp, value: r.record.amount });
      else if (r.type === "eating") meals += 1;
      else if (r.type === "urination") urination += 1;
      else if (r.type === "defecation") defecation += 1;
      else if (r.type === "caffeine") series.caffeine.push({ timestamp, value: r.record.amountMg ?? 0 });
      else if (r.type === "alcohol") {
        series.alcohol.push({ timestamp, value: r.record.amountStandardDrinks ?? 0 });
      }
    }

    const opts = { now: Date.now(), dayStartHour, tz: getDeviceTimezone() };
    const sum = (pts: DataPoint[]) => pts.reduce((s, p) => s + p.value, 0);
    const avg = (pts: DataPoint[]) => averagePerLoggedDay(pts, opts).average;

    return {
      waterMl: sum(series.water),
      saltMg: sum(series.salt),
      sugarG: sum(series.sugar),
      potassiumMg: sum(series.potassium),
      meals,
      urination,
      defecation,
      caffeineMg: sum(series.caffeine),
      alcoholDrinks: sum(series.alcohol),
      avg: {
        waterMl: avg(series.water),
        saltMg: avg(series.salt),
        sugarG: avg(series.sugar),
        potassiumMg: avg(series.potassium),
        caffeineMg: avg(series.caffeine),
        alcoholDrinks: avg(series.alcohol),
      },
    };
  }, [records, dayStartHour]);

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

    const avgWater = totals.avg.waterMl;
    if (totals.waterMl > 0 && avgWater < waterGoal) {
      out.push(
        `Average daily water (${Math.round(avgWater)} ml) is below your ${waterGoal} ml goal.`,
      );
    }

    const avgSalt = totals.avg.saltMg;
    if (totals.saltMg > 0 && avgSalt > saltLimit) {
      out.push(
        `Average daily sodium (${Math.round(avgSalt)} mg) is above your ${saltLimit} mg limit.`,
      );
    }

    if (sugarEnabled) {
      const avgSugar = totals.avg.sugarG;
      if (totals.sugarG > 0 && avgSugar > sugarLimit) {
        out.push(
          `Average daily sugar (${Math.round(avgSugar)} g) is above your ${sugarLimit} g limit.`,
        );
      }
    }

    if (potassiumEnabled) {
      // Potassium is a soft target — no over-limit warning, just a "below
      // target" observation since the deficit case is what usually matters.
      const avgPotassium = totals.avg.potassiumMg;
      if (totals.potassiumMg > 0 && potassiumLimit > 0 && avgPotassium < potassiumLimit) {
        out.push(
          `Average daily potassium (${Math.round(avgPotassium)} mg) is below your ${potassiumLimit} mg target — note potassium estimates are rough.`,
        );
      }
    }

    return out;
  }, [bp, bpReadings, weightReadings, fluid, totals, waterGoal, saltLimit, sugarLimit, potassiumLimit, sugarEnabled, potassiumEnabled]);

  if (!hasAnyData) {
    // The AI and nutrient cards use fixed 30-day windows, independent of
    // the parent `range` selector — so they can still have data to analyse
    // (and saved reports to show) even when the selected range is empty.
    return (
      <>
        <div className="wm-empty">
          <BarChart3 aria-hidden="true" />
          <p className="t">No data for this period</p>
          <p className="wm-p">Log entries or widen the time range to see your summary.</p>
        </div>
        <AiInsightsCard />
        <NutrientAnalysisCard />
      </>
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

  const c = (v: string) => `hsl(var(--${v}))`;

  return (
    <>
      <AiInsightsCard />
      <NutrientAnalysisCard />

      {/* KPI grid */}
      <div className="wm-kpis">
        <KpiCard
          color={c("bp")}
          icon={<Heart />}
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
          color={c("weight")}
          icon={<Scale />}
          label="Avg Weight"
          value={weightReadings.length > 0 ? weight.value.avg.toFixed(1) : "—"}
          {...(weightReadings.length > 0 && { unit: "kg" })}
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
          color={c("water")}
          icon={<Droplets />}
          label="Fluid Balance"
          value={int(fluid.value.avgBalance)}
          unit="ml"
          sub={
            fluid.value.daysTotal > 0
              ? `${fluid.value.daysAboveTarget}/${fluid.value.daysTotal} days on target`
              : "avg / day"
          }
        />
        <KpiCard
          color={c("water")}
          icon={<Droplets />}
          label="Water Intake"
          value={int(totals.avg.waterMl)}
          unit="ml"
          sub={`${(totals.waterMl / 1000).toFixed(1)} L total · avg/day`}
        />
        <KpiCard
          color={c("sodium")}
          icon={<Activity />}
          label="Sodium Intake"
          value={int(totals.avg.saltMg)}
          unit="mg"
          sub={`${int(totals.saltMg)} mg total · avg/day`}
        />
        {sugarEnabled && (
          <KpiCard
            color={c("sugar")}
            icon={<Candy />}
            label="Sugar Intake"
            value={int(totals.avg.sugarG)}
            unit="g"
            sub={`${int(totals.sugarG)} g total · avg/day`}
          />
        )}
        {potassiumEnabled && (
          <KpiCard
            color={c("fg")}
            icon={<Banana />}
            label="Potassium Intake"
            value={int(totals.avg.potassiumMg)}
            unit="mg"
            sub={`${int(totals.potassiumMg)} mg total · avg/day`}
          />
        )}
        <KpiCard
          color={c("bath")}
          icon={<Activity />}
          label="Activity"
          value={String(totals.meals)}
          unit="meals"
          sub={`${totals.urination} urination · ${totals.defecation} defecation`}
        />
        {totals.caffeineMg > 0 && (
          <KpiCard
            color={c("caffeine")}
            icon={<Activity />}
            label="Caffeine"
            value={int(totals.caffeineMg)}
            unit="mg"
            sub={`${int(totals.avg.caffeineMg)} mg avg/day`}
          />
        )}
        {totals.alcoholDrinks > 0 && (
          <KpiCard
            color={c("alcohol")}
            icon={<Activity />}
            label="Alcohol"
            value={totals.alcoholDrinks.toFixed(1)}
            unit="drinks"
            sub={`${totals.avg.alcoholDrinks.toFixed(1)} avg/day`}
          />
        )}
      </div>

      {/* Observations */}
      {observations.length > 0 && (
        <section className="wm-card" style={{ "--c": "hsl(var(--fg))" } as CSSProperties}>
          <h3 className="wm-ct">Observations</h3>
          <ul className="wm-obs">
            {observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Charts */}
      {bpChart.length > 0 && (
        <ChartSection title="Blood Pressure" color={CHART_COLOR.bp}>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bpChart} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="time" {...AXIS_PROPS} padding={{ left: 12, right: 12 }} />
              <YAxis {...AXIS_PROPS} axisLine={false} domain={roundDomain(5, 10)} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Line
                dataKey="systolic"
                name="Systolic"
                stroke={CHART_COLOR.bp}
                strokeWidth={2}
                dot={false}
                activeDot={squareDot(8)}
                isAnimationActive={false}
              />
              <Line
                dataKey="diastolic"
                name="Diastolic"
                stroke={CHART_COLOR.diastolic}
                strokeWidth={2}
                dot={false}
                activeDot={squareDot(8)}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {weightChart.length > 0 && (
        <ChartSection title="Weight" color={CHART_COLOR.weight}>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightChart} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="time" {...AXIS_PROPS} padding={{ left: 12, right: 12 }} />
              <YAxis {...AXIS_PROPS} axisLine={false} domain={roundDomain(0.5, 1)} />
              <Tooltip
                {...TOOLTIP_PROPS}
                formatter={(v) => [`${Number(v).toFixed(1)} kg`, "Weight"]}
              />
              <Line
                dataKey="weight"
                stroke={CHART_COLOR.weight}
                strokeWidth={2}
                dot={WEIGHT_DOT}
                activeDot={squareDot(8)}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      {fluidChart.length > 0 && (
        <ChartSection title="Daily Fluid Balance" color={CHART_COLOR.water}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fluidChart} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} axisLine={false} />
              <Tooltip
                {...TOOLTIP_PROPS}
                formatter={(v) => [`${Number(v)} ml`, "Balance"]}
              />
              <ReferenceLine y={0} stroke={CHART_COLOR.line} />
              <ReferenceLine
                y={FLUID_TARGET_ML}
                stroke={CHART_COLOR.weight}
                strokeDasharray="4 4"
              />
              <Bar
                dataKey="balance"
                fill={CHART_COLOR.water}
                radius={0}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
      )}
    </>
  );
}
