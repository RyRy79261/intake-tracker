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
} from "recharts";
import { Lightbulb } from "lucide-react";
import { InsightBanner } from "@/components/analytics/insight-banner";
import {
  useInsights,
  useAdherenceRate,
  useBPTrend,
  useWeightTrend,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import { useSettingsStore } from "@/stores/settings-store";
import type { TimeRange, Insight, InsightType } from "@/lib/analytics-types";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

const CHART_MARGIN = { top: 5, right: 5, left: -20, bottom: 0 };

const SEVERITY_ORDER: Record<string, number> = {
  alert: 0,
  warning: 1,
  info: 2,
};

interface InsightsTabProps {
  range: TimeRange;
}

export function InsightsTab({ range }: InsightsTabProps) {
  const insights = useInsights(range);
  const dismissInsight = useSettingsStore((s) => s.dismissInsight);
  const isDismissed = useSettingsStore((s) => s.isDismissed);

  const activeInsights = useMemo(() => {
    return insights
      .filter((i) => !isDismissed(i.id, i.value))
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 2) -
          (SEVERITY_ORDER[b.severity] ?? 2)
      );
  }, [insights, isDismissed]);

  // Collect insight types that have active entries for drill-down
  const activeTypes = useMemo(() => {
    const types = new Set<InsightType>();
    activeInsights.forEach((i) => types.add(i.type));
    return types;
  }, [activeInsights]);

  function handleDismiss(id: string) {
    const insight = insights.find((i) => i.id === id);
    if (insight) {
      dismissInsight(id, insight.value);
    }
  }

  if (insights.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Lightbulb className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">No insights for this period</p>
        <p className="text-sm mt-1 max-w-xs mx-auto">
          Custom insights will appear here when configured.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="text-sm text-muted-foreground">
        {activeInsights.length > 0 ? (
          <span className="font-medium">
            {activeInsights.length} active insight{activeInsights.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span>All insights dismissed for this period</span>
        )}
      </div>

      {/* Insight banners */}
      <div className="space-y-3">
        {activeInsights.map((insight) => (
          <InsightBanner
            key={insight.id}
            insight={insight}
            onDismiss={handleDismiss}
          />
        ))}
      </div>

      {/* Drill-down charts */}
      {activeTypes.size > 0 && (
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
          {activeTypes.has("adherence_drop") && (
            <AdherenceDrillDown range={range} />
          )}
          {activeTypes.has("bp_trend") && (
            <BPTrendDrillDown range={range} />
          )}
          {(activeTypes.has("weight_trend") || activeTypes.has("anomaly")) && (
            <WeightTrendDrillDown range={range} />
          )}
          {activeTypes.has("fluid_deficit") && (
            <FluidDeficitDrillDown range={range} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drill-down mini charts
// ---------------------------------------------------------------------------

function AdherenceDrillDown({ range }: { range: TimeRange }) {
  const data = useAdherenceRate(range);
  const chartData = data.value.daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    rate: Math.round(d.rate * 100),
  }));

  return (
    <DrillDownSection title="Medication Adherence">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v}%`, "Adherence"]}
          />
          <Bar dataKey="rate" fill="hsl(199 89% 48%)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </DrillDownSection>
  );
}

function BPTrendDrillDown({ range }: { range: TimeRange }) {
  const data = useBPTrend(range);
  const chartData = data.value.readings.map((r) => ({
    time: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    systolic: r.systolic,
    diastolic: r.diastolic,
  }));

  return (
    <DrillDownSection title="Blood Pressure Trend">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line
            dataKey="systolic"
            stroke="hsl(346 77% 50%)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            dataKey="diastolic"
            stroke="hsl(330 65% 55%)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </DrillDownSection>
  );
}

function WeightTrendDrillDown({ range }: { range: TimeRange }) {
  const data = useWeightTrend(range);
  const chartData = data.value.readings.map((r) => ({
    time: new Date(r.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    weight: r.value,
  }));

  return (
    <DrillDownSection title="Weight Trend">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v.toFixed(1)} kg`, "Weight"]}
          />
          <Line
            dataKey="weight"
            stroke="hsl(160 84% 39%)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </DrillDownSection>
  );
}

function FluidDeficitDrillDown({ range }: { range: TimeRange }) {
  const data = useFluidBalance(range);
  const chartData = data.value.daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    balance: Math.round(d.balance),
    target: d.target,
  }));

  return (
    <DrillDownSection title="Daily Fluid Balance">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v} ml`, "Balance"]}
          />
          <Bar
            dataKey="balance"
            fill="hsl(199 89% 48%)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </DrillDownSection>
  );
}

function DrillDownSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-xs font-medium text-muted-foreground mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}
