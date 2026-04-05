"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart3, ArrowRightLeft } from "lucide-react";
import {
  useSaltVsWeight,
  useCaffeineVsBP,
  useAlcoholVsBP,
  useCorrelation,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import type { TimeRange, Domain, CorrelationResult, AnalyticsResult } from "@/lib/analytics-types";
import { CorrelationChart } from "./correlation-chart";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Domain options for custom comparison
// ---------------------------------------------------------------------------

const DOMAIN_OPTIONS: { value: Domain; label: string }[] = [
  { value: "water", label: "Water Intake" },
  { value: "salt", label: "Salt Intake" },
  { value: "weight", label: "Weight" },
  { value: "bp", label: "Blood Pressure" },
  { value: "eating", label: "Eating" },
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "caffeine", label: "Caffeine" },
  { value: "alcohol", label: "Alcohol" },
  { value: "medication", label: "Medication" },
];

// ---------------------------------------------------------------------------
// Interpretation helper
// ---------------------------------------------------------------------------

function interpretCorrelation(result: CorrelationResult): string {
  const { coefficient, strength } = result;
  if (strength === "none") return "No meaningful relationship detected in this period.";
  const direction = coefficient > 0 ? "increase together" : "move in opposite directions";
  const qualifier =
    strength === "strong" ? "clearly" : strength === "moderate" ? "tend to" : "slightly";
  return `These measures ${qualifier} ${direction} (r=${coefficient.toFixed(2)}).`;
}

// ---------------------------------------------------------------------------
// Correlation card
// ---------------------------------------------------------------------------

function CorrelationCard({
  title,
  result,
  labelA,
  labelB,
  unitA,
  unitB,
}: {
  title: string;
  result: AnalyticsResult<CorrelationResult>;
  labelA: string;
  labelB: string;
  unitA: string;
  unitB: string;
}) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <CorrelationChart
          result={result.value}
          labelA={labelA}
          labelB={labelB}
          unitA={unitA}
          unitB={unitB}
        />
        <p className="text-xs text-muted-foreground mt-2">
          {interpretCorrelation(result.value)}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fluid balance card
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

function FluidBalanceCard({ range }: { range: TimeRange }) {
  const data = useFluidBalance(range);

  if (!data || data.value.daily.length === 0) {
    return (
      <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
        <CardHeader className="pt-3 pb-1 px-3">
          <CardTitle className="text-sm font-medium">Fluid Balance</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No fluid data for this period
          </div>
        </CardContent>
      </Card>
    );
  }

  const barData = data.value.daily.map((d) => ({
    date: d.date,
    balance: d.balance,
    target: d.target,
  }));

  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <CardTitle className="text-sm font-medium">Fluid Balance</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}ml`}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar
              dataKey="balance"
              name="Balance"
              fill="hsl(199 89% 48%)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 px-1">
          <span>
            Avg: {Math.round(data.value.avgBalance)} ml/day
          </span>
          <span>
            {data.value.daysAboveTarget}/{data.value.daysTotal} days on target
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom comparison
// ---------------------------------------------------------------------------

function CustomComparison({ range }: { range: TimeRange }) {
  const [domainA, setDomainA] = useState<Domain>("salt");
  const [domainB, setDomainB] = useState<Domain>("weight");
  const [lagDays, setLagDays] = useState(0);
  const [active, setActive] = useState(false);

  // Only run the query when user clicks Compare
  const correlationData = useCorrelation(
    active ? domainA : "water",
    active ? domainB : "water",
    active ? range : { start: 0, end: 0 },
    active ? lagDays : undefined,
  );

  const domainLabel = (d: Domain) =>
    DOMAIN_OPTIONS.find((o) => o.value === d)?.label ?? d;

  return (
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Custom Comparison</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={domainA} onValueChange={(v) => { setDomainA(v as Domain); setActive(false); }}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOMAIN_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">vs</span>
          <Select value={domainB} onValueChange={(v) => { setDomainB(v as Domain); setActive(false); }}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOMAIN_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Lag (days):
          </label>
          <Input
            type="number"
            min={0}
            max={14}
            value={lagDays}
            onChange={(e) => { setLagDays(Number(e.target.value)); setActive(false); }}
            className="w-20 h-8 text-xs"
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => setActive(true)}
          >
            Compare
          </Button>
        </div>

        {active && correlationData && (
          <div className="mt-2">
            <CorrelationChart
              result={correlationData.value}
              labelA={domainLabel(domainA)}
              labelB={domainLabel(domainB)}
              unitA=""
              unitB=""
            />
            <p className="text-xs text-muted-foreground mt-2">
              {interpretCorrelation(correlationData.value)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

export function CorrelationsTab({ range }: { range: TimeRange }) {
  const saltVsWeight = useSaltVsWeight(range);
  const caffeineVsBP = useCaffeineVsBP(range);
  const alcoholVsBP = useAlcoholVsBP(range);
  const bpVsMeds = useCorrelation("bp", "medication", range);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Pre-configured Correlations</h3>
      </div>

      {/* Pre-configured correlation cards */}
      <CorrelationCard
        title="Blood Pressure vs Medication Adherence"
        result={bpVsMeds}
        labelA="Systolic BP"
        labelB="Adherence"
        unitA=" mmHg"
        unitB="%"
      />

      <CorrelationCard
        title="Weight vs Salt Intake"
        result={saltVsWeight}
        labelA="Salt"
        labelB="Weight"
        unitA=" mg"
        unitB=" kg"
      />

      <CorrelationCard
        title="Caffeine vs Blood Pressure"
        result={caffeineVsBP}
        labelA="Caffeine"
        labelB="Systolic BP"
        unitA=" mg"
        unitB=" mmHg"
      />

      <CorrelationCard
        title="Alcohol vs Blood Pressure"
        result={alcoholVsBP}
        labelA="Alcohol"
        labelB="Systolic BP"
        unitA=" units"
        unitB=" mmHg"
      />

      {/* Fluid balance overview */}
      <FluidBalanceCard range={range} />

      {/* Custom comparison section */}
      <div className="flex items-center gap-2 px-1 pt-2">
        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Custom Comparison</h3>
      </div>

      <CustomComparison range={range} />
    </div>
  );
}
