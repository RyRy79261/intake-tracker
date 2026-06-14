"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@intake/ui/card";
import { Button } from "@intake/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Input } from "@intake/ui/input";
import { BarChart3, ArrowRightLeft } from "lucide-react";
import {
  useSaltVsWeight,
  useSugarVsWeight,
  usePotassiumVsWeight,
  useCaffeineVsBP,
  useAlcoholVsBP,
  useCorrelation,
  useFluidBalance,
} from "@/hooks/use-analytics-queries";
import type { TimeRange, Domain, CorrelationResult, AnalyticsResult } from "@intake/types/analytics";
import { useOptionalTrackerEnabled } from "@/lib/optional-trackers";
import { CorrelationChart } from "@/components/analytics/correlation-chart";
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

// Medication is intentionally excluded — medication-domain analytics are a
// separate refactor (it has no single numeric series today). Optional-
// tracker entries (sugar, potassium) are filtered out at render time when
// the tracker is disabled in settings.
interface DomainOption {
  value: Domain;
  label: string;
  /** Optional-tracker key gating the visibility of this option. */
  optional?: "sugar" | "potassium";
}
const DOMAIN_OPTIONS: DomainOption[] = [
  { value: "water", label: "Water Intake" },
  { value: "salt", label: "Salt Intake" },
  { value: "sugar", label: "Sugar Intake", optional: "sugar" },
  { value: "potassium", label: "Potassium Intake", optional: "potassium" },
  { value: "weight", label: "Weight" },
  { value: "bp", label: "Blood Pressure" },
  { value: "eating", label: "Eating" },
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "caffeine", label: "Caffeine" },
  { value: "alcohol", label: "Alcohol" },
];

const DOMAIN_UNITS: Record<Domain, string> = {
  water: " ml",
  salt: " mg",
  sugar: " g",
  potassium: " mg",
  weight: " kg",
  bp: " mmHg",
  eating: "",
  urination: " ml",
  defecation: "",
  caffeine: " mg",
  alcohol: " drinks",
  medication: "",
};

// ---------------------------------------------------------------------------
// Interpretation helper
// ---------------------------------------------------------------------------

function interpretCorrelation(result: CorrelationResult): string {
  const { coefficient, strength, pairedDays } = result;
  if (pairedDays < 3) {
    return "Not enough overlapping days in this period to assess a relationship.";
  }
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

// Fluid balance target: ml of intake above estimated output per day.
const FLUID_TARGET_ML = 500;

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
            <ReferenceLine
              y={FLUID_TARGET_ML}
              stroke="hsl(160 84% 39%)"
              strokeDasharray="4 4"
              label={{
                value: `Target +${FLUID_TARGET_ML}ml`,
                position: "insideTopRight",
                fontSize: 9,
                fill: "hsl(160 84% 39%)",
              }}
            />
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
          <span>Avg: {Math.round(data.value.avgBalance)} ml/day</span>
          <span>
            {data.value.daysAboveTarget}/{data.value.daysTotal} days on target
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Balance = water intake − estimated urination output. Output is
          estimated from logged amount categories.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Custom comparison
// ---------------------------------------------------------------------------

function CustomComparison({ range }: { range: TimeRange }) {
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const visibleOptions = DOMAIN_OPTIONS.filter(
    (o) =>
      !o.optional ||
      (o.optional === "sugar" && sugarEnabled) ||
      (o.optional === "potassium" && potassiumEnabled),
  );
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
              {visibleOptions.map((opt) => (
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
              {visibleOptions.map((opt) => (
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
              unitA={DOMAIN_UNITS[domainA]}
              unitB={DOMAIN_UNITS[domainB]}
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
  const sugarEnabled = useOptionalTrackerEnabled("sugar");
  const potassiumEnabled = useOptionalTrackerEnabled("potassium");
  const saltVsWeight = useSaltVsWeight(range);
  const sugarVsWeight = useSugarVsWeight(range);
  const potassiumVsWeight = usePotassiumVsWeight(range);
  const caffeineVsBP = useCaffeineVsBP(range);
  const alcoholVsBP = useAlcoholVsBP(range);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Pre-configured Correlations</h3>
      </div>

      <CorrelationCard
        title="Weight vs Salt Intake"
        result={saltVsWeight}
        labelA="Salt"
        labelB="Weight"
        unitA=" mg"
        unitB=" kg"
      />

      {sugarEnabled && (
        <CorrelationCard
          title="Weight vs Sugar Intake"
          result={sugarVsWeight}
          labelA="Sugar"
          labelB="Weight"
          unitA=" g"
          unitB=" kg"
        />
      )}

      {potassiumEnabled && (
        <CorrelationCard
          title="Weight vs Potassium Intake"
          result={potassiumVsWeight}
          labelA="Potassium"
          labelB="Weight"
          unitA=" mg"
          unitB=" kg"
        />
      )}

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
